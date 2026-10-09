# Steal A Seed! — Family Edition

A Roblox-style 3D browser game starring **Dorian, Esther, Mati and Micah**, based on the
Roblox hit *Steal A Seed!* (itself a riff on *Steal a Brainrot* and *Grow a Garden*).

> Core loop: **steal a seed → run it home → plant it → it pays forever → buy Speed → reach a
> rarer biome → steal your family's best plants (and stop them stealing yours).**

The player picks one family member. The other three are AI rivals with personalities.

---

## 1. World (units are Roblox "studs"; character ≈ 5.2 studs tall)

Top-down, **+Z is north** (towards the road). Y is up.

```
                 z=+960  ┌──────────┐  STARBLOOM (Mythic / Secret)     monsters: Star Lurker
                 z=+810  ├──────────┤  EMBERROOT (Legendary)           Lava Sprout
                 z=+660  ├──────────┤  TANGLEMIRE (Epic)               Swamp Snapper
                 z=+510  ├──────────┤  DUSTBOWL (Rare)                 Cactus Crab
                 z=+360  ├──────────┤  GREENHOLLOW (Uncommon)          Grumpy Stump
                 z=+210  ├──────────┤  SUNNY FIELD (Common) — safe, no monsters
                 z=+60   └──┬────┬──┘  road gate arch  "THE SEED ROAD"
   ┌──────────┐             │    │             ┌──────────┐
   │ GARDEN 2 │ gate→       │ PLAZA            ←gate │ GARDEN 3 │
   └──────────┘             │    │             └──────────┘
   ┌──────────┐             │SPAWN             ┌──────────┐
   │ GARDEN 0 │ gate→       │    │             ←gate │ GARDEN 1 │
   └──────────┘             │    │             └──────────┘
        GEAR SHOP      SPEED SHOP (treadmills)      REBIRTH ALTAR
                 z=-60
```

* **Plaza**: 120×120 studs (x∈[-60,60], z∈[-60,60]), classic Roblox studded baseplate.
  Spawn pad at the centre. Shops along the south edge.
* **Gardens** (one per family member, index = player slot): 60 (x) × 44 (z), fenced,
  entrance gate facing the central aisle (|x| = 30). Centres: slot0 (-60,-24), slot1 (60,-24),
  slot2 (-60,24), slot3 (60,24). Each has 10 planters (2 columns × 5), a COLLECT pad,
  a LOCK pad, a sign with the owner's photo + name, and at the far end three **FOR SALE lots**
  (one column of 5 planters each: $500K, $3M, $15M, bought in order; their planters are built and
  become solid only once bought; rebirth sells them back). The home island is 192 studs wide.
* **The Seed Road**: 40 studs wide, from z=60 to z=1860 — twelve biomes of 150 studs each,
  walled by biome-themed cliffs. Seed pods sit against both walls (never in the centre
  lane). Distance is difficulty: rarer seeds are visibly further away. The road ends in Rainbow's End at a
  pot of gold (a solid prop in the west corner) and an Infinity portal over the END OF THE SEED ROAD sign.

## 2. Characters

| id | Name | Colour | Bot personality | Outfit (from the Cabo sunset photo) |
|---|---|---|---|---|
| dorian | Dorian | `#2f80ed` | **Tycoon**: farms hard, upgrades, occasionally steals big | black & white "face-print" party shirt, dark jeans |
| esther | Esther | `#ff4f9a` | **Guardian**: locks often, chases thieves relentlessly | hot-pink dress |
| maddie | Mati | `#9b5cff` | **Speedster**: buys speed first, goes deep for rare seeds | purple top, floral jacket |
| micah | Micah | `#1ec8a5` | **Sneaky Thief**: steals constantly, banana peels & balloons | mint Hawaiian shirt, khaki shorts |

