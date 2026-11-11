// Bullets, damage, lightning, effects (Fx) and floor decals.

let nextBulletId = 1;

const Bullets = {
  list: [],
  lasers: [],

  create(type, owner, team, x, y, angle, velScl = 1, lifeScl = 1, aimX, aimY) {
    if (type.type === 'laser') return this.laser(type, owner, team, x, y, angle);
    if (type.type === 'lightning') return Lightning.create(team, type.color || Pal.lancerLaser, type.damage, x, y, angle, type.lightningLength, type);
    const b = {
      type, owner, team, x, y, rotation: angle, id: nextBulletId++,
      vx: Angles.trnsx(angle, type.speed * velScl), vy: Angles.trnsy(angle, type.speed * velScl),
      time: 0, lifetime: type.lifetime * lifeScl, hit: new Set(), pierced: 0, trail: [], removed: false, aimX, aimY,
      flakTimer: -1,
    };
    if (type.keepVelocity && owner && owner.vx !== undefined && owner.type) { b.vx += owner.vx * 0.5; b.vy += owner.vy * 0.5; }
    this.list.push(b);
    return b;
  },

  laser(type, owner, team, x, y, angle) {
    const len = type.length;
    // Damage.collideLine: everything along the ray, nearest first, up to pierceCap
    const ex = x + Angles.trnsx(angle, len), ey = y + Angles.trnsy(angle, len);
    const hits = [];
    for (const u of Game.units) {
      if (u.team === team || u.dead) continue;
      if (u.isFlying ? !type.collidesAir : !type.collidesGround) continue;
      const d = segDist(x, y, ex, ey, u.x, u.y);
      if (d <= u.type.hitSize / 2 + 4) hits.push({ t: Mathf.dst(x, y, u.x, u.y), u });
    }
    for (const b of Game.buildings) {
      if (b.team === team || b.dead) continue;
      const d = segDist(x, y, ex, ey, b.x, b.y);
      if (d <= b.hitSize / 2) hits.push({ t: Mathf.dst(x, y, b.x, b.y), b });
    }
    hits.sort((a, c) => a.t - c.t);
    let n = 0;
    for (const h of hits) {
      if (type.pierceCap > 0 && n >= type.pierceCap) break;
      if (h.u) { h.u.damage(type.damage); Fx.create(type.hitEffect, h.u.x, h.u.y, angle, Pal.lancerLaser); }
      else { h.b.damage(type.damage * type.buildingDamageMultiplier); Fx.create(type.hitEffect, h.b.x, h.b.y, angle, Pal.lancerLaser); }
      n++;
    }
    this.lasers.push({ type, x, y, angle, len, time: 0, lifetime: type.lifetime });
  },

  update() {
    for (const L of this.lasers) L.time += Time.delta;
    this.lasers = this.lasers.filter(l => l.time < l.lifetime);
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.removed) continue;
      this.updateBullet(b);
    }
    this.list = list.filter(b => !b.removed);
  },

  updateBullet(b) {
    const t = b.type;
    b.time += Time.delta;
    if (t.drag) { const f = Math.max(1 - t.drag * Time.delta, 0); b.vx *= f; b.vy *= f; }
    // homing
    if (t.homingPower > 0 && b.time > 2) {
      const tgt = Targeting.closestUnit(b.team, b.x, b.y, t.homingRange, t.collidesAir, t.collidesGround);
      if (tgt) {
        const sp = Math.hypot(b.vx, b.vy);
        const a = Angles.moveToward(Angles.angle(0, 0, b.vx, b.vy), Angles.angle(b.x, b.y, tgt.x, tgt.y), t.homingPower * Time.delta * 50);
        b.vx = Angles.trnsx(a, sp); b.vy = Angles.trnsy(a, sp);
      }
    }
    if (t.trailLength > 0) { b.trail.push(b.x, b.y); if (b.trail.length > t.trailLength * 2) b.trail.splice(0, 2); }
    b.x += b.vx * Time.delta; b.y += b.vy * Time.delta;
    if (Math.hypot(b.vx, b.vy) > 0.01) b.rotation = Angles.angle(0, 0, b.vx, b.vy);

    if (t.type === 'flame' && Math.random() < 0.6) Fx.create('flameParticle', b.x, b.y, b.rotation);

    // flak: explode near air units
    if (t.type === 'flak') {
      if (b.flakTimer < 0 && b.time > 4) {
        for (const u of Game.units) {
          if (u.team === b.team || u.dead || !u.isFlying) continue;
          if (Mathf.within(b.x, b.y, u.x, u.y, t.explodeRange + u.type.hitSize / 2)) { b.flakTimer = 5; break; }
        }
      } else if (b.flakTimer >= 0) {
        b.flakTimer -= Time.delta;
        if (b.flakTimer <= 0) { this.hit(b, b.x, b.y); b.removed = true; return; }
      }
    }

    if (t.collides) {
      // units
      for (const u of Game.units) {
        if (u.dead || b.hit.has(u)) continue;
        if (u.team === b.team) continue;
        if (u.isFlying ? !t.collidesAir : !t.collidesGround) continue;
        if (Mathf.within(b.x, b.y, u.x, u.y, u.type.hitSize / 2 + t.hitSize / 2)) {
          b.hit.add(u);
          this.hitUnit(b, u);
          if (!t.pierce || (t.pierceCap > 0 && ++b.pierced >= t.pierceCap)) { this.hit(b, b.x, b.y); b.removed = true; return; }
        }
      }
    }
    if (t.collidesTiles && t.collidesGround) {
      const build = World.buildWorld(b.x, b.y);
      if (build && !build.dead && !b.hit.has(build)) {
        if (build.team !== b.team && !(build.block.underBullets && !(b.aimX !== undefined && Mathf.within(b.x, b.y, b.aimX, b.aimY, 6)))) {
          b.hit.add(build);
          build.damage(t.damage * t.buildingDamageMultiplier, b.owner);
          if (t.status === 'burning' && Math.random() < 0.3) Fx.create('burning', b.x, b.y);
          if (!t.pierceBuilding || (t.pierceCap > 0 && ++b.pierced >= t.pierceCap)) { this.hit(b, b.x, b.y); b.removed = true; return; }
        } else if (build.team === b.team && t.healPercent > 0 && build.health < build.maxHealth && !(build instanceof ConstructBuild)) {
          b.hit.add(build);
          build.heal(build.maxHealth * t.healPercent / 100);
          Fx.create('healBlockFull', build.x, build.y, build.block.size, Pal.heal);
          this.hit(b, b.x, b.y); b.removed = true; return;
        }
      }
    }
    if (b.time >= b.lifetime) {
      if (t.splashDamage > 0 || t.type === 'artillery' || t.type === 'bomb' || t.fragBullets) this.hit(b, b.x, b.y);
      else if (t.despawnEffect) Fx.create(t.despawnEffect, b.x, b.y, b.rotation, t.hitColor || t.backColor);
      b.removed = true;
    }
  },

  hitUnit(b, u) {
    const t = b.type;
    u.damage(t.damage);
    if (t.knockback) { u.vx += Angles.trnsx(b.rotation, t.knockback / Math.max(u.type.hitSize / 8, 1)); u.vy += Angles.trnsy(b.rotation, t.knockback / Math.max(u.type.hitSize / 8, 1)); }
    if (t.status === 'burning') u.burnTime = Math.max(u.burnTime, t.statusDuration);
  },

  hit(b, x, y) {
    const t = b.type;
    if (t.hitEffect) Fx.create(t.hitEffect, x, y, b.rotation, t.hitColor || t.backColor);
    if (t.hitSound) Audio2.play(t.hitSound, x, y, 0.5);
    if (t.hitShake) Render.shake(t.hitShake, t.hitShake * 3);
    if (t.splashDamageRadius > 0) {
      Damage.splash(b.team, x, y, t.splashDamageRadius, t.splashDamage, t.collidesAir, t.collidesGround, t.buildingDamageMultiplier);
      if (t.type === 'artillery' || t.type === 'bomb') Decals.add('scorch', x, y, Math.random() * 360, Math.min(t.splashDamageRadius / 30, 1.2), 0.5);
    }
    if (t.fragBullets && t.fragBullet) {
      for (let i = 0; i < t.fragBullets; i++) this.create(t.fragBullet, b.owner, b.team, x, y, Math.random() * 360, Mathf.random(0.2, 1), Mathf.random(0.75, 1.25));
    }
  },

  draw() {
    for (const b of this.list) {
      const t = b.type;
      if (t.trailLength > 0 && b.trail.length >= 4) {
        const c = t.trailColor || t.backColor;
        const n = b.trail.length / 2;
        for (let i = 1; i < n; i++) {
          Lines.set(rgba(c, i / n), t.trailWidth * (i / n));
          Lines.line(b.trail[(i - 1) * 2], b.trail[(i - 1) * 2 + 1], b.trail[i * 2], b.trail[i * 2 + 1]);
        }
        Lines.set(rgba(c, 1), t.trailWidth);
        Lines.line(b.trail[b.trail.length - 2], b.trail[b.trail.length - 1], b.x, b.y);
      }
      const fin = b.time / b.lifetime, fout = 1 - fin;
      switch (t.type) {
        case 'basic': case 'flak': case 'bomb': case 'artillery': {
          let w = t.width, h = t.height * ((1 - t.shrinkY) + t.shrinkY * fout);
          if (t.type === 'artillery') { const sc = 0.7 + Mathf.slope(fin) * 0.3; w *= sc; h *= sc; }
          if (!t._back) { t._back = Assets.tinted(t.sprite + '-back', t.backColor); t._front = Assets.tinted(t.sprite, t.frontColor); }
          Draw.rect(t._back, b.x, b.y, w, h, b.rotation - 90);
          Draw.rect(t._front, b.x, b.y, w, h, b.rotation - 90);
          break;
        }
        case 'bolt':
          Lines.set(t.backColor.css, t.width); Lines.lineAngleCenter(b.x, b.y, b.rotation, t.height);
          Lines.set(t.frontColor.css, t.width); Lines.lineAngleCenter(b.x, b.y, b.rotation, t.height / 2);
          break;
      }
    }
    for (const L of this.lasers) {
      const t = L.type;
      const fin = L.time / L.lifetime, fout = 1 - fin;
      const f = Mathf.clamp(fin / 0.2);
      const baseLen = L.len * f;
      let cwidth = t.width, compound = 1;
      for (const color of t.colors) {
        cwidth *= 0.5;
        const stroke = cwidth * fout;
        Lines.set(color, stroke);
        Lines.lineAngle(L.x, L.y, L.angle, baseLen);
        Fill.set(color);
        const ex = L.x + Angles.trnsx(L.angle, baseLen), ey = L.y + Angles.trnsy(L.angle, baseLen);
        Fill.triAngle(ex, ey, stroke, cwidth * 2 + t.width / 2, L.angle);
        Fill.circle(L.x, L.y, cwidth * fout);
        for (const i of [-1, 1]) Fill.triAngle(L.x, L.y, 0.7 * fout * cwidth, 29 * compound, L.angle + 90 * i);
        compound *= 0.5;
      }
    }
  },
};

