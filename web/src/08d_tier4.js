// Oil, plastanium, projectors (force / overdrive / mend), tier 4 turrets (fuse, cyclone, tsunami).
// Stats from content/Blocks.java, Items.java, Liquids.java, StatusEffects.java.

defItem('plastanium', 'cbd97f', { cost: 1.3, flammability: 0.1, explosiveness: 0.2 });
defLiquid('oil', '313131', { heatCapacity: 0.7, coolant: false, flammability: 1.2 });
Pal.plastaniumBack = col('d8d97f');
Pal.plastaniumFront = col('fffac6');
Pal.thoriumPink = col('f9a3c7');
Pal.glassAmmoBack = col('b9c9df');

// tarred: speed 0.6, extends burning (StatusEffects.tarred)
STATUS.tarred = { speedMultiplier: 0.6, healthMultiplier: 1, color: col('313131') };
const _applyStatus = Unit.prototype.applyStatus;
Unit.prototype.applyStatus = function (name, duration) {
  if (name === 'burning' && this.statuses && this.statuses.tarred) { this.burnTime = Math.max(this.burnTime, duration) + this.statuses.tarred; return; }
  _applyStatus.call(this, name, duration);
};
FX.tarFx = { life: 40, draw(e) { Fill.set(rgba(STATUS.tarred.color, e.fout)); Fill.circle(e.x, e.y - e.fin * 3, e.fout * 1.3); } };

// ---------------------------------------------------------------- per-building time scale (overdrive)
Building.prototype.applyBoost = function (boost, duration) {
  if (this.block.noOverdrive) return;
  this.timeScale = Math.max(this.timeScale || 1, boost);
  this.timeScaleDuration = Math.max(this.timeScaleDuration || 0, duration);
};

// ---------------------------------------------------------------- oil extractor (Fracker)
class Fracker extends Building {
  constructor(...a) {
    super(...a);
    let sum = 0;
    this.eachTile((x, y) => { sum += World.floorAt(x, y).oil || 0; });
    this.attrEff = sum / (this.block.size * this.block.size);
    this.waterIn = 0; this.accumulator = 0; this.spin = 0;
  }
  liquidAmount(l) { return l === Liquids.water ? this.waterIn : (this.liquid.type === l ? this.liquid.amount : 0); }
  acceptItem(source, item) { return item === Items.sand && this.items[item.id] < this.block.itemCapacity; }
  acceptLiquid(source, l) { return l === Liquids.water && this.waterIn < this.block.liquidCapacity; }
  handleLiquid(source, l, amount) { if (l === Liquids.water) this.waterIn = Math.min(this.block.liquidCapacity, this.waterIn + amount); }
  canDumpLiquid(to) { return !(to instanceof Pump) && !(to instanceof Fracker); }
  shouldConsume() { return this.has(Items.sand) && this.waterIn > 0 && this.attrEff > 0; }
  update() {
    const b = this.block;
    if (this.liquid.type !== Liquids.oil) { this.liquid.type = Liquids.oil; this.liquid.amount = 0; }
    const waterUse = 0.15 * Time.delta;
    const can = this.has(Items.sand) && this.waterIn >= waterUse && this.attrEff > 0 && this.liquid.amount < b.liquidCapacity;
    const eff = can ? this.efficiency : 0;
    this.warmup = Mathf.approach(this.warmup, eff, 0.02 * Time.delta);
    if (eff > 0) {
      this.waterIn -= waterUse * eff;
      this.liquid.amount = Math.min(b.liquidCapacity, this.liquid.amount + b.pumpAmount * this.attrEff * Time.delta * eff);
      this.accumulator += Time.delta * eff;
      if (this.accumulator >= b.itemUseTime) { this.accumulator -= b.itemUseTime; this.removeItem(Items.sand); }
      if (Math.random() < 0.05 * Time.delta) Fx.create('pulverize', this.x + Mathf.range(8), this.y + Mathf.range(8));
    }
    this.spin += this.warmup * Time.delta * 2;
    this.dumpLiquid(Liquids.oil);
  }
  draw() {
    const n = this.block.name;
    Draw.rect(n, this.x, this.y);
    drawLiquidFill(this, n + '-liquid');
    Draw.rect(n + '-rotator', this.x, this.y, undefined, undefined, this.spin);
    Draw.rect(n + '-top', this.x, this.y);
  }
  info() {
    if (this.attrEff <= 0) return ['Needs sand, darksand or salt floor'];
    return [`Oil: ${(this.block.pumpAmount * this.attrEff * 60).toFixed(1)}/s at full speed (${Math.round(this.attrEff * 100)}% floor)`,
      `Water: ${this.waterIn.toFixed(1)} / ${this.block.liquidCapacity}`];
  }
}

