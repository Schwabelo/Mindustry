// Save / load. The map regenerates deterministically from its seed, so a save stores only what changes:
// buildings (with per-block state), links, units, build plans, wave progress.

const SAVE_KEY = 'mindustry-lite-save';
const SAVE_VERSION = 1;

const itemIds = arr => arr.map(it => it ? it.id : -1);
const idItem = id => id >= 0 ? ITEMS[id] : null;

// ---------------------------------------------------------------- per-class state
Building.prototype.writeState = function () { return null; };
Building.prototype.readState = function () {};

Conveyor.prototype.writeState = function () { return { i: itemIds(this.ids), x: this.xs, y: this.ys }; };
Conveyor.prototype.readState = function (s) {
  this.ids = s.i.map(idItem); this.xs = s.x.slice(); this.ys = s.y.slice(); this.len = this.ids.length;
};

Junction.prototype.writeState = function () { return { b: this.buffers.map(q => q.map(e => [e.item.id, Math.max(0, e.time + this.block.speed - Time.time)])) }; };
Junction.prototype.readState = function (s) {
  this.buffers = s.b.map(q => q.map(([id, left]) => ({ item: ITEMS[id], time: Time.time + left - this.block.speed })));
};

Router.prototype.writeState = function () { return { l: this.lastItem ? this.lastItem.id : -1 }; };
Router.prototype.readState = function (s) { this.lastItem = idItem(s.l); };

Sorter.prototype.writeState = Unloader.prototype.writeState = function () { return { c: this.sortItem ? this.sortItem.id : -1 }; };
Sorter.prototype.readState = Unloader.prototype.readState = function (s) { this.sortItem = idItem(s.c); };

ItemBridge.prototype.writeState = function () { return { buf: this.buffer.map(e => e.item.id) }; };
ItemBridge.prototype.readState = function (s) { this.buffer = s.buf.map(id => ({ item: ITEMS[id], time: Time.time })); };

Drill.prototype.writeState = function () { return { p: this.progress, t: this.timeDrilled, w: this.warmup }; };
Drill.prototype.readState = function (s) { this.progress = s.p; this.timeDrilled = s.t; this.warmup = s.w; };

GenericCrafter.prototype.writeState = function () { return { p: this.progress, w: this.warmup, t: this.totalProgress }; };
GenericCrafter.prototype.readState = function (s) { this.progress = s.p; this.warmup = s.w; this.totalProgress = s.t; };

ConsumeGenerator.prototype.writeState = function () { return { g: this.generateTime, f: this.curFlam }; };
ConsumeGenerator.prototype.readState = function (s) { this.generateTime = s.g; this.curFlam = s.f; };

Battery.prototype.writeState = function () { return { e: this.power.stored }; };
Battery.prototype.readState = function (s) { this.power.stored = s.e; };

MendProjector.prototype.writeState = function () { return { c: this.charge, u: this.useTime }; };
MendProjector.prototype.readState = function (s) { this.charge = s.c; this.useTime = s.u; };

Turret.prototype.writeState = function () { return { r: this.turretRotation, rl: this.reloadCounter }; };
Turret.prototype.readState = function (s) { this.turretRotation = s.r; this.reloadCounter = s.rl; };
ItemTurret.prototype.writeState = function () {
  return { r: this.turretRotation, rl: this.reloadCounter, a: this.ammo.map(e => [e.item.id, e.amount]) };
};
ItemTurret.prototype.readState = function (s) {
  Turret.prototype.readState.call(this, s);
  this.ammo = s.a.map(([id, n]) => ({ item: ITEMS[id], amount: n }));
  this.totalAmmo = this.ammo.reduce((t, e) => t + e.amount, 0);
};

UnitFactory.prototype.writeState = function () { return { c: this.currentPlan, p: this.progress }; };
UnitFactory.prototype.readState = function (s) { this.currentPlan = s.c; this.progress = s.p; };

CryofluidMixer.prototype.writeState = function () { return { w: this.waterIn, p: this.progress }; };
CryofluidMixer.prototype.readState = function (s) { this.waterIn = s.w; this.progress = s.p; };

