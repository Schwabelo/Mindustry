// Units: physics, mechs, weapons, AI controllers (GroundAI, FlyingAI, SuicideAI, defender), flow-field pathfinding.

let nextUnitId = 1;
const MINE_RANGE = 70, BUILD_RANGE = 220, TRANSFER_RANGE = 220;

class Unit {
  constructor(type, team, x, y, rot = 90) {
    this.type = type; this.team = team; this.id = nextUnitId++;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.rotation = rot;
    this.health = type.health; this.maxHealth = type.health; this.shield = 0; this.armor = type.armor;
    this.elevation = type.flying ? 1 : 0;
    this.baseRotation = rot; this.walkTime = 0;
    this.dead = false; this.hitTime = 0; this.burnTime = 0;
    this.stack = { item: null, amount: 0 };
    this.mineTile = null; this.mineTimer = 0;
    this.plans = [];
    this.controller = null;
    this.mounts = [];
    for (const w of type.weapons) {
      if (w.mirror && w.x !== 0) {
        const a = { weapon: w, x: w.x, flip: false, reload: 0, recoil: 0, side: false, shoot: false, queued: [] };
        const b = { weapon: w, x: -w.x, flip: true, reload: 0, recoil: 0, side: false, shoot: false, queued: [] };
        a.other = b; b.other = a;
        this.mounts.push(a, b);
      } else this.mounts.push({ weapon: w, x: w.x, flip: false, reload: 0, recoil: 0, side: false, shoot: false, queued: [] });
    }
    this.aimX = x; this.aimY = y; this.isShooting = false;
    this.moveX = 0; this.moveY = 0;
  }

  get isFlying() { return this.elevation > 0.5; }
  get hitSize() { return this.type.hitSize; }
  get healthf() { return this.health / this.maxHealth; }
  get range() { return this.type.range; }
  get isPlayer() { return this.controller === 'player'; }

  floorSpeed() {
    if (this.isFlying) return 1;
    const tx = Math.round(this.x / TS), ty = Math.round(this.y / TS);
    if (!World.inside(tx, ty)) return 1;
    return World.floorAt(tx, ty).speed;
  }
  speed() { return this.type.speed * this.floorSpeed() * (this.type.canBoost && this.elevation > 0.5 ? 2 : 1); }

  // UnitComp.moveAt / rotateMove
  moveAt(tx, ty, accel = this.type.accel) {
    const len = Math.hypot(tx, ty);
    if (!this.type.omniMovement) {
      if (len > 0.001) this.rotation = Angles.moveToward(this.rotation, Angles.angle(0, 0, tx, ty), this.type.rotateSpeed * Time.delta);
      tx = Angles.trnsx(this.rotation, len); ty = Angles.trnsy(this.rotation, len);
    }
    let dx = tx - this.vx, dy = ty - this.vy;
    const lim = accel * len * Time.delta;
    const dl = Math.hypot(dx, dy);
    if (dl > lim && dl > 0) { dx = dx / dl * lim; dy = dy / dl * lim; }
    this.vx += dx; this.vy += dy;
  }
  movePref(tx, ty) { this.moveAt(tx, ty); }
  lookAt(x, y) { this.rotation = Angles.moveToward(this.rotation, Angles.angle(this.x, this.y, x, y), this.type.rotateSpeed * Time.delta); }
  lookAngle(a) { this.rotation = Angles.moveToward(this.rotation, a, this.type.rotateSpeed * Time.delta); }

  // move toward a point, stopping within 'within'
  moveTo(x, y, within = 0) {
    const dx = x - this.x, dy = y - this.y;
    const d = Math.hypot(dx, dy);
    if (d <= within) { this.moveAt(0, 0); return; }
    const s = this.speed();
    let len = s;
    // slow down when approaching
    if (d - within < s * 6) len = s * Mathf.clamp((d - within) / (s * 6), 0.2, 1);
    this.moveAt(dx / d * len, dy / d * len);
  }

  collidesAt(x, y) {
    const r = Math.min(this.type.hitSize * 0.66, 7.9) / 2;
    const x1 = Math.round((x - r) / TS), x2 = Math.round((x + r) / TS);
    const y1 = Math.round((y - r) / TS), y2 = Math.round((y + r) / TS);
    for (let ty = y1; ty <= y2; ty++) for (let tx = x1; tx <= x2; tx++) {
      if (!World.inside(tx, ty)) return true;
      const i = ty * World.w + tx;
      if (World.wall[i]) return true;
      if (FLOOR_DEFS[World.floor[i]].isDeep && !this.type.hovering) return true;
      const b = World.build[i];
      if (b && !this.type.legs && b.block.solid && !b.open && !(b instanceof ConstructBuild && b.progress < 0.1)) {
        // tile AABB overlap test
        const bx = tx * TS, by = ty * TS;
        if (x + r > bx - 4 && x - r < bx + 4 && y + r > by - 4 && y - r < by + 4) return true;
      }
    }
    return false;
  }

