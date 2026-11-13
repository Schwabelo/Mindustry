// Sector campaign: Mindustry's Serpulo sector maps (exported from core/assets/maps by tools/MapExport.java, packed by
// tools/compact_maps.py), unlocked through the tech tree like SerpuloTechTree's sector nodes, captured by surviving the
// sector's win wave (survival) or destroying every enemy core (attack). One sector is played at a time (the autosave slot).

const Sectors = {
  KEY: 'mindustry-lite-campaign',
  maps: null,               // name -> JSON text, unpacked at startup
  cache: new Map(),         // name -> parsed map
  index: {},                // name -> SECTOR_INDEX entry
  order: [],
  captured: new Set(),
  current: null,            // map data of the sector being played (null in a free play game)
  pending: null,            // map to load on the next World.generate
  ready: null,

  init() {
    for (const m of SECTOR_INDEX) { this.index[m.name] = m; this.order.push(m.name); }
    try { const d = JSON.parse(localStorage.getItem(this.KEY) || '{}'); this.captured = new Set(d.captured || []); } catch (e) { /* storage unavailable */ }
    this.ready = (async () => {
      const bin = Uint8Array.from(atob(SECTOR_PACK), c => c.charCodeAt(0));
      const text = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
      this.maps = JSON.parse(text);
    })().catch(e => { console.error('sector maps', e); this.maps = {}; });
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify({ captured: [...this.captured] })); } catch (e) { /* ignore */ } },
  reset() { this.captured = new Set(); this.save(); },

  title(name) { return (this.index[name] && this.index[name].title) || name; },
  map(name) {
    if (!this.cache.has(name)) { if (!this.maps || !this.maps[name]) return null; this.cache.set(name, JSON.parse(this.maps[name])); }
    return this.cache.get(name);
  },
  // SectorPresets unlock through their tech tree node: parent sector captured + node objectives
  missing(name) {
    const m = this.index[name], out = [];
    if (m.parent && this.index[m.parent] && !this.captured.has(m.parent)) out.push({ kind: 'sector', name: m.parent });
    for (const s of m.sectors) if (!this.captured.has(s) && s !== m.parent) out.push({ kind: 'sector', name: s });
    for (const r of m.research) if (!Research.has(r)) out.push({ kind: 'research', name: r });
    return out;
  },
  available(name) { return !this.missing(name).length; },
  goal(m) { return m.attack ? 'Destroy every enemy core' : m.winWave ? `Survive ${m.winWave} waves` : 'Survive'; },

  // ------------------------------------------------------------ launching / loading
  launch(name) {
    const m = this.map(name);
    if (!m) { UI.toast('Sector map still loading, try again in a moment', 2, true); return false; }
    this.current = this.pending = m;
    Game.researchMode = true;
    Game.newGame(1);
    return true;
  },

  // applies the sector after Game.newGame / SaveIO.load set the world up
  applyRules(m) {
    Game.attackMode = !!m.attack;
    Game.winWave = m.attack ? 0 : m.winWave;
    Game.waveSpacing = m.waveSpacing;
    Game.waveGroups = () => this.groups;
    this.groups = m.groups.filter(g => !g.boss);
    BOSS_GROUPS = m.groups.filter(g => g.boss);
    if (this.captured.has(m.name)) this.setCaptured(false);
  },
  clearRules() {
    Game.attackMode = false; Game.winWave = 0; Game.waveSpacing = 2 * 60 * 60; Game.waveStatus = null;
    Game.waveGroups = () => WAVE_GROUPS;
  },

  placeMap(m) {
    // replace the default core with the map's buildings (cores, derelict ruins, enemy bases)
    for (const b of Game.buildings) b.eachTile((x, y) => { World.build[y * World.w + x] = null; });
    Game.buildings = []; Game.byTeam = { sharded: [], crux: [], derelict: [] };
    const teams = ['sharded', 'crux', 'derelict'], placed = [];
    for (const [t, name, x, y, r, cfg] of m.builds) {
      const blk = BLOCKS[name];
      if (!blk) continue;
      let clash = false;
      for (let dy = 0; dy < blk.size && !clash; dy++) for (let dx = 0; dx < blk.size; dx++) { const tx = x + blk.sizeOffset + dx, ty = y + blk.sizeOffset + dy; if (!World.inside(tx, ty) || World.build[ty * World.w + tx]) { clash = true; break; } }
      if (clash) continue;
      const b = createBuilding(blk, teams[t], x, y, r);
      Game.addBuilding(b);
      if (cfg !== undefined) placed.push([b, cfg]);
    }
    for (const [b, cfg] of placed) {
      let c = null;
      if (typeof cfg === 'string') c = Items[cfg] ? { item: cfg } : UNITS[cfg] ? { unit: cfg } : null;
      else if (typeof cfg === 'number') c = { int: cfg };
      else if (typeof cfg === 'boolean') c = { bool: cfg };
      else if (Array.isArray(cfg) && cfg.length && Array.isArray(cfg[0])) c = { points: cfg };
      else if (Array.isArray(cfg) && cfg.length === 2) c = { point: cfg };
      if (c) try { applySchemConfig(b, c); } catch (e) { /* unsupported config */ }
    }
    updateSchemPending(); SchemPending.length = 0;
    // starting items: the sector's launch loadout (Rules.loadout), at least what a free play game starts with
    const core = Game.playerCore();
    if (core) {
      for (const it of ITEMS) core.items[it.id] = 0;
      core.total = 0;
      for (const [n, a] of m.loadout) if (Items[n]) core.addItem(Items[n], Math.min(a, core.block.itemCapacity));
    }
    this.fillEnemyCores();
    Power.dirty = true;
  },
  // Serpulo: enemyInfiniteItems -> the wave team's cores are kept full (Rules.TeamRule.fillItems)
  fillEnemyCores() {
    for (const b of Game.byTeam.crux) if (b.block.cls === 'Core' && !b.dead) for (const it of ITEMS) {
      const want = b.block.itemCapacity - b.items[it.id];
      if (want > 0) b.addItem(it, want);
    }
  },

  // ------------------------------------------------------------ capturing
  checkTimer: 0,
  update() {
    const m = this.current;
    if (!m || Game.state !== 'playing' || (this.checkTimer += Time.delta) < 30) return;
    this.checkTimer = 0;
    if (Game.attackMode) this.fillEnemyCores();
    if (this.captured.has(m.name) && Game.waveCountdown === Infinity) return;
    const won = m.attack ? !Game.byTeam.crux.some(b => b.block.cls === 'Core' && !b.dead)
      : m.winWave > 0 && Game.wave >= m.winWave && Game.enemiesAlive() === 0;
    if (won) this.capture();
  },
  capture() {
    const m = this.current, first = !this.captured.has(m.name);
    this.captured.add(m.name); this.save();
    this.setCaptured(true);
    // the enemy base is left behind as ruins
    for (const u of Game.units) if (u.team === 'crux' && !u.dead) u.kill();
    for (const b of [...Game.byTeam.crux]) { Game.removeBuilding(b); b.team = 'derelict'; Game.addBuilding(b); }
    Pathfinder.dirty = true;
    if (first) {
      UI.toast(`Sector captured: ${m.title || this.title(m.name)}!`, 6);
      Audio2.play('uiUnlock');
      const next = this.order.filter(n => !this.captured.has(n) && this.available(n));
      setTimeout(() => UI.showCaptured && UI.showCaptured(m.name, next), 600);
    }
    if (ResearchUI.isOpen()) ResearchUI.render();
  },
  setCaptured() {
    Game.waveCountdown = Infinity;
    Game.waveStatus = 'Sector captured';
  },
};
Sectors.init();

