// Naval units: naval factory, risso → minke → bryde → sei → omura and retusa → oxynoe → cyerce → aegires → navanax.
// Naval units only move on water (EntityCollisions.waterSolid) and die on land. Stats from content/UnitTypes.java.

Pal.missileYellow = col('ffd2ae');
Pal.missileYellowBack = col('e58956');
STATUS.electrified = { speedMultiplier: 0.7, healthMultiplier: 1, color: col('98ffa9') };

const navalMissile = (props) => missile(2.7, 12, Object.assign({
  width: 8, height: 8, drag: -0.003, homingRange: 60, splashDamageRadius: 25, splashDamage: 10, lifetime: 65, trailColor: Pal.gray || col('808080'),
  backColor: Pal.bulletYellowBack, frontColor: Pal.bulletYellow, weaveScale: 8, weaveMag: 2, hitSound: null,
}, props));
const healMissile = missile(3.9, 11, {
  homingPower: 0.2, weaveMag: 4, weaveScale: 4, lifetime: 60, keepVelocity: false, splashDamage: 13, splashDamageRadius: 20, frontColor: Pal.white,
  trailColor: Pal.heal, trailWidth: 2.5, healPercent: 2.8, collidesTeam: true, backColor: Pal.heal, hitSound: null, hitEffect: 'greenBlastSmall', despawnEffect: null,
});
const plasmaLaser = bullet('contLaser', {
  damage: 27, length: 95, lifetime: 155, rangeOverride: 90, healPercent: 0.4, incendChance: 0.03, shake: 0, speed: 0, beamWidth: 4,
  colors: [rgba(Pal.heal, 0.2), rgba(Pal.heal, 0.5), lerpColorCss(Pal.heal, Pal.white, 0.2), '#ffffff'], shootEffect: null, smokeEffect: null,
});