  physicsMove(dx, dy) {
    if (this.isFlying) { this.x += dx; this.y += dy; return; }
    // move in substeps along x then y (EntityCollisions.move)
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 3));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (!this.collidesAt(this.x + sx, this.y)) this.x += sx; else this.vx *= 0.5;
      if (!this.collidesAt(this.x, this.y + sy)) this.y += sy; else this.vy *= 0.5;
    }
  }

  damage(amount, pierceArmor = false) {
    if (this.dead) return;
    amount = pierceArmor ? amount : Math.max(amount - this.armor, amount * 0.1);
    if (this.shield > 0) {
      const s = Math.min(this.shield, amount);
      this.shield -= s; amount -= s;
      this.shieldAlpha = 1;
    }
    this.health -= amount;
    this.hitTime = 1;
    if (this.health <= 0) this.kill();
  }
  heal(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }

  kill() {
    if (this.dead) return;
    this.dead = true;
    if (this.type.crawler && !this.exploded) this.explode();
    Fx.create('unitExplode', this.x, this.y, 0, null, this.type.hitSize);
    Audio2.play('unitExplode', this.x, this.y, 0.5 + this.type.hitSize / 30);
    if (!this.isFlying) Decals.add('scorch', this.x, this.y, Math.random() * 360, Math.min(this.type.hitSize / 8, 2));
    else Fx.create('fallSmoke', this.x, this.y);
    if (this.isPlayer) Game.onPlayerDeath(this);
  }

  explode() {
    const e = this.type.explode;
    this.exploded = true;
    Damage.splash(this.team, this.x, this.y, e.splashDamageRadius, e.splashDamage, true, true, e.buildingDamageMultiplier);
    Fx.create('pulverize', this.x, this.y);
    Fx.create('blastExplosion', this.x, this.y);
    Audio2.play('explosionCrawler', this.x, this.y, 0.7);
    if (!this.dead) { this.dead = true; Fx.create('unitExplode', this.x, this.y, 0, null, this.type.hitSize); }
  }

  update() {
    const t = this.type;
    if (this.burnTime > 0) {
      this.burnTime -= Time.delta;
      this.damage(0.167 * Time.delta, true);
      if (Math.random() < 0.1 * Time.delta) Fx.create('burning', this.x + Mathf.range(t.hitSize / 2), this.y + Mathf.range(t.hitSize / 2));
      if (this.dead) return;
    }
    if (this.controller && this.controller !== 'player') this.controller.update(this);

    // integrate velocity
    const ox = this.x, oy = this.y;
    this.physicsMove(this.vx * Time.delta, this.vy * Time.delta);
    const drag = t.drag;
    const f = Math.max(1 - drag * Time.delta, 0);
    this.vx *= f; this.vy *= f;
    // map bounds
    const maxX = (World.w - 1) * TS, maxY = (World.h - 1) * TS;
    if (this.x < 0) { this.x = 0; this.vx = 0; } if (this.y < 0) { this.y = 0; this.vy = 0; }
    if (this.x > maxX) { this.x = maxX; this.vx = 0; } if (this.y > maxY) { this.y = maxY; this.vy = 0; }

    // conveyors push ground units (Conveyor.unitOn)
    if (!this.isFlying && !this.type.hovering) {
      const b = World.buildWorld(this.x, this.y);
      if (b instanceof Conveyor && b.clogHeat <= 0.5 && b.len * ITEM_SPACE < 0.9) {
        const ms = b.block.speed * TS * 55 / 60 * 0.4;
        this.x += Geometry.d4[b.rotation][0] * ms * Time.delta;
        this.y += Geometry.d4[b.rotation][1] * ms * Time.delta;
      }
    }

    const moved = Math.hypot(this.x - ox, this.y - oy);
    if (t.mech) {
      if (moved > 0.01) this.baseRotation = Angles.moveToward(this.baseRotation, Angles.angle(ox, oy, this.x, this.y), 5 * Mathf.clamp(moved / t.speed / Time.delta));
      this.walkTime += moved;
    }
    if (t.canBoost) {
      // boost over solid tiles
      const tx = Math.round(this.x / TS), ty = Math.round(this.y / TS);
      const want = World.inside(tx, ty) && (World.solid(tx, ty) || FLOOR_DEFS[World.floor[ty * World.w + tx]].isDeep) ? 1 : 0;
      this.elevation = Mathf.approach(this.elevation, want, 0.08 * Time.delta);
    }
    this.speedNow = moved / Math.max(Time.delta, 1e-3);

    this.updateWeapons();
    if (!this.isPlayer) this.updateMining();
    this.hitTime = Math.max(0, this.hitTime - Time.delta / 9);
    if (this.shieldAlpha) this.shieldAlpha = Math.max(0, this.shieldAlpha - Time.delta / 20);
  }

  // MinerComp.update
  validMine(tx, ty) {
    if (!World.inside(tx, ty) || World.buildAt(tx, ty)) return null;
    const it = World.oreItem(tx, ty);
    if (!it || it.hardness > this.type.mineTier) return null;
    return Math.hypot(tx * TS - this.x, ty * TS - this.y) <= MINE_RANGE + 8 ? it : null;
  }

  updateMining() {
    if (!this.mineTile) return;
    const [tx, ty] = this.mineTile;
    const it = this.validMine(tx, ty);
    if (!it) { this.mineTile = null; return; }
    this.mineTimer += Time.delta * this.type.mineSpeed;
    if (Math.random() < 0.06 * Time.delta) Fx.create('mineSpark', tx * TS + Mathf.range(3), ty * TS + Mathf.range(3), 0, it.color);
    if (this.mineTimer >= 50 + it.hardness * 15) {
      this.mineTimer = 0;
      const core = Game.teamBuildings(this.team).find(b => b.block.cls === 'Core');
      // players offload straight into a nearby core; AI miners fill their stack and fly it back
      if (this.isPlayer && core && Math.hypot(core.x - this.x, core.y - this.y) < TRANSFER_RANGE && core.items[it.id] < core.block.itemCapacity) {
        core.addItem(it);
        Fx.create('itemTransfer', tx * TS, ty * TS, 0, null, { item: it, tx: core.x, ty: core.y });
      } else if ((this.stack.item === it || !this.stack.item) && this.stack.amount < this.type.itemCapacity) {
        this.stack.item = it; this.stack.amount++;
        Fx.create('itemTransfer', tx * TS, ty * TS, 0, null, { item: it, tx: this.x, ty: this.y });
      }
    }
  }

  drawMining() {
    if (!this.mineTile) return;
    const [tx, ty] = this.mineTile;
    const ex = tx * TS + Mathf.sin(Time.time + 48, 6, 1.4), ey = ty * TS + Mathf.sin(Time.time, 7, 1.4);
    const sx = this.x + Angles.trnsx(this.rotation, this.type.hitSize / 2), sy = this.y + Angles.trnsy(this.rotation, this.type.hitSize / 2);
    Draw.setAlpha(0.9);
    Draw.laser(sx, sy, ex, ey, 0.75, col('e8d174'));
    Draw.setAlpha(1);
  }

  updateWeapons() {
    const speed = Math.hypot(this.vx, this.vy);
    for (const m of this.mounts) {
      const w = m.weapon;
      m.reload = Math.max(m.reload - Time.delta, 0);
      m.recoil = Mathf.approach(m.recoil, 0, Time.delta / Math.max(w.reload, 1) * 1.5);
      for (let i = m.queued.length - 1; i >= 0; i--) {
        const q = m.queued[i]; q.delay -= Time.delta;
        if (q.delay <= 0) { m.queued.splice(i, 1); this.fireBullet(m); }
      }
      if (w.rotate) {
        if (m.angle === undefined) m.angle = this.rotation;
        const [mx, my] = this.mountPos(m);
        const want = m.shoot ? Angles.angle(mx, my, this.aimX, this.aimY) : this.rotation;
        m.angle = Angles.moveToward(m.angle, want, w.rotateSpeed * Time.delta);
      }
      if (!m.shoot || !w.bullet) continue;
      if (w.minShootVelocity > 0 && speed < w.minShootVelocity) continue;
      if (!w.ignoreRotation) {
        const [mx, my] = w.rotate ? this.mountPos(m) : [this.x, this.y];
        const ang = Angles.angle(mx, my, this.aimX, this.aimY);
        if (!Angles.within(w.rotate ? m.angle : this.rotation, ang, w.shootCone)) continue;
      }
      if (m.reload > 0.0001) continue;
      if (w.alternate && m.other && m.side !== m.flip) continue;
      // fire
      this.fireBullet(m);
      for (let s = 1; s < w.shots; s++) m.queued.push({ delay: w.shotDelay * s });
      m.reload = w.reload;
      m.recoil = 1;
      if (w.alternate && m.other) { m.side = !m.side; m.other.side = !m.other.side; }
      if (w.shootSound) Audio2.play(w.shootSound, this.x, this.y, this.isPlayer ? 0.5 : 0.35);
      if (w.shake) Render.shake(w.shake, w.shake);
    }
  }

  mountPos(m, extraY = 0) {
    const r = this.rotation - 90;
    return [this.x + Angles.trnsx(r, m.x, m.weapon.y + extraY), this.y + Angles.trnsy(r, m.x, m.weapon.y + extraY)];
  }

  fireBullet(m) {
    if (this.dead) return;
    const w = m.weapon;
    let bx, by;
    if (w.rotate && m.angle !== undefined) {
      const [mx, my] = this.mountPos(m);
      bx = mx + Angles.trnsx(m.angle, w.shootY); by = my + Angles.trnsy(m.angle, w.shootY);
    } else [bx, by] = this.mountPos(m, w.shootY);
    const ang = (w.rotate && m.angle !== undefined ? m.angle : this.rotation) + (this._angOff || 0) + Mathf.range(w.inaccuracy + (w.bullet.inaccuracy || 0));
    let lifeScl = 1;
    if (w.bullet.scaleLife) {
      const tr = w.bullet.speed * w.bullet.lifetime;
      lifeScl = Mathf.clamp(Math.hypot(this.aimX - bx, this.aimY - by) / tr, 0, 1);
    }
    Bullets.create(w.bullet, this, this.team, bx, by, ang, w.velocityRnd ? 1 - w.velocityRnd + Math.random() * w.velocityRnd : 1, lifeScl, this.aimX, this.aimY);
    if (w.bullet.shootEffect) Fx.create(w.bullet.shootEffect, bx, by, ang, w.bullet.hitColor || w.bullet.backColor);
    if (w.bullet.smokeEffect) Fx.create(w.bullet.smokeEffect, bx, by, ang, w.bullet.hitColor || w.bullet.backColor);
    if (w.ejectEffect) Fx.create(w.ejectEffect, bx, by, this.rotation * (m.flip ? -1 : 1));
  }

  // ------------------------------------------------------------ drawing
  drawShadow() {
    const t = this.type;
    if (this.elevation > 0.05) {
      const e = Mathf.clamp(this.elevation, 0.1, 1);
      Draw.setAlpha(0.22);
      Draw.rect(this.regs().shadow, this.x - 12 * e, this.y - 13 * e, undefined, undefined, this.rotation - 90);
      Draw.setAlpha(1);
    } else {
      const s = t.hitSize * 2.4;
      Draw.setAlpha(0.45);
      Draw.rect('circle-shadow', this.x, this.y, s, s);
      Draw.setAlpha(1);
    }
  }

  walkExtend(scaled) {
    const st = this.type.mechStride;
    let raw = this.walkTime % (st * 4);
    if (scaled) return raw / st;
    if (raw > st * 3) raw = raw - st * 4;
    else if (raw > st * 2) raw = st * 2 - raw;
    else if (raw > st) raw = st * 2 - raw;
    return raw;
  }

  regs() {
    const t = this.type;
    if (!t._regs) t._regs = {};
    let r = t._regs[this.team];
    if (!r) {
      r = t._regs[this.team] = {
        body: Assets.get(t.name), white: Assets.silhouette(t.name, Pal.white), shadow: Assets.silhouette(t.name, Pal.shadow),
        leg: t.mech ? Assets.get(t.name + '-leg') : null, base: t.mech ? Assets.get(t.name + '-base') : null,
        cell: t.cell ? Assets.team(t.name + '-cell', Teams[this.team]) : null,
        weapons: t.weapons.map(w => w.sprite ? Assets.get(w.sprite) : null),
      };
    }
    return r;
  }

  draw() {
    const t = this.type;
    const R = this.regs();
    let x = this.x, y = this.y;
    const e = t.canBoost ? this.elevation : 0;
    if (t.mech) {
      const sin = Mathf.lerp(Math.sin(this.walkExtend(true) * Math.PI / 2), 0, e);
      const ext = Mathf.lerp(this.walkExtend(false), 0, e);
      const boostTrns = e * 2;
      const leg = R.leg;
      for (const i of [-1, 1]) {
        Draw.rect(leg,
          x + Angles.trnsx(this.baseRotation, ext * i - boostTrns, -boostTrns * i),
          y + Angles.trnsy(this.baseRotation, ext * i - boostTrns, -boostTrns * i),
          leg.ww * i, leg.wh * (1 - Math.max(-sin * i, 0) * 0.5), this.baseRotation - 90 + 35 * i * e);
      }
      Draw.rect(R.base, x, y, undefined, undefined, this.baseRotation - 90);
      // body sway
      const ws = Math.sin(this.walkExtend(true) * Math.PI / 2);
      const side = Mathf.lerp(ws * t.mechSideSway, 0, e), frontS = Mathf.lerp(Math.sin(this.walkExtend(true) * Math.PI) * t.mechFrontSway, 0, e);
      x += Angles.trnsx(this.baseRotation, 0, side) + Angles.trnsx(this.baseRotation + 90, 0, frontS);
      y += Angles.trnsy(this.baseRotation, 0, side) + Angles.trnsy(this.baseRotation + 90, 0, frontS);
    }
    if (this.elevation > 0.5 && t.flying) this.drawEngine(x, y);
    this.drawWeapons(x, y, false);
    Draw.rect(R.body, x, y, undefined, undefined, this.rotation - 90);
    if (R.cell) Draw.rect(R.cell, x, y, undefined, undefined, this.rotation - 90);
    if (this.hitTime > 0) {
      Draw.setAlpha(this.hitTime * 0.9);
      Draw.rect(R.white, x, y, undefined, undefined, this.rotation - 90);
      Draw.setAlpha(1);
    }
    this.drawWeapons(x, y, true);
    if (this.shield > 0) {
      Draw.setAlpha(Mathf.clamp(0.25 + (this.shieldAlpha || 0) * 0.5));
      Fill.set(rgba(Teams[this.team].color, 1));
      Fill.poly(x, y, 6, t.hitSize * 0.9, Time.time);
      Draw.setAlpha(1);
    }
  }

  drawWeapons(x, y, top) {
    for (const m of this.mounts) {
      const w = m.weapon;
      if (!w.sprite || w.top !== top) continue;
      const r = this.rotation - 90;
      const reg = this.regs().weapons[t_widx(this, w)];
      if (w.rotate && m.angle !== undefined) {
        const mx = x + Angles.trnsx(r, m.x, w.y), my = y + Angles.trnsy(r, m.x, w.y);
        const wr = m.angle - 90, rec = -m.recoil * w.recoil;
        Draw.rect(reg, mx + Angles.trnsx(wr, 0, rec), my + Angles.trnsy(wr, 0, rec), reg.ww * (m.flip ? -1 : 1), reg.wh, wr);
        continue;
      }
      const rec = -m.recoil * w.recoil;
      const wx = x + Angles.trnsx(r, m.x, w.y + rec), wy = y + Angles.trnsy(r, m.x, w.y + rec);
      Draw.rect(reg, wx, wy, reg.ww * (m.flip ? -1 : 1), reg.wh, r);
    }
  }

  drawEngine(x, y) {
    const t = this.type;
    const sc = this.elevation;
    const off = t.engineOffset;
    const es = t.engineSize + Mathf.absin(Time.time, 2, t.engineSize / 4);
    Fill.set(Teams[this.team].color.css);
    Fill.circle(x + Angles.trnsx(this.rotation + 180, off), y + Angles.trnsy(this.rotation + 180, off), es * sc);
    Fill.set('#fff');
    Fill.circle(x + Angles.trnsx(this.rotation + 180, off - 1), y + Angles.trnsy(this.rotation + 180, off - 1), es / 2 * sc);
  }
}

