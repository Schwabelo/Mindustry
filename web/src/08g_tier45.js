// Tier 4-5 units (scepter, reign, vela, corvus, antumbra, eclipse, quad, oct), the spider line
// (atrax, spiroct, arkyid, toxopid), leg animation, sap / continuous-laser / charged weapons, and the
// exponential + tetrative reconstructors. Stats from content/UnitTypes.java and content/Blocks.java.

Pal.surge = col('f3e979');
Pal.sapBullet = col('bf92f9');
Pal.sapBulletBack = col('6d56bf');
const SLAG = defLiquid('slag', 'ffa166', { heatCapacity: 0, coolant: false, temperature: 1 });

Object.assign(STATUS, {
  slow: { speedMultiplier: 0.4, healthMultiplier: 1, color: Pal.white, noFx: true },
  unmoving: { speedMultiplier: 0, healthMultiplier: 1, color: Pal.white, noFx: true },
  sapped: { speedMultiplier: 0.7, healthMultiplier: 0.8, color: Pal.sapBullet },
  melting: { speedMultiplier: 0.8, healthMultiplier: 0.8, color: col('ffa166'), dps: 0.3 },
});

// ================================================================ units
const sapper = (props) => {
  const b = bullet('sap', Object.assign({
    sapStrength: 0.5, length: 50, damage: 20, color: Pal.sapBullet, width: 0.5, lifetime: 30, shootEffect: 'shootSmall', smokeEffect: null,
    despawnEffect: null, hitEffect: null, speed: 0,
  }, props));
  b.rangeOverride = b.length;
  return b;
};
const sapArtillery = (speed, damage, props) => artillery(speed, damage, Object.assign({
  hitEffect: 'sapExplosion', knockback: 0.8, collidesTiles: true, backColor: Pal.sapBulletBack, frontColor: Pal.sapBullet,
  lightningColor: Pal.sapBullet, status: 'sapped', statusDuration: 600, hitSound: 'explosionArtillery', shootEffect: 'shootBig',
}, props));
const scepterSmall = basic(12, 20, { width: 4.5, height: 35, lifetime: 26 * TS / 12, shrinkY: 0, shootEffect: 'shootSmall', hitEffect: 'hitBulletColor' });
const antumbraMissile = missile(2.7, 18, {
  width: 8, height: 8, drag: -0.01, splashDamageRadius: 20, splashDamage: 37, lifetime: 50, status: 'blasted', statusDuration: 60,
});
const eclipseFlak = flak(4, 15, { shootEffect: 'shootBig', splashDamage: 65, splashDamageRadius: 25, collidesGround: true, lifetime: 47, status: 'blasted', statusDuration: 60 });

