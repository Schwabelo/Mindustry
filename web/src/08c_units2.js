// Tier 2-3 units (pulsar, quasar, zenith, poly, mega), unit abilities, builder/repair AI and reconstructors.
// Stats from content/UnitTypes.java and content/Blocks.java.

Pal.unitFront = col('ffa665');
Pal.unitBack = col('d06b53');

function missile(speed, damage, props = {}) {
  return bullet('missile', Object.assign({
    speed, damage, sprite: 'missile', homingPower: 0.08, shrinkY: 0, width: 8, height: 8, hitSound: 'explosion', lifetime: 52,
    backColor: col('e58956'), frontColor: col('ffd2ae'), trailLength: 4, trailWidth: 1.5, hitEffect: 'blastExplosion', despawnEffect: 'blastExplosion',
  }, props));
}

// ---------------------------------------------------------------- units
defUnit('pulsar', {
  canBoost: true, speed: 0.7, hitSize: 11, health: 320, buildSpeed: 0.5, armor: 4, mech: true, cell: true, mineTier: 2, mineSpeed: 3,
  abilities: [{ type: 'shieldRegen', amount: 20, max: 40, reload: 300, range: 60 }],
  weapons: [weapon('heal-shotgun-weapon', {
    top: false, x: 5, shake: 2.2, y: 0.5, shootY: 2.5, reload: 36, inaccuracy: 35, shots: 3, shotDelay: 0.5, ejectEffect: null, recoil: 2.5,
    shootSound: 'shootPulsar',
    bullet: bullet('lightning', { damage: 15, lightningLength: 8, lightningLengthRand: 7, color: Pal.heal, healPercent: 1.6, collidesAir: true, shootEffect: null, smokeEffect: null, rangeOverride: 60 }),
  })],
});
defUnit('quasar', {
  mineTier: 3, health: 640, buildSpeed: 1.1, canBoost: true, armor: 9, mechFrontSway: 0.55, speed: 0.5, hitSize: 13, mineSpeed: 4,
  mech: true, cell: true,
  abilities: [{ type: 'forceField', radius: 60, regen: 0.4, max: 500, cooldown: 60 * 6 }],
  weapons: [weapon('beam-weapon', {
    top: false, shake: 2, shootY: 4, x: 6.5, reload: 55, recoil: 4, shootSound: 'shootLancer', ejectEffect: null,
    bullet: bullet('laser', { damage: 45, sideAngle: 45, sideWidth: 1, sideLength: 70, healPercent: 10, length: 150, lifetime: 16, width: 15, collidesAir: true, pierceCap: -1, colors: [rgba(Pal.heal, 0.4), Pal.heal.css, '#fff'], hitEffect: 'hitLancer', rangeOverride: 150 }),
  })],
});
defUnit('zenith', {
  health: 700, speed: 1.7, accel: 0.04, drag: 0.016, flying: true, range: 140, hitSize: 20, lowAltitude: true, armor: 5,
  targetFlags: ['storage', 'battery'], engineOffset: 12, engineSize: 3, cell: true,
  weapons: [weapon('zenith-missiles', {
    reload: 40, x: 7, rotate: true, shake: 1, shots: 2, inaccuracy: 5, velocityRnd: 0.2, shootSound: 'shootMissile', ejectEffect: null, shootCone: 15,
    bullet: missile(3, 14, { width: 8, height: 8, drag: -0.003, homingRange: 60, splashDamageRadius: 25, splashDamage: 15, lifetime: 50, trailColor: Pal.unitBack, backColor: Pal.unitBack, frontColor: Pal.unitFront, weaveScale: 6, weaveMag: 1 }),
  })],
});
defUnit('poly', {
  flying: true, drag: 0.05, speed: 2.6, rotateSpeed: 15, accel: 0.1, range: 130, health: 400, buildSpeed: 0.4, engineOffset: 6.5, hitSize: 9,
  lowAltitude: true, mineTier: 2, mineSpeed: 3.5, cell: true, ai: 'builder',
  abilities: [{ type: 'repairField', amount: 5, reload: 60 * 8, range: 50 }],
  weapons: [weapon('poly-weapon', {
    top: false, y: -2.5, x: 3.75, reload: 30, ejectEffect: null, recoil: 2, shootSound: 'shootMissilePlasmaShort', velocityRnd: 0.5, inaccuracy: 15, alternate: true,
    bullet: missile(4, 12, { homingPower: 0.08, weaveMag: 4, weaveScale: 4, lifetime: 50, shootEffect: 'shootSmallColor', smokeEffect: 'hitLaserColor', hitEffect: 'hitLaserColor', despawnEffect: 'hitLaserColor', frontColor: Pal.white, hitSound: null, healPercent: 5.5, collidesTeam: true, backColor: Pal.heal, trailColor: Pal.heal, hitColor: Pal.heal, splashDamage: 0 }),
  })],
});
defUnit('mega', {
  mineTier: 3, mineSpeed: 4, health: 460, armor: 3, speed: 2.5, accel: 0.06, drag: 0.017, lowAltitude: true, flying: true, engineOffset: 10.5,
  faceTarget: false, hitSize: 16.05, engineSize: 3, buildSpeed: 2.6, cell: true, ai: 'repair',
  weapons: [
    weapon('heal-weapon-mount', { shootSound: 'shootLaser', reload: 24, x: 8, y: -6, rotate: true, ejectEffect: null, shootCone: 20,
      bullet: bolt(5.2, 10, { lifetime: 35, healPercent: 5.5, collidesTeam: true, backColor: Pal.heal, frontColor: Pal.white }) }),
    weapon('heal-weapon-mount', { shootSound: 'shootLaser', reload: 15, x: 4, y: 5, rotate: true, ejectEffect: null, shootCone: 20,
      bullet: bolt(5.2, 8, { lifetime: 35, healPercent: 3, collidesTeam: true, backColor: Pal.heal, frontColor: Pal.white }) }),
  ],
});
UNITS.nova.abilities = [{ type: 'repairField', amount: 20, reload: 120, range: 100, sameTypeHealMult: 0.15, maxTargets: 6 }];