// ================================================================ targeting helpers
const Targeting = {
  closestUnit(team, x, y, range, air, ground) {
    let best = null, bd = Infinity;
    for (const u of Game.units) {
      if (u.team === team || u.dead) continue;
      if (u.isFlying ? !air : !ground) continue;
      const d = Math.hypot(u.x - x, u.y - y) - u.type.hitSize / 2;
      if (d <= range && d < bd) { bd = d; best = u; }
    }
    return best;
  },
  closestBuilding(team, x, y, range, pred) {
    let best = null, bd = Infinity;
    for (const b of Game.buildings) {
      if (b.team === team || b.dead) continue;
      if (pred && !pred(b)) continue;
      if (b.block.targetable === false) continue;
      const d = Math.hypot(b.x - x, b.y - y) - b.hitSize / 2;
      if (d <= range && d < bd) { bd = d; best = b; }
    }
    return best;
  },
  closestTarget(team, x, y, range, air, ground) {
    return this.closestUnit(team, x, y, range, air, ground) || (ground ? this.closestBuilding(team, x, y, range) : null);
  },
  enemyCore(team) {
    return Game.buildings.find(b => b.block.cls === 'Core' && b.team !== team && !b.dead) || null;
  },
};

// ================================================================ flow fields
class FlowField {
  constructor(team, targetFn) {
    this.team = team; this.targetFn = targetFn;
    this.dist = new Float64Array(World.w * World.h).fill(Infinity);
  }
  cost(i) {
    const W = World.w;
    if (World.wall[i] || FLOOR_DEFS[World.floor[i]].isDeep) return Infinity;
    let c = 1;
    const b = World.build[i];
    if (b && b.block.solid && !b.open) {
      if (b.team === this.team) return Infinity;
      c += 70;
    }
    // near walls penalty (PathTile.nearSolid)
    const x = i % W, y = (i / W) | 0;
    if (World.isWall(x + 1, y) || World.isWall(x - 1, y) || World.isWall(x, y + 1) || World.isWall(x, y - 1)) c += 2;
    if (FLOOR_DEFS[World.floor[i]].isLiquid) c += 3;
    return c;
  }
  compute() {
    const W = World.w, H = World.h;
    const dist = this.dist;
    dist.fill(Infinity);
    const heap = new MinHeap();
    for (const [x, y] of this.targetFn()) {
      if (!World.inside(x, y)) continue;
      const i = y * W + x;
      dist[i] = 0; heap.push(i, 0);
    }
    const costCache = new Float64Array(W * H).fill(-1);
    while (heap.size) {
      const [i, d] = heap.pop();
      if (d > dist[i]) continue;
      const x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 8; k++) {
        const [dx, dy] = Geometry.d8[k];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        let c = costCache[ni];
        if (c < 0) { c = this.cost(ni); costCache[ni] = c; }
        if (c === Infinity) continue;
        if (dx !== 0 && dy !== 0) {
          // no corner cutting
          if (World.solid(x + dx, y) || World.solid(x, y + dy)) continue;
          c *= 1.414;
        }
        const nd = d + c;
        if (nd < dist[ni]) { dist[ni] = nd; heap.push(ni, nd); }
      }
    }
  }
  // world position of the next tile to move to, or null
  next(x, y) {
    const W = World.w;
    const tx = Math.round(x / TS), ty = Math.round(y / TS);
    if (!World.inside(tx, ty)) return null;
    let best = -1, bd = this.dist[ty * W + tx];
    for (let k = 0; k < 8; k++) {
      const [dx, dy] = Geometry.d8[k];
      const nx = tx + dx, ny = ty + dy;
      if (!World.inside(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (World.solid(tx + dx, ty) || World.solid(tx, ty + dy))) continue;
      const d = this.dist[ny * W + nx];
      if (d < bd) { bd = d; best = ny * W + nx; }
    }
    if (best < 0) return null;
    return [(best % W) * TS, ((best / W) | 0) * TS];
  }
}