const NAVAL = { naval: true, hovering: true, faceTarget: false };
defUnit('risso', Object.assign({}, NAVAL, {
  speed: 1.1, drag: 0.13, hitSize: 10, health: 280, armor: 2, accel: 0.4, rotateSpeed: 3.3, cell: true,
  weapons: [
    weapon('mount-weapon', { reload: 13, x: 4, shootY: 4, y: 1.5, rotate: true, bullet: basic(2.5, 9, { width: 7, height: 9, lifetime: 60 }) }),
    weapon('missiles-mount', { mirror: false, reload: 25, x: 0, y: -5, rotate: true, shootSound: 'shootMissileShort', bullet: navalMissile({ keepVelocity: true }) }),
  ],
}));
defUnit('minke', Object.assign({}, NAVAL, {
  health: 600, speed: 0.9, drag: 0.15, hitSize: 13, armor: 4, accel: 0.3, rotateSpeed: 2.6, cell: true,
  weapons: [
    weapon('mount-weapon', { reload: 10, x: 5, y: 3.5, rotate: true, rotateSpeed: 5, inaccuracy: 8, shootSound: 'shootDuo',
      bullet: flak(4.2, 3, { lifetime: 52.5, shootEffect: 'shootSmall', width: 6, height: 8, hitEffect: 'flakExplosion', splashDamage: 40.5, splashDamageRadius: 15 }) }),
    weapon('artillery-mount', { reload: 30, x: 5, y: -5, rotate: true, inaccuracy: 2, rotateSpeed: 2, shake: 1.5, ejectEffect: 'casing2', shootSound: 'shootArtillerySmall',
      bullet: artillery(3, 20, { hitEffect: 'flakExplosion', knockback: 0.8, lifetime: 73.5, width: 11, height: 11, collidesTiles: false, splashDamageRadius: 22.5, splashDamage: 40 }) }),
  ],
}));
defUnit('bryde', Object.assign({}, NAVAL, {
  health: 910, speed: 0.85, accel: 0.2, rotateSpeed: 1.8, drag: 0.17, hitSize: 20, armor: 7, cell: true,
  abilities: [{ type: 'shieldRegen', amount: 20, max: 40, reload: 60 * 4, range: 60 }],
  weapons: [
    weapon('large-artillery', { reload: 65, mirror: false, x: 0, y: -3.5, rotateSpeed: 1.7, rotate: true, shootY: 7, fireShake: 5, recoil: 4, inaccuracy: 3,
      ejectEffect: 'casing2', shootSound: 'shootArtillery',
      bullet: artillery(3.2, 15, { hitEffect: 'blastExplosion', knockback: 1.5, lifetime: 84, height: 15.5, width: 15, collidesTiles: false, splashDamageRadius: 40,
        splashDamage: 70, backColor: Pal.missileYellowBack, frontColor: Pal.missileYellow, hitShake: 4, shootEffect: 'shootBig', status: 'blasted', statusDuration: 60 }) }),
    weapon('missiles-mount', { reload: 20, x: 8.5, y: -9, rotateSpeed: 4, rotate: true, shots: 2, shotDelay: 3, inaccuracy: 5, velocityRnd: 0.1,
      shootSound: 'shootMissileShort', ejectEffect: null, bullet: navalMissile({ keepVelocity: false, lifetime: 70, weaveMag: 1 }) }),
  ],
}));
defUnit('sei', Object.assign({}, NAVAL, {
  health: 11000, armor: 12, speed: 0.73, drag: 0.17, hitSize: 39, accel: 0.2, rotateSpeed: 1.3, cell: true,
  weapons: [
    weapon('sei-launcher', { x: 0, y: 0, rotate: true, rotateSpeed: 4, mirror: false, shootY: 4.5, recoil: 4, reload: 45, velocityRnd: 0.4, inaccuracy: 7,
      ejectEffect: null, shake: 1, shootSound: 'shootMissileLong', shots: 6, shotDelay: 1.5,
      bullet: missile(4.2, 42, { homingPower: 0.12, width: 8, height: 8, drag: -0.003, homingRange: 80, keepVelocity: false, splashDamageRadius: 35, splashDamage: 45,
        lifetime: 62, trailColor: Pal.bulletYellowBack, backColor: Pal.bulletYellowBack, frontColor: Pal.bulletYellow, weaveScale: 8, weaveMag: 2 }) }),
    weapon('large-bullet-mount', { reload: 60, x: 70 / 4, y: -66 / 4, rotateSpeed: 4, rotate: true, shootY: 7, shake: 2, recoil: 3, ejectEffect: 'casing2',
      shootSound: 'shootSpectre', shots: 3, shotDelay: 4, inaccuracy: 1, bullet: basic(7, 57, { width: 13, height: 19, shootEffect: 'shootBig', lifetime: 35 }) }),
  ],
}));
defUnit('omura', Object.assign({}, NAVAL, {
  health: 22000, speed: 0.62, drag: 0.18, hitSize: 58, armor: 16, accel: 0.19, rotateSpeed: 0.9, cell: true,
  weapons: [weapon('omura-cannon', {
    reload: 110, mirror: false, x: 0, y: -3.5, rotateSpeed: 1.4, rotate: true, shootY: 23, fireShake: 6, recoil: 10.5, shootSound: 'shootOmura', ejectEffect: null,
    bullet: bullet('rail', { length: 500, damage: 1250, pierceDamageFactor: 0.5, rangeOverride: 500, speed: 0, shootEffect: 'shootBig', smokeEffect: null }),
  })],
}));
defUnit('retusa', Object.assign({}, NAVAL, {
  speed: 0.9, drag: 0.14, hitSize: 11, health: 270, accel: 0.4, rotateSpeed: 5, range: 100, armor: 3, buildSpeed: 1.5, cell: true,
  abilities: [{ type: 'repairBeam', range: 120, amount: 0.75, x: 0, y: -5.5, sprite: 'repair-beam-weapon-center' }],
  weapons: [
    weapon('retusa-weapon', { shootSound: 'shootLaser', reload: 22, x: 4.5, y: -3.5, rotateSpeed: 5, rotate: true, ejectEffect: null,
      bullet: bolt(5.2, 12, { lifetime: 30, healPercent: 5.5, collidesTeam: true, backColor: Pal.heal, frontColor: Pal.white }) }),
    weapon(null, { mirror: false, rotate: true, reload: 90, x: 0, y: 0, shootY: 0, shootSound: 'shootRetusa', rotateSpeed: 180, shots: 3, shotDelay: 7, ejectEffect: null,
      bullet: basic(0.7, 1, { noTeamHit: true, sprite: 'mine-bullet', width: 8, height: 8, shrinkY: 0, rangeOverride: 50, healPercent: 4, backColor: Pal.heal, frontColor: Pal.white,
        hitSound: 'explosionPlasmaSmall', hitSize: 22, collidesAir: false, lifetime: 87, hitEffect: 'greenBlastSmall', keepVelocity: false, inaccuracy: 2,
        weaveMag: 5, weaveScale: 4, drag: -0.017, homingPower: 0.05, trailColor: Pal.heal, trailWidth: 3, trailLength: 6, splashDamage: 40, splashDamageRadius: 32,
        shootEffect: null, smokeEffect: null, despawnEffect: null }) }),
  ],
}));
defUnit('oxynoe', Object.assign({}, NAVAL, {
  health: 560, speed: 0.83, drag: 0.14, hitSize: 14, armor: 4, accel: 0.4, rotateSpeed: 4, buildSpeed: 2, cell: true,
  abilities: [{ type: 'pointDefense', x: 0, y: 1, reload: 9, range: 100, damage: 17, mirror: false }],
  weapons: [weapon('plasma-mount-weapon', {
    reload: 5, x: 4.5, y: 6.5, rotate: true, rotateSpeed: 5, inaccuracy: 10, shootSound: 'shootFlamePlasma', shootCone: 30, ejectEffect: null,
    bullet: scorchFlame(3.4, 23, { healPercent: 1.5, collidesTeam: true, statusDuration: 240, particle: 'plasmaParticle', shootEffect: 'plasmaShoot', hitEffect: 'hitLaserColor', hitColor: Pal.heal }),
  })],
}));
defUnit('cyerce', Object.assign({}, NAVAL, {
  health: 870, speed: 0.86, accel: 0.22, rotateSpeed: 2.6, drag: 0.16, hitSize: 20, armor: 6, buildSpeed: 2, cell: true,
  abilities: [
    { type: 'repairBeam', range: 130, amount: 0.7, x: 11, y: -10, sprite: 'repair-beam-weapon-center' },
    { type: 'repairBeam', range: 130, amount: 0.7, x: -11, y: -10, sprite: 'repair-beam-weapon-center' },
  ],
  weapons: [weapon('plasma-missile-mount', {
    reload: 60, x: 9, y: 3, rotateSpeed: 4, rotate: true, inaccuracy: 1, velocityRnd: 0.1, shootSound: 'shootMissilePlasma', ejectEffect: null,
    bullet: flak(2.5, 25, { sprite: 'missile-large', collidesGround: true, collidesAir: true, explodeRange: 40, width: 12, height: 12, shrinkY: 0, drag: -0.003,
      keepVelocity: false, splashDamageRadius: 30, splashDamage: 25, lifetime: 80, backColor: Pal.heal, frontColor: Pal.white, weaveScale: 8, weaveMag: 1,
      trailColor: Pal.heal, trailWidth: 4.5, trailLength: 6, fragBullets: 7, fragBullet: healMissile, hitEffect: 'greenBlast', hitSound: 'explosion' }),
  })],
}));
defUnit('aegires', Object.assign({}, NAVAL, {
  health: 12000, armor: 12, speed: 0.7, drag: 0.17, hitSize: 44, accel: 0.2, rotateSpeed: 1.4, buildSpeed: 3, range: 180, cell: true,
  abilities: [
    { type: 'energyField', damage: 40, reload: 65, range: 180, status: 'electrified', statusDuration: 60 * 6, maxTargets: 25, healPercent: 1.5, sameTypeHealMult: 0.5 },
    ...[-18, 14].flatMap(y => [12.5, -12.5].map(x => ({ type: 'pointDefense', x, y, reload: 4, range: 180, damage: 30 }))),
  ],
}));
defUnit('navanax', Object.assign({}, NAVAL, {
  health: 20000, speed: 0.65, drag: 0.17, hitSize: 58, armor: 20, accel: 0.2, rotateSpeed: 1.1, buildSpeed: 3.5, cell: true, immuneBurning: true,
  weapons: [
    weapon('emp-cannon-mount', {
      rotate: true, x: 70 / 4, y: -26 / 4, reload: 65, fireShake: 3, rotateSpeed: 2, shootY: 7, recoil: 4, shootSound: 'shootNavanax', ejectEffect: null,
      bullet: basic(5, 110, { noTeamHit: true, sprite: 'circle-bullet', scaleLife: true, healPercent: 20, lifetime: 60, backColor: Pal.heal, frontColor: Pal.white, width: 12, height: 12,
        shrinkY: 0, trailWidth: 6, trailColor: Pal.heal, trailLength: 8, splashDamage: 110, splashDamageRadius: 100, hitShake: 4, status: 'electrified',
        statusDuration: 60 * 5, hitSound: 'explosionNavanax', hitEffect: 'empHit', shootEffect: 'shootBig', smokeEffect: null, despawnEffect: null }),
    }),
    ...[-117 / 4, 50 / 4].map(y => weapon('plasma-laser-mount', {
      x: 84 / 4, y, rotate: true, rotateSpeed: 3.5, reload: 170, recoil: 1, shootY: 7, continuous: true, limitRange: true, ejectEffect: null,
      shootSound: null, fireSound: 'beamPlasmaSmall', bullet: plasmaLaser,
    })),
  ],
}));