defUnit('scepter', {
  speed: 0.36, hitSize: 22, rotateSpeed: 2.1, health: 9000, armor: 20, mechFrontSway: 1, mech: true, cell: true, stepShake: 0.15,
  abilities: [{ type: 'shieldRegen', amount: 25, max: 250, reload: 60, range: 60 }],
  weapons: [
    weapon('scepter-weapon', {
      top: false, y: 1, x: 16, shootY: 8, reload: 45, recoil: 5, shake: 2, ejectEffect: 'casing2', shootSound: 'shootScepter', inaccuracy: 3,
      shots: 3, shotDelay: 4,
      bullet: basic(8, 70, { width: 11, height: 20, lifetime: 27, shrinkY: 0, shootEffect: 'shootBig', hitEffect: 'blastExplosion', lightning: 2, lightningLength: 6, lightningDamage: 20, lightningColor: Pal.surge }),
    }),
    weapon('scepter-mount', { reload: 12, x: 8.5, y: 6, rotate: true, rotateSpeed: 3, bullet: scepterSmall, shootSound: 'shootScepterSecondary' }),
    weapon('scepter-mount', { reload: 15, x: 8.5, y: -7, rotate: true, rotateSpeed: 3, bullet: scepterSmall, shootSound: 'shootScepterSecondary' }),
  ],
});
defUnit('reign', {
  speed: 0.4, hitSize: 30, rotateSpeed: 1.65, health: 24000, armor: 30, mechFrontSway: 1.9, mechSideSway: 0.6, mech: true, cell: true, stepShake: 0.75,
  weapons: [weapon('reign-weapon', {
    top: false, y: 1, x: 21.5, shootY: 11, reload: 9, recoil: 5, shake: 2, ejectEffect: 'casing2', shootSound: 'shootReign',
    bullet: basic(13, 80, {
      pierce: true, pierceCap: 10, width: 14, height: 33, lifetime: 15, shootEffect: 'shootBig', hitEffect: 'blastExplosion',
      splashDamage: 18, splashDamageRadius: 13, fragBullets: 3, hitSound: 'explosion',
      fragBullet: basic(9, 20, { width: 10, height: 10, pierce: true, pierceBuilding: true, pierceCap: 3, lifetime: 20, hitEffect: 'flakExplosion', splashDamage: 15, splashDamageRadius: 10 }),
    }),
  })],
});
defUnit('vela', {
  hitSize: 24, rotateSpeed: 1.8, mechFrontSway: 1, buildSpeed: 3, speed: 0.44, boostMultiplier: 2.4, engineOffset: 12, engineSize: 6,
  lowAltitude: true, health: 8200, armor: 16, canBoost: true, mech: true, cell: true, immuneBurning: true,
  weapons: [weapon(null, {
    mirror: false, top: false, fireShake: 4, shootY: 14, x: 0, y: 0, reload: 155, recoil: 0, chargeTime: 39, chargeSound: 'chargeVela',
    shootSound: null, fireSound: 'beamPlasma', continuous: true, shootStatus: 'slow', ejectEffect: null,
    bullet: bullet('contLaser', {
      damage: 35, length: 180, lifetime: 160, rangeOverride: 180, healPercent: 1, incendChance: 0.1, shake: 1, speed: 0,
      colors: [rgba(Pal.heal, 0.2), rgba(Pal.heal, 0.5), lerpColorCss(Pal.heal, Pal.white, 0.2), '#ffffff'], shootEffect: null, smokeEffect: null,
    }),
  })],
  abilities: [{ type: 'repairBeam', range: 120, amount: 1.4, x: 11, y: -7.5 }],
});
defUnit('corvus', {
  hitSize: 29, health: 18000, armor: 14, rotateSpeed: 1.5, speed: 0.3, stepShake: 1.5, cell: true,
  legs: true, legCount: 4, legLength: 14, legBaseOffset: 11, legMoveSpace: 1.5, legForwardScl: 0.58, hovering: true, shadowElevation: 0.2,
  weapons: [weapon(null, {
    shootSound: null, fireSound: 'shootCorvus', chargeSound: 'chargeCorvus', top: false, mirror: false, fireShake: 14, shootY: 5, x: 0, y: 0, reload: 350, recoil: 0,
    chargeTime: 40, shootStatus: 'unmoving', shootStatusDuration: 120, ejectEffect: null,
    bullet: bullet('laser', {
      length: 460, damage: 560, width: 75, lifetime: 65, rangeOverride: 460, healPercent: 25, collidesAir: true, pierceCap: -1,
      laserLightning: { spacing: 35, length: 5, lengthRand: 15, damage: 50, angleRand: 40, color: Pal.heal },
      colors: [rgba(Pal.heal, 0.4), Pal.heal.css, '#ffffff'], hitEffect: 'hitLancer', shootEffect: null, smokeEffect: null,
    }),
  })],
});
defUnit('antumbra', {
  speed: 0.8, accel: 0.04, drag: 0.04, rotateSpeed: 1.9, flying: true, lowAltitude: true, health: 7200, armor: 17, engineOffset: 21,
  engineSize: 5.3, hitSize: 46, targetFlags: ['generator', 'core'], cell: true,
  weapons: [
    weapon('missiles-mount', { y: 8, x: 17, reload: 20, rotateSpeed: 8, rotate: true, bullet: antumbraMissile, shootSound: 'shootMissile' }),
    weapon('missiles-mount', { y: -8, x: 17, reload: 35, rotateSpeed: 8, rotate: true, bullet: antumbraMissile, shootSound: 'shootMissile' }),
    weapon('large-bullet-mount', {
      y: 2, x: 10, shootY: 10, reload: 12, shake: 1, rotateSpeed: 2, rotate: true, shootSound: 'shootSpectre',
      bullet: basic(7, 55, { width: 12, height: 18, lifetime: 25, shootEffect: 'shootBig' }),
    }),
  ],
});
defUnit('eclipse', {
  speed: 0.54, accel: 0.04, drag: 0.04, rotateSpeed: 1, flying: true, lowAltitude: true, health: 22000, engineOffset: 38, engineSize: 7.3,
  hitSize: 58, armor: 22, targetFlags: ['battery', 'core'], cell: true,
  weapons: [
    weapon('large-laser-mount', {
      fireShake: 4, shootY: 9, x: 18, y: 5, rotateSpeed: 2, reload: 45, recoil: 4, rotate: true, shootSound: 'shootEclipse', ejectEffect: null,
      bullet: bullet('laser', {
        damage: 115, sideAngle: 20, sideWidth: 1.5, sideLength: 80, width: 25, length: 230, lifetime: 16, rangeOverride: 230, collidesAir: true,
        pierceCap: -1, colors: ['rgba(236,116,88,0.67)', '#ff9c5a', '#ffffff'], hitEffect: 'hitLancer', shootEffect: null, smokeEffect: null,
      }),
    }),
    weapon('large-artillery', { x: 11, y: 27, rotateSpeed: 2, reload: 9, rotate: true, recoil: 0.5, shootY: 7.25, bullet: eclipseFlak, shootSound: 'shootCyclone' }),
    weapon('large-artillery', { y: -13, x: 20, reload: 12, rotateSpeed: 7, shake: 1, rotate: true, shootY: 7.25, bullet: eclipseFlak, shootSound: 'shootCyclone' }),
  ],
});
defUnit('quad', {
  armor: 10, health: 6000, speed: 1.2, rotateSpeed: 2, accel: 0.05, drag: 0.017, lowAltitude: false, flying: true, autoDropBombs: true,
  circleTarget: true, engineOffset: 13, engineSize: 7, faceTarget: false, hitSize: 36, buildSpeed: 2.5, range: 140, targetAir: false,
  targetFlags: ['battery', 'factory'], omniMovement: false, cell: true,
  weapons: [weapon(null, {
    x: 0, y: 0, mirror: false, reload: 55, minShootVelocity: 0.01, shootSound: 'shootQuad', shootCone: 180, ignoreRotation: true, ejectEffect: null,
    bullet: bullet('bomb', {
      sprite: 'large-bomb', width: 30, height: 30, backColor: Pal.heal, frontColor: Pal.white, hitSound: 'explosionQuad', hitShake: 4,
      collidesAir: false, lifetime: 70, hitEffect: 'greenBomb', keepVelocity: false, shrinkY: 0.7, speed: 0, collides: false, collidesTiles: false,
      healPercent: 15, splashDamage: 220, splashDamageRadius: 80, damage: 154, shootEffect: null, smokeEffect: null, despawnEffect: null, spin: 2,
    }),
  })],
});
defUnit('oct', {
  armor: 20, health: 24000, speed: 0.8, rotateSpeed: 1, accel: 0.04, drag: 0.018, flying: true, engineOffset: 46, engineSize: 7.8,
  faceTarget: false, hitSize: 66, buildSpeed: 4, lowAltitude: true, range: 140, cell: true,
  abilities: [
    { type: 'forceField', radius: 140, regen: 4, max: 7000, cooldown: 60 * 8 },
    { type: 'repairField', amount: 130, reload: 60 * 2, range: 140 },
  ],
});

