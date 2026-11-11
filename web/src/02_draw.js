// Drawing API modelled on arc's Draw/Lines/Fill, on top of Canvas2D with a y-up world.

const Render = {
  canvas: null, ctx: null, W: 0, H: 0, dpr: 1,
  camX: 0, camY: 0, zoom: 3.5, targetZoom: 3.5,
  shakeTime: 0, shakeIntensity: 0,
  ox: 0, oy: 0,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.floor(window.innerWidth * this.dpr);
    this.H = Math.floor(window.innerHeight * this.dpr);
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.ctx.imageSmoothingEnabled = false;
  },

  // zoom is in device pixels per world unit
  get z() { return this.zoom * this.dpr; },

  begin() {
    let sx = 0, sy = 0;
    if (this.shakeTime > 0) {
      sx = Mathf.range(this.shakeIntensity); sy = Mathf.range(this.shakeIntensity);
    }
    const z = this.z;
    this.ox = Math.round(this.W / 2 - (this.camX + sx) * z);
    this.oy = Math.round(this.H / 2 + (this.camY + sy) * z);
    this.base();
  },

  base() { this.ctx.setTransform(this.z, 0, 0, -this.z, this.ox, this.oy); },

  shake(intensity, duration) {
    this.shakeIntensity = Math.max(this.shakeIntensity * (this.shakeTime > 0 ? 1 : 0), intensity);
    this.shakeTime = Math.max(this.shakeTime, duration);
  },

  screenToWorld(sx, sy) {
    const z = this.z;
    return [(sx * this.dpr - this.ox) / z, -(sy * this.dpr - this.oy) / z];
  },
  worldToScreen(wx, wy) {
    const z = this.z;
    return [(wx * z + this.ox) / this.dpr, (-wy * z + this.oy) / this.dpr];
  },

  // visible world rect
  view() {
    const z = this.z;
    const hw = this.W / 2 / z, hh = this.H / 2 / z;
    return { x1: this.camX - hw, y1: this.camY - hh, x2: this.camX + hw, y2: this.camY + hh };
  },
};

const Draw = {
  alpha: 1,

  setAlpha(a) { this.alpha = a; Render.ctx.globalAlpha = a; },
  reset() { this.alpha = 1; Render.ctx.globalAlpha = 1; Render.ctx.globalCompositeOperation = 'source-over'; },
  additive(on) { Render.ctx.globalCompositeOperation = on ? 'lighter' : 'source-over'; },

  // Draw a region centered at (x,y), size w*h world units, rotation in degrees (CCW).
  rect(reg, x, y, w, h, rot) {
    if (typeof reg === 'string') reg = Assets.get(reg);
    if (w === undefined) { w = reg.ww; h = reg.wh; }
    const ctx = Render.ctx, z = Render.z;
    let a, b, c, d;
    if (rot) {
      const cs = Math.cos(rot * DEG), sn = Math.sin(rot * DEG);
      a = z * cs; b = -z * sn; c = z * sn; d = z * cs;
    } else { a = z; b = 0; c = 0; d = z; }
    if (w < 0) { a = -a; b = -b; w = -w; }
    if (h < 0) { c = -c; d = -d; h = -h; }
    // image-local (p, q-down) -> world (x,y) + R(rot)*(p,-q) -> screen; keeps sprites upright in a y-up world
    ctx.setTransform(a, b, c, d, z * x + Render.ox, Render.oy - z * y);
    ctx.drawImage(reg.img, reg.x, reg.y, reg.w, reg.h, -w / 2, -h / 2, w, h);
  },

  // Region with its region-sized world size, scaled
  rectScl(reg, x, y, scl, rot) {
    if (typeof reg === 'string') reg = Assets.get(reg);
    this.rect(reg, x, y, reg.ww * scl, reg.wh * scl, rot);
  },

  // stretched line using a region (lasers, bridges): region drawn from (x1,y1) to (x2,y2), thickness world units
  lineRegion(reg, x1, y1, x2, y2, thick) {
    if (typeof reg === 'string') reg = Assets.get(reg);
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.01) return;
    this.rect(reg, (x1 + x2) / 2, (y1 + y2) / 2, len, thick, Angles.angle(x1, y1, x2, y2));
  },

  // Mindustry Drawf.laser: line + end caps
  laser(x1, y1, x2, y2, scale = 1, colorObj) {
    const line = colorObj ? Assets.tinted('laser', colorObj) : Assets.get('laser');
    const end = colorObj ? Assets.tinted('laser-end', colorObj) : Assets.get('laser-end');
    const ang = Angles.angle(x1, y1, x2, y2);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const t = line.wh * scale;
    this.rect(line, (x1 + x2) / 2, (y1 + y2) / 2, len, t, ang);
    this.rect(end, x1, y1, end.ww * scale, end.wh * scale, ang + 180);
    this.rect(end, x2, y2, end.ww * scale, end.wh * scale, ang);
  },
};