// ================================================================ water movement
function isWaterTile(tx, ty) {
  if (!World.inside(tx, ty)) return false;
  const i = ty * World.w + tx;
  return !World.wall[i] && FLOOR_DEFS[World.floor[i]].isLiquid;
}
function isWaterAt(x, y) { return isWaterTile(Math.round(x / TS), Math.round(y / TS)); }

const _navCollides = Unit.prototype.collidesAt;
Unit.prototype.collidesAt = function (x, y) {
  if (!this.type.naval) return _navCollides.call(this, x, y);
  const r = Math.min(this.type.hitSize * 0.66, 7.9) / 2;
  const x1 = Math.round((x - r) / TS), x2 = Math.round((x + r) / TS);
  const y1 = Math.round((y - r) / TS), y2 = Math.round((y + r) / TS);
  for (let ty = y1; ty <= y2; ty++) for (let tx = x1; tx <= x2; tx++) {
    if (!isWaterTile(tx, ty)) return true;
    const b = World.build[ty * World.w + tx];
    if (b && b.block.solid && !b.open && !(b instanceof ConstructBuild && b.progress < 0.1)) return true;
  }
  return false;
};
const _navFloorSpeed = Unit.prototype.floorSpeed;
Unit.prototype.floorSpeed = function () {
  if (!this.type.naval) return _navFloorSpeed.call(this);
  const tx = Math.round(this.x / TS), ty = Math.round(this.y / TS);
  return World.inside(tx, ty) && FLOOR_DEFS[World.floor[ty * World.w + tx]].isDeep ? 1.3 : 1;
};
const _navUpdate = Unit.prototype.update;
Unit.prototype.update = function () {
  _navUpdate.call(this);
  if (!this.type.naval || this.dead) return;
  // ships stranded on land die (WaterMoveComp.onSolid)
  if (!isWaterAt(this.x, this.y)) { this.landTime = (this.landTime || 0) + Time.delta; if (this.landTime > 60) this.kill(); }
  else this.landTime = 0;
};
// weapons flagged limitRange only fire at targets inside their own range (autoTarget mounts)
const _navWeapons = Unit.prototype.updateWeapons;
Unit.prototype.updateWeapons = function () {
  for (const m of this.mounts) {
    const w = m.weapon;
    if (!w.limitRange || !m.shoot) continue;
    const [mx, my] = this.mountPos(m);
    if (Math.hypot(this.aimX - mx, this.aimY - my) > w.bullet.length + 8) m.shoot = false;
  }
  _navWeapons.call(this);
};

