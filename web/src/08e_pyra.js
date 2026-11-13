// Spore pods, pyratite, blast compound, fires, scorch + swarmer turrets.
// Stats from content/Blocks.java, Items.java, StatusEffects.java and entities/comp/FireComp.java.

defItem('spore-pod', '7457ce', { flammability: 1.15 });
defItem('pyratite', 'ffaa5f', { flammability: 1.4, explosiveness: 0.4 });
defItem('blast-compound', 'ff795e', { flammability: 0.4, explosiveness: 1.2 });
Items.sporePod = Items['spore-pod']; Items.blastCompound = Items['blast-compound'];
Pal.blastAmmoBack = col('e9665b'); Pal.blastAmmoFront = col('eeab89');
Pal.surgeAmmoBack = col('f3e979'); Pal.surgeAmmoFront = col('ffffff');
STATUS.blasted = { speedMultiplier: 1, healthMultiplier: 1, color: col('ff795e') };
FX.blastedFx = { life: 20, draw(e) { Fill.set(rgba(STATUS.blasted.color, e.fout)); Fill.circle(e.x, e.y, e.fout * 1.2); } };
const _apStatus2 = Unit.prototype.applyStatus;
Unit.prototype.applyStatus = function (name, duration) {
  // freezing + blasted affinity: 18 pierce damage
  if (name === 'blasted' && this.statuses && this.statuses.freezing) this.damage(STATUS.freezing.transitionDamage, true);
  _apStatus2.call(this, name, duration);
};

// ---------------------------------------------------------------- fires (FireComp)
const Fires = {
  map: new Map(),
  tileFlammability(tx, ty) {
    if (!World.inside(tx, ty)) return 0;
    const b = World.buildAt(tx, ty);
    if (!b) {
      const f = World.floorAt(tx, ty);
      return f.liquidDrop && Liquids[f.liquidDrop] ? (Liquids[f.liquidDrop].flammability || 0) : 0;
    }
    let r = 0;
    if (b.items && b.total > 0) {
      let s = 0;
      for (let i = 0; i < ITEMS.length; i++) if (b.items[i]) s += ITEMS[i].flammability * b.items[i];
      const cap = Math.max(b.block.itemCapacity, 1);
      r += s / cap * Mathf.clamp(cap / 2.4, 1, 3);
    }
    if (b.liquid && b.liquid.type && b.liquid.amount > 0) {
      r += (b.liquid.type.flammability || 0) * b.liquid.amount / 1.6 / Math.max(b.block.liquidCapacity, 1) * Mathf.clamp(b.block.liquidCapacity / 30, 1, 2);
    }
    return r;
  },
  create(tx, ty) {
    if (!World.inside(tx, ty)) return; // Fires.create: no floor check, fires without fuel burn out 8x faster
    const i = ty * World.w + tx;
    let fire = this.map.get(i);
    if (fire) { fire.lifetime = 1000; fire.time = 0; return; }
    this.map.set(i, { tx, ty, time: 0, lifetime: 1000, warmup: 0, anim: Math.random() * 40, spread: Math.random() * 22, dmg: Math.random() * 40 });
  },
  createWorld(x, y) { this.create(Math.round(x / TS), Math.round(y / TS)); },
  extinguish(tx, ty) { this.map.delete(ty * World.w + tx); },
  update() {
    for (const [i, f] of this.map) {
      f.anim = (f.anim + Time.delta / (90 / 40)) % 40;
      f.warmup += Time.delta;
      // FireComp: rain (water attribute) makes fires burn out faster
      const env = typeof Weather !== 'undefined' && Weather.env ? Math.max(Weather.env('water') * 10, 0) : 0;
      f.time = Math.min(f.time + Time.delta * (1 + env), f.lifetime);
      if (f.time >= f.lifetime) { this.map.delete(i); continue; }
      const b = World.buildAt(f.tx, f.ty);
      const flam = this.tileFlammability(f.tx, f.ty);
      if (!b && flam <= 0) f.time += Time.delta * 8;
      if (b) f.lifetime += Mathf.clamp(flam / 8, 0, 0.6) * Time.delta;
      if (flam > 1 && (f.spread += Time.delta * Mathf.clamp(flam / 5, 0.3, 2)) >= 22) {
        f.spread = 0;
        const [dx, dy] = Geometry.d4[Math.floor(Math.random() * 4)];
        this.create(f.tx + dx, f.ty + dy);
      }
      // flammable fires throw fireballs (Bullets.fireball) that start new fires nearby
      if (flam > 0 && (f.fireball = (f.fireball ?? Math.random() * 40) + Time.delta * Mathf.clamp(flam / 10, 0, 0.5)) >= 40) {
        f.fireball = 0;
        Fireballs.create(f.tx * TS, f.ty * TS, Math.random() * 360);
      }
      if ((f.dmg += Time.delta) >= 40) {
        f.dmg = 0;
        if (b && !b.dead) b.damage(1.8);
        const wx = f.tx * TS, wy = f.ty * TS;
        for (const u of Game.units) {
          if (u.dead || u.isFlying || !Mathf.within(u.x, u.y, wx, wy, TS)) continue;
          u.damage(3); u.applyStatus('burning', 300);
        }
      }
      if (Math.random() < 0.04 * Time.delta) Fx.create('fuelburn', f.tx * TS + Mathf.range(3), f.ty * TS + Mathf.range(3));
    }
  },
  draw() {
    const v = Render.view();
    for (const f of this.map.values()) {
      const x = f.tx * TS, y = f.ty * TS;
      if (x < v.x1 - 10 || x > v.x2 + 10 || y < v.y1 - 10 || y > v.y2 + 10) continue;
      Draw.setAlpha(Mathf.clamp(f.warmup / 20) * Mathf.clamp((f.lifetime - f.time) / 40));
      Draw.rect('fire' + (Math.floor(f.anim) % 40), x, y + 2);
    }
    Draw.setAlpha(1);
  },
};

