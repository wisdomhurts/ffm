# Online, profiles and the new fun features

Read `docs/ARCHITECTURE.md` first. This file is the contract for the second wave of features:
profiles + saving, multiplayer rooms, high scores, character customization, pets, emotes + quick chat,
daily quests + badges, gifting + trading. Every module below has ONE owner; ask the integrator for
changes to files you don't own (describe them in your report under `sharedChangesRequested`).

## Product decisions (from the family)
* Open lobby: anyone on the website can see and join **public** rooms. Friends and family can also make a
  **private** room and share its 5-letter code.
* Photo Booth faces are shared **only in private rooms** (opt-in per player). Public rooms always show
  cartoon faces. Real family photos never leave a device otherwise.
* Chat is **quick-chat phrases + emotes only** (no free typing). Player names go through `sanitizeName`.
* Online backend: a Supabase project (Realtime for rooms, Postgres RPCs for cloud saves + high scores).
  The game must still work fully offline; online features show a friendly message when unavailable.

## Profiles (`src/core/profiles.js`, integrator)
A profile is one player identity on this device. The four family members always exist (ids `dorian`,
`esther`, `maddie`, `micah`); friends add their own (`p_<random>`). The active profile is `app.profile`.
```
profile = {
  v: 1, id, base,            // base = family character id used for default look, colours, bot slot
  name,                      // sanitized
  look: Look,                // see Customization
  shareFace: false,          // opt-in: send my Photo Booth face to people in PRIVATE rooms
  stars: 0,                  // ⭐ earned from quests + badges, spent in the Wardrobe
  unlocks: [],               // cosmetic ids owned ('hat:crown', ...); free items need no unlock
  pets: { owned: [{ uid, id }], equipped: null },   // equipped = pet uid or null
  badges: { [badgeId]: epochMs },
  quests: { day: 'YYYY-MM-DD', list: [{ id, target, progress, claimed }] },
  counters: { [key]: number },   // lifetime totals (steals, bonks, planted, sold, gifts, trades, hatches, onlineGames, ...)
  best: { netWorth: 0, showdownWins: 0, showdownBest: 0 },
  online: null | { player: PlayerSave, garden: GardenSave },   // your online garden (travels between rooms)
  cloud: null | { id, code },    // cloud save link (see Online API)
  updatedAt,
}
```
API: `listProfiles()`, `getProfile(id)`, `createProfile({name, base})`, `updateProfile(id, patch|fn)`,
`deleteProfile(id)` (custom only), `activeProfileId()`, `setActiveProfile(id)`, `onProfileChange(fn)`.
Solo Endless saves stay per profile under `save:endless:<profileId>` (whole 4-garden world).

## Player identity in the Game (`src/gameplay/*`, integrator)
`Player` gains: `profileId`, `faceKey` (key for faces/avatars; = profile id, or `r_<pid>` for remote
players), `name`, `look` (full Look), `pet` (equipped pet species id or null), `kind`
(`'local'|'remote'|'bot'`), `pid` (network id, remote/local online players), `emote` (`{id, until}` or null).
`p.char` stays the slot's family character (garden colours, bot personality, chat lines).
UI must use `p.faceKey` (not `p.id`) for avatars and `p.name` for names, `p.char.color` for colour.

Game additions:
* `new Game({..., slots})` where `slots[i] = {kind, profile?}`; default comes from `humanId` as before.
* `game.setSlot(slot, {kind, profile, pid})` switches a slot at runtime (bot <-> remote human) and loads the
  profile's online garden (or a fresh bot garden). Emits `slot:changed {slot, player}`.
* `game.serializeSlot(slot)` -> `{player, garden}`; `game.loadSlot(slot, data)`.
* `game.serializeFull()` / `game.applyFull(state)`: the complete world (players incl. timers, gardens incl.
  growth + stealers + locks, pods, ground, projectiles, monsters, event, match, time) for network sync +
  host migration.
* Hooks (all players, host-authoritative): `game.mods(p)` -> `{income, speed, hold, magnet, bonkCd}` from the
  equipped pet (`petMods(petId)` in `src/pets/effects.js`).
* `game.buyEgg(p, eggId)` -> rolls a pet (game rng), charges cash, emits `pet:hatched {player, egg, pet}`.
* `game.setPet(p, petId|null)`, `game.setLook(p, look)` (emits `player:look {player}`).
* Emotes: intent `emote: id` -> `p.emote = {id, until}` + `emote {player, id}`. Moving cancels it.
* Quick chat: intent `say: phraseId` -> `chat {player, text, quick: true, phrase}` (rate limited 1/1.2 s).
* `game.giftPlant(from, to, planterIndex)` -> `gift {from, to, plant}` (needs a free unlocked planter on `to`).
* `game.trade(a, b, offerA, offerB)` with `offer = {planters: [index...], cash}` -> `trade:done {a, b, offerA, offerB}`.
  Validation is atomic (both sides still own what they offer, room for incoming plants).

