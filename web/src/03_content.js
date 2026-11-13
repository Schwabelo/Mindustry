// Content: items, bullets, units, blocks. Stats copied from core/src/mindustry/content/*.java

// ---------------------------------------------------------------- items
const ITEMS = [];
const Items = {};
function defItem(name, color, props = {}) {
  const it = Object.assign({ name, id: ITEMS.length, color: col(color), hardness: 0, cost: 1, flammability: 0, explosiveness: 0, icon: 'item-' + name }, props);
  ITEMS.push(it); Items[name] = it;
  return it;
}
defItem('copper', 'd99d73', { hardness: 1, cost: 0.5 });
defItem('lead', '8c7fa9', { hardness: 1, cost: 0.7 });
defItem('metaglass', 'ebeef5', { cost: 1.5 });
defItem('graphite', 'b2c6d2', { cost: 1 });
defItem('sand', 'f7cba4', { lowPriority: true });
defItem('coal', '272727', { hardness: 2, flammability: 1, explosiveness: 0.2 });
defItem('titanium', '8da1e3', { hardness: 3, cost: 1 });
defItem('scrap', '777777', { cost: 0.5 });
defItem('silicon', '53565c', { cost: 0.8 });

function req(...args) { const out = []; for (let i = 0; i < args.length; i += 2) out.push({ item: Items[args[i]], amount: args[i + 1] }); return out; }

// ---------------------------------------------------------------- bullets
function bullet(type, props) {
  return Object.assign({
    type, speed: 1, damage: 1, lifetime: 40, hitSize: 4, width: 5, height: 7, shrinkY: 0.5,
    sprite: 'bullet', frontColor: Pal.bulletYellow, backColor: Pal.bulletYellowBack, hitColor: null, trailColor: null,
    collidesAir: true, collidesGround: true, collidesTiles: true, collides: true, pierce: false, pierceCap: -1, pierceBuilding: false,
    splashDamage: 0, splashDamageRadius: -1, knockback: 0, homingPower: 0, homingRange: 50,
    buildingDamageMultiplier: 1, status: null, statusDuration: 480, ammoMultiplier: 2, reloadMultiplier: 1, rangeChange: 0,
    trailLength: 0, trailWidth: 2, keepVelocity: true, inaccuracy: 0, healPercent: 0, collidesTeam: false,
    hitEffect: 'hitBulletColor', despawnEffect: 'hitBulletColor', shootEffect: 'shootSmall', smokeEffect: 'shootSmallSmoke',
    drag: 0, scaleLife: false, fragBullets: 0, fragBullet: null, makeFire: false, hitShake: 0, hitSound: null,
  }, props);
}
function basic(speed, damage, props = {}) { return bullet('basic', Object.assign({ speed, damage }, props)); }
function artillery(speed, damage, props = {}) {
  return bullet('artillery', Object.assign({
    speed, damage, sprite: 'shell', collidesTiles: false, collides: false, collidesAir: false, scaleLife: true,
    hitShake: 1, hitSound: 'explosionArtillery', hitEffect: 'flakExplosion', shootEffect: 'shootBig', shrinkY: 0,
  }, props));
}
function flak(speed, damage, props = {}) {
  return bullet('flak', Object.assign({
    speed, damage, sprite: 'shell', splashDamage: 15, splashDamageRadius: 34, width: 8, height: 10, collidesGround: false,
    hitEffect: 'flakExplosion', explodeRange: 30, shrinkY: 0,
  }, props));
}
function bolt(speed, damage, props = {}) {
  return bullet('bolt', Object.assign({ speed, damage, width: 2, height: 7, smokeEffect: 'hitLaserColor', shootEffect: 'shootSmallColor' }, props));
}

// ---------------------------------------------------------------- weapons & units
function weapon(sprite, props) {
  return Object.assign({
    sprite, x: 5, y: 0, shootY: 3, reload: 1, mirror: true, alternate: true, top: true, rotate: false, rotateSpeed: 20,
    recoil: 1.5, shots: 1, shotDelay: 0, inaccuracy: 0, shootCone: 5, minShootVelocity: -1, ignoreRotation: false,
    shootSound: 'shoot', bullet: null, shootOnDeath: false, ejectEffect: 'casing1', shake: 0, velocityRnd: 0,
  }, props);
}

