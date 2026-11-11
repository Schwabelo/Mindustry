// Tier 2-3 content: thorium, salvo, ripple, wave, laser drill, thorium walls, large power node/battery,
// cryofluid mixer, and the wet/freezing status effects. Stats from content/Blocks.java, Items.java, StatusEffects.java.

defItem('thorium', 'f9a3c7', { hardness: 4, cost: 1.1, explosiveness: 0.2 });
Pal.thoriumAmmoBack = col('f595be');
Pal.thoriumAmmoFront = col('ffffff');

// ---------------------------------------------------------------- status effects (wet, freezing)
const STATUS = {
  wet: { speedMultiplier: 0.94, healthMultiplier: 1, transitionDamage: 14, color: col('4169e1') },
  freezing: { speedMultiplier: 0.6, healthMultiplier: 0.8, transitionDamage: 18, color: col('6ecdec') },
};
Unit.prototype.applyStatus = function (name, duration) {
  if (!this.statuses) this.statuses = {};
  if (name === 'burning') { if (this.statuses.wet || this.statuses.freezing) return; this.burnTime = Math.max(this.burnTime, duration); return; }
  if (name === 'wet' || name === 'freezing') this.burnTime = 0; // opposite(burning)
  this.statuses[name] = Math.max(this.statuses[name] || 0, duration);
};
Unit.prototype.statusMul = function (key) {
  let m = 1;
  if (this.statuses) for (const n in this.statuses) m *= STATUS[n][key];
  return m;
};
const _unitSpeed = Unit.prototype.speed;
Unit.prototype.speed = function () { return _unitSpeed.call(this) * this.statusMul('speedMultiplier'); };
const _unitDamage = Unit.prototype.damage;
Unit.prototype.damage = function (amount, pierce) { return _unitDamage.call(this, amount / this.statusMul('healthMultiplier'), pierce); };
const _unitUpdate = Unit.prototype.update;
Unit.prototype.update = function () {
  if (this.statuses) {
    for (const n in this.statuses) {
      this.statuses[n] -= Time.delta;
      if (this.statuses[n] <= 0) delete this.statuses[n];
      else if (Math.random() < 0.09 * Time.delta) Fx.create(n === 'wet' ? 'wetDrip' : n === 'tarred' ? 'tarFx' : 'freezeFx', this.x + Mathf.range(this.type.hitSize / 2), this.y + Mathf.range(this.type.hitSize / 2), 0, STATUS[n].color);
    }
  }
  _unitUpdate.call(this);
};
// wet + shocked (arc lightning) affinity: extra damage
const _lightningCreate = Lightning.create;
Lightning.create = function (team, color, damage, x, y, rotation, length, type) {
  const before = new Map(Game.units.map(u => [u, u.health]));
  _lightningCreate.call(this, team, color, damage, x, y, rotation, length, type);
  for (const u of Game.units) if (!u.dead && u.statuses && u.statuses.wet && before.has(u) && u.health < before.get(u)) u.damage(STATUS.wet.transitionDamage, true);
};
// bullets apply any status
Bullets.hitUnit = function (b, u) {
  const t = b.type;
  u.damage(t.damage);
  if (t.knockback) {
    const k = t.knockback / Math.max(u.type.hitSize / 8, 1);
    u.vx += Angles.trnsx(b.rotation, k); u.vy += Angles.trnsy(b.rotation, k);
  }
  if (t.status) u.applyStatus(t.status, t.statusDuration);
};

Object.assign(FX, {
  wetDrip: { life: 40, draw(e) { Fill.set(rgba(e.color || STATUS.wet.color, e.fout * 0.8)); Fill.circle(e.x, e.y - e.fin * 4, e.fout * 1.2); } },
  freezeFx: { life: 40, draw(e) { Fill.set(rgba(e.color || STATUS.freezing.color, e.fout)); Fill.square(e.x, e.y, e.fout * 1.2, 45); } },
  hitLiquid: { life: 16, draw(e) {
    Fill.set(rgba(e.color || Liquids.water.color, e.fout));
    randLen(e, 5, 1 + e.fin * 15, (x, y) => Fill.circle(e.x + x, e.y + y, e.fout * 1.6), e.rotation, 60);
  } },
  mineBig: { life: 30, draw(e) { Fill.set((e.color || Pal.stoneGray).css); randLen(e, 6, 4 + e.fin * 8, (x, y) => Fill.square(e.x + x, e.y + y, e.fout * 2 + 0.2, 45)); } },
});