Avatars are blocky R6-style (legs, torso, arms, big head) with the family member's
**photo face** on the head (feathered oval decal over a matched skin tone) and a hair
accessory. Photos are private (never committed); without them a classic cartoon face is used.
Wardrobe hair colours: natural shades (black to platinum, grey, **silver** and **white**) and fun dyes;
light hair is drawn with cool strands and a softer glow so white reads as white in sun and shade.

## 3. Seeds, plants, rarity

Rarity colours: Common `#b8c0cc`, Uncommon `#4cd964`, Rare `#3d9bff`, Epic `#b36bff`,
Legendary `#ffb627`, Mythic `#ff4d6d`, Celestial `#6ff3ff`, Cosmic `#ff5ce1`, Divine `#ffe75e`,
Prismatic `#3dffb4`, Eternal `#ff7a59`, Infinity `#8a7dff` (its label shimmers with a soft rainbow),
Secret (black with rainbow text).

Biomes in road order: Sunny Field (Common), Greenhollow (Uncommon), Dustbowl (Rare), Tanglemire (Epic),
Emberroot (Legendary), Starbloom (Mythic), Frostfall (Celestial), Candy Canyon (Cosmic), Cloud Kingdom (Divine),
Crystal Caverns (Prismatic), Bubble Reef (Eternal), Rainbow's End (Infinity).
Each biome's pods drop that biome's rarity (small chance of a "lucky" +1 tier, never past Infinity).
Starbloom and every biome beyond it have a 3–6.5% chance of a **Secret** family seed (best odds at the end).
The last three: Crystal Caverns (geode cliffs with glowing veins, stone arches hung with crystal stalactites, a
glowing stream, violet-teal twilight with cavern glints), Bubble Reef (coral cliffs, kelp, a sunken ship, circling
fish, sun shafts and rising bubbles) and Rainbow's End (rainbow-glass road, rainbows over the road, rainbow falls,
floating prisms, an aurora sunset).

Mutations (rolled when a seed spawns; much more likely during weather events):
Normal ×1, **Gold** ×2, **Diamond** ×3, **Rainbow** ×5.

Growth: seed → sprout → bud → **grown** (only grown plants pay and can be stolen).
Income accumulates into the garden's cash pile; step on the COLLECT pad to bank it.