// bullets that set fires; water/cryo bullets put fires out; lightning on hit (surge ammo)
const _hit2 = Bullets.hit;
Bullets.hit = function (b, x, y) {
  const t = b.type;
  if (t.makeFire) Fires.createWorld(x, y);
  // splash damage also applies the bullet's status (Damage.damage with status)
  if (t.status && t.splashDamageRadius > 0) {
    for (const u of Game.units) {
      if (u.team === b.team || u.dead || (u.isFlying ? !t.collidesAir : !t.collidesGround)) continue;
      if (Mathf.within(u.x, u.y, x, y, t.splashDamageRadius + u.type.hitSize / 2)) u.applyStatus(t.status, t.statusDuration || 60);
    }
  }
  // (bullet lightning is spawned once, in the Bullets.hit wrapper of 08g_tier45.js)
  _hit2.call(this, b, x, y);
};
const _ub2 = Bullets.updateBullet;
Bullets.updateBullet = function (b) {
  const t = b.type;
  if (t.status === 'burning' && t.type === 'flame' && Math.random() < 0.02) Fires.createWorld(b.x, b.y);
  _ub2.call(this, b);
};
const _hitUnit2 = Bullets.hitUnit;
Bullets.hitUnit = function (b, u) {
  _hitUnit2.call(this, b, u);
  if (b.type.status === 'blasted') u.applyStatus('blasted', 60);
};