Reconstructor.prototype.writeState = function () { return { pl: this.payload ? this.payload.name : null, p: this.progress, d: this.inDir }; };
Reconstructor.prototype.readState = function (s) { this.payload = s.pl ? UNITS[s.pl] : null; this.progress = s.p; this.inDir = s.d; };

Fracker.prototype.writeState = function () { return { w: this.waterIn, a: this.accumulator }; };
Fracker.prototype.readState = function (s) { this.waterIn = s.w; this.accumulator = s.a; };
ForceProjector.prototype.writeState = function () { return { b: this.buildup, k: this.broken ? 1 : 0 }; };
ForceProjector.prototype.readState = function (s) { this.buildup = s.b; this.broken = !!s.k; };

// ---------------------------------------------------------------- save / load
const SaveIO = {
  serialize() {
    const idx = new Map();
    Game.buildings.forEach((b, i) => idx.set(b, i));
    const builds = Game.buildings.map(b => {
      const o = { b: b.block.name, t: b.team, x: b.tx, y: b.ty, r: b.rotation, h: Math.round(b.health * 10) / 10 };
      if (b.items && b.total > 0 && !b.linkedCore) {
        o.it = {};
        for (let i = 0; i < ITEMS.length; i++) if (b.items[i]) o.it[i] = b.items[i];
      }
      if (b instanceof ConstructBuild) {
        o.cur = b.current.name; o.p = b.progress; o.br = b.breaking; o.con = b.consumed; o.ref = b.refunded;
      } else {
        const s = b.writeState();
        if (s) o.s = s;
      }
      if (b instanceof ItemBridge && b.link && idx.has(b.link)) o.lk = idx.get(b.link);
      if (b.liquid && b.liquid.type && b.liquid.amount > 0.01) o.lq = [b.liquid.type.id, Math.round(b.liquid.amount * 100) / 100];
      if (b.power && b.power.links.length) o.pl = b.power.links.filter(l => idx.has(l) && idx.get(l) > idx.get(b)).map(l => idx.get(l));
      return o;
    });
    const units = Game.units.filter(u => !u.dead).map(u => ({
      ty: u.type.name, t: u.team, x: Math.round(u.x * 10) / 10, y: Math.round(u.y * 10) / 10, r: Math.round(u.rotation),
      h: Math.round(u.health * 10) / 10, sh: Math.round(u.shield), p: u.isPlayer ? 1 : 0,
      st: u.stack.amount ? [u.stack.item.id, u.stack.amount] : null, bo: u.boss ? 1 : 0,
      cm: u.controller instanceof CommandAI ? { c: u.controller.command, s: [...u.controller.stances], p: u.controller.targetPos } : null,
    }));
    const p = Game.player;
    return {
      v: SAVE_VERSION, seed: Game.seed, wx: Weather.save(), wave: Game.wave, wc: Math.round(Game.waveCountdown), time: Math.round(Time.time),
      cmd: Game.command, stats: Game.stats, builds, units,
      plans: p ? p.plans.map(pl => ({ b: pl.block.name, x: pl.x, y: pl.y, r: pl.rotation, br: !!pl.breaking })) : [],
      cam: [Math.round(Render.camX), Math.round(Render.camY), Render.targetZoom], date: Date.now(),
    };
  },

  load(data) {
    if (!data || data.v !== SAVE_VERSION) throw new Error('Unsupported save version');
    Game.seed = data.seed;
    BOSS_GROUPS = genBossGroups(data.seed);
    Time.time = data.time || 0;
    Game.buildings = []; Game.units = []; Game.byTeam = { sharded: [], crux: [] }; Game.rebuildQueue = []; Fires.map.clear();
    Bullets.list = []; Bullets.lasers = []; Fx.list = []; Lightning.list = []; Decals.list = [];
    World.generate(data.seed);
    Weather.load(data.wx, data.seed);
    Game.wave = data.wave; Game.waveCountdown = data.wc; Game.command = data.cmd || 'defend';
    Game.stats = Object.assign({ built: 0, destroyed: 0, kills: 0 }, data.stats);
    Game.lastCoreWarn = -9999;

    const list = [];
    for (const o of data.builds) {
      let b;
      if (o.b === 'build') {
        const cur = BLOCKS[o.cur];
        if (!cur) { list.push(null); continue; }
        b = new ConstructBuild(null, o.t, o.x, o.y, o.r, cur, o.br);
        b.progress = o.p; b.consumed = o.con; b.refunded = o.ref;
      } else {
        const blk = BLOCKS[o.b];
        if (!blk) { list.push(null); continue; }
        b = createBuilding(blk, o.t, o.x, o.y, o.r);
      }
      b.health = Math.min(o.h, b.maxHealth);
      if (o.it && b.items) for (const [id, n] of Object.entries(o.it)) { b.items[id] = n; b.total += n; }
      if (o.lq && b.liquid) { b.liquid.type = LIQUIDS[o.lq[0]]; b.liquid.amount = o.lq[1]; }
      Game.addBuilding(b);
      list.push(b);
    }
    data.builds.forEach((o, i) => {
      const b = list[i];
      if (!b) return;
      if (o.s) b.readState(o.s);
      if (o.lk !== undefined && list[o.lk]) { b.link = list[o.lk]; list[o.lk].incoming.add(b); }
      if (o.pl) for (const j of o.pl) if (list[j] && list[j].power) Power.link(b, list[j]);
    });
    Power.dirty = true;
    Pathfinder.init();

    Game.player = null;
    for (const o of data.units) {
      const type = UNITS[o.ty];
      if (!type) continue;
      const u = Game.spawnUnit(type, o.t, o.x, o.y, o.r);
      u.health = o.h; u.shield = o.sh || 0;
      if (o.st) u.stack = { item: ITEMS[o.st[0]], amount: o.st[1] };
      if (o.bo) makeBoss(u);
      if (o.cm) { const ai = commandAI(u); ai.command = o.cm.c; ai.stances = new Set(o.cm.s || []); ai.targetPos = o.cm.p || null; }
      if (o.p) { u.controller = 'player'; Game.player = u; }
    }
    if (Game.player) Game.player.plans = (data.plans || []).filter(pl => BLOCKS[pl.b]).map(pl => ({ block: BLOCKS[pl.b], x: pl.x, y: pl.y, rotation: pl.r, breaking: pl.br }));
    else Game.respawnTimer = 30;
    if (data.cam) { Render.camX = data.cam[0]; Render.camY = data.cam[1]; Render.zoom = Render.targetZoom = data.cam[2] || 3.5; }
    World.prerenderAround(Math.round(Render.camX / TS), Math.round(Render.camY / TS), 2);
    Input.reset();
    UI.onNewGame();
  },

  // ---- storage
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
  saveInfo() {
    try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); return d ? { wave: d.wave, date: d.date, seed: d.seed } : null; } catch (e) { return null; }
  },
  saveLocal(silent) {
    if (Game.state !== 'playing' && Game.state !== 'paused') return false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
      if (!silent) UI.toast('Game saved', 1.5);
      return true;
    } catch (e) {
      if (!silent) UI.toast('Could not save in this browser. Use "Export save" instead.', 4, true);
      return false;
    }
  },
  loadLocal() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      this.load(d);
      return true;
    } catch (e) {
      console.error(e);
      UI.toast('Could not load save: ' + e.message, 4, true);
      return false;
    }
  },
  clearLocal() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } },

  exportFile() {
    const blob = new Blob([JSON.stringify(this.serialize())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mindustry-lite-wave${Game.wave}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importFile(onDone) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      f.text().then(t => { this.load(JSON.parse(t)); onDone && onDone(); })
        .catch(e => UI.toast('Could not import: ' + e.message, 4, true));
    };
    inp.click();
  },

  // autosave every minute of game time, and when the tab is hidden
  autosaveTimer: 0,
  update() {
    this.autosaveTimer += Time.delta;
    if (this.autosaveTimer >= 60 * 60) { this.autosaveTimer = 0; this.saveLocal(true); }
  },
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (Game.state === 'playing' || Game.state === 'paused')) SaveIO.saveLocal(true);
});
window.addEventListener('beforeunload', () => {
  if (Game.state === 'playing' || Game.state === 'paused') SaveIO.saveLocal(true);
});