const UNITS = {};
function defUnit(name, props) {
  const u = Object.assign({
    name, health: 200, speed: 1.1, hitSize: 6, armor: 0, flying: false, lowAltitude: false, mech: false,
    rotateSpeed: 5, accel: 0.5, drag: 0.3, omniMovement: true, faceTarget: true, circleTarget: false, circleTargetRadius: 80,
    targetAir: true, targetGround: true, engineOffset: 5, engineSize: 2.5, itemCapacity: 0, mineSpeed: 0, mineTier: -1,
    buildSpeed: -1, weapons: [], cell: false, mechSideSway: 0.54, mechFrontSway: 0.1, mechStride: -1, canBoost: false,
    targetFlags: null, autoDropBombs: false, range: -1, crawler: false, legColor: Pal.darkMetal,
  }, props);
  if (u.mechStride < 0) u.mechStride = 4 + (u.hitSize - 8) / 2.1;
  if (u.range < 0) {
    u.range = 0;
    for (const w of u.weapons) if (w.bullet) u.range = Math.max(u.range, (w.bullet.rangeOverride || w.bullet.speed * w.bullet.lifetime));
  }
  UNITS[name] = u;
  return u;
}

defUnit('alpha', {
  flying: true, lowAltitude: true, mineSpeed: 6.5, mineTier: 1, buildSpeed: 0.5, drag: 0.05, speed: 3, rotateSpeed: 15,
  accel: 0.1, itemCapacity: 30, health: 150, engineOffset: 6, hitSize: 8, cell: true,
  weapons: [weapon('small-basic-weapon', {
    reload: 17, x: 2.75, y: 1, top: false, shootSound: 'shootAlpha', ejectEffect: null,
    bullet: bolt(2.5, 11, {
      width: 1.5, height: 4.5, lifetime: 60, buildingDamageMultiplier: 0.01, homingPower: 0.02,
      backColor: Pal.yellowBoltFront, frontColor: Pal.white, hitColor: Pal.yellowBoltFront, trailLength: 3, trailWidth: 1.2,
    }),
  })],
});

defUnit('dagger', {
  speed: 0.5, hitSize: 8, health: 150, mech: true,
  weapons: [weapon('large-weapon', { reload: 13, x: 4, y: 2, top: false, bullet: basic(2.5, 9, { width: 7, height: 9, lifetime: 60 }) })],
});

defUnit('mace', {
  immuneBurning: true, // immunities.add(StatusEffects.burning)
  speed: 0.5, hitSize: 10, health: 550, armor: 4, mech: true, cell: true,
  weapons: [weapon('flamethrower', {
    top: false, shootSound: 'shootFlame', shootY: 2, reload: 22, recoil: 1, ejectEffect: null,
    bullet: bullet('flame', {
      speed: 4.2, damage: 37 * 2, hitSize: 7, lifetime: 13, pierce: true, pierceBuilding: true, pierceCap: 2,
      statusDuration: 300, status: 'burning', keepVelocity: false, hitEffect: 'hitFlameSmall', despawnEffect: null,
      shootEffect: 'shootSmallFlame', smokeEffect: null,
    }),
  })],
});

defUnit('fortress', {
  speed: 0.43, hitSize: 13, rotateSpeed: 3, targetAir: false, health: 900, armor: 9, mech: true, mechFrontSway: 0.55, cell: true,
  weapons: [weapon('artillery', {
    top: false, y: 1, x: 9, reload: 60, recoil: 4, shake: 2, ejectEffect: 'casing2', shootSound: 'shootArtillery',
    bullet: artillery(2, 20, {
      hitEffect: 'blastExplosion', knockback: 0.8, lifetime: 120 - (35 - 8) / 2, width: 14, height: 14, collides: true, collidesTiles: true,
      splashDamageRadius: 35, splashDamage: 80, backColor: Pal.bulletYellowBack, frontColor: Pal.bulletYellow, scaleLife: false,
    }),
  })],
});