const Pathfinder = {
  fields: {},
  dirty: true, timer: 0,
  init() {
    const coreTiles = team => () => {
      const out = [];
      for (const b of Game.buildings) if (b.block.cls === 'Core' && b.team !== team && !b.dead) b.eachTile((x, y) => out.push([x, y]));
      if (!out.length) out.push([World.coreTile.x, World.coreTile.y]);
      return out;
    };
    this.fields.crux = new FlowField('crux', coreTiles('crux'));
    this.fields.toSpawn = new FlowField('sharded', () => [[World.spawn.x, World.spawn.y]]);
    this.fields.toCore = new FlowField('sharded', () => {
      const out = [];
      for (const b of Game.buildings) if (b.block.cls === 'Core' && b.team === 'sharded') {
        // ring around the core
        for (let x = b.minX - 2; x <= b.maxX + 2; x++) for (let y = b.minY - 2; y <= b.maxY + 2; y++) if (x < b.minX - 1 || x > b.maxX + 1 || y < b.minY - 1 || y > b.maxY + 1) out.push([x, y]);
      }
      return out;
    });
    this.dirty = true;
    this.update(true);
  },
  update(force = false) {
    this.timer += Time.delta;
    if ((this.dirty && this.timer > 45) || force) {
      this.timer = 0; this.dirty = false;
      for (const f of Object.values(this.fields)) f.compute();
    }
  },
};

