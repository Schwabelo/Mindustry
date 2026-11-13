// Logistics: plastanium conveyor (StackConveyor), armored conveyor, phase conveyor, inverted sorter, underflow gate,
// distributor and mass driver. Stats from content/Blocks.java; logic from world/blocks/distribution/*.java.

// ================================================================ armored conveyor
// ArmoredConveyor: only takes items from other conveyors, or from blocks directly behind it
const _cvAccept = Conveyor.prototype.acceptItem;
Conveyor.prototype.acceptItem = function (source, item) {
  if (!_cvAccept.call(this, source, item)) return false;
  if (!this.block.armored) return true;
  return source instanceof Conveyor || source.relativeTo(this) === this.rotation; // ArmoredConveyor: plastanium (StackConveyor) isn't a Conveyor
};
const _cvBlends = Conveyor.prototype.blendsWith;
Conveyor.prototype.blendsWith = function (other) {
  if (!this.block.armored) return _cvBlends.call(this, other);
  if (!other || other.team !== this.team || other.dead) return false;
  if (other instanceof Conveyor || other instanceof StackConveyor) return other.front() === this;
  return _cvBlends.call(this, other) && other === this.nearby(this.rotation + 2);
};

// ================================================================ phase conveyor (plain ItemBridge: powered, near-instant)
const _brUpdate = ItemBridge.prototype.update;
ItemBridge.prototype.update = function () {
  const b = this.block;
  if (!b.direct) return _brUpdate.call(this);
  if (this.link && !this.linkValid(this.link)) { this.link.incoming && this.link.incoming.delete(this); this.link = null; }
  if (this.linkValid(this.link)) {
    const eff = this.efficiency;
    this.transportCounter = (this.transportCounter || 0) + Time.delta * eff;
    while (this.transportCounter >= b.transportTime) {
      this.transportCounter -= b.transportTime;
      const it = this.firstItem();
      if (!it || !this.link.acceptItem(this, it)) { this.transportCounter = 0; break; }
      this.removeItem(it); this.link.handleItem(this, it);
    }
    this.transportTime += Time.delta * eff;
  } else if (this.timer('dump', 2)) this.dump();
};

// ================================================================ plastanium conveyor
const STACK_MOVE = 0, STACK_LOAD = 1, STACK_UNLOAD = 2;
class StackConveyor extends Building {
  constructor(...a) { super(...a); this.state = STACK_MOVE; this.hasStack = false; this.cooldown = 0; this.lastItem = null; this.from = null; this.blendprox = 0; }
  isStack(o) { return o instanceof StackConveyor && o.team === this.team && !o.dead; }
  onProximityUpdate() {
    const front = this.front();
    const feeders = this.proximity.filter(o => this.isStack(o) && o.front() === this);
    const frontStack = this.isStack(front);
    // a piece with nothing feeding it loads, the last piece of a line unloads, everything in between moves
    this.state = !feeders.length && frontStack ? STACK_LOAD : feeders.length && !frontStack ? STACK_UNLOAD : STACK_MOVE;
    this.blendprox = 0;
    for (let i = 0; i < 4; i++) {
      const o = this.nearby(this.rotation - i);
      if (this.isStack(o) && (i === 0 || o.front() === this)) this.blendprox |= 1 << i;
    }
  }
  acceptItem(source, item) {
    if (this.cooldown > this.block.recharge - 1) return false;
    if (this.state !== STACK_LOAD) return false;
    if (this.total > 0 && !this.has(item)) return false;
    return this.total < this.block.itemCapacity && this.front() !== source;
  }
  handleItem(source, item) {
    if (this.total === 0) { this.hasStack = true; this.from = null; Fx.create('conveyorPoof', this.x, this.y); }
    this.addItem(item);
    this.lastItem = item;
  }
  update() {
    const b = this.block;
    // StackConveyor: eff = efficiency + baseEfficiency (0) = 1 for this unpowered block
    if (this.cooldown > 0) this.cooldown = Mathf.clamp(this.cooldown - b.speed * Time.delta, 0, b.recharge);
    if (!this.hasStack || this.cooldown > 0) return;
    if (!this.lastItem || !this.has(this.lastItem)) this.lastItem = this.firstItem();
    if (this.state === STACK_UNLOAD) {
      // outputRouter: unload into every neighbour that takes it
      while (this.lastItem && this.dump(this.lastItem)) {
        if (!this.has(this.lastItem)) { Fx.create('conveyorPoof', this.x, this.y); this.hasStack = false; this.lastItem = null; break; }
      }
      if (this.total === 0) { this.hasStack = false; this.lastItem = null; }
    } else if (this.state !== STACK_LOAD || this.total >= b.itemCapacity) {
      const e = this.front();
      if (this.isStack(e) && !e.hasStack) {
        for (let i = 0; i < ITEMS.length; i++) if (this.items[i]) { e.items[i] += this.items[i]; e.total += this.items[i]; }
        e.lastItem = this.lastItem; e.hasStack = true; e.from = this; e.cooldown = 1;
        this.items.fill(0); this.total = 0; this.hasStack = false; this.lastItem = null; this.cooldown = b.recharge;
      }
    }
  }
  drawUnder() {
    const n = this.block.name;
    Draw.rect(`${n}-${this.state}`, this.x, this.y, undefined, undefined, this.rotation * 90);
    for (let i = 0; i < 4; i++) if ((this.blendprox & (1 << i)) === 0) Draw.rect(n + '-edge', this.x, this.y, undefined, undefined, (this.rotation - i) * 90);
  }
  draw() {}
  drawItems() {
    if (!this.hasStack || !this.lastItem) return;
    const f = 1 - this.cooldown;
    const fx = this.from && !this.from.dead ? this.from.x : this.x, fy = this.from && !this.from.dead ? this.from.y : this.y;
    const x = Mathf.lerp(fx, this.x, f), y = Mathf.lerp(fy, this.y, f);
    const a = this.from ? Mathf.lerp(this.from.rotation * 90, this.rotation * 90, f) : this.rotation * 90;
    Draw.rect(this.block.name + '-stack', x, y, undefined, undefined, a);
    const s = 5 * Mathf.lerp(Math.min(this.total / this.block.itemCapacity, 1), 1, 0.4);
    Draw.rect(this.lastItem.icon, x, y, s, s);
  }
  writeState() { return { st: this.hasStack ? 1 : 0, c: this.cooldown }; }
  readState(s) { this.hasStack = !!s.st; this.cooldown = s.c || 0; this.lastItem = this.firstItem(); if (!this.lastItem) this.hasStack = false; }
  info() { return [['Moving', 'Loading', 'Unloading'][this.state] + (this.hasStack ? `: ${this.total} ${this.lastItem ? this.lastItem.name : ''}` : '')]; }
}

