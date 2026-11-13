// The campaign keeps running while you're away (Universe.runTurn, SectorInfo, LaunchLoadoutDialog):
// - every sector you play measures its production (core item change per second, averaged over a minute)
// - every 2 minutes of play (a turn), every other base adds its production to its stored core items (capped by capacity)
// - captured bases next to enemy-held sectors can be invaded: 1% chance per turn per nearby enemy base (after 20 minutes),
//   the base then needs defending up to a higher wave and is frozen (no production) until you do
// - research draws on the stored items of every base, the current sector's core last (ResearchDialog)
// - launching to a new sector takes a core and resources from a base (up to half the core's capacity per item)

Object.assign(Sectors, {
  prodStats: {}, lastCoreItems: null, prodTimer: 0, turnTimer: 0,
  bi(name) { return (this.info[name] = this.info[name] || { exports: {} }); },

  // ------------------------------------------------------------ production of the sector being played
  measureProduction() {
    const core = Game.playerCore();
    if (!core) return;
    const now = Array.from(core.items);
    if (this.lastCoreItems) for (const it of ITEMS) {
      const st = this.prodStats[it.name] || (this.prodStats[it.name] = this.newStat(0));
      st.counter += now[it.id] - this.lastCoreItems[it.id];
    }
    this.lastCoreItems = now;
    for (const st of Object.values(this.prodStats)) {
      st.means.push(st.counter); st.means.shift(); st.counter = 0;
      st.mean = st.means.reduce((a, b) => a + b, 0) / st.means.length;
    }
  },
  snapshotBase() {
    const cur = this.current, core = Game.playerCore();
    if (!cur || !core) return;
    const b = this.bi(cur.name);
    b.items = {}; for (const it of ITEMS) if (core.items[it.id]) b.items[it.name] = core.items[it.id];
    b.capacity = core.storageCapacity ? core.storageCapacity() : core.block.itemCapacity;
    b.core = core.block.name;
    b.wave = Game.wave;
    b.production = {};
    for (const [k, st] of Object.entries(this.prodStats)) if (Math.abs(st.mean) > 0.001) b.production[k] = Math.round(st.mean * 1000) / 1000;
  },
  // apply the stored core inventory when a base is loaded again (it may have produced or paid for research meanwhile)
  restoreBase() {
    const cur = this.current, core = Game.playerCore();
    const b = cur && this.info[cur.name];
    if (!core || !b || !b.items) return;
    for (const it of ITEMS) core.items[it.id] = 0;
    core.total = 0;
    for (const [k, v] of Object.entries(b.items)) if (Items[k] && v > 0) core.addItem(Items[k], v);
  },

  // ------------------------------------------------------------ turns
  neighbours(name) {
    const m = this.index[name];
    return this.order.filter(n => n !== name && (this.index[n].parent === name || n === m.parent));
  },
  enemyBase(n) { return this.index[n].attack && !this.captured.has(n) && !this.bases.has(n); },
  runTurn() {
    const cur = this.current && this.current.name;
    for (const name of this.bases) {
      if (name === cur) continue;
      const b = this.bi(name);
      if (b.attacked) continue; // attacked sectors are frozen in time
      b.minutes = (b.minutes || 0) + 2;
      if (b.production && b.items) {
        for (const [k, rate] of Object.entries(b.production)) {
          b.items[k] = Mathf.clamp((b.items[k] || 0) + Math.round(rate * 120), 0, b.capacity || 4000);
        }
      }
      // queue random invasions (Universe.runTurn)
      const m = this.maps && this.maps[name] ? this.map(name) : null;
      if (this.captured.has(name) && b.minutes > 20 && m && m.spawns.length) {
        const count = this.neighbours(name).filter(n => this.enemyBase(n)).length;
        if (count > 0 && Math.random() < 0.01 * (0.8 + (count - 1) * 0.3)) {
          const winWave = Math.max(this.index[name].winWave || 0, b.wave || 1) + (2 + Math.floor(Math.random() * 3)) * 5;
          b.attacked = { winWave };
          UI.toast(`${this.title(name)} is under attack! Defend it up to wave ${winWave}.`, 6, true);
          Audio2.play('waveSpawn', undefined, undefined, 0.6);
        }
      }
    }
    this.save();
  },

  // ------------------------------------------------------------ pooled items (research)
  pooled(item) {
    let n = 0;
    const cur = this.current && Game.state !== 'title' ? this.current.name : null;
    for (const name of this.bases) if (name !== cur) n += (this.info[name] && this.info[name].items && this.info[name].items[item.name]) || 0;
    const core = cur ? Game.playerCore() : null;
    return n + (core ? core.items[item.id] : 0);
  },
  takePooled(item, amount, core) {
    let left = amount;
    const cur = this.current && Game.state !== 'title' ? this.current.name : null;
    for (const name of this.bases) {
      if (name === cur || left <= 0) continue;
      const items = this.info[name] && this.info[name].items;
      const have = (items && items[item.name]) || 0;
      const t = Math.min(have, left);
      if (t > 0) { items[item.name] = have - t; left -= t; }
    }
    if (left > 0 && core) { const t = Math.min(core.items[item.id], left); if (t > 0) { core.removeItem(item, t); left -= t; } }
    this.save();
    return amount - left;
  },

  // ------------------------------------------------------------ launching (LaunchLoadoutDialog)
  launchSources() { return [...this.bases].filter(n => !(this.info[n] && this.info[n].attacked)); },
  sourceItems(src) {
    if (this.current && this.current.name === src && Game.state !== 'title' && Game.playerCore()) {
      const core = Game.playerCore(), o = {};
      for (const it of ITEMS) if (core.items[it.id]) o[it.name] = core.items[it.id];
      return o;
    }
    return (this.info[src] && this.info[src].items) || {};
  },
  sourceCore(src) {
    if (this.current && this.current.name === src && Game.state !== 'title' && Game.playerCore()) return Game.playerCore().block;
    return BLOCKS[(this.info[src] && this.info[src].core) || 'core-shard'];
  },
  needsLoadout(name) { return name !== 'groundZero'; }, // groundZero.overrideLaunchDefaults: no launch loadout
  loadoutPlan(src, coreName, max) {
    const core = BLOCKS[coreName], have = this.sourceItems(src);
    const cap = Math.floor(0.5 * core.itemCapacity); // Planet.launchCapacityMultiplier (Serpulo 0.5)
    const schem = {}; for (const r of core.requirements) schem[r.item.name] = r.amount;
    const res = {};
    if (max) for (const it of ITEMS) { const v = Mathf.clamp((have[it.name] || 0) - (schem[it.name] || 0), 0, cap); if (v > 0) res[it.name] = v; }
    const total = Object.assign({}, schem);
    for (const [k, v] of Object.entries(res)) total[k] = (total[k] || 0) + v;
    const valid = Object.entries(total).every(([k, v]) => (have[k] || 0) >= v);
    return { core, schem, res, total, valid, have };
  },
  payLaunch(src, total) {
    if (this.current && this.current.name === src && Game.state !== 'title' && Game.playerCore()) {
      const core = Game.playerCore();
      for (const [k, v] of Object.entries(total)) if (Items[k]) core.removeItem(Items[k], Math.min(v, core.items[Items[k].id]));
    } else {
      const items = this.bi(src).items || (this.bi(src).items = {});
      for (const [k, v] of Object.entries(total)) items[k] = Math.max(0, (items[k] || 0) - v);
    }
    this.save();
  },
});