## Actions gateway (`app.act`, integrator)
Anything the UI changes in the game goes through `app.act(name, ...args)` so it also works as a
client in an online room (the host applies it for the right player):
`buyItem(id, qty)`, `buySpeed()`, `rebirth()`, `buyEgg(eggId)`, `setPet(petId)`, `setLook(look)`,
`gift(toSlot, planterIndex)`, `tradeRequest(toSlot)`, `tradeOffer(offer)`, `tradeReady(bool)`,
`tradeCancel()`, `emote(id)`, `say(phraseId)`. Returns `true/false` offline, `undefined` (async) online.

## Multiplayer (`src/net/**`, net agent)
Host-authoritative rooms with **client-authoritative movement**:
* The room host's browser runs the real `Game` (bots fill empty slots). Up to 4 humans per room (4 gardens).
* Remote players have `p.remoteMotion = true` on the host: `_movePlayer` skips physics for them (emits their
  jump + social intents only); the net code writes their pos/vel/yaw/onGround from `in` messages.
* Every client keeps a mirror `Game` updated from the host; its OWN player's position/velocity/yaw/onGround
  are simulated locally every frame (instant, no input lag) and sent to the host ~20x/s. The host accepts them
  after a sanity clamp (max distance per message from speed, collider check) and runs all rules (grabs,
  steals, bonks, monsters, items, shops) with them. Knockback/respawn/teleports arrive as a `kick` message
  the client applies to its local player.
* Transport interface (`src/net/transport.js`): `createTransport('supabase'|'local'|'memory')`;
  `t.channel(topic, {presenceKey})` -> `{subscribe(), send(event, payload), on(event, fn), track(state),
  onPresence(fn(members)), leave()}`. `supabase` = Supabase Realtime broadcast + presence; `local` =
  BroadcastChannel (two tabs, tests); `memory` = in-process (Node tests).
* Topics: lobby `sas:lobby` (public rooms `track` `{code, name, host, n, max, v}`), room `sas:room:<CODE>`.
* Messages (room): `hello` (join: pid, profile summary {name, look, base, pet, face?}), `welcome`
  (host -> joiner: slot, full state), `in` (client -> host: pos/vel/yaw/onGround, edge counters for
  jump/bonk/item/emote/say, interact held, action queue), `snap` (host, 15 Hz: fast motion of players,
  monsters, projectiles), `state` (host, 4 Hz: `serializeFull()` or a delta), `ev` (host: encoded bus events
  for FX/UI/audio), `kick` (host -> one client: set pos/vel), `act` (client -> host: actions), `bye`.
* Host election: earliest `joinedAt` in room presence (tie: lowest pid). On host loss the next member
  promotes its mirror (it already has the full state) and keeps the room going.
* Each client saves its own slot (`serializeSlot`) into `profile.online` every 10 s and on leave.
* API for the app: `src/net/session.js` -> `createOnline(app)` returning
  `{available, listRooms(cb) -> stop, quickPlay(), createRoom({private}), joinRoom(code), leave(), room,
  isHost, members, mute(pid), kick(pid)}`; emits `net:*` bus events (`net:status`, `net:joined`,
  `net:left`, `net:members`, `net:host`, `net:error`).
* UI: `src/ui/lobby.js` -> `openLobby(app)` (Quick Play, room list, create public/private, join by code,
  share-my-face toggle for private rooms) and an in-game room panel (members, mute, host kick, code).

## Online API (`src/online/**`, backend agent)
Supabase Postgres, all access through `security definer` RPCs (tables have RLS on and no policies).
`src/online/config.js` holds the project URL + publishable key (public by design).
* Cloud save: `cloudLink(profile)` registers and returns a save code like `SEED-7K4Q-9XPM`;
  `cloudPush(profile)`, `cloudPull(code)`; auto-push every 60 s while online and on quit.
* High scores: boards `networth` (online garden net worth), `showdown` (best Showdown net worth),
  `steals` (lifetime steals), `rebirths`. `submitScore(profile, board, value)` keeps the best per player;
  `topScores(board, {limit, period: 'all'|'week'})` -> `[{name, value, look, base, updatedAt}]`.
* Offline family board: best scores of the profiles on this device (works with no network).
* UI: `src/ui/leaderboard.js` -> `openLeaderboard(app)`; `src/ui/cloudsave.js` -> `openCloudSave(app)`.

## Customization (`src/characters/**` + `src/ui/wardrobe.js`, looks agent)
```
Look = { build: 'adult'|'kid', skin, hair, hairColor, shirt, shirtColor, shirtColor2, pants, shoes,
         hat: null|id, face: 'photo'|'smile'|..., acc: null|id, noodle: '#hex', trail: null|id }
```
* `src/characters/cosmetics.js`: catalog `{hair[], shirts[], hats[], accs[], faces[], trails[], colors}` with
  `price` (⭐ stars, 0 = free) and `unlock` (optional badge id).
* `createAvatar(char, face, skin, look?)` renders any Look; `avatar.setLook(look)` rebuilds in place.
* Emote + dance animations in the avatar: `avatar.update(dt, {..., emote: id|null, emoteT})`
  (`wave`, `cheer`, `laugh`, `point`, `dance1`, `dance2`, `dance3`, `sit`).