// Damage.dynamicExplosion: lightning from stored power, fireballs from flammability, and up to 25 growing damage waves of
// explosiveness / 2 each
function dynamicExplosion(x, y, flam, expl, power, radius, fire = true) {
  for (let i = 0; i < Mathf.clamp(power / 700, 0, 8); i++) Lightning.create('derelict', Pal.powerLight, 3, x, y, Math.random() * 360, 5 + Mathf.clamp(Math.floor(power / 500), 1, 20) + Math.round(Mathf.range(2)), { collidesAir: true });
  if (fire) for (let i = 0; i < Mathf.clamp(flam / 4, 0, 30); i++) Fireballs.create(x, y, Math.random() * 360);
  const waves = expl <= 2 ? 0 : Mathf.clamp(Math.floor(expl / 11), 1, 25);
  for (let i = 0; i < waves; i++) Damage.splash(null, x, y, Mathf.clamp(radius + expl, 0, 50) * ((i + 1) / waves), expl / 2, true, true, 1);
  if (expl > 2) Fx.create('blockExplode', x, y, 0, null, Math.min(radius / 4 + expl / 20, 6));
  const shake = Math.min(expl / 4 + 3, 9);
  Render.shake(shake, shake);
}
// fireballs (Bullets.fireball: speed 1, drag 0.03): leave fires along the way (4% per tick) and where they stop
const Fireballs = {
  list: [],
  create(x, y, ang) { this.list.push({ x, y, vx: Angles.trnsx(ang, 1), vy: Angles.trnsy(ang, 1), life: 40 }); },
  update() {
    for (const f of this.list) {
      f.x += f.vx * Time.delta; f.y += f.vy * Time.delta;
      const d = Math.max(1 - 0.03 * Time.delta, 0); f.vx *= d; f.vy *= d;
      if (Math.random() < 0.04 * Time.delta) Fires.createWorld(f.x, f.y);
      if ((f.life -= Time.delta) <= 0) Fires.createWorld(f.x, f.y);
    }
    this.list = this.list.filter(f => f.life > 0);
  },
};
// Building.onDestroyed: items (explosiveness, flammability, charge), liquids and stored power feed the explosion
function buildingExplosion(b) {
  let expl = b.block.baseExplosiveness || 0, flam = 0, power = 0;
  if (b.items) for (let i = 0; i < ITEMS.length; i++) if (b.items[i]) {
    expl += ITEMS[i].explosiveness * b.items[i]; flam += ITEMS[i].flammability * b.items[i];
    power += (ITEMS[i].charge || 0) * Math.pow(b.items[i], 1.1) * 150;
  }
  if (b.liquid && b.liquid.type) { flam += (b.liquid.type.flammability || 0) * b.liquid.amount / 2; expl += (b.liquid.type.explosiveness || 0) * b.liquid.amount / 2; }
  if (b.block.cls === 'Battery') power += b.power.stored;
  if (b.block.cls === 'Core') return; // the core ends the game anyway
  dynamicExplosion(b.x, b.y, flam, expl * 3.5, power, TS * b.block.size / 2);
}

// ---------------------------------------------------------------- crafters
class Cultivator extends GenericCrafter {
  constructor(...a) {
    super(...a);
    let s = 0;
    this.eachTile((x, y) => { s += World.floorAt(x, y).spores || 0; });
    this.attrBoost = Math.min(this.block.maxBoost, s);
  }
  get efficiency() { return super.efficiency * (1 + this.attrBoost); }
  draw() {
    const n = this.block.name;
    Draw.rect(n + '-bottom', this.x, this.y);
    drawLiquidFill(this, null, 3);
    Draw.rect(n, this.x, this.y);
    if (this.warmup > 0.01) {
      // DrawCultivator: pulsing spore bubbles
      Fill.set(rgba(col('9e78dc'), this.warmup * 0.8));
      for (let i = 0; i < 5; i++) {
        const t = (this.totalProgress / 40 + i * 0.37) % 1;
        Fill.circle(this.x + Math.sin(i * 7.1) * 3.5, this.y + Math.cos(i * 3.3) * 3.5, Mathf.slope(t) * 1.6);
      }
    }
    Draw.rect(n + '-top', this.x, this.y);
  }
  info() { return [`Spore pods: ${(60 / this.block.craftTime * (1 + this.attrBoost)).toFixed(2)}/s at full speed${this.attrBoost ? ` (+${Math.round(this.attrBoost * 100)}% from moss)` : ''}`, `Water: ${(this.liquid.amount || 0).toFixed(1)}/${this.block.liquidCapacity}`]; }
}