// --- spider line (crawler → atrax → spiroct → arkyid → toxopid)
defUnit('atrax', {
  speed: 0.6, drag: 0.4, hitSize: 13, rotateSpeed: 3, targetAir: false, health: 600, armor: 3, cell: true, immuneBurning: true,
  legs: true, legCount: 4, legLength: 9, legForwardScl: 0.6, legMoveSpace: 1.4, hovering: true, shadowElevation: 0.2,
  weapons: [weapon('atrax-weapon', {
    top: false, shootY: 3, reload: 9, ejectEffect: null, recoil: 1, x: 7, shootSound: 'shootAtrax',
    bullet: liquidBullet(SLAG, { damage: 13, speed: 2.5, drag: 0.009, lifetime: 57, collidesAir: false, collidesTiles: true, status: 'melting', statusDuration: 240, knockback: 0, shootEffect: 'shootSmall', rangeOverride: 110 }),
  })],
});
defUnit('spiroct', {
  speed: 0.54, drag: 0.4, hitSize: 15, rotateSpeed: 3, health: 1000, armor: 9, cell: true,
  legs: true, legCount: 6, legLength: 13, legForwardScl: 0.8, legMoveSpace: 1.4, legBaseOffset: 2, hovering: true, shadowElevation: 0.3,
  weapons: [
    weapon('spiroct-weapon', { shootY: 4, reload: 14, ejectEffect: null, recoil: 2, rotate: true, x: 8.5, y: -1.5, shootSound: 'shootSap',
      bullet: sapper({ sapStrength: 0.4, length: 75, damage: 23, width: 0.54, lifetime: 35 }) }),
    weapon('mount-purple-weapon', { reload: 18, rotate: true, x: 4, y: 3, shootSound: 'shootSap', ejectEffect: null,
      bullet: sapper({ sapStrength: 0.7, length: 40, damage: 18, width: 0.4, lifetime: 25 }) }),
  ],
});
const arkSap = sapper({ sapStrength: 0.85, length: 55, damage: 40, width: 0.55, lifetime: 30 });
defUnit('arkyid', {
  drag: 0.1, speed: 0.62, hitSize: 23, health: 8000, armor: 14, rotateSpeed: 2.7, cell: true, stepShake: 1,
  legs: true, legCount: 6, legMoveSpace: 1, legPairOffset: 3, legLength: 30, legBaseOffset: 10, legLengthScl: 0.96,
  legSplashDamage: 32, legSplashRange: 30, hovering: true, shadowElevation: 0.65,
  weapons: [
    weapon('spiroct-weapon', { reload: 9, x: 4, y: 8, rotate: true, bullet: arkSap, shootSound: 'shootSap', ejectEffect: null }),
    weapon('spiroct-weapon', { reload: 14, x: 9, y: 6, rotate: true, bullet: arkSap, shootSound: 'shootSap', ejectEffect: null }),
    weapon('spiroct-weapon', { reload: 22, x: 14, y: 0, rotate: true, bullet: arkSap, shootSound: 'shootSap', ejectEffect: null }),
    weapon('large-purple-mount', {
      y: -7, x: 9, shootY: 7, reload: 45, fireShake: 3, rotateSpeed: 2, rotate: true, recoil: 3, shootSound: 'shootArtillerySap',
      bullet: sapArtillery(2, 12, { lifetime: 70, width: 19, height: 19, splashDamageRadius: 70, splashDamage: 65, lightning: 3, lightningLength: 10, lightningDamage: 12 }),
    }),
  ],
});
defUnit('toxopid', {
  drag: 0.1, speed: 0.5, hitSize: 26, health: 22000, armor: 22, rotateSpeed: 1.9, cell: true, stepShake: 1,
  legs: true, legCount: 8, legMoveSpace: 0.8, legPairOffset: 3, legLength: 75, legBaseOffset: 8, legLengthScl: 0.93,
  legSplashDamage: 80, legSplashRange: 60, hovering: true, shadowElevation: 0.95,
  weapons: [
    weapon('large-purple-mount', {
      y: -5, x: 11, shootY: 7, reload: 30, fireShake: 4, rotateSpeed: 2, rotate: true, recoil: 3, shootSound: 'shootToxopidShotgun',
      spreadShots: 2, spreadAngle: 17,
      bullet: shrapnel(110, { length: 90, width: 25, rangeOverride: 90, toColor: Pal.sapBulletBack, hitEffect: 'hitLancer' }),
    }),
    weapon('toxopid-cannon', {
      y: -14, x: 0, shootY: 22, mirror: false, reload: 210, fireShake: 10, recoil: 10, rotateSpeed: 1, rotate: true, shootSound: 'shootArtillerySapBig',
      ejectEffect: 'casing2',
      bullet: sapArtillery(3, 50, {
        lifetime: 80, width: 25, height: 25, collides: true, splashDamageRadius: 80, splashDamage: 75, lightning: 5, lightningLength: 20,
        lightningDamage: 20, hitShake: 10, fragBullets: 9,
        fragBullet: sapArtillery(2.3, 30, { lifetime: 90, width: 20, height: 20, collidesTiles: false, splashDamageRadius: 70, splashDamage: 40, lightning: 2, lightningLength: 5, lightningDamage: 12, hitShake: 5 }),
      }),
    }),
  ],
});

