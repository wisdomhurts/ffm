# Art Direction — MATI's Campout

**One sentence:** a handcrafted, storybook-cinematic pine forest where the
campfire is a small island of golden light inside an enormous blue-black night.

## Look

- **Stylised realism.** Believable proportions and lighting, simplified
  shapes. Smooth shading, soft gradients, gentle colour variation. No hard
  outlines, no flat unlit colours, no noisy photo textures.
- **All procedural.** Meshes are generated with `SurfaceTool`/`ArrayMesh`;
  surface detail comes from shader noise (triplanar for rock/terrain),
  vertex colours (baked AO and gradients) and per-instance tint variation.
- **Rich, layered nature.** Every view should have foreground, midground and
  background layers: grass and flowers at your feet, trunks and ferns in the
  middle, a silhouette of firs and the mountain skyline behind.
- **Readable at kid level.** Interactive things pop: chests have a warm glint,
  gatherables a subtle sparkle, the selected hotbar slot glows.

## Palette

| Name | Hex | Use |
|---|---|---|
| Deep forest | `#1f3b2a` | fir needles in shade, far forest |
| Moss | `#6f8f4e` | grass, moss on rock tops |
| Sage | `#9caf88` | sunlit meadow, lichen |
| Warm amber | `#ffb347` | firelight, lanterns, UI highlights |
| Golden orange | `#e8892b` | flames core, sunset |
| Earth brown | `#6b4a2f` | bark, paths, wood |
| Cold indigo | `#232a5c` | night sky zenith, deep shadow |
| Moonlit blue | `#5f7fbf` | moonlight, night fill, water at night |
| Violet haze | `#6c5a8e` | dusk fog, distance at twilight |

Avoid pure black (`#000`) and pure white. Night shadows sit around
`#0b1024`–`#141a33`, never true black. Snow caps on the far mountains are
`#dfe6ef` tinted by the sky.

## Lighting targets (Forward+)

| Time | Key light | Fill / ambient | Fog |
|---|---|---|---|
| Morning | warm gold sun, low, long shadows | soft blue sky | light mist in hollows |
| Noon | neutral warm sun (energy ~1.4) | sky ambient | thin, bluish distance |
| Golden hour | orange sun, long shadows, rim light on trees | warm haze | amber/violet volumetric |
| Night | moon (blue `#7a95d8`, energy ~0.15, soft shadows) + campfire | very low indigo ambient | blue volumetric, fire glows in it |
| Fire out | moon + stars only | ambient dips further (still readable silhouettes) | thicker, colder |

The **campfire** is an `OmniLight3D` with shadows, warm `#ffb15c`, flickering
energy (layered noise, never strobing), plus a smaller hot core light. It
must visibly light trunks, tents, rocks and characters within its radius and
fall off naturally. Volumetric fog makes its glow visible in the air.

Post: AgX or ACES-like tonemapping, mild glow on emissive/fire only, SSAO for
contact shadows, gentle colour grading (warm highlights, cool shadows).
Brightness must stay playable: a player must always see the ground nearby and
silhouettes of trees, even at the darkest moment.

## Shapes

- **Pines/firs:** straight trunk with bark shader, 5–9 stacked, slightly
  drooping, jagged needle tiers; darker inside, lighter tips; height 9–18 m;
  3+ variants plus young saplings and dead snags. **Elder Trees** (giant):
  3–4× wider trunk, 28–40 m, huge buttress roots, mossy, golden-amber sap
  glints — they need the Mega Axe.
- **Rocks:** rounded, noise-displaced boulders with moss on top-facing
  surfaces (normal.y), lichen speckles, wet darkening in rain.
- **Ground cover:** grass clumps that sway, ferns, wildflowers (white, yellow,
  violet, red), mushrooms, fallen logs, pine cones, twigs.
- **Camp:** warm wood, canvas in cream/olive/rust, stone ring, string of tiny
  lights at higher tent levels. Tents always read as tents.
- **Characters:** friendly, slightly chunky proportions (head ~1/5.5 of
  height), rounded forms, clean colours from the locker palette, simple
  expressive eyes. Procedural animation: walk/run bob, arm swing, tool swings,
  idle breathing, hurt flinch.
- **Monsters:** silhouettes first. Night Stalkers are tall, thin, hunched
  shadow creatures with long arms, smoky edges and two ember-glowing eyes.
  Watchers are very tall, still, featureless figures with pale eyes. The
  Three-Headed Wolf is huge, black-furred, three heads with glowing eyes.
  Never gory: damage is shown with flashes, puffs of shadow and knockback.

## Motion & feel

Wind sways foliage and grass gently (stronger in storms). Embers drift up,
smoke curls and leans with the wind. Fireflies blink in meadows at dusk.
Camera motion is smooth and never nauseating; shake is brief and optional.