// mounts for units defined after Unit construction: recompute range for units with rangeOverride bullets
for (const n of ['pulsar', 'quasar']) UNITS[n].range = UNITS[n].weapons[0].bullet.rangeOverride;

// ---------------------------------------------------------------- abilities
const _u2update = Unit.prototype.update;
Unit.prototype.update = function () {
  const abs = this.type.abilities;
  if (abs && !this.dead) {
    if (!this.abil) this.abil = abs.map(() => ({ timer: Math.random() * 60, radiusScale: 0, broken: true })); // ForceFieldAbility.wasBroken starts true
    abs.forEach((a, i) => updateAbility(this, a, this.abil[i]));
  }
  _u2update.call(this);
};

function updateAbility(u, a, s) {
  if (a.type === 'repairField') {
    s.timer += Time.delta;
    if (s.timer >= a.reload) {
      let targets = Game.units.filter(o => o.team === u.team && !o.dead && o.health < o.maxHealth && Mathf.within(o.x, o.y, u.x, u.y, a.range));
      const same = a.sameTypeHealMult ?? 1;
      if (a.maxTargets > 0) {
        targets.sort((p, q) => (Mathf.dst2(p.x, p.y, u.x, u.y) + (same < 1 && p.type === u.type ? 6400 : 0)) - (Mathf.dst2(q.x, q.y, u.x, u.y) + (same < 1 && q.type === u.type ? 6400 : 0)));
        targets = targets.slice(0, a.maxTargets);
      }
      for (const o of targets) { o.heal(a.amount * (o.type === u.type ? same : 1)); Fx.create('healUnit', o.x, o.y, 0, Pal.heal, o.type.hitSize); }
      if (targets.length) { s.timer = 0; Fx.create('healWave', u.x, u.y, 0, Pal.heal, a.range); }
    }
  } else if (a.type === 'shieldRegen') {
    s.timer += Time.delta;
    if (s.timer >= a.reload) {
      s.timer = 0;
      let any = false;
      for (const o of Game.units) if (o.team === u.team && !o.dead && o.shield < a.max && Mathf.within(o.x, o.y, u.x, u.y, a.range)) { o.shield = Math.min(a.max, o.shield + a.amount); any = true; }
      if (any) Fx.create('shieldWave', u.x, u.y, 0, Teams[u.team].color, a.range);
    }
  } else if (a.type === 'forceField') {
    // ForceFieldAbility.update: unit.shield is the field's health
    if (u.shield <= 0 && !s.broken) {
      u.shield -= a.cooldown * a.regen;
      Fx.create('shieldBreak', u.x, u.y, 0, Teams[u.team].color, a.radius);
      Audio2.play('blockExplodeWall', u.x, u.y, 0.3);
    }
    if (u.shield < a.max) u.shield += Time.delta * a.regen;
    s.broken = u.shield <= 0;
    if (u.shield > 0) {
      s.radiusScale = Mathf.lerp(s.radiusScale, 1, 0.06 * Time.delta);
      const r = a.radius * s.radiusScale;
      for (const b of Bullets.list) {
        if (b.removed || b.team === u.team || b.type.absorbable === false) continue;
        if (Mathf.within(b.x, b.y, u.x, u.y, r)) {
          b.removed = true;
          u.shield -= b.type.damage * (b.type.shieldDamageMultiplier ?? 1); // BulletType.shieldDamage
          s.alpha = 1;
          Fx.create('absorb', b.x, b.y, 0, Teams[u.team].color);
        }
      }
    } else s.radiusScale = 0;
    s.alpha = Math.max((s.alpha || 0) - Time.delta / 10, 0);
  }
}