// ================================================================ legs (LegsComp, simplified)
function legAngle(u, i) { const n = u.type.legCount; return u.rotation + 360 / n * i + 360 / n / 2; }
function solveJoint(hx, hy, fx, fy, len, side) {
  // two equal segments of len/2 (InverseKinematics.solve)
  const a = len / 2, dx = fx - hx, dy = fy - hy;
  const d = Math.min(Math.hypot(dx, dy), len - 0.01);
  const base = Math.atan2(dy, dx);
  const off = Math.acos(Mathf.clamp(d / (2 * a), -1, 1)) * (side ? 1 : -1);
  return [hx + Math.cos(base + off) * a, hy + Math.sin(base + off) * a];
}
function initLegs(u) {
  const t = u.type;
  u.legs = [];
  u.legTotal = 0;
  for (let i = 0; i < t.legCount; i++) {
    const ang = legAngle(u, i);
    const fx = u.x + Angles.trnsx(ang, t.legBaseOffset + t.legLength * (t.legLengthScl || 1));
    const fy = u.y + Angles.trnsy(ang, t.legBaseOffset + t.legLength * (t.legLengthScl || 1));
    u.legs.push({ fx, fy, jx: fx, jy: fy, group: -1 });
  }
}
function updateLegs(u, moved) {
  const t = u.type, n = t.legCount;
  if (!u.legs) initLegs(u);
  const div = Math.max(n / 2, 2);
  const moveSpace = t.legLength / 1.6 / (div / 2) * (t.legMoveSpace || 1);
  u.legTotal += moved;
  const sp = Math.hypot(u.vx, u.vy);
  const mvAng = Angles.angle(0, 0, u.vx, u.vy);
  const fwd = sp > 0.01 ? moveSpace * 0.85 * (t.legForwardScl || 1) : 0;
  for (let i = 0; i < n; i++) {
    const l = u.legs[i];
    const ang = legAngle(u, i);
    const hx = u.x + Angles.trnsx(ang, t.legBaseOffset), hy = u.y + Angles.trnsy(ang, t.legBaseOffset);
    const stageF = (u.legTotal + i * (t.legPairOffset || 0)) / moveSpace;
    const group = Math.floor(stageF) % div;
    const move = i % div === group;
    const side = i < n / 2;
    if (l.group !== group) {
      // this leg just planted: step effects and leg splash damage
      if (!move && i % div === l.group) {
        if (t.legSplashDamage) Damage.splash(u.team, l.fx, l.fy, t.legSplashRange, t.legSplashDamage, false, true);
        if (t.legLength > 20) Fx.create('legStep', l.fx, l.fy, 0, null, t.legLength / 3);
        if (t.stepShake && Math.hypot(Render.camX - l.fx, Render.camY - l.fy) < 260) Render.shake(t.stepShake, t.stepShake * 4);
        if (t.legLength > 20) Audio2.play('walkerStep', l.fx, l.fy, Math.min(0.15 + t.legLength / 200, 0.5));
      }
      l.group = group;
    }
    const reach = t.legLength * (t.legLengthScl || 1);
    const dx = hx + Angles.trnsx(ang, reach) + Angles.trnsx(mvAng, fwd), dy = hy + Angles.trnsy(ang, reach) + Angles.trnsy(mvAng, fwd);
    if (move) {
      const f = Mathf.clamp((stageF % 1) * Time.delta);
      l.fx = Mathf.lerp(l.fx, dx, f); l.fy = Mathf.lerp(l.fy, dy, f);
    }
    // keep feet within reach of the hip
    const fd = Math.hypot(l.fx - hx, l.fy - hy);
    if (fd > t.legLength * 1.2) { l.fx = hx + (l.fx - hx) / fd * t.legLength * 1.2; l.fy = hy + (l.fy - hy) / fd * t.legLength * 1.2; }
    const [jx, jy] = solveJoint(hx, hy, l.fx, l.fy, t.legLength, side);
    l.jx = Mathf.lerp(l.jx, jx, Mathf.clamp(0.3 * Time.delta)); l.jy = Mathf.lerp(l.jy, jy, Mathf.clamp(0.3 * Time.delta));
    l.hx = hx; l.hy = hy;
  }
}
function drawLegs(u) {
  const t = u.type, n = t.legCount;
  if (!u.legs || u.legs[0].hx === undefined) return;
  if (!t._legRegs) {
    const g = s => Assets.has(s) ? Assets.get(s) : null;
    t._legRegs = { leg: g(t.name + '-leg'), legBase: g(t.name + '-leg-base'), foot: g(t.name + '-foot'),
      joint: g(t.name + '-joint'), jointBase: g(t.name + '-joint-base'), base: g(t.name + '-base') };
  }
  const R = t._legRegs;
  // back legs first so the front pair overlaps them
  const order = [...Array(n).keys()].sort((a, b) => Math.abs(b + 0.5 - n / 2) - Math.abs(a + 0.5 - n / 2));
  for (const i of order) {
    const l = u.legs[i];
    const flip = i >= n / 2 ? -1 : 1;
    if (R.foot) Draw.rect(R.foot, l.fx, l.fy, undefined, undefined, Angles.angle(l.hx, l.hy, l.fx, l.fy));
    if (R.legBase) Draw.lineRegion(R.legBase, l.jx, l.jy, l.fx, l.fy, R.legBase.wh * flip);
    if (R.leg) Draw.lineRegion(R.leg, l.hx, l.hy, l.jx, l.jy, R.leg.wh * flip);
    if (R.joint) Draw.rect(R.joint, l.jx, l.jy);
    if (R.jointBase) Draw.rect(R.jointBase, l.hx, l.hy, undefined, undefined, Angles.angle(l.hx, l.hy, l.jx, l.jy));
  }
  if (R.base) Draw.rect(R.base, u.x, u.y, undefined, undefined, u.rotation - 90);
}