// ---------------------------------------------------------------- force projector
class ForceProjector extends Building {
  constructor(...a) { super(...a); this.buildup = 0; this.radscl = 0; this.hit = 0; this.broken = false; }
  realRadius() { return this.block.radius * this.radscl; }
  shouldConsume() { return true; }
  update() {
    const b = this.block;
    this.radscl = Mathf.lerp(this.radscl, this.broken ? 0 : this.warmup, 0.05 * Time.delta);
    this.warmup = Mathf.lerp(this.warmup, this.efficiency, 0.1 * Time.delta);
    if (Math.random() < this.buildup / b.shieldHealth * 0.1 * Time.delta) Fx.create('smokeSmall', this.x + Mathf.range(4), this.y + Mathf.range(4));
    if (this.buildup > 0) {
      let scale = !this.broken ? b.cooldownNormal : b.cooldownBrokenBase;
      const lq = this.liquid;
      const use = 0.1 * Time.delta;
      if (lq && lq.type && lq.type.coolant && lq.amount >= use) {
        this.removeLiquid(use);
        scale *= b.cooldownLiquid * (1 + (lq.type.heatCapacity - 0.4) * 0.9);
      }
      this.buildup -= Time.delta * scale;
    }
    if (this.broken && this.buildup <= 0) this.broken = false;
    if (this.buildup >= b.shieldHealth && !this.broken) {
      this.broken = true;
      this.buildup = b.shieldHealth;
      Fx.create('shieldBreak', this.x, this.y, 0, Teams[this.team].color, b.radius);
      Audio2.play('blockExplodeWall', this.x, this.y, 0.6);
    }
    if (this.hit > 0) this.hit -= Time.delta / 5;
    this.buildup = Math.max(this.buildup, 0);
  }
  // regular hexagon with corners at 0/60/120... degrees (same as Fill.poly(x, y, 6, r))
  contains(x, y) {
    const r = this.realRadius();
    if (r <= 0) return false;
    const dx = Math.abs(x - this.x), dy = Math.abs(y - this.y);
    return dy <= r * 0.8660254 && 1.7320508 * dx + dy <= 1.7320508 * r;
  }
  absorb(bullet) {
    this.buildup += bullet.type.damage + (bullet.type.splashDamage || 0) * 0.5;
    this.hit = 1;
    Fx.create('absorb', bullet.x, bullet.y, 0, Teams[this.team].color);
  }
  draw() {
    const b = this.block;
    Draw.rect(b.name, this.x, this.y);
    if (this.buildup > 0) {
      Draw.setAlpha(this.buildup / b.shieldHealth * 0.75);
      Draw.additive(true);
      Draw.rect(b.name + '-top', this.x, this.y);
      Draw.additive(false);
      Draw.setAlpha(1);
    }
    Draw.rect(Assets.team(b.name + '-team', Teams[this.team]), this.x, this.y);
  }
  drawShield() {
    const r = this.realRadius();
    if (r < 1 || this.broken) return;
    const c = Teams[this.team].color;
    Draw.setAlpha(0.09 + Mathf.clamp(this.hit) * 0.15);
    Fill.set(c.css); Fill.poly(this.x, this.y, 6, r);
    Draw.setAlpha(0.55 + Mathf.clamp(this.hit) * 0.45);
    Lines.set(c.css, 1.2); Lines.poly(this.x, this.y, 6, r);
    Draw.setAlpha(1);
  }
  info() {
    const b = this.block;
    return [this.broken ? 'Shield broken, recharging' : `Shield: ${Math.round(b.shieldHealth - this.buildup)} / ${b.shieldHealth}`];
  }
}

