// Puddles (Puddles.java / PuddleComp.java), conduit leaks, liquid reactions between blocks (BuildingComp.moveLiquid) and
// liquid bullets (LiquidBulletType): spilled liquid pools on the ground, spreads, soaks ground units in its status effect,
// burns (oil) or reacts (hot slag with flammable or cold liquids).

const PUDDLE_MAX = 70;
const LIQUID_EFFECT = { water: 'wet', slag: 'melting', oil: 'tarred', cryofluid: 'freezing' }; // Liquid.effect
const LIQUID_STAY_ON = { oil: ['water'] }; // Liquid.canStayOn

const Puddles = {
  map: new Map(), // tile index -> { tx, ty, liquid, amount, accepting, updateTime }
  get(tx, ty) { return World.inside(tx, ty) ? this.map.get(ty * World.w + tx) || null : null; },
  flammability(tx, ty) { const p = this.get(tx, ty); return p ? (p.liquid.flammability || 0) * p.amount : 0; },

  // hot + flammable -> fire (and fireballs); cold onto hot / hot onto cold -> steam, liquid lost
  react(dest, liquid, amount, tx, ty, x, y) {
    if (!dest) return 0;
    if ((dest.flammability > 0.3 && liquid.temperature > 0.7) || (liquid.flammability > 0.3 && dest.temperature > 0.7)) {
      Fires.create(tx, ty);
      if (Math.random() < 0.006 * amount) Fireballs.create(x, y, Math.random() * 360);
    } else if (dest.temperature > 0.7 && liquid.temperature < 0.55) {
      if (Math.random() < 0.5 * amount) Fx.create('smokeSmall', x, y);
      return -0.1 * amount;
    } else if (liquid.temperature > 0.7 && dest.temperature < 0.55) {
      if (Math.random() < 0.8 * amount) Fx.create('smokeSmall', x, y);
      return -0.7 * amount;
    }
    return 0;
  },

  deposit(tx, ty, liquid, amount, srcTx = tx, srcTy = ty, initial = true, cap = false) {
    if (!World.inside(tx, ty) || !liquid) return;
    const x = (tx + srcTx) / 2 * TS, y = (ty + srcTy) / 2 * TS;
    const fl = World.floorAt(tx, ty);
    if (fl.isLiquid && fl.liquidDrop) {
      const floorLiquid = Liquids[fl.liquidDrop];
      if (!(LIQUID_STAY_ON[liquid.name] || []).includes(fl.liquidDrop)) { this.react(floorLiquid, liquid, amount, tx, ty, x, y); return; }
    }
    if (World.isWall(tx, ty)) return;
    const i = ty * World.w + tx;
    const p = this.map.get(i);
    if (!p) this.map.set(i, { tx, ty, liquid, amount: Math.min(amount, PUDDLE_MAX), accepting: 0, updateTime: 0 });
    else if (p.liquid === liquid) p.accepting = Math.max(amount, p.accepting);
    else {
      let added = this.react(p.liquid, liquid, amount, tx, ty, x, y);
      if (cap) added = Mathf.clamp(PUDDLE_MAX - p.amount, 0, added);
      p.amount += added;
    }
  },

  update() {
    for (const [i, p] of this.map) {
      const addSpeed = p.accepting > 0 ? 3 : 0;
      p.amount -= Time.delta * (1 - (p.liquid.viscosity || 0.5)) / (5 + addSpeed);
      p.amount = Math.min(p.amount + p.accepting, PUDDLE_MAX);
      p.accepting = 0;
      if (p.amount >= PUDDLE_MAX / 1.5) {
        // spill into open neighbouring tiles
        const dep = Math.min((p.amount - PUDDLE_MAX / 1.5) / 4, 0.3 * Time.delta);
        let targets = 0;
        for (const [dx, dy] of Geometry.d4) {
          const nx = p.tx + dx, ny = p.ty + dy;
          if (World.inside(nx, ny) && !World.buildAt(nx, ny) && !World.isWall(nx, ny)) { targets++; this.deposit(nx, ny, p.liquid, dep, p.tx, p.ty, false); }
        }
        p.amount -= dep * targets;
      }
      if (p.amount <= 0) { this.map.delete(i); continue; }
      if (p.amount >= PUDDLE_MAX / 2 && (p.updateTime -= Time.delta) <= 0) {
        p.updateTime = 40;
        const size = Mathf.clamp(p.amount / (PUDDLE_MAX / 1.5)) * 10, x = p.tx * TS, y = p.ty * TS;
        const eff = LIQUID_EFFECT[p.liquid.name];
        if (eff) for (const u of Game.units) {
          if (u.dead || u.isFlying || u.type.hovering) continue;
          if (Math.abs(u.x - x) < size / 2 + u.type.hitSize / 2 && Math.abs(u.y - y) < size / 2 + u.type.hitSize / 2) u.applyStatus(eff, 120);
        }
        if (p.liquid.temperature > 0.7 && World.buildAt(p.tx, p.ty) && Math.random() < 0.5) Fires.create(p.tx, p.ty);
      }
    }
  },

  draw() {
    const v = Render.view();
    for (const p of this.map.values()) {
      const x = p.tx * TS, y = p.ty * TS;
      if (x < v.x1 - 12 || x > v.x2 + 12 || y < v.y1 - 12 || y > v.y2 + 12) continue;
      const f = Mathf.clamp(p.amount / (PUDDLE_MAX / 1.5));
      Draw.setAlpha(0.8);
      Fill.set(p.liquid.color.css);
      Fill.circle(x, y, f * 5 + 1);
      Fill.circle(x + Mathf.absin(Time.time + p.tx * 7, 20, 1.5), y + 1.5, f * 3.5);
    }
    Draw.setAlpha(1);
  },
};

