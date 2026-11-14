// BaseBuilderAI (rules.teams.<team>.buildAi): an AI team grows its base by queueing BaseRegistry parts (schematics from
// core/assets/baseparts, exported by tools/MapExport.java) around its cores, on top of the ore they need; its core units
// (alphas with BuilderAI(alwaysFlee, 400), up to two per core, one every 6 s) build the queue. Its cores are kept full.
// With waves on, the wave team's builders fight instead (BuilderAI.useFallback), as in Mindustry.

const BaseAI = {
  parts: null,
  load() {
    if (this.parts) return this.parts;
    try { this.parts = JSON.parse(Sectors.maps.baseparts); } catch (e) { this.parts = { cores: [], parts: [], req: {} }; }
    return this.parts;
  },
  state: {}, // team -> timers and the ground path to keep clear
  reset() { this.state = {}; for (const k in TEAM_PLANS) TEAM_PLANS[k].length = 0; },
  st(team) { return this.state[team] || (this.state[team] = { step: 0, spawn: 0, pathTimer: 0, path: null }); },

  // BaseBuilderAI.update
  update(team) {
    const tr = Rules.team(team);
    if (!tr.buildAi) return;
    const cores = Game.byTeam[team].filter(b => b.block.cls === 'Core' && !b.dead);
    const st = this.st(team);
    // fill cores
    if (cores.length) { const c = cores[0]; for (const it of ITEMS) { const want = c.block.itemCapacity - c.items[it.id]; if (want > 0) c.addItem(it, want); } }
    // aiCoreSpawn: core units, two per core
    if (tr.aiCoreSpawn && cores.length && (st.spawn += Time.delta) >= 60 * 6) {
      st.spawn = 0;
      const type = UNITS[cores[0].block.unitType] || UNITS.alpha;
      const n = Game.units.filter(u => u.team === team && !u.dead && u.type === type).length;
      if (n < cores.length * 2) {
        const c = cores[Math.floor(Math.random() * cores.length)];
        const u = Game.spawnUnit(type, team, c.x, c.y);
        u.controller = new BuilderAI(true, 400);
        Fx.create('unitSpawn', c.x, c.y, 0, Teams[team].color);
      }
    }
    // the ground path from the drop zones to the enemy core, refreshed every 3 minutes (no parts are placed on it)
    if (!st.path || (st.pathTimer += Time.delta) >= 3 * 60 * 60) { st.pathTimer = 0; st.path = this.groundPath(team); }
    const plans = teamPlans(team);
    const interval = Mathf.lerp(12, 2, tr.buildAiTier);
    if (plans.length || (st.step += Time.delta) < interval) return;
    st.step = 0;
    for (let i = 0; i < 6; i++) {
      const pos = cores.length ? cores[Math.floor(Math.random() * cores.length)] : null;
      if (!pos) return;
      const ang = Math.random() * Math.PI * 2, len = Math.random() * 150;
      const tx = Math.floor(Math.round(pos.x / TS) + Math.cos(ang) * len), ty = Math.floor(Math.round(pos.y / TS) + Math.sin(ang) * len);
      if (!World.inside(tx, ty)) continue;
      // try not to block the drop zones
      if (World.spawns.some(s => Math.hypot(s.x - tx, s.y - ty) < 40)) continue;
      const parts = this.load(), drop = World.drop(tx, ty);
      let list = null;
      if (drop && parts.req[drop.name] && parts.req[drop.name].length) list = parts.req[drop.name];
      else if (Math.random() < 0.01) list = parts.parts;
      if (list && list.length && this.tryPlace(team, list[Math.floor(Math.random() * list.length)], tx, ty)) break;
    }
  },

  // tiles along the flow field from each drop zone to the enemy core, with their 8 neighbours
  groundPath(team) {
    const out = new Set(), f = Pathfinder.fields && Pathfinder.fields.crux;
    if (!f || team !== 'crux' || !f.dist) return out;
    const W = World.w;
    for (const s of World.spawns) {
      let x = s.x, y = s.y;
      for (let n = 0; n < W * World.h; n++) {
        let best = null, bd = f.dist[y * W + x];
        for (const [dx, dy] of Geometry.d4) {
          const nx = x + dx, ny = y + dy;
          if (!World.inside(nx, ny)) continue;
          const d = f.dist[ny * W + nx];
          if (d < bd) { bd = d; best = [nx, ny]; }
        }
        if (!best) break;
        [x, y] = best;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.add((y + dy) * W + x + dx);
        if (bd <= 0) break;
      }
    }
    return out;
  },

  // Schematics.rotate (times quarter turns, counter-clockwise for positive), positions and point configs
  rotate(part, times) {
    let w = part.w, h = part.h;
    let tiles = part.tiles.map(t => ({ block: BLOCKS[t[0]], x: t[1], y: t[2], rot: t[3], cfg: t[4] }));
    const dir = Math.sign(times);
    for (let k = 0; k < Math.abs(times); k++) {
      const ox = Math.floor(w / 2), oy = Math.floor(h / 2);
      const rp = ([px, py]) => dir >= 0 ? [-py, px] : [py, -px];
      tiles = tiles.map(t => {
        let wx = (t.x - ox) * TS + t.block.offset, wy = (t.y - oy) * TS + t.block.offset;
        [wx, wy] = dir >= 0 ? [-wy, wx] : [wy, -wx];
        let cfg = t.cfg;
        if (Array.isArray(cfg) && cfg.length && Array.isArray(cfg[0])) cfg = cfg.map(rp);
        else if (Array.isArray(cfg) && cfg.length === 2 && typeof cfg[0] === 'number') cfg = rp(cfg);
        return { block: t.block, x: Math.round((wx - t.block.offset) / TS) + ox, y: Math.round((wy - t.block.offset) / TS) + oy, rot: Mathf.mod(t.rot + dir, 4), cfg };
      });
      [w, h] = [h, w];
    }
    return tiles;
  },

  // BaseBuilderAI.tryPlace
  tryPlace(team, part, x, y) {
    const rotation = Math.floor(Math.random() * 5) - 2;
    const ax = Math.floor(part.w / 2), ay = Math.floor(part.h / 2);
    const tiles = this.rotate(part, rotation);
    // rotate the drill centre around the schematic centre
    const a = rotation * Math.PI / 2, dx0 = part.cx - ax, dy0 = part.cy - ay;
    const rx = ax + dx0 * Math.cos(a) - dy0 * Math.sin(a), ry = ay + dx0 * Math.sin(a) + dy0 * Math.cos(a);
    const cx = x - Math.trunc(rx), cy = y - Math.trunc(ry);
    const path = this.st(team).path;
    for (const t of tiles) {
      const rx2 = t.x + cx, ry2 = t.y + cy;
      if (!t.block || !Game.validPlace(t.block, rx2, ry2, t.rot, team)) return false;
      if (t.block.solid !== false && path && path.size) {
        const s = t.block.size, o = t.block.sizeOffset;
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (path.has((ry2 + o + dy) * World.w + rx2 + o + dx)) return false;
      }
    }
    // the part's drills must sit only on the ore it is for
    const req = part.req && Items[part.req] ? Items[part.req] : null;
    if (req) {
      let correct = 0, incorrect = 0, anyDrills = false;
      for (const t of tiles) if (t.block.cls === 'Drill') {
        anyDrills = true;
        const s = t.block.size, o = t.block.sizeOffset;
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
          const d = World.drop(t.x + cx + o + dx, t.y + cy + o + dy);
          if (d === req) correct++; else if (d) incorrect++;
        }
      }
      if (anyDrills && (incorrect !== 0 || correct === 0)) return false;
    }
    const plans = teamPlans(team);
    for (const t of tiles) plans.push({ block: t.block, x: t.x + cx, y: t.y + cy, rotation: t.rot, config: mapConfig(t.cfg) });
    return true;
  },
};