const Fill = {
  color: '#fff',
  set(cssColor) { this.color = cssColor; Render.ctx.fillStyle = cssColor; },
  circle(x, y, r) {
    const ctx = Render.ctx; Render.base();
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(x, y, Math.max(r, 0), 0, Math.PI * 2); ctx.fill();
  },
  rect(x, y, w, h) { // centered
    const ctx = Render.ctx; Render.base();
    ctx.fillStyle = this.color;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
  },
  square(x, y, half, rot = 0) {
    const ctx = Render.ctx; Render.base();
    ctx.fillStyle = this.color;
    if (!rot) { ctx.fillRect(x - half, y - half, half * 2, half * 2); return; }
    this.poly(x, y, 4, half * Math.SQRT2, rot + 45);
  },
  poly(x, y, sides, radius, rot = 0) {
    const ctx = Render.ctx; Render.base();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (rot + i * 360 / sides) * DEG;
      const px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  },
  tri(x1, y1, x2, y2, x3, y3) {
    const ctx = Render.ctx; Render.base();
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
  },
  quad(pts) {
    const ctx = Render.ctx; Render.base();
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath(); ctx.fill();
  },
  // Mindustry Drawf.tri: triangle extending from x,y at angle
  triAngle(x, y, width, length, angle) {
    const wx = Angles.trnsx(angle + 90, width), wy = Angles.trnsy(angle + 90, width);
    this.tri(x + wx, y + wy, x - wx, y - wy, x + Angles.trnsx(angle, length), y + Angles.trnsy(angle, length));
  },
};

const Lines = {
  stroke: 1, color: '#fff',
  set(css, stroke) { this.color = css; if (stroke !== undefined) this.stroke = stroke; },
  _prep() {
    const ctx = Render.ctx; Render.base();
    ctx.strokeStyle = this.color; ctx.lineWidth = this.stroke; ctx.lineCap = 'butt';
    return ctx;
  },
  line(x1, y1, x2, y2, cap = false) {
    const ctx = this._prep();
    if (cap) ctx.lineCap = 'square';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  },
  lineAngle(x, y, angle, len) { this.line(x, y, x + Angles.trnsx(angle, len), y + Angles.trnsy(angle, len)); },
  lineAngleCenter(x, y, angle, len) {
    const dx = Angles.trnsx(angle, len / 2), dy = Angles.trnsy(angle, len / 2);
    this.line(x - dx, y - dy, x + dx, y + dy);
  },
  circle(x, y, r) {
    const ctx = this._prep();
    ctx.beginPath(); ctx.arc(x, y, Math.max(r, 0), 0, Math.PI * 2); ctx.stroke();
  },
  poly(x, y, sides, r, rot = 0) {
    const ctx = this._prep();
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = (rot + i * 360 / sides) * DEG;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  },
  square(x, y, half, rot = 0) { this.poly(x, y, 4, half * Math.SQRT2, rot + 45); },
  rect(x, y, w, h) { // bottom-left corner
    const ctx = this._prep();
    ctx.strokeRect(x, y, w, h);
  },
  dashCircle(x, y, r, t = 0) {
    const ctx = this._prep();
    const segs = Math.max(8, Math.floor(r / 4)) * 2;
    for (let i = 0; i < segs; i += 2) {
      const a1 = (i / segs) * Math.PI * 2 + t, a2 = ((i + 1) / segs) * Math.PI * 2 + t;
      ctx.beginPath(); ctx.arc(x, y, r, a1, a2); ctx.stroke();
    }
  },
  polyline(pts) {
    const ctx = this._prep();
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  },
};