defUnit('crawler', {
  speed: 1, hitSize: 8, health: 150, mech: true, mechSideSway: 0.25, range: 40, crawler: true, cell: true,
  weapons: [],
  explode: { splashDamage: 80, splashDamageRadius: 44, buildingDamageMultiplier: 0.68, triggerRange: 25 },
});

defUnit('flare', {
  speed: 2.7, accel: 0.08, drag: 0.04, flying: true, health: 70, engineOffset: 5.75, hitSize: 9, circleTarget: true,
  omniMovement: false, rotateSpeed: 5, circleTargetRadius: 60, targetFlags: ['generator'],
  weapons: [weapon(null, {
    y: 1, x: 0, minShootVelocity: 2, shootCone: 10, reload: 80, shots: 3, shotDelay: 3, mirror: false, ejectEffect: 'casing1',
    bullet: basic(2.5, 9, { inaccuracy: 4, width: 7, height: 9, lifetime: 32, ammoMultiplier: 2 }),
  })],
});

defUnit('horizon', {
  health: 340, speed: 1.65, accel: 0.08, drag: 0.03, flying: true, hitSize: 11, targetAir: false, engineOffset: 7.8, range: 140,
  faceTarget: false, autoDropBombs: true, armor: 3, targetFlags: ['factory'], circleTarget: true, omniMovement: false,
  rotateSpeed: 4.5, circleTargetRadius: 40, cell: true,
  weapons: [weapon(null, {
    minShootVelocity: 1, x: 3, shootY: 0, reload: 12, shootCone: 180, ejectEffect: null, inaccuracy: 15, ignoreRotation: true,
    shootSound: 'shootHorizon',
    bullet: bullet('bomb', {
      speed: 0.7, damage: 13.5, splashDamage: 27, splashDamageRadius: 25, sprite: 'shell', width: 10, height: 14,
      collidesTiles: false, collides: false, collidesAir: false, shrinkY: 0.7, lifetime: 30, drag: 0.05, keepVelocity: false,
      hitEffect: 'flakExplosion', shootEffect: null, smokeEffect: null, hitSound: 'explosion', despawnEffect: null,
      backColor: Pal.bulletYellowBack, frontColor: Pal.bulletYellow,
    }),
  })],
});

defUnit('mono', {
  flying: true, drag: 0.06, accel: 0.12, speed: 1.5, health: 100, engineSize: 1.8, engineOffset: 5.7, range: 50,
  mineTier: 1, mineSpeed: 2.5, itemCapacity: 20, cell: true, miner: true, weapons: [],
});

defUnit('nova', {
  canBoost: true, speed: 0.55, hitSize: 8, health: 200, armor: 1, mech: true, cell: true, buildSpeed: 0.3,
  weapons: [weapon('heal-weapon', {
    top: false, shootY: 2, reload: 30, x: 4.5, alternate: false, ejectEffect: null, recoil: 2, shootSound: 'shootLaser',
    bullet: bolt(5.2, 13, { lifetime: 30, healPercent: 5, pierce: true, pierceBuilding: true, pierceCap: 2, backColor: Pal.heal, frontColor: Pal.white }),
  })],
});

// ---------------------------------------------------------------- blocks
const BLOCKS = {};
const ITEM_HEALTH_SCALING = { thorium: 0.2, plastanium: 0.1, 'phase-fabric': 0.25, 'surge-alloy': 0.25 }; // Items.java healthScaling
const BLOCK_LIST = [];
const CATEGORIES = ['turret', 'production', 'distribution', 'liquid', 'crafting', 'power', 'defense', 'units', 'effect', 'logic'];