// items in, liquid out (spore press)
class LiquidCrafter extends Building {
  constructor(...a) { super(...a); this.progress = 0; this.pist = 0; }
  acceptItem(source, item) { return this.block.consumeItems.some(c => c.item === item) && this.items[item.id] < this.block.itemCapacity; }
  acceptLiquid() { return false; }
  shouldConsume() { return this.block.consumeItems.every(c => this.has(c.item, c.amount)); }
  update() {
    const b = this.block, out = Liquids[b.outputLiquid.liquid];
    if (this.liquid.type !== out) { this.liquid.type = out; this.liquid.amount = 0; }
    const can = this.shouldConsume() && this.liquid.amount < b.liquidCapacity;
    const eff = can ? this.efficiency : 0;
    this.warmup = Mathf.approach(this.warmup, eff > 0 ? 1 : 0, 0.02 * Time.delta);
    if (eff > 0) {
      this.liquid.amount = Math.min(b.liquidCapacity, this.liquid.amount + b.outputLiquid.amount * Time.delta * eff);
      this.progress += Time.delta * eff / b.craftTime;
      this.pist += Time.delta * eff;
      if (this.progress >= 1) { this.progress %= 1; for (const c of b.consumeItems) this.removeItem(c.item, c.amount); }
    }
    this.dumpLiquid(out);
  }
  draw() {
    const n = this.block.name;
    Draw.rect(n + '-bottom', this.x, this.y);
    const off = Math.sin(this.pist / 8) * 1.2;
    for (let i = 0; i < 4; i++) {
      const a = i * 90;
      Draw.rect(n + '-piston' + (i % 2), this.x + Angles.trnsx(a, off), this.y + Angles.trnsy(a, off), undefined, undefined, a);
    }
    Draw.rect(n, this.x, this.y);
    drawLiquidFill(this, n + '-liquid');
    Draw.rect(n + '-top', this.x, this.y);
  }
  info() { return [`${this.block.consumeItems.map(c => c.amount + ' ' + c.item.name).join(' + ')} → ${(this.block.outputLiquid.amount * 60).toFixed(0)} ${this.block.outputLiquid.liquid}/s`]; }
}
Object.assign(BuildClasses, { Cultivator, LiquidCrafter });

defBlock('cultivator', 'Cultivator', {
  requirements: req('copper', 25, 'lead', 25, 'silicon', 10), outputItem: { item: Items.sporePod, amount: 1 }, craftTime: 100, size: 2,
  hasLiquids: true, hasPower: true, hasItems: true, liquidCapacity: 80, maxBoost: 2, consumesPower: 80 / 60,
  consumeItems: [], consumeLiquid: { liquid: 'water', amount: 18 / 60 }, liquidInputs: ['water'], category: 'production',
  iconLayers: ['cultivator-bottom', 'cultivator', 'cultivator-top'], craftEffect: null,
});
defBlock('spore-press', 'LiquidCrafter', {
  requirements: req('lead', 35, 'silicon', 30), liquidCapacity: 60, craftTime: 20, outputLiquid: { liquid: 'oil', amount: 18 / 60 },
  size: 2, health: 320, hasLiquids: true, hasPower: true, hasItems: true, outputsLiquid: true, consumesPower: 0.7,
  consumeItems: [{ item: Items.sporePod, amount: 1 }], category: 'crafting', iconLayers: ['spore-press-bottom', 'spore-press', 'spore-press-top'],
});
defBlock('pyratite-mixer', 'GenericCrafter', {
  requirements: req('copper', 50, 'lead', 25), hasItems: true, hasPower: true, outputItem: { item: Items.pyratite, amount: 1 }, size: 2,
  consumesPower: 0.2, craftTime: 80, consumeItems: [{ item: Items.coal, amount: 1 }, { item: Items.lead, amount: 2 }, { item: Items.sand, amount: 2 }],
  category: 'crafting', flags: ['factory'],
});
defBlock('blast-mixer', 'GenericCrafter', {
  requirements: req('lead', 30, 'titanium', 20), hasItems: true, hasPower: true, outputItem: { item: Items.blastCompound, amount: 1 }, size: 2,
  consumesPower: 0.4, craftTime: 80, consumeItems: [{ item: Items.pyratite, amount: 1 }, { item: Items.sporePod, amount: 1 }],
  category: 'crafting', flags: ['factory'],
});