// ---------------------------------------------------------------- overdrive projector
class OverdriveProjector extends Building {
  constructor(...a) { super(...a); this.charge = Math.random() * 60; this.heat = 0; }
  shouldConsume() { return true; }
  update() {
    const b = this.block;
    this.heat = Mathf.lerp(this.heat, this.efficiency > 0 ? 1 : 0, 0.08 * Time.delta);
    this.charge += this.heat * Time.delta;
    if (this.charge >= b.reload) {
      this.charge = 0;
      const boost = 1 + (b.speedBoost - 1) * this.efficiency;
      for (const o of Game.teamBuildings(this.team)) if (o !== this && !o.dead && circleRect(this.x, this.y, b.range, o)) o.applyBoost(boost, b.reload + 1);
    }
  }
  draw() {
    const b = this.block;
    Draw.rect(b.name, this.x, this.y);
    Draw.setAlpha(this.heat * Mathf.absin(Time.time, 50 / (Math.PI * 2), 1) * 0.5);
    Draw.additive(true);
    Draw.rect(Assets.tinted(b.name + '-top', col('feb380')), this.x, this.y);
    Draw.additive(false);
    Draw.setAlpha(1);
  }
  drawSelect() {
    Lines.set(rgba(col('feb380'), 0.8), 1); Lines.dashCircle(this.x, this.y, this.block.range, Time.time / 60);
  }
  info() { return [`Speeds up blocks in ${(this.block.range / TS).toFixed(0)} tiles by ${Math.round((this.block.speedBoost - 1) * 100)}%`]; }
}

Object.assign(BuildClasses, { Fracker, ForceProjector, OverdriveProjector });

// ---------------------------------------------------------------- bullets: shrapnel (fuse), absorbable lasers, ground flak, force fields
const _bulletsLaser = Bullets.laser;
Bullets.laser = function (type, owner, team, x, y, angle) {
  // Damage.collideLaser stops at blocks with absorbLasers (plastanium walls)
  let len = type.length;
  const ex = x + Angles.trnsx(angle, len), ey = y + Angles.trnsy(angle, len);
  let best = len;
  for (const b of Game.buildings) {
    if (b.team === team || b.dead || !b.block.absorbLasers) continue;
    if (segDist(x, y, ex, ey, b.x, b.y) <= b.hitSize / 2) best = Math.min(best, Math.max(0, Mathf.dst(x, y, b.x, b.y) - b.hitSize / 2));
  }
  if (best < len) {
    const t2 = Object.assign({}, type, { length: best + 4 });
    t2.colors = type.colors; t2._shrapnel = type._shrapnel;
    return _bulletsLaser.call(this, t2, owner, team, x, y, angle);
  }
  return _bulletsLaser.call(this, type, owner, team, x, y, angle);
};
const _laserDraw = Bullets.draw;
Bullets.draw = function () {
  // shrapnel lasers are drawn here and hidden from the default laser renderer
  const shr = this.lasers.filter(l => l.type.type === 'shrapnel');
  if (shr.length) {
    this.lasers = this.lasers.filter(l => l.type.type !== 'shrapnel');
    _laserDraw.call(this);
    this.lasers.push(...shr);
    for (const L of shr) {
      const t = L.type, fin = L.time / L.lifetime, fout = 1 - fin;
      Fill.set(lerpColorCss(Pal.white, t.toColor || Pal.lancerLaser, fin));
      const serr = Math.floor(L.len / 8);
      for (let i = 0; i < serr; i++) {
        const px = L.x + Angles.trnsx(L.angle, i * 8), py = L.y + Angles.trnsy(L.angle, i * 8);
        const sl = Mathf.clamp(fout - 0.5) * (80 - i * 10);
        if (sl <= 0) continue;
        Fill.triAngle(px, py, 4, sl, L.angle + 90); Fill.triAngle(px, py, 4, sl, L.angle - 90);
      }
      Fill.triAngle(L.x, L.y, t.width * fout, L.len + 4, L.angle);
      Fill.triAngle(L.x, L.y, t.width * fout, 10, L.angle + 180);
    }
    return;
  }
  _laserDraw.call(this);
};
const _bulletsCreate = Bullets.create;
Bullets.create = function (type, owner, team, x, y, angle, velScl, lifeScl, aimX, aimY) {
  if (type.type === 'shrapnel') return this.laser(type, owner, team, x, y, angle);
  return _bulletsCreate.call(this, type, owner, team, x, y, angle, velScl, lifeScl, aimX, aimY);
};

