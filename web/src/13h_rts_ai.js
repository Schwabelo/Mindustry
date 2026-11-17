// RtsAI (rules.teams.<team>.rtsAi): every 2 seconds the AI team groups its idle units into squads (units within ~60 of
// each other), defends damaged buildings (the core first) by going after the attacker, and otherwise sends squads of at
// least rtsMinSquad at the enemy generator / factory / core / battery / drill that it estimates it can win against:
// turrets and units along the way are weighed by health and DPS (estimateStats). Weak squads wait for reinforcements
// unless the attack weight is at least rtsMinWeight or the squad is at rtsMaxSquad / the unit cap. Its units run
// CommandAI instead of the plain wave AI, and its cores spawn one core unit each.

const RTS_FLAGS = ['generator', 'factory', 'core', 'battery', 'drill'];
for (const b of Object.values(BLOCKS)) if (b.cls === 'Drill' && !b.flags.includes('drill')) b.flags = b.flags.concat(['drill']); // BlockFlag.drill

// BulletType.estimateDPS / Weapon.dps / UnitType.estimateDps / Turret.estimateDps
const _bulletDps = new Map();
function bulletDps(t) {
  if (!t) return 0;
  if (_bulletDps.has(t)) return _bulletDps.get(t);
  _bulletDps.set(t, 0);
  let sum = ((t.damage || 0) + (t.splashDamage || 0) * 0.75) * (t.pierce ? (t.pierceCap === -1 || t.pierceCap === undefined ? 2 : Mathf.clamp(t.pierceCap, 1, 2)) : 1);
  if (t.fragBullet && t.fragBullet !== t) sum += bulletDps(t.fragBullet) * (t.fragBullets || 0) / 2;
  _bulletDps.set(t, sum);
  return sum;
}
function unitDps(type) {
  if (type._dps !== undefined) return type._dps;
  let d = 0;
  for (const w of type.weapons || []) d += bulletDps(w.bullet) / Math.max(w.reload || 1, 1) * (w.shots || 1) * 60 * (w.mirror ? 2 : 1);
  if (type.crawler) d /= 15; // suicide units count for little
  return (type._dps = d);
}
function turretDps(t) {
  const ammo = t.peekAmmo ? t.peekAmmo() : null;
  if (!ammo) return 0;
  const eff = t.block.hasPower && t.block.consumesPower ? t.efficiency : 1;
  return (t.block.shots || 1) / Math.max(t.block.reload || 1, 1) * 60 * bulletDps(ammo) * eff;
}
function segDist(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 ? Mathf.clamp(((px - x1) * dx + (py - y1) * dy) / l2) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// CommandAI pieces the RTS AI uses (hasCommand, isAttacking, commandTarget with stopAtTarget)
CommandAI.prototype.hasCommand = function () { return this.targetPos != null; };
CommandAI.prototype.isAttacking = function (u) { const t = this.target; return !!t && !t.dead && Math.hypot(t.x - u.x, t.y - u.y) < u.range + 10; };
{
  const _order = CommandAI.prototype.order;
  CommandAI.prototype.order = function () { this.stopAtTarget = false; return _order.apply(this, arguments); };
  const _upd = CommandAI.prototype.update;
  CommandAI.prototype.update = function (u) {
    _upd.call(this, u);
    // stopAtTarget: used for defending - stop chasing once the target is in range
    if (this.stopAtTarget && this.attackTarget && Math.hypot(this.attackTarget.x - u.x, this.attackTarget.y - u.y) < u.range * 0.8 - 1) { this.attackTarget = null; this.stopAtTarget = false; }
  };
}

const RtsAI = {
  state: {},
  reset() { this.state = {}; },
  st(team) { return this.state[team] || (this.state[team] = { timer: Math.random() * 120, spawn: 0, damaged: new Set() }); },

  update(team) {
    const st = this.st(team);
    st.spawn += Time.delta;
    if ((st.timer += Time.delta) < 120) return;
    st.timer = 0;
    this.assignSquads(team);
    this.checkBuilding(team);
  },

  // one core unit per core
  checkBuilding(team) {
    const tr = Rules.team(team), st = this.st(team);
    if (!tr.aiCoreSpawn || st.spawn < 60 * 7) return;
    const cores = Game.byTeam[team].filter(b => b.block.cls === 'Core' && !b.dead);
    if (!cores.length) return;
    st.spawn = 0;
    const type = UNITS[cores[0].block.unitType] || UNITS.alpha;
    if (Game.units.filter(u => u.team === team && !u.dead && u.type === type).length >= cores.length) return;
    const c = cores[Math.floor(Math.random() * cores.length)];
    const u = Game.spawnUnit(type, team, c.x, c.y);
    u.controller = new BuilderAI(true, 400);
    Fx.create('unitSpawn', c.x, c.y, 0, Teams[team].color);
  },

  assignSquads(team) {
    const st = this.st(team);
    const units = Game.units.filter(u => u.team === team && !u.dead);
    const used = new Set();
    this.assigned = new Set();
    this.damaged = [...st.damaged].filter(b => !b.dead);
    st.damaged.clear();
    for (const unit of units) {
      if (used.has(unit)) continue;
      used.add(unit);
      const ai = unit.controller;
      if (!(ai instanceof CommandAI) || ai.hasCommand() || ai.isAttacking(unit)) continue;
      const squad = [unit], stack = [unit], rad = 60 + unit.type.hitSize * 1.5, mobilized = !!unit.flag;
      while (stack.length) {
        const next = stack.pop();
        for (const u of units) {
          if (used.has(u) || !(u.controller instanceof CommandAI) || u.controller.hasCommand() || !!u.flag !== mobilized) continue;
          const reach = rad / 2 + u.type.hitSize / 2;
          if (Math.abs(u.x - next.x) > reach || Math.abs(u.y - next.y) > reach) continue;
          used.add(u); squad.push(u); stack.push(u);
        }
      }
      this.handleSquad(team, squad);
    }
  },

  handleSquad(team, units) {
    if (!units.length) return false;
    const tr = Rules.team(team), first = units[0], naval = !!first.type.naval;
    let health = 0, dps = 0, ax = 0, ay = 0, targetAir = true, targetGround = true;
    for (const u of units) {
      if (!u.type.targetAir) targetAir = false;
      if (u.type.targetGround === false) targetGround = false;
      ax += u.x; ay += u.y; health += u.health; dps += unitDps(u.type);
    }
    ax /= units.length; ay /= units.length;

    // something of ours is under attack: defend it (the core immediately)
    let defend = null, defendingCore = false;
    if (this.damaged.length && !naval) {
      let best = null, bd = Infinity;
      for (const b of this.damaged) { const d = b.block.cls === 'Core' ? -999999 : Math.hypot(b.x - ax, b.y - ay); if (d < bd) { bd = d; best = b; } }
      if (best && (best.block.cls === 'Core' || units.length >= tr.rtsMinSquad || first.flag || Math.hypot(best.x - ax, best.y - ay) < 1000)) {
        defend = best;
        defendingCore = best.block.cls === 'Core';
      }
    }
    let defendPos = null, defendTarget = null;
    if (defend) {
      // the closest enemy unit near it that the squad can hit, otherwise the enemy turret covering it
      let bd = 350;
      for (const o of Game.units) {
        if (o.dead || o.team === team || o.team === 'derelict') continue;
        if (o.isFlying ? !targetAir : !targetGround) continue;
        const d = Math.hypot(o.x - defend.x, o.y - defend.y);
        if (d < bd) { bd = d; defendTarget = o; }
      }
      if (defendTarget) defendPos = [defendTarget.x, defendTarget.y];
      else {
        let md = Infinity;
        for (const b of Game.buildings) {
          if (b.dead || b.team === team || b.team === 'derelict' || !(b instanceof Turret)) continue;
          const d = Math.hypot(b.x - defend.x, b.y - defend.y);
          if (d <= b.range && d < md) { md = d; defendTarget = b; }
        }
      }
    }
    const anyDefend = !!(defendPos || defendTarget);
    const build = anyDefend ? null : this.findTarget(team, ax, ay, units.length, dps, health, !first.flag, first.isFlying, naval);
    if (build || anyDefend) {
      for (const u of units) {
        const ai = u.controller;
        if (!(ai instanceof CommandAI) || ai.hasCommand()) continue;
        if (defendPos) ai.order(defendPos.slice(), null, false);
        else { ai.order(null, defendTarget || build, false); ai.stopAtTarget = !!defendTarget; }
        if (!defendingCore) u.flag = 1; // mobilized: easier to send out again
      }
    }
    return anyDefend;
  },

  findTarget(team, x, y, total, dps, health, checkWeight, air, naval) {
    const tr = Rules.team(team);
    if (total < tr.rtsMinSquad) return null;
    let targets = Game.buildings.filter(b => !b.dead && b.team !== team && b.team !== 'derelict' && !(b instanceof ConstructBuild) &&
      (naval ? b.block.cls === 'Core' : RTS_FLAGS.some(f => b.block.flags.includes(f) || (f === 'core' && b.block.cls === 'Core'))) && !this.assigned.has(b));
    if (!targets.length) return null;
    // check at most 15 random targets
    for (let i = targets.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [targets[i], targets[j]] = [targets[j], targets[i]]; }
    targets = targets.slice(0, 15);
    const w = new Map(targets.map(b => [b, this.estimateStats(team, x, y, b.x, b.y, dps, health, air)]));
    let result = null, best = Infinity;
    for (const b of targets) {
      const score = (1 - w.get(b)) + Math.hypot(b.x - x, b.y - y) / 10000;
      if (score < best) { best = score; result = b; }
    }
    const weight = w.get(result);
    if (checkWeight && weight < tr.rtsMinWeight && total < tr.rtsMaxSquad && total < Game.unitCap(team)) return null;
    this.assigned.add(result);
    return result;
  },

  // how well the squad would do against the turrets and units along the way: own time-to-die / their time-to-die
  estimateStats(team, fx, fy, x, y, selfDps, selfHealth, air) {
    let hp = 0, dp = 0;
    const extra = 50;
    for (const t of Game.buildings) {
      if (t.dead || t.team === team || t.team === 'derelict' || !(t instanceof Turret)) continue;
      const tb = t.block, hits = air ? tb.targetAir !== false : tb.targetGround !== false;
      if (!hits || segDist(fx, fy, x, y, t.x, t.y) > t.range + extra) continue;
      hp += t.health; dp += turretDps(t);
    }
    const x1 = Math.min(fx, x) - 280, x2 = Math.max(fx, x) + 280, y1 = Math.min(fy, y) - 280, y2 = Math.max(fy, y) + 280;
    for (const o of Game.units) {
      if (o.dead || o.team === team || o.team === 'derelict' || o.x < x1 || o.x > x2 || o.y < y1 || o.y > y2) continue;
      if (segDist(fx, fy, x, y, o.x, o.y) > (o.range || 0) + extra) continue;
      hp += o.health; dp += unitDps(o.type);
    }
    const timeDestroyOther = selfDps < 0.001 ? Infinity : hp / selfDps;
    const timeDestroySelf = dp === 0 ? Infinity : selfHealth / dp;
    if (timeDestroyOther === Infinity || timeDestroySelf === 0) return 0;
    if (timeDestroySelf === Infinity || timeDestroyOther === 0) return 100000;
    return timeDestroySelf / timeDestroyOther;
  },
};

{
  // RTS teams' units take orders (CommandAI) instead of running the wave AI
  const _mc = makeController;
  makeController = function (type, team) {
    if (team !== 'sharded' && team !== 'derelict' && Rules.team(team).rtsAi && !['alpha', 'beta', 'gamma'].includes(type.name)) {
      const ai = new CommandAI({ type });
      if (ai.command === 'mine' || ai.command === 'assist') ai.command = 'move';
      return ai;
    }
    return _mc(type, team);
  };
  // BuildDamageEvent: remember what got hit
  const _bd = Building.prototype.damage;
  Building.prototype.damage = function (amount, attacker) {
    if (this.team !== 'sharded' && this.team !== 'derelict' && !this.dead && Rules.team(this.team).rtsAi) RtsAI.st(this.team).damaged.add(this);
    return _bd.apply(this, arguments);
  };
  const _ng = Game.newGame;
  Game.newGame = function () { RtsAI.reset(); return _ng.apply(this, arguments); };
  const _load = SaveIO.load;
  SaveIO.load = function () {
    RtsAI.reset();
    const r = _load.apply(this, arguments);
    for (const u of Game.units) if (u.team !== 'sharded' && u.team !== 'derelict' && Rules.team(u.team).rtsAi && !(u.controller instanceof CommandAI) && !(u.controller instanceof BuilderAI)) u.controller = makeController(u.type, u.team);
    return r;
  };
  const _gu = Game.update;
  Game.update = function () {
    _gu.apply(this, arguments);
    for (const t of ['crux']) if (Rules.team(t).rtsAi) RtsAI.update(t);
  };
}