// ================================================================ unit hooks
const _t45Update = Unit.prototype.update;
Unit.prototype.update = function () {
  const t = this.type;
  if (t.immuneBurning) this.burnTime = 0;
  if (this.statuses && this.statuses.melting && !t.immuneBurning) this.damage(STATUS.melting.dps * Time.delta, true);
  const ox = this.x, oy = this.y;
  _t45Update.call(this);
  if (this.dead) return;
  if (t.legs) updateLegs(this, Math.hypot(this.x - ox, this.y - oy));
  // charging / continuous weapons
  for (const m of this.mounts) {
    if (m.charge > 0) {
      m.charge -= Time.delta;
      if (m.charge <= 0) { m.charged = true; this.fireBullet(m); }
    }
    if (m.beam > 0) updateBeam(this, m);
  }
};

const _t45Fire = Unit.prototype.fireBullet;
Unit.prototype.fireBullet = function (m) {
  if (this.dead) return;
  const w = m.weapon;
  if (m.beam > 0) return;
  if (w.chargeTime && !m.charged) {
    if (m.charge > 0) return;
    m.charge = w.chargeTime;
    Fx.create('greenCharge', this.x, this.y, 0, Pal.heal, { u: this, m });
    if (w.chargeSound) Audio2.play(w.chargeSound, this.x, this.y, 0.8);
    if (w.shootStatus) this.applyStatus(w.shootStatus, (w.shootStatusDuration || w.bullet.lifetime) + w.chargeTime);
    return;
  }
  m.charged = false;
  if (w.fireSound) Audio2.play(w.fireSound, this.x, this.y, 0.6);
  if (w.fireShake && Math.hypot(Render.camX - this.x, Render.camY - this.y) < 320) Render.shake(w.fireShake, w.fireShake * 2);
  if (w.continuous) {
    m.beam = w.bullet.lifetime; m.beamTimer = 0;
    if (w.shootStatus && !w.chargeTime) this.applyStatus(w.shootStatus, w.bullet.lifetime);
    return;
  }
  if (w.spreadShots > 1) {
    for (let i = 0; i < w.spreadShots; i++) {
      this._angOff = (i - (w.spreadShots - 1) / 2) * w.spreadAngle;
      _t45Fire.call(this, m);
    }
    this._angOff = 0;
    return;
  }
  _t45Fire.call(this, m);
};

function beamLine(u, m) {
  const w = m.weapon;
  let sx, sy, ang = u.rotation;
  if (w.rotate && m.angle !== undefined) {
    const [mx, my] = u.mountPos(m);
    ang = m.angle; sx = mx + Angles.trnsx(ang, w.shootY); sy = my + Angles.trnsy(ang, w.shootY);
  } else [sx, sy] = u.mountPos(m, w.shootY);
  let len = w.bullet.length;
  const ex0 = sx + Angles.trnsx(ang, len), ey0 = sy + Angles.trnsy(ang, len);
  for (const o of Game.buildings) {
    if (o.team === u.team || o.dead || !o.block.absorbLasers) continue;
    if (segDist(sx, sy, ex0, ey0, o.x, o.y) <= o.hitSize / 2) len = Math.min(len, Math.max(0, Mathf.dst(sx, sy, o.x, o.y) - o.hitSize / 2));
  }
  return [sx, sy, len, ang];
}
function updateBeam(u, m) {
  const t = m.weapon.bullet;
  m.beam -= Time.delta;
  if ((m.beamTimer += Time.delta) < 5) return;
  m.beamTimer = 0;
  const [sx, sy, len, r] = beamLine(u, m);
  const ex = sx + Angles.trnsx(r, len), ey = sy + Angles.trnsy(r, len);
  for (const o of Game.units) {
    if (o.team === u.team || o.dead) continue;
    if (segDist(sx, sy, ex, ey, o.x, o.y) <= o.type.hitSize / 2 + 4) { o.damage(t.damage); if (Math.random() < 0.3) Fx.create('hitFlameSmall', o.x, o.y, r); }
  }
  for (const b of Game.buildings) {
    if (b.dead || segDist(sx, sy, ex, ey, b.x, b.y) > b.hitSize / 2) continue;
    if (b.team !== u.team) b.damage(t.damage);
    else if (t.healPercent && b.health < b.maxHealth && !(b instanceof ConstructBuild)) { b.heal(b.maxHealth * t.healPercent / 100); if (Math.random() < 0.2) Fx.create('healBlockFull', b.x, b.y, b.block.size, Pal.heal); }
  }
  if (t.incendChance && Math.random() < t.incendChance) Fires.createWorld(ex + Mathf.range(5), ey + Mathf.range(5));
  if (t.shake && Math.hypot(Render.camX - u.x, Render.camY - u.y) < 300) Render.shake(t.shake, 6);
}

