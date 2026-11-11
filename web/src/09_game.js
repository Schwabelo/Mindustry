// Game state: buildings, units, waves, placement rules, construction lifecycle.

const SPAWN_SAFE_RADIUS = 10; // tiles around the enemy spawn where nothing can be built

// Waves.java default groups (units not in this build are mapped to the nearest equivalent)
const WAVE_GROUPS = [
  { unit: 'dagger', end: 10, unitScaling: 2, max: 30 },
  { unit: 'crawler', begin: 4, end: 13, unitAmount: 2, unitScaling: 1.5 },
  { unit: 'flare', begin: 12, end: 16, unitScaling: 1 },
  { unit: 'dagger', begin: 11, unitScaling: 1.7, spacing: 2, max: 4, shieldScaling: 25 },
  { unit: 'nova', begin: 13, spacing: 3, unitScaling: 0.5, max: 25 },           // pulsar
  { unit: 'mace', begin: 7, spacing: 3, unitScaling: 2, end: 30 },
  { unit: 'dagger', begin: 12, unitScaling: 1, unitAmount: 4, spacing: 2, shieldScaling: 20, max: 14 },
  { unit: 'mace', begin: 28, spacing: 3, unitScaling: 1, end: 40, shieldScaling: 20 },
  { unit: 'mace', begin: 45, spacing: 3, unitScaling: 1, max: 10, shieldScaling: 30, shields: 100 }, // spiroct
  { unit: 'flare', begin: 16, unitScaling: 1, spacing: 2, shieldScaling: 20, max: 20 },
  { unit: 'fortress', begin: 82, spacing: 3, unitAmount: 4, unitScaling: 3, shieldScaling: 30 }, // quasar
  { unit: 'nova', begin: 41, spacing: 5, unitAmount: 1, unitScaling: 3, shields: 640, max: 25 },   // pulsar
  { unit: 'fortress', begin: 40, spacing: 5, unitAmount: 2, unitScaling: 2, max: 20, shieldScaling: 30 },
  { unit: 'nova', begin: 35, spacing: 3, unitAmount: 4, end: 60 },
  { unit: 'dagger', begin: 42, spacing: 3, unitAmount: 4, end: 130, max: 30 },
  { unit: 'horizon', begin: 40, unitAmount: 2, spacing: 2, unitScaling: 2, shieldScaling: 20 },
  { unit: 'flare', begin: 50, unitAmount: 4, unitScaling: 3, spacing: 5, shields: 100, shieldScaling: 10, max: 20 },
  { unit: 'horizon', begin: 50, unitAmount: 2, unitScaling: 3, spacing: 5, max: 16, shieldScaling: 30 }, // zenith
  { unit: 'nova', begin: 53, unitAmount: 2, unitScaling: 3, spacing: 4, shieldScaling: 30 },
  { unit: 'crawler', begin: 31, unitAmount: 4, unitScaling: 1, spacing: 3, shieldScaling: 10 },        // atrax
  { unit: 'fortress', begin: 41, unitAmount: 1, unitScaling: 1, spacing: 30, shieldScaling: 30 },      // scepter
  { unit: 'horizon', begin: 22, unitAmount: 1, unitScaling: 2, spacing: 4, max: 12 },                  // early bombers
];
function groupSpawned(g, wave) {
  const begin = g.begin || 0, end = g.end === undefined ? Infinity : g.end, spacing = g.spacing || 1;
  if (wave < begin || wave > end || (wave - begin) % spacing !== 0) return 0;
  const scaling = g.unitScaling === undefined ? Infinity : g.unitScaling;
  return Math.min((g.unitAmount || 1) + Math.floor(((wave - begin) / spacing) / scaling), g.max === undefined ? 40 : g.max);
}
function groupShield(g, wave) { return Math.max((g.shields || 0) + (g.shieldScaling || 0) * (wave - (g.begin || 0)), 0); }

