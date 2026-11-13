// Surge alloy + phase fabric, surge/phase walls, phase boost; tier 5 turrets (spectre, meltdown, foreshadow,
// segment, parallax); core upgrades (foundation, nucleus), beta/gamma, vault and core-linked storage.
// Stats from content/Blocks.java, UnitTypes.java, Items.java.

defItem('surge-alloy', 'f3e979', { cost: 1.2 });
defItem('phase-fabric', 'f4ba6e', { cost: 1.3 });
Items.surgeAlloy = Items['surge-alloy']; Items.phaseFabric = Items['phase-fabric'];
Pal.meltdownHit = col('ffb98b');

// ================================================================ part 2: surge, phase, walls, phase boost
defBlock('surge-smelter', 'GenericCrafter', {
  requirements: req('silicon', 80, 'lead', 80, 'thorium', 70), outputItem: { item: Items.surgeAlloy, amount: 1 }, craftTime: 75, size: 3,
  hasPower: true, hasItems: true, itemCapacity: 20, consumesPower: 4, flame: col('ffef99'), craftEffect: 'smeltsmoke',
  consumeItems: [{ item: Items.copper, amount: 3 }, { item: Items.lead, amount: 4 }, { item: Items.titanium, amount: 2 }, { item: Items.silicon, amount: 3 }],
  category: 'crafting', flags: ['factory'],
});
defBlock('phase-weaver', 'GenericCrafter', {
  requirements: req('silicon', 130, 'lead', 120, 'thorium', 75), outputItem: { item: Items.phaseFabric, amount: 1 }, craftTime: 120, size: 2,
  hasPower: true, hasItems: true, itemCapacity: 30, consumesPower: 5, weave: true, craftEffect: 'smeltsmoke',
  consumeItems: [{ item: Items.thorium, amount: 4 }, { item: Items.sand, amount: 10 }], category: 'crafting', flags: ['factory'],
  iconLayers: ['phase-weaver-bottom', 'phase-weaver-weave', 'phase-weaver'],
});
const _gcDraw = GenericCrafter.prototype.draw;
GenericCrafter.prototype.draw = function () {
  const b = this.block;
  if (!b.weave) return _gcDraw.call(this);
  Draw.rect(b.name + '-bottom', this.x, this.y);
  Draw.rect(b.name + '-weave', this.x, this.y, undefined, undefined, this.totalProgress);
  Draw.setAlpha(this.warmup * 0.6);
  Fill.set(Items.phaseFabric.color.css);
  const p = (this.totalProgress / 30) % 1;
  Lines.set(rgba(Items.phaseFabric.color, this.warmup), 0.8); Lines.line(this.x - 4, this.y - 4 + p * 8, this.x + 4, this.y - 4 + p * 8);
  Draw.setAlpha(1);
  Draw.rect(b.name, this.x, this.y);
};

defBlock('phase-wall', 'Wall', { requirements: req('phase-fabric', 6), health: 150 * wallHealthMultiplier, chanceDeflect: 10, category: 'defense', group: 'walls' });
defBlock('phase-wall-large', 'Wall', { requirements: req('phase-fabric', 24), health: 150 * wallHealthMultiplier * 4, size: 2, chanceDeflect: 10, category: 'defense', group: 'walls' });
defBlock('surge-wall', 'Wall', { requirements: req('surge-alloy', 6), health: 230 * wallHealthMultiplier, lightningChance: 0.05, category: 'defense', group: 'walls' });
defBlock('surge-wall-large', 'Wall', { requirements: req('surge-alloy', 24), health: 230 * wallHealthMultiplier * 4, size: 2, lightningChance: 0.05, category: 'defense', group: 'walls' });

// Wall.collision: phase walls reflect bullets (chance = chanceDeflect / damage), surge walls shoot lightning
const _ub3 = Bullets.updateBullet;
Bullets.updateBullet = function (b) {
  const t = b.type;
  if (t.collidesTiles && t.collidesGround && (t.type === 'basic' || t.type === 'bolt' || t.type === 'missile')) {
    // check where the bullet will be after this tick's move (the base update moves first, then collides)
    const w = World.buildWorld(b.x + b.vx * Time.delta, b.y + b.vy * Time.delta);
    if (w && w.team !== b.team && !w.dead && !b.hit.has(w)) {
      const blk = w.block;
      if (blk.chanceDeflect > 0 && Math.hypot(b.vx, b.vy) > 0.1 && Math.random() < blk.chanceDeflect / Math.max(t.damage, 1)) {
        // Wall.collision: flip the axis the bullet came in on (by penetration), the bullet changes sides
        if (Math.abs(w.x - b.x) > Math.abs(w.y - b.y)) b.vx = -b.vx; else b.vy = -b.vy;
        b.team = w.team; b.hit.add(w);
        w.hitTime = 1;
        Fx.create('absorb', b.x, b.y, 0, Pal.accent);
        return _ub3.call(this, b);
      }
      if (blk.lightningChance > 0 && Math.random() < blk.lightningChance) {
        Lightning.create(w.team, Pal.surgeAmmoBack, 20, w.x, w.y, Angles.angle(0, 0, b.vx, b.vy) + 180, 17, { collidesAir: true }); // from the wall, back at the shooter
        Audio2.play('shootArc', b.x, b.y, 0.4);
      }
    }
  }
  _ub3.call(this, b);
};

