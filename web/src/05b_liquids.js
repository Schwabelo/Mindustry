// Liquids: LiquidModule-style single-liquid storage, flow (BuildingComp.moveLiquid / dumpLiquid),
// pumps, conduits, liquid routers/tanks, junctions and bridge conduits.

const LIQUIDS = [];
const Liquids = {};
function defLiquid(name, color, props = {}) {
  const l = Object.assign({ name, id: LIQUIDS.length, color: col(color), heatCapacity: 0.5, coolant: true, icon: 'liquid-' + name }, props);
  LIQUIDS.push(l); Liquids[name] = l;
  return l;
}
defLiquid('water', '596ab8', { heatCapacity: 0.4 });
defLiquid('cryofluid', '6ecdec', { heatCapacity: 0.9 });

// ---------------------------------------------------------------- shared building behaviour
Object.assign(Building.prototype, {
  liquidAmount(l) { return this.liquid && this.liquid.type === l ? this.liquid.amount : 0; },
  consumesLiquid(l) { return !!(this.block.liquidInputs && this.block.liquidInputs.includes(l.name)); },
  acceptLiquid(source, l) {
    const lq = this.liquid;
    return !!lq && this.consumesLiquid(l) && (lq.type === l || lq.amount < 0.2) && lq.amount < this.block.liquidCapacity;
  },
  handleLiquid(source, l, amount) {
    const lq = this.liquid;
    if (lq.type !== l) { lq.type = l; lq.amount = 0; }
    lq.amount = Math.min(this.block.liquidCapacity, lq.amount + amount);
  },
  removeLiquid(amount) {
    this.liquid.amount = Math.max(0, this.liquid.amount - amount);
  },
  getLiquidDestination(source, l) { return this; },

  // BuildingComp.moveLiquid
  moveLiquid(next, l) {
    if (!next || !this.liquid || this.liquid.type !== l) return 0;
    next = next.getLiquidDestination(this, l);
    if (!next || next.team !== this.team || !next.liquid || this.liquid.amount <= 0) return 0;
    const ocap = next.block.liquidCapacity;
    const ofract = next.liquidAmount(l) / ocap;
    const fract = this.liquid.amount / this.block.liquidCapacity * (this.block.liquidPressure || 1); // BuildingComp.moveLiquid
    let flow = Math.min(Mathf.clamp(fract - ofract) * this.block.liquidCapacity, this.liquid.amount);
    flow = Math.min(flow, ocap - next.liquidAmount(l));
    if (flow > 0 && ofract <= fract && next.acceptLiquid(this, l)) {
      next.handleLiquid(this, l, flow);
      this.removeLiquid(flow);
      return flow;
    }
    return 0;
  },

  // BuildingComp.dumpLiquid
  dumpLiquid(l, scaling = 2) {
    if (!this.liquid || this.liquid.type !== l || this.liquid.amount <= 0.0001) return;
    const n = this.proximity.length;
    if (!n) return;
    const start = this.cdump % n;
    for (let i = 0; i < n; i++) {
      this.cdump = (this.cdump + 1) % n;
      let other = this.proximity[(i + start) % n];
      other = other.getLiquidDestination(this, l);
      if (!other || other === this || !other.liquid || other.team !== this.team || !this.canDumpLiquid(other, l)) continue;
      const ofract = other.liquidAmount(l) / other.block.liquidCapacity;
      const fract = this.liquid.amount / this.block.liquidCapacity;
      if (ofract < fract) {
        const flow = Math.min(other.block.liquidCapacity - other.liquidAmount(l), (fract - ofract) * this.block.liquidCapacity / scaling);
        if (flow > 0 && other.acceptLiquid(this, l)) { other.handleLiquid(this, l, flow); this.removeLiquid(flow); }
      }
    }
  },
  canDumpLiquid(to, l) { return true; },
});

function drawLiquidFill(b, reg, inset) {
  const lq = b.liquid;
  if (!lq || !lq.type || lq.amount <= 0.001) return;
  const f = Mathf.clamp(lq.amount / b.block.liquidCapacity);
  Draw.setAlpha(Math.min(1, f * 1.2));
  if (reg) Draw.rect(Assets.silhouette(reg, lq.type.color), b.x, b.y);
  else { Fill.set(lq.type.color.css); Fill.square(b.x, b.y, b.block.size * TS / 2 - inset); }
  Draw.setAlpha(1);
}