{
  // research spends pooled items
  Research.spend = function (n, core) {
    if (this.has(n.name) || this.missing(n).length || n.type === 'i' || n.type === 'l') return false;
    const p = this.paid[n.name] || (this.paid[n.name] = {});
    let spent = 0;
    for (const r of n.req) {
      const need = r.amount - (p[r.item.name] || 0);
      const take = Sectors.current ? Sectors.takePooled(r.item, need, core) : (core ? Math.min(need, core.items[r.item.id]) : 0);
      if (!Sectors.current && take > 0) core.removeItem(r.item, take);
      if (take > 0) { p[r.item.name] = (p[r.item.name] || 0) + take; spent += take; }
    }
    const complete = n.req.every(r => (p[r.item.name] || 0) >= r.amount);
    if (complete) this.unlock(n.name); else this.save();
    return complete || spent > 0 ? (complete ? 'done' : 'spent') : false;
  };

  // measurement and turns while a sector is played
  const _gu = Game.update;
  Game.update = function () {
    _gu.apply(this, arguments);
    if (this.state !== 'playing' || !Sectors.current) return;
    if ((Sectors.prodTimer += Time.delta) >= 60) { Sectors.prodTimer = 0; Sectors.measureProduction(); }
    if ((Sectors.turnTimer += Time.delta) >= 2 * 60 * 60) { Sectors.turnTimer = 0; Sectors.runTurn(); }
  };
  // whenever the current sector is saved or stored, record its inventory and production
  const _fe = Sectors.flushExports;
  Sectors.flushExports = function () { _fe.apply(this, arguments); this.snapshotBase(); this.save(); };
  const _rs = Sectors.resetStats;
  Sectors.resetStats = function () {
    _rs.apply(this, arguments);
    this.prodStats = {}; this.lastCoreItems = null;
    const b = this.current && this.info[this.current.name];
    if (b && b.production) for (const [k, v] of Object.entries(b.production)) this.prodStats[k] = this.newStat(v);
    this.restoreBase();
  };
  // invaded bases: waves come back with a higher win wave; holding it captures the sector again
  const _ar = Sectors.applyRules;
  Sectors.applyRules = function (m) {
    _ar.call(this, m);
    const att = this.info[m.name] && this.info[m.name].attacked;
    if (att) {
      Game.attackMode = false; Game.winWave = att.winWave; Game.waveStatus = null;
      if (!(Game.waveCountdown < Infinity)) Game.waveCountdown = Game.waveSpacing * 2;
    }
  };
  const _up = Sectors.update;
  Sectors.update = function () {
    const m = this.current, att = m && this.info[m.name] && this.info[m.name].attacked;
    if (att && Game.state === 'playing' && Game.wave >= att.winWave && Game.enemiesAlive() === 0) {
      delete this.info[m.name].attacked; this.info[m.name].minutes = 0; this.save();
      this.setCaptured(true);
      UI.toast(`Invasion of ${this.title(m.name)} repelled!`, 5);
      Audio2.play('uiUnlock');
      return;
    }
    if (att) { if ((this.checkTimer += Time.delta) >= 30) { this.checkTimer = 0; this.fillEnemyCores(); } return; }
    return _up.apply(this, arguments);
  };
  const _setCap = Sectors.setCaptured;
  Sectors.setCaptured = function () {
    const m = this.current;
    if (m && this.info[m.name] && this.info[m.name].attacked) return; // still under attack: keep the waves going
    return _setCap.apply(this, arguments);
  };

  // launching to a sector without a base: pay the loadout, start with the chosen core and resources
  const _launch = Sectors.launch;
  Sectors.launch = async function (name, opts = {}) {
    const lo = opts.loadout;
    if (lo && !this.bases.has(name)) this.payLaunch(lo.source, lo.plan.total);
    const ok = await _launch.call(this, name, opts);
    if (ok && lo && !this.bases.has(name) && Game.playerCore()) {
      let core = Game.playerCore();
      if (core.block !== lo.plan.core) {
        // the loadout core replaces the map's core (Schematics.placeLaunchLoadout clears its footprint)
        const tx = core.tx, ty = core.ty, blk = lo.plan.core;
        Game.removeBuilding(core);
        for (let dy = 0; dy < blk.size; dy++) for (let dx = 0; dx < blk.size; dx++) {
          const o = World.buildAt(tx + blk.sizeOffset + dx, ty + blk.sizeOffset + dy);
          if (o) Game.removeBuilding(o);
        }
        core = createBuilding(blk, 'sharded', tx, ty, 0);
        Game.addBuilding(core);
        Power.dirty = true; Pathfinder.init();
      }
      for (const it of ITEMS) core.items[it.id] = 0;
      core.total = 0;
      for (const [k, v] of Object.entries(lo.plan.res)) if (Items[k]) core.addItem(Items[k], v);
      this.snapshotBase();
      this.save();
    }
    return ok;
  };
}

// a base that is thrown away or lost forgets its stored inventory
{
  const _db = Sectors.dropBase;
  Sectors.dropBase = function (name) {
    const b = this.info[name];
    if (b) { delete b.items; delete b.production; delete b.attacked; delete b.minutes; delete b.core; }
    return _db.apply(this, arguments);
  };
}