// player-side naval AI: chase targets on the water, otherwise hold near where the ship was launched
class NavalAI {
  constructor(u) { this.target = null; this.retarget = Math.random() * 20; this.home = null; }
  update(u) {
    const t = u.type;
    if (!this.home) this.home = [u.x, u.y];
    this.retarget -= Time.delta;
    if (this.retarget <= 0) {
      this.retarget = 20;
      const reach = Game.command === 'attack' ? 700 : Math.max(u.range * 1.6, 260);
      this.target = Targeting.closestTarget(u.team, u.x, u.y, reach, t.targetAir, t.targetGround);
      if (!this.target && t.abilities && t.abilities.some(a => a.type === 'repairBeam')) this.target = null;
    }
    if (this.target && this.target.dead) this.target = null;
    if (this.target) {
      const d = Math.hypot(this.target.x - u.x, this.target.y - u.y);
      if (d > u.range * 0.8) u.moveTo(this.target.x, this.target.y, u.range * 0.8); else u.moveAt(0, 0);
    } else if (Game.command === 'attack') u.moveTo(World.spawn.x * TS, World.spawn.y * TS, 40);
    else u.moveTo(this.home[0], this.home[1], 16);
    aimAndShoot(u, this.target, false);
    if (Math.hypot(u.vx, u.vy) > 0.05) u.lookAngle(Angles.angle(0, 0, u.vx, u.vy));
  }
}
const _navController = makeController;
makeController = function (type, team) {
  if (type.naval && team === 'sharded') return new NavalAI();
  return _navController(type, team);
};