function segDist(x1, y1, x2, y2, px, py) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Mathf.clamp(t);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const Damage = {
  splash(team, x, y, radius, damage, air, ground, buildingMul = 1) {
    for (const u of Game.units) {
      if (u.team === team || u.dead) continue;
      if (u.isFlying ? !air : !ground) continue;
      const dist = Math.max(0, Math.hypot(u.x - x, u.y - y) - u.type.hitSize / 2);
      if (dist > radius) continue;
      const amount = damage * Mathf.lerp(1 - dist / radius, 1, 0.4);
      u.damage(amount);
    }
    if (ground) {
      for (const b of Game.buildings) {
        if (b.team === team || b.dead) continue;
        if (!circleRect(x, y, radius, b)) continue;
        const dist = Math.max(0, Math.hypot(b.x - x, b.y - y) - b.hitSize / 2);
        b.damage(damage * buildingMul * Mathf.lerp(1 - dist / radius, 1, 0.4));
      }
    }
  },
};

const Lightning = {
  list: [],
  create(team, color, damage, x, y, rotation, length, type) {
    const pts = [x, y];
    const hitUnits = new Set(), hitBuilds = new Set();
    let cx = x, cy = y, rot = rotation;
    // home toward the closest ground target in front
    for (let i = 0; i < length / 2; i++) {
      const step = 6;
      const tgt = Targeting.closestUnit(team, cx, cy, 30, type.collidesAir, true);
      if (tgt) rot = Angles.moveToward(rot, Angles.angle(cx, cy, tgt.x, tgt.y), 15);
      rot += Mathf.range(25);
      cx += Angles.trnsx(rot, step); cy += Angles.trnsy(rot, step);
      pts.push(cx, cy);
      for (const u of Game.units) {
        if (u.team === team || u.dead || hitUnits.has(u)) continue;
        if (u.isFlying && !type.collidesAir) continue;
        if (Mathf.within(cx, cy, u.x, u.y, u.type.hitSize / 2 + 5)) { hitUnits.add(u); u.damage(damage); Fx.create('hitLancer', u.x, u.y, 0, color); }
      }
      const b = World.buildWorld(cx, cy);
      if (b && b.team !== team && !hitBuilds.has(b)) { hitBuilds.add(b); b.damage(damage * (type.buildingDamageMultiplier || 1)); }
      if (World.isWall(Math.round(cx / TS), Math.round(cy / TS))) break;
    }
    this.list.push({ pts, color, time: 0, lifetime: 10 });
  },
  update() {
    for (const l of this.list) l.time += Time.delta;
    this.list = this.list.filter(l => l.time < l.lifetime);
  },
  draw() {
    for (const l of this.list) {
      const fout = 1 - l.time / l.lifetime;
      Lines.set(l.color.css, 2.5 * fout + 0.5); Lines.polyline(l.pts);
      Lines.set('#fff', 1.2 * fout); Lines.polyline(l.pts);
    }
  },
};

