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
* Chat: quick-chat phrases + emotes everywhere; **typed chat** in solo games and private rooms (filtered, see
  "Typed chat" below). Public rooms stay on quick chat unless a parent allows typing there (Settings > Chat).
  Player names go through `sanitizeName`.
* **Public rooms are people only**: Quick Play and listed public rooms never get computer players.
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
  pets: { owned: [{ uid, id, t, name? }], equipped: null, team: [] },   // name: the nickname (pets/names.js); team = up to 3 equipped uids (equipped = team[0])
  baseStyle: { floor, fence, laser, decor: [id|null x6] },    // Base Studio picks (what shows depends on the base level)
  badges: { [badgeId]: epochMs },
  quests: { day: 'YYYY-MM-DD', list: [{ id, target, progress, claimed }] },
  counters: { [key]: number },   // lifetime totals (steals, bonks, planted, sold, gifts, trades, hatches, onlineGames, ...)
  best: { netWorth: 0, showdownWins: 0, showdownBest: 0 },
  tutorial: { state, step },   // 'new' | 'offered' | 'declined' | 'active' | 'done'; step = 0-7 while active (ui/tutorialFlow.js)
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
players), `name`, `look` (full Look), `pets` (equipped team: up to 3 species ids; only the first
`petSlotsFor(baseLevel)` count, see `game.activePets(p)`), `petNames` (their nicknames, same order, `''` = none),
`pet` (the first active one), `baseLevel`, `baseStyle`,
`boostLevel`/`boostUntil`/`boostReadyAt`, `treadmillTier`, `pumpUntil`/`pumpMult`/`trainT` (warm-up), `kind`
(`'local'|'remote'|'bot'|'empty'`), `pid` (network id, remote/local online players), `emote` (`{id, until}` or null).
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
* `game.buyEgg(p, eggId)` -> rolls a pet (game rng), charges cash, emits `pet:hatched {player, egg, pet}` (never for
  drop-only eggs). Egg drops: `game.drops` `[{uid, egg, x, z, spawnAt, landAt, expiresAt, biome}]` (height =
  `game.dropY(d)`); touching a landed one emits `drop:claimed {player, drop, pet}` + `pet:hatched {..., free: true}`;
  also `drop:spawn`, `drop:expired`. Bots keep their best 3 drop pets.
* `game.setPets(p, [petId...], [nickname...])` (names optional, cleaned with the name filter; `setPet(p, id)` = a team of one),
  `game.setLook(p, look)` (emits `player:look {player}`). `profileTeamPets(profile)` -> `[{id, name}]` for a profile's team.
* Bases: `game.upgradeBase(p)` (in your own garden) -> `base:upgraded {player, level, cost, garden}`;
  `game.setBaseStyle(p, style)` -> `base:style {player, garden}`; each garden's `g.look` is what it shows
  (`effectiveBaseStyle`). Guard Gnome: `guard:bonk {garden, target}`; trampolines: `base:bounce {player, garden, spot}`.
* Speed: `game.buySpeed(p, n|'max')` -> `speed:up {player, level, cost, count}`; `game.buyBoost(p)` -> `boost:up`;
  `game.buyTreadmill(p)` -> `treadmill:up`; intent `boost` -> `boost:start {player, until}`; warm-up -> `pump:start`.
* Emotes: intent `emote: id` -> `p.emote = {id, until}` + `emote {player, id}`. Moving cancels it.
* Quick chat: intent `say: phraseId` -> `chat {player, text, quick: true, phrase}` (rate limited 1/1.2 s).
* Typed chat: `app.act('chat', text)` -> `chat {player, text, typed: true}` (see "Typed chat").
* `game.giftPlant(from, to, planterIndex)` -> `gift {from, to, plant}` (needs a free unlocked planter on `to`).
* `game.trade(a, b, offerA, offerB)` with `offer = {planters: [index...], cash, pets: [{uid, id, name, k?}], seed, petRoom}`
  -> `trade:done {a, b, offerA, offerB, plantsA, plantsB, seedA, seedB, petsA, petsB, tid}` (X = what X gave).
  Validation is atomic (both sides still own what they offer, room for incoming plants and seeds, pet-bag room).
  `seed` (true or `seedSig(carrying)`) = the seed in their hands: planted straight into a free planter of the other
  garden (new uid, full grow time). Pets: a bot's team changes right away (`k` = index in `p.pets`; nicknames move
  with the pet); a person gets **pet mail** (see Social > Trading).