// phase boost (items consumed every useTime while boosting)
function phaseBoostUpdate(b) {
  const has = !!b.items && b.has(Items.phaseFabric);
  b.phaseHeat = Mathf.approach(b.phaseHeat || 0, has && b.efficiency > 0 ? 1 : 0, 0.1 * Time.delta);
  if (has && b.efficiency > 0) {
    b.phaseUse = (b.phaseUse || 0) + Time.delta;
    if (b.phaseUse >= b.block.phaseUseTime) { b.phaseUse = 0; b.removeItem(Items.phaseFabric); }
  }
}
const _acceptPhase = (b, item) => item === Items.phaseFabric && b.items[item.id] < b.block.itemCapacity;
ForceProjector.prototype.acceptItem = function (s, item) { return _acceptPhase(this, item); };
OverdriveProjector.prototype.acceptItem = function (s, item) { return _acceptPhase(this, item); };
const _fpUpdate = ForceProjector.prototype.update;
ForceProjector.prototype.update = function () { phaseBoostUpdate(this); _fpUpdate.call(this); };
ForceProjector.prototype.realRadius = function () { return (this.block.radius + (this.phaseHeat || 0) * this.block.phaseRadiusBoost) * this.radscl; };
const _fpUpdate2 = ForceProjector.prototype.update;
ForceProjector.prototype.update = function () {
  // phase raises the break threshold by phaseShieldBoost
  const b = this.block, base = b.shieldHealth;
  b.shieldHealth = base + (this.phaseHeat || 0) * b.phaseShieldBoost;
  _fpUpdate2.call(this);
  b.shieldHealth = base;
};
const _odUpdate = OverdriveProjector.prototype.update;
OverdriveProjector.prototype.update = function () {
  phaseBoostUpdate(this);
  const b = this.block, sb = b.speedBoost, rg = b.range;
  b.speedBoost = sb + (this.phaseHeat || 0) * b.speedBoostPhase;
  b.range = rg + (this.phaseHeat || 0) * b.phaseRangeBoost;
  _odUpdate.call(this);
  b.speedBoost = sb; b.range = rg;
};
Object.assign(BLOCKS['force-projector'], { phaseRadiusBoost: 80, phaseShieldBoost: 400, phaseUseTime: 350, hasItems: true, itemCapacity: 10 });
Object.assign(BLOCKS['overdrive-projector'], { speedBoostPhase: 0.75, phaseRangeBoost: 20, phaseUseTime: 400, hasItems: true, itemCapacity: 10 });
// mend projector: boost item is phase fabric (MendProjector phaseBoost 15, phaseRangeBoost 50)
Object.assign(BLOCKS['mend-projector'], { boostItem: 'phase-fabric', phaseBoost: 15, phaseRangeBoost: 50, hasItems: true, itemCapacity: 10 });
const _mpAccept = MendProjector.prototype.acceptItem;
MendProjector.prototype.acceptItem = function (s, item) {
  if (this.block.boostItem === 'phase-fabric') return _acceptPhase(this, item);
  return _mpAccept.call(this, s, item);
};
const _mpUpdate = MendProjector.prototype.update;
MendProjector.prototype.update = function () {
  if (this.block.boostItem !== 'phase-fabric') return _mpUpdate.call(this);
  // reuse the mender logic with phase fabric standing in for silicon
  const items = this.items, si = Items.silicon.id, ph = Items.phaseFabric.id;
  const real = items[si]; items[si] = items[ph];
  _mpUpdate.call(this);
  const used = items[ph] - items[si];
  items[ph] -= Math.max(0, used); items[si] = real;
};