// map / schematic config value -> the schematic config form applySchemConfig understands
function mapConfig(cfg) {
  if (cfg === undefined || cfg === null) return null;
  if (typeof cfg === 'string') return Items[cfg] ? { item: cfg } : UNITS[cfg] ? { unit: cfg } : null;
  if (typeof cfg === 'number') return { int: cfg };
  if (typeof cfg === 'boolean') return { bool: cfg };
  if (Array.isArray(cfg) && cfg.length && Array.isArray(cfg[0])) return { points: cfg };
  if (Array.isArray(cfg) && cfg.length === 2) return { point: cfg };
  return null;
}

{
  const _ng = Game.newGame;
  Game.newGame = function () { BaseAI.reset(); return _ng.apply(this, arguments); };
  const _load = SaveIO.load;
  SaveIO.load = function () { BaseAI.reset(); return _load.apply(this, arguments); };
  const _gu = Game.update;
  Game.update = function () {
    _gu.apply(this, arguments);
    if (Rules.cur.pvp) return;
    for (const t of ['crux']) if (Rules.team(t).buildAi && Game.byTeam[t]) BaseAI.update(t);
  };
  // the AI's core units are builders after a reload too
  const _sl = SaveIO.load;
  SaveIO.load = function () {
    const r = _sl.apply(this, arguments);
    for (const u of Game.units) if (u.team !== 'sharded' && Rules.team(u.team).buildAi && u.type.name === 'alpha') u.controller = new BuilderAI(true, 400);
    return r;
  };
}
