// Content fixes that apply across many blocks (checked against core/src/mindustry/**):
// - Wall (and Door): buildCostMultiplier = 6 unless the block sets its own
// - Block.canOverdrive = false: cores, batteries, power nodes, conduits, liquid routers/tanks/bridges, logic memory/displays,
//   overflow gates, walls, landing pads
// (material-scaled default health lives in defBlock, 03_content.js)

for (const b of Object.values(BLOCKS)) {
  if ((b.cls === 'Wall' || b.cls === 'Door') && b.buildCostMultiplier === 1) { b.buildCostMultiplier = 6; b.buildTime *= 6; }
}

function canOverdrive(b) {
  return !(b instanceof Core || b instanceof Battery || b instanceof PowerNode || b instanceof Conduit || b instanceof LiquidRouter
    || b instanceof LiquidBridge || b instanceof MemoryBlock || b instanceof LogicDisplay || b instanceof OverflowGate || b instanceof Wall
    || (typeof LandingPad !== 'undefined' && b instanceof LandingPad));
}

// Turret aiming values from Blocks.java (unset ones use the Turret defaults: rotateSpeed 5, shootCone 8, shootY = size * 4)
Object.assign(BLOCKS.wave, { rotateSpeed: 5 });
Object.assign(BLOCKS.tsunami, { rotateSpeed: 5 });
Object.assign(BLOCKS.scorch, { rotateSpeed: 5 });
Object.assign(BLOCKS.fuse, { rotateSpeed: 5 });
Object.assign(BLOCKS.ripple, { rotateSpeed: 5, shootCone: 8, scaleLifetimeOffset: 0.1 });
Object.assign(BLOCKS.lancer, { shootCone: 8 });
Object.assign(BLOCKS.spectre, { shootY: 16 });

// ItemTurret / PowerTurret.limitRange(margin): ammo lifetime = (range + rangeChange + margin + extraRangeMargin + 10) / speed
for (const [name, margin] of [['duo', 5], ['scatter', 2], ['hail', 0], ['swarmer', 5], ['salvo', 9], ['cyclone', 9], ['spectre', 9]]) {
  const t = BLOCKS[name];
  for (const bt of Object.values(t.ammo || {})) bt.lifetime = (t.range + (bt.rangeChange || 0) + margin + (bt.extraRangeMargin || 0) + 10) / bt.speed;
}

// StatusComp.apply with StatusEffects.java transitions:
// - an effect already present just takes the longer duration
// - opposites (burning <-> wet/freezing, melting <-> wet/freezing): the existing one loses half the new duration; if it runs
//   out, the new effect replaces it with its full duration
// - affinities: tarred + burning/melting -> burning/melting for the summed time; burning/melting + tarred -> 8 armor-piercing
//   damage, capped at 300/200 ticks; wet + shocked -> 14 damage; freezing + blasted -> 18 armor-piercing damage
// - shocked and blasted are reactive: they never stay on a unit, they only trigger reactions
STATUS.shocked = { speedMultiplier: 1, healthMultiplier: 1, color: Pal.lancerLaser, reactive: true, noFx: true };
STATUS.blasted.reactive = true;
const STATUS_OPPOSITES = { burning: ['wet', 'freezing'], melting: ['wet', 'freezing'], wet: ['burning', 'melting'], freezing: ['burning', 'melting'] };
Unit.prototype.statusTime = function (n) { return n === 'burning' ? this.burnTime : ((this.statuses && this.statuses[n]) || 0); };
Unit.prototype.setStatusTime = function (n, t) {
  if (n === 'burning') { this.burnTime = Math.max(0, t); return; }
  if (t > 0) this.statuses[n] = t; else delete this.statuses[n];
};
Unit.prototype.applyStatus = function (name, duration) {
  if (!this.statuses) this.statuses = {};
  if (name === 'burning' && this.type.immuneBurning) return;
  if (this.statusTime(name) > 0) { this.setStatusTime(name, Math.max(this.statusTime(name), duration)); return; }
  const present = Object.keys(this.statuses).concat(this.burnTime > 0 ? ['burning'] : []);
  for (const ex of present) {
    const t = this.statusTime(ex);
    if (t <= 0) continue;
    if ((STATUS_OPPOSITES[ex] || []).includes(name)) {
      const left = t - duration * 0.5;
      if (left <= 0) { this.setStatusTime(ex, 0); this.setStatusTime(name, duration); } else this.setStatusTime(ex, left);
      return;
    }
    if (ex === 'tarred' && (name === 'burning' || name === 'melting')) { this.setStatusTime('tarred', 0); this.setStatusTime(name, t + duration); return; }
    if ((ex === 'burning' || ex === 'melting') && name === 'tarred') {
      this.damage(8, true);
      this.setStatusTime(ex, Math.min(duration + t, ex === 'burning' ? 300 : 200));
      return;
    }
    if (ex === 'wet' && name === 'shocked') { this.damage(14); return; }
    if (ex === 'freezing' && name === 'blasted') { this.damage(18, true); return; }
  }
  if (STATUS[name] && STATUS[name].reactive) return;
  this.setStatusTime(name, duration);
};