// ================================================================ mass driver
class MassDriver extends Building {
  constructor(...a) {
    super(...a);
    this.link = null; this.turretRotation = 90; this.reloadCounter = 0; this.state = 'idle'; this.waiting = []; this.linkPos = null; this.recoil = 0;
  }
  linkValid(o = this.link) {
    return !!o && !o.dead && o !== this && o instanceof MassDriver && o.team === this.team && Mathf.dst(this.x, this.y, o.x, o.y) <= this.block.range;
  }
  configure(o) { this.link = this.link === o ? null : o; }
  acceptItem(source, item) { return this.total < this.block.itemCapacity && this.linkValid(); }
  currentShooter() { return this.waiting[0] || null; }
  update() {
    const b = this.block;
    if (this.linkPos && !this.link) { const o = World.buildAt(this.linkPos[0], this.linkPos[1]); if (o instanceof MassDriver) this.link = o; this.linkPos = null; }
    const hasLink = this.linkValid();
    if (this.reloadCounter > 0) this.reloadCounter = Mathf.clamp(this.reloadCounter - Time.delta * this.efficiency / b.reload);
    this.recoil = Mathf.approach(this.recoil, 0, Time.delta / 20);
    this.waiting = this.waiting.filter(s => !s.dead && s.link === this && s.linkValid());
    const space = b.itemCapacity - this.total;
    if (this.state === 'idle') {
      if (this.waiting.length && space >= b.minDistribute) this.state = 'accepting';
      else if (hasLink) this.state = 'shooting';
    }
    if ((this.state === 'idle' || this.state === 'accepting') && this.timer('dump', 2)) this.dump();
    const eff = this.efficiency;
    if (eff <= 0) return;
    if (this.state === 'accepting') {
      const cur = this.currentShooter();
      if (!cur || space < b.minDistribute) { this.state = 'idle'; return; }
      this.turretRotation = Angles.moveToward(this.turretRotation, Angles.angle(this.x, this.y, cur.x, cur.y), b.rotateSpeed * eff * Time.delta);
    } else if (this.state === 'shooting') {
      if (!hasLink || (this.waiting.length && space >= b.minDistribute)) { this.state = 'idle'; return; }
      const o = this.link, ang = Angles.angle(this.x, this.y, o.x, o.y);
      if (this.total >= b.minDistribute && o.block.itemCapacity - o.total >= b.minDistribute) {
        if (!o.waiting.includes(this)) o.waiting.push(this);
        if (this.reloadCounter <= 0.0001) {
          this.turretRotation = Angles.moveToward(this.turretRotation, ang, b.rotateSpeed * eff * Time.delta);
          if (o.currentShooter() === this && o.state === 'accepting' && Angles.within(this.turretRotation, ang, 2) && Angles.within(o.turretRotation, ang + 180, 2)) {
            this.fire(o);
            this.state = 'idle';
          }
        }
      }
    }
  }
  fire(o) {
    const b = this.block, ang = this.turretRotation;
    const items = Array.from(this.items);
    this.items.fill(0); this.total = 0;
    const sx = this.x + Angles.trnsx(ang, b.translation), sy = this.y + Angles.trnsy(ang, b.translation);
    MassBolts.list.push({ x: sx, y: sy, ang, from: this, to: o, items, dist: Mathf.dst(sx, sy, o.x, o.y), t: 0 });
    this.reloadCounter = 1; this.recoil = 1;
    Fx.create('shootBig', sx, sy, ang);
    Audio2.play('shootArtillery', this.x, this.y, 0.5);
    if (Math.hypot(Render.camX - this.x, Render.camY - this.y) < 250) Render.shake(b.shake, b.shake);
  }
  receive(bolt) {
    for (let i = 0; i < ITEMS.length; i++) {
      const n = Math.min(bolt.items[i], this.block.itemCapacity * 2 - this.total);
      if (n > 0) { this.items[i] += n; this.total += n; }
    }
    this.waiting = this.waiting.filter(s => s !== bolt.from);
    this.state = 'idle'; this.reloadCounter = 1;
    Fx.create('flakExplosion', this.x, this.y);
  }
  draw() {
    const b = this.block, r = this.turretRotation;
    Draw.rect(b.name + '-base', this.x, this.y);
    const rec = -this.recoil * 4;
    Draw.rect(b.name, this.x + Angles.trnsx(r, rec), this.y + Angles.trnsy(r, rec), undefined, undefined, r - 90);
  }
  drawSelect() {
    if (!this.linkValid()) return;
    Lines.set(rgba(Pal.place, 0.6), 1); Lines.line(this.x, this.y, this.link.x, this.link.y);
  }
  writeState() { return this.linkValid() ? { lk: [this.link.tx, this.link.ty], r: Math.round(this.turretRotation) } : { r: Math.round(this.turretRotation) }; }
  readState(s) { if (s.lk) this.linkPos = s.lk; this.turretRotation = s.r ?? 90; }
  onRemoved() { for (const o of Game.teamBuildings(this.team)) if (o instanceof MassDriver && o.link === this) o.link = null; }
  info() {
    const lines = [`Items: ${this.total}/${this.block.itemCapacity}`];
    if (this.linkValid()) lines.push(`Linked → sends batches of ${this.block.minDistribute}+ items`);
    else lines.push(this.waiting.length ? 'Receiving' : 'Not linked: click it, then click another mass driver in range');
    if (this.efficiency <= 0) lines.push('Needs power');
    return lines;
  }
}
const MassBolts = {
  list: [],
  update() {
    for (const m of this.list) {
      m.t += 5.5 * Time.delta;
      m.x += Angles.trnsx(m.ang, 5.5 * Time.delta); m.y += Angles.trnsy(m.ang, 5.5 * Time.delta);
      if (m.t >= m.dist) {
        m.done = true;
        if (m.to && !m.to.dead) m.to.receive(m);
        else Fx.create('blastExplosion', m.x, m.y); // target gone: the payload is lost
      }
    }
    this.list = this.list.filter(m => !m.done);
  },
  draw() {
    for (const m of this.list) {
      if (!MassBolts.back) { MassBolts.back = Assets.tinted('shell-back', Pal.bulletYellowBack); MassBolts.front = Assets.tinted('shell', Pal.bulletYellow); }
      Draw.rect(MassBolts.back, m.x, m.y, 11, 13, m.ang - 90);
      Draw.rect(MassBolts.front, m.x, m.y, 11, 13, m.ang - 90);
    }
  },
};
const _lgBulletsUpdate = Bullets.update;
Bullets.update = function () { MassBolts.update(); _lgBulletsUpdate.call(this); };
const _lgBulletsDraw = Bullets.draw;
Bullets.draw = function () { _lgBulletsDraw.call(this); MassBolts.draw(); };

