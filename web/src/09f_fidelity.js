// Fixes that need Game (see 08z_fidelity.js for content fixes).
// ForceFieldAbility.created: the field starts at full strength
{
  const _su = Game.spawnUnit;
  Game.spawnUnit = function (type, team, x, y, rot) {
    const u = _su.apply(this, arguments);
    for (const a of type.abilities || []) if (a.type === 'forceField') u.shield = Math.max(u.shield || 0, a.max);
    return u;
  };
}

// UnitComp.destroy: a unit's cargo explodes with it (wave units carry blast compound / pyratite)
{
  const _kill = Unit.prototype.kill;
  Unit.prototype.kill = function () {
    const st = this.stack;
    if (!this.dead && st && st.item && st.amount > 0) {
      const it = st.item, n = st.amount;
      dynamicExplosion(this.x, this.y, it.flammability * n / 1.9, 2 + it.explosiveness * n * 1.53, (it.charge || 0) * Math.pow(n, 1.11) * 160,
        (this.type.hitSize + (this.type.legLength || 0) / 1.7) / 2, it.flammability > 1);
    }
    return _kill.apply(this, arguments);
  };
}

// UnitComp.update: units of other teams are pushed out of drop zones
{
  const _gu = Game.update;
  Game.update = function () {
    _gu.apply(this, arguments);
    if (this.state !== 'playing' || !World.spawns.length) return;
    for (const u of this.units) {
      if (u.dead || u.team === 'crux') continue;
      const rel = DROP_ZONE_RADIUS + u.type.hitSize / 2 + 1;
      for (const sp of World.spawns) {
        const sx = sp.x * TS, sy = sp.y * TS, d = Math.hypot(u.x - sx, u.y - sy);
        if (d < rel && d > 0) {
          const len = (0.1 + 1 - d / rel) * 0.45 * Time.delta;
          u.vx += (u.x - sx) / d * len; u.vy += (u.y - sy) / d * len;
        }
      }
    }
  };
}

// delayed actions (Time.run)
Game.laterList = [];
Game.later = function (ticks, fn) { this.laterList.push({ t: Time.time + ticks, fn }); };
{
  const _gu = Game.update;
  Game.update = function () {
    _gu.apply(this, arguments);
    if (this.laterList.length) {
      const due = this.laterList.filter(e => e.t <= Time.time);
      this.laterList = this.laterList.filter(e => e.t > Time.time);
      for (const e of due) e.fn();
    }
  };
  const _ng = Game.newGame;
  Game.newGame = function () { this.laterList = []; return _ng.apply(this, arguments); };
}
// Teams.scheduleDerelict: the block turns derelict; 20% of them explode within 6 s
function scheduleDerelict(b) {
  if (b.dead) return;
  Game.removeBuilding(b); b.team = 'derelict'; Game.addBuilding(b);
  if (Math.random() < 0.2) Game.later(Math.random() * 360, () => { if (!b.dead && b.team === 'derelict') b.damage(1e9); });
  Pathfinder.dirty = true; Power.dirty = true;
}
// rules.coreDestroyClear: when an enemy core dies, its surroundings (enemyCoreBuildRadius) turn derelict, except near
// another of its cores (Teams.timeDestroy)
{
  const _db = Game.destroyBuilding;
  Game.destroyBuilding = function (b) {
    const r = _db.apply(this, arguments);
    if (b.team === 'crux' && b.block.cls === 'Core' && typeof Sectors !== 'undefined' && Sectors.current) {
      const others = this.byTeam.crux.filter(c => c !== b && c.block.cls === 'Core' && !c.dead);
      for (const o of [...this.byTeam.crux]) {
        if (o.dead || Math.hypot(o.x - b.x, o.y - b.y) > ENEMY_CORE_BUILD_RADIUS) continue;
        if (others.some(c => Math.hypot(c.x - o.x, c.y - o.y) <= ENEMY_CORE_BUILD_RADIUS)) continue;
        scheduleDerelict(o);
      }
    }
    return r;
  };
}

// BlockBuildEndEvent: a rebuilt block clears its ghost from the rebuild queue
{
  const _fc = Game.finishConstruct;
  Game.finishConstruct = function (cb) {
    const r = _fc.apply(this, arguments);
    if (this.rebuildQueue.length && cb.current) this.rebuildQueue = this.rebuildQueue.filter(g => !(g.x === cb.tx && g.y === cb.ty && g.block === cb.current));
    return r;
  };
}