// repair beam ability (RepairBeamWeapon): continuously heals the most damaged ally in range
function updateRepairBeam(u, a, s) {
  s.timer = (s.timer || 0) - Time.delta;
  if (s.timer <= 0) {
    s.timer = 20;
    let best = null, bf = 1;
    for (const o of Game.units) if (o !== u && o.team === u.team && !o.dead && o.healthf < bf && Mathf.within(o.x, o.y, u.x, u.y, a.range)) { bf = o.healthf; best = o; }
    const b = damagedBuilding(u.team, u.x, u.y, a.range);
    if (b && b.healthf < bf) best = b;
    s.target = best;
  }
  const tg = s.target;
  if (!tg || tg.dead || tg.health >= tg.maxHealth || !Mathf.within(tg.x, tg.y, u.x, u.y, a.range)) { s.target = null; return; }
  tg.heal(a.amount * Time.delta);
}
const _t45Ability = updateAbility;
updateAbility = function (u, a, s) {
  if (a.type === 'repairBeam') return updateRepairBeam(u, a, s);
  return _t45Ability(u, a, s);
};

const _t45Draw = Unit.prototype.draw;
Unit.prototype.draw = function () {
  const t = this.type;
  if (t.legs) drawLegs(this);
  _t45Draw.call(this);
  for (const m of this.mounts) if (m.beam > 0) drawBeam(this, m);
  if (t.abilities && this.abil) t.abilities.forEach((a, i) => {
    const s = this.abil[i];
    if (a.type !== 'repairBeam' || !s.target) return;
    const r = this.rotation - 90;
    const mx = this.x + Angles.trnsx(r, a.x, a.y), my = this.y + Angles.trnsy(r, a.x, a.y);
    Draw.rect(a.sprite || 'repair-beam-weapon-center-large', mx, my, undefined, undefined, Angles.angle(mx, my, s.target.x, s.target.y) - 90);
    Draw.setAlpha(0.6 + Mathf.absin(Time.time, 4, 0.3));
    Lines.set(Pal.heal.css, 0.8 + Mathf.absin(Time.time, 3, 0.6));
    Lines.line(mx, my, s.target.x, s.target.y);
    Fill.set(Pal.heal.css); Fill.circle(s.target.x, s.target.y, 1.6);
    Draw.setAlpha(1);
  });
};
function drawBeam(u, m) {
  const t = m.weapon.bullet, life = t.lifetime;
  const [sx, sy, len, r] = beamLine(u, m);
  const fade = Mathf.clamp(m.beam > life - 16 ? (life - m.beam) / 16 : m.beam / 16);
  const osc = Mathf.absin(Time.time, 0.8, 1.5) * (t.beamWidth || 9) / 9;
  for (let i = 0; i < t.colors.length; i++) {
    const w = ((t.beamWidth || 9) + osc) * fade * Mathf.lerp(2, 0.5, i / (t.colors.length - 1)) * 0.5;
    Lines.set(t.colors[i], w * 2);
    Lines.lineAngle(sx, sy, r, len * fade);
    Fill.set(t.colors[i]); Fill.circle(sx, sy, w);
    Fill.triAngle(sx + Angles.trnsx(r, len * fade), sy + Angles.trnsy(r, len * fade), w, 26 * fade, r);
  }
}

// legged units cast a raised shadow
const _t45Shadow = Unit.prototype.drawShadow;
Unit.prototype.drawShadow = function () {
  const t = this.type;
  if (!t.legs) return _t45Shadow.call(this);
  const e = t.shadowElevation || 0.3;
  Draw.setAlpha(0.22);
  Draw.rect(this.regs().shadow, this.x - 12 * e, this.y - 13 * e, undefined, undefined, this.rotation - 90);
  Draw.setAlpha(1);
};