// ================================================================ effects
let nextFxId = 1;
const FX = {};
function randLen(e, amount, length, cb, angle, range) {
  const r = makeRand(e.id * 31 + 7);
  for (let i = 0; i < amount; i++) {
    const a = angle === undefined ? r() * 360 : angle + (r() * 2 - 1) * range;
    const l = r() * length;
    cb(Angles.trnsx(a, l), Angles.trnsy(a, l), i);
  }
}
function lerpColorCss(a, b, t) { return lerpCol(a, b, Mathf.clamp(t)).css; }
function lerp3(a, b, c, t) { return t < 0.5 ? lerpColorCss(a, b, t * 2) : lerpColorCss(b, c, (t - 0.5) * 2); }
const lighterOrange = col('f6e096');

Object.assign(FX, {
  hitBulletColor: { life: 14, draw(e) {
    const c = e.color || Pal.bulletYellowBack;
    const s = Mathf.clamp(e.time / 7);
    Lines.set(lerpColorCss(Pal.white, c, e.fin), 0.5 + (1 - s));
    if (s < 1) Lines.circle(e.x, e.y, s * 5);
    Lines.set(lerpColorCss(Pal.white, c, e.fin), 0.5 + e.fout);
    randLen(e, 5, e.fin * 15, (x, y) => Lines.lineAngle(e.x + x, e.y + y, Angles.angle(0, 0, x, y), e.fout * 3 + 1));
  } },
  hitLaserColor: { life: 8, draw(e) {
    Lines.set((e.color || Pal.heal).css, e.fout * 1.5);
    randLen(e, 6, e.fin * 10, (x, y) => Lines.lineAngle(e.x + x, e.y + y, Angles.angle(0, 0, x, y), e.fout * 3 + 1));
  } },
  hitLancer: { life: 12, draw(e) {
    Lines.set('#fff', e.fout * 1.5);
    randLen(e, 8, Mathf.pow2Out(e.fin) * 17, (x, y) => Lines.lineAngle(e.x + x, e.y + y, Angles.angle(0, 0, x, y), e.fout * 4 + 1));
  } },
  hitFlameSmall: { life: 14, draw(e) {
    Lines.set(lerpColorCss(Pal.lightFlame, Pal.darkFlame, e.fin), 0.5 + e.fout);
    randLen(e, 2, 1 + e.fin * 15, (x, y) => Lines.lineAngle(e.x + x, e.y + y, Angles.angle(0, 0, x, y), e.fout * 3 + 1), e.rotation, 50);
  } },
  shootSmall: { life: 8, draw(e) {
    Fill.set(lerpColorCss(lighterOrange, Pal.lightOrange, e.fin));
    const w = 1 + 5 * e.fout;
    Fill.triAngle(e.x, e.y, w, 15 * e.fout, e.rotation); Fill.triAngle(e.x, e.y, w, 3 * e.fout, e.rotation + 180);
  } },
  shootSmallColor: { life: 8, draw(e) {
    Fill.set(lerpColorCss(e.color || Pal.white, Pal.white, e.fin * 0.5));
    const w = 1 + 5 * e.fout;
    Fill.triAngle(e.x, e.y, w, 15 * e.fout, e.rotation); Fill.triAngle(e.x, e.y, w, 3 * e.fout, e.rotation + 180);
  } },
  shootBig: { life: 9, draw(e) {
    Fill.set(lerpColorCss(lighterOrange, Pal.lightOrange, e.fin));
    const w = 1.2 + 7 * e.fout;
    Fill.triAngle(e.x, e.y, w, 25 * e.fout, e.rotation); Fill.triAngle(e.x, e.y, w, 4 * e.fout, e.rotation + 180);
  } },
  shootSmallSmoke: { life: 20, draw(e) {
    Fill.set(lerp3(lighterOrange, Pal.lightishGray, Pal.gray, e.fin));
    randLen(e, 5, Mathf.pow2Out(e.fin) * 6, (x, y) => Fill.circle(e.x + x, e.y + y, e.fout * 1.5), e.rotation, 20);
  } },
  shootSmallFlame: { life: 32, draw(e) {
    Fill.set(lerp3(Pal.lightFlame, Pal.darkFlame, Pal.gray, e.fin));
    randLen(e, 8, Mathf.pow2Out(e.fin) * 60, (x, y) => Fill.circle(e.x + x, e.y + y, 0.65 + e.fout * 1.5), e.rotation, 10);
  } },
  flameParticle: { life: 16, draw(e) {
    Fill.set(lerp3(Pal.lightFlame, Pal.darkFlame, Pal.gray, e.fin));
    Draw.setAlpha(e.fout);
    Fill.circle(e.x, e.y, 0.8 + e.fout * 2);
    Draw.setAlpha(1);
  } },
  casing1: { life: 30, draw(e) { drawCasing(e, 1, 2); } },
  casing2: { life: 34, draw(e) { drawCasing(e, 2, 3); } },
  flakExplosion: { life: 20, draw(e) {
    const s = Mathf.clamp(e.time / 6);
    if (s < 1) { Lines.set(Pal.bulletYellow.css, 3 * (1 - s)); Lines.circle(e.x, e.y, 3 + s * 10); }
    Fill.set('#7f7f7f');
    randLen(e, 5, 2 + 23 * Mathf.pow2Out(e.fin), (x, y) => Fill.circle(e.x + x, e.y + y, e.fout * 3 + 0.5));
    Lines.set(lighterOrange.css, e.fout);
    randLen({ id: e.id + 1 }, 4, 1 + 23 * Mathf.pow2Out(e.fin), (x, y) => Lines.lineAngle(e.x + x, e.y + y, Angles.angle(0, 0, x, y), 1 + e.fout * 3));
  } },
  blastExplosion: { life: 22, draw(e) {
    const s = Mathf.clamp(e.time / 6);
    if (s < 1) { Lines.set(Pal.missileYellow ? Pal.missileYellow.css : '#ffd2ae', 3 * (1 - s)); Lines.circle(e.x, e.y, 3 + s * 15); }
    Fill.set('#7f7f7f');
    randLen(e, 6, 2 + 28 * Mathf.pow2Out(e.fin), (x, y) => Fill.circle(e.x + x, e.y + y, e.fout * 3.5 + 0.5));
    Lines.set(Pal.lightOrange.css, e.fout);
    randLen({ id: e.id + 1 }, 4, 1 + 25 * Mathf.pow2Out(e.fin), (x, y) => Lines.lineAngle(e.x + x, e.y + y, Angles.angle(0, 0, x, y), 1 + e.fout * 3));
  } },
  unitExplode: { life: 40, draw(e) {
    const size = (e.data || 8) / 8;
    const s = Mathf.clamp(e.time / 10);
    if (s < 1) { Lines.set('#ffd2ae', 3 * (1 - s) * size); Lines.circle(e.x, e.y, (4 + s * 14) * size); }
    Fill.set(lerpColorCss(col('a0a0a0'), col('505050'), e.fin));
    Draw.setAlpha(e.fout);
    randLen(e, Math.round(4 + size * 4), (4 + 20 * Mathf.pow2Out(e.fin)) * size, (x, y) => Fill.circle(e.x + x, e.y + y, (e.fout * 3 + 0.8) * Math.sqrt(size)));
    Draw.setAlpha(1);
    Lines.set(lerpColorCss(Pal.lightFlame, Pal.darkFlame, e.fin), e.fout * 1.5);
    randLen({ id: e.id + 3 }, Math.round(5 + size * 3), (2 + 26 * Mathf.pow2Out(e.fin)) * size, (x, y) => Lines.lineAngle(e.x + x, e.y + y, Angles.angle(0, 0, x, y), 1 + e.fout * 4));
  } },
  // Fx.dynamicExplosion
  blockExplode: { life: 50, draw(e) {
    const it = Math.max(1, (e.data || 1) * 0.7);
    const sc = Mathf.clamp(e.time / (5 + it * 2));
    if (sc < 1) { Lines.set(lighterOrange.css, (3.1 + it / 5) * (1 - sc)); Lines.circle(e.x, e.y, (3 + sc * 14) * it); }
    const fp = Mathf.pow2Out(e.fin);
    Fill.set('#7f7f7f');
    randLen(e, Math.round(6 * it), 21 * it * fp, (x, y) => { Fill.circle(e.x + x, e.y + y, e.fout * (2 + it) * 1.2 + 0.5); Fill.circle(e.x + x / 2, e.y + y / 2, e.fout * it * 1.2); });
    Lines.set(lerp3(lighterOrange, Pal.lightOrange, col('7f7f7f'), e.fin), 1.7 * e.fout * (1 + (it - 1) / 2));
    randLen({ id: e.id + 1 }, Math.round(9 * it), 40 * it * fp + 0.01, (x, y) => Lines.lineAngle(e.x + x, e.y + y, Angles.angle(0, 0, x, y), 1 + e.fout * 4 * (1 + it / 3)));
  } },
  pulverize: { life: 40, draw(e) {
    Fill.set(Pal.stoneGray.css);
    randLen(e, 5, 3 + e.fin * 8, (x, y) => Fill.square(e.x + x, e.y + y, e.fout * 2 + 0.5, 45));
  } },
  pulverizeMedium: { life: 30, draw(e) {
    Fill.set((e.color || Pal.stoneGray).css);
    randLen(e, 5, 3 + e.fin * 8, (x, y) => Fill.square(e.x + x, e.y + y, e.fout + 0.5, 45));
  } },
  smeltsmoke: { life: 15, draw(e) {
    Fill.set(lerpColorCss(Pal.white, e.color || Pal.white, e.fin));
    randLen(e, 6, 4 + e.fin * 5, (x, y) => Fill.square(e.x + x, e.y + y, 0.5 + e.fout, 45));
  } },
  smokeSmall: { life: 40, draw(e) {
    Fill.set(rgba(col('6e6e6e'), 0.6 * e.fout));
    Fill.circle(e.x + e.fin * 2, e.y + e.fin * 7, 0.5 + e.fin * 2.2);
  } },
  generatespark: { life: 18, draw(e) {
    Fill.set(lerpColorCss(Pal.orangeSpark, col('7f7f7f'), e.fin));
    randLen(e, 2, Mathf.pow2Out(e.fin) * 4, (x, y) => Fill.circle(e.x + x, e.y + y, e.fout * 1.5));
  } },
  fuelburn: { life: 20, draw(e) {
    Fill.set(lerpColorCss(Pal.lightOrange, col('7f7f7f'), e.fin));
    randLen(e, 2, e.fin * 5, (x, y) => Fill.circle(e.x + x, e.y + y, 0.1 + e.fout * 1.4));
  } },
  burning: { life: 35, draw(e) {
    Fill.set(lerpColorCss(Pal.lightFlame, Pal.darkFlame, e.fin));
    randLen(e, 3, 2 + e.fin * 7, (x, y) => Fill.circle(e.x + x, e.y + y, 0.1 + e.fout * 1.4));
  } },
  fallSmoke: { life: 110, draw(e) {
    Fill.set(rgba(col('5a5a5a'), 0.5 * e.fout));
    randLen(e, 4, e.fin * 14, (x, y) => Fill.circle(e.x + x, e.y + y - e.fin * 4, 1 + e.fin * 4));
  } },
  drillDust: { life: 25, draw(e) {
    Fill.set((e.color || Pal.stoneGray).css);
    Draw.setAlpha(e.fout);
    Fill.square(e.x, e.y + e.fin * 3, e.fout * 1.2 + 0.3, 45);
    Draw.setAlpha(1);
  } },
  healBlockFull: { life: 20, draw(e) {
    Fill.set(rgba(e.color || Pal.heal, e.fout * 0.6));
    Fill.square(e.x, e.y, e.rotation * TS / 2);
  } },
  placeBlock: { life: 16, draw(e) {
    Lines.set(Pal.accent.css, 3 - e.fin * 2);
    Lines.square(e.x, e.y, TS / 2 * e.rotation + e.fin * 3);
  } },
  breakBlock: { life: 12, draw(e) {
    Lines.set(Pal.remove.css, 3 - e.fin * 2);
    Lines.square(e.x, e.y, TS / 2 * e.rotation + e.fin * 3);
    Fill.set(Pal.remove.css);
    randLen(e, 3 + Math.round(e.rotation * 3), e.rotation * 2 + (TS * e.rotation) * Mathf.pow2Out(e.fin), (x, y) => Fill.square(e.x + x, e.y + y, 1 + e.fout * (3 + e.rotation)));
  } },
  lancerCharge: { life: 40, draw(e) {
    const owner = e.data;
    let x = e.x, y = e.y, rot = e.rotation;
    if (owner && !owner.dead) { [x, y] = owner.bulletPos(0); rot = owner.turretRotation; }
    Lines.set(Pal.lancerLaser.css, 1);
    randLen(e, 2, 1 + 20 * e.fout, (vx, vy) => Lines.lineAngle(x + vx, y + vy, Angles.angle(0, 0, vx, vy), Mathf.slope(e.fin) * 3 + 1), rot, 120);
    Fill.set(Pal.lancerLaser.css); Fill.circle(x, y, e.fin * 3);
    Fill.set('#fff'); Fill.circle(x, y, e.fin * 2);
  } },
  unitSpawn: { life: 30, draw(e) {
    Lines.set((e.color || Pal.accent).css, e.fout * 2);
    Lines.poly(e.x, e.y, 4, 4 + e.fin * 10, 45 + e.fin * 90);
  } },
  spawnShockwave: { life: 80, draw(e) {
    Lines.set(rgba(Teams.crux.color, e.fout), e.fout * 4 + 0.5);
    Lines.circle(e.x, e.y, 10 + e.fin * (e.data || 120));
  } },
  mineSpark: { life: 20, draw(e) {
    Fill.set((e.color || Pal.accent).css);
    randLen(e, 3, e.fin * 6, (x, y) => Fill.square(e.x + x, e.y + y, e.fout * 1.2 + 0.2, 45));
  } },
  itemTransfer: { life: 24, draw(e) {
    const d = e.data;
    const f = Mathf.pow3Out ? Mathf.pow3Out(e.fin) : e.fin;
    const x = Mathf.lerp(e.x, d.tx, f), y = Mathf.lerp(e.y, d.ty, f) + Math.sin(e.fin * Math.PI) * 8;
    Draw.rect(d.item.icon, x, y, 4 * (1 - e.fin * 0.3), 4 * (1 - e.fin * 0.3));
  } },
  coreFlash: { life: 30, draw(e) {
    Lines.set(rgba(Pal.accent, e.fout), 2 * e.fout);
    Lines.square(e.x, e.y, e.rotation * TS / 2 + e.fin * 6);
  } },
  ripple: { life: 30, draw(e) {
    Lines.set(rgba(col('a7c7ff'), e.fout * 0.6), e.fout * 1.2);
    Lines.circle(e.x, e.y, 2 + e.fin * 6);
  } },
});