if (BLOCKS.cyclone.ammo['blast-compound']) BLOCKS.cyclone.ammo['blast-compound'].explodeRange = 30; // FlakBulletType default

// Status damage multipliers (overdrive 1.4, overclock 1.15): bullets fired by a unit under them use a scaled copy of the
// bullet type (guardians keep their own weapon copies, so 'boss' is left out here)
STATUS.overclock = { speedMultiplier: 1.15, damageMultiplier: 1.15, reloadMultiplier: 1.25, healthMultiplier: 1, color: Pal.accent };
STATUS.overdrive = { speedMultiplier: 1.15, damageMultiplier: 1.4, healthMultiplier: 0.95, color: Pal.accent };
const _scaledBullets = new Map();
function scaledBullet(t, m) {
  let byM = _scaledBullets.get(t);
  if (!byM) _scaledBullets.set(t, byM = new Map());
  let c = byM.get(m);
  if (!c) {
    c = Object.assign({}, t);
    for (const k of ['damage', 'splashDamage', 'lightningDamage']) if (c[k]) c[k] *= m;
    if (c.fragBullet) c.fragBullet = scaledBullet(c.fragBullet, m);
    c._back = null; c._front = null;
    byM.set(m, c);
  }
  return c;
}
{
  const _bc = Bullets.create;
  Bullets.create = function (type, owner, team, x, y, angle, velScl, lifeScl, aimX, aimY) {
    if (owner instanceof Unit && owner.statuses) {
      let m = 1;
      for (const n in owner.statuses) if (n !== 'boss' && STATUS[n]) m *= STATUS[n].damageMultiplier ?? 1;
      if (m !== 1) type = scaledBullet(type, Math.round(m * 1000) / 1000);
    }
    return _bc.call(this, type, owner, team, x, y, angle, velScl, lifeScl, aimX, aimY);
  };
  // StatusFieldAbility (oxynoe: overclock for 6 s to allies within 60, every 6 s)
  const _ua = updateAbility;
  updateAbility = function (u, a, s) {
    if (a.type !== 'statusField') return _ua(u, a, s);
    if ((s.timer += Time.delta) < a.reload) return;
    for (const o of Game.units) if (o.team === u.team && !o.dead && Mathf.within(o.x, o.y, u.x, u.y, a.range)) o.applyStatus(a.effect, a.duration);
    Fx.create('shieldWave', u.x, u.y, 0, Pal.accent, a.range);
    s.timer = 0;
  };
  UNITS.oxynoe.abilities = (UNITS.oxynoe.abilities || []).concat([{ type: 'statusField', effect: 'overclock', duration: 360, reload: 360, range: 60 }]);
}