// ================================================================ bullets: sap, bullet lightning, laser lightning, heal bombs
const _t45Create = Bullets.create;
Bullets.create = function (type, owner, team, x, y, angle, velScl, lifeScl, aimX, aimY) {
  if (type.type !== 'sap') return _t45Create.call(this, type, owner, team, x, y, angle, velScl, lifeScl, aimX, aimY);
  // SapBulletType: hits the first target along the line, heals the shooter
  const len = type.length, ex = x + Angles.trnsx(angle, len), ey = y + Angles.trnsy(angle, len);
  let best = null, bd = Infinity;
  for (const u of Game.units) {
    if (u.team === team || u.dead || (u.isFlying ? !type.collidesAir : !type.collidesGround)) continue;
    if (segDist(x, y, ex, ey, u.x, u.y) <= u.type.hitSize / 2 + 2) { const d = Mathf.dst(x, y, u.x, u.y); if (d < bd) { bd = d; best = u; } }
  }
  for (const b of Game.buildings) {
    if (b.team === team || b.dead) continue;
    if (segDist(x, y, ex, ey, b.x, b.y) <= b.hitSize / 2) { const d = Mathf.dst(x, y, b.x, b.y); if (d < bd) { bd = d; best = b; } }
  }
  let tx = ex, ty = ey;
  if (best) {
    tx = best.x; ty = best.y;
    best.damage(type.damage);
    if (owner && owner.heal && !owner.dead) owner.heal(type.damage * type.sapStrength);
    Fx.create('hitLaserColor', tx, ty, angle, type.color);
  }
  this.lasers.push({ type, x, y, tx, ty, angle, len: Mathf.dst(x, y, tx, ty), time: 0, lifetime: type.lifetime, owner });
};
const _t45Draw2 = Bullets.draw;
Bullets.draw = function () {
  const saps = this.lasers.filter(l => l.type.type === 'sap');
  if (saps.length) this.lasers = this.lasers.filter(l => l.type.type !== 'sap');
  _t45Draw2.call(this);
  if (!saps.length) return;
  this.lasers.push(...saps);
  for (const L of saps) {
    const fout = 1 - L.time / L.lifetime;
    const o = L.owner && !L.owner.dead ? L.owner : null;
    const sx = o ? L.x + (o.x - (L.ox ?? (L.ox = o.x))) : L.x, sy = o ? L.y + (o.y - (L.oy ?? (L.oy = o.y))) : L.y;
    Draw.laser(sx, sy, L.tx, L.ty, L.type.width * fout, L.type.color);
  }
};

const _t45Laser = Bullets.laser;
Bullets.laser = function (type, owner, team, x, y, angle) {
  const r = _t45Laser.call(this, type, owner, team, x, y, angle);
  const ll = type.laserLightning;
  if (ll) {
    for (let d = ll.spacing; d < type.length; d += ll.spacing) {
      const px = x + Angles.trnsx(angle, d), py = y + Angles.trnsy(angle, d);
      Lightning.create(team, ll.color, ll.damage, px, py, angle + Mathf.range(ll.angleRand), ll.length + Math.round(Math.random() * ll.lengthRand), { collidesAir: true, healPercent: type.healPercent });
    }
  }
  return r;
};

const _t45Hit = Bullets.hit;
Bullets.hit = function (b, x, y) {
  _t45Hit.call(this, b, x, y);
  const t = b.type;
  if (t.lightning) {
    for (let i = 0; i < t.lightning; i++) Lightning.create(b.team, t.lightningColor || t.backColor, t.lightningDamage || t.damage, x, y, Math.random() * 360, t.lightningLength + Math.round(Math.random() * (t.lightningLengthRand || 0)), { collidesAir: true });
  }
  if (t.healPercent && t.splashDamageRadius > 0) {
    // heal bombs (quad) repair friendly blocks in the blast
    for (const o of Game.teamBuildings(b.team)) {
      if (o.dead || o instanceof ConstructBuild || o.health >= o.maxHealth) continue;
      if (Mathf.within(o.x, o.y, x, y, t.splashDamageRadius + o.hitSize / 2)) { o.heal(o.maxHealth * t.healPercent / 100); Fx.create('healBlockFull', o.x, o.y, o.block.size, Pal.heal); }
    }
  }
};

Object.assign(FX, {
  greenCharge: { life: 40, draw(e) {
    let x = e.x, y = e.y;
    const d = e.data;
    if (d && d.u && !d.u.dead) [x, y] = d.u.mountPos(d.m, d.m.weapon.shootY);
    Fill.set(rgba(Pal.heal, e.fin)); Fill.circle(x, y, e.fin * 4 + 1);
    Lines.set(rgba(Pal.heal, e.fin), 1.5 * e.fin); Lines.circle(x, y, e.fout * 26);
  } },
  greenBomb: { life: 40, draw(e) {
    Lines.set(rgba(Pal.heal, e.fout), 4 * e.fout); Lines.circle(e.x, e.y, 4 + e.fin * 80);
    Fill.set(rgba(Pal.heal, e.fout * 0.6)); Fill.circle(e.x, e.y, e.fout * 22);
    randLen(e, 12, 10 + e.fin * 60, (vx, vy) => Fill.square(e.x + vx, e.y + vy, e.fout * 3, 45));
  } },
  sapExplosion: { life: 40, draw(e) {
    Lines.set(rgba(Pal.sapBullet, e.fout), 3 * e.fout); Lines.circle(e.x, e.y, 4 + e.fin * 60);
    Fill.set(rgba(Pal.sapBulletBack, e.fout)); randLen(e, 9, 6 + e.fin * 40, (vx, vy) => Fill.circle(e.x + vx, e.y + vy, e.fout * 4));
  } },
  legStep: { life: 30, draw(e) {
    Fill.set(rgba(Pal.stoneGray || col('8f8f8f'), e.fout * 0.6));
    randLen(e, 6, (e.data || 6) * e.fin, (vx, vy) => Fill.circle(e.x + vx, e.y + vy, e.fout * 2 + 0.3));
  } },
});