function drawCasing(e, w, h) {
  Fill.set(lerp3(Pal.lightOrange, col('d3d3d3'), Pal.lightishGray, e.fin));
  Draw.setAlpha(Mathf.clamp(e.fout / 0.3));
  const rot = Math.abs(e.rotation) + 90;
  const i = -Math.sign(e.rotation || 1);
  const len = (2 + Mathf.pow2Out(e.fin) * 6) * i;
  const lr = rot + e.fin * 30 * i;
  Fill.square(e.x + Angles.trnsx(lr, len), e.y + Angles.trnsy(lr, len), w * 0.5, rot + e.fin * 50 * i);
  Draw.setAlpha(1);
}

const Fx = {
  list: [],
  create(name, x, y, rotation = 0, color = null, data = null) {
    if (!name || !FX[name]) return;
    // cull far-away effects
    const v = Render.view();
    if (x < v.x1 - 60 || x > v.x2 + 60 || y < v.y1 - 60 || y > v.y2 + 60) return;
    if (this.list.length > 1200) return;
    this.list.push({ name, x, y, rotation, color, data, time: 0, lifetime: FX[name].life, id: nextFxId++ });
  },
  update() {
    for (const e of this.list) e.time += Time.delta;
    this.list = this.list.filter(e => e.time < e.lifetime);
  },
  draw() {
    for (const e of this.list) {
      e.fin = e.time / e.lifetime; e.fout = 1 - e.fin;
      FX[e.name].draw(e);
    }
    Draw.reset();
  },
};