const _updateBullet = Bullets.updateBullet;
Bullets.updateBullet = function (b) {
  const t = b.type;
  // force projectors absorb enemy bullets
  for (const fp of forceProjectors) {
    if (fp.team === b.team || fp.dead || fp.broken) continue;
    if (Mathf.within(b.x, b.y, fp.x, fp.y, fp.realRadius()) && fp.contains(b.x, b.y)) { fp.absorb(b); b.removed = true; return; }
  }
  // flak that can hit ground units (cyclone)
  if (t.type === 'flak' && t.collidesGround && b.flakTimer < 0 && b.time > 4) {
    for (const u of Game.units) {
      if (u.team === b.team || u.dead || u.isFlying) continue;
      if (Mathf.within(b.x, b.y, u.x, u.y, t.explodeRange + u.type.hitSize / 2)) { b.flakTimer = 5; break; }
    }
  }
  _updateBullet.call(this, b);
};
let forceProjectors = [];
const _bulletsUpdate = Bullets.update;
Bullets.update = function () {
  forceProjectors = Game.buildings.filter(b => b instanceof ForceProjector && !b.dead);
  _bulletsUpdate.call(this);
};

// ---------------------------------------------------------------- content
defBlock('oil-extractor', 'Fracker', {
  requirements: req('copper', 150, 'graphite', 175, 'lead', 115, 'thorium', 115, 'silicon', 75), pumpAmount: 0.25, size: 3,
  liquidCapacity: 40, itemUseTime: 60, consumesPower: 3, hasPower: true, hasItems: true, hasLiquids: true, outputsLiquid: true,
  category: 'production', iconLayers: ['oil-extractor', 'oil-extractor-rotator', 'oil-extractor-top'],
});
defBlock('plastanium-compressor', 'GenericCrafter', {
  requirements: req('silicon', 80, 'lead', 115, 'graphite', 60, 'titanium', 80), hasItems: true, liquidCapacity: 60, craftTime: 60,
  outputItem: { item: Items.plastanium, amount: 1 }, size: 2, health: 320, hasPower: true, hasLiquids: true, consumesPower: 3,
  consumeItems: [{ item: Items.titanium, amount: 2 }], consumeLiquid: { liquid: 'oil', amount: 0.25 }, liquidInputs: ['oil'],
  craftEffect: 'smeltsmoke', fadeTop: true, category: 'crafting', flags: ['factory'],
});
defBlock('plastanium-wall', 'Wall', { requirements: req('plastanium', 5, 'metaglass', 2), health: 125 * wallHealthMultiplier, absorbLasers: true, category: 'defense', group: 'walls' });
defBlock('plastanium-wall-large', 'Wall', { requirements: req('plastanium', 20, 'metaglass', 8), health: 125 * wallHealthMultiplier * 4, size: 2, absorbLasers: true, category: 'defense', group: 'walls' });

defBlock('mend-projector', 'MendProjector', {
  requirements: req('lead', 100, 'titanium', 25, 'silicon', 40, 'copper', 50), consumesPower: 1.5, size: 2, reload: 250, range: 85,
  healPercent: 11, phaseBoost: 0, phaseRangeBoost: 0, scaledHealth: 80, category: 'effect', hasPower: true, hasItems: false, boostItem: null,
  iconLayers: ['mend-projector', 'mend-projector-top'],
});
defBlock('force-projector', 'ForceProjector', {
  requirements: req('lead', 100, 'titanium', 75, 'silicon', 125), size: 3, radius: 101.7, shieldHealth: 750, cooldownNormal: 1.5,
  cooldownLiquid: 1.2, cooldownBrokenBase: 0.35, consumesPower: 4, hasPower: true, coolant: 0.1, category: 'effect',
  iconLayers: ['force-projector', 'force-projector-top'],
});
defBlock('overdrive-projector', 'OverdriveProjector', {
  requirements: req('lead', 100, 'titanium', 75, 'silicon', 75, 'plastanium', 30), consumesPower: 3.5, size: 2, reload: 60, range: 80,
  speedBoost: 1.5, hasPower: true, category: 'effect', noOverdrive: true, iconLayers: ['overdrive-projector', 'overdrive-projector-top'],
});