// force field drawing (hexagon around the unit)
const _u2draw = Unit.prototype.draw;
Unit.prototype.draw = function () {
  _u2draw.call(this);
  const abs = this.type.abilities;
  if (!abs || !this.abil) return;
  abs.forEach((a, i) => {
    if (a.type !== 'forceField') return;
    const s = this.abil[i];
    if (this.shield <= 0 || s.radiusScale < 0.01) return;
    const r = a.radius * s.radiusScale, c = Teams[this.team].color;
    Draw.setAlpha(0.12 + (s.alpha || 0) * 0.25);
    Fill.set(c.css); Fill.poly(this.x, this.y, 6, r);
    Draw.setAlpha(0.6 + (s.alpha || 0) * 0.4);
    Lines.set(c.css, 1.2); Lines.poly(this.x, this.y, 6, r);
    Draw.setAlpha(1);
  });
};

Object.assign(FX, {
  healWave: { life: 22, draw(e) { Lines.set(rgba(e.color || Pal.heal, e.fout), e.fout * 2.5); Lines.circle(e.x, e.y, 4 + e.fin * (e.data || 50)); } },
  shieldWave: { life: 22, draw(e) { Lines.set(rgba(e.color || Pal.accent, e.fout), e.fout * 2.5); Lines.poly(e.x, e.y, 6, 4 + e.fin * (e.data || 60)); } },
  healUnit: { life: 20, draw(e) { Lines.set(rgba(Pal.heal, e.fout), e.fout * 1.5); Lines.circle(e.x, e.y, (e.data || 8) / 2 + e.fin * 4); } },
  shieldBreak: { life: 40, draw(e) { Lines.set(rgba(e.color || Pal.accent, e.fout), 3 * e.fout); Lines.poly(e.x, e.y, 6, (e.data || 60) + e.fin * 6); } },
  absorb: { life: 12, draw(e) { Lines.set(rgba(e.color || Pal.accent, e.fout), 2 * e.fout); Lines.circle(e.x, e.y, 5 * e.fout); } },
});