// ================================================================ AI controllers
class GroundAI {
  constructor() { this.target = null; this.retarget = Math.random() * 20; }
  update(u) {
    const t = u.type;
    const core = Targeting.enemyCore(u.team);
    let move = true;
    if (core && Math.hypot(core.x - u.x, core.y - u.y) < u.range / 1.3 + core.block.size * TS / 2) {
      this.target = core; move = false;
    }
    this.retarget -= Time.delta;
    if (this.retarget <= 0) {
      this.retarget = 20;
      const tgt = Targeting.closestTarget(u.team, u.x, u.y, u.range, t.targetAir, t.targetGround);
      if (tgt) this.target = tgt;
      else if (!(core && !move)) this.target = null;
    }
    if (this.target && this.target.dead) this.target = null;
    if (move) {
      const field = u.team === 'crux' ? Pathfinder.fields.crux : Pathfinder.fields.toSpawn;
      const nxt = field.next(u.x, u.y);
      if (nxt) {
        const dx = nxt[0] - u.x, dy = nxt[1] - u.y, d = Math.hypot(dx, dy) || 1;
        u.moveAt(dx / d * u.speed(), dy / d * u.speed());
      } else if (core) u.moveTo(core.x, core.y, u.range * 0.8);
    } else u.moveAt(0, 0);
    aimAndShoot(u, this.target);
  }
}