const Game = {
  state: 'title',
  buildings: [], units: [], byTeam: { sharded: [], crux: [] },
  player: null, respawnTimer: 0,
  wave: 1, waveCountdown: 0, waveSpacing: 2 * 60 * 60,
  command: 'defend',
  seed: 1,
  lastCoreWarn: -9999, lastDamageWarn: -9999,
  stats: { built: 0, destroyed: 0, kills: 0 },

  teamBuildings(team) { return this.byTeam[team]; },
  playerCore() { return this.byTeam.sharded.find(b => b.block.cls === 'Core' && !b.dead) || null; },
  unitCount(team, name) { let n = 0; for (const u of this.units) if (u.team === team && u.type.name === name && !u.dead) n++; return n; },
  unitCap(team) { let c = 0; for (const b of this.byTeam[team]) if (b.block.cls === 'Core') c += b.block.unitCapModifier; return c; },

  // ------------------------------------------------------------ lifecycle
  newGame(seed) {
    this.seed = seed;
    Time.time = 0;
    this.lastCoreWarn = -9999;
    this.buildings = []; this.units = []; this.byTeam = { sharded: [], crux: [] };
    Bullets.list = []; Bullets.lasers = []; Fx.list = []; Lightning.list = []; Decals.list = [];
    World.generate(seed);
    this.wave = 1;
    this.waveCountdown = 60 * 150;
    this.command = 'defend';
    this.stats = { built: 0, destroyed: 0, kills: 0 };
    const core = createBuilding(BLOCKS['core-shard'], 'sharded', World.coreTile.x, World.coreTile.y, 0);
    this.addBuilding(core);
    core.addItem(Items.copper, 300);
    core.addItem(Items.lead, 100);
    Power.dirty = true;
    Pathfinder.init();
    this.player = null;
    this.respawnTimer = 0;
    this.spawnPlayer(true);
    Render.camX = core.x; Render.camY = core.y;
    World.prerenderAround(World.coreTile.x, World.coreTile.y, 2);
    Input.reset();
    UI.onNewGame();
  },

  spawnPlayer(initial) {
    const core = this.playerCore();
    if (!core) return;
    const u = this.spawnUnit(UNITS.alpha, 'sharded', core.x, core.y, 90);
    u.controller = 'player';
    this.player = u;
    Fx.create('unitSpawn', core.x, core.y, 0, Pal.accent);
    Fx.create('coreFlash', core.x, core.y, 3);
    if (!initial) Audio2.play('coreLand', core.x, core.y, 0.4);
  },

  onPlayerDeath(u) {
    this.respawnTimer = 90;
    UI.toast('Your unit was destroyed. Respawning...', 2.5);
  },

  spawnUnit(type, team, x, y, rot = 90) {
    const u = new Unit(type, team, x, y, rot);
    if (team !== 'sharded' || type.name !== 'alpha') u.controller = makeController(type, team);
    this.units.push(u);
    return u;
  },

  // ------------------------------------------------------------ buildings
  addBuilding(b) {
    b.eachTile((x, y) => {
      const i = y * World.w + x;
      World.build[i] = b;
      World.boulder[i] = 0;
    });
    this.buildings.push(b);
    this.byTeam[b.team].push(b);
    this.refreshAround(b);
    if (b.power) Power.dirty = true;
    Pathfinder.dirty = true;
    UI.minimapDirty = true;
  },

  removeBuilding(b) {
    b.eachTile((x, y) => {
      const i = y * World.w + x;
      if (World.build[i] === b) World.build[i] = null;
    });
    const idx = this.buildings.indexOf(b);
    if (idx >= 0) this.buildings.splice(idx, 1);
    const t = this.byTeam[b.team], ti = t.indexOf(b);
    if (ti >= 0) t.splice(ti, 1);
    b.onRemoved();
    if (b.power) Power.removeBuilding(b);
    this.refreshAround(b);
    Pathfinder.dirty = true;
    UI.minimapDirty = true;
  },

  refreshAround(b) {
    const seen = new Set();
    const minX = b.minX - 1, maxX = b.maxX + 1, minY = b.minY - 1, maxY = b.maxY + 1;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const o = World.buildAt(x, y);
      if (o && !seen.has(o)) { seen.add(o); o.updateProximity(); }
    }
    if (!b.dead && World.buildAt(b.tx, b.ty) === b) b.updateProximity();
    for (const o of seen) if (o.power || (o.proximity.some(p => p.power))) Power.dirty = true;
  },

  destroyBuilding(b) {
    if (b.dead) return;
    b.dead = true;
    const size = b.current ? b.current.size : b.block.size;
    Fx.create('blockExplode', b.x, b.y, 0, null, size);
    Decals.add('rubble-' + Math.min(size, 8) + '-' + (size <= 2 ? Math.floor(Math.random() * 2) : 0), b.x, b.y, Math.floor(Math.random() * 4) * 90);
    Audio2.play(b.block.cls === 'Wall' ? 'blockExplodeWall' : 'blockExplode', b.x, b.y, 0.5 + size * 0.15);
    Render.shake(Math.min(size, 3), size * 3);
    this.removeBuilding(b);
    if (b.team === 'sharded') {
      this.stats.destroyed++;
      // Mindustry keeps a "rebuild" ghost; we re-queue the block as a plan for the player
      if (b.block.buildable && !(b instanceof ConstructBuild) && this.player && !this.player.dead) {
        Input.ghosts.push({ block: b.block, x: b.tx, y: b.ty, rotation: b.rotation, time: Time.time });
      }
    }
    if (b.block.cls === 'Core') this.checkGameOver();
  },

  checkGameOver() {
    if (!this.playerCore() && this.state === 'playing') {
      this.state = 'over';
      SaveIO.clearLocal();
      UI.showGameOver();
    }
  },

  // ------------------------------------------------------------ placement
  validPlace(block, x, y, rot, team = 'sharded') {
    if (!block.buildable) return false;
    const s = block.size, o = block.sizeOffset;
    let drillable = false;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const tx = x + o + dx, ty = y + o + dy;
      if (!World.inside(tx, ty)) return false;
      const i = ty * World.w + tx;
      if (World.wall[i]) return false;
      if (FLOOR_DEFS[World.floor[i]].isDeep) return false;
      if (Math.hypot(tx - World.spawn.x, ty - World.spawn.y) < SPAWN_SAFE_RADIUS) return false;
      const ex = World.build[i];
      if (ex) {
        if (ex.team !== team) return false;
        if (!this.canReplace(block, rot, ex, x, y)) return false;
      }
      if (block.cls === 'Drill') { const it = World.drop(tx, ty); if (it && it.hardness <= block.tier) drillable = true; }
    }
    if (block.cls === 'Drill' && !drillable) return false;
    if (block.solid) {
      const cx = x * TS + block.offset, cy = y * TS + block.offset, half = s * TS / 2;
      for (const u of this.units) {
        if (u.isFlying || u.dead) continue;
        const r = Math.min(u.type.hitSize * 0.66, 7.9) / 2;
        if (u.x + r > cx - half && u.x - r < cx + half && u.y + r > cy - half && u.y - r < cy + half) return false;
      }
    }
    return true;
  },

  canReplace(block, rot, ex, x, y) {
    if (ex instanceof ConstructBuild) return false;
    if (ex.block.cls === 'Core') return false;
    const eb = ex.block;
    if (eb.size !== block.size || ex.tx !== x || ex.ty !== y) return false;
    if (eb === block) return block.rotate && ex.rotation !== rot;
    return !!(block.group && eb.group === block.group);
  },

  hasResources(block) {
    const core = this.playerCore();
    if (!core) return false;
    return block.requirements.every(r => core.items[r.item.id] > 0 || r.amount === 0);
  },

  beginPlace(block, x, y, rot, team, config) {
    const ex = World.buildAt(x, y);
    if (ex) {
      // replace: refund the old block in full, then remove it
      const core = this.playerCore();
      if (core && !(ex instanceof ConstructBuild)) for (const r of ex.block.requirements) core.addItem(r.item, Math.min(r.amount, core.block.itemCapacity - core.items[r.item.id]));
      this.removeBuilding(ex);
    }
    const cb = new ConstructBuild(null, team, x, y, rot, block, false);
    cb.config = config;
    this.addBuilding(cb);
    return cb;
  },

  beginBreak(b) {
    if (b instanceof ConstructBuild) return b;
    const cb = new ConstructBuild(null, b.team, b.tx, b.ty, b.rotation, b.block, true);
    cb.health = b.health; cb.maxHealth = b.maxHealth;
    this.removeBuilding(b);
    this.addBuilding(cb);
    return cb;
  },

  finishConstruct(cb) {
    if (cb.dead) return;
    cb.dead = true;
    this.removeBuilding(cb);
    const b = createBuilding(cb.current, cb.team, cb.tx, cb.ty, cb.rotation);
    this.addBuilding(b);
    this.stats.built++;
    Fx.create('placeBlock', b.x, b.y, b.block.size);
    Audio2.play(b.block.size > 1 ? 'place2' : 'place', b.x, b.y, 0.6);
    // post-placement behaviour
    if (cb.config !== null && cb.config !== undefined) {
      if (b instanceof ItemBridge) { const o = cb.config; if (o && !o.dead) b.configure(o); }
      else b.configure(cb.config);
    }
    if (b instanceof PowerNode) Power.autoLinkNode(b);
    else if (b.power) Power.autoLinkConsumer(b);
    if (b instanceof ItemBridge) Input.onBridgePlaced(b);
    Power.dirty = true;
    return b;
  },

  finishDeconstruct(cb) {
    if (cb.dead) return;
    cb.dead = true;
    this.removeBuilding(cb);
    Fx.create('breakBlock', cb.x, cb.y, cb.current.size);
    Audio2.play('break', cb.x, cb.y, 0.6);
  },

  notifyDamage(b) {
    if (Time.time - this.lastDamageWarn > 60 * 20 && b.block.cls !== 'Core' && !(b instanceof ConstructBuild)) {
      this.lastDamageWarn = Time.time;
    }
  },
  coreDamaged() {
    if (Time.time - this.lastCoreWarn > 60 * 8) {
      this.lastCoreWarn = Time.time;
      UI.toast('[!] Core under attack', 2.5, true);
    }
  },

  // ------------------------------------------------------------ waves
  runWave() {
    const w = this.wave - 1;
    const sx = World.spawn.x * TS, sy = World.spawn.y * TS;
    let total = 0;
    for (const g of WAVE_GROUPS) {
      const n = groupSpawned(g, w);
      if (!n) continue;
      const type = UNITS[g.unit];
      const shield = groupShield(g, w);
      for (let i = 0; i < n; i++) {
        const spread = type.flying ? 40 : 14;
        const a = Math.random() * 360, d = Math.random() * spread;
        const u = this.spawnUnit(type, 'crux', sx + Angles.trnsx(a, d), sy + Angles.trnsy(a, d), Angles.angle(sx, sy, World.coreTile.x * TS, World.coreTile.y * TS));
        u.shield = shield;
        Fx.create('unitSpawn', u.x, u.y, 0, Teams.crux.color);
        total++;
      }
    }
    Fx.create('spawnShockwave', sx, sy, 0, null, 120);
    Audio2.play('waveSpawn', undefined, undefined, 0.7);
    // wave spawn kills player units in the drop zone
    for (const u of this.units) if (u.team === 'sharded' && !u.isFlying && Math.hypot(u.x - sx, u.y - sy) < SPAWN_SAFE_RADIUS * TS) u.kill();
    this.wave++;
    this.waveCountdown = this.waveSpacing;
    UI.toast(`Wave ${this.wave - 1}: ${total} enem${total === 1 ? 'y' : 'ies'} incoming`, 3);
  },

  enemiesAlive() { let n = 0; for (const u of this.units) if (u.team === 'crux' && !u.dead) n++; return n; },

  // ------------------------------------------------------------ main update
  update() {
    Time.time += Time.delta;
    if (Render.shakeTime > 0) { Render.shakeTime -= Time.delta; if (Render.shakeTime <= 0) Render.shakeIntensity = 0; }

    this.waveCountdown -= Time.delta;
    if (this.waveCountdown <= 0) this.runWave();

    Input.updatePlayer();

    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (!u.dead) u.update();
    }
    unitCollisions(this.units);
    for (const u of this.units) if (u.dead && u.team === 'crux' && !u.counted) { u.counted = true; this.stats.kills++; }
    this.units = this.units.filter(u => !u.dead);

    const bs = this.buildings;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b.dead) {
        b.update();
        if (b.hitTime > 0) b.hitTime = Math.max(0, b.hitTime - Time.delta / 9);
      }
    }
    Power.update();
    Bullets.update();
    Lightning.update();
    Fx.update();
    Decals.update();
    Pathfinder.update();
    SaveIO.update();

    if (this.player && this.player.dead) this.player = null;
    if (!this.player) {
      this.respawnTimer -= Time.delta;
      if (this.respawnTimer <= 0 && this.playerCore()) this.spawnPlayer(false);
    }
  },
};

// unit-unit separation (PhysicsProcess), same layer only
function unitCollisions(units) {
  const n = units.length;
  for (let i = 0; i < n; i++) {
    const a = units[i];
    if (a.dead) continue;
    for (let j = i + 1; j < n; j++) {
      const b = units[j];
      if (b.dead || a.isFlying !== b.isFlying) continue;
      const r = (a.type.hitSize + b.type.hitSize) / 2 * 0.8;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) > r || Math.abs(dy) > r) continue;
      const d = Math.hypot(dx, dy);
      if (d >= r || d === 0) continue;
      const ma = a.type.hitSize ** 2, mb = b.type.hitSize ** 2;
      const overlap = (r - d) * 0.3 * Time.delta;
      const nx = dx / d, ny = dy / d;
      const fa = mb / (ma + mb), fb = ma / (ma + mb);
      if (a.isFlying) { a.x -= nx * overlap * fa; a.y -= ny * overlap * fa; b.x += nx * overlap * fb; b.y += ny * overlap * fb; }
      else { a.physicsMove(-nx * overlap * fa, -ny * overlap * fa); b.physicsMove(nx * overlap * fb, ny * overlap * fb); }
    }
  }
}