Collections and the Seed Almanac (src/progress): a plant counts as yours the moment you grab its seed, plant it,
steal it (even if a full garden sells it), get it as a gift or in a trade, or have it in your garden. Each plant has
a sticker per finish (Normal, Gold, Diamond, Rainbow) plus Big / Giant / Titan size stamps, kept for good in the
profile. First sticker of a plant: +1 ⭐; all four finishes ("Mastered", gold frame): +5 ⭐. A page per biome (its
rarity's plants) and a Secret page; filling a biome page (every plant Mastered) is its page badge, 20 ⭐ (Sunny
Field) up to 60 ⭐ (Rainbow's End). Almanac Ace: 3 full pages = Leaf Hat, every page = Golden Trowel noodle.
**Family Four** = having had all four Secret plants (any finish): 200 ⭐, cash (900 s of income, at least $50K; paid
into a solo Endless garden, otherwise saved for the next one, like quest cash) and the Family Crown hat, with a
full-screen celebration (it waits until you are not carrying anything).

**Giant Harvests** (`SIZES`, `SIZE_ODDS` in config.js): the moment a plant finishes growing it rolls a size with the
rules' dice (the host rolls online): **Big** 10% (x1.25 income, 1.25x as tall), **GIANT** 2% (x3, 1.5x), **TITAN**
0.2% (x6, 1.8x, a light beam). A grow pet in the team makes the odds x1.25, a Water Bucket on the plant x1.5. The
size stays with the plant for good (sell value, net worth, stealing, gifts, trades, saves) and multiplies on top of
mutations. Economy guard: at the base odds sizes add under +8% to a garden's income (tests/gameplay/giant.test.mjs).
On screen: a drumroll, the plant stays normal size for 1.2 s, then pops up with "BIG!" / "GIANT!" / "TITAN!!"; your
own GIANT or TITAN nudges the camera, a nearby family bot shouts WHOA, and the plant label wears a size chip.

## 4. Verbs

* **Grab** (E / tap): pick a seed from a pod. Carried above your head. Speed ×0.85.
* **Plant**: walk into your own garden while carrying → auto-plants in the nearest empty planter.
* **Steal** (hold E 1.5 s on a rival's grown plant): carry the pot home. Speed ×0.7.
  Reach your garden → it becomes yours. Owner gets a big alert.
* **Bonk** (click / F / tap 🟦): swing a **pool noodle**. Hit → target stunned 1 s,
  knocked back, drops what they carry (stolen plants fly home; wild seeds fall on the ground
  for anyone to grab). Also stuns road monsters for 2 s (only with empty hands: bonk the guard before you grab).
* **Lock** (step on your LOCK pad): laser gate for 40 s (+10 s per rebirth); only the owner passes.
  60 s recharge.
* **Collect** (step on COLLECT pad): bank your garden's cash pile.
* **Sell** (hold V / the gold Sell button / D-pad down for 1 s by your own grown plant): +90 s worth of its income.
  Selling has its own button and prompt (a gold pill), so E (grab, steal, unlock, drop...) never sells. Carrying a seed
  into a full garden: E offers Drop, the Sell button makes room (the seed then plants itself). Bots hold Sell too.
* **Pet tricks** (click or tap any pet you can see): it does a trick everyone sees. Walkers: backflip, spin, jump,
  dance, roll; flyers: loop, barrel roll, spin-rise, dive (`PET_TRICKS` in config.js). One per pet per second;
  purely for fun (no rules change). A click that misses the pets still bonks; F always bonks.
* **Train** (Speed Shop, three treadmill stations): the **Speed** treadmill sells the next Speed level (+2 studs/s;
  the shop panel also buys x10 or MAX). There is no top level: each one costs 55% more than the last. Grip grows
  with top speed (above 50 studs/s) so fast players still steer. The **Boost Lab** sells Boost levels 1-10.
  The **Warm-Up** treadmill: its belt carries you back (all belts do); stay on it for a few seconds and you get
  **Pumped** (+10-30% speed for 45-180 s, better with each treadmill tier: Basic, Turbo, Rocket, Hyper, Galaxy).
* **Boost** (Shift / lightning button / RT): a burst of +50% speed (up to +100% at Boost Lv 10) for 1.2-2.2 s,
  recharging in 12-6 s. Works while carrying: the escape tool.
* **Speed gears** (X / gear chip / LT): Slow 35%, Cruise 70%, Full. Only changes what your stick asks for.
* **Base** (BASE console just inside your gate): level your garden 1-10 with cash (survives rebirth). Each level
  +2% income; Lv 2 Base Studio (floors, fences), Lv 3 laser colours + 2 decoration spots, Lv 4 2nd pet slot,
  Lv 5 Guard Gnome (bonks a thief robbing your garden, every 6 s) + 4 spots, Lv 6 home treadmill (warm up and
  shop from home), Lv 7 sprinklers (plants grow 25% faster) + 6 spots, Lv 8 3rd pet slot, Lv 9 locks last 20 s
  longer, Lv 10 golden base + Golden Statue. Solid decorations block walking; the trampoline launches you.
* **Egg drops**: every 100-170 s an egg floats down on balloons (a light beam marks where it lands) on the plaza
  or the Seed Road (deeper = rarer eggs; 5% Rainbow Eggs). First to touch it after it lands hatches it for free.
* **Name a pet**: a "Name your pet!" box on the hatch card (dice button for ideas), or Rename in My Pets. Up to
  14 letters, same kid-safe filter as player names; the name floats over the pet and shows in every pet list.
* **Trade** (Y / Trade button near another player or a family bot): both sides offer up to 4 planted plants (grown
  or still growing), up to 3 pets, the seed in their hands and cash; both press Ready, a 3 s countdown, then
  everything swaps at once. Any change un-readies both and locks Ready for 1 s. Both gardens need free planters for
  the plants and seeds coming in (a traded seed is planted at once, with full grow time) and both pet bags need room
  (bots hold 3 pets). Walking apart (40 studs), a bonk or leaving ends the trade; online, so does a friend's device
  going quiet during the countdown (1.5 s). Family bots (solo and in private rooms): they answer an invite after a
  moment (busy ones and usually Micah say no; a bot whose garden is being robbed mid-trade says bye and runs to
  defend it, unless the countdown already runs), you tap their plants and pets to ask for them, and they say yes
  when what they get is worth at least Esther 0.8x / Dorian 1x / Mati 1.2x / Micah 1.5x what they give (plants:
  90 s of income, a little less while growing; pets: their average hatch cost; cash). Offered something and asked
  for nothing, a bot proposes a thing of its own (never the same one twice in a row). A pet given to a bot stays
  with it for the match (with its nickname, in a solo save too); giving one asks twice. Saying "Trade?" near a bot
  may get you an invite.
* **Expand** (walk into your next FOR SALE lot): +5 planters.
* **Items** (Gear Shop, hotbar 1–5): Banana Peel, Water Balloon, Speed Coil, Invisibility Cloak,
  Water Bucket (halves remaining growth time of the plant you stand next to).
* **Rebirth** (Rebirth Altar): at a net-worth threshold, reset for a permanent income
  multiplier, base speed and a crown.
* **Help! Family Hero** (`HERO` in config.js): bonk (or water-balloon) a thief who is running off with *someone
  else's* plant and the game tips you min(30 s of the plant's income, 90 s of what you could sell it for), doubled
  when the thief is SNEAKY (3+ steal grabs in the last 2 minutes). You wear a gold HERO ribbon for 60 s. Caps: one
  tip per hero/thief pair per 90 s and 5 per hero per 10 minutes (a capped rescue is just a good bonk). No hero for
  the owner bonking their own thief, the Guard Gnome, monsters or a banana peel. A rescued family bot thanks you and
  won't steal from you for 2 minutes.
* **Call for help** (HELP! button while you're being robbed, or H; it is the "Help!" quick chat): the family bots
  answer by personality: Esther (Guardian) always within 150 studs, Dorian (Tycoon) within 60, Mati (Speedster)
  half the time, Micah (Sneaky Thief) a quarter of the time ("Not it!"). Helpers chase the thief for up to 20 s.
  When a family member is robbed within 80 studs of you: "Esther needs help!" and an arrow to the thief.

## 5. Dangers
Road monsters guard biomes 2–9 (the far worlds' Snowball Yeti, Gummy Bear and Storm Puff are the fastest). They only chase players **carrying a seed**, never leave their
biome, and knock the seed out of your hands if they catch you. Out-run them (Speed!) or bonk them.
The three farthest worlds have the Gem Golem (its crystals glow brighter when it is angry), the Puffer Pop (it puffs
up, spikes out, when it spots you) and the Comet Dragon (a long noodle of a dragon with a comet-star tail).

### Big Chomp, the Garden Gobbler (world boss; `gameplay/boss.js`, numbers in config `BOSS`)
* Comes at 5:00 in Endless, then every 9–12 min after the last one is gone; once per Showdown, between 2:30 and 5:00
  (so it is always gone before the last 90 s). Debug: `__app.game.spawnBoss()`.
* Crawls (6 studs/s, no collider) from just up the road to the richest garden with a player and lies down along
  the fence outside its gate (clear of the laser), face to the plaza. There it slurps 2%/s of that garden's cash
  pile, up to a quarter of it; never banked cash or plants, and nothing on Chill.
* Hit points: 40 + 20 per player in the world. A noodle bonk within reach of its body (bonk range + 3 studs) is
  1 hit, a water balloon splash on it 3. On Chill a bot's hit counts half (on its hit points and on the bot's share).
  Teamwork: a swing that lands on it doesn't bonk empty-handed players standing by (someone carrying loot still
  gets bonked, so a thief can't hide behind it). Water balloons too: one flies past empty-handed players within
  reach of its body, and a splash on it or by them doesn't soak them (loot carriers still get soaked).
* Burst: the slurp goes back to the pile; 12–20 seeds from the deepest biome any player has reached, all Gold /
  Diamond / Rainbow (60/30/10), lie around for 45 s (no pod to go back to); a pot of 60 s of everyone's income
  is split by hits (the remainder to the top bonker); the top bonker wears a crown for 60 s (ties go to a person).
* After 90 s it burps and crawls back up the road with what it slurped (it can't be hurt then).
* Bots drop farming for it while it can be reached (more keenly when it is munching their own pile), each taking
  its own spot along the body; defending their garden still comes first. Their difficulty "misses" are a moment's
  hesitation there, never a wild swing at the family.

## 6. Weather events (every 3–5 min, 60 s)
* **Golden Hour** — warm sunset light; 45% of new seeds are Gold.
* **Diamond Night** — starry night; 35% Diamond.
* **Rainbow Rain** — rain + rainbow; 25% Rainbow.
* **Egg Rain** — a candy-pastel sky; 10 egg drops fall around the plaza and the start of the road (15% Rainbow).

## 7. Modes
* **Endless** (auto-saves locally). **Welcome-Back Garden** (`AWAY` in config.js, solo Endless only): when you come
  back to a save, every garden (the bots' too) has kept growing at half speed for the time you were away, capped at
  2 hours (4 at Base Lv 6, 8 at Lv 10); breaks under 5 minutes don't count. Plants that finish roll their size (your
  GIANT and TITAN ones count for the Gigantic badge); the cash waits on the COLLECT pad. A "While you were away..."
  card (never during the tutorial) shows what grew, the cash and a few made-up family stories (nothing is ever lost
  while you're away), then "Run to COLLECT!" points at your pad.
* **Family Showdown** — 8 minutes, highest net worth wins, 3D podium finale.
* Difficulty: Chill / Normal / Chaos (bot aggression and speed).
* Online: public rooms (Quick Play, the room list) are people only; private rooms may have 0-3 computer players.

## 7b. Chat
* Quick chat (16 phrases) and emotes work everywhere. Typed chat (max 80 characters) works in solo games and private
  rooms; in public rooms only on devices where a parent turned on Settings > Chat > "Typed chat in public rooms".
  "Typed chat" off = quick chat only on that device.
* Every typed line is cleaned (odd characters dropped) and then sent as it is or refused with a friendly note: bad
  or unkind words (the player-name filter plus a few insults), links, emails / @names, phone numbers and runs of
  more than 6 digits. The sender, the room host and every receiver run the same filter.
* Rate limit: 3 lines back to back, then one per 1.2 s (the host allows one extra for network bunching).
* The family bots answer some typed lines by topic (hi, bye, gg, thanks, sorry, jokes, lol, love, how-to, help,
  steal, race, trade, pets, bragging, nice, wow) in their own voices; a bot called by name ("hi mom") answers first.

## 7c. Golden Gnome Hunt
* 16 tiny golden gnomes (`GNOMES` in gameplay/layout.js): 4 on the island (the fountain rim, behind the surfboards,
  beside the Pet Egg stand, between the Rebirth Altar and the Wardrobe) and one in each of the 12 worlds, placed
  relative to the biomes. Every spot is clear of colliders and the pod line, inside the lane (|x| ≤ 17) and at most
  6 studs up: the Rainbow's End gnome sits on the pot of gold, so you hop up to it.
* Caught by walking within 3.5 studs (and no more than 4 studs below it). Within 30 studs an unfound gnome giggles
  from where it hides, at most every 6 s. Found gnomes vanish for that profile only (`profile.gnomes`); each player
  finds their own, solo or online, in any mode.
* Badge **Gnome Hunter** I/II/III at 3 / 6 / all (10 / 25 / 60 stars). II unlocks the **Gnome Hat**, III the
  **Golden Gnome Noodle**. The **Gnome Map** (pause menu) shows every spot on a little map with a riddle hint.

## 7d. The Seed Gazette
* A newspaper written from the game's events (heists, rescues, bonks that save a plant, Guard Gnome catches,
  Mythic-or-better and rainbow seeds, giant plants, egg drops and hatches, base levels, rebirths, Showdown wins,
  pet tricks, trades, Golden Gnomes, Big Chomp, welcome-back reports). Kind templates only; never typed text.
  Dorian and Esther are "Dad" and "Mom" when the family profiles play them.
* One story per kind and lead player every 20 s; stories where only bots took part at most one every 15 s.
  Nothing from the title screen's demo match. The last 20 stories (and today's bonk counts) are kept per profile
  on this device (`gazette:<profileId>`), never in the profile or the cloud.
* Front page: the lead (the biggest recent story), three more headlines, and six boxes: Biggest Heist, Best Rescue,
  Top Seed, Slipperiest Moment, Pet of the Day, Most Bonked (today). Faces are coloured initials, never photos.
  A billboard by the spawn shows the lead and two more (repainted at most every 5 s); the full page opens from the
  pause menu and the Showdown end screen, and "Save front page" shares or downloads it as a PNG.

## 8. Controls
* Desktop: WASD/arrows move · Space jump · E interact (hold) · V sell (hold) · Click or F bonk (click a pet: trick) ·
  1–5 items · right-drag or Q/Z… orbit camera · wheel zoom · Esc pause · G emotes · T quick chat ·
  Enter typed chat (Enter sends, Esc closes; game keys are ignored while typing).
* Touch: left joystick · drag right side to orbit · Jump / Bonk / Action buttons · gold Sell button (only by a grown
  plant of yours) · tap a pet for a trick · tap hotbar · chat button
  (the panel opens at the top of the screen, input first, so the keyboard never covers it).
* Gamepad: left stick, right stick camera, A jump, X bonk, B interact, D-pad down sell (hold), LB/RB cycle items, Y use item.
* Sound: music and sound effects each have an on/off switch and a volume, fully independent; off keeps
  the volume for next time, and turning a volume up switches it on. "Mute all" = both switches off (the
  volumes stay); un-muting brings back the switches that were on. Where: Settings, the pause menu (gamepad:
  D-pad picks a row, left/right volume, A on/off; small phones held upright show just the two switches there),
  and the in-game speaker (tap: a pop-up with both rows; hold: mute all). M turns the music on/off. Music switched off stops scheduling and picks the song up at
  the next bar; effects switched off cost nothing (audio/levels.js).

## 9. Tutorial (optional)
* A new player is asked once, "Want a quick tutorial?": when they press Start before their first solo game, or by
  a card in the game when their first game is online. **Yes, show me!** turns it on; **No thanks** never asks
  again. Keys Y / N; gamepad A / B in the menu, D-pad up / left on the in-game card (A and B jump and grab there, and
  a press that closes the pause menu never answers it). Anyone who has already played (lifetime counters, stars,
  badges, a saved garden) is never asked.
* Eight steps, one short card each (with the key / button for the keyboard, touch screen or gamepad in use):
  walk out of the gate → grab a seed on the Seed Road → carry it home (it plants itself) → watch it grow →
  collect the cash → train at the Speed Shop → lock your garden → steal a family plant and run it home.
* A bouncing arrow hangs over the next spot in the world (an arrow on the screen edge while it is off screen).
  Steps tick off on the gameplay events, so they work online too; a step done early is not asked for again.
* Skip is always on the card. The finish is confetti and a "Tutorial complete!" moment. Progress is saved per
  profile (`profile.tutorial`) and resumes after a reload; Settings and the mode screen replay it from step 1.
* The bots' gentle practice steal waits until the tutorial is done or declined.
