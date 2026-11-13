// Defense + effect: doors, scrap walls, shock mine, overdrive dome, repair point. Stats from content/Blocks.java.

// ---------------------------------------------------------------- doors (click to open/close; open doors don't block anything)
class Door extends Wall {
  constructor(...a) { super(...a); this.open = false; }
  blocked() {
    const half = this.block.size * TS / 2;
    return Game.units.some(u => !u.dead && !u.isFlying && Math.abs(u.x - this.x) < half + u.hitSize / 3 && Math.abs(u.y - this.y) < half + u.hitSize / 3);
  }
  // Door.java: touching doors form a chain that opens / closes together; a door with something in it stays open
  chain() {
    const out = [this], seen = new Set(out);
    for (let i = 0; i < out.length; i++) for (const o of out[i].proximity) if (o instanceof Door && !seen.has(o) && o.team === this.team) { seen.add(o); out.push(o); }
    return out;
  }
  toggle(cooldown = 60) {
    const chain = this.chain(), head = chain[0];
    if ((head.lastToggle || -1e9) + cooldown > Time.time) return;
    head.lastToggle = Time.time;
    const open = !this.open;
    let any = false;
    for (const d of chain) {
      if (d.open === open || (!open && d.blocked())) continue;
      d.open = open; any = true;
      Fx.create('doorToggle', d.x, d.y, 0, null, d.block.size);
    }
    if (!any && !open) { UI.toast('Something is in the way', 1); return; }
    Pathfinder.dirty = true;
    Audio2.play('click', this.x, this.y, 0.5);
  }
  draw() { Draw.rect(this.block.name + (this.open ? '-open' : ''), this.x, this.y); }
  writeState() { return this.open ? { o: 1 } : null; }
  readState(s) { this.open = !!s.o; }
  info() { return [this.open ? 'Open: units can pass' : 'Closed', 'Click to ' + (this.open ? 'close' : 'open')]; }
}
FX.doorToggle = { life: 10, draw(e) { Lines.set(rgba(Pal.accent, e.fout), 1); Lines.square(e.x, e.y, (e.data || 1) * TS / 2 + e.fin * 2); } };

// ---------------------------------------------------------------- scrap walls (random sprite variants)
const _wallDraw = Wall.prototype.draw;
Wall.prototype.draw = function () {
  const v = this.block.variants;
  if (!v) return _wallDraw.call(this);
  Draw.rect(this.block.name + (1 + ((this.tx * 31 + this.ty * 17) % v)), this.x, this.y);
};

// ---------------------------------------------------------------- shock mine (ShockMine.unitOn)
class ShockMine extends Building {
  update() {
    const b = this.block, half = TS / 2;
    if (!this.timer('check', 2)) return;
    for (const u of Game.units) {
      if (u.dead || u.team === this.team || u.isFlying) continue;
      if (Math.abs(u.x - this.x) > half + u.hitSize / 3 || Math.abs(u.y - this.y) > half + u.hitSize / 3) continue;
      if ((this.cool || 0) > Time.time) return;
      this.cool = Time.time + b.cooldown;
      for (let i = 0; i < b.tendrils; i++) Lightning.create(this.team, Pal.lancerLaser, b.damage, this.x, this.y, Math.random() * 360, b.length + Math.round(Math.random() * b.lengthRand), { collidesAir: false });
      Audio2.play('shootArc', this.x, this.y, 0.4);
      this.damage(b.tileDamage);
      return;
    }
  }
  draw() {
    Draw.setAlpha(0.85);
    Draw.rect('shock-mine', this.x, this.y);
    Draw.rect(Assets.team('shock-mine-team-top', Teams[this.team]), this.x, this.y);
    Draw.setAlpha(1);
  }
  info() { return ['Shocks enemy ground units that step on it. Enemies can\'t target it.']; }
}