// ================================================================ abilities: point defense, energy field
const _navAbility = updateAbility;
updateAbility = function (u, a, s) {
  if (a.type === 'pointDefense') return updatePointDefense(u, a, s);
  if (a.type === 'energyField') return updateEnergyField(u, a, s);
  return _navAbility(u, a, s);
};
function abilityPos(u, a) { const r = u.rotation - 90; return [u.x + Angles.trnsx(r, a.x || 0, a.y || 0), u.y + Angles.trnsy(r, a.x || 0, a.y || 0)]; }
function updatePointDefense(u, a, s) {
  const [mx, my] = abilityPos(u, a);
  s.reload = (s.reload || 0) + Time.delta;
  s.retarget = (s.retarget || 0) - Time.delta;
  if (s.retarget <= 0) {
    s.retarget = 8;
    let best = null, bd = Infinity;
    for (const bl of Bullets.list) {
      if (bl.removed || bl.team === u.team || bl.type.type === 'liquid') continue;
      const d = Mathf.dst(bl.x, bl.y, mx, my);
      if (d < a.range && d < bd) { bd = d; best = bl; }
    }
    s.target = best;
  }
  if (s.target && s.target.removed) s.target = null;
  if (s.target) s.angle = Angles.angle(mx, my, s.target.x, s.target.y);
  if (s.beam) { s.beam.time += Time.delta; if (s.beam.time > 10) s.beam = null; }
  if (!s.target || s.reload < a.reload) return;
  const b = s.target;
  const dmg = b.dmgLeft !== undefined ? b.dmgLeft : b.type.damage + (b.type.splashDamage || 0);
  if (dmg > a.damage) b.dmgLeft = dmg - a.damage; else { b.removed = true; s.target = null; }
  s.beam = { x: b.x, y: b.y, time: 0 };
  Fx.create('absorb', b.x, b.y, 0, Pal.white);
  s.reload = 0;
}
function updateEnergyField(u, a, s) {
  s.timer = (s.timer || 0) + Time.delta;
  if (s.arcs) { for (const c of s.arcs) c.time += Time.delta; s.arcs = s.arcs.filter(c => c.time < 12); }
  if (s.timer < a.reload) return;
  s.timer = 0;
  const hits = [];
  for (const o of Game.units) if (o.team !== u.team && !o.dead && Mathf.within(o.x, o.y, u.x, u.y, a.range)) hits.push(o);
  for (const b of Game.buildings) if (b.team !== u.team && !b.dead && Mathf.within(b.x, b.y, u.x, u.y, a.range)) hits.push(b);
  hits.sort((p, q) => Mathf.dst(p.x, p.y, u.x, u.y) - Mathf.dst(q.x, q.y, u.x, u.y));
  s.arcs = s.arcs || [];
  for (const h of hits.slice(0, a.maxTargets)) {
    h.damage(a.damage);
    if (h.applyStatus) h.applyStatus(a.status, a.statusDuration);
    s.arcs.push({ x: h.x, y: h.y, time: 0, seed: Math.random() * 1000 });
    Fx.create('hitLaserColor', h.x, h.y, 0, Pal.heal);
  }
  // heal allies in range
  for (const o of Game.units) {
    if (o.team !== u.team || o.dead || o === u || o.health >= o.maxHealth || !Mathf.within(o.x, o.y, u.x, u.y, a.range)) continue;
    o.heal(o.maxHealth * a.healPercent / 100 * (o.type === u.type ? a.sameTypeHealMult : 1));
    s.arcs.push({ x: o.x, y: o.y, time: 0, seed: Math.random() * 1000 });
  }
  for (const b of Game.teamBuildings(u.team)) {
    if (b.dead || b instanceof ConstructBuild || b.health >= b.maxHealth || !Mathf.within(b.x, b.y, u.x, u.y, a.range)) continue;
    b.heal(b.maxHealth * a.healPercent / 100);
  }
  if (hits.length) Audio2.play('shootArc', u.x, u.y, 0.5);
}