Object.assign(BuildClasses, { StackConveyor, MassDriver });
OUTPUTS_ITEMS.add('StackConveyor');
FX.conveyorPoof = { life: 35, draw(e) {
  Fill.set(rgba(col('6e7080'), e.fout * 0.8));
  randLen(e, 4, 3 + e.fin * 4, (x, y) => Fill.circle(e.x + x, e.y + y, 0.5 + e.fout * 1.6));
} };

// ================================================================ block definitions
defBlock('plastanium-conveyor', 'StackConveyor', {
  requirements: req('plastanium', 1, 'silicon', 1, 'graphite', 1), health: 90, speed: 4 / 60, itemCapacity: 10, recharge: 2, rotate: true,
  solid: false, group: transport, hasItems: true, underBullets: true, category: 'distribution', iconLayers: ['plastanium-conveyor-0'],
});
defBlock('armored-conveyor', 'Conveyor', {
  requirements: req('plastanium', 1, 'thorium', 1, 'metaglass', 1), health: 280, speed: 0.08, displayedSpeed: 10, armored: true,
  solid: false, rotate: true, group: transport, hasItems: true, underBullets: true, category: 'distribution',
});
defBlock('phase-conveyor', 'ItemBridge', {
  requirements: req('phase-fabric', 5, 'silicon', 7, 'lead', 10, 'graphite', 10), range: 12, transportTime: 2, direct: true, hasPower: true,
  consumesPower: 0.3, group: transport, hasItems: true, itemCapacity: 10, configurable: true, underBullets: true, category: 'distribution',
});
defBlock('inverted-sorter', 'Sorter', {
  requirements: req('lead', 2, 'copper', 2), buildCostMultiplier: 3, group: transport, configurable: true, underBullets: true, invert: true, category: 'distribution', solid: false,
});
defBlock('underflow-gate', 'OverflowGate', {
  requirements: req('lead', 2, 'copper', 4), buildCostMultiplier: 3, group: transport, underBullets: true, invert: true, category: 'distribution', solid: false,
});
defBlock('distributor', 'Router', {
  requirements: req('lead', 4, 'copper', 4), size: 2, buildCostMultiplier: 3, group: transport, hasItems: true, itemCapacity: 1, speed: 8, category: 'distribution', solid: false,
});
defBlock('mass-driver', 'MassDriver', {
  requirements: req('titanium', 125, 'silicon', 75, 'lead', 125, 'thorium', 50), size: 3, itemCapacity: 120, reload: 200, range: 440,
  minDistribute: 10, rotateSpeed: 5, translation: 7, shake: 3, hasPower: true, consumesPower: 1.75, hasItems: true, configurable: true,
  category: 'distribution', iconLayers: ['mass-driver-base', 'mass-driver'],
});