// ================================================================ decals (scorch, rubble)
const Decals = {
  list: [],
  scorches: [],
  init() {
    // procedurally generated scorch marks (Mindustry generates these at runtime too)
    for (let s = 0; s < 4; s++) {
      const n = makeNoise(500 + s);
      const size = 48;
      const c = document.createElement('canvas'); c.width = size; c.height = size;
      const g = c.getContext('2d');
      const img = g.createImageData(size, size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const dx = x - size / 2, dy = y - size / 2;
        const d = Math.hypot(dx, dy) / (size / 2);
        const v = 1 - d + n(x / 6, y / 6) * 0.35;
        if (v > 0.25) {
          const o = (y * size + x) * 4;
          img.data[o] = 30; img.data[o + 1] = 26; img.data[o + 2] = 24;
          img.data[o + 3] = Math.min(200, (v - 0.25) * 420);
        }
      }
      g.putImageData(img, 0, 0);
      this.scorches.push(Assets.register('scorch-' + s, c));
    }
  },
  add(kind, x, y, rot = 0, scale = 1, alpha = 1) {
    let region;
    if (kind === 'scorch') region = this.scorches[Math.floor(Math.random() * this.scorches.length)];
    else region = Assets.get(kind);
    this.list.push({ region, x, y, rot, scale, alpha, time: 0, lifetime: kind === 'scorch' ? 60 * 60 * 2 : 60 * 60 * 4 });
    if (this.list.length > 400) this.list.shift();
  },
  update() {
    for (const d of this.list) d.time += Time.delta;
    if (Math.random() < 0.01) this.list = this.list.filter(d => d.time < d.lifetime);
  },
  draw() {
    const v = Render.view();
    for (const d of this.list) {
      if (d.x < v.x1 - 40 || d.x > v.x2 + 40 || d.y < v.y1 - 40 || d.y > v.y2 + 40) continue;
      const a = Mathf.clamp((d.lifetime - d.time) / 600) * d.alpha;
      if (a <= 0) continue;
      Draw.setAlpha(a);
      Draw.rect(d.region, d.x, d.y, d.region.ww * d.scale, d.region.wh * d.scale, d.rot);
    }
    Draw.setAlpha(1);
  },
};