// ================================================================ part 3: tier 5 turrets
const range = (r, speed) => (r + 5) / speed;
defBlock('spectre', 'ItemTurret', {
  requirements: req('copper', 900, 'graphite', 300, 'surge-alloy', 250, 'plastanium', 175, 'thorium', 250), category: 'turret',
  reload: 7, coolant: 1, coolantMultiplier: 0.5, liquidCapacity: 120, range: 260, inaccuracy: 3, recoil: 3, alternateSpread: 8, shake: 2,
  size: 4, shootCone: 24, scaledHealth: 160, rotateSpeed: 4, shootSound: 'shootSpectre', heatRegion: 'spectre-heat', shootY: 12,
  targetAir: true, targetGround: true, iconLayers: ['block-4', 'spectre'],
  ammo: {
    graphite: basic(7.5, 50, { hitSize: 4.8, width: 15, height: 21, ammoMultiplier: 4, reloadMultiplier: 1.7, knockback: 0.3, lifetime: range(260, 7.5), hitColor: Pal.graphiteAmmoBack, backColor: Pal.graphiteAmmoBack, trailColor: Pal.graphiteAmmoBack, frontColor: Pal.graphiteAmmoFront, shootEffect: 'shootBig' }),
    thorium: basic(8, 80, { hitSize: 5, width: 16, height: 23, pierceCap: 2, pierce: true, pierceBuilding: true, knockback: 0.7, lifetime: range(260, 8), backColor: Pal.thoriumAmmoBack, hitColor: Pal.thoriumAmmoBack, frontColor: Pal.thoriumAmmoFront, shootEffect: 'shootBig' }),
    pyratite: basic(7, 70, { hitSize: 5, width: 16, height: 21, makeFire: true, pierceCap: 2, pierce: true, pierceBuilding: true, knockback: 0.6, ammoMultiplier: 3, splashDamage: 20, splashDamageRadius: 25, status: 'burning', statusDuration: 300, lifetime: range(260, 7), frontColor: Pal.lightishOrange, backColor: Pal.lightOrange, hitColor: Pal.lightOrange, shootEffect: 'shootBig' }),
  },
});