function defBlock(name, cls, props) {
  const b = Object.assign({
    name, cls, size: 1, health: -1, scaledHealth: -1, requirements: [], category: 'distribution', buildCostMultiplier: 1,
    solid: true, rotate: false, hasItems: false, itemCapacity: 10, hasPower: false, consumesPower: 0, outputsPower: false,
    powerProduction: 0, consumeItems: null, outputItem: null, buildable: true, group: null, description: '',
    canReplace: null, flags: [], region: name, iconLayers: null, targetable: true, underBullets: false, conductive: false,
    hasLiquids: false, liquidCapacity: -1, liquidUse: 0, coolant: 0, liquidInputs: null, floating: false, outputsLiquid: false, inaccuracy: 0, shootCone: 8, rotateSpeed: 5, recoil: 1,
  }, props);
  if (b.coolant) { b.hasLiquids = true; b.liquidInputs = b.liquidInputs || ['water', 'cryofluid']; }
  if (b.liquidUse) { b.hasLiquids = true; b.liquidInputs = b.liquidInputs || ['water']; }
  // Block.init: liquidCapacity = round(10 * max(1, consumption per second))
  if (b.liquidCapacity < 0) b.liquidCapacity = Math.round(10 * Math.max(1, b.liquidUse * 60, b.coolant * 60));
  // Block.init: default health scales with the build materials (Item.healthScaling), rounded to 5
  if (b.health < 0) {
    if (b.scaledHealth < 0) {
      let scaling = 1;
      for (const r of b.requirements) scaling += ITEM_HEALTH_SCALING[r.item.name] || 0;
      b.scaledHealth = 40 * scaling;
      b.health = Math.round(b.size * b.size * b.scaledHealth / 5) * 5;
    } else b.health = Math.floor(b.size * b.size * b.scaledHealth);
  }
  b.offset = ((b.size + 1) % 2) * TS / 2;
  b.sizeOffset = -Math.floor((b.size - 1) / 2);
  let bt = 0;
  for (const r of b.requirements) bt += r.amount * r.item.cost;
  b.buildTime = (b.requirements.length ? bt : 20) * b.buildCostMultiplier;
  BLOCKS[name] = b;
  if (b.buildable) BLOCK_LIST.push(b);
  return b;
}

const wallHealthMultiplier = 4;
const transport = 'transportation';

// --- distribution
defBlock('conveyor', 'Conveyor', {
  requirements: req('copper', 1), health: 45, speed: 0.035, displayedSpeed: 5, category: 'distribution', solid: false,
  rotate: true, group: transport, hasItems: true, underBullets: true,
});
defBlock('titanium-conveyor', 'Conveyor', {
  requirements: req('copper', 1, 'lead', 1, 'titanium', 1), health: 65, speed: 0.0801, displayedSpeed: 10, solid: false,
  rotate: true, group: transport, hasItems: true, underBullets: true,
});
defBlock('junction', 'Junction', {
  requirements: req('copper', 3), speed: 26, capacity: 6, health: 30, buildCostMultiplier: 3, solid: false, group: transport,
  hasItems: true, underBullets: true,
});
defBlock('router', 'Router', { requirements: req('copper', 3), buildCostMultiplier: 4, group: transport, hasItems: true, itemCapacity: 1, speed: 8, solid: false, underBullets: true });
defBlock('sorter', 'Sorter', { requirements: req('lead', 2, 'copper', 2), buildCostMultiplier: 3, group: transport, configurable: true, underBullets: true, solid: false });
defBlock('overflow-gate', 'OverflowGate', { requirements: req('lead', 2, 'copper', 4), buildCostMultiplier: 3, group: transport, underBullets: true, solid: false });
defBlock('bridge-conveyor', 'ItemBridge', {
  requirements: req('lead', 6, 'copper', 6), range: 4, bufferCapacity: 14, speed: 74, group: transport, hasItems: true,
  itemCapacity: 10, configurable: true, underBullets: true,
});
defBlock('unloader', 'Unloader', { requirements: req('titanium', 25, 'silicon', 30), speed: 60 / 11, health: 70, configurable: true, group: transport, category: 'distribution' });

