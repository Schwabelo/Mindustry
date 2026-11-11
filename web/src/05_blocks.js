// Buildings. Logic ported from core/src/mindustry/world/blocks/**.

let nextBuildId = 1;
let instantDepth = 0; // recursion guard for sorter / overflow chains

const OUTPUTS_ITEMS = new Set(['Conveyor', 'Junction', 'Router', 'Sorter', 'OverflowGate', 'ItemBridge', 'Drill', 'GenericCrafter', 'Unloader']);
const INSTANT = new Set(['Sorter', 'OverflowGate']);

class Building {
  constructor(block, team, tx, ty, rotation = 0) {
    this.block = block; this.team = team; this.tx = tx; this.ty = ty; this.rotation = rotation;
    this.x = tx * TS + block.offset; this.y = ty * TS + block.offset;
    this.maxHealth = block.health; this.health = block.health;
    this.items = block.hasItems ? new Int32Array(ITEMS.length) : null;
    this.total = 0;
    this.proximity = [];
    this.cdump = 0;
    this.timers = {};
    this.power = block.hasPower ? { graph: null, status: 0, links: [], satisfaction: 0 } : null;
    this.id = nextBuildId++;
    this.dead = false; this.hitTime = 0; this.warmup = 0; this.lastHit = -999;
    this.hitSize = block.size * TS;
  }

  get efficiency() {
    if (!this.block.consumesPower) return 1;
    return this.power ? this.power.satisfaction : 0;
  }

  timer(name, t) {
    const v = (this.timers[name] || 0) + Time.delta;
    if (v >= t) { this.timers[name] = 0; return true; }
    this.timers[name] = v; return false;
  }

  eachTile(cb) {
    const s = this.block.size, o = this.block.sizeOffset;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) cb(this.tx + o + dx, this.ty + o + dy);
  }

  // bounds in tiles
  get minX() { return this.tx + this.block.sizeOffset; }
  get minY() { return this.ty + this.block.sizeOffset; }
  get maxX() { return this.minX + this.block.size - 1; }
  get maxY() { return this.minY + this.block.size - 1; }

  // building adjacent in a direction (from the middle of the facing edge)
  nearby(dir) {
    const [dx, dy] = Geometry.d4[Mathf.mod(dir, 4)];
    const x = dx > 0 ? this.maxX + 1 : dx < 0 ? this.minX - 1 : this.tx;
    const y = dy > 0 ? this.maxY + 1 : dy < 0 ? this.minY - 1 : this.ty;
    return World.buildAt(x, y);
  }
  front() { return this.nearby(this.rotation); }

  // direction from this building to another (adjacent) one, -1 if same
  relativeTo(other) {
    if (!other || other === this) return -1;
    // tile on this building's edge closest to the other building
    const ox = Mathf.clamp(this.tx, other.minX, other.maxX), oy = Mathf.clamp(this.ty, other.minY, other.maxY);
    const fx = Mathf.clamp(ox, this.minX, this.maxX), fy = Mathf.clamp(oy, this.minY, this.maxY);
    const dx = ox - fx, dy = oy - fy;
    if (dx === 0 && dy === 0) return -1;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 0 : 2;
    return dy > 0 ? 1 : 3;
  }

  updateProximity() {
    const set = new Set();
    const s = this.block.size, minX = this.minX, minY = this.minY;
    for (let i = 0; i < s; i++) {
      for (const [x, y] of [[minX + s, minY + i], [minX + i, minY + s], [minX - 1, minY + i], [minX + i, minY - 1]]) {
        const b = World.buildAt(x, y);
        if (b && b !== this && b.team === this.team) set.add(b);
      }
    }
    this.proximity = [...set];
    this.onProximityUpdate();
  }
  onProximityUpdate() {}

  // ---- items
  has(item, n = 1) { return this.items && this.items[item.id] >= n; }
  addItem(item, n = 1) { this.items[item.id] += n; this.total += n; }
  removeItem(item, n = 1) { const r = Math.min(n, this.items[item.id]); this.items[item.id] -= r; this.total -= r; return r; }
  firstItem() { if (!this.items) return null; for (let i = 0; i < ITEMS.length; i++) if (this.items[i] > 0) return ITEMS[i]; return null; }
  acceptItem(source, item) { return false; }
  handleItem(source, item) { this.addItem(item); }
  canDump(to, item) { return true; }

  dump(todump = null) {
    if (!this.items || this.total === 0 || !this.proximity.length || (todump && !this.has(todump))) return false;
    const n = this.proximity.length;
    const start = this.cdump % n;
    for (let i = 0; i < n; i++) {
      const other = this.proximity[(i + start) % n];
      if (todump === null) {
        for (let ii = 0; ii < ITEMS.length; ii++) {
          if (!this.items[ii]) continue;
          const item = ITEMS[ii];
          if (other.acceptItem(this, item) && this.canDump(other, item)) {
            other.handleItem(this, item); this.removeItem(item); this.cdump = (this.cdump + 1) % n; return true;
          }
        }
      } else if (other.acceptItem(this, todump) && this.canDump(other, todump)) {
        other.handleItem(this, todump); this.removeItem(todump); this.cdump = (this.cdump + 1) % n; return true;
      }
      this.cdump = (this.cdump + 1) % n;
    }
    return false;
  }

  offload(item) {
    const n = this.proximity.length;
    for (let i = 0; i < n; i++) {
      this.cdump = (this.cdump + 1) % n;
      const other = this.proximity[this.cdump];
      if (other.acceptItem(this, item) && this.canDump(other, item)) { other.handleItem(this, item); return; }
    }
    this.handleItem(this, item);
  }

  // ---- life
  update() {}
  damage(amount, attacker) {
    if (this.dead) return;
    this.health -= amount;
    this.hitTime = 1;
    this.lastHit = Time.time;
    if (this.team === 'sharded') Game.notifyDamage(this);
    if (this.health <= 0) Game.destroyBuilding(this);
  }
  heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }
  get healthf() { return this.health / this.maxHealth; }

  configure(value) {}
  onRemoved() {}
  shouldConsume() { return true; }

  // ---- drawing
  draw() { Draw.rect(this.block.region, this.x, this.y); }
  drawUnder() {}
  drawTop() {}
  drawSelect() {}
  info() { return []; }
}

// ================================================================ distribution
const ITEM_SPACE = 0.4, CONVEYOR_CAP = 3;