// liquid bullets (LiquidBulletType): draw as an orb of liquid colour
const _bulletsDraw = Bullets.draw;
Bullets.draw = function () {
  for (const b of this.list) if (b.type.type === 'liquid') {
    Fill.set(b.type.liquid.color.css);
    Fill.circle(b.x, b.y, 1.5);
  }
  _bulletsDraw.call(this);
};
function liquidBullet(liquid, props = {}) {
  return bullet('liquid', Object.assign({
    liquid, speed: 3.5, damage: 0, lifetime: 34, statusDuration: 120, status: liquid.name === 'water' ? 'wet' : 'freezing',
    hitColor: liquid.color, backColor: liquid.color, ammoMultiplier: 1, despawnEffect: null, hitEffect: 'hitLiquid',
    smokeEffect: null, shootEffect: null, drag: 0.001, knockback: 0.55, collidesTiles: false,
  }, props));
}

// ---------------------------------------------------------------- turrets
class LiquidTurret extends Turret {
  hasAmmo() { const a = this.peekAmmo(); return !!a && this.liquid.amount >= 1 / a.ammoMultiplier; }
  peekAmmo() { return this.liquid && this.liquid.type ? this.block.liquidAmmo[this.liquid.type.name] || null : null; }
  useAmmo() { const a = this.peekAmmo(); this.removeLiquid(1 / a.ammoMultiplier); return a; }
  acceptItem() { return false; }
  acceptLiquid(source, l) {
    const lq = this.liquid;
    return !!this.block.liquidAmmo[l.name] && (lq.type === l || lq.amount < 0.2) && lq.amount < this.block.liquidCapacity;
  }
  draw() {
    const b = this.block, r = this.turretRotation;
    Draw.rect('block-' + b.size, this.x, this.y);
    Draw.rect(b.name, this.x, this.y, undefined, undefined, r - 90);
    const lq = this.liquid;
    if (lq.type && lq.amount > 0.01) {
      Draw.setAlpha(Mathf.clamp(lq.amount / b.liquidCapacity));
      Draw.rect(Assets.tinted(b.name + '-liquid', lq.type.color), this.x, this.y, undefined, undefined, r - 90);
      Draw.setAlpha(1);
    }
    Draw.rect(b.name + '-top', this.x, this.y, undefined, undefined, r - 90);
  }
  info() { return [this.liquid.type ? `${titleCase(this.liquid.type.name)}: ${this.liquid.amount.toFixed(1)}` : 'No liquid ammo']; }
}

// salvo: barrel + two side plates (DrawTurret RegionParts)
const _turretDrawBody = Turret.prototype.drawTurretBody;
Turret.prototype.drawTurretBody = function () {
  const b = this.block;
  if (b.name !== 'salvo') return _turretDrawBody.call(this);
  const r = this.turretRotation;
  this.partWarmup = Mathf.approach(this.partWarmup || 0, this.target ? 1 : 0, 0.05 * Time.delta);
  const w = this.partWarmup, rec = this.curRecoil;
  const at = (lx, ly) => [this.x + Angles.trnsx(r - 90, lx, ly), this.y + Angles.trnsy(r - 90, lx, ly)];
  Draw.rect('block-2', this.x, this.y);
  const [bx, by] = at(0, -2.5 * rec);
  Draw.rect('salvo-barrel', bx, by, undefined, undefined, r - 90);
  if (this.heat > 0.01) {
    Draw.additive(true); Draw.setAlpha(this.heat);
    Draw.rect(Assets.tinted('salvo-barrel-heat', col('ff3b1c')), bx, by, undefined, undefined, r - 90);
    Draw.setAlpha(1); Draw.additive(false);
  }
  for (const s of [-1, 1]) {
    const [sx, sy] = at(s * (0.6 * w + 0.5 * rec), -0.5 * rec);
    Draw.rect(s < 0 ? 'salvo-side-l' : 'salvo-side-r', sx, sy, undefined, undefined, r - 90 - s * (15 * w + 8 * rec));
  }
};