// --- production
defBlock('mechanical-drill', 'Drill', {
  requirements: req('copper', 12), tier: 2, drillTime: 600, size: 2, category: 'production', hasItems: true, liquidUse: 0.05,
  iconLayers: ['mechanical-drill', 'mechanical-drill-rotator', 'mechanical-drill-top'],
});
defBlock('pneumatic-drill', 'Drill', {
  requirements: req('copper', 18, 'graphite', 10), tier: 3, drillTime: 400, size: 2, category: 'production', hasItems: true, liquidUse: 3.5 / 60,
  iconLayers: ['pneumatic-drill', 'pneumatic-drill-rotator', 'pneumatic-drill-top'],
});

// --- crafting
defBlock('graphite-press', 'GenericCrafter', {
  requirements: req('copper', 75, 'lead', 30), craftTime: 90, size: 2, category: 'crafting', hasItems: true,
  consumeItems: [{ item: Items.coal, amount: 2 }], outputItem: { item: Items.graphite, amount: 1 }, craftEffect: 'pulverizeMedium', flags: ['factory'],
});
defBlock('silicon-smelter', 'GenericCrafter', {
  requirements: req('copper', 30, 'lead', 25), craftTime: 40, size: 2, category: 'crafting', hasItems: true, hasPower: true,
  consumesPower: 0.5, consumeItems: [{ item: Items.coal, amount: 1 }, { item: Items.sand, amount: 2 }],
  outputItem: { item: Items.silicon, amount: 1 }, flame: col('ffef99'), craftEffect: 'smeltsmoke', flags: ['factory'],
});
defBlock('kiln', 'GenericCrafter', {
  requirements: req('copper', 60, 'graphite', 30, 'lead', 30), craftTime: 30, size: 2, category: 'crafting', hasItems: true,
  hasPower: true, consumesPower: 0.6, consumeItems: [{ item: Items.lead, amount: 1 }, { item: Items.sand, amount: 1 }],
  outputItem: { item: Items.metaglass, amount: 1 }, flame: col('ffc099'), craftEffect: 'smeltsmoke', flags: ['factory'],
});
defBlock('pulverizer', 'GenericCrafter', {
  requirements: req('copper', 30, 'lead', 25), craftTime: 40, size: 1, category: 'crafting', hasItems: true, hasPower: true,
  consumesPower: 0.5, consumeItems: [{ item: Items.scrap, amount: 1 }], outputItem: { item: Items.sand, amount: 1 },
  rotator: true, craftEffect: 'pulverize', iconLayers: ['pulverizer', 'pulverizer-rotator', 'pulverizer-top'], flags: ['factory'],
});
defBlock('incinerator', 'Incinerator', {
  requirements: req('graphite', 5, 'lead', 15), health: 90, category: 'crafting', hasPower: true, consumesPower: 0.5, hasLiquids: true,
});

// --- power
defBlock('combustion-generator', 'ConsumeGenerator', {
  requirements: req('copper', 25, 'lead', 15), powerProduction: 1, itemDuration: 120, itemDurationMultipliers: { pyratite: 3 }, category: 'power', hasItems: true,
  hasPower: true, outputsPower: true, flags: ['generator'],
});
defBlock('power-node', 'PowerNode', {
  requirements: req('copper', 2, 'lead', 6), maxNodes: 10, laserRange: 6, category: 'power', hasPower: true, configurable: true, solid: true, underBullets: true,
});
defBlock('battery', 'Battery', { requirements: req('copper', 5, 'lead', 20), capacity: 4000, category: 'power', hasPower: true, flags: ['battery'] });
defBlock('solar-panel', 'SolarGenerator', {
  requirements: req('lead', 10, 'silicon', 8), powerProduction: 0.12, category: 'power', hasPower: true, outputsPower: true, flags: [],
});