// Fires.extinguish(tile, intensity): pushes the fire toward burning out instead of deleting it
Fires.extinguish = function (tx, ty, intensity = 1000) {
  const f = this.map.get(ty * World.w + tx);
  if (!f) return;
  f.time += intensity * Time.delta;
  Fx.create('smokeSmall', tx * TS, ty * TS);
};
// FireComp: puddles add their flammability (oil burns)
{
  const _tf = Fires.tileFlammability;
  Fires.tileFlammability = function (tx, ty) { return _tf.call(this, tx, ty) + Puddles.flammability(tx, ty) / 3; };
}

// LiquidBulletType: over a fire, an extinguishing liquid puts it out and splashes; on hit it leaves a puddle and douses the
// tile and its neighbours
{
  const canExtinguish = l => l.temperature <= 0.5 && (l.flammability || 0) < 0.3;
  const _ub = Bullets.updateBullet;
  Bullets.updateBullet = function (b) {
    const t = b.type;
    if (t.type === 'liquid' && t.liquid && canExtinguish(t.liquid) && !b.removed) {
      const tx = Math.round(b.x / TS), ty = Math.round(b.y / TS);
      if (World.inside(tx, ty) && Fires.map.has(ty * World.w + tx)) { Fires.extinguish(tx, ty, 100); b.removed = true; Bullets.hit(b, b.x, b.y); return; }
    }
    return _ub.call(this, b);
  };
  const _hit = Bullets.hit;
  Bullets.hit = function (b, x, y) {
    const t = b.type;
    if (t.type === 'liquid' && t.liquid) {
      const tx = Math.round(x / TS), ty = Math.round(y / TS);
      Puddles.deposit(tx, ty, t.liquid, t.puddleSize || 6);
      if (canExtinguish(t.liquid)) {
        const intensity = 400 * (t.liquid.heatCapacity / 0.4) * ((t.puddleSize || 6) / 6);
        Fires.extinguish(tx, ty, intensity);
        for (const [dx, dy] of Geometry.d4) Fires.extinguish(tx + dx, ty + dy, intensity);
      }
    }
    return _hit.call(this, b, x, y);
  };
}

// BuildingComp.moveLiquid: a different liquid next door reacts when both are over 10% full
{
  const _ml = Building.prototype.moveLiquid;
  Building.prototype.moveLiquid = function (next, l) {
    const moved = _ml.call(this, next, l);
    if (moved > 0 || !next || !next.liquid || !this.liquid || next.team !== this.team) return moved;
    const other = next.liquid.type;
    if (!other || other === l || next.liquid.amount / next.block.liquidCapacity <= 0.1 || this.liquid.amount / this.block.liquidCapacity <= 0.1) return moved;
    const fx = (this.x + next.x) / 2, fy = (this.y + next.y) / 2;
    if ((other.flammability > 0.3 && l.temperature > 0.7) || (l.flammability > 0.3 && other.temperature > 0.7)) {
      this.damage(Time.delta); next.damage(Time.delta);
      if (Math.random() < 0.1 * Time.delta) Fires.createWorld(fx, fy);
    } else if ((l.temperature > 0.7 && other.temperature < 0.55) || (other.temperature > 0.7 && l.temperature < 0.55)) {
      this.removeLiquid(Math.min(this.liquid.amount, 0.7 * Time.delta));
      if (Math.random() < 0.2 * Time.delta) Fx.create('smokeSmall', fx, fy);
    }
    return moved;
  };
}

// Conduit (leaks = true, plated conduits excepted): an open end spills 1/1.5 of the contents per tick
{
  const _cu = Conduit.prototype.update;
  Conduit.prototype.update = function () {
    const lq = this.liquid;
    if (lq.amount > 0.0001 && !this.block.noLeak && !this.front()) {
      const [dx, dy] = Geometry.d4[this.rotation];
      const nx = this.tx + dx, ny = this.ty + dy;
      if (World.inside(nx, ny) && !World.isWall(nx, ny)) {
        const leak = lq.amount / 1.5;
        Puddles.deposit(nx, ny, lq.type, leak, this.tx, this.ty, true, true);
        this.removeLiquid(leak);
        return;
      }
    }
    return _cu.call(this);
  };
}

// Building.onDestroyed: stored liquid splashes around as puddles
{
  const _be = buildingExplosion;
  buildingExplosion = function (b) {
    if (b.liquid && b.liquid.type && b.liquid.amount > 0) {
      const l = b.liquid.type, amount = b.liquid.amount, splash = Mathf.clamp(amount / 4, 0, 10), half = b.block.size * TS / 2;
      for (let i = 0; i < Mathf.clamp(amount / 5, 0, 30); i++) Puddles.deposit(Math.round((b.x + Mathf.range(half)) / TS), Math.round((b.y + Mathf.range(half)) / TS), l, splash);
    }
    return _be.apply(this, arguments);
  };
}

if (BLOCKS['plated-conduit']) BLOCKS['plated-conduit'].noLeak = true; // PlatedConduit: leaks = false
