// Game rules (Rules.java / Rules.TeamRule): defaults match Mindustry, so the campaign and free play are unchanged; custom
// games (13e_custom.js) override them. Global multipliers combine with the team's own (Rules.unitDamage(team) etc.).

const RULE_DEFAULTS = {
  waves: true, waveTimer: true, waitEnemies: false, dropZoneRadius: 300, winWave: 0, waveSpacing: 2 * 60 * 60, initialWaveSpacing: 0, attackMode: false,
  infiniteResources: false, buildCostMultiplier: 1, buildSpeedMultiplier: 1, deconstructRefundMultiplier: 0.5,
  blockHealthMultiplier: 1, blockDamageMultiplier: 1,
  unitCap: 0, unitDamageMultiplier: 1, unitHealthMultiplier: 1, unitBuildSpeedMultiplier: 1, unitCostMultiplier: 1,
  fire: true, reactorExplosions: true, schematicsAllowed: true, weather: true, solarMultiplier: 1,
  enemyCoreBuildRadius: 400,
};
const TEAM_RULE_DEFAULTS = {
  infiniteResources: false, fillItems: false, buildAi: false, buildAiTier: 1, aiCoreSpawn: true,
  buildSpeedMultiplier: 1, blockHealthMultiplier: 1, blockDamageMultiplier: 1,
  unitDamageMultiplier: 1, unitHealthMultiplier: 1, unitBuildSpeedMultiplier: 1, unitCostMultiplier: 1,
};

const Rules = {
  cur: null,
  next: null, // rules for the next Game.newGame (set by a custom game)
  make(over = {}) {
    const r = Object.assign({}, RULE_DEFAULTS, over);
    r.teams = {};
    for (const t of ['sharded', 'crux', 'derelict']) r.teams[t] = Object.assign({}, TEAM_RULE_DEFAULTS, (over.teams || {})[t] || {});
    return r;
  },
  reset(over) { this.cur = this.make(over); },
  team(t) { return this.cur.teams[t] || TEAM_RULE_DEFAULTS; },
  infinite(t) { return this.cur.infiniteResources || this.team(t).infiniteResources; },
  buildSpeed(t) { return this.cur.buildSpeedMultiplier * this.team(t).buildSpeedMultiplier; },
  blockHealth(t) { return Math.max(this.cur.blockHealthMultiplier * this.team(t).blockHealthMultiplier, 1e-6); },
  blockDamage(t) { return this.cur.blockDamageMultiplier * this.team(t).blockDamageMultiplier; },
  unitDamage(t) { return this.cur.unitDamageMultiplier * this.team(t).unitDamageMultiplier; },
  unitHealth(t) { return Math.max(this.cur.unitHealthMultiplier * this.team(t).unitHealthMultiplier, 1e-6); },
  unitBuildSpeed(t) { return this.cur.unitBuildSpeedMultiplier * this.team(t).unitBuildSpeedMultiplier; },
  unitCost(t) { return this.cur.unitCostMultiplier * this.team(t).unitCostMultiplier; },
  // what goes into a save: only values that differ from the defaults
  serialize() {
    const out = {}, r = this.cur;
    for (const k in RULE_DEFAULTS) if (r[k] !== RULE_DEFAULTS[k]) out[k] = r[k];
    const teams = {};
    for (const t in r.teams) { const d = {}; for (const k in TEAM_RULE_DEFAULTS) if (r.teams[t][k] !== TEAM_RULE_DEFAULTS[k]) d[k] = r.teams[t][k]; if (Object.keys(d).length) teams[t] = d; }
    if (Object.keys(teams).length) out.teams = teams;
    return out;
  },
};
Rules.reset();

{
  // every new game starts from the defaults (or the custom game's rules)
  const _ng = Game.newGame;
  Game.newGame = function () { Rules.reset(Rules.next || undefined); Rules.next = null; return _ng.apply(this, arguments); };

  // ConstructBlock: infiniteResources builds instantly and free; a team with infinite resources builds free at normal speed
  const CB = ConstructBuild.prototype, _con = CB.construct, _dec = CB.deconstruct;
  CB.construct = function (builder, core, amount) {
    if (Rules.cur.infiniteResources) return _con.call(this, builder, null, 1);
    return _con.call(this, builder, Rules.team(this.team).infiniteResources ? null : core, amount);
  };
  CB.deconstruct = function (builder, core, amount) {
    if (Rules.cur.infiniteResources) return _dec.call(this, builder, null, 1);
    return _dec.call(this, builder, Rules.team(this.team).infiniteResources ? null : core, amount);
  };

  // Building.damage: amount / blockHealth(team); Unit.damage: amount / unitHealth(team)
  const _bd = Building.prototype.damage;
  Building.prototype.damage = function (amount, attacker) {
    const m = Rules.blockHealth(this.team);
    return _bd.call(this, m === 1 ? amount : amount / m, attacker);
  };
  const _ud = Unit.prototype.damage;
  Unit.prototype.damage = function (amount, pierce) {
    const m = Rules.unitHealth(this.team);
    return _ud.call(this, m === 1 ? amount : amount / m, pierce);
  };

  // Bullet damage: blockDamage(team) for turrets and other blocks, unitDamage(team) for units
  const _bc = Bullets.create;
  Bullets.create = function (type, owner, team, ...rest) {
    if (type && owner) {
      const m = owner instanceof Unit ? Rules.unitDamage(team) : owner instanceof Building ? Rules.blockDamage(team) : 1;
      if (m !== 1) type = scaledBullet(type, Math.round(m * 1000) / 1000);
    }
    return _bc.call(this, type, owner, team, ...rest);
  };

  // Rules.fire, Rules.reactorExplosions, Rules.solarMultiplier, weather on/off
  const _fc = Fires.create;
  Fires.create = function () { if (!Rules.cur.fire) return; return _fc.apply(this, arguments); };
  for (const C of [NuclearReactor, ImpactReactor]) {
    const _sm = C.prototype.shouldMeltdown;
    C.prototype.shouldMeltdown = function () { return Rules.cur.reactorExplosions && _sm.call(this); };
  }
  const _so = Object.getOwnPropertyDescriptor(SolarGenerator.prototype, 'powerOut');
  Object.defineProperty(SolarGenerator.prototype, 'powerOut', { configurable: true, get() { return _so.get.call(this) * Rules.cur.solarMultiplier; } });
  const _ws = Weather.setup;
  Weather.setup = function () { _ws.apply(this, arguments); if (!Rules.cur.weather) { this.entries = []; if (this.initCooldowns) this.initCooldowns(); } };

  // TeamRule.fillItems: the team's cores stay full
  let fillTimer = 0;
  const _gu = Game.update;
  Game.update = function () {
    _gu.apply(this, arguments);
    if ((fillTimer += Time.delta) < 30) return;
    fillTimer = 0;
    for (const t of ['sharded', 'crux']) if (Rules.team(t).fillItems) for (const b of this.byTeam[t]) if (b.block.cls === 'Core' && !b.dead)
      for (const it of ITEMS) { const want = b.block.itemCapacity - b.items[it.id]; if (want > 0) b.addItem(it, want); }
  };
}