// meltdown: continuous laser, reloads only with coolant (LaserTurret)
class LaserTurret extends Turret {
  constructor(...a) { super(...a); this.bulletLife = 0; this.dmgTimer = 0; this.reloadCounter = 0; }
  hasAmmo() { return true; }
  peekAmmo() { return this.block.shootType; }
  shouldConsume() { return this.bulletLife > 0 || !!this.target; }
  update() {
    const b = this.block;
    this.curRecoil = Mathf.approach(this.curRecoil, 0, Time.delta / 40);
    this.heat = Mathf.approach(this.heat, this.bulletLife > 0 ? 1 : 0, 0.05 * Time.delta);
    if (this.timer('target', 20)) this.findTarget();
    if (!this.validTarget(this.target)) this.target = null;
    const eff = this.efficiency;
    if (this.target) {
      const tr = Angles.angle(this.x, this.y, this.target.x, this.target.y);
      this.turretRotation = Angles.moveToward(this.turretRotation, tr, b.rotateSpeed * Time.delta * (this.bulletLife > 0 ? b.firingMoveFract : 1) * Math.max(eff, 0.2));
    }
    if (this.bulletLife > 0) {
      if (eff <= 0) { this.bulletLife = 0; return; }
      this.bulletLife -= Time.delta;
      this.curRecoil = 1;
      if ((this.dmgTimer += Time.delta) >= 5) { this.dmgTimer = 0; this.laserDamage(b.shootType.damage * eff); }
      if (this.bulletLife <= 0) this.reloadCounter = 0;
      return;
    }
    // reload only progresses with coolant
    const lq = this.liquid;
    if (this.reloadCounter < b.reload && lq && lq.type && lq.amount > 0) {
      const used = Math.min(lq.amount, b.coolant * Time.delta);
      this.reloadCounter += used * lq.type.heatCapacity * (b.coolantMultiplier || 5);
      this.removeLiquid(used);
    }
    if (this.target && this.reloadCounter >= b.reload && eff > 0 && Angles.within(this.turretRotation, Angles.angle(this.x, this.y, this.target.x, this.target.y), b.shootCone)) {
      this.bulletLife = b.shootDuration;
      Audio2.play('shootLancer', this.x, this.y, 0.9, 0.6);
      Render.shake(b.shake, 10);
    }
  }
  laserLine() {
    const b = this.block, t = b.shootType, r = this.turretRotation;
    const sx = this.x + Angles.trnsx(r, b.size * TS / 2 - 2), sy = this.y + Angles.trnsy(r, b.size * TS / 2 - 2);
    let len = t.length;
    const ex = sx + Angles.trnsx(r, len), ey = sy + Angles.trnsy(r, len);
    for (const o of Game.buildings) {
      if (o.team === this.team || o.dead || !o.block.absorbLasers) continue;
      if (segDist(sx, sy, ex, ey, o.x, o.y) <= o.hitSize / 2) len = Math.min(len, Math.max(0, Mathf.dst(sx, sy, o.x, o.y) - o.hitSize / 2));
    }
    return [sx, sy, len];
  }
  laserDamage(dmg) {
    const [sx, sy, len] = this.laserLine();
    const r = this.turretRotation, ex = sx + Angles.trnsx(r, len), ey = sy + Angles.trnsy(r, len);
    for (const u of Game.units) {
      if (u.team === this.team || u.dead) continue;
      if (segDist(sx, sy, ex, ey, u.x, u.y) <= u.type.hitSize / 2 + 4) { u.damage(dmg); if (Math.random() < 0.3) Fx.create('hitFlameSmall', u.x, u.y, r); }
    }
    for (const o of Game.buildings) {
      if (o.team === this.team || o.dead) continue;
      if (segDist(sx, sy, ex, ey, o.x, o.y) <= o.hitSize / 2) o.damage(dmg);
    }
    // incendChance 0.4
    if (Math.random() < 0.4) Fires.createWorld(ex + Mathf.range(5), ey + Mathf.range(5));
  }
  draw() {
    super.draw();
  }
  drawLaser() {
    if (this.bulletLife <= 0) return;
    const b = this.block;
    const [sx, sy, len] = this.laserLine();
    const fade = Mathf.clamp(this.bulletLife > b.shootDuration - 16 ? (b.shootDuration - this.bulletLife) / 16 : this.bulletLife / 16);
    const r = this.turretRotation;
    const colors = ['rgba(236,116,88,0.33)', 'rgba(236,116,88,0.67)', '#ff9c5a', '#ffffff'];
    const osc = Mathf.absin(Time.time, 0.8, 1.5);
    for (let i = 0; i < colors.length; i++) {
      const w = (9 + osc) * fade * Mathf.lerp(2, 0.5, i / (colors.length - 1)) * 0.5;
      Lines.set(colors[i], w * 2);
      Lines.lineAngle(sx, sy, r, len * fade);
      Fill.set(colors[i]); Fill.circle(sx, sy, w);
      Fill.triAngle(sx + Angles.trnsx(r, len * fade), sy + Angles.trnsy(r, len * fade), w, 35 * 0.75 * fade, r);
    }
  }
  info() { return [this.bulletLife > 0 ? 'FIRING' : `Recharge: ${Math.floor(this.reloadCounter / this.block.reload * 100)}% (needs coolant)`, `Power: ${Math.round(this.efficiency * 100)}%`]; }
}