// --- defense
defBlock('copper-wall', 'Wall', { requirements: req('copper', 6), health: 80 * wallHealthMultiplier, category: 'defense', group: 'walls' });
defBlock('copper-wall-large', 'Wall', { requirements: req('copper', 24), health: 80 * 4 * wallHealthMultiplier, size: 2, category: 'defense', group: 'walls' });
defBlock('titanium-wall', 'Wall', { requirements: req('titanium', 6), health: 110 * wallHealthMultiplier, category: 'defense', group: 'walls' });
defBlock('titanium-wall-large', 'Wall', { requirements: req('titanium', 24), health: 110 * wallHealthMultiplier * 4, size: 2, category: 'defense', group: 'walls' });
defBlock('mender', 'MendProjector', {
  requirements: req('lead', 30, 'copper', 25), consumesPower: 0.3, reload: 200, range: 40, healPercent: 4, phaseBoost: 4,
  phaseRangeBoost: 20, health: 80, category: 'effect', hasPower: true, hasItems: true, itemCapacity: 10,
});

// --- turrets
const T = 'turret';
defBlock('duo', 'ItemTurret', {
  requirements: req('copper', 35), category: T, health: 250, reload: 20, range: 160, shootCone: 15, inaccuracy: 2, rotateSpeed: 10,
  recoil: 0.5, shootY: 3, shootSound: 'shootDuo', alternateSpread: 3.5, targetAir: true, targetGround: true, coolant: 0.1, coolantMultiplier: 10,
  iconLayers: ['block-1', 'duo-barrel-l', 'duo-barrel-r', 'duo'],
  ammo: {
    copper: basic(2.5, 9, { width: 7, height: 9, lifetime: 60, ammoMultiplier: 2, backColor: Pal.copperAmmoBack, frontColor: Pal.copperAmmoFront, hitColor: Pal.copperAmmoBack, trailColor: Pal.copperAmmoBack }),
    graphite: basic(3.5, 18, { width: 9, height: 12, ammoMultiplier: 4, lifetime: 60, reloadMultiplier: 0.8, rangeChange: 16, backColor: Pal.graphiteAmmoBack, frontColor: Pal.graphiteAmmoFront, hitColor: Pal.graphiteAmmoBack }),
    silicon: basic(3, 12, { width: 7, height: 9, homingPower: 0.2, reloadMultiplier: 1.5, ammoMultiplier: 5, lifetime: 60, trailLength: 5, trailWidth: 1.5, backColor: Pal.siliconAmmoBack, frontColor: Pal.siliconAmmoFront, hitColor: Pal.siliconAmmoBack, trailColor: Pal.siliconAmmoBack }),
  },
});
defBlock('scatter', 'ItemTurret', {
  requirements: req('copper', 85, 'lead', 45), category: T, size: 2, scaledHealth: 200, reload: 18, range: 220, targetGround: false,
  targetAir: true, shots: 2, shotDelay: 5, recoil: 1, rotateSpeed: 15, inaccuracy: 17, shootCone: 35, shootSound: 'shootScatter', coolant: 0.2,
  iconLayers: ['block-2', 'scatter', 'scatter-mid'], partMid: true,
  ammo: {
    scrap: flak(4, 3, { lifetime: 60, ammoMultiplier: 5, reloadMultiplier: 0.5, width: 6, height: 8, splashDamage: 33, splashDamageRadius: 24, frontColor: Pal.scrapAmmoFront, backColor: Pal.scrapAmmoBack, hitColor: Pal.scrapAmmoBack }),
    lead: flak(4.2, 3, { lifetime: 60, ammoMultiplier: 4, width: 6, height: 8, splashDamage: 40.5, splashDamageRadius: 15 }),
    metaglass: flak(4, 3, { lifetime: 60, ammoMultiplier: 5, reloadMultiplier: 0.8, width: 6, height: 8, splashDamage: 45, splashDamageRadius: 20, backColor: Pal.glassAmmoBack, frontColor: Pal.glassAmmoFront, hitColor: Pal.glassAmmoFront, fragBullets: 6, fragBullet: basic(3, 5, { width: 5, height: 12, shrinkY: 1, lifetime: 20, collidesGround: false, backColor: Pal.glassAmmoBack, frontColor: Pal.glassAmmoFront, despawnEffect: null }) }),
  },
});
defBlock('hail', 'ItemTurret', {
  requirements: req('copper', 40, 'graphite', 17), category: T, targetAir: false, targetGround: true, reload: 60, recoil: 2,
  range: 235, inaccuracy: 1, shootCone: 10, health: 260, shootSound: 'shootArtillerySmall', heatRegion: 'hail-heat', coolant: 0.1, coolantMultiplier: 10,
  iconLayers: ['block-1', 'hail'], minRange: 0, artillery: true,
  ammo: {
    graphite: artillery(3, 20, { knockback: 0.8, lifetime: 80, width: 11, height: 11, splashDamageRadius: 25 * 0.75, splashDamage: 33, hitColor: Pal.graphiteAmmoBack, backColor: Pal.graphiteAmmoBack, frontColor: Pal.graphiteAmmoFront }),
    silicon: artillery(3, 20, { knockback: 0.8, lifetime: 80, width: 11, height: 11, splashDamageRadius: 25 * 0.75, splashDamage: 33, reloadMultiplier: 1.2, ammoMultiplier: 3, homingPower: 0.08, homingRange: 50, trailLength: 7, trailWidth: 3, hitColor: Pal.siliconAmmoBack, backColor: Pal.siliconAmmoBack, frontColor: Pal.siliconAmmoFront }),
  },
});
defBlock('lancer', 'PowerTurret', {
  requirements: req('copper', 60, 'lead', 70, 'silicon', 60, 'titanium', 30), category: T, range: 165, chargeTime: 40, recoil: 2,
  reload: 80, shake: 2, size: 2, scaledHealth: 280, targetAir: false, targetGround: true, shootSound: 'shootLancer',
  chargeSound: 'chargeLancer', consumesPower: 6, hasPower: true, heatRegion: 'lancer-heat', rotateSpeed: 5, shootCone: 6, coolant: 0.2,
  iconLayers: ['block-2', 'lancer'],
  shootType: bullet('laser', { damage: 140, buildingDamageMultiplier: 0.25, length: 173, lifetime: 16, collidesAir: false, pierceCap: 4, width: 15, colors: [rgba(Pal.lancerLaser, 0.4), Pal.lancerLaser.css, '#fff'], hitEffect: 'hitLancer' }),
});
defBlock('arc', 'PowerTurret', {
  requirements: req('copper', 50, 'lead', 50), category: T, reload: 35, shootCone: 40, rotateSpeed: 8, targetAir: false,
  range: 90, recoil: 1, health: 260, shootSound: 'shootArc', consumesPower: 3.3, hasPower: true, heatRegion: 'arc-heat', coolant: 0.1, coolantMultiplier: 30,
  iconLayers: ['block-1', 'arc'],
  shootType: bullet('lightning', { damage: 12, lightningLength: 25, collidesAir: false, buildingDamageMultiplier: 0.4, color: col('a9d8ff') }),
});