class FlyingAI {
  constructor() { this.target = null; this.moveTarget = null; this.retarget = Math.random() * 20; }
  findMainTarget(u) {
    const core = Targeting.enemyCore(u.team);
    if (core && Math.hypot(core.x - u.x, core.y - u.y) < u.range) return core;
    for (const flag of (u.type.targetFlags || [])) {
      const b = Targeting.closestBuilding(u.team, u.x, u.y, Infinity, b => b.block.flags.includes(flag));
      if (b) return b;
    }
    return core || Targeting.closestTarget(u.team, u.x, u.y, Infinity, true, true);
  }
  update(u) {
    const t = u.type;
    this.retarget -= Time.delta;
    if (this.retarget <= 0 || !this.moveTarget || this.moveTarget.dead) {
      this.retarget = 30;
      this.moveTarget = this.findMainTarget(u);
      this.target = t.autoDropBombs ? null : Targeting.closestTarget(u.team, u.x, u.y, u.range, t.targetAir, t.targetGround);
    }
    if (this.target && this.target.dead) this.target = null;
    const mt = this.moveTarget;
    if (mt) {
      if (t.circleTarget) circleAttack(u, mt, t.circleTargetRadius);
      else { u.moveTo(mt.x, mt.y, u.range * 0.8); u.lookAt(mt.x, mt.y); }
    }
    if (t.autoDropBombs) {
      const below = World.buildWorld(u.x, u.y);
      const shoot = !!(below && below.team !== u.team && !below.dead);
      for (const m of u.mounts) m.shoot = shoot;
      u.aimX = u.x; u.aimY = u.y;
    } else aimAndShoot(u, this.target || (mt && Math.hypot(mt.x - u.x, mt.y - u.y) < u.range ? mt : null), !t.circleTarget);
  }
}