// ammoPerShot / consumeAmmoOnce=false (salvo uses ammo per bullet), minRange targeting (ripple)
const _itHasAmmo = ItemTurret.prototype.hasAmmo;
ItemTurret.prototype.hasAmmo = function () { return _itHasAmmo.call(this) && this.totalAmmo >= (this.block.ammoPerShot || 1); };
const _itUseAmmo = ItemTurret.prototype.useAmmo;
ItemTurret.prototype.useAmmo = function () {
  const t = _itUseAmmo.call(this);
  for (let i = 1; i < (this.block.ammoPerShot || 1) && this.ammo.length; i++) _itUseAmmo.call(this);
  return t;
};
const _turretShoot = Turret.prototype.shoot;
Turret.prototype.shoot = function (type) {
  const b = this.block;
  if (b.consumeAmmoOnce === false && b.shots > 1 && this.ammo) {
    // fire the first bullet now, each later bullet consumes its own ammo
    const shots = b.shots;
    b.shots = 1;
    _turretShoot.call(this, type);
    b.shots = shots;
    for (let i = 1; i < shots; i++) this.queued.push({ delay: b.shotDelay * i, run: () => {
      if (!this.hasAmmo()) return;
      const s = b.shots; b.shots = 1; _turretShoot.call(this, this.useAmmo()); b.shots = s;
    } });
    return;
  }
  if (b.velocityRnd) {
    // ripple: all shells at once with random velocity/lifetime scaling
    for (let i = 0; i < (b.shots || 1); i++) {
      const [bx, by] = this.bulletPos(0);
      const tr = type.speed * type.lifetime;
      let lifeScl = 1;
      if (this.aimX !== undefined) lifeScl = Mathf.clamp(Math.hypot(this.aimX - bx, this.aimY - by) / tr, (b.minRange || 0) / tr, this.range / tr) * Mathf.random(0.95, 1.08);
      Bullets.create(type, this, this.team, bx, by, this.turretRotation + Mathf.range(b.inaccuracy), 1 - b.velocityRnd + Math.random() * b.velocityRnd, lifeScl, this.aimX, this.aimY);
      Fx.create('shootBig', bx, by, this.turretRotation);
    }
    Audio2.play(b.shootSound, this.x, this.y, 0.7);
    if (b.shake) Render.shake(b.shake, b.shake * 2);
    this.curRecoil = 1; this.heat = 1; this.totalShots++;
    return;
  }
  _turretShoot.call(this, type);
};
const _findTarget = Turret.prototype.findTarget;
Turret.prototype.findTarget = function () {
  _findTarget.call(this);
  const mr = this.block.minRange;
  if (mr && this.target && Math.hypot(this.target.x - this.x, this.target.y - this.y) < mr) {
    // pick the closest target outside the minimum range
    let best = null, bd = Infinity;
    for (const u of Game.units) {
      if (u.team === this.team || u.dead || u.isFlying) continue;
      const d = Math.hypot(u.x - this.x, u.y - this.y);
      if (d >= mr && d - u.type.hitSize / 2 <= this.range && d < bd) { best = u; bd = d; }
    }
    this.target = best;
  }
};