// --- units
defBlock('ground-factory', 'UnitFactory', {
  requirements: req('copper', 50, 'lead', 120, 'silicon', 80), size: 3, consumesPower: 1.2, category: 'units', hasPower: true,
  hasItems: true, rotate: true, configurable: true, flags: ['factory'],
  plans: [
    { unit: 'dagger', time: 60 * 15, requirements: req('silicon', 10, 'lead', 10) },
    { unit: 'crawler', time: 60 * 10, requirements: req('silicon', 8, 'coal', 10) },
    { unit: 'nova', time: 60 * 40, requirements: req('silicon', 30, 'lead', 20, 'titanium', 20) },
  ],
  iconLayers: ['ground-factory', 'factory-out-3', 'factory-top-3'],
});

defBlock('air-factory', 'UnitFactory', {
  requirements: req('copper', 60, 'lead', 70, 'silicon', 60), size: 3, consumesPower: 1.2, category: 'units', hasPower: true,
  hasItems: true, rotate: true, configurable: true, flags: ['factory'],
  plans: [
    { unit: 'flare', time: 60 * 15, requirements: req('silicon', 15) },
    { unit: 'mono', time: 60 * 35, requirements: req('silicon', 30, 'lead', 15) },
  ],
  iconLayers: ['air-factory', 'factory-out-3', 'factory-top-3'],
});

