// Reusable game-state setups for playtests and QA. All run inside the page via window.__app.
// Pair with harness.mjs: launch() -> openGame() -> startMatch() -> scenario helpers -> stepFrames()/shot().

/** Give the human cash (and optionally speed levels / items). */
export async function giveHuman(page, { cash = 0, speedLevel = null, items = null } = {}) {
  await page.evaluate(([cash, speedLevel, items]) => {
    const h = window.__app.game.human;
    h.cash += cash;
    if (speedLevel != null) h.speedLevel = speedLevel;
    if (items) Object.assign(h.items, items);
  }, [cash, speedLevel, items]);
}

/** Fill a garden's planters with grown plants. species: array of speciesIds (cycled). */
export async function fillGarden(page, slot, { species = ['sunflower', 'mushroom', 'cactus', 'flytrap', 'lavalily', 'starlotus'], mutation = 'normal', grown = true, count = 10 } = {}) {
  await page.evaluate(([slot, species, mutation, grown, count]) => {
    const g = window.__app.game.gardens[slot];
    let uid = 900000 + slot * 100;
    g.planters.slice(0, count).forEach((pl, i) => {
      pl.unlocked = true;
      const sp = species[i % species.length];
      pl.plant = { uid: uid++, speciesId: sp, mutation, growTotal: 30, growLeft: grown ? 0 : 20, owner: slot };
    });
  }, [slot, species, mutation, grown, count]);
}

/** Put the human (or a player by slot) somewhere. */
export async function place(page, slot, x, z, yaw = null) {
  await page.evaluate(([slot, x, z, yaw]) => {
    const p = slot == null ? window.__app.game.human : window.__app.game.players[slot];
    p.pos.x = x;
    p.pos.z = z;
    p.pos.y = 0;
    p.vel.x = p.vel.y = p.vel.z = 0;
    if (yaw != null) p.yaw = yaw;
  }, [slot, x, z, yaw]);
}

/** Centre z of a biome by index (0..5). */
export async function biomeCenter(page, i) {
  return page.evaluate((i) => {
    const r = window.__app.game.layout.biomeRanges[i];
    return (r.minZ + r.maxZ) / 2;
  }, i);
}

/** Make bot `thiefSlot` steal planter `index` from the human's garden right now (they'll carry it home). */
export async function botStealsFromHuman(page, thiefSlot, index = 0) {
  return page.evaluate(([thiefSlot, index]) => {
    const g = window.__app.game;
    const garden = g.gardens[g.human.slot];
    const pl = garden.planters[index];
    const thief = g.players[thiefSlot];
    thief.pos.x = pl.x + 3;
    thief.pos.z = pl.z;
    return g.stealPlant(thief, garden, pl);
  }, [thiefSlot, index]);
}

/** Make the human carry a seed (optionally a species/mutation). */
export async function humanCarrySeed(page, speciesId = 'lavalily', mutation = 'gold') {
  await page.evaluate(([speciesId, mutation]) => {
    const h = window.__app.game.human;
    h.carrying = { kind: 'seed', speciesId, mutation, podId: 0 };
  }, [speciesId, mutation]);
}

/** Start a weather event: 'golden' | 'diamond' | 'rainbow'. */
export async function weather(page, id) {
  await page.evaluate((id) => window.__app.game.startEvent(id), id);
}

/** Point the follow camera. yaw in radians (0 = looking north), pitch 0..1.25, distance 8..48. */
export async function aim(page, { yaw = null, pitch = null, distance = null } = {}) {
  await page.evaluate(([yaw, pitch, distance]) => {
    const c = window.__app.cam;
    if (yaw != null) c.yaw = yaw;
    if (pitch != null) c.pitch = pitch;
    if (distance != null) c.distance = distance;
    c.introT = 1;
  }, [yaw, pitch, distance]);
}

/** Renderer stats for the last frame. */
export async function renderInfo(page) {
  return page.evaluate(() => {
    const r = window.__app.engine.renderer;
    return { calls: r.info.render.calls, triangles: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length };
  });
}

/** End a showdown immediately (starts a showdown match if needed). */
export async function endShowdownNow(page) {
  await page.evaluate(() => {
    const g = window.__app.game;
    if (!g.match) g.match = { endsAt: g.time + 0.1 };
    else g.match.endsAt = g.time + 0.1;
  });
}