// ---------------------------------------------------------------- pump
class Pump extends Building {
  constructor(...a) {
    super(...a);
    let n = 0, mult = 0, drop = null;
    this.eachTile((x, y) => { const f = World.floorAt(x, y); if (f.liquidDrop && (!drop || drop === f.liquidDrop)) { drop = f.liquidDrop; n++; mult += f.liquidMultiplier || 1; } });
    this.pumpTiles = n; this.pumpMult = mult; this.drop = drop;
  }
  update() {
    const lq = this.liquid;
    const out = this.drop ? Liquids[this.drop] : null;
    if (this.pumpTiles > 0 && out) {
      if (lq.type !== out) { lq.type = out; lq.amount = 0; }
      lq.amount = Math.min(this.block.liquidCapacity, lq.amount + this.block.pumpAmount * this.pumpMult * this.efficiency * Time.delta);
      this.warmup = Mathf.approach(this.warmup, 1, 0.02 * Time.delta);
    }
    if (out) this.dumpLiquid(out);
  }
  acceptLiquid() { return false; }
  draw() {
    Draw.rect(this.block.name, this.x, this.y);
    drawLiquidFill(this, this.block.name + '-liquid');
  }
  info() { return this.pumpTiles ? [`Pumping ${(this.block.pumpAmount * this.pumpMult * this.efficiency * 60).toFixed(1)} ${this.drop}/s`].concat(this.block.consumesPower && this.efficiency <= 0 ? ['Needs power'] : []) : ['Not on a liquid']; }
}

// ---------------------------------------------------------------- conduit
class Conduit extends Building {
  constructor(...a) { super(...a); this.blendbits = 0; this.blendscly = 1; }
  blendsWith(o) {
    if (!o || o.team !== this.team || !o.liquid) return false;
    if (o.block.rotate) return o.front() === this;
    return !!o.block.outputsLiquid;
  }
  onProximityUpdate() {
    const b = i => this.blendsWith(this.nearby(this.rotation - i));
    const b1 = b(1), b2 = b(2), b3 = b(3);
    const num = (b2 && b1 && b3) ? 0 : (b1 && b3) ? 1 : (b1 && b2) ? 2 : (b3 && b2) ? 3 : b1 ? 4 : b3 ? 5 : -1;
    this.blendbits = 0; this.blendscly = 1;
    switch (num) {
      case 0: this.blendbits = 3; break;
      case 1: this.blendbits = 4; break;
      case 2: this.blendbits = 2; break;
      case 3: this.blendbits = 2; this.blendscly = -1; break;
      case 4: this.blendbits = 1; this.blendscly = -1; break;
      case 5: this.blendbits = 1; break;
    }
  }
  acceptLiquid(source, l) {
    const lq = this.liquid;
    return (lq.type === l || lq.amount < 0.2) && this.relativeTo(source) !== this.rotation && lq.amount < this.block.liquidCapacity;
  }
  update() {
    if (this.liquid.amount > 0.0001) this.moveLiquid(this.front(), this.liquid.type);
  }
  draw() {
    const r = this.rotation * 90, bits = this.blendbits;
    const bot = 'conduit-bottom-' + bits;
    Draw.rect(Assets.tinted(bot, col('565656')), this.x, this.y, TS, TS * this.blendscly, r);
    const lq = this.liquid;
    if (lq.type && lq.amount > 0.001) {
      Draw.setAlpha(Mathf.clamp(lq.amount / this.block.liquidCapacity * 1.4));
      Draw.rect(Assets.silhouette(bot, lq.type.color), this.x, this.y, TS, TS * this.blendscly, r);
      Draw.setAlpha(1);
    }
    Draw.rect(this.block.name + '-top-' + bits, this.x, this.y, TS, TS * this.blendscly, r);
  }
}

// ---------------------------------------------------------------- router / tank
class LiquidRouter extends Building {
  acceptLiquid(source, l) {
    const lq = this.liquid;
    return (lq.type === l || lq.amount < 0.2) && lq.amount < this.block.liquidCapacity;
  }
  update() { if (this.liquid.type) this.dumpLiquid(this.liquid.type); }
  draw() {
    Draw.rect(this.block.name + '-bottom', this.x, this.y);
    drawLiquidFill(this, null, 1.5);
    Draw.rect(this.block.name, this.x, this.y);
  }
}

// ---------------------------------------------------------------- junction: passes liquid straight through
class LiquidJunction extends Building {
  getLiquidDestination(source, l) {
    const dir = source.relativeTo(this);
    if (dir < 0) return this;
    const next = this.nearby(dir);
    if (!next || !next.liquid || next.team !== this.team || next === source) return this;
    if (instantDepth > 6) return this;
    instantDepth++;
    try { return next.getLiquidDestination(this, l); } finally { instantDepth--; }
  }
  acceptLiquid() { return false; }
}