// distribution menu in Mindustry's order
{
  const order = ['conveyor', 'titanium-conveyor', 'plastanium-conveyor', 'armored-conveyor', 'junction', 'bridge-conveyor', 'phase-conveyor',
    'sorter', 'inverted-sorter', 'router', 'distributor', 'overflow-gate', 'underflow-gate', 'mass-driver', 'unloader'];
  const cat = BLOCK_LIST.filter(b => b.category === 'distribution');
  const firstIdx = BLOCK_LIST.findIndex(b => b.category === 'distribution');
  const rest = BLOCK_LIST.filter(b => b.category !== 'distribution');
  cat.sort((a, c) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(c.name) + 1 || 99));
  BLOCK_LIST.length = 0;
  BLOCK_LIST.push(...rest.slice(0, firstIdx), ...cat, ...rest.slice(firstIdx));
}

Object.assign(DESCRIPTIONS, {
  'plastanium-conveyor': 'Moves items in stacks of 10, about 40 items/s. The first piece of a line loads (one item type per stack), the last piece unloads into everything around it.',
  'armored-conveyor': 'Fast, tough conveyor that only accepts items from other conveyors or from the block directly behind it, so it never pulls in items from the side.',
  'phase-conveyor': 'Powered bridge that sends items almost instantly up to 12 tiles away. Click it, then click another phase conveyor in a straight line.',
  'inverted-sorter': 'Like a sorter, but the selected item goes to the sides and everything else passes straight through.',
  'underflow-gate': 'Opposite of an overflow gate: sends items to the sides, and only forward when both sides are blocked.',
  'distributor': 'A 2x2 router: spreads items evenly to everything around it.',
  'mass-driver': 'Shoots batches of items to another mass driver up to 55 tiles away. Click it, then click the receiving mass driver. Needs power on both ends.',
});