class Conveyor extends Building {
  constructor(...a) {
    super(...a);
    this.ids = []; this.xs = []; this.ys = []; this.len = 0;
    this.minitem = 1; this.mid = 0; this.clogHeat = 0; this.lastInserted = 0;
    this.blendbits = 0; this.blendsclx = 1; this.blendscly = 1;
    this.next = null; this.nextc = null; this.aligned = false;
  }
  blendsWith(other) {
    if (!other || other.team !== this.team || other.dead) return false;
    if (other.block.rotate) return other.front() === this;
    return OUTPUTS_ITEMS.has(other.block.cls);
  }
  onProximityUpdate() {
    this.next = this.front();
    this.nextc = this.next instanceof Conveyor && this.next.team === this.team ? this.next : null;
    this.aligned = !!(this.nextc && this.rotation === this.next.rotation);
    const b = i => this.blendsWith(this.nearby(this.rotation - i));
    const b1 = b(1), b2 = b(2), b3 = b(3);
    const num = (b2 && b1 && b3) ? 0 : (b1 && b3) ? 1 : (b1 && b2) ? 2 : (b3 && b2) ? 3 : b1 ? 4 : b3 ? 5 : -1;
    this.blendbits = 0; this.blendsclx = 1; this.blendscly = 1;
    switch (num) {
      case 0: this.blendbits = 3; break;
      case 1: this.blendbits = 4; break;
      case 2: this.blendbits = 2; break;
      case 3: this.blendbits = 2; this.blendscly = -1; break;
      case 4: this.blendbits = 1; this.blendscly = -1; break;
      case 5: this.blendbits = 1; break;
    }
  }
  add(o) {
    this.ids.splice(o, 0, null); this.xs.splice(o, 0, 0); this.ys.splice(o, 0, 0); this.len++;
  }
  remove(o) {
    this.ids.splice(o, 1); this.xs.splice(o, 1); this.ys.splice(o, 1); this.len--;
  }
  acceptItem(source, item) {
    if (this.len >= CONVEYOR_CAP) return false;
    const rel = source.relativeTo(this);
    if (rel < 0) return false;
    const direction = Math.abs(rel - this.rotation);
    return (((direction === 0) && this.minitem >= ITEM_SPACE) || ((direction % 2 === 1) && this.minitem > 0.7)) &&
      !(source.block.rotate && this.next === source);
  }
  handleItem(source, item) {
    if (this.len >= CONVEYOR_CAP) return;
    const r = this.rotation;
    const rel = source.relativeTo(this);
    const ang = rel - r;
    const x = (ang === -1 || ang === 3) ? 1 : (ang === 1 || ang === -3) ? -1 : 0;
    this.addItem(item);
    if (Math.abs(rel - r) === 0) {
      this.add(0); this.xs[0] = x; this.ys[0] = 0; this.ids[0] = item; this.lastInserted = 0;
    } else {
      const m = Math.min(this.mid, this.len);
      this.add(m); this.xs[m] = x; this.ys[m] = 0.5; this.ids[m] = item; this.lastInserted = m;
    }
  }
  pass(item) {
    const n = this.next;
    if (item && n && n.team === this.team && !n.dead && n.acceptItem(this, item)) { n.handleItem(this, item); return true; }
    return false;
  }
  update() {
    this.minitem = 1; this.mid = 0;
    if (this.len === 0) { this.clogHeat = 0; return; }
    const nextMax = this.aligned ? 1 - Math.max(ITEM_SPACE - this.nextc.minitem, 0) : 1;
    const moved = this.block.speed * Time.delta;
    for (let i = this.len - 1; i >= 0; i--) {
      const nextpos = (i === this.len - 1 ? 100 : this.ys[i + 1]) - ITEM_SPACE;
      const maxmove = Mathf.clamp(nextpos - this.ys[i], 0, moved);
      this.ys[i] += maxmove;
      if (this.ys[i] > nextMax) this.ys[i] = nextMax;
      if (this.ys[i] > 0.5 && i > 0) this.mid = i - 1;
      this.xs[i] = Mathf.approach(this.xs[i], 0, moved * 2);
      if (this.ys[i] >= 1 && this.pass(this.ids[i])) {
        if (this.aligned && this.nextc.len > this.nextc.lastInserted) this.nextc.xs[this.nextc.lastInserted] = this.xs[i];
        this.removeItem(this.ids[i]);
        this.remove(i);
      } else if (this.ys[i] < this.minitem) {
        this.minitem = this.ys[i];
      }
    }
    if (this.minitem < ITEM_SPACE + (this.blendbits === 1 ? 0.3 : 0)) this.clogHeat = Mathf.approach(this.clogHeat, 1, Time.delta / 60);
    else this.clogHeat = 0;
  }
  drawUnder() {
    const frame = this.clogHeat <= 0.5 ? Math.floor((Time.time * this.block.speed * 8) % 4) : 0;
    Draw.rect(`${this.block.name}-${this.blendbits}-${frame}`, this.x, this.y, TS * this.blendsclx, TS * this.blendscly, this.rotation * 90);
  }
  draw() {}
  drawItems() {
    const ang = this.rotation * 90;
    const c = Math.cos(ang * DEG), s = Math.sin(ang * DEG);
    for (let i = 0; i < this.len; i++) {
      const ys = this.ys[i], xs = this.xs[i];
      // v1 = trns(rot, 8) * ys ; v2 = rotate((-4, xs*4), rot)
      const px = this.x + c * TS * ys + (c * -4 - s * xs * 4);
      const py = this.y + s * TS * ys + (s * -4 + c * xs * 4);
      Draw.rect(this.ids[i].icon, px, py, 5, 5);
    }
  }
  info() { return []; }
}

class Junction extends Building {
  constructor(...a) { super(...a); this.buffers = [[], [], [], []]; }
  acceptItem(source, item) {
    const rel = source.relativeTo(this);
    if (rel === -1 || this.buffers[rel].length >= this.block.capacity) return false;
    const to = this.nearby(rel);
    return !!(to && to.team === this.team);
  }
  handleItem(source, item) {
    const rel = source.relativeTo(this);
    this.buffers[rel].push({ item, time: Time.time });
  }
  update() {
    for (let i = 0; i < 4; i++) {
      const buf = this.buffers[i];
      if (!buf.length) continue;
      const e = buf[0];
      if (Time.time < e.time + this.block.speed) continue;
      const dest = this.nearby(i);
      if (!dest || dest.team !== this.team || !dest.acceptItem(this, e.item)) continue;
      dest.handleItem(this, e.item);
      buf.shift();
    }
  }
}

