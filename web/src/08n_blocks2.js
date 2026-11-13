// Thermal generator (geothermal vents), illuminator, payload conveyor + payload router; silicon crucible heat boost.
// Stats from content/Blocks.java.

function sumHeat(b) { let h = 0; b.eachTile((x, y) => { h += World.floorAt(x, y).heat || 0; }); return h; }

// ---------------------------------------------------------------- thermal generator
class ThermalGenerator extends PowerBuilding {
  constructor(...a) { super(...a); this.heatSum = sumHeat(this); }
  get powerOut() { return this.block.powerProduction * this.heatSum; }
  update() { this.warmup = Mathf.approach(this.warmup, this.heatSum > 0 ? 1 : 0, 0.02 * Time.delta); if (this.heatSum > 0 && Math.random() < 0.02 * Time.delta) Fx.create('reactorSmoke', this.x + Mathf.range(5), this.y + Mathf.range(5)); }
  draw() {
    Draw.rect(this.block.name, this.x, this.y);
    if (this.heatSum > 0) {
      Draw.additive(true);
      Draw.setAlpha(Mathf.clamp(this.heatSum / 3) * (0.25 + Mathf.absin(Time.time, 9, 0.2)));
      Fill.set('#ff6a2b'); Fill.square(this.x, this.y, this.block.size * TS / 2 - 3);
      Draw.setAlpha(1); Draw.additive(false);
    }
  }
  info() { return [`+${(this.powerOut * 60).toFixed(0)} power/s`, `Heat under it: ${Math.round(this.heatSum * 100)}%`]; }
}

// silicon crucible: AttributeCrafter heat boost (boostScale 0.15 per heat, max +100%)
const _gcEffDesc = Object.getOwnPropertyDescriptor(Building.prototype, 'efficiency');
Object.defineProperty(GenericCrafter.prototype, 'efficiency', {
  configurable: true,
  get() {
    const base = _gcEffDesc.get.call(this);
    const hb = this.block.heatBoost;
    if (!hb) return base;
    if (this._heat === undefined) this._heat = sumHeat(this);
    return base * (1 + Math.min(1, hb * this._heat));
  },
});
BLOCKS['silicon-crucible'].heatBoost = 0.15; BLOCKS['silicon-crucible'].outputScale = 0.15;

// ---------------------------------------------------------------- illuminator
const LIGHT_COLORS = ['ffffff', 'ffd37f', 'ff9c5a', 'e55454', 'f4ba6e', '84f491', '6ecdec', 'a9d8ff', 'bf92f9'];
class Illuminator extends Building {
  constructor(...a) { super(...a); this.colorIdx = 0; }
  toggle() { this.colorIdx = (this.colorIdx + 1) % LIGHT_COLORS.length; Audio2.play('click', this.x, this.y, 0.4); }
  draw() {
    const c = col(LIGHT_COLORS[this.colorIdx]);
    Draw.rect('illuminator', this.x, this.y);
    Draw.rect(Assets.tinted('illuminator-top', c), this.x, this.y);
    const p = this.efficiency;
    if (p > 0) {
      Draw.additive(true);
      const r = this.block.radius;
      for (let i = 4; i >= 1; i--) { Draw.setAlpha(0.035 * p * this.block.brightness); Fill.set(c.css); Fill.circle(this.x, this.y, r * i / 4); }
      Draw.setAlpha(1); Draw.additive(false);
    }
  }
  writeState() { return this.colorIdx ? { c: this.colorIdx } : null; }
  readState(s) { this.colorIdx = s.c || 0; }
  info() { return [this.efficiency > 0 ? 'Lit' : 'Needs power', 'Click to change colour']; }
}