// --- storage / core
defBlock('container', 'StorageBlock', { requirements: req('titanium', 100), size: 2, scaledHealth: 55, itemCapacity: 300, category: 'effect', hasItems: true, storage: true });
defBlock('core-shard', 'Core', {
  requirements: req('copper', 1000, 'lead', 800), health: 1100, itemCapacity: 4000, size: 3, buildCostMultiplier: 2,
  buildable: false, category: 'effect', hasItems: true, unitType: 'alpha', unitCapModifier: 8, storage: true, flags: ['core'],
});

// construct "block" (in-progress building)
defBlock('build', 'ConstructBuild', { buildable: false, health: 20 });

// short descriptions (from Mindustry's bundle where helpful; trimmed)
const DESCRIPTIONS = {
  'conveyor': 'Moves items forward. Items placed on it are carried in the direction it faces.',
  'titanium-conveyor': 'Moves items faster than the standard conveyor.',
  'junction': 'Acts as a bridge for two crossing conveyor belts.',
  'router': 'Accepts items, then outputs them to up to 3 other directions equally.',
  'sorter': 'Sorts items by type. Accepted items pass forward; others are output left and right.',
  'overflow-gate': 'Outputs items to the left and right only if the front path is blocked.',
  'bridge-conveyor': 'Transports items over terrain or buildings, up to 3 tiles apart. Click it, then click another bridge to link.',
  'unloader': 'Unloads items from containers or the core onto conveyors or directly into adjacent blocks.',
  'mechanical-drill': 'When placed on ore, outputs items at a slow pace indefinitely. Only capable of mining basic resources.',
  'pneumatic-drill': 'An improved drill, capable of mining titanium. Mines at a faster pace than a mechanical drill.',
  'graphite-press': 'Compresses chunks of coal into graphite.',
  'silicon-smelter': 'Refines silicon from sand and coal. Requires power.',
  'kiln': 'Smelts sand and lead into metaglass. Requires power.',
  'pulverizer': 'Crushes scrap into fine sand.',
  'incinerator': 'Vaporizes any item or liquid it receives. Requires power.',
  'combustion-generator': 'Generates power by burning flammable materials, such as coal.',
  'power-node': 'Transmits power to connected nodes. Click a node, then click a block to link or unlink it.',
  'battery': 'Stores power as a buffer in times of surplus energy.',
  'solar-panel': 'Provides a small amount of power from the sun.',
  'copper-wall': 'Protects structures from enemy projectiles.',
  'copper-wall-large': 'Protects structures from enemy projectiles. Spans multiple tiles.',
  'titanium-wall': 'A moderately strong defensive block.',
  'titanium-wall-large': 'A moderately strong defensive block. Spans multiple tiles.',
  'mender': 'Periodically repairs blocks in its vicinity. Optionally uses silicon to boost range and efficiency.',
  'duo': 'Fires alternating bullets at enemies. Accepts copper, graphite and silicon.',
  'scatter': 'Shoots clumps of flak at aircraft. Accepts scrap, lead and metaglass.',
  'hail': 'Fires small artillery shells at ground targets. Accepts graphite and silicon.',
  'lancer': 'Charges and fires powerful beams of energy at ground targets. Requires power.',
  'arc': 'Fires electrical arcs at ground targets. Requires power.',
  'air-factory': 'Produces air units. Monos automatically mine copper and lead and deliver them to the core.',
  'ground-factory': 'Produces ground units. Click to choose the unit. Units defend the core; press G to send them to attack.',
  'container': 'Stores a small amount of items of each type. Use an unloader to retrieve them.',
  'core-shard': 'The core of the base. Once destroyed, the sector is lost.',
};