const _navDraw = Unit.prototype.draw;
Unit.prototype.draw = function () {
  _navDraw.call(this);
  const abs = this.type.abilities;
  if (!abs || !this.abil) return;
  abs.forEach((a, i) => {
    const s = this.abil[i];
    if (a.type === 'pointDefense') {
      const [mx, my] = abilityPos(this, a);
      Draw.rect('point-defense-mount', mx, my, undefined, undefined, (s.angle ?? this.rotation) - 90);
      if (s.beam) {
        Draw.setAlpha(1 - s.beam.time / 10);
        Lines.set(Pal.white.css, 0.8); Lines.line(mx + Angles.trnsx(s.angle ?? 0, 3), my + Angles.trnsy(s.angle ?? 0, 3), s.beam.x, s.beam.y);
        Draw.setAlpha(1);
      }
    } else if (a.type === 'energyField') {
      Draw.setAlpha(0.5 + Mathf.absin(Time.time, 6, 0.4));
      Fill.set(Pal.heal.css); Fill.circle(this.x, this.y, 4 + Mathf.absin(Time.time, 5, 1.5));
      Fill.set('#fff'); Fill.circle(this.x, this.y, 2);
      Draw.setAlpha(1);
      for (const c of s.arcs || []) {
        Draw.setAlpha(1 - c.time / 12);
        Lines.set(Pal.heal.css, 1.6);
        // jagged arc from the core of the ship to the target
        let px = this.x, py = this.y;
        const n = 6;
        for (let k = 1; k <= n; k++) {
          const f = k / n, jit = k === n ? 0 : 6;
          const nx = Mathf.lerp(this.x, c.x, f) + Math.sin(c.seed + k * 12.9) * jit, ny = Mathf.lerp(this.y, c.y, f) + Math.cos(c.seed + k * 7.3) * jit;
          Lines.line(px, py, nx, ny); px = nx; py = ny;
        }
        Draw.setAlpha(1);
      }
    }
  });
};