// foreshadow: rail gun at the strongest target in range
class RailTurret extends ItemTurret {
  findTarget() {
    const range = this.range;
    let best = null, bh = -1;
    for (const u of Game.units) {
      if (u.team === this.team || u.dead) continue;
      if (Math.hypot(u.x - this.x, u.y - this.y) - u.type.hitSize / 2 > range) continue;
      if (u.maxHealth > bh) { bh = u.maxHealth; best = u; }
    }
    this.target = best;
  }
  shoot(type) {
    const b = this.block, r = this.turretRotation;
    const sx = this.x + Angles.trnsx(r, b.size * TS / 2), sy = this.y + Angles.trnsy(r, b.size * TS / 2);
    const ex = sx + Angles.trnsx(r, type.length), ey = sy + Angles.trnsy(r, type.length);
    // RailBulletType: damage is reduced by each pierced target's health (pierceDamageFactor 1)
    const hits = [];
    for (const u of Game.units) if (u.team !== this.team && !u.dead && segDist(sx, sy, ex, ey, u.x, u.y) <= u.type.hitSize / 2 + 2) hits.push({ t: Mathf.dst(sx, sy, u.x, u.y), u });
    for (const o of Game.buildings) if (o.team !== this.team && !o.dead && segDist(sx, sy, ex, ey, o.x, o.y) <= o.hitSize / 2) hits.push({ t: Mathf.dst(sx, sy, o.x, o.y), o });
    hits.sort((a, c) => a.t - c.t);
    let dmg = type.damage, endT = type.length;
    for (const h of hits) {
      if (dmg <= 0) { endT = h.t; break; }
      if (h.u) { const hp = h.u.health + h.u.shield; h.u.damage(dmg, true); dmg -= hp; Fx.create('blastExplosion', h.u.x, h.u.y); }
      else { const hp = h.o.health; h.o.damage(dmg * type.buildingDamageMultiplier); dmg -= hp / type.buildingDamageMultiplier; }
    }
    Bullets.rails.push({ x: sx, y: sy, angle: r, len: endT, time: 0, lifetime: 24 });
    Fx.create('shootBig', sx, sy, r);
    Audio2.play('shootForeshadow', sx, sy, 1);
    Render.shake(type.hitShake, 20);
    this.curRecoil = 1; this.heat = 1; this.totalShots++;
  }
}
Bullets.rails = [];
const _bUpd4 = Bullets.update;
Bullets.update = function () {
  for (const r of this.rails) r.time += Time.delta;
  this.rails = this.rails.filter(r => r.time < r.lifetime);
  _bUpd4.call(this);
};
const _bDraw4 = Bullets.draw;
Bullets.draw = function () {
  _bDraw4.call(this);
  for (const r of this.rails) {
    const fout = 1 - r.time / r.lifetime;
    Lines.set(rgba(Pal.surgeAmmoBack, fout), 6 * fout); Lines.lineAngle(r.x, r.y, r.angle, r.len);
    Lines.set(rgba(Pal.white, fout), 2.5 * fout); Lines.lineAngle(r.x, r.y, r.angle, r.len);
    for (let d = 20; d < r.len; d += 20) { Fill.set(rgba(Pal.surgeAmmoBack, fout)); Fill.poly(r.x + Angles.trnsx(r.angle, d), r.y + Angles.trnsy(r.angle, d), 4, 3 * fout, r.angle + 45); }
  }
};

// segment: point defense that shoots down enemy bullets
class PointDefenseTurret extends Building {
  constructor(...a) { super(...a); this.turretRotation = 90; this.reloadCounter = 0; this.target = null; this.retarget = 0; }
  shouldConsume() { return true; }
  update() {
    const b = this.block, eff = this.efficiency;
    this.retarget -= Time.delta;
    if (this.retarget <= 0) {
      this.retarget = 5;
      let best = null, bd = Infinity;
      for (const bl of Bullets.list) {
        if (bl.removed || bl.team === this.team || bl.type.type === 'liquid') continue;
        const d = Mathf.dst(bl.x, bl.y, this.x, this.y);
        if (d < b.range && d < bd) { bd = d; best = bl; }
      }
      this.target = best;
    }
    if (this.target && this.target.removed) this.target = null;
    if (this.reloadCounter < b.reload) this.reloadCounter += Time.delta * eff;
    if (!this.target || eff <= 0) return;
    const tr = Angles.angle(this.x, this.y, this.target.x, this.target.y);
    this.turretRotation = Angles.moveToward(this.turretRotation, tr, b.rotateSpeed * Time.delta);
    if (Angles.within(this.turretRotation, tr, 5) && this.reloadCounter >= b.reload) {
      const t = this.target;
      const dmg = t.dmgLeft !== undefined ? t.dmgLeft : t.type.damage + (t.type.splashDamage || 0);
      if (dmg > b.bulletDamage) t.dmgLeft = dmg - b.bulletDamage;
      else t.removed = true;
      this.beam = { x: t.x, y: t.y, time: 0 };
      Fx.create('absorb', t.x, t.y, 0, Pal.white);
      this.reloadCounter = 0;
    }
  }
  draw() {
    Draw.rect('block-2', this.x, this.y);
    Draw.rect(this.block.name, this.x, this.y, undefined, undefined, this.turretRotation - 90);
    if (this.beam) {
      this.beam.time += Time.frameDelta;
      const f = 1 - this.beam.time / 12;
      if (f <= 0) this.beam = null;
      else {
        const sx = this.x + Angles.trnsx(this.turretRotation, 5), sy = this.y + Angles.trnsy(this.turretRotation, 5);
        Lines.set(rgba(Pal.white, f), 1.2 * f); Lines.line(sx, sy, this.beam.x, this.beam.y);
      }
    }
  }
  drawSelect() { Lines.set(rgba(Pal.accent, 0.8), 1); Lines.dashCircle(this.x, this.y, this.block.range, Time.time / 80); }
  info() { return [`Shoots down enemy bullets (up to ${this.block.bulletDamage} damage per shot)`]; }
}

