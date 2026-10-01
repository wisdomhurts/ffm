// Pet nicknames: the name rules, profiles, the game state and the online protocol (no browser).
// Run: node --test tests/gameplay/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, profileTeam, profileTeamNames, profileTeamPets } from '../../src/gameplay/game.js';
import { bus } from '../../src/core/events.js';
import { checkPetName, sanitizePetName, randomPetName, petLabel, PET_NAME_MAX } from '../../src/pets/names.js';
import { replaceProfile, getProfile } from '../../src/core/profiles.js';
import { sanitizeWho, sanitizePetTeam, vetFull, sectionize, signature } from '../../src/net/protocol.js';

function setup(seed = 5) {
  bus.clear();
  const game = new Game({ humanId: 'dorian', seed });
  return { game, me: game.human };
}

test('names: friendly names pass, blocked words and junk do not, empty means the species name', () => {
  assert.deepEqual(checkPetName('Biscuit'), { ok: true, name: 'Biscuit', text: '' });
  assert.equal(checkPetName('  Sir   Fluff ').name, 'Sir Fluff');
  assert.equal(checkPetName('').ok, true);
  assert.equal(checkPetName('').name, '');
  for (const bad of ['shit', 'Fuuuck', 'k i l l', 'butt$hit']) assert.equal(checkPetName(bad).ok, false, bad);
  // trimmed to 14 characters; symbols dropped
  assert.equal(sanitizePetName('Marshmallow the Great'), 'Marshmallow th');
  assert.equal(sanitizePetName('Mr. Fluffy😀'), 'Mr. Fluffy');
  assert.equal(sanitizePetName(42), '');
  assert.equal(petLabel({ id: 'dragon' }), 'Dragon');
  assert.equal(petLabel({ id: 'dragon', name: 'Biscuit' }), 'Biscuit');
});

test('names: every dice idea is a valid name of at most 14 letters', () => {
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const n = randomPetName('', () => (i % 97) / 97);
    assert.ok(n.length <= PET_NAME_MAX, n);
    assert.equal(sanitizePetName(n), n);
    seen.add(n);
  }
  assert.ok(seen.size > 20);
  assert.notEqual(randomPetName('Biscuit', () => 0), 'Biscuit');
});

test('profiles: nicknames are kept, cleaned or dropped when a profile loads', () => {
  const p = replaceProfile('esther', {
    ...getProfile('esther'),
    pets: {
      owned: [
        { uid: 'a', id: 'dragon', t: 1, name: '  Biscuit ' },
        { uid: 'b', id: 'phoenix', t: 2, name: 'shit head' },
        { uid: 'c', id: 'unicorn', t: 3, name: 12 },
        { uid: 'd', id: 'fox', t: 4 },
      ],
      team: ['a', 'b', 'c'],
    },
  });
  const by = Object.fromEntries(p.pets.owned.map((x) => [x.uid, x]));
  assert.equal(by.a.name, 'Biscuit');
  assert.equal('name' in by.b, false);
  assert.equal('name' in by.c, false);
  assert.equal('name' in by.d, false);
  assert.deepEqual(profileTeam(p), ['dragon', 'phoenix', 'unicorn']);
  assert.deepEqual(profileTeamNames(p), ['Biscuit', '', '']);
  // online summaries: {pets: [ids], petNames: [names]}
  assert.deepEqual(profileTeamPets({ pets: ['fox', 'nope', 'owl'], petNames: ['Foxy', 'x', 'Hoot'] }), [{ id: 'fox', name: 'Foxy' }, { id: 'owl', name: 'Hoot' }]);
});

test('game: the team carries its nicknames, cleaned, in step with the pets', () => {
  const { game, me } = setup();
  game.setPets(me, ['dragon', 'nope', 'phoenix', 'unicorn'], ['Biscuit', 'X', 'fuck', 'Princess Pea']);
  assert.deepEqual(me.pets, ['dragon', 'phoenix', 'unicorn']);
  assert.deepEqual(me.petNames, ['Biscuit', '', 'Princess Pea']);
  game.setPets(me, ['fox']);
  assert.deepEqual(me.petNames, ['']);
  // a profile identity brings its nicknames
  game._setIdentity(me, { kind: 'local', profile: { id: 'dorian', name: 'Dorian', pets: { owned: [{ uid: 'u1', id: 'owl', name: 'Hoot' }], team: ['u1'] } } });
  assert.deepEqual(me.pets, ['owl']);
  assert.deepEqual(me.petNames, ['Hoot']);
});

test('online: who cards, player state and deltas carry clean nicknames', () => {
  const w = sanitizeWho({ name: 'Mati', base: 'maddie', pets: ['dragon', 'zzz', 'owl'], petNames: ['Sparky', 'no', 'sh1t'] }, 'k0123456789abcde', false);
  assert.deepEqual(w.pets, ['dragon', 'owl']);
  assert.deepEqual(w.petNames, ['Sparky', '']);
  assert.deepEqual(sanitizePetTeam(['fox'], 'oops'), { pets: ['fox'], petNames: [''] });

  const { game, me } = setup();
  game.setPets(me, ['dragon', 'owl'], ['Sparky', 'Hoot']);
  const raw = JSON.parse(JSON.stringify(game.serializeFull()));
  raw.players[me.slot].petNames = ['Sparky', '<b>dick</b>'];
  const full = vetFull(raw);
  assert.deepEqual(full.players[me.slot].petNames, ['Sparky', '']);
  // a mirror (client) sees the names
  bus.clear();
  const mirror = new Game({ humanId: null, seed: 9 });
  mirror.applyFull(full, { localSlot: (me.slot + 1) % 4 });
  assert.deepEqual(mirror.players[me.slot].petNames, ['Sparky', '']);
  // renaming changes the player's section signature, so the host sends it right away
  const key = 'p' + me.slot;
  const before = signature(key, sectionize(game.serializeFull())[key]);
  game.setPets(me, ['dragon', 'owl'], ['Sparky', 'Owlbert']);
  assert.notEqual(signature(key, sectionize(game.serializeFull())[key]), before);
});