class Router extends Building {
  constructor(...a) { super(...a); this.lastItem = null; this.time = 0; this.lastInput = null; this.rot = 0; }
  acceptItem(source, item) { return source.team === this.team && this.lastItem === null && this.total === 0; }
  handleItem(source, item) { this.addItem(item); this.lastItem = item; this.time = 0; this.lastInput = source; }
  getTarget(item, from, set) {
    const n = this.proximity.length;
    const counter = this.rot;
    for (let i = 0; i < n; i++) {
      const other = this.proximity[(i + counter) % n];
      if (set) this.rot = (this.rot + 1) % n;
      if (other === from && from && from.block.cls === 'OverflowGate') continue;
      if (other.acceptItem(this, item)) return other;
    }
    return null;
  }
  update() {
    if (this.lastItem === null && this.total > 0) this.lastItem = this.firstItem();
    if (this.lastItem) {
      this.time += 1 / this.block.speed * Time.delta;
      const target = this.getTarget(this.lastItem, this.lastInput, false);
      if (target && this.time >= 1) {
        this.getTarget(this.lastItem, this.lastInput, true);
        target.handleItem(this, this.lastItem);
        this.removeItem(this.lastItem);
        this.lastItem = null;
      }
    }
  }
}

class Sorter extends Building {
  constructor(...a) { super(...a); this.sortItem = null; this.flip = 0; }
  configure(item) { this.sortItem = item; }
  acceptItem(source, item) {
    const to = this.getTarget(item, source, false);
    return !!(to && to.team === this.team);
  }
  handleItem(source, item) {
    const to = this.getTarget(item, source, true);
    if (to) to.handleItem(this, item);
  }
  getTarget(item, source, flip) {
    const dir = source.relativeTo(this);
    if (dir === -1) return null;
    if (instantDepth > 6) return null;
    instantDepth++;
    try {
      let to;
      if (item === this.sortItem) {
        to = this.nearby(dir);
        if (!to || to.team !== this.team || (INSTANT.has(to.block.cls) && INSTANT.has(source.block.cls)) || !to.acceptItem(this, item)) return null;
      } else {
        const a = this.nearby(dir - 1), b = this.nearby(dir + 1);
        const ac = a && a.team === this.team && !(INSTANT.has(a.block.cls) && INSTANT.has(source.block.cls)) && a.acceptItem(this, item);
        const bc = b && b.team === this.team && !(INSTANT.has(b.block.cls) && INSTANT.has(source.block.cls)) && b.acceptItem(this, item);
        if (ac && !bc) to = a;
        else if (bc && !ac) to = b;
        else if (!bc) return null;
        else {
          to = (this.flip & (1 << dir)) === 0 ? a : b;
          if (flip) this.flip ^= (1 << dir);
        }
      }
      return to;
    } finally { instantDepth--; }
  }
  draw() {
    if (this.sortItem) { Fill.set(this.sortItem.color.css); Fill.square(this.x, this.y, TS / 2 - 0.01); }
    Draw.rect('sorter', this.x, this.y);
  }
}

class OverflowGate extends Building {
  constructor(...a) { super(...a); this.flip = 0; }
  acceptItem(source, item) {
    const to = this.getTarget(item, source, false);
    return !!(to && to.team === this.team);
  }
  handleItem(source, item) {
    const to = this.getTarget(item, source, true);
    if (to) to.handleItem(this, item);
  }
  getTarget(item, src, flip) {
    const from = src.relativeTo(this);
    if (from === -1 || instantDepth > 6) return null;
    instantDepth++;
    try {
      let to = this.nearby(from);
      const canForward = to && to.team === this.team && !(INSTANT.has(to.block.cls) && INSTANT.has(src.block.cls)) && to.acceptItem(this, item);
      if (!canForward) {
        const a = this.nearby(from - 1), b = this.nearby(from + 1);
        const ac = a && a.team === this.team && !(INSTANT.has(a.block.cls) && INSTANT.has(src.block.cls)) && a.acceptItem(this, item);
        const bc = b && b.team === this.team && !(INSTANT.has(b.block.cls) && INSTANT.has(src.block.cls)) && b.acceptItem(this, item);
        if (!ac && !bc) return null;
        if (ac && !bc) to = a;
        else if (bc && !ac) to = b;
        else {
          to = (this.flip & (1 << from)) === 0 ? a : b;
          if (flip) this.flip ^= (1 << from);
        }
      }
      return to;
    } finally { instantDepth--; }
  }
}

class ItemBridge extends Building {
  constructor(...a) { super(...a); this.link = null; this.buffer = []; this.incoming = new Set(); this.transportTime = 0; }
  linkValid(other) {
    if (!other || other.dead || other === this || other.block !== this.block || other.team !== this.team) return false;
    if (other.tx !== this.tx && other.ty !== this.ty) return false;
    if (Math.abs(other.tx - this.tx) + Math.abs(other.ty - this.ty) > this.block.range) return false;
    return other.link !== this;
  }
  configure(other) {
    if (this.link === other) { this.link = null; other.incoming.delete(this); return; }
    if (!this.linkValid(other)) return;
    if (this.link) this.link.incoming.delete(this);
    this.link = other; other.incoming.add(this);
  }
  onRemoved() {
    if (this.link) this.link.incoming.delete(this);
    for (const inc of this.incoming) if (inc.link === this) inc.link = null;
  }
  linked(source) { return this.incoming.has(source); }
  acceptItem(source, item) {
    if (source.team !== this.team || this.total >= this.block.itemCapacity) return false;
    if (this.linked(source)) return true;
    if (!this.linkValid(this.link)) return false;
    const rel = this.relativeTo(this.link), rel2 = this.relativeTo(source);
    return rel !== rel2;
  }
  canDump(to, item) {
    const rel = this.relativeTo(to);
    for (const inc of this.incoming) if (this.relativeTo(inc) === rel) return false;
    // don't dump into another bridge that feeds us
    return !(to instanceof ItemBridge && to.link === this);
  }
  update() {
    if (this.link && !this.linkValid(this.link)) { this.link.incoming && this.link.incoming.delete(this); this.link = null; }
    if (this.linkValid(this.link)) {
      if (this.total > 0 && this.buffer.length < this.block.bufferCapacity && this.timer('buf', 3)) {
        const it = this.firstItem();
        this.removeItem(it);
        this.buffer.push({ item: it, time: Time.time });
      }
      if (this.buffer.length && Time.time >= this.buffer[0].time + this.block.speed * 0.35) {
        const it = this.buffer[0].item;
        if (this.link.acceptItem(this, it)) { this.link.handleItem(this, it); this.buffer.shift(); }
      }
      this.transportTime += Time.delta;
    } else {
      if (this.buffer.length) { // flush buffer back into inventory
        for (const e of this.buffer) this.addItem(e.item);
        this.buffer = [];
      }
      if (this.timer('dump', 4)) this.dump();
    }
  }
  drawBridge() {
    if (!this.linkValid(this.link)) return;
    const o = this.link;
    const ang = Angles.angle(this.x, this.y, o.x, o.y);
    Draw.setAlpha(0.85);
    Draw.lineRegion('bridge-conveyor-bridge', this.x, this.y, o.x, o.y, TS);
    Draw.rect('bridge-conveyor-end', this.x, this.y, TS, TS, ang);
    Draw.rect('bridge-conveyor-end', o.x, o.y, TS, TS, ang + 180);
    const dist = Math.hypot(o.x - this.x, o.y - this.y);
    const arrows = Math.max(1, Math.round(dist / 6) - 1);
    for (let a = 0; a < arrows; a++) {
      const f = (a + 1) / (arrows + 1);
      Draw.setAlpha(Mathf.absin(a / arrows - Time.time / 100, 0.1, 1) * 0.85);
      Draw.rect('bridge-conveyor-arrow', Mathf.lerp(this.x, o.x, f), Mathf.lerp(this.y, o.y, f), TS, TS, ang);
    }
    Draw.setAlpha(1);
  }
}