class SuicideAI {
  constructor() { this.target = null; this.retarget = Math.random() * 20; }
  update(u) {
    const t = u.type;
    this.retarget -= Time.delta;
    if (this.retarget <= 0) {
      this.retarget = 20;
      this.target = Targeting.closestUnit(u.team, u.x, u.y, 120, false, true);
    }
    if (this.target && this.target.dead) this.target = null;
    let blocked = null;
    const field = u.team === 'crux' ? Pathfinder.fields.crux : Pathfinder.fields.toSpawn;
    const nxt = field.next(u.x, u.y);
    if (nxt) {
      const b = World.buildWorld(nxt[0], nxt[1]);
      if (b && b.team !== u.team && b.block.solid && !b.open) blocked = b;
    }
    // explode on contact with anything enemy nearby
    const near = Targeting.closestTarget(u.team, u.x, u.y, t.explode.triggerRange, false, true);
    if (near || (blocked && Math.hypot(blocked.x - u.x, blocked.y - u.y) < t.explode.triggerRange + blocked.hitSize / 2)) {
      u.explode();
      return;
    }
    if (this.target) u.moveTo(this.target.x, this.target.y);
    else if (nxt) {
      const dx = nxt[0] - u.x, dy = nxt[1] - u.y, d = Math.hypot(dx, dy) || 1;
      u.moveAt(dx / d * u.speed(), dy / d * u.speed());
    } else {
      const core = Targeting.enemyCore(u.team);
      if (core) u.moveTo(core.x, core.y);
    }
    const vang = Angles.angle(0, 0, u.vx, u.vy);
    if (Math.hypot(u.vx, u.vy) > 0.05) u.lookAngle(vang);
  }
}

// MinerAI: mine the minable item the core has least of, return when full
class MinerAI {
  constructor() { this.mining = true; this.targetItem = null; this.ore = null; this.t1 = 0; this.t2 = 0; }
  update(u) {
    const core = Game.teamBuildings(u.team).find(b => b.block.cls === 'Core');
    if (!core) return;
    if (u.mineTile && !u.validMine(...u.mineTile)) u.mineTile = null;
    if (this.mining) {
      this.t1 -= Time.delta;
      if (this.t1 <= 0 || !this.targetItem) {
        this.t1 = 240;
        let best = null;
        for (const it of [Items.copper, Items.lead, Items.titanium]) {
          if (it.hardness > u.type.mineTier || !World.oreTiles(it).length) continue;
          if (!best || core.items[it.id] < core.items[best.id]) best = it;
        }
        this.targetItem = best;
      }
      if (!this.targetItem) return;
      if (core.items[this.targetItem.id] >= core.block.itemCapacity) { u.mineTile = null; u.stack = { item: null, amount: 0 }; return; }
      if (u.stack.amount >= u.type.itemCapacity || (u.stack.item && u.stack.item !== this.targetItem)) this.mining = false;
      else {
        this.t2 -= Time.delta;
        if (this.t2 <= 0) { this.t2 = 60; this.ore = World.closestOre(this.targetItem, core.tx, core.ty); }
        if (this.ore) {
          const ox = this.ore[0] * TS, oy = this.ore[1] * TS;
          u.moveTo(ox, oy, MINE_RANGE / 2);
          if (Math.hypot(ox - u.x, oy - u.y) < MINE_RANGE && !u.mineTile) u.mineTile = this.ore;
          u.lookAt(ox, oy);
        }
      }
    } else {
      u.mineTile = null;
      if (u.stack.amount === 0) { this.mining = true; return; }
      if (Math.hypot(core.x - u.x, core.y - u.y) < u.type.range + core.block.size * TS / 2) {
        const it = u.stack.item;
        const n = Math.min(u.stack.amount, core.block.itemCapacity - core.items[it.id]);
        if (n > 0) { core.addItem(it, n); Fx.create('itemTransfer', u.x, u.y, 0, null, { item: it, tx: core.x, ty: core.y }); }
        u.stack = { item: null, amount: 0 };
        this.mining = true;
      }
      circleAttack(u, core, u.type.range / 1.8);
    }
  }
}