// ---------------------------------------------------------------- payload conveyor / router (carry units)
class PayloadConveyor extends Building {
  constructor(...a) { super(...a); this.payload = null; this.t = 0; this.inDir = Mathf.mod(this.rotation + 2, 4); this.rr = 0; }
  acceptPayload(source, type) {
    // PayloadConveyor.acceptPayload: any side, payloads up to 3x3 tiles (unit hitSize / 8 <= payloadLimit 3)
    if (this.payload || !type || source.team !== this.team || type.hitSize / TS > 3) return false;
    return source.relativeTo(this) >= 0;
  }
  handlePayload(source, type) {
    this.payload = type; this.t = 0;
    const d = source.relativeTo(this);
    this.inDir = d >= 0 ? Mathf.mod(d + 2, 4) : Mathf.mod(this.rotation + 2, 4);
    if (this.block.router) this.pickNext(d);
  }
  pickNext(fromDir) {
    // router: matching payloads (sort config) go straight, others rotate between free outputs
    const straight = fromDir >= 0 ? fromDir : this.rotation;
    if (this.sortUnit && this.payload && this.payload.name === this.sortUnit) { this.rotation = straight; return; }
    for (let k = 1; k <= 4; k++) {
      const dir = Mathf.mod(this.rr + k, 4);
      if (dir === this.inDir) continue;
      const n = this.nearby(dir);
      if (!n || (n.acceptPayload && n.acceptPayload(this, this.payload)) || !this.blockedAt(dir)) { this.rr = dir; this.rotation = dir; return; }
    }
  }
  blockedAt(dir) {
    const n = this.nearby(dir);
    if (n) return !(n.acceptPayload && n.acceptPayload(this, this.payload));
    return !this.canDrop(dir);
  }
  dropPos(dir) {
    const ang = dir * 90, d = this.block.size * TS / 2 + this.payload.hitSize / 2 + 2;
    return [this.x + Angles.trnsx(ang, d), this.y + Angles.trnsy(ang, d)];
  }
  canDrop(dir) {
    if (!this.payload) return false;
    const [x, y] = this.dropPos(dir);
    if (this.payload.flying) return true;
    if (this.payload.naval) return isWaterAt(x, y);
    return !new Unit(this.payload, this.team, x, y).collidesAt(x, y);
  }
  update() {
    if (!this.payload) return;
    const b = this.block;
    this.t += Time.delta * this.efficiency;
    if (this.t < b.moveTime) return;
    const next = this.front();
    if (next && next.acceptPayload) {
      if (next.acceptPayload(this, this.payload)) { next.handlePayload(this, this.payload); this.payload = null; this.t = 0; }
      return;
    }
    if (next) return; // a non-payload block is in the way
    if (this.canDrop(this.rotation)) {
      const [x, y] = this.dropPos(this.rotation);
      const u = Game.spawnUnit(this.payload, this.team, x, y, this.rotation * 90);
      u.vx = Angles.trnsx(this.rotation * 90, 1); u.vy = Angles.trnsy(this.rotation * 90, 1);
      Fx.create('unitSpawn', x, y, this.rotation * 90, Teams[this.team].color);
      this.payload = null; this.t = 0;
    }
  }
  payloadPos() {
    const f = Mathf.clamp(this.t / this.block.moveTime), half = this.block.size * TS / 2;
    const ia = this.inDir * 90, oa = this.rotation * 90;
    if (f < 0.5) { const k = 1 - f * 2; return [this.x + Angles.trnsx(ia, half * k), this.y + Angles.trnsy(ia, half * k), ia + 180]; }
    const k = (f - 0.5) * 2;
    return [this.x + Angles.trnsx(oa, half * k), this.y + Angles.trnsy(oa, half * k), oa];
  }
  draw() {
    const n = this.block.name, r = this.rotation * 90;
    Draw.rect(n, this.x, this.y);
    if (this.payload) {
      const [px, py, pr] = this.payloadPos();
      Draw.setAlpha(0.35); Draw.rect(this.payload.name, px - 2, py - 2, undefined, undefined, pr - 90); Draw.setAlpha(1);
      Draw.rect(this.payload.name, px, py, undefined, undefined, pr - 90);
    }
    if (this.block.router) Draw.rect(n + '-over', this.x, this.y, undefined, undefined, r);
    Draw.rect(n + '-top', this.x, this.y, undefined, undefined, r);
  }
  writeState() { return this.payload ? { u: this.payload.name, t: this.t, i: this.inDir, s: this.sortUnit || null } : (this.sortUnit ? { s: this.sortUnit } : null); }
  readState(s) { this.payload = s.u ? UNITS[s.u] : null; this.t = s.t || 0; this.inDir = s.i ?? this.inDir; this.sortUnit = s.s || null; }
  toggle() {
    if (!this.block.router) return;
    // router sort setting: cycle through unit types that have been seen, or off
    const names = Object.keys(UNITS).filter(n => n !== 'alpha' && n !== 'beta' && n !== 'gamma');
    const i = this.sortUnit ? names.indexOf(this.sortUnit) : -1;
    this.sortUnit = i + 1 < names.length ? names[i + 1] : null;
    UI.toast(this.sortUnit ? `Router: ${this.sortUnit} goes straight` : 'Router: no sorting', 1.2);
  }
  info() {
    const l = [this.payload ? `Carrying ${this.payload.name}` : 'Empty'];
    if (this.block.router) l.push(this.sortUnit ? `Sort: ${this.sortUnit} goes straight (click to change)` : 'Click to set a unit type to sort');
    return l;
  }
}