class Unloader extends Building {
  constructor(...a) { super(...a); this.sortItem = null; this.rot = 0; this.itemRot = 0; }
  configure(item) { this.sortItem = item; }
  acceptItem() { return false; }
  update() {
    if (!this.timer('unload', this.block.speed)) return;
    const sources = this.proximity.filter(b => b.block.storage && b.items);
    const targets = this.proximity.filter(b => !b.block.storage);
    if (!sources.length || !targets.length) return;
    const tryItem = item => {
      const from = sources.find(s => s.has(item));
      if (!from) return false;
      const n = targets.length;
      for (let i = 0; i < n; i++) {
        const to = targets[(i + this.rot) % n];
        if (to.acceptItem(this, item)) {
          from.removeItem(item); to.handleItem(this, item);
          this.rot = (this.rot + i + 1) % n;
          return true;
        }
      }
      return false;
    };
    if (this.sortItem) { tryItem(this.sortItem); return; }
    for (let k = 0; k < ITEMS.length; k++) {
      const item = ITEMS[(k + this.itemRot) % ITEMS.length];
      if (tryItem(item)) { this.itemRot = (this.itemRot + k + 1) % ITEMS.length; return; }
    }
  }
  draw() {
    Draw.rect('unloader', this.x, this.y);
    if (this.sortItem) Draw.rect(Assets.tinted('unloader-center', this.sortItem.color), this.x, this.y);
  }
}

// ================================================================ production
class Drill extends Building {
  constructor(...a) {
    super(...a);
    this.progress = 0; this.timeDrilled = 0; this.dominantItem = null; this.dominantItems = 0;
    this.countOre();
  }
  countOre() {
    const counts = new Map();
    this.eachTile((x, y) => {
      const it = World.drop(x, y);
      if (it && it.hardness <= this.block.tier) counts.set(it, (counts.get(it) || 0) + 1);
    });
    let best = null, bc = 0;
    for (const [it, c] of counts) if (c > bc || (c === bc && best && it.id > best.id)) { best = it; bc = c; }
    this.dominantItem = best; this.dominantItems = bc;
  }
  getDrillTime(item) { return this.block.drillTime + 50 * item.hardness; }
  update() {
    if (this.timer('dump', 5)) this.dump(this.dominantItem && this.has(this.dominantItem) ? this.dominantItem : null);
    this.timeDrilled += this.warmup * Time.delta;
    if (!this.dominantItem) return;
    const delay = this.getDrillTime(this.dominantItem);
    if (this.total < this.block.itemCapacity && this.dominantItems > 0) {
      this.warmup = Mathf.approach(this.warmup, 1, 0.015 * Time.delta);
      this.progress += Time.delta * this.dominantItems * this.warmup;
      if (Math.random() < 0.02 * this.warmup * Time.delta) Fx.create('drillDust', this.x + Mathf.range(this.block.size * 3), this.y + Mathf.range(this.block.size * 3), 0, this.dominantItem.color);
    } else {
      this.warmup = Mathf.approach(this.warmup, 0, 0.015 * Time.delta);
      return;
    }
    if (this.progress >= delay && this.total < this.block.itemCapacity) {
      this.offload(this.dominantItem);
      this.progress %= delay;
      Fx.create('drillDust', this.x + Mathf.range(this.block.size * 2), this.y + Mathf.range(this.block.size * 2), 0, this.dominantItem.color);
    }
  }
  draw() {
    const n = this.block.name;
    Draw.rect(n, this.x, this.y);
    Draw.rect(n + '-rotator', this.x, this.y, undefined, undefined, this.timeDrilled * 2);
    Draw.rect(n + '-top', this.x, this.y);
    if (this.dominantItem) Draw.rect(Assets.tinted('drill-item-2', this.dominantItem.color), this.x, this.y);
  }
  info() {
    if (!this.dominantItem) return ['No ore'];
    const rate = 60 / this.getDrillTime(this.dominantItem) * this.dominantItems;
    return [`${this.dominantItem.name}: ${rate.toFixed(2)}/s`];
  }
}