// parallax: tractor beam pulling air units in
class TractorBeamTurret extends Building {
  constructor(...a) { super(...a); this.turretRotation = 90; this.target = null; this.retarget = 0; this.strength = 0; }
  shouldConsume() { return !!this.target; }
  update() {
    const b = this.block, eff = this.efficiency;
    this.retarget -= Time.delta;
    if (this.retarget <= 0) { this.retarget = 5; this.target = Targeting.closestUnit(this.team, this.x, this.y, b.range, true, false); }
    if (this.target && (this.target.dead || !this.target.isFlying || Math.hypot(this.target.x - this.x, this.target.y - this.y) > b.range + 10)) this.target = null;
    if (!this.target || eff <= 0) { this.strength = Mathf.lerp(this.strength, 0, 0.1 * Time.delta); return; }
    const t = this.target;
    const ang = Angles.angle(this.x, this.y, t.x, t.y);
    this.turretRotation = Angles.moveToward(this.turretRotation, ang, b.rotateSpeed * Time.delta);
    if (!Angles.within(this.turretRotation, ang, 6)) return;
    this.strength = Mathf.lerp(this.strength, 1, 0.1 * Time.delta);
    t.damage(b.damage * Time.delta * eff, true);
    const d = Math.hypot(t.x - this.x, t.y - this.y);
    const mass = t.type.hitSize * t.type.hitSize * Math.PI;
    const f = (b.force + (1 - d / b.range) * b.scaledForce) * Time.delta * eff / mass * 20;
    t.vx -= (t.x - this.x) / d * f; t.vy -= (t.y - this.y) / d * f;
  }
  draw() {
    Draw.rect('block-2', this.x, this.y);
    Draw.rect(this.block.name, this.x, this.y, undefined, undefined, this.turretRotation - 90);
    if (this.target && this.strength > 0.05) {
      const sx = this.x + Angles.trnsx(this.turretRotation, 5), sy = this.y + Angles.trnsy(this.turretRotation, 5);
      Draw.setAlpha(this.strength);
      Draw.laser(sx, sy, this.target.x, this.target.y, 0.6 * this.strength, Pal.white);
      Draw.setAlpha(1);
    }
  }
  drawSelect() { Lines.set(rgba(Pal.accent, 0.8), 1); Lines.dashCircle(this.x, this.y, this.block.range, Time.time / 80); }
  info() { return ['Pulls air units toward it and damages them']; }
}
Object.assign(BuildClasses, { LaserTurret, RailTurret, PointDefenseTurret, TractorBeamTurret });
Turret.prototype.drawLaser = function () {};

defBlock('meltdown', 'LaserTurret', {
  requirements: req('copper', 1200, 'lead', 350, 'graphite', 300, 'surge-alloy', 325, 'silicon', 325), category: 'turret', shootCone: 40,
  recoil: 4, size: 4, shake: 2, range: 195, reload: 90, firingMoveFract: 0.5, shootDuration: 230, rotateSpeed: 1.5, scaledHealth: 200,
  liquidCapacity: 60, coolant: 0.5, consumesPower: 17, hasPower: true, heatRegion: 'meltdown-heat', targetAir: true, targetGround: true,
  shootType: bullet('continuousLaser', { damage: 78, length: 200 }), iconLayers: ['block-4', 'meltdown'],
});
defBlock('foreshadow', 'RailTurret', {
  requirements: req('copper', 1000, 'metaglass', 600, 'surge-alloy', 300, 'plastanium', 200, 'silicon', 600), category: 'turret', range: 500,
  maxAmmo: 40, ammoPerShot: 5, rotateSpeed: 1.5, reload: 200, recoil: 5, shake: 4, size: 4, shootCone: 2, coolantMultiplier: 0.4, liquidCapacity: 60,
  scaledHealth: 150, coolant: 1, consumesPower: 10, hasPower: true, heatRegion: 'foreshadow-heat', targetAir: true, targetGround: true,
  iconLayers: ['block-4', 'foreshadow'],
  ammo: { 'surge-alloy': bullet('rail', { damage: 1350, buildingDamageMultiplier: 0.2, length: 500, hitShake: 6, ammoMultiplier: 1, speed: 0 }) },
});
Object.defineProperty(RailTurret.prototype, 'maxAmmo', { get() { return this.block.maxAmmo || 30; } });
defBlock('segment', 'PointDefenseTurret', {
  requirements: req('silicon', 130, 'thorium', 80, 'phase-fabric', 40, 'titanium', 40), scaledHealth: 250, range: 180, hasPower: true,
  consumesPower: 8, size: 2, bulletDamage: 30, reload: 8, rotateSpeed: 20, category: 'turret', iconLayers: ['block-2', 'segment'],
});
defBlock('parallax', 'TractorBeamTurret', {
  requirements: req('silicon', 160, 'titanium', 110, 'graphite', 50), hasPower: true, size: 2, force: 16, scaledForce: 9, range: 300,
  damage: 0.5, scaledHealth: 160, rotateSpeed: 12, consumesPower: 3.3, category: 'turret', iconLayers: ['block-2', 'parallax'],
});
BLOCKS.cyclone.ammo['surge-alloy'] = flak(4.5, 13, { ammoMultiplier: 5, splashDamage: 75, splashDamageRadius: 38, lightning: 2, lightningLength: 7, lightningDamage: 13, shootEffect: 'shootBig', collidesGround: true, explodeRange: 20, backColor: Pal.surgeAmmoBack, hitColor: Pal.surgeAmmoBack, frontColor: Pal.surgeAmmoFront });
BLOCKS.swarmer.ammo['surge-alloy'] = missile(3.7, 18, { width: 8, height: 8, shrinkY: 0, splashDamageRadius: 25, splashDamage: 35, hitEffect: 'blastExplosion', despawnEffect: 'blastExplosion', ammoMultiplier: 4, lightningDamage: 10, lightning: 2, lightningLength: 10, hitColor: Pal.surgeAmmoBack, backColor: Pal.surgeAmmoBack, trailColor: Pal.surgeAmmoBack, frontColor: Pal.surgeAmmoFront });