// player-team units: defend around the core, or attack toward the enemy spawn (G toggles)
class DefenderAI {
  constructor() { this.target = null; this.retarget = Math.random() * 20; this.slot = Math.random() * 360; }
  update(u) {
    const t = u.type;
    if (t.crawler) return this.updateCrawler(u);
    if (t.flying) return this.updateFlying(u);
    this.retarget -= Time.delta;
    if (this.retarget <= 0) {
      this.retarget = 20;
      this.target = Targeting.closestTarget(u.team, u.x, u.y, Game.command === 'attack' ? u.range * 1.5 : 220, t.targetAir, t.targetGround);
    }
    if (this.target && this.target.dead) this.target = null;
    if (this.target) {
      const d = Math.hypot(this.target.x - u.x, this.target.y - u.y);
      if (d > u.range * 0.8) {
        this.followField(u, Game.command === 'attack' ? Pathfinder.fields.toSpawn : null, this.target);
      } else u.moveAt(0, 0);
    } else if (Game.command === 'attack') {
      this.followField(u, Pathfinder.fields.toSpawn, null);
    } else {
      const core = Game.playerCore();
      if (core) {
        const rx = core.x + Angles.trnsx(this.slot, 30), ry = core.y + Angles.trnsy(this.slot, 30);
        if (Math.hypot(rx - u.x, ry - u.y) > 40) this.followField(u, Pathfinder.fields.toCore, null);
        else u.moveTo(rx, ry, 4);
      }
    }
    aimAndShoot(u, this.target);
  }
  updateFlying(u) {
    const t = u.type;
    this.retarget -= Time.delta;
    if (this.retarget <= 0) {
      this.retarget = 20;
      const core = Game.playerCore();
      const cx = core ? core.x : u.x, cy = core ? core.y : u.y;
      // defend: enemies near the core; attack: anything near us, then the drop zone
      this.target = Game.command === 'attack'
        ? Targeting.closestTarget(u.team, u.x, u.y, 400, t.targetAir, t.targetGround)
        : Targeting.closestTarget(u.team, cx, cy, 300, t.targetAir, t.targetGround);
    }
    if (this.target && this.target.dead) this.target = null;
    if (t.autoDropBombs) {
      const below = World.buildWorld(u.x, u.y);
      const shoot = !!(below && below.team !== u.team) || (this.target && Math.hypot(this.target.x - u.x, this.target.y - u.y) < 12);
      for (const m of u.mounts) m.shoot = shoot;
      u.aimX = u.x; u.aimY = u.y;
    }
    if (this.target) {
      if (t.circleTarget) circleAttack(u, this.target, t.circleTargetRadius);
      else { u.moveTo(this.target.x, this.target.y, u.range * 0.8); }
      if (!t.autoDropBombs) aimAndShoot(u, this.target, !t.circleTarget);
    } else {
      for (const m of u.mounts) m.shoot = false;
      const core = Game.playerCore();
      if (Game.command === 'attack') u.moveTo(World.spawn.x * TS, World.spawn.y * TS, 30);
      else if (core) {
        if (t.omniMovement) u.moveTo(core.x + Angles.trnsx(this.slot, 40), core.y + Angles.trnsy(this.slot, 40), 6);
        else circleAttack(u, core, 60);
      }
      if (t.omniMovement && Math.hypot(u.vx, u.vy) > 0.05) u.lookAngle(Angles.angle(0, 0, u.vx, u.vy));
    }
  }

  followField(u, field, target) {
    if (target && !field) { u.moveTo(target.x, target.y, u.range * 0.7); return; }
    const nxt = field && field.next(u.x, u.y);
    if (nxt) {
      const dx = nxt[0] - u.x, dy = nxt[1] - u.y, d = Math.hypot(dx, dy) || 1;
      u.moveAt(dx / d * u.speed(), dy / d * u.speed());
    } else if (target) u.moveTo(target.x, target.y, u.range * 0.7);
  }
  updateCrawler(u) {
    const near = Targeting.closestTarget(u.team, u.x, u.y, u.type.explode.triggerRange, false, true);
    if (near) { u.explode(); return; }
    const tgt = Targeting.closestUnit(u.team, u.x, u.y, 260, false, true);
    if (tgt) u.moveTo(tgt.x, tgt.y);
    else if (Game.command === 'attack') this.followField(u, Pathfinder.fields.toSpawn, null);
    else { const core = Game.playerCore(); if (core && Math.hypot(core.x - u.x, core.y - u.y) > 50) this.followField(u, Pathfinder.fields.toCore, null); else u.moveAt(0, 0); }
    if (Math.hypot(u.vx, u.vy) > 0.05) u.lookAngle(Angles.angle(0, 0, u.vx, u.vy));
  }
}

function t_widx(u, w) { return u.type.weapons.indexOf(w); }

function aimAndShoot(u, target, face = true) {
  const t = u.type;
  if (target && !target.dead) {
    let speed = 0;
    for (const m of u.mounts) if (m.weapon.bullet) speed = m.weapon.bullet.speed;
    const [px, py] = predict(u.x, u.y, target, speed);
    u.aimX = px; u.aimY = py;
    const inRange = Math.hypot(px - u.x, py - u.y) - (target.type ? target.type.hitSize / 2 : target.hitSize / 2) < u.range;
    for (const m of u.mounts) m.shoot = inRange;
    if (face && t.faceTarget && t.omniMovement) u.lookAt(px, py);
  } else {
    for (const m of u.mounts) m.shoot = false;
    if (Math.hypot(u.vx, u.vy) > 0.02 && t.omniMovement) u.lookAngle(Angles.angle(0, 0, u.vx, u.vy));
  }
}

// FlyingAI.circleAttack
function circleAttack(u, target, circleLength) {
  let vx = target.x - u.x, vy = target.y - u.y;
  const vlen = Math.hypot(vx, vy);
  const ang = Angles.angle(u.x, u.y, target.x, target.y);
  const diff = Angles.angleDist(ang, u.rotation);
  const velAng = Angles.angle(0, 0, u.vx, u.vy);
  let a;
  if (diff > 70 && vlen < circleLength) a = velAng;
  else a = Angles.moveToward(velAng, Angles.angle(0, 0, vx, vy), 6);
  const s = u.speed();
  u.moveAt(Angles.trnsx(a, s), Angles.trnsy(a, s));
}

function makeController(type, team) {
  if (type.miner) return new MinerAI();
  if (team === 'sharded') return new DefenderAI();
  if (type.crawler) return new SuicideAI();
  if (type.flying) return new FlyingAI();
  return new GroundAI();
}