class GenericCrafter extends Building {
  constructor(...a) { super(...a); this.progress = 0; this.totalProgress = 0; }
  acceptItem(source, item) {
    return this.block.consumeItems.some(c => c.item === item) && this.items[item.id] < this.block.itemCapacity;
  }
  canConsume() { return this.block.consumeItems.every(c => this.has(c.item, c.amount)); }
  shouldConsume() { const o = this.block.outputItem; return this.items[o.item.id] + o.amount <= this.block.itemCapacity && this.canConsume(); }
  update() {
    const eff = this.shouldConsume() ? this.efficiency : 0;
    if (eff > 0) {
      this.progress += Time.delta * eff / this.block.craftTime;
      this.warmup = Mathf.approach(this.warmup, 1, 0.019 * Time.delta);
      if (this.block.flame && Math.random() < 0.05 * Time.delta) Fx.create('smokeSmall', this.x + Mathf.range(3), this.y + Mathf.range(3));
    } else {
      this.warmup = Mathf.approach(this.warmup, 0, 0.019 * Time.delta);
    }
    this.totalProgress += this.warmup * Time.delta;
    if (this.progress >= 1) {
      for (const c of this.block.consumeItems) this.removeItem(c.item, c.amount);
      this.addItem(this.block.outputItem.item, this.block.outputItem.amount);
      Fx.create(this.block.craftEffect || 'pulverizeMedium', this.x, this.y, 0, this.block.outputItem.item.color);
      this.progress %= 1;
    }
    if (this.timer('dump', 5)) this.dump(this.block.outputItem.item);
  }
  draw() {
    const b = this.block;
    Draw.rect(b.name, this.x, this.y);
    if (b.rotator) {
      Draw.rect(b.name + '-rotator', this.x, this.y, undefined, undefined, this.totalProgress * 2);
      Draw.rect(b.name + '-top', this.x, this.y);
    }
    if (b.flame && this.warmup > 0) {
      Draw.setAlpha(this.warmup);
      Draw.rect(b.name + '-top', this.x, this.y);
      const g = 0.3, r = 0.06;
      Draw.setAlpha(Mathf.clamp(((1 - g) + Mathf.absin(Time.time, 8, g) + Mathf.random(r) - r) * this.warmup));
      Fill.set(b.flame.css); Fill.circle(this.x, this.y, 3 + Mathf.absin(Time.time, 5, 2) + Mathf.random(0.1));
      Draw.setAlpha(this.warmup);
      Fill.set('#fff'); Fill.circle(this.x, this.y, 1.9 + Mathf.absin(Time.time, 5, 1) + Mathf.random(0.1));
      Draw.setAlpha(1);
    }
  }
  info() {
    const b = this.block;
    return [`${b.consumeItems.map(c => c.amount + ' ' + c.item.name).join(' + ')} → ${b.outputItem.amount} ${b.outputItem.item.name}`,
      `${(60 / b.craftTime * b.outputItem.amount).toFixed(2)}/s at full speed`];
  }
}

// ================================================================ power
class PowerBuilding extends Building {
  drawLasers() {}
}

class ConsumeGenerator extends PowerBuilding {
  constructor(...a) { super(...a); this.generateTime = 0; this.productionEfficiency = 0; this.curFlam = 0; }
  acceptItem(source, item) { return item.flammability >= 0.2 && this.total < this.block.itemCapacity; }
  update() {
    if (this.generateTime <= 0 && this.total > 0) {
      const it = ITEMS.find(i => this.items[i.id] > 0 && i.flammability >= 0.2);
      if (it) {
        this.removeItem(it); this.curFlam = it.flammability; this.generateTime = 1;
        Fx.create('generatespark', this.x + Mathf.range(3), this.y + Mathf.range(3));
      }
    }
    if (this.generateTime > 0) {
      this.productionEfficiency = this.curFlam;
      this.generateTime -= Time.delta / this.block.itemDuration;
    } else this.productionEfficiency = 0;
    this.warmup = Mathf.approach(this.warmup, this.productionEfficiency > 0 ? 1 : 0, 0.05 * Time.delta);
  }
  get powerOut() { return this.block.powerProduction * this.productionEfficiency; }
  draw() {
    Draw.rect('combustion-generator', this.x, this.y);
    if (this.warmup > 0.01) {
      Draw.setAlpha(this.warmup * 0.4 + Mathf.absin(Time.time, 8, 0.6) * this.warmup);
      Draw.rect(Assets.tinted('combustion-generator-top', col('ff9b59')), this.x, this.y);
      Draw.setAlpha(1);
    }
  }
  info() { return [`+${(this.powerOut * 60).toFixed(0)} power/s`]; }
}

class SolarGenerator extends PowerBuilding {
  get powerOut() { return this.block.powerProduction; }
  info() { return [`+${(this.powerOut * 60).toFixed(1)} power/s`]; }
}

class Battery extends PowerBuilding {
  constructor(...a) { super(...a); this.power.stored = 0; }
  draw() {
    Draw.rect('battery', this.x, this.y);
    const c = lerpCol(col('f8c266'), col('fb9567'), this.power.stored / this.block.capacity);
    Fill.set(this.power.stored > 1 ? c.css : '#3a3a3a');
    Fill.square(this.x, this.y, TS / 2 - 1);
    Draw.rect('battery-top', this.x, this.y);
  }
  info() { return [`Stored: ${Math.round(this.power.stored)} / ${this.block.capacity}`]; }
}

class PowerNode extends PowerBuilding {
  configure(other) { Power.toggleLink(this, other); }
  onRemoved() {}
  info() { return [`Links: ${this.power.links.length} / ${this.block.maxNodes}`]; }
}

// ================================================================ defense
class Wall extends Building {}

class MendProjector extends Building {
  constructor(...a) { super(...a); this.charge = Math.random() * 50; this.heat = 0; this.phaseHeat = 0; this.useTime = 0; }
  acceptItem(source, item) { return item === Items.silicon && this.items[item.id] < this.block.itemCapacity; }
  update() {
    const eff = this.efficiency;
    this.heat = Mathf.approach(this.heat, eff > 0 ? 1 : 0, 0.08 * Time.delta);
    this.charge += this.heat * Time.delta;
    this.phaseHeat = Mathf.approach(this.phaseHeat, this.has(Items.silicon) ? 1 : 0, 0.1 * Time.delta);
    if (this.has(Items.silicon) && eff > 0) {
      this.useTime += Time.delta;
      if (this.useTime >= 400) { this.useTime = 0; this.removeItem(Items.silicon); }
    }
    if (this.charge >= this.block.reload) {
      this.charge = 0;
      const range = this.block.range + this.phaseHeat * this.block.phaseRangeBoost;
      const pct = (this.block.healPercent + this.phaseHeat * this.block.phaseBoost) / 100 * eff;
      let healed = false;
      for (const b of Game.teamBuildings(this.team)) {
        if (b.health < b.maxHealth && circleRect(this.x, this.y, range, b)) {
          b.heal(b.maxHealth * pct);
          Fx.create('healBlockFull', b.x, b.y, b.block.size, Pal.heal);
          healed = true;
        }
      }
      if (healed) Audio2.play('blockHeal', this.x, this.y, 0.4);
    }
  }
  shouldConsume() { return true; }
  draw() {
    Draw.rect('mender', this.x, this.y);
    Draw.setAlpha(this.heat * Mathf.absin(Time.time, 50 / (Math.PI * 2), 1) * 0.5);
    Draw.rect('mender-top', this.x, this.y);
    Draw.setAlpha(1);
  }
  drawSelect() {
    const r = this.block.range + this.phaseHeat * this.block.phaseRangeBoost;
    Lines.set(rgba(Pal.heal, 0.8), 1); Lines.dashCircle(this.x, this.y, r, Time.time / 60);
  }
}