defBlock('salvo', 'ItemTurret', {
  requirements: req('copper', 100, 'graphite', 80, 'titanium', 50), category: 'turret', size: 2, range: 190, reload: 29,
  consumeAmmoOnce: false, recoil: 0, shake: 1, shots: 4, shotDelay: 3, scaledHealth: 240, shootSound: 'shootSalvo',
  coolant: 0.2, rotateSpeed: 5, shootCone: 8, targetAir: true, targetGround: true, iconLayers: ['block-2', 'salvo-barrel', 'salvo-side-l', 'salvo-side-r'],
  ammo: {
    copper: basic(2.5, 15, { width: 7, height: 9, lifetime: 60, ammoMultiplier: 5, hitColor: Pal.copperAmmoBack, backColor: Pal.copperAmmoBack, frontColor: Pal.copperAmmoFront }),
    graphite: basic(3.5, 31, { width: 9, height: 12, ammoMultiplier: 4, lifetime: 60, reloadMultiplier: 0.8, rangeChange: 32, hitColor: Pal.graphiteAmmoBack, backColor: Pal.graphiteAmmoBack, frontColor: Pal.graphiteAmmoFront }),
    silicon: basic(3, 23, { width: 8, height: 10, homingPower: 0.2, reloadMultiplier: 1.5, ammoMultiplier: 5, lifetime: 60, trailLength: 5, trailWidth: 1.5, hitColor: Pal.siliconAmmoBack, backColor: Pal.siliconAmmoBack, frontColor: Pal.siliconAmmoFront, trailColor: Pal.siliconAmmoBack }),
    thorium: basic(4, 28, { width: 8, height: 13, shootEffect: 'shootBig', ammoMultiplier: 4, lifetime: 60, hitColor: Pal.thoriumAmmoBack, backColor: Pal.thoriumAmmoBack, frontColor: Pal.thoriumAmmoFront }),
  },
});
const rippleShell = (props) => artillery(3, 40, Object.assign({ knockback: 0.8, lifetime: 80, width: 12, height: 14, splashDamageRadius: 30 * 0.75, splashDamage: 70, hitEffect: 'blastExplosion', hitShake: 0.6 }, props));
defBlock('ripple', 'ItemTurret', {
  requirements: req('copper', 150, 'graphite', 135, 'titanium', 60), category: 'turret', size: 3, targetAir: false, targetGround: true,
  shots: 4, inaccuracy: 11, reload: 120, ammoPerShot: 2, velocityRnd: 0.2, recoil: 6, shake: 2, range: 290, minRange: 50,
  coolant: 0.3, scaledHealth: 130, shootSound: 'shootRipple', rotateSpeed: 3, shootCone: 10, heatRegion: 'ripple-heat',
  iconLayers: ['block-3', 'ripple'],
  ammo: {
    graphite: rippleShell({ backColor: Pal.graphiteAmmoBack, hitColor: Pal.graphiteAmmoBack, frontColor: Pal.graphiteAmmoFront }),
    silicon: rippleShell({ reloadMultiplier: 1.2, ammoMultiplier: 3, homingPower: 0.08, homingRange: 50, trailLength: 9, trailWidth: 3.1, backColor: Pal.siliconAmmoBack, hitColor: Pal.siliconAmmoBack, frontColor: Pal.siliconAmmoFront, trailColor: Pal.siliconAmmoBack }),
  },
});
defBlock('wave', 'LiquidTurret', {
  requirements: req('metaglass', 45, 'lead', 75, 'copper', 25), category: 'turret', size: 2, recoil: 0, reload: 3, inaccuracy: 5,
  shootCone: 50, liquidCapacity: 10, range: 110, scaledHealth: 250, hasLiquids: true, rotateSpeed: 10, targetAir: true, targetGround: true,
  shootSound: null, iconLayers: ['block-2', 'wave', 'wave-top'],
  liquidAmmo: { water: liquidBullet(Liquids.water, { knockback: 0.7, drag: 0.01 }), cryofluid: liquidBullet(Liquids.cryofluid, { drag: 0.01 }) },
});

// ---------------------------------------------------------------- production / power / defense
defBlock('laser-drill', 'Drill', {
  requirements: req('copper', 35, 'graphite', 30, 'silicon', 30, 'titanium', 20), drillTime: 280, size: 3, hasPower: true, tier: 4,
  consumesPower: 1.1, liquidUse: 0.08, category: 'production', hasItems: true,
  iconLayers: ['laser-drill', 'laser-drill-rotator', 'laser-drill-top'],
});
defBlock('thorium-wall', 'Wall', { requirements: req('thorium', 6), health: 200 * wallHealthMultiplier, category: 'defense', group: 'walls' });
defBlock('thorium-wall-large', 'Wall', { requirements: req('thorium', 24), health: 200 * wallHealthMultiplier * 4, size: 2, category: 'defense', group: 'walls' });
defBlock('power-node-large', 'PowerNode', {
  requirements: req('titanium', 5, 'lead', 10, 'silicon', 3), size: 2, maxNodes: 15, laserRange: 15, category: 'power', hasPower: true,
  configurable: true,
});
defBlock('battery-large', 'Battery', {
  requirements: req('titanium', 20, 'lead', 50, 'silicon', 30), size: 3, capacity: 50000, category: 'power', hasPower: true, flags: ['battery'],
  iconLayers: ['battery-large', 'battery-large-top'],
});