// ================================================================ rail bullets (omura)
const _navCreate = Bullets.create;
Bullets.create = function (type, owner, team, x, y, angle, velScl, lifeScl, aimX, aimY) {
  if (type.type !== 'rail') return _navCreate.call(this, type, owner, team, x, y, angle, velScl, lifeScl, aimX, aimY);
  const ex = x + Angles.trnsx(angle, type.length), ey = y + Angles.trnsy(angle, type.length);
  const hits = [];
  for (const u of Game.units) if (u.team !== team && !u.dead && segDist(x, y, ex, ey, u.x, u.y) <= u.type.hitSize / 2 + 2) hits.push({ t: Mathf.dst(x, y, u.x, u.y), u });
  for (const o of Game.buildings) if (o.team !== team && !o.dead && segDist(x, y, ex, ey, o.x, o.y) <= o.hitSize / 2) hits.push({ t: Mathf.dst(x, y, o.x, o.y), o });
  hits.sort((a, c) => a.t - c.t);
  // RailBulletType: each pierced target soaks up (health * pierceDamageFactor) of the remaining damage
  let dmg = type.damage, endT = type.length;
  for (const h of hits) {
    if (dmg <= 0) { endT = h.t; break; }
    const tg = h.u || h.o;
    const hp = tg.health + (tg.shield || 0);
    tg.damage(dmg);
    dmg -= hp * type.pierceDamageFactor;
    Fx.create('blastExplosion', tg.x, tg.y);
  }
  this.rails.push({ x, y, angle, len: endT, time: 0, lifetime: 24 });
};

Object.assign(FX, {
  plasmaParticle: { life: 16, draw(e) {
    Fill.set(lerpColorCss(Pal.white, Pal.heal, e.fin * 1.5));
    Draw.setAlpha(e.fout);
    Fill.circle(e.x, e.y, 0.65 + e.fout * 1.5);
    Draw.setAlpha(1);
  } },
  plasmaShoot: { life: 20, draw(e) {
    Fill.set(rgba(Pal.heal, e.fout));
    randLen(e, 6, e.fin * 22, (x, y) => Fill.circle(e.x + x, e.y + y, 0.65 + e.fout * 1.5), e.rotation, 10);
  } },
  greenBlast: { life: 28, draw(e) {
    Lines.set(rgba(Pal.heal, e.fout), 6 * e.fout); Lines.circle(e.x, e.y, 7 + e.fin * 23);
    Fill.set(rgba(Pal.white, e.fout * 0.8)); randLen(e, 6, 4 + e.fin * 30, (x, y) => Fill.circle(e.x + x, e.y + y, e.fout * 3));
  } },
  greenBlastSmall: { life: 20, draw(e) {
    Lines.set(rgba(Pal.heal, e.fout), 2 * e.fout); Lines.circle(e.x, e.y, 3 + e.fin * 12);
    Fill.set(rgba(Pal.heal, e.fout)); randLen(e, 5, 2 + e.fin * 14, (x, y) => Fill.square(e.x + x, e.y + y, e.fout * 1.5, 45));
  } },
  empHit: { life: 50, draw(e) {
    if (e.fin < 0.14) { Fill.set(rgba(Pal.heal, 1 - e.fin / 0.14)); Fill.circle(e.x, e.y, 100); }
    Lines.set(rgba(Pal.heal, e.fout), 3 * e.fout); Lines.circle(e.x, e.y, 100);
    Fill.set(rgba(Pal.heal, e.fout));
    for (let i = 0; i < 10; i++) { const ang = i * 36 + (e.id * 37) % 360; Fill.triAngle(e.x + Angles.trnsx(ang, 100), e.y + Angles.trnsy(ang, 100), 6, 50 * e.fout, ang); }
    Fill.circle(e.x, e.y, 12 * e.fout); Fill.set('#fff'); Fill.circle(e.x, e.y, 6 * e.fout);
  } },
});