// ---------------------------------------------------------------- ammo additions
BLOCKS.hail.ammo.pyratite = artillery(3, 25, { hitEffect: 'blastExplosion', knockback: 0.8, lifetime: 80, width: 13, height: 13, splashDamageRadius: 25 * 0.75, splashDamage: 45, status: 'burning', statusDuration: 720, frontColor: Pal.lightishOrange, backColor: Pal.lightOrange, hitColor: Pal.lightishOrange, trailColor: Pal.lightishOrange, makeFire: true, ammoMultiplier: 4 });
BLOCKS.salvo.ammo.pyratite = basic(3.2, 25, { width: 10, height: 12, frontColor: Pal.lightishOrange, hitColor: Pal.lightishOrange, backColor: Pal.lightOrange, status: 'burning', statusDuration: 480, ammoMultiplier: 5, splashDamage: 15, splashDamageRadius: 22, makeFire: true, lifetime: 60 });
BLOCKS.ripple.ammo.pyratite = artillery(3, 48, { hitEffect: 'blastExplosion', knockback: 0.8, lifetime: 80, width: 13, height: 15, splashDamageRadius: 30 * 0.75, splashDamage: 90, status: 'burning', statusDuration: 720, frontColor: Pal.lightishOrange, backColor: Pal.lightOrange, hitColor: Pal.lightOrange, makeFire: true, ammoMultiplier: 4, hitShake: 0.6 });
BLOCKS.ripple.ammo['blast-compound'] = artillery(2, 40, { hitEffect: 'blastExplosion', knockback: 0.8, lifetime: 80, width: 14, height: 16, ammoMultiplier: 4, splashDamageRadius: 50 * 0.75, splashDamage: 90, status: 'blasted', backColor: Pal.blastAmmoBack, hitColor: Pal.blastAmmoBack, frontColor: Pal.blastAmmoFront, hitShake: 0.8 });
BLOCKS.cyclone.ammo['blast-compound'] = flak(4, 8, { shootEffect: 'shootBig', ammoMultiplier: 5, splashDamage: 45, splashDamageRadius: 60, collidesGround: true, explodeRange: 20, status: 'blasted', backColor: Pal.blastAmmoBack, hitColor: Pal.blastAmmoBack, frontColor: Pal.blastAmmoFront });