// ================================================================ turrets
class Turret extends Building {
  constructor(...a) {
    super(...a);
    this.turretRotation = 90; this.reloadCounter = 0; this.heat = 0; this.curRecoil = 0; this.recoils = [0, 0];
    this.target = null; this.totalShots = 0; this.charging = false; this.queued = [];
  }
  get range() { return this.block.range + (this.peekAmmo() ? this.peekAmmo().rangeChange : 0); }
  hasAmmo() { return true; }
  peekAmmo() { return null; }
  useAmmo() { return this.peekAmmo(); }
  findTarget() {
    const b = this.block;
    const range = this.range;
    let best = null, bd = Infinity;
    for (const u of Game.units) {
      if (u.team === this.team || u.dead) continue;
      if (u.isFlying ? !b.targetAir : !b.targetGround) continue;
      const d = Math.hypot(u.x - this.x, u.y - this.y) - u.type.hitSize / 2;
      if (d <= range && d < bd) { best = u; bd = d; }
    }
    if (!best && b.targetGround) {
      for (const o of Game.buildings) {
        if (o.team === this.team || o.dead) continue;
        const d = Math.hypot(o.x - this.x, o.y - this.y) - o.hitSize / 2;
        if (d <= range && d < bd) { best = o; bd = d; }
      }
    }
    this.target = best;
  }
  validTarget(t) {
    if (!t || t.dead) return false;
    const hs = t.type ? t.type.hitSize / 2 : t.hitSize / 2;
    return Math.hypot(t.x - this.x, t.y - this.y) - hs <= this.range + 4;
  }
  update() {
    const b = this.block;
    const recoilTime = b.reload;
    this.curRecoil = Mathf.approach(this.curRecoil, 0, Time.delta / recoilTime);
    for (let i = 0; i < 2; i++) this.recoils[i] = Mathf.approach(this.recoils[i], 0, Time.delta / recoilTime);
    this.heat = Mathf.approach(this.heat, 0, Time.delta / 20);
    // queued (delayed) shots
    for (let i = this.queued.length - 1; i >= 0; i--) {
      const q = this.queued[i];
      q.delay -= Time.delta;
      if (q.delay <= 0) { this.queued.splice(i, 1); q.run(); }
    }
    if (!this.hasAmmo()) { this.target = null; return; }
    if (this.timer('target', 20)) this.findTarget();
    if (!this.validTarget(this.target)) this.target = null;
    const eff = this.efficiency;
    if (this.target) {
      const ammo = this.peekAmmo();
      const [px, py] = predict(this.x, this.y, this.target, ammo && ammo.type !== 'laser' && ammo.type !== 'lightning' ? ammo.speed : 0);
      this.aimX = px; this.aimY = py;
      const targetRot = Angles.angle(this.x, this.y, px, py);
      if (!this.charging) this.turretRotation = Angles.moveToward(this.turretRotation, targetRot, b.rotateSpeed * Time.delta * Math.max(eff, 0.2));
      if (Angles.within(this.turretRotation, targetRot, b.shootCone) && this.reloadCounter >= b.reload && !this.charging) {
        this.shoot(this.useAmmo());
        this.reloadCounter %= b.reload;
      }
    }
    if (this.reloadCounter < b.reload) {
      const ammo = this.peekAmmo();
      this.reloadCounter += Time.delta * (ammo ? ammo.reloadMultiplier : 1) * eff;
    }
  }
  bulletPos(xOffset) {
    const b = this.block;
    const r = this.turretRotation;
    return [this.x + Angles.trnsx(r - 90, xOffset, b.shootY || (b.size * TS / 2 - 1)), this.y + Angles.trnsy(r - 90, xOffset, b.shootY || (b.size * TS / 2 - 1))];
  }
  shoot(type) {
    const b = this.block;
    const shots = b.shots || 1;
    const fire = (i) => {
      if (this.dead) return;
      let xOff = 0;
      if (b.alternateSpread) {
        const idx = ((this.totalShots) % 2) - 0.5;
        xOff = idx * b.alternateSpread * -1;
        this.recoils[this.totalShots % 2] = 1;
      }
      const [bx, by] = this.bulletPos(xOff);
      const ang = this.turretRotation + Mathf.range(b.inaccuracy + (type.inaccuracy || 0));
      let lifeScl = 1;
      if (type.scaleLife && this.aimX !== undefined) {
        const tr = type.speed * type.lifetime;
        lifeScl = Mathf.clamp(Math.hypot(this.aimX - bx, this.aimY - by) / tr, (b.minRange || 0) / tr, this.range / tr);
      }
      Bullets.create(type, this, this.team, bx, by, ang, 1, lifeScl, this.aimX, this.aimY);
      Fx.create(type.shootEffect || 'shootSmall', bx, by, ang, type.hitColor || type.backColor);
      if (type.smokeEffect) Fx.create(type.smokeEffect, bx, by, ang, type.hitColor || type.backColor);
      Audio2.play(b.shootSound, bx, by, 0.6);
      if (b.shake) Render.shake(b.shake, b.shake);
      this.curRecoil = 1; this.heat = 1;
      this.totalShots++;
      if (b.cls === 'ItemTurret') Fx.create('casing1', this.x, this.y, this.turretRotation);
    };
    for (let i = 0; i < shots; i++) {
      if (i === 0 || !b.shotDelay) fire(i);
      else this.queued.push({ delay: b.shotDelay * i, run: () => fire(i) });
    }
  }
  drawTurretBody() {
    const b = this.block;
    const r = this.turretRotation;
    const rx = this.x + Angles.trnsx(r, -this.curRecoil * b.recoil), ry = this.y + Angles.trnsy(r, -this.curRecoil * b.recoil);
    Draw.rect('block-' + b.size, this.x, this.y);
    if (b.name === 'duo') {
      for (let i = 0; i < 2; i++) {
        const my = -1.5 * this.recoils[i];
        Draw.rect('duo-barrel-' + (i === 0 ? 'l' : 'r'), rx + Angles.trnsx(r - 90, 0, my), ry + Angles.trnsy(r - 90, 0, my), undefined, undefined, r - 90);
      }
    }
    Draw.rect(b.name, rx, ry, undefined, undefined, r - 90);
    if (b.partMid) {
      const my = -1.25 * this.curRecoil;
      Draw.rect('scatter-mid', rx + Angles.trnsx(r - 90, 0, my), ry + Angles.trnsy(r - 90, 0, my), undefined, undefined, r - 90);
    }
    if (b.heatRegion && this.heat > 0.01) {
      Draw.additive(true);
      Draw.setAlpha(this.heat);
      Draw.rect(Assets.tinted(b.heatRegion, col('ff3b1c')), rx, ry, undefined, undefined, r - 90);
      Draw.setAlpha(1);
      Draw.additive(false);
    }
  }
  draw() { this.drawTurretBody(); }
  drawSelect() {
    Lines.set(rgba(Teams[this.team].color, 0.9), 1);
    Lines.dashCircle(this.x, this.y, this.range, Time.time / 80);
  }
}