// ---------------------------------------------------------------- builder (poly) and repair (mega) AI
// BuilderAI (rebuild command): help any unit that is building (if it can get there in time), otherwise take the team's
// rebuild queue in order (every 2 s, rotating the queue); with nothing to do, back off to the core when enemies are near
class BuilderAI {
  constructor() { this.retarget = 0; this.target = null; this.assistTimer = 0; this.rebuildTimer = 0; this.following = null; }
  update(u) {
    if (!u.plans.length) {
      if ((this.assistTimer -= Time.delta) <= 0) {
        this.assistTimer = 60;
        this.following = null;
        for (const o of Game.units) {
          if (o === u || o.team !== u.team || o.dead || !(o.activePlan || (o.isPlayer && Input.activePlan))) continue;
          const pl = o.activePlan || Input.activePlan;
          const cb = World.buildAt(pl.x, pl.y);
          if (!(cb instanceof ConstructBuild)) continue;
          const dist = Math.max(Math.hypot(cb.x - u.x, cb.y - u.y) - BUILD_RANGE, 0);
          if (dist / Math.max(u.speed(), 0.01) < cb.current.buildTime * 0.9) { this.following = o; break; }
        }
      }
      const f = this.following && !this.following.dead ? this.following : null;
      const fp = f && (f.activePlan || (f.isPlayer ? Input.activePlan : null));
      if (fp) u.plans.push(fp);
      else if (Game.rebuildQueue.length && (this.rebuildTimer -= Time.delta) <= 0) {
        this.rebuildTimer = 120;
        const q = Game.rebuildQueue, g = q[0];
        const there = World.buildAt(g.x, g.y);
        if (there && there.block === g.block && there.tx === g.x && there.ty === g.y) q.shift();
        else {
          q.push(q.shift());
          if (Game.validPlace(g.block, g.x, g.y, g.rotation)) u.plans.push({ block: g.block, x: g.x, y: g.y, rotation: g.rotation, breaking: false });
        }
      }
    }
    u.activePlan = null;
    if (u.plans.length) {
      const pl = u.plans[0];
      const px = pl.x * TS + pl.block.offset, py = pl.y * TS + pl.block.offset;
      u.moveTo(px, py, BUILD_RANGE * 0.4);
      u.activePlan = builderUpdate(u);
      // an assisted plan finished or got dropped
      if (this.following && !u.activePlan) u.plans = [];
      u.lookAt(px, py);
      for (const m of u.mounts) m.shoot = false;
      return;
    }
    // idle: shoot what comes in range; flee toward the core from enemies within 370
    this.retarget -= Time.delta;
    if (this.retarget <= 0) { this.retarget = 20; this.target = Targeting.closestTarget(u.team, u.x, u.y, 370, u.type.targetAir, u.type.targetGround); }
    if (this.target && this.target.dead) this.target = null;
    const core = Game.playerCore();
    if (this.target && core && Math.hypot(core.x - u.x, core.y - u.y) > 370 * 0.5) u.moveTo(core.x, core.y, 370 * 0.5);
    else u.moveAt(0, 0);
    aimAndShoot(u, this.target && Math.hypot(this.target.x - u.x, this.target.y - u.y) <= u.range + 8 ? this.target : null);
  }
}

function damagedBuilding(team, x, y, range) {
  let best = null, bf = 1;
  for (const b of Game.teamBuildings(team)) {
    if (b.dead || b instanceof ConstructBuild || b.health >= b.maxHealth) continue;
    if (!Mathf.within(b.x, b.y, x, y, range)) continue;
    if (b.healthf < bf) { bf = b.healthf; best = b; }
  }
  return best;
}