// ================================================================ naval factory + water-only launch
defBlock('naval-factory', 'UnitFactory', {
  requirements: req('copper', 150, 'lead', 130, 'metaglass', 120), size: 3, consumesPower: 1.2, category: 'units', hasPower: true,
  hasItems: true, rotate: true, configurable: true, flags: ['factory'], floating: true,
  plans: [
    { unit: 'risso', time: 60 * 45, requirements: req('silicon', 20, 'metaglass', 35) },
    { unit: 'retusa', time: 60 * 35, requirements: req('silicon', 15, 'titanium', 20) },
  ],
  iconLayers: ['naval-factory', 'factory-out-3', 'factory-top-3'],
});
// keep it next to the other factories in the build menu
{
  const nf = BLOCK_LIST.indexOf(BLOCKS['naval-factory']);
  BLOCK_LIST.splice(nf, 1);
  BLOCK_LIST.splice(BLOCK_LIST.indexOf(BLOCKS['air-factory']) + 1, 0, BLOCKS['naval-factory']);
}
function launchPoint(b) {
  const ang = b.rotation * 90;
  return [b.x + Angles.trnsx(ang, b.block.size * TS / 2 + 4), b.y + Angles.trnsy(ang, b.block.size * TS / 2 + 4)];
}
// a naval unit can only leave a factory/reconstructor if it lands on water (or goes straight into another reconstructor)
const _navUfUpdate = UnitFactory.prototype.update;
UnitFactory.prototype.update = function () {
  const p = this.plan;
  this.navalBlocked = false;
  if (p && UNITS[p.unit].naval) {
    const next = this.front();
    const intoRecon = next instanceof Reconstructor && next.team === this.team && next.upgrade(UNITS[p.unit]);
    if (!intoRecon && !isWaterAt(...launchPoint(this)) && this.progress + Time.delta * this.efficiency >= p.time) {
      this.navalBlocked = true;
      this.progress = Math.min(this.progress, p.time - 0.001);
      return;
    }
  }
  _navUfUpdate.call(this);
};
const _navUfInfo = UnitFactory.prototype.info;
UnitFactory.prototype.info = function () {
  const lines = _navUfInfo.call(this);
  const p = this.plan;
  if (p && UNITS[p.unit].naval && !isWaterAt(...launchPoint(this)) && !(this.front() instanceof Reconstructor)) lines.push('Point the output at water to launch ships');
  return lines;
};
const _navRcUpdate = Reconstructor.prototype.update;
Reconstructor.prototype.update = function () {
  if (this.payload && this.progress >= this.block.constructTime) {
    const up = this.upgrade(this.payload);
    const next = this.front();
    const intoRecon = next instanceof Reconstructor && next.team === this.team && next.upgrade(up);
    if (up && up.naval && !intoRecon && !isWaterAt(...launchPoint(this))) { this.navalBlocked = true; return; }
  }
  this.navalBlocked = false;
  _navRcUpdate.call(this);
};
const _navRcInfo = Reconstructor.prototype.info;
Reconstructor.prototype.info = function () {
  const lines = _navRcInfo.call(this);
  if (this.navalBlocked) lines.push('Point the output at water to launch the ship');
  return lines;
};

BLOCKS['additive-reconstructor'].upgrades.push(['risso', 'minke'], ['retusa', 'oxynoe']);
BLOCKS['multiplicative-reconstructor'].upgrades.push(['minke', 'bryde'], ['oxynoe', 'cyerce']);
BLOCKS['exponential-reconstructor'].upgrades.push(['bryde', 'sei'], ['cyerce', 'aegires']);
BLOCKS['tetrative-reconstructor'].upgrades.push(['sei', 'omura'], ['aegires', 'navanax']);
Object.assign(DESCRIPTIONS, {
  'naval-factory': 'Produces naval units: risso (gunboat) and retusa (support ship that heals and lays mines). Ships only move on water, so point the output at a lake.',
  'additive-reconstructor': DESCRIPTIONS['additive-reconstructor'] + ' Ships: risso → minke, retusa → oxynoe.',
  'multiplicative-reconstructor': DESCRIPTIONS['multiplicative-reconstructor'] + ' Ships: minke → bryde, oxynoe → cyerce.',
  'exponential-reconstructor': DESCRIPTIONS['exponential-reconstructor'] + ' Ships: bryde → sei, cyerce → aegires.',
  'tetrative-reconstructor': DESCRIPTIONS['tetrative-reconstructor'] + ' Ships: sei → omura, aegires → navanax.',
});