class CryofluidMixer extends Building {
  constructor(...a) { super(...a); this.waterIn = 0; this.progress = 0; }
  liquidAmount(l) { return l === Liquids.water ? this.waterIn : (this.liquid.type === l ? this.liquid.amount : 0); }
  acceptItem(source, item) { return item === Items.titanium && this.items[item.id] < this.block.itemCapacity; }
  acceptLiquid(source, l) { return l === Liquids.water && this.waterIn < this.block.liquidCapacity; }
  handleLiquid(source, l, amount) { if (l === Liquids.water) this.waterIn = Math.min(this.block.liquidCapacity, this.waterIn + amount); }
  canDumpLiquid(to) { return !(to instanceof Pump); }
  update() {
    const b = this.block, rate = 12 / 60 * Time.delta;
    if (this.liquid.type !== Liquids.cryofluid) { this.liquid.type = Liquids.cryofluid; this.liquid.amount = 0; }
    const can = this.has(Items.titanium) && this.waterIn >= rate && this.liquid.amount < b.liquidCapacity - rate;
    const eff = can ? this.efficiency : 0;
    this.warmup = Mathf.approach(this.warmup, eff > 0 ? 1 : 0, 0.019 * Time.delta);
    if (eff > 0) {
      this.waterIn -= rate * eff;
      this.liquid.amount = Math.min(b.liquidCapacity, this.liquid.amount + rate * eff);
      this.progress += Time.delta * eff / b.craftTime;
      if (this.progress >= 1) { this.progress %= 1; this.removeItem(Items.titanium); }
    }
    this.dumpLiquid(Liquids.cryofluid);
  }
  shouldConsume() { return this.has(Items.titanium) && this.waterIn > 0; }
  draw() {
    const b = this.block;
    Draw.rect(b.name + '-bottom', this.x, this.y);
    const hs = b.size * TS / 2 - 1.5;
    if (this.waterIn > 0.01) { Draw.setAlpha(Mathf.clamp(this.waterIn / b.liquidCapacity)); Fill.set(Liquids.water.color.css); Fill.square(this.x, this.y, hs); }
    if (this.liquid.amount > 0.01) { Draw.setAlpha(Mathf.clamp(this.liquid.amount / b.liquidCapacity)); Fill.set(Liquids.cryofluid.color.css); Fill.square(this.x, this.y, hs); }
    Draw.setAlpha(1);
    Draw.rect(b.name, this.x, this.y);
  }
  info() { return [`Water: ${this.waterIn.toFixed(1)} / ${this.block.liquidCapacity}`, `Cryofluid: ${this.liquid.amount.toFixed(1)}`]; }
}
Object.assign(BuildClasses, { LiquidTurret, CryofluidMixer });

defBlock('cryofluid-mixer', 'CryofluidMixer', {
  requirements: req('lead', 65, 'silicon', 40, 'titanium', 60), size: 2, hasPower: true, hasItems: true, hasLiquids: true,
  outputsLiquid: true, liquidCapacity: 36, craftTime: 120, consumesPower: 1, category: 'crafting', flags: ['factory'],
  iconLayers: ['cryofluid-mixer-bottom', 'cryofluid-mixer'],
});

Object.assign(DESCRIPTIONS, {
  'salvo': 'Fires quick salvos of four bullets. Accepts copper, graphite, silicon and thorium.',
  'ripple': 'Fires clusters of artillery shells over long distances at ground targets. Cannot hit targets that are too close.',
  'wave': 'Sprays liquid at enemies. Water makes them wet (slower, and the Arc shocks them for extra damage); cryofluid freezes them.',
  'laser-drill': 'A powerful drill that needs power. Capable of mining thorium.',
  'thorium-wall': 'A strong defensive block.',
  'thorium-wall-large': 'A strong defensive block. Spans multiple tiles.',
  'power-node-large': 'An advanced power node with greater range and more connections.',
  'battery-large': 'Stores much more power than a regular battery.',
  'cryofluid-mixer': 'Mixes water and titanium into cryofluid: a much better turret coolant than water.',
});
