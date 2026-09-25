// Name filter tests (src/core/names.js) and its SQL mirror (public.sas_name_ok / sas_clean_name).
//   node --test tests/online/names.test.mjs
//   SAS_PG="host=... port=... dbname=... user=postgres" node --test tests/online/names.test.mjs   (+ JS == SQL)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as N from '../../src/core/names.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations/0001_steal_a_seed.sql'), 'utf8');

// real names that must pass untouched
export const GOOD = [
  'Killian', 'Ana Lopez', 'Grape', 'Peacock', 'Essex', 'Nazir', 'Cassandra', 'Dickens', 'Hancock', 'Scunthorpe', 'Sussex',
  'Analise', 'José', 'Zoë', '李明', 'Мария',
  'Cassidy', 'Cassie', 'Jasper', 'Shital', 'Cummings', 'Sexton', 'Assad', 'Fukuda', 'Pornsak', 'Faggin', 'Fagan', 'Hitomi',
  'Titus', 'Dickinson', 'Matsushita', 'Yoshito', 'Toshitaka', 'Bass', 'Glass', 'Analy', 'Cocker', 'Kumar', 'Hellen', 'Sasha',
  'Maddie 2', 'Zippy Melon', "O'Neil", 'Anne-Marie', 'Mr. Smith', 'J R R Tolkien', 'Shi Tao', 'Li Na', 'Van Dyke',
  'Łukasz', 'Søren', 'Björk', 'Nguyễn Văn An', 'Ζωή', 'Александр', '佐々木', 'さくら', 'प्रिया', 'محمد', 'דוד', 'สมชาย',
  '김민준', 'Ngozi', 'Siobhán', 'Dorian', 'Esther', 'Maddie', 'Micah', 'Player', 'Captain Kale',
];

// must be refused (sanitizeName -> fallback), including spaced, dotted, leet, accented and look-alike spellings
export const BAD = [
  'fuck', 'Fuk', 'FUCK YOU', 'f u c k', 'f.u.c.k', 'F-U-C-K', 'f_u_c_k', 'fück', 'fuсk' /* Cyrillic с */, 'ƒuck', 'phuck', 'fcuk',
  'fvck', 'motherfucker', 'fuckface', 'sh1t', 'shithead', 'bullshit', 's h i t', '$hit', 'b1tch', 'bitchy', 'a55', 'a$$', '@ss',
  'Big Ass', 'dumbass', 'assh0le', 'n1gger', 'nigga', 'faggot', 'Fag', 'cunt', 'cunts', 'Scunt', 'k i l l', 'ki ll',
  'kill', 'Killer', 'KILLING', 'kys', 'Nazi', 'Nazis', 'Hitler', 'kkk', 'sex', 'Sexy', 'porn', 'p0rn0', 'cum', 'c u m',
  'dick', 'D1ck', 'dickhead', 'cock', 'rape', 'Rap3', 'rapist', 'boobies', 'tits', 'penis', 'Pussy', 'twat', 'wanker',
  'slut', 'whore', 'bastards', 'anal', 'a n a l', 'retard', 'fu*k', 'c*o*c*k', 'Κill', 'dildo', 'jizz', 'suicide',
];

// anything else worth comparing between JS and SQL
const EXTRA = ['', ' ', '   Zippy    Melon  ', 'abcdefghijklmnopq', 'Zoe\u0301', 'a\u0301\u0301\u0301\u0301', '\u0301abc', 'a<b>', '😀 Smiley',
  'Bob\u200bby', 'x\u3164y', 'ℕina', 'Ｍａｘ', 'I ♥ U', 'Tom & Jerry', 'Kill Bill', 'Sex Pistols', 'grape juice', 'a.s.s', 'Cl4ss', 'N4z1',
  'ﬁnn', 'Å', 'ⅎoo', 'x\ufe0fy'];

test('real names pass untouched', () => {
  for (const n of GOOD) {
    assert.equal(N.isNameAllowed(n), true, `isNameAllowed(${n})`);
    assert.equal(N.sanitizeName(n, 'X'), n.normalize('NFKC'), `sanitizeName(${n})`);
  }
});

test('bad names are refused', () => {
  for (const n of BAD) assert.equal(N.sanitizeName(n, 'FALLBACK'), 'FALLBACK', `sanitizeName(${JSON.stringify(n)}) = ${JSON.stringify(N.sanitizeName(n, 'FALLBACK'))}`);
});