// tier 4 turrets
const shrapnel = (damage, props = {}) => bullet('shrapnel', Object.assign({
  damage, length: 100, width: 17, lifetime: 10, pierceCap: -1, collidesAir: true, hitEffect: 'hitLancer', toColor: Pal.lancerLaser,
  ammoMultiplier: 4, buildingDamageMultiplier: 1, shootEffect: null, smokeEffect: null, speed: 0, rangeOverride: 100,
}, props));
defBlock('fuse', 'ItemTurret', {
  requirements: req('copper', 225, 'graphite', 225, 'thorium', 100), category: 'turret', reload: 35, shake: 4, range: 90, recoil: 5,
  spreadShots: 3, spreadAngle: 20, shootCone: 30, size: 3, scaledHealth: 220, shootSound: 'shootFuse', coolant: 0.3, rotateSpeed: 6,
  heatRegion: 'fuse-heat', targetAir: true, targetGround: true, iconLayers: ['block-3', 'fuse'],
  ammo: {
    titanium: shrapnel(66, { ammoMultiplier: 4, width: 17, reloadMultiplier: 1.3 }),
    thorium: shrapnel(105, { ammoMultiplier: 5, toColor: Pal.thoriumPink }),
  },
});
defBlock('cyclone', 'ItemTurret', {
  requirements: req('copper', 200, 'titanium', 125, 'plastanium', 80), category: 'turret', size: 3, reload: 10, range: 200, recoil: 1.5,
  rotateSpeed: 7, inaccuracy: 10, shootCone: 30, shootSound: 'shootCyclone', coolant: 0.3, scaledHealth: 145, shootY: 10,
  barrels: [[0, 1], [3, 0], [-3, 0]], targetAir: true, targetGround: true, iconLayers: ['block-3', 'cyclone-barrel-3', 'cyclone-barrel-2', 'cyclone-barrel-1', 'cyclone'],
  ammo: {
    metaglass: flak(4, 6, { ammoMultiplier: 2, shootEffect: 'shootSmall', reloadMultiplier: 0.8, width: 6, height: 11, splashDamage: 45, splashDamageRadius: 25, explodeRange: 20, collidesGround: true, backColor: Pal.glassAmmoBack, hitColor: Pal.glassAmmoBack, frontColor: Pal.glassAmmoFront, fragBullets: 4, fragBullet: basic(3, 12, { width: 5, height: 12, shrinkY: 1, lifetime: 20, backColor: col('454545'), frontColor: Pal.white, despawnEffect: null }) }),
    plastanium: flak(4, 8, { ammoMultiplier: 4, splashDamageRadius: 40, splashDamage: 37.5, explodeRange: 20, collidesGround: true, shootEffect: 'shootBig', frontColor: Pal.plastaniumFront, backColor: Pal.plastaniumBack, hitColor: Pal.plastaniumBack, fragBullets: 6, fragBullet: basic(2.5, 12, { width: 10, height: 12, shrinkY: 1, lifetime: 15, backColor: Pal.plastaniumBack, frontColor: Pal.plastaniumFront, despawnEffect: null }) }),
  },
});
const tsunamiShot = (liquid, props = {}) => liquidBullet(liquid, Object.assign({ lifetime: 49, speed: 4, knockback: 1.3, drag: 0.001, ammoMultiplier: 0.4, statusDuration: 240, damage: 0.2 }, props));
defBlock('tsunami', 'LiquidTurret', {
  requirements: req('metaglass', 100, 'lead', 400, 'titanium', 250, 'thorium', 100), category: 'turret', size: 3, reload: 3,
  alternateSpread: 4, shots: 2, velocityRnd: 0.1, inaccuracy: 3, recoil: 1, shootCone: 45, liquidCapacity: 40, range: 190, scaledHealth: 250,
  hasLiquids: true, rotateSpeed: 10, targetAir: true, targetGround: true, shootSound: null, iconLayers: ['block-3', 'tsunami', 'tsunami-top'],
  liquidAmmo: {
    water: tsunamiShot(Liquids.water, { knockback: 1.7 }),
    cryofluid: tsunamiShot(Liquids.cryofluid),
    oil: tsunamiShot(Liquids.oil, { status: 'tarred' }),
  },
});
BLOCKS.wave.liquidAmmo.oil = liquidBullet(Liquids.oil, { drag: 0.01, status: 'tarred' });
BLOCKS.ripple.ammo.plastanium = artillery(3.4, 40, {
  knockback: 1, lifetime: 80, width: 13, height: 15, splashDamageRadius: 30, splashDamage: 90, hitEffect: 'blastExplosion', hitShake: 0.6,
  fragBullets: 15, fragBullet: basic(2.5, 14, { width: 10, height: 12, shrinkY: 1, lifetime: 15, backColor: Pal.plastaniumBack, frontColor: Pal.plastaniumFront, despawnEffect: null, collidesAir: false }),
  backColor: Pal.plastaniumBack, frontColor: Pal.plastaniumFront, hitColor: Pal.plastaniumBack,
});