// ================================================================ part 4: cores, beta/gamma, vault, linked storage
defUnit('beta', {
  flying: true, mineSpeed: 7, mineTier: 1, buildSpeed: 0.75, drag: 0.05, speed: 3.3, rotateSpeed: 17, accel: 0.1, itemCapacity: 50, health: 170,
  engineOffset: 6, hitSize: 9, lowAltitude: true, cell: true,
  weapons: [weapon('small-mount-weapon', { top: false, reload: 20, x: 3, y: 1, recoil: 1, shots: 2, shotDelay: 4, shootSound: 'shootAlpha', ejectEffect: null,
    bullet: bolt(3, 11, { width: 1.5, height: 4.5, lifetime: 60, buildingDamageMultiplier: 0.01, homingPower: 0.03, backColor: Pal.yellowBoltFront, frontColor: Pal.white, hitColor: Pal.yellowBoltFront, trailLength: 3, trailWidth: 1.2 }) })],
});
defUnit('gamma', {
  flying: true, mineSpeed: 8, mineTier: 2, buildSpeed: 1, drag: 0.05, speed: 3.55, rotateSpeed: 19, accel: 0.11, itemCapacity: 70, health: 220,
  engineOffset: 6, hitSize: 11, lowAltitude: true, cell: true,
  weapons: [weapon('small-mount-weapon', { top: false, reload: 15, x: 1, y: 2, shots: 2, shotDelay: 3, inaccuracy: 3, shootSound: 'shootAlpha', ejectEffect: null,
    bullet: bolt(3.5, 11, { width: 1.5, height: 5, lifetime: 70, buildingDamageMultiplier: 0.01, homingPower: 0.04, backColor: Pal.yellowBoltFront, frontColor: Pal.white, hitColor: Pal.yellowBoltFront, trailLength: 4, trailWidth: 1.2 }) })],
});
for (const n of ['beta', 'gamma']) UNITS[n].cell = true;

defBlock('core-foundation', 'Core', {
  requirements: req('copper', 3000, 'lead', 3000, 'silicon', 2000), unitType: 'beta', health: 3500, itemCapacity: 9000, size: 4,
  unitCapModifier: 16, category: 'effect', hasItems: true, storage: true, flags: ['core'], coreUpgrade: true,
});
defBlock('core-nucleus', 'Core', {
  requirements: req('copper', 8000, 'lead', 8000, 'silicon', 5000, 'thorium', 4000), unitType: 'gamma', health: 6000, itemCapacity: 13000, size: 5,
  unitCapModifier: 24, category: 'effect', hasItems: true, storage: true, flags: ['core'], coreUpgrade: true,
});
defBlock('vault', 'StorageBlock', { requirements: req('titanium', 250, 'thorium', 125), size: 3, itemCapacity: 1000, scaledHealth: 55, category: 'effect', hasItems: true, storage: true, flags: ['storage'] });
BLOCKS.container.flags = ['storage'];