// RepairAI: fly to the closest damaged block of the team and heal it; never chase enemies; when idle and an enemy is
// within 310, retreat to within 160 of the core
class RepairAI {
  constructor() { this.retarget = 0; this.target = null; this.avoidTimer = 0; this.avoid = null; }
  update(u) {
    this.retarget -= Time.delta;
    if (this.retarget <= 0) {
      this.retarget = 30;
      let best = null, bd = Infinity;
      for (const b of Game.teamBuildings(u.team)) {
        if (b.dead || b instanceof ConstructBuild || b.health >= b.maxHealth) continue;
        const d = Mathf.dst2(b.x, b.y, u.x, u.y);
        if (d < bd) { bd = d; best = b; }
      }
      this.target = best;
    }
    if (this.target && (this.target.dead || this.target.health >= this.target.maxHealth)) this.target = null;
    if (this.target) {
      if (Math.hypot(this.target.x - u.x, this.target.y - u.y) > u.range * 0.65) u.moveTo(this.target.x, this.target.y, u.range * 0.65);
      else u.moveAt(0, 0);
      aimAndShoot(u, Math.hypot(this.target.x - u.x, this.target.y - u.y) <= u.range ? this.target : null, false);
    } else {
      for (const m of u.mounts) m.shoot = false;
      if ((this.avoidTimer -= Time.delta) <= 0) { this.avoidTimer = 40; this.avoid = Targeting.closestTarget(u.team, u.x, u.y, 310, true, true); }
      const core = Game.playerCore();
      if (this.avoid && !this.avoid.dead && core && Math.hypot(core.x - u.x, core.y - u.y) > 160) u.moveTo(core.x, core.y, 160);
      else u.moveAt(0, 0);
    }
    if (Math.hypot(u.vx, u.vy) > 0.05) u.lookAngle(Angles.angle(0, 0, u.vx, u.vy));
  }
}

const _makeController = makeController;
makeController = function (type, team) {
  if (team === 'sharded' && type.ai === 'builder') return new BuilderAI();
  if (team === 'sharded' && type.ai === 'repair') return new RepairAI();
  return _makeController(type, team);
};

// ---------------------------------------------------------------- reconstructors
class Reconstructor extends Building {
  constructor(...a) { super(...a); this.payload = null; this.progress = 0; this.speedScl = 0; this.inDir = Mathf.mod(this.rotation + 2, 4); }
  upgrade(type) { const u = this.block.upgrades.find(([from]) => from === type.name); return u ? UNITS[u[1]] : null; }
  acceptPayload(source, type) {
    return !this.payload && source.team === this.team && !!this.upgrade(type) && this.relativeTo(source) !== this.rotation;
  }
  handlePayload(source, type) {
    this.payload = type; this.progress = 0;
    this.inDir = this.relativeTo(source);
    if (this.inDir < 0) this.inDir = Mathf.mod(this.rotation + 2, 4);
  }
  acceptItem(source, item) {
    const r = this.block.consumeItems.find(c => c.item === item);
    return !!r && this.items[item.id] < r.amount * 2;
  }
  hasReqs() { return this.block.consumeItems.every(c => this.has(c.item, c.amount)); }
  shouldConsume() { return !!this.payload && this.hasReqs(); }
  update() {
    if (!this.payload) { this.speedScl = Mathf.approach(this.speedScl, 0, 0.05 * Time.delta); return; }
    const up = this.upgrade(this.payload);
    const b = this.block;
    if (this.progress < b.constructTime) {
      const eff = this.hasReqs() ? this.efficiency : 0;
      this.progress += Time.delta * eff;
      this.speedScl = Mathf.approach(this.speedScl, eff > 0 ? 1 : 0, 0.05 * Time.delta);
      if (this.progress >= b.constructTime) for (const c of b.consumeItems) this.removeItem(c.item, c.amount);
      return;
    }
    // finished: hand to the next reconstructor or release the unit
    const next = this.front();
    if (next instanceof Reconstructor && next.team === this.team && next.upgrade(up)) {
      // the next reconstructor can upgrade this unit: wait until it is free (payload blocks are not dumped)
      if (next.acceptPayload(this, up)) { next.handlePayload(this, up); this.payload = null; this.progress = 0; }
      return;
    }
    if (Game.unitCount(this.team, up.name) >= Game.unitCap(this.team)) return;
    const ang = this.rotation * 90;
    const sx = this.x + Angles.trnsx(ang, b.size * TS / 2 + 4), sy = this.y + Angles.trnsy(ang, b.size * TS / 2 + 4);
    const u = Game.spawnUnit(up, this.team, sx, sy, ang);
    u.vx = Angles.trnsx(ang, 1); u.vy = Angles.trnsy(ang, 1);
    Fx.create('unitSpawn', sx, sy, ang, Teams[this.team].color);
    Audio2.play('unitCreate', sx, sy, 0.9);
    this.payload = null; this.progress = 0;
  }
  draw() {
    const b = this.block, s = b.size;
    Draw.rect(b.name, this.x, this.y);
    Draw.rect('factory-in-' + s, this.x, this.y, undefined, undefined, this.inDir * 90);
    Draw.rect('factory-out-' + s, this.x, this.y, undefined, undefined, this.rotation * 90);
    if (this.payload) {
      const up = this.upgrade(this.payload);
      const f = this.progress / b.constructTime;
      if (f < 1) { Draw.setAlpha(1 - f); Draw.rect(this.payload.name, this.x, this.y, undefined, undefined, this.rotation * 90 - 90); Draw.setAlpha(1); }
      drawBuildShader(up.name, this.x, this.y, this.rotation * 90 - 90, Math.min(f, 1), Math.max(this.speedScl, 0.5));
    }
    Draw.rect(b.name + '-top', this.x, this.y);
  }
  info() {
    const b = this.block;
    const lines = [b.upgrades.map(([a, c]) => `${a} → ${c}`).join(', ')];
    if (this.payload) lines.push(`Upgrading ${this.payload.name}: ${Math.floor(Math.min(1, this.progress / b.constructTime) * 100)}%`);
    else lines.push('Feed it units from a factory pointing into it');
    lines.push(b.consumeItems.map(c => `${this.items[c.item.id]}/${c.amount} ${c.item.name}`).join(', '));
    return lines;
  }
}
BuildClasses.Reconstructor = Reconstructor;