test('sanitizeName tidies what it keeps', () => {
  assert.equal(N.sanitizeName('   Zippy    Melon  '), 'Zippy Melon');
  assert.equal(N.sanitizeName('😀 Smiley 🌱'), 'Smiley');
  assert.equal(N.sanitizeName('abcdefghijklmnopq'), 'abcdefghijklmn', '14 characters');
  assert.equal([...N.sanitizeName('李明李明李明李明李明李明李明李明')].length, 14);
  // NFKC first makes a + accent one letter; at most two loose accents may follow a letter (no "zalgo")
  assert.equal(N.sanitizeName('a\u0301\u0301\u0301\u0301b'), '\u00e1\u0301\u0301b');
  assert.equal(N.sanitizeName('Bob\u200bby\u3164'), 'Bobby', 'invisible characters go');
  assert.equal(N.sanitizeName('Ｍａｘ'), 'Max', 'full-width folds');
  assert.equal(N.sanitizeName('a$$'), '', 'symbols cannot hide a word');
  assert.equal(N.sanitizeName('', 'Player'), 'Player');
  assert.deepEqual(N.nameWords('Zoë Fück-3r'), ['zoe', 'fuck', 'er']);
});

// ------------------------------------------------------------------ JS <-> SQL

function sqlArray(name) {
  const m = SQL.match(new RegExp(`${name} constant text\\[\\] := array\\[([\\s\\S]*?)\\];`));
  assert.ok(m, `SQL has ${name}`);
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

test('the SQL filter uses exactly the same lists and maps as names.js', () => {
  assert.deepEqual(sqlArray('c_strong'), N.NAME_STRONG);
  assert.deepEqual(sqlArray('c_strong_end'), N.NAME_STRONG_END);
  assert.deepEqual(sqlArray('c_mild'), N.NAME_MILD);
  assert.deepEqual(sqlArray('c_mild_end'), N.NAME_MILD_END);
  assert.deepEqual(sqlArray('c_allow'), N.NAME_ALLOW);
  assert.ok(SQL.includes(`translate(v_s, '${N.NAME_HOMO_FROM}', '${N.NAME_HOMO_TO}')`), 'look-alike map');
  assert.ok(SQL.includes(`translate(v_s, '${N.NAME_LEET_FROM}', '${N.NAME_LEET_TO}')`), 'leet map');
  assert.equal([...N.NAME_HOMO_FROM].length, N.NAME_HOMO_TO.length);
});

test('SQL agrees with JS on every name (needs SAS_PG)', { skip: !process.env.SAS_PG && 'set SAS_PG to run against Postgres' }, () => {
  const all = [...GOOD, ...BAD, ...EXTRA];
  const r = spawnSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', process.env.SAS_PG, '-v', 'names=' + JSON.stringify(all)], {
    input: `select json_agg(json_build_array(public.sas_name_ok(x.v), public.sas_clean_name(x.v, null)) order by x.n)
            from jsonb_array_elements_text(:'names'::jsonb) with ordinality as x(v, n);`,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  const rows = JSON.parse(r.stdout.trim());
  all.forEach((n, i) => {
    const [ok, clean] = rows[i];
    // the word filter is identical
    assert.equal(ok, N.isNameAllowed(n), `sas_name_ok(${JSON.stringify(n)})`);
    // the server accepts exactly what the client would keep, and anything the client keeps
    const kept = N.sanitizeName(n, '');
    const folded = n.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (kept === folded && kept) assert.equal(clean, kept, `sas_clean_name(${JSON.stringify(n)})`);
    else assert.equal(clean, null, `sas_clean_name(${JSON.stringify(n)}) should refuse (client keeps ${JSON.stringify(kept)})`);
  });
  // every name the client produces is accepted by the server
  const r2 = spawnSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', process.env.SAS_PG, '-v', 'names=' + JSON.stringify(all.map((n) => N.sanitizeName(n, 'Player')))], {
    input: `select json_agg(public.sas_clean_name(x.v, null) order by x.n) from jsonb_array_elements_text(:'names'::jsonb) with ordinality as x(v, n);`,
    encoding: 'utf8',
  });
  const back = JSON.parse(r2.stdout.trim());
  all.forEach((n, i) => assert.equal(back[i], N.sanitizeName(n, 'Player'), `server keeps client name for ${JSON.stringify(n)}`));
});