// bomb sprite spin (quad)
const _t45Draw3 = Bullets.draw;
Bullets.draw = function () {
  for (const b of this.list) if (b.type.spin) b.rotation += b.type.spin * Time.delta;
  _t45Draw3.call(this);
};

// ================================================================ reconstructors (exponential, tetrative)
const _rcAcceptLiquid = Reconstructor.prototype.acceptLiquid;
Reconstructor.prototype.acceptLiquid = function (source, l) {
  if (!this.block.cryoUse) return false;
  return l === Liquids.cryofluid && this.liquid.amount < this.block.liquidCapacity;
};
const _rcHasReqs = Reconstructor.prototype.hasReqs;
Reconstructor.prototype.hasReqs = function () {
  if (this.block.cryoUse && !(this.liquid.type === Liquids.cryofluid && this.liquid.amount >= this.block.cryoUse * Time.delta)) return false;
  return _rcHasReqs.call(this);
};
const _rcUpdate = Reconstructor.prototype.update;
Reconstructor.prototype.update = function () {
  const b = this.block;
  if (b.cryoUse && this.payload && this.progress < b.constructTime && this.hasReqs() && this.efficiency > 0) this.removeLiquid(b.cryoUse * Time.delta * this.efficiency);
  const before = this.payload;
  _rcUpdate.call(this);
  if (before && !this.payload && b.size >= 7 && !(this.front() instanceof Reconstructor)) Audio2.play('unitCreateBig', this.x, this.y, 1);
};
const _rcInfo = Reconstructor.prototype.info;
Reconstructor.prototype.info = function () {
  const lines = _rcInfo.call(this);
  if (this.block.cryoUse) lines.push(`Cryofluid: ${Math.round(this.liquid.amount)}/${this.block.liquidCapacity} (uses ${Math.round(this.block.cryoUse * 60)}/s)`);
  return lines;
};

BLOCKS['additive-reconstructor'].upgrades.push(['crawler', 'atrax']);
BLOCKS['multiplicative-reconstructor'].upgrades.push(['atrax', 'spiroct']);
defBlock('exponential-reconstructor', 'Reconstructor', {
  requirements: req('lead', 2000, 'silicon', 1000, 'titanium', 2000, 'thorium', 750, 'plastanium', 450, 'phase-fabric', 600),
  size: 7, consumesPower: 13, category: 'units', hasPower: true, hasItems: true, hasLiquids: true, liquidInputs: ['cryofluid'], liquidCapacity: 600,
  cryoUse: 1, rotate: true, flags: ['factory'], constructTime: 60 * 60 * 1.5,
  consumeItems: [{ item: Items.silicon, amount: 850 }, { item: Items.titanium, amount: 750 }, { item: Items.plastanium, amount: 650 }],
  upgrades: [['zenith', 'antumbra'], ['spiroct', 'arkyid'], ['fortress', 'scepter'], ['mega', 'quad'], ['quasar', 'vela']],
  iconLayers: ['exponential-reconstructor', 'factory-in-7', 'factory-out-7', 'exponential-reconstructor-top'],
});
defBlock('tetrative-reconstructor', 'Reconstructor', {
  requirements: req('lead', 4000, 'silicon', 3000, 'thorium', 1000, 'plastanium', 600, 'phase-fabric', 600, 'surge-alloy', 800),
  size: 9, consumesPower: 25, category: 'units', hasPower: true, hasItems: true, hasLiquids: true, liquidInputs: ['cryofluid'], liquidCapacity: 1800,
  cryoUse: 3, rotate: true, flags: ['factory'], constructTime: 60 * 60 * 4,
  consumeItems: [{ item: Items.silicon, amount: 1000 }, { item: Items.plastanium, amount: 600 }, { item: Items['surge-alloy'], amount: 500 }, { item: Items['phase-fabric'], amount: 350 }],
  upgrades: [['antumbra', 'eclipse'], ['arkyid', 'toxopid'], ['scepter', 'reign'], ['quad', 'oct'], ['vela', 'corvus']],
  iconLayers: ['tetrative-reconstructor', 'factory-in-9', 'factory-out-9', 'tetrative-reconstructor-top'],
});

Object.assign(DESCRIPTIONS, {
  'additive-reconstructor': 'Upgrades units to tier 2: dagger → mace, nova → pulsar, crawler → atrax, flare → horizon, mono → poly. Point a factory into it.',
  'multiplicative-reconstructor': 'Upgrades tier 2 units to tier 3: mace → fortress, pulsar → quasar, atrax → spiroct, horizon → zenith, poly → mega. Chain it after an additive reconstructor.',
  'exponential-reconstructor': 'Upgrades tier 3 units to tier 4: fortress → scepter, quasar → vela, spiroct → arkyid, zenith → antumbra, mega → quad. Needs cryofluid.',
  'tetrative-reconstructor': 'Upgrades tier 4 units to tier 5: scepter → reign, vela → corvus, arkyid → toxopid, antumbra → eclipse, quad → oct. Needs cryofluid.',
});