// ---------------------------------------------------------------- overdrive dome (needs phase fabric + silicon to run)
class OverdriveDome extends OverdriveProjector {
  constructor(...a) { super(...a); this.useTimer = 0; }
  acceptItem(source, item) { return (item === Items.phaseFabric || item === Items.silicon) && this.items[item.id] < this.block.itemCapacity; }
  hasFuel() { return this.has(Items.phaseFabric) && this.has(Items.silicon); }
  get efficiency() { return this.hasFuel() ? (this.power ? this.power.satisfaction : 0) : 0; }
  shouldConsume() { return this.hasFuel(); }
  update() {
    super.update();
    if (this.efficiency > 0) {
      this.useTimer += Time.delta;
      if (this.useTimer >= this.block.useTime) { this.useTimer = 0; this.removeItem(Items.phaseFabric); this.removeItem(Items.silicon); }
    }
  }
  info() {
    const l = super.info();
    if (!this.hasFuel()) l.push('Needs phase fabric + silicon');
    return l;
  }
}

// ---------------------------------------------------------------- repair point (RepairTurret)
class RepairPoint extends Building {
  constructor(...a) { super(...a); this.turretRotation = 90; this.target = null; this.strength = 0; }
  update() {
    const b = this.block;
    if (this.timer('target', 20)) {
      let best = null, bd = Infinity;
      for (const u of Game.units) {
        if (u.dead || u.team !== this.team || u.health >= u.maxHealth) continue;
        const d = Mathf.dst(u.x, u.y, this.x, this.y);
        if (d <= b.repairRadius + u.hitSize / 2 && d < bd) { bd = d; best = u; }
      }
      this.target = best;
    }
    const t = this.target;
    if (t && (t.dead || t.health >= t.maxHealth || Mathf.dst(t.x, t.y, this.x, this.y) > b.repairRadius + t.hitSize / 2)) this.target = null;
    const eff = this.efficiency;
    this.strength = Mathf.lerp(this.strength, this.target && eff > 0 ? 1 : 0, Mathf.clamp(0.08 * Time.delta));
    if (this.target) {
      this.turretRotation = Angles.moveToward(this.turretRotation, Angles.angle(this.x, this.y, this.target.x, this.target.y), 10 * Time.delta);
      if (eff > 0) this.target.heal(b.repairSpeed * this.strength * eff * Time.delta);
    }
  }
  shouldConsume() { return !!this.target; }
  draw() {
    Draw.rect('repair-point-base', this.x, this.y);
    Draw.rect('repair-point', this.x, this.y, undefined, undefined, this.turretRotation - 90);
    if (this.target && this.strength > 0.05) {
      const sx = this.x + Angles.trnsx(this.turretRotation, 3), sy = this.y + Angles.trnsy(this.turretRotation, 3);
      Draw.setAlpha(this.strength);
      Draw.laser(sx, sy, this.target.x, this.target.y, this.block.beamWidth * this.strength, Pal.heal);
      Draw.setAlpha(1);
    }
  }
  drawSelect() { Lines.set(rgba(Pal.heal, 0.6), 1); Lines.dashCircle(this.x, this.y, this.block.repairRadius, Time.time / 60); }
  info() { return [this.target ? `Repairing ${this.target.type.name}` : 'No damaged units in range', `Heals ${(this.block.repairSpeed * 60).toFixed(0)} HP/s within ${(this.block.repairRadius / TS).toFixed(1)} tiles`]; }
}

Object.assign(BuildClasses, { Door, ShockMine, OverdriveDome, RepairPoint });