* `openWardrobe(app)`: live 3D preview, categories, colour swatches, buy with stars, save to profile.

## Pets (`src/pets/**` + `src/ui/pets.js`, pets agent)
* `src/pets/catalog.js`: `PETS` (id, name, rarity, boost text, mods), `EGGS` (id, price, odds).
* `src/pets/effects.js`: `petMods(petId)` -> `{income, speed, hold, magnet, bonkCd}` multipliers/values.
* `src/pets/view.js`: `createPetView(petId)` -> `{object3d, update(dt, ownerPos, ownerYaw, moving)}` (follows
  its owner, hops, idles); GameView creates it for `p.pet`.
* `src/world/petshop.js`: `createPetShop()` mesh (egg stand in the plaza, spot `LAYOUT.shops.pets`).
* `openPets(app)` (inventory, equip, hatch sequence UI) and the egg shop panel (`buildPetShop(app, close)`).

## Progress: quests, badges, stars (`src/progress/**` + `src/ui/progress.js`, progress agent)
* `attachProgress(app)`: listens to bus events for the LOCAL player (`player === app.human`), updates
  `profile.counters`, quest progress and badges; emits `quest:progress`, `quest:done`, `badge:earned`.
* 3 daily quests (seeded by date + profile id), claim for cash (applied via `app.act`) + ⭐ stars.
* ~30 badges (first steal, 100 steals, rainbow plant, secret plant, rebirths, Showdown win, Chaos win,
  online game, gift, trade, legendary pet, ...), each gives ⭐.
* `openProgress(app)` (Quests | Badges tabs); `mountQuestChip(app, hudRoot)` small HUD tracker; badge toast.

## Social: emotes, quick chat, gifting, trading (`src/ui/emotes.js`, `src/ui/trade.js`, social agent)
* `QUICK_CHAT` phrases and `EMOTES` list live in `src/social/catalog.js`.
* `mountEmotes(app, hudRoot)`: emote/chat wheel (G = emotes, T = quick chat, touch button), sends `app.act`.
* Bots react to emotes/quick chat (`src/social/botReact.js`: `reactToSocial(game, bot, event)`), called by the integrator.
* `mountSocial(app, hudRoot)`: near another human player (online) a "Gift / Trade" prompt; gift picker; trade
  window (both offer planters + cash, both Ready, 3 s countdown, Accept) using `app.act` + `trade:*` events.

## Shared rules
* No new runtime network except the Supabase project (and only through `src/net/transport.js` and
  `src/online/**`). No external images/fonts.
* Performance budget unchanged (phone 30+ fps): pets are cheap meshes, shared geometry/materials.
* Every feature must work offline/solo except multiplayer, trading/gifting and global scores.
* Kid-safe copy everywhere. Never show another player's photo in a public room.

## Shared UI building blocks (integrator)
`app.menus` exposes `openModal(content, {cls, label, onClose, kind}) -> {wrap, close(silent), dispose}`,
`btn(label, cls, onclick, attrs)`, `iconLabel(svg, text)`, `doneRow(onDone)`, `click()` (ui sound),
`closeAllModals()`. Shop stands: `menus.openShop('pets'|'wardrobe')` calls `buildPetShop(app, close)` /
`buildWardrobe(app, close)` which return `{el, title, dispose}` (the game keeps running underneath).
HUD widgets: `createHUD` calls `mountQuestChip`, `mountEmotes`, `mountSocial`, `mountRoomPanel` with
`(app, hudRoot, {tl, tr, top, bottom})` and expects `{update(dt, t), dispose()}`. Each feature module
injects its own CSS once (`<style id="sas-<feature>">`) instead of editing `ui/styles.js`.

## File ownership (second wave)
| owner | files |
|---|---|
| integrator | `src/main.js`, `src/config.js`, `src/gameplay/**`, `src/core/**` (profiles, names, input...), `src/view/**`, `src/world/world.js`, `src/world/props.js`, `build.mjs`, `docs/**`, `tests/smoke.mjs` |
| net | `src/net/**`, `src/ui/lobby.js`, `tests/net/**`, `package.json` (only to add `@supabase/supabase-js`) |
| backend | `src/online/**`, `supabase/**`, `src/ui/leaderboard.js`, `src/ui/cloudsave.js`, `tests/online/**` |
| looks | `src/characters/**`, `src/ui/wardrobe.js`, `src/ui/photobooth.js`, `src/world/boutique.js` |
| pets | `src/pets/**`, `src/ui/pets.js`, `src/world/petshop.js` |
| progress | `src/progress/**`, `src/ui/progress.js` |
| social | `src/social/**`, `src/ui/emotes.js`, `src/ui/trade.js` |
| menus (UI shell) | `src/ui/menus.js`, `src/ui/hud.js`, `src/ui/styles.js`, `src/ui/touch.js`, `src/ui/shops.js`, `src/ui/howto.js`, `src/ui/settingsPanel.js`, `src/ui/notify.js`, `src/ui/alerts.js`, `src/ui/tutorial.js`, `src/ui/goal.js`, `src/ui/avatars.js`, `src/ui/icons.js` |