// linked storage: containers/vaults touching a core share the core's inventory and add to its capacity
Core.prototype.storageCapacity = function () {
  let cap = this.block.itemCapacity;
  for (const p of this.proximity) if (p.linkedCore === this) cap += p.block.itemCapacity;
  return cap;
};
Core.prototype.acceptItem = function () { return true; };
Core.prototype.handleItem = function (source, item) {
  if (this.items[item.id] >= this.storageCapacity()) {
    if (Math.random() < 0.1) Fx.create('fuelburn', this.x + Mathf.range(8), this.y + Mathf.range(8));
    return;
  }
  this.addItem(item);
};
Core.prototype.onProximityUpdate = function () {
  for (const p of this.proximity) {
    if (p instanceof StorageBlock && !(p instanceof Core) && p.linkedCore !== this && !p.dead) {
      // move the container's items into the core and share the inventory from now on
      for (let i = 0; i < ITEMS.length; i++) if (p.items[i]) this.addItem(ITEMS[i], p.items[i]);
      p.linkedCore = this; p.items = this.items; p.total = 0;
    }
  }
};
const _sbAccept = StorageBlock.prototype.acceptItem;
StorageBlock.prototype.acceptItem = function (s, item) { return this.linkedCore && !this.linkedCore.dead ? this.linkedCore.acceptItem(s, item) : _sbAccept.call(this, s, item); };
const _sbHandle = StorageBlock.prototype.handleItem;
StorageBlock.prototype.handleItem = function (s, item) { if (this.linkedCore && !this.linkedCore.dead) this.linkedCore.handleItem(s, item); else _sbHandle.call(this, s, item); };
StorageBlock.prototype.onRemoved = function () {
  if (this.linkedCore) { this.items = new Int32Array(ITEMS.length); this.total = 0; this.linkedCore = null; }
};
const _sbProx = StorageBlock.prototype.onProximityUpdate;
StorageBlock.prototype.onProximityUpdate = function () {
  // unlink if the core is gone or no longer adjacent
  if (this.linkedCore && (this.linkedCore.dead || !this.proximity.includes(this.linkedCore))) {
    this.linkedCore = null; this.items = new Int32Array(ITEMS.length); this.total = 0;
  }
  if (!this.linkedCore) for (const p of this.proximity) if (p instanceof Core && !p.dead) p.onProximityUpdate();
};
const _sbDraw = StorageBlock.prototype.draw;
StorageBlock.prototype.draw = function () {
  _sbDraw.call(this);
  if (this.linkedCore && !(this instanceof Core)) { Lines.set(rgba(Pal.accent, 0.35), 0.6); Lines.square(this.x, this.y, this.block.size * TS / 2 - 0.5); }
};
StorageBlock.prototype.info = function () {
  if (this.linkedCore) return ['Linked to the core: shares its storage'];
  return [`Holds up to ${this.block.itemCapacity} of each item`];
};
Core.prototype.info = function () { return [`Storage: ${this.storageCapacity()} per item`, `Unit cap: ${Game.unitCap(this.team)} per type`]; };

Object.assign(DESCRIPTIONS, {
  'surge-smelter': 'Smelts copper, lead, titanium and silicon into surge alloy.',
  'phase-weaver': 'Produces phase fabric from thorium and sand.',
  'phase-wall': 'Reflects most bullets back at the shooter (weaker bullets are reflected more often).',
  'phase-wall-large': 'Reflects most bullets back at the shooter. Spans multiple tiles.',
  'surge-wall': 'An extremely durable wall that periodically releases electric arcs when hit.',
  'surge-wall-large': 'An extremely durable wall that releases electric arcs when hit. Spans multiple tiles.',
  'spectre': 'A massive twin-barreled cannon. Fires large armor-piercing bullets at air and ground. Needs a lot of coolant to fire fast.',
  'meltdown': 'Charges and fires a persistent laser beam. Needs coolant (water or cryofluid) to recharge, and lots of power.',
  'foreshadow': 'Fires a single-target rail shot over a huge range at the strongest enemy. Uses surge alloy and power.',
  'segment': 'Shoots down incoming enemy bullets.',
  'parallax': 'Pulls air units toward it with a tractor beam, damaging them.',
  'core-foundation': 'The second core tier: more storage, more units, and the Beta ship. Place it over your Shard core to upgrade instantly.',
  'core-nucleus': 'The third core tier: lots of storage, more units, and the Gamma ship. Place it over your Foundation core.',
  'vault': 'Stores a large amount of each item. Placed next to the core, it adds to the core\'s storage.',
  'container': 'Stores a small amount of items of each type. Placed next to the core, it adds to the core\'s storage.',
});