// ---------------------------------------------------------------- scorch + swarmer
const scorchFlame = (speed, damage, props) => bullet('flame', Object.assign({
  speed, damage, hitSize: 7, lifetime: 18, pierce: true, collidesAir: false, status: 'burning', keepVelocity: false,
  hitEffect: 'hitFlameSmall', despawnEffect: null, shootEffect: 'shootSmallFlame', smokeEffect: null, pierceBuilding: false,
}, props));
defBlock('scorch', 'ItemTurret', {
  requirements: req('copper', 25, 'graphite', 22), category: 'turret', recoil: 0, reload: 6, coolant: 0.1, coolantMultiplier: 1.5, range: 60,
  shootY: 3, shootCone: 50, targetAir: false, targetGround: true, health: 400, rotateSpeed: 8, shootSound: 'shootFlame', heatRegion: 'scorch-heat',
  iconLayers: ['block-1', 'scorch'],
  ammo: {
    coal: scorchFlame(3.35, 17, { ammoMultiplier: 3, statusDuration: 240 }),
    pyratite: scorchFlame(4, 30, { ammoMultiplier: 10, statusDuration: 600 }),
  },
});
const swarmMissile = (dmg, props) => missile(3.7, dmg, Object.assign({ width: 8, height: 8, shrinkY: 0, hitEffect: 'blastExplosion', despawnEffect: 'blastExplosion' }, props));
defBlock('swarmer', 'ItemTurret', {
  requirements: req('graphite', 35, 'titanium', 35, 'plastanium', 45, 'silicon', 30), category: 'turret', size: 2, shootY: 4.5,
  reload: 60 * 4 / 7, inaccuracy: 10, range: 240, consumeAmmoOnce: false, scaledHealth: 300, rotateSpeed: 4, coolant: 0.3,
  barrels: [[-4, -1.25], [0, 0], [4, -1.25]], shots: 4, shotDelay: 5, shootSound: 'shootMissile', targetAir: true, targetGround: true,
  iconLayers: ['block-2', 'swarmer'],
  ammo: {
    'blast-compound': swarmMissile(10, { splashDamageRadius: 30, splashDamage: 45, ammoMultiplier: 5, status: 'blasted', hitColor: Pal.blastAmmoBack, backColor: Pal.blastAmmoBack, trailColor: Pal.blastAmmoBack, frontColor: Pal.blastAmmoFront }),
    pyratite: swarmMissile(12, { frontColor: Pal.lightishOrange, backColor: Pal.lightOrange, width: 7, homingPower: 0.08, splashDamageRadius: 20, splashDamage: 45, makeFire: true, ammoMultiplier: 5, status: 'burning', statusDuration: 480 }),
  },
});
// barrels + multiple shots per reload (swarmer); single-shot barrel cycling stays for the cyclone
const _shoot3 = Turret.prototype.shoot;
Turret.prototype.shoot = function (type) {
  const b = this.block;
  if (!(b.barrels && b.shots > 1)) return _shoot3.call(this, type);
  const fire = (t) => {
    if (this.dead) return;
    const i = this.totalShots % b.barrels.length;
    const [bxo, byo] = b.barrels[i];
    const r = this.turretRotation;
    const bx = this.x + Angles.trnsx(r - 90, bxo, b.shootY + byo), by = this.y + Angles.trnsy(r - 90, bxo, b.shootY + byo);
    Bullets.create(t, this, this.team, bx, by, r + Mathf.range(b.inaccuracy));
    Fx.create('shootSmall', bx, by, r);
    Audio2.play(b.shootSound, bx, by, 0.4);
    this.curRecoil = 1; this.heat = 1; this.totalShots++;
  };
  fire(type);
  for (let s = 1; s < b.shots; s++) this.queued.push({ delay: b.shotDelay * s, run: () => { if (this.hasAmmo()) fire(this.useAmmo()); } });
};
BLOCKS.swarmer.heatRegion = null;

Object.assign(DESCRIPTIONS, {
  'cultivator': 'Grows spore pods from water and power. Faster on moss.',
  'spore-press': 'Presses spore pods into oil.',
  'pyratite-mixer': 'Mixes coal, lead and sand into pyratite: incendiary ammo for hail, salvo, ripple and swarmer.',
  'blast-mixer': 'Mixes pyratite and spore pods into blast compound: explosive ammo for ripple, cyclone and swarmer.',
  'scorch': 'A short-range flamethrower that sets ground enemies on fire. Burns coal or pyratite.',
  'swarmer': 'Fires homing missile swarms at air and ground. Accepts blast compound and pyratite.',
});

// Attribute.spores (Blocks.java): moss 0.15, spore moss 0.3, tainted water 0.15, deep tainted water 0.15, darksand tainted water 0.1
FLOOR.moss.spores = 0.15; FLOOR['spore-moss'].spores = 0.3; FLOOR['tainted-water'].spores = 0.15; FLOOR['deep-tainted-water'].spores = 0.15; FLOOR['darksand-tainted-water'].spores = 0.1;
BLOCKS.battery.baseExplosiveness = 1; BLOCKS['battery-large'].baseExplosiveness = 5;