* `game.petMailAck(p, tid)`: `p`'s device applied that mail; the host forgets it.

## Actions gateway (`app.act`, integrator)
Anything the UI changes in the game goes through `app.act(name, ...args)` so it also works as a
client in an online room (the host applies it for the right player):
`buyItem(id, qty)`, `buySpeed(n)`, `buyBoost()`, `buyTreadmill()`, `upgradeBase()`, `setBaseStyle(style)`, `rebirth()`,
`buyEgg(eggId)`, `setPet(petId)`, `setPets(ids, names)`, `setLook(look)`,
`gift(toSlot, planterIndex)`, `tradeRequest(toSlot)`, `tradeOffer(offer)`, `tradeAsk(ask)`, `tradeReady(bool, petRoom)`,
`tradeCancel()`, `petMailAck(tid)`, `emote(id)`, `say(phraseId)`, `chat(text)`, `petTrick(ownerSlot, k)` (click a pet: `game.petTrick(by, ownerSlot, k)`
emits `pet:trick {player, owner, k, trick, pet}`; a client starts it at once, sends the trick it picked as a third
argument and skips the host's echo; the host checks slot, pet, cooldown and trick id, with its own rate limit).
Returns `true/false` offline, `undefined` (async) online (`petTrick`: true/false, it plays locally).

## Multiplayer (`src/net/**`, net agent)
Host-authoritative rooms with **client-authoritative movement**:
* The room host's browser runs the real `Game`. Up to 4 humans per room (4 gardens). Gardens nobody plays get a
  bot, up to the room's **Computer players** setting (`game.maxBots`, 0-3: None / 1 / 2 / All; chosen in Play Online,
  changeable by the host from the room panel, synced in the full state so it survives a host change). **Private
  rooms only**: a public room (`room.private` false: Quick Play, the room list) is people only. `createRoom` starts
  it with maxBots 0, `HostRole.fillSlots` forces `game.maxBots = 0` there (also after a host change), and
  `setBots` / `setMaxBots` refuse; the picker shows only for the host of a private room. The rest are
  `'empty'` slots: parked out at sea, hidden, off the board and out of the rules (`Player.present`); a joiner takes
  their own character's garden or an empty one before a bot's (`HostRole.fillSlots`).
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
  jump/bonk/boost/item/emote/say, interact held `i` + press counter `ip`, Sell held `s` + press counter `sp`, action
  queue), `snap` (host, 15 Hz: fast motion of players,
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
* Colours travel as any `#rrggbb` (sanitizeLook), so palette additions (white `#f2f1ec` and silver `#cfd3dc` hair)
  need no protocol change; older clients draw them too.
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
* `openPets(app)` (inventory, equip, rename, hatch sequence UI) and the egg shop panel (`buildPetShop(app, close)`).
* Nicknames (`src/pets/names.js`): `checkPetName(raw)`, `sanitizePetName`, `petLabel(owned)` (nickname or species
  name), `randomPetName()`. Up to 14 characters, the player-name word filter (`core/names.js`), since they are
  shown to everyone online: in `who` cards (`pets` + `petNames`), in the player state and as name tags over pets.
  Named on the hatch card (`playHatch(..., {onName})`) or in My Pets (`setPetName(profileId, uid, name)`).
  A full bag sends home an unnamed spare first.
* Trades: `attachPetMail(app)` applies pet mail (`player.petMail`) to the profile once per mail (`profile.pets.mailDone`),
  `petBag(app)` -> `{pid, owned, team, room}`, `releasePet(pid, uid)` (refused for pets on offer: `socialUi.tradePets`).

## Progress: quests, badges, stars (`src/progress/**` + `src/ui/progress.js`, progress agent)
* `attachProgress(app)`: listens to bus events for the LOCAL player (`player === app.human`), updates
  `profile.counters`, quest progress and badges; emits `quest:progress`, `quest:done`, `badge:earned`.
* 3 daily quests (seeded by date + profile id), claim for cash (applied via `app.act`) + ⭐ stars.
* ~30 badges (first steal, 100 steals, rainbow plant, secret plant, rebirths, Showdown win, Chaos win,
  online game, gift, trade, legendary pet, ...), each gives ⭐.
* `openProgress(app, {tab})` (Quests | Badges | Almanac tabs); `mountQuestChip(app, hudRoot)` small HUD tracker; badge toast.
* Plant log (Seed Almanac + collections): `profile.almanac = {v: 1, s: {[speciesId]: bits}}` (1 normal, 2 gold,
  4 diamond, 8 rainbow, 16 big, 32 giant, 64 titan), stamped for the local player on `seed:grabbed`,
  `plant:planted`, `steal:success` (thief), `gift` / `trade:done` (plants received), `plant:giant` and the garden
  scan in `tick()`. Client-side only: the mirror game replays the host's events and carries the garden, so it works
  solo, as host and as a client with no protocol change. Emits `almanac:sticker`, `collection:progress`,
  `collection:complete`; `badge:earned` also carries `{cash, banked}`. Tracker API: `almanac()`, `collections()`,
  `stamp(speciesId, mutation, size)`. Catalog: `ALMANAC_PAGES` (from BIOMES/PLANTS), `COLLECTIONS` (Family Four),
  page badges `alm_<biome>`, `almanac1/2`, `familyfour` (pays cash through the same pay-or-bank path as quests).
* Exclusive cosmetics travel as ids like every look: hats `familycrown` (badge `familyfour`) and `leafhat`
  (`almanac1`); `look.noodle` may be a special noodle id from `NOODLES` (`trowel`, badge `almanac2`) as well as a
  colour. A client on an older build shows no hat / the family noodle colour for them.

## Social: emotes, quick chat, gifting, trading (`src/ui/emotes.js`, `src/ui/trade.js`, social agent)
* `QUICK_CHAT` phrases and `EMOTES` list live in `src/social/catalog.js`.
* `mountEmotes(app, hudRoot)`: emote/chat wheel (G = emotes, T = quick chat, touch button), sends `app.act`.
* Bots react to emotes/quick chat/typed chat (`src/social/botReact.js`: `reactToSocial(game, bot, event)`), called by the integrator.

## Typed chat (`src/social/chat.js`, `src/ui/chat.js`)
* Settings: `chatOn` (default true; off = no typed chat on this device, quick chat stays) and `chatPublic`
  (default false; a parent allows typed chat in public rooms on this device). Settings > Chat.
* Where: `typedChatAllowed(app.online)` = `chatOn` and (solo, or a room this device knows is private, or `chatPublic`).
  "Knows is private" = `room.private && room.faceOk` (made here, or joined by typing a code that isn't in the public
  list: the same rule as Photo Booth faces), so a public room whose host claims "private" still counts as public.
* Filter: `checkChat(raw)` -> `{ok, text, why}`. `text` is the cleaned line (NFKC, odd/invisible characters and
  extra accent marks dropped, spaces tidied, at most `TEXT_CHAT.maxLen` = 80). Refused (never half-censored), with
  a friendly note `CHAT_NOTES[why]`: `words` (the `core/names.js` word filter on the words, and on each word with
  the symbols inside squeezed out, plus a few unkind words), `link`, `email` (also @names), `number` (phone numbers,
  spelled-out digits, runs of more than `TEXT_CHAT.maxDigits` digits). `isTypedLine(text)` = passes and unchanged.
* Path: the chat panel calls `sendTyped(app, raw)` (settings, filter, the sender's rate limit) -> `app.act('chat',
  text)`. Solo: `postTyped(game, player, text)` emits `chat {player, text, typed: true}`. Online, a member's act
  rides the reliable action queue (`in.e` edge `'a'`, `['chat', [text]]`) to the host; the host (and the host's own
  player) goes through `HostRole.act('chat')` -> `postTyped`, which re-runs the filter, drops anything that isn't
  exactly what the filter would send, and rate limits per player (`TEXT_CHAT.burst + hostSlack` back to back,
  then one per `gap`). The event is forwarded like any `chat`.
* Receivers: `EventCodec.vet('chat', e, {typed})` takes `typed: true` lines only from a person (`p.isPlayer`), only
  when `typed` (the client passes `typedChatAllowed(session)`), and only if `isTypedLine(text)`; everything else
  is as strict as before (quick phrases looked up locally, bot lines vetted, any other free text dropped). Muted
  players' chat is dropped (`client._events`). The host's own HUD/panel skip typed lines its settings don't allow
  (it still passes them on: each device decides for itself).
* UI: HUD chat log + speech bubble over the speaker (`TEXT_CHAT.bubble` s, `bb-t`), the chat panel (last
  `TEXT_CHAT.history` lines, quick-chat chips, mute chips for room members), Enter / chat button to open.
* Bots: typed lines are matched to a topic (`TYPED_INTENTS` in `replies.js`, first match wins) and answered from
  `TYPED_REPLIES` / `REPLIES` with the usual cooldowns and spam guard; a bot called by name (`BOT_CALLS`) answers first.
* `mountSocial(app, hudRoot)`: near another player or a family bot a "Gift / Trade" prompt; gift picker; trade
  window (both offer plants, pets, the seed in hand and cash, both Ready, 3 s countdown) using `app.act` +
  `trade:*` events.

### Trading (`src/social/trades.js`, `src/social/botTrade.js`, `src/ui/trade.js`, pet mail in `src/ui/pets.js`)
* Who: people with people (online) and with the family bots (solo, and in private rooms where the host runs them;
  public rooms have no bots). `App.act` routes `trade*` to `app.trades.handle(human, ...)` when there is no room;
  in a room the host does (`HostRole.act` default case). `app.trades.update()` runs on the host / solo only.
* Offer (what a device sends): `tradeOffer({planters: [idx <= 4], uids, cash, pets: [{uid, id, name}] (<= 3), seed,
  petRoom})`. The host keeps only its own planted plants (grown or growing: "Seedling" in the UI), pets with
  `own(PET, id)`, an id-like `uid` (`isId`), no repeats, at most 3, nicknames through `sanitizePetName`, the seed
  only while `seedSig(p.carrying)` still matches, cash clamped. `petRoom` = free spots in the device's pet bag
  (`PET_CAPACITY - owned`; the host can't see bags): Ready is refused unless both gardens have planters for the
  plants + seeds coming in and both bags room for the pets (a bot holds 3 pets). The existing per-member action rate
  limit applies (6/s, burst 16). `trade:update` carries both offers (pets nested, never a nickname at the top level:
  `EventCodec.vet` would drop the event) and `petRoomA/B`.
* With a bot: `tradeAsk({planters, uids, pets: [{uid: botPetUid(k, id)}], petRoom})` sets the bot's side to what you
  ask for. `social/botTrade.js` answers invites (busy bots and usually Micah say no), and once per change weighs
  `value(what it gets) >= want x value(what it gives)` (`BOT_TRADE.want`: Esther 0.8, Dorian 1.0, Mati 1.2, Micah
  1.5; plants = `plantIncome x SELL_SECONDS`, a little less while growing, pets = average hatch cost, cash) ->
  Ready + a line, or "a bit more?". Offered something with nothing asked yet, it proposes one of its own things
  (never the same one again for 30 s). It stands still facing you while trading and says bye after 45 s of nothing.
  A person saying "Trade?" (quick chat, or typed) gets an invite back from the closest willing bot. Lines live in
  `REPLIES.trade*` (`replies.js`), so `isBotLine` passes them online.
* **Pet mail** (pets cross devices through replicated state, not one-shot events): `Game.trade` appends
  `{tid, give: [uid], get: [{id, name}]}` to each person's `player.petMail` (max 8; `tid` unique across pages and
  hosts). It rides in `serializeFull` / the `p<slot>` sections (`vetPlayer` -> `vetPetMail`), so a lost tick, a
  lost `trade:done` or a host change can't lose it. Each device's `attachPetMail(app).update()` (main.js, every
  frame) applies new mail once (`profile.pets.mailDone`, last 60 ids): given uids leave the bag and team, received
  pets arrive with new uids and their nicknames (joining the team if a slot is free; a full bag sends home its
  weakest unnamed spare, never a pet on offer), then `act('petMailAck', tid)` over the reliable action queue
  (re-sent every 2 s while the host still lists it). `profile:changed` then re-sends `setPets`.
* Locks: pets on offer are in `socialUi.tradePets` (My Pets can't release them, a full bag skips them); if one
  leaves the bag anyway, the trade window re-sends the offer without it.
* Known gaps (fine for a family game): a modified client could keep a pet it traded away (bags live on devices), and
  a cloud restore (`replaceProfile`) can bring one back. Pets given to a bot stay with it for that match.

## Giant Harvests, Family Hero, Welcome-Back (round 4)
* Plant sizes are host-rolled (`Game._finishGrowth`) and travel in plant data: `size` is in `serializeSlot`,
  `serializeFull`/`applyFull`, the solo save and the `$pl` event codec; `vetPlantData` keeps only `own(SIZES, size)`
  (anything else is 'normal'), and the garden section's `signature` includes it so a fresh GIANT goes out right away.
  Events: `plant:grown` gains `size` (vetted against SIZES), `plant:giant {player, plant: {speciesId, mutation, size},
  planter, garden}` is forwarded (vet: known species, mutation and size). Old clients would show the wrong income:
  part of the PROTO 4 bump.
* Hero tips are minted only by the host's `Game` (`_rescue` inside `dropCarried`); `addCash` stays refused online.
  `players[i].heroUntil` (the HERO ribbon) is in the full state; `vetPlayer` makes it a finite number (junk = 0).
  `steal:rescued {hero, victim, thief, plant, tip, sneaky}` is forwarded; vet drops it unless hero, victim and thief
  are three different players and tip is a number >= 0. The caps (one tip per hero/thief pair per 90 s, 5 per hero
  per 10 min) stop friends from farming tips (one steals, the other bonks). `stats.rescues` rides with the slot.
* Calling for help is the existing "Help!" quick-chat phrase (`app.act('say', 'help')`): the host's bots answer
  (`ai/family.js callForHelp`, from `social/botReact.js`); bot thank-you and WHOA lines are ordinary bot `chat`
  lines (config `FAMILY_LINES`, merged into `CHAT`, so `isBotLine` knows them).
* Welcome-Back Garden is solo Endless only (online gardens in `profile.online` and Showdown never get away credit):
  no protocol change.

## Shared rules
* No new runtime network except the Supabase project (and only through `src/net/transport.js` and
  `src/online/**`). No external images/fonts.
* Performance budget unchanged (phone 30+ fps): pets are cheap meshes, shared geometry/materials.
* Every feature must work offline/solo except multiplayer and global scores (trading and gifting work solo with the
  family bots).
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