// ---------------------------------------------------------------- bridge conduit
class LiquidBridge extends ItemBridge {
  acceptItem() { return false; }
  acceptLiquid(source, l) {
    const lq = this.liquid;
    if (source.team !== this.team || !(lq.type === l || lq.amount < 0.2) || lq.amount >= this.block.liquidCapacity) return false;
    if (this.linked(source)) return true;
    if (!this.linkValid(this.link)) return false;
    return this.relativeTo(this.link) !== this.relativeTo(source);
  }
  canDumpLiquid(to, l) {
    const rel = this.relativeTo(to);
    for (const inc of this.incoming) if (this.relativeTo(inc) === rel) return false;
    return !(to instanceof LiquidBridge && to.link === this);
  }
  update() {
    if (this.link && !this.linkValid(this.link)) { this.link.incoming && this.link.incoming.delete(this); this.link = null; }
    if (!this.liquid.type) return;
    if (this.linkValid(this.link)) this.moveLiquid(this.link, this.liquid.type);
    else this.dumpLiquid(this.liquid.type, 1);
  }
  draw() { Draw.rect(this.block.name, this.x, this.y); }
  drawBridge() {
    if (!this.linkValid(this.link)) return;
    const o = this.link, n = this.block.name;
    const ang = Angles.angle(this.x, this.y, o.x, o.y);
    Draw.setAlpha(0.85);
    Draw.lineRegion(n + '-bridge', this.x, this.y, o.x, o.y, TS);
    Draw.rect(n + '-end', this.x, this.y, TS, TS, ang);
    Draw.rect(n + '-end', o.x, o.y, TS, TS, ang + 180);
    const dist = Math.hypot(o.x - this.x, o.y - this.y), arrows = Math.max(1, Math.round(dist / 6) - 1);
    for (let a = 0; a < arrows; a++) {
      const f = (a + 1) / (arrows + 1);
      Draw.setAlpha(Mathf.absin(a / arrows - Time.time / 100, 0.1, 1) * 0.85);
      Draw.rect(n + '-arrow', Mathf.lerp(this.x, o.x, f), Mathf.lerp(this.y, o.y, f), TS, TS, ang);
    }
    Draw.setAlpha(1);
  }
  info() { return this.liquid.type ? [`${this.liquid.type.name}: ${this.liquid.amount.toFixed(1)} / ${this.block.liquidCapacity}`] : []; }
}

Object.assign(BuildClasses, { Pump, Conduit, LiquidRouter, LiquidJunction, LiquidBridge });

// ---------------------------------------------------------------- content
defBlock('mechanical-pump', 'Pump', {
  requirements: req('copper', 15, 'metaglass', 10), pumpAmount: 7 / 60, liquidCapacity: 20, category: 'liquid',
  hasLiquids: true, outputsLiquid: true, floating: true, solid: true,
});
defBlock('conduit', 'Conduit', {
  requirements: req('metaglass', 1), liquidCapacity: 20, health: 45, category: 'liquid', hasLiquids: true, rotate: true,
  solid: false, group: 'liquid', underBullets: true, iconLayers: ['conduit-bottom', 'conduit-top-0'],
});
defBlock('liquid-router', 'LiquidRouter', {
  requirements: req('graphite', 4, 'metaglass', 2), liquidCapacity: 120, category: 'liquid', hasLiquids: true,
  outputsLiquid: true, solid: false, group: 'liquid', underBullets: true, iconLayers: ['liquid-router-bottom', 'liquid-router'],
});
defBlock('liquid-junction', 'LiquidJunction', {
  requirements: req('graphite', 4, 'metaglass', 8), category: 'liquid', hasLiquids: true, liquidCapacity: 10, solid: false,
  group: 'liquid', underBullets: true,
});
defBlock('bridge-conduit', 'LiquidBridge', {
  requirements: req('graphite', 4, 'metaglass', 8), range: 4, liquidCapacity: 100, category: 'liquid', hasLiquids: true,
  outputsLiquid: true, floating: true, configurable: true, underBullets: true, hasItems: false,
});
defBlock('liquid-tank', 'LiquidRouter', {
  requirements: req('titanium', 30, 'metaglass', 40), size: 3, liquidCapacity: 1800, health: 500, category: 'liquid',
  hasLiquids: true, outputsLiquid: true, iconLayers: ['liquid-tank-bottom', 'liquid-tank'],
});


Object.assign(DESCRIPTIONS, {
  'mechanical-pump': 'Pumps liquid from the tile it is placed on: water from water tiles, oil from tar.',
  'conduit': 'Moves liquids forward, like a conveyor for liquids.',
  'liquid-router': 'Accepts liquid from one direction and outputs it to up to 3 other directions equally.',
  'liquid-junction': 'Acts as a bridge for two crossing conduits.',
  'bridge-conduit': 'Transports liquids over terrain or buildings, up to 3 tiles apart. Click it, then another bridge to link.',
  'liquid-tank': 'Stores a large amount of liquid and outputs it to all sides, like a liquid router.',
});
