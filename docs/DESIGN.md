# Steal A Seed! — Family Edition

A Roblox-style 3D browser game starring **Dorian, Esther, Maddie and Micah**, based on the
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
* **Gardens** (one per family member, index = player slot): 36 (x) × 44 (z), fenced,
  entrance gate facing the central aisle. Centres: slot0 (-48,-24), slot1 (48,-24),
  slot2 (-48,24), slot3 (48,24). Each has 10 planters (2 columns × 5), a COLLECT pad,
  a LOCK pad, a sign with the owner's photo + name.
* **The Seed Road**: 40 studs wide, from z=60 to z=960 — six biomes of 150 studs each,
  walled by biome-themed cliffs. Seed pods sit against both walls (never in the centre
  lane). Distance is difficulty: rarer seeds are visibly further away.

## 2. Characters

| id | Name | Colour | Bot personality | Outfit (from the Cabo sunset photo) |
|---|---|---|---|---|
| dorian | Dorian | `#2f80ed` | **Tycoon**: farms hard, upgrades, occasionally steals big | black & white "face-print" party shirt, dark jeans |
| esther | Esther | `#ff4f9a` | **Guardian**: locks often, chases thieves relentlessly | hot-pink dress |
| maddie | Maddie | `#9b5cff` | **Speedster**: buys speed first, goes deep for rare seeds | purple top, floral jacket |
| micah | Micah | `#1ec8a5` | **Sneaky Thief**: steals constantly, banana peels & balloons | mint Hawaiian shirt, khaki shorts |

Avatars are blocky R6-style (legs, torso, arms, big head) with the family member's
**photo face** on the head (feathered oval decal over a matched skin tone) and a hair
accessory. Photos are private (never committed); without them a classic cartoon face is used.

## 3. Seeds, plants, rarity

Rarity colours: Common `#b8c0cc`, Uncommon `#4cd964`, Rare `#3d9bff`, Epic `#b36bff`,
Legendary `#ffb627`, Mythic `#ff4d6d`, Secret (black with rainbow text).

Each biome's pods drop that biome's rarity (small chance of a "lucky" +1 tier).
Starbloom also has a ~3% chance of a **Secret** family seed.

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
* **Sell** (hold E on your own grown plant): +90 s worth of its income.
* **Train** (Speed Shop treadmill): buy the next Speed level (+2 studs/s).
* **Items** (Gear Shop, hotbar 1–5): Banana Peel, Water Balloon, Speed Coil, Invisibility Cloak,
  Water Bucket (halves remaining growth time of the plant you stand next to).
* **Rebirth** (Rebirth Altar): at a net-worth threshold, reset for a permanent income
  multiplier, base speed and a crown.

## 5. Dangers
Road monsters guard biomes 2–6. They only chase players **carrying a seed**, never leave their
biome, and knock the seed out of your hands if they catch you. Out-run them (Speed!) or bonk them.

## 6. Weather events (every 3–5 min, 60 s)
* **Golden Hour** — warm sunset light; 45% of new seeds are Gold.
* **Diamond Night** — starry night; 35% Diamond.
* **Rainbow Rain** — rain + rainbow; 25% Rainbow.

## 7. Modes
* **Endless** (auto-saves locally).
* **Family Showdown** — 8 minutes, highest net worth wins, 3D podium finale.
* Difficulty: Chill / Normal / Chaos (bot aggression and speed).

## 8. Controls
* Desktop: WASD/arrows move · Space jump · E interact (hold) · Click or F bonk ·
  1–5 items · right-drag or Q/Z… orbit camera · wheel zoom · Esc pause.
* Touch: left joystick · drag right side to orbit · Jump / Bonk / Action buttons · tap hotbar.
* Gamepad: left stick, right stick camera, A jump, X bonk, B interact, LB/RB cycle items, Y use item.