class ItemTurret extends Turret {
  constructor(...a) { super(...a); this.ammo = []; this.totalAmmo = 0; }
  get maxAmmo() { return 30; }
  acceptItem(source, item) {
    const t = this.block.ammo[item.name];
    return !!t && this.totalAmmo + t.ammoMultiplier <= this.maxAmmo;
  }
  handleItem(source, item) {
    const t = this.block.ammo[item.name];
    if (!t) return;
    this.totalAmmo += t.ammoMultiplier;
    const i = this.ammo.findIndex(e => e.item === item);
    if (i >= 0) {
      this.ammo[i].amount += t.ammoMultiplier;
      const e = this.ammo.splice(i, 1)[0]; this.ammo.push(e);
    } else this.ammo.push({ item, amount: t.ammoMultiplier });
  }
  hasAmmo() { return this.ammo.length > 0 && this.ammo[this.ammo.length - 1].amount >= 1; }
  peekAmmo() { return this.ammo.length ? this.block.ammo[this.ammo[this.ammo.length - 1].item.name] : null; }
  useAmmo() {
    const e = this.ammo[this.ammo.length - 1];
    const t = this.block.ammo[e.item.name];
    e.amount -= 1; this.totalAmmo -= 1;
    if (e.amount <= 0) this.ammo.pop();
    return t;
  }
  info() {
    const lines = [`Ammo: ${this.totalAmmo} / ${this.maxAmmo}`];
    if (this.ammo.length) lines.push('Using ' + this.ammo[this.ammo.length - 1].item.name);
    return lines;
  }
}

class PowerTurret extends Turret {
  peekAmmo() { return this.block.shootType; }
  hasAmmo() { return true; }
  shouldConsume() { return !!this.target || this.reloadCounter < this.block.reload || this.charging; }
  shoot(type) {
    const b = this.block;
    if (b.chargeTime) {
      this.charging = true;
      Audio2.play(b.chargeSound, this.x, this.y, 0.6);
      const [bx, by] = this.bulletPos(0);
      Fx.create('lancerCharge', bx, by, this.turretRotation, Pal.lancerLaser, this);
      this.queued.push({
        delay: b.chargeTime, run: () => {
          this.charging = false;
          if (this.dead) return;
          const [cx, cy] = this.bulletPos(0);
          Bullets.create(type, this, this.team, cx, cy, this.turretRotation, 1, 1);
          Audio2.play(b.shootSound, cx, cy, 0.7);
          this.curRecoil = 1; this.heat = 1;
          if (b.shake) Render.shake(b.shake, b.shake * 2);
        },
      });
    } else super.shoot(type);
  }
  info() { return [`Power use: ${(this.block.consumesPower * 60).toFixed(0)}/s`, `Power: ${Math.round(this.efficiency * 100)}%`]; }
}

// ================================================================ units
class UnitFactory extends Building {
  constructor(...a) { super(...a); this.currentPlan = 0; this.progress = 0; this.speedScl = 0; }
  get plan() { return this.currentPlan >= 0 ? this.block.plans[this.currentPlan] : null; }
  configure(idx) {
    if (this.currentPlan === idx) return;
    this.currentPlan = idx; this.progress = 0;
  }
  acceptItem(source, item) {
    const p = this.plan;
    if (!p) return false;
    const r = p.requirements.find(r => r.item === item);
    return !!r && this.items[item.id] < r.amount * 2;
  }
  canBuild() {
    const p = this.plan;
    return p && p.requirements.every(r => this.has(r.item, r.amount));
  }
  update() {
    const p = this.plan;
    if (!p) return;
    const capped = Game.unitCount(this.team, p.unit) >= Game.unitCap(this.team);
    if (this.canBuild() && !capped) {
      const eff = this.efficiency;
      this.progress += Time.delta * eff;
      this.speedScl = Mathf.approach(this.speedScl, eff > 0 ? 1 : 0, 0.05 * Time.delta);
      if (this.progress >= p.time) {
        for (const r of p.requirements) this.removeItem(r.item, r.amount);
        this.progress = 0;
        const ang = this.rotation * 90;
        const sx = this.x + Angles.trnsx(ang, this.block.size * TS / 2 + 4), sy = this.y + Angles.trnsy(ang, this.block.size * TS / 2 + 4);
        const u = Game.spawnUnit(UNITS[p.unit], this.team, sx, sy, ang);
        u.vx = Angles.trnsx(ang, 1); u.vy = Angles.trnsy(ang, 1);
        Fx.create('unitSpawn', sx, sy, ang, Teams[this.team].color);
        Audio2.play('unitCreate', sx, sy, 0.8);
      }
    } else this.speedScl = Mathf.approach(this.speedScl, 0, 0.05 * Time.delta);
  }
  draw() {
    Draw.rect(this.block.name, this.x, this.y);
    const p = this.plan;
    if (p) {
      const f = this.progress / p.time;
      drawBuildShader(UNITS[p.unit].name, this.x, this.y, this.rotation * 90 - 90, f, this.speedScl);
    }
    Draw.rect('factory-out-3', this.x, this.y, undefined, undefined, this.rotation * 90);
    Draw.rect('factory-top-3', this.x, this.y);
  }
  info() {
    const p = this.plan;
    if (!p) return ['No unit selected'];
    const lines = [`Building ${p.unit}: ${Math.floor(this.progress / p.time * 100)}%`];
    lines.push(p.requirements.map(r => `${this.items[r.item.id]}/${r.amount} ${r.item.name}`).join(', '));
    if (Game.unitCount(this.team, p.unit) >= Game.unitCap(this.team)) lines.push('Unit cap reached');
    return lines;
  }
}

// ================================================================ storage
class StorageBlock extends Building {
  acceptItem(source, item) { return this.items[item.id] < this.block.itemCapacity; }
  draw() {
    Draw.rect(this.block.name, this.x, this.y);
    Draw.rect(Assets.team(this.block.name + '-team', Teams[this.team]), this.x, this.y);
  }
}