// World.generate loads the pending sector map instead of generating one
{
  const _gen = World.generate;
  World.generate = function (seed) {
    const m = Sectors.pending;
    if (m) { Sectors.pending = null; this.loadSector(m); return; }
    return _gen.call(this, seed);
  };
  // new games: sectors get their map, rules, buildings and wave timer; a restart replays the same sector
  const _ng = Game.newGame;
  Game.newGame = function (seed) {
    if (!Sectors.pending && Sectors.current) Sectors.pending = Sectors.current;
    const m = Sectors.pending;
    if (!m) Sectors.clearRules();
    const r = _ng.call(this, seed);
    if (m) {
      Sectors.applyRules(m);
      Sectors.placeMap(m);
      this.wave = 1;
      this.waveCountdown = Sectors.captured.has(m.name) ? Infinity : m.initialWave;
      Pathfinder.init();
      const core = this.playerCore();
      if (core && this.player) { this.player.x = core.x; this.player.y = core.y; Render.camX = core.x; Render.camY = core.y; }
      World.prerenderAround(World.coreTile.x, World.coreTile.y, 2);
      UI.minimapDirty = true;
      setTimeout(() => UI.toast(`${m.title || Sectors.title(m.name)}: ${Sectors.goal(m).toLowerCase()}`, 5), 300);
    }
    return r;
  };
  const _ws = Weather.setup;
  Weather.setup = function (seed) {
    _ws.call(this, seed);
    const m = Sectors.current;
    if (!m) return;
    // the sector's own Rules.weather entries (frequency and duration in ticks)
    this.entries = m.weather.filter(w => WEATHER_DEFS[w[0]]).map(([name, minF, maxF, minD, maxD]) =>
      ({ name, minF, maxF, minD, maxD, cooldown: minF / 2 + this.rand() * (maxF - minF) / 2 }));
  };
  const _gu = Game.update;
  Game.update = function () { _gu.apply(this, arguments); Sectors.update(); };
  // captured sectors get no more waves (the skip button does nothing there)
  const _rw = Game.runWave;
  Game.runWave = function () { if (Sectors.current && Sectors.captured.has(Sectors.current.name)) return; return _rw.apply(this, arguments); };
}