// fuse: three spread shrapnel blasts; cyclone: three barrels with their own recoil
const _turretShoot2 = Turret.prototype.shoot;
Turret.prototype.shoot = function (type) {
  const b = this.block;
  if (b.spreadShots) {
    const [bx, by] = this.bulletPos(0);
    for (let i = 0; i < b.spreadShots; i++) {
      const ang = this.turretRotation + (i - (b.spreadShots - 1) / 2) * b.spreadAngle;
      Bullets.create(type, this, this.team, bx, by, ang);
    }
    Fx.create('shootBig', bx, by, this.turretRotation);
    Audio2.play(b.shootSound, bx, by, 0.8);
    Render.shake(b.shake, b.shake * 2);
    this.curRecoil = 1; this.heat = 1; this.totalShots++;
    return;
  }
  if (b.barrels) {
    const i = this.totalShots % b.barrels.length;
    const [bxo, byo] = b.barrels[i];
    const r = this.turretRotation;
    const bx = this.x + Angles.trnsx(r - 90, bxo, b.shootY + byo), by = this.y + Angles.trnsy(r - 90, bxo, b.shootY + byo);
    Bullets.create(type, this, this.team, bx, by, r + Mathf.range(b.inaccuracy));
    Fx.create(type.shootEffect || 'shootSmall', bx, by, r, type.backColor);
    Audio2.play(b.shootSound, bx, by, 0.5);
    this.barrelRecoil = this.barrelRecoil || [0, 0, 0];
    this.barrelRecoil[i] = 1;
    this.curRecoil = 1; this.heat = 1; this.totalShots++;
    return;
  }
  _turretShoot2.call(this, type);
};
const _turretBody2 = Turret.prototype.drawTurretBody;
Turret.prototype.drawTurretBody = function () {
  const b = this.block;
  if (b.name !== 'cyclone') return _turretBody2.call(this);
  const r = this.turretRotation;
  this.barrelRecoil = this.barrelRecoil || [0, 0, 0];
  for (let i = 0; i < 3; i++) this.barrelRecoil[i] = Mathf.approach(this.barrelRecoil[i], 0, Time.delta / 10);
  const rx = this.x + Angles.trnsx(r, -this.curRecoil * b.recoil), ry = this.y + Angles.trnsy(r, -this.curRecoil * b.recoil);
  Draw.rect('block-3', this.x, this.y);
  for (let i = 3; i > 0; i--) {
    const my = -2 * this.barrelRecoil[i - 1];
    Draw.rect('cyclone-barrel-' + i, rx + Angles.trnsx(r - 90, 0, my), ry + Angles.trnsy(r - 90, 0, my), undefined, undefined, r - 90);
  }
  Draw.rect('cyclone', rx, ry, undefined, undefined, r - 90);
};

// tsunami: two alternating streams with velocity randomness
const _ltShoot = LiquidTurret.prototype.shoot;
LiquidTurret.prototype.shoot = function (type) {
  const b = this.block;
  if (b.name !== 'tsunami') return _ltShoot.call(this, type);
  for (let i = 0; i < b.shots; i++) {
    if (i > 0 && !this.hasAmmo()) break;
    const t = i === 0 ? type : this.useAmmo();
    const side = (this.totalShots % 2) ? 1 : -1;
    const [bx, by] = this.bulletPos(side * b.alternateSpread / 2);
    Bullets.create(t, this, this.team, bx, by, this.turretRotation + Mathf.range(b.inaccuracy), 1 - b.velocityRnd + Math.random() * b.velocityRnd);
    this.totalShots++;
  }
  this.curRecoil = 1;
};

Object.assign(DESCRIPTIONS, {
  'oil-extractor': 'Extracts oil from sand using large amounts of power, water and sand. Works best on darksand.',
  'plastanium-compressor': 'Produces plastanium from oil and titanium.',
  'plastanium-wall': 'A special type of wall that absorbs lasers (lancer, fuse) and blocks power node links.',
  'plastanium-wall-large': 'A special type of wall that absorbs lasers. Spans multiple tiles.',
  'mend-projector': 'An upgraded mender. Repairs blocks in a larger area.',
  'force-projector': 'Creates a hexagonal force field that absorbs enemy bullets. Breaks if it takes too much damage; water speeds up recovery.',
  'overdrive-projector': 'Increases the speed of nearby buildings by 50%.',
  'fuse': 'Fires three short-range piercing blasts of shrapnel. Accepts titanium and thorium.',
  'cyclone': 'Fires explosive flak at air and ground targets. Accepts metaglass and plastanium.',
  'tsunami': 'Shoots powerful streams of liquid. Water knocks enemies back; cryofluid freezes; oil slows them down.',
});