// factories and reconstructors hand finished units to a payload conveyor in front of them
const _plUfUpdate = UnitFactory.prototype.update;
UnitFactory.prototype.update = function () {
  const p = this.plan, next = this.front();
  if (p && next instanceof PayloadConveyor && next.team === this.team && this.progress + Time.delta * this.efficiency >= p.time && this.canBuild()) {
    if (next.acceptPayload(this, UNITS[p.unit])) {
      for (const r of p.requirements) this.removeItem(r.item, r.amount);
      this.progress = 0;
      next.handlePayload(this, UNITS[p.unit]);
      Audio2.play('unitCreate', this.x, this.y, 0.6);
    }
    return;
  }
  _plUfUpdate.call(this);
};
const _plRcUpdate = Reconstructor.prototype.update;
Reconstructor.prototype.update = function () {
  const next = this.front();
  if (this.payload && this.progress >= this.block.constructTime && next instanceof PayloadConveyor && next.team === this.team) {
    const up = this.upgrade(this.payload);
    if (up && next.acceptPayload(this, up)) { next.handlePayload(this, up); this.payload = null; this.progress = 0; }
    return;
  }
  _plRcUpdate.call(this);
};

Object.assign(BuildClasses, { ThermalGenerator, Illuminator, PayloadConveyor });

// ---------------------------------------------------------------- blocks
defBlock('thermal-generator', 'ThermalGenerator', {
  requirements: req('copper', 40, 'graphite', 35, 'lead', 50, 'silicon', 35, 'metaglass', 40), powerProduction: 1.8, size: 2, floating: true,
  requiresHeat: true, hasPower: true, outputsPower: true, category: 'power', flags: ['generator'],
});
defBlock('illuminator', 'Illuminator', {
  requirements: req('graphite', 12, 'silicon', 8, 'lead', 8), brightness: 0.75, radius: 140, consumesPower: 0.05, hasPower: true,
  solid: true, category: 'effect', iconLayers: ['illuminator', 'illuminator-top'],
});
defBlock('payload-conveyor', 'PayloadConveyor', {
  requirements: req('graphite', 10, 'copper', 10), size: 3, moveTime: 45, rotate: true, solid: false, underBullets: true, noOverdrive: true,
  category: 'units', iconLayers: ['payload-conveyor-icon'],
});
defBlock('payload-router', 'PayloadConveyor', {
  requirements: req('graphite', 15, 'copper', 10), size: 3, moveTime: 45, rotate: true, router: true, solid: false, underBullets: true,
  noOverdrive: true, configurable: true, category: 'units', iconLayers: ['payload-router-icon'],
});

sortCategory('power', ['combustion-generator', 'thermal-generator', 'steam-generator', 'differential-generator', 'rtg-generator', 'solar-panel',
  'solar-panel-large', 'thorium-reactor', 'impact-reactor', 'power-node', 'power-node-large', 'surge-tower', 'diode', 'battery', 'battery-large']);
sortCategory('effect', ['mender', 'mend-projector', 'overdrive-projector', 'overdrive-dome', 'force-projector', 'shock-mine', 'container', 'vault', 'illuminator']);
sortCategory('units', ['ground-factory', 'air-factory', 'naval-factory', 'additive-reconstructor', 'multiplicative-reconstructor',
  'exponential-reconstructor', 'tetrative-reconstructor', 'repair-point', 'payload-conveyor', 'payload-router', 'unloader']);

Object.assign(DESCRIPTIONS, {
  'thermal-generator': 'Makes power from geothermal heat. Only works on hot rock and magma rock (the glowing orange floor in basalt and char areas).',
  'illuminator': 'A light. Click it to change its colour. Uses a tiny bit of power.',
  'payload-conveyor': 'Carries units. Point a unit factory or reconstructor into it, then lead it into a reconstructor, or let it drop the unit off at the end.',
  'payload-router': 'Splits units between its outputs. Click to pick a unit type that always goes straight through.',
  'silicon-crucible': 'Big silicon smelter: 4 coal + 6 sand + 1 pyratite → 8 silicon. Needs power. Up to 2x faster on hot rock / magma rock.',
});