// Unit weapon / stat details from UnitTypes.java
{
  const wb = (u, i) => UNITS[u].weapons[i].bullet;
  wb('fortress', 0).scaleLife = true;                       // ArtilleryBulletType: shells land on the target
  // scepter: the main bullets spit a lightning arc (damage 5) every 4 ticks
  wb('scepter', 0).intervalBullet = bullet('lightning', { damage: 5, lightningLength: 3, lightningLengthRand: 4, color: Pal.surgeAmmoBack || col('f3e979'), collidesAir: true });
  wb('scepter', 0).bulletInterval = 4;
  for (const w of UNITS.horizon.weapons) if (w.bullet) { w.bullet.status = 'blasted'; w.bullet.statusDuration = 60; }
  for (const [n, m] of [['nova', 2], ['pulsar', 1.6], ['quasar', 2], ['vela', 2.4]]) UNITS[n].boostMultiplier = m;
  wb('pulsar', 0).rangeOverride = (8 + 7 / 2) * 6;          // LightningBulletType range
  wb('spiroct', 0).knockback = -1.24; wb('spiroct', 1).knockback = -0.65;
  for (const w of UNITS.arkyid.weapons) if (w.bullet && w.bullet.type === 'sap') w.bullet.knockback = -1;
  for (const n of ['alpha', 'beta', 'gamma']) for (const w of UNITS[n].weapons) if (w.bullet) w.bullet.buildingDamageMultiplier = 0;
  UNITS.zenith.targetFlags = ['launchPad', 'storage', 'battery'];
  UNITS.eclipse.targetFlags = ['reactor', 'battery', 'core'];
  for (const n of ['pulsar']) { const t = UNITS[n]; t.range = 0; for (const w of t.weapons) if (w.bullet) t.range = Math.max(t.range, w.bullet.rangeOverride || w.bullet.speed * w.bullet.lifetime); }
}
// BulletType.updateBulletInterval: intervalBullet every bulletInterval ticks, in a random direction (intervalRandomSpread 360)
{
  const _ub = Bullets.updateBullet;
  Bullets.updateBullet = function (b) {
    const t = b.type;
    if (t.intervalBullet && !b.removed && (b.intervalTime = (b.intervalTime || 0) + Time.delta) >= t.bulletInterval) {
      b.intervalTime = 0;
      Bullets.create(t.intervalBullet, b.owner, b.team, b.x, b.y, Math.random() * 360);
    }
    return _ub.call(this, b);
  };
}

// Navanax (UnitTypes.java): EmpBulletType shell - allied powered blocks get 3x speed for 20 s and 20% heal; enemy blocks on a
// producing power network slow to 0.2x for 20 s and take 3x damage. SuppressionFieldAbility: every 1.5 s enemy blocks within
// 200 can't be healed (menders, mend projectors) for 1.5 s.
Building.prototype.applySlowdown = function (intensity, duration) {
  if (this.block.noOverdrive || !canOverdrive(this)) return;
  this.timeScale = Math.min(this.timeScale || 1, intensity);
  this.timeScaleDuration = Math.max(this.timeScaleDuration || 0, duration);
};
{
  const emp = UNITS.navanax.weapons[0].bullet;
  Object.assign(emp, { emp: true, empRadius: 100, timeIncrease: 3, timeDuration: 60 * 20, powerDamageScl: 3, powerSclDecrease: 0.2 });
  const _hit = Bullets.hit;
  Bullets.hit = function (b, x, y) {
    _hit.call(this, b, x, y);
    const t = b.type;
    if (!t.emp) return;
    for (const o of Game.buildings) {
      if (o.dead || o instanceof ConstructBuild || !circleRect(x, y, t.empRadius, o)) continue;
      if (o.team === b.team) {
        if (o.block.hasPower && canOverdrive(o) && (o.timeScale || 1) < t.timeIncrease) o.applyBoost(t.timeIncrease, t.timeDuration);
        if (o.block.hasPower && o.health < o.maxHealth) { o.heal(t.healPercent / 100 * o.maxHealth); Fx.create('healBlockFull', o.x, o.y, o.block.size, Pal.heal); }
      } else if (o.team !== 'derelict' && o.power && o.power.graph && o.power.graph.produced > 0) {
        o.applySlowdown(t.powerSclDecrease, t.timeDuration);
        o.damage(t.damage * t.powerDamageScl);
      }
    }
  };
  UNITS.navanax.abilities = (UNITS.navanax.abilities || []).concat([{ type: 'suppression', reload: 90, range: 200 }]);
  const _ua2 = updateAbility;
  updateAbility = function (u, a, s) {
    if (a.type !== 'suppression') return _ua2(u, a, s);
    if ((s.timer += Time.delta) < a.reload) return;
    s.timer = 0;
    for (const o of Game.buildings) if (o.team !== u.team && o.team !== 'derelict' && !o.dead && Mathf.within(o.x, o.y, u.x, u.y, a.range)) o.healSuppressedUntil = Math.max(o.healSuppressedUntil || 0, Time.time + a.reload);
  };
}