// factories (and reconstructors) output into a reconstructor in front of them
const _ufUpdate = UnitFactory.prototype.update;
UnitFactory.prototype.update = function () {
  const p = this.plan;
  if (p && this.progress + Time.delta * this.efficiency >= p.time && this.canBuild()) {
    const next = this.front();
    if (next instanceof Reconstructor && next.team === this.team && next.upgrade(UNITS[p.unit])) {
      // hold the finished unit until the reconstructor in front is free
      if (next.acceptPayload(this, UNITS[p.unit])) {
        for (const r of p.requirements) this.removeItem(r.item, r.amount);
        this.progress = 0;
        next.handlePayload(this, UNITS[p.unit]);
      }
      return;
    }
  }
  _ufUpdate.call(this);
};

defBlock('additive-reconstructor', 'Reconstructor', {
  requirements: req('copper', 200, 'lead', 120, 'silicon', 90), size: 3, consumesPower: 3, category: 'units', hasPower: true, hasItems: true,
  rotate: true, flags: ['factory'], constructTime: 60 * 10,
  consumeItems: [{ item: Items.silicon, amount: 40 }, { item: Items.graphite, amount: 40 }],
  upgrades: [['nova', 'pulsar'], ['dagger', 'mace'], ['flare', 'horizon'], ['mono', 'poly']],
  iconLayers: ['additive-reconstructor', 'factory-in-3', 'factory-out-3', 'additive-reconstructor-top'],
});
defBlock('multiplicative-reconstructor', 'Reconstructor', {
  requirements: req('lead', 650, 'silicon', 450, 'titanium', 350, 'thorium', 650), size: 5, consumesPower: 6, category: 'units',
  hasPower: true, hasItems: true, rotate: true, flags: ['factory'], constructTime: 60 * 30,
  consumeItems: [{ item: Items.silicon, amount: 130 }, { item: Items.titanium, amount: 80 }, { item: Items.metaglass, amount: 40 }],
  upgrades: [['horizon', 'zenith'], ['mace', 'fortress'], ['poly', 'mega'], ['pulsar', 'quasar']],
  iconLayers: ['multiplicative-reconstructor', 'factory-in-5', 'factory-out-5', 'multiplicative-reconstructor-top'],
});

Object.assign(DESCRIPTIONS, {
  'additive-reconstructor': 'Upgrades units to tier 2: dagger → mace, nova → pulsar, flare → horizon, mono → poly. Point a factory into it.',
  'multiplicative-reconstructor': 'Upgrades tier 2 units to tier 3: mace → fortress, pulsar → quasar, horizon → zenith, poly → mega. Chain it after an additive reconstructor.',
});
