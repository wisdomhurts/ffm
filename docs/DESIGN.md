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
* **Expand** (walk into your next FOR SALE lot): +5 planters.
* **Items** (Gear Shop, hotbar 1–5): Banana Peel, Water Balloon, Speed Coil, Invisibility Cloak,
  Water Bucket (halves remaining growth time of the plant you stand next to).
* **Rebirth** (Rebirth Altar): at a net-worth threshold, reset for a permanent income
  multiplier, base speed and a crown.

## 5. Dangers
Road monsters guard biomes 2–9 (the far worlds' Snowball Yeti, Gummy Bear and Storm Puff are the fastest). They only chase players **carrying a seed**, never leave their
biome, and knock the seed out of your hands if they catch you. Out-run them (Speed!) or bonk them.
The three farthest worlds have the Gem Golem (its crystals glow brighter when it is angry), the Puffer Pop (it puffs
up, spikes out, when it spots you) and the Comet Dragon (a long noodle of a dragon with a comet-star tail).

## 6. Weather events (every 3–5 min, 60 s)
* **Golden Hour** — warm sunset light; 45% of new seeds are Gold.
* **Diamond Night** — starry night; 35% Diamond.
* **Rainbow Rain** — rain + rainbow; 25% Rainbow.
* **Egg Rain** — a candy-pastel sky; 10 egg drops fall around the plaza and the start of the road (15% Rainbow).

## 7. Modes
* **Endless** (auto-saves locally).
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
  D-pad picks a row, left/right volume, A on/off), and the in-game speaker (tap: a pop-up with both rows;
  hold: mute all). M turns the music on/off. Music switched off stops scheduling and picks the song up at
  the next bar; effects switched off cost nothing (audio/levels.js).

## 9. Tutorial (optional)
* A new player is asked once, "Want a quick tutorial?": when they press Start before their first solo game, or by
  a card in the game when their first game is online. **Yes, show me!** turns it on; **No thanks** never asks
  again. Anyone who has already played (lifetime counters, stars, badges, a saved garden) is never asked.
* Eight steps, one short card each (with the key / button for the keyboard, touch screen or gamepad in use):
  walk out of the gate → grab a seed on the Seed Road → carry it home (it plants itself) → watch it grow →
  collect the cash → train at the Speed Shop → lock your garden → steal a family plant and run it home.
* A bouncing arrow hangs over the next spot in the world (an arrow on the screen edge while it is off screen).
  Steps tick off on the gameplay events, so they work online too; a step done early is not asked for again.
* Skip is always on the card. The finish is confetti and a "Tutorial complete!" moment. Progress is saved per
  profile (`profile.tutorial`) and resumes after a reload; Settings and the mode screen replay it from step 1.
* The bots' gentle practice steal waits until the tutorial is done or declined.