// ---------------------------------------------------------------- blocks
defBlock('door', 'Door', { requirements: req('titanium', 6, 'silicon', 4), health: 100 * wallHealthMultiplier, category: 'defense', group: 'walls' });
defBlock('door-large', 'Door', { requirements: req('titanium', 24, 'silicon', 16), health: 100 * 4 * wallHealthMultiplier, size: 2, category: 'defense', group: 'walls' });
defBlock('scrap-wall', 'Wall', { requirements: req('scrap', 6), health: 60 * wallHealthMultiplier, variants: 5, buildCostMultiplier: 4, category: 'defense', group: 'walls', iconLayers: ['scrap-wall1'] });
defBlock('scrap-wall-large', 'Wall', { requirements: req('scrap', 24), health: 60 * 4 * wallHealthMultiplier, size: 2, variants: 4, buildCostMultiplier: 4, category: 'defense', group: 'walls', iconLayers: ['scrap-wall-large1'] });
defBlock('scrap-wall-huge', 'Wall', { requirements: req('scrap', 54), health: 60 * 9 * wallHealthMultiplier, size: 3, variants: 3, buildCostMultiplier: 4, category: 'defense', group: 'walls', iconLayers: ['scrap-wall-huge1'] });
defBlock('scrap-wall-gigantic', 'Wall', { requirements: req('scrap', 96), health: 60 * 16 * wallHealthMultiplier, size: 4, buildCostMultiplier: 4, category: 'defense', group: 'walls' });
defBlock('shock-mine', 'ShockMine', {
  requirements: req('lead', 25, 'silicon', 12), health: 50, damage: 25, tileDamage: 7, length: 10, lengthRand: 0, tendrils: 4, cooldown: 80,
  solid: false, targetable: false, underBullets: true, category: 'effect', iconLayers: ['shock-mine'],
});
defBlock('overdrive-dome', 'OverdriveDome', {
  requirements: req('lead', 200, 'titanium', 130, 'silicon', 130, 'plastanium', 80, 'surge-alloy', 120), consumesPower: 10, size: 3, range: 200,
  speedBoost: 2.5, reload: 60, useTime: 300, hasItems: true, itemCapacity: 10, hasPower: true, noOverdrive: true, category: 'effect',
  speedBoostPhase: 0, phaseRangeBoost: 0, phaseUseTime: 1e9, iconLayers: ['overdrive-dome', 'overdrive-dome-top'],
});
defBlock('repair-point', 'RepairPoint', {
  requirements: req('lead', 30, 'copper', 30, 'silicon', 20), repairSpeed: 0.45, repairRadius: 60, beamWidth: 0.73, consumesPower: 1, hasPower: true,
  category: 'units', iconLayers: ['repair-point-base', 'repair-point'],
});

sortCategory('defense', ['copper-wall', 'copper-wall-large', 'titanium-wall', 'titanium-wall-large', 'plastanium-wall', 'plastanium-wall-large',
  'thorium-wall', 'thorium-wall-large', 'phase-wall', 'phase-wall-large', 'surge-wall', 'surge-wall-large', 'door', 'door-large',
  'scrap-wall', 'scrap-wall-large', 'scrap-wall-huge', 'scrap-wall-gigantic']);
sortCategory('effect', ['mender', 'mend-projector', 'overdrive-projector', 'overdrive-dome', 'force-projector', 'shock-mine', 'container', 'vault',
  'core-shard', 'core-foundation', 'core-nucleus']);
sortCategory('units', ['ground-factory', 'air-factory', 'naval-factory', 'additive-reconstructor', 'multiplicative-reconstructor',
  'exponential-reconstructor', 'tetrative-reconstructor', 'repair-point', 'unloader']);

Object.assign(DESCRIPTIONS, {
  'door': 'A wall you can open and close by clicking it. Open doors let units (yours and the enemy\'s) through.',
  'door-large': 'A 2x2 door. Click to open or close.',
  'scrap-wall': 'Cheap wall made from scrap.',
  'scrap-wall-large': 'Cheap 2x2 wall made from scrap.',
  'scrap-wall-huge': 'Cheap 3x3 wall made from scrap.',
  'scrap-wall-gigantic': 'Cheap 4x4 wall made from scrap.',
  'shock-mine': 'Zaps enemy ground units that walk over it with 4 lightning arcs. Enemies can\'t see or target it.',
  'overdrive-dome': 'Huge overdrive: +150% speed for blocks within 25 tiles. Burns phase fabric + silicon and lots of power.',
  'repair-point': 'Heals the nearest damaged friendly unit within 7.5 tiles. Needs power.',
});