class Core extends StorageBlock {
  acceptItem(source, item) { return true; }
  handleItem(source, item) {
    if (this.items[item.id] >= this.block.itemCapacity) {
      if (Math.random() < 0.1) Fx.create('fuelburn', this.x + Mathf.range(8), this.y + Mathf.range(8));
      return; // incinerate
    }
    this.addItem(item);
  }
  damage(amount, attacker) {
    super.damage(amount, attacker);
    if (this.team === 'sharded' && !this.dead) Game.coreDamaged();
  }
}

// ================================================================ construction
class ConstructBuild extends Building {
  constructor(block, team, tx, ty, rotation, current, breaking) {
    super(BLOCKS.build, team, tx, ty, rotation);
    this.current = current;
    this.x = tx * TS + current.offset; this.y = ty * TS + current.offset;
    this.hitSize = current.size * TS;
    this.progress = breaking ? 1 : 0;
    this.breaking = breaking;
    this.consumed = current.requirements.map(() => breaking ? null : 0);
    this.refunded = current.requirements.map(() => 0);
    if (breaking) this.consumed = current.requirements.map(r => r.amount);
    this.maxHealth = current.health; this.health = Math.max(10, current.health * this.progress);
    this.buildCost = current.buildTime;
    this.lastBuilder = null; this.config = null; this.prevItems = null;
    this.constructing = 0;
  }
  // footprint uses the target block's size
  get minX() { return this.tx + this.current.sizeOffset; }
  get minY() { return this.ty + this.current.sizeOffset; }
  get maxX() { return this.minX + this.current.size - 1; }
  get maxY() { return this.minY + this.current.size - 1; }
  eachTile(cb) {
    const s = this.current.size, o = this.current.sizeOffset;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) cb(this.tx + o + dx, this.ty + o + dy);
  }

  construct(builder, core, amount) {
    this.breaking = false;
    this.constructing = 1;
    this.lastBuilder = builder;
    const target = Math.min(1, this.progress + amount);
    const reqs = this.current.requirements;
    // how many of each item must be consumed in total to reach 'target'
    const need = reqs.map((r, i) => Math.max(0, Math.floor(r.amount * target + 1e-6) - this.consumed[i]));
    if (core) {
      let frac = 1;
      reqs.forEach((r, i) => {
        if (need[i] > 0 && !core.has(r.item, need[i])) {
          const avail = core.items[r.item.id];
          frac = Math.min(frac, avail / need[i]);
        }
      });
      if (frac < 1) return false; // stall until resources exist
      reqs.forEach((r, i) => { if (need[i] > 0) { core.removeItem(r.item, need[i]); this.consumed[i] += need[i]; } });
    }
    this.progress = target;
    this.health = Math.max(this.health, Math.max(10, this.current.health * this.progress));
    if (this.progress >= 1) Game.finishConstruct(this);
    return true;
  }

  deconstruct(builder, core, amount) {
    this.breaking = true;
    this.constructing = 1;
    this.lastBuilder = builder;
    this.progress = Math.max(0, this.progress - amount);
    const reqs = this.current.requirements;
    if (core) {
      reqs.forEach((r, i) => {
        const shouldRefund = Math.floor(this.consumed[i] * 0.5 * (1 - this.progress) + 1e-6);
        const d = shouldRefund - this.refunded[i];
        if (d > 0) { core.handleItem(core, r.item); if (d > 1) core.addItem(r.item, Math.min(d - 1, core.block.itemCapacity - core.items[r.item.id])); this.refunded[i] += d; }
      });
    }
    if (this.progress <= 0) Game.finishDeconstruct(this);
  }

  update() { this.constructing = Mathf.approach(this.constructing, 0, Time.delta / 10); }

  draw() {
    const c = this.current;
    const icon = 'icon:' + c.name;
    drawBuildShader(icon, this.x, this.y, c.rotate ? this.rotation * 90 : 0, this.progress, 1, true);
  }
}

// Mindustry-like "build" shader approximation: faded silhouette, revealed part, scanning line.
function drawBuildShader(regionName, x, y, rot, progress, alpha = 1, square = false) {
  const reg = Assets.get(regionName);
  const w = reg.ww, h = reg.wh;
  const ctx = Render.ctx;
  // faint silhouette
  Draw.setAlpha(0.3 * alpha);
  Draw.rect(Assets.silhouette(regionName, Pal.accent), x, y, w, h, rot);
  // revealed portion (bottom -> top in world space)
  Draw.setAlpha(alpha);
  ctx.save();
  Render.base();
  ctx.beginPath();
  ctx.rect(x - w / 2, y - h / 2, w, h * progress);
  ctx.clip();
  Draw.rect(reg, x, y, w, h, rot);
  ctx.restore();
  // scan line
  const ly = y - h / 2 + h * progress;
  Lines.set(rgba(Pal.accent, 0.9 * alpha), 0.6);
  Lines.line(x - w / 2, ly, x + w / 2, ly);
  if (square) {
    Lines.set(rgba(Pal.accent, 0.6 * alpha), 0.5);
    Lines.rect(x - w / 2, y - h / 2, w, h);
  }
  Draw.setAlpha(1);
}

function circleRect(cx, cy, r, b) {
  const hw = (b.current ? b.current.size : b.block.size) * TS / 2;
  const nx = Mathf.clamp(cx, b.x - hw, b.x + hw), ny = Mathf.clamp(cy, b.y - hw, b.y + hw);
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

// intercept prediction (Predict.intercept)
function predict(sx, sy, target, speed) {
  const vx = target.vx || 0, vy = target.vy || 0;
  if (!speed || (!vx && !vy)) return [target.x, target.y];
  const dx = target.x - sx, dy = target.y - sy;
  const a = vx * vx + vy * vy - speed * speed;
  const b = 2 * (vx * dx + vy * dy);
  const c = dx * dx + dy * dy;
  let t;
  if (Math.abs(a) < 1e-6) t = -c / b;
  else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return [target.x, target.y];
    const t1 = (-b + Math.sqrt(disc)) / (2 * a), t2 = (-b - Math.sqrt(disc)) / (2 * a);
    t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  }
  if (!(t > 0)) return [target.x, target.y];
  return [target.x + vx * t, target.y + vy * t];
}

const BuildClasses = {
  Conveyor, Junction, Router, Sorter, OverflowGate, ItemBridge, Unloader, Drill, GenericCrafter, ConsumeGenerator,
  SolarGenerator, Battery, PowerNode, Wall, MendProjector, ItemTurret, PowerTurret, UnitFactory, StorageBlock, Core,
};

function createBuilding(block, team, tx, ty, rot) {
  const C = BuildClasses[block.cls];
  return new C(block, team, tx, ty, rot);
}
