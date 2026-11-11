// Asset loading: atlas regions, derived (tinted / silhouette / team) regions, sounds, music.

class Region {
  // img: HTMLImageElement or canvas. world size = pixels / 4 (Mindustry Draw.scl = 0.25)
  constructor(img, x, y, w, h, name) {
    this.img = img; this.x = x; this.y = y; this.w = w; this.h = h; this.name = name;
    this.ww = w / 4; this.wh = h / 4;
  }
  // extract this region to its own canvas
  toCanvas() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    c.getContext('2d').drawImage(this.img, this.x, this.y, this.w, this.h, 0, 0, this.w, this.h);
    return c;
  }
}

const Assets = {
  pages: [],
  regions: {},
  derived: new Map(),
  sounds: {},
  musicTracks: [],
  error: null,

  async load() {
    this.pages = await Promise.all(ASSETS.pages.map(uri => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = uri;
    })));
    for (const [name, [p, x, y, w, h]] of Object.entries(ASSETS.regions)) {
      this.regions[name] = new Region(this.pages[p], x, y, w, h, name);
    }
  },

  has(name) { return !!this.regions[name]; },

  get(name) {
    const r = this.regions[name];
    if (!r) {
      if (!this._warned) this._warned = new Set();
      if (!this._warned.has(name)) { this._warned.add(name); console.warn('missing region', name); }
      return this.regions['white'];
    }
    return r;
  },

  register(name, canvas) {
    const r = new Region(canvas, 0, 0, canvas.width, canvas.height, name);
    this.regions[name] = r;
    return r;
  },

  // Multiply-tinted copy of a region (Draw.color equivalent). Cached.
  tinted(name, color) {
    const key = name + '|' + color.hex;
    let r = this.derived.get(key);
    if (r) return r;
    const src = this.get(name);
    const c = src.toCanvas();
    const g = c.getContext('2d');
    const data = g.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i] * color.r / 255; d[i + 1] = d[i + 1] * color.g / 255; d[i + 2] = d[i + 2] * color.b / 255;
    }
    g.putImageData(data, 0, 0);
    r = new Region(c, 0, 0, c.width, c.height, key);
    r.ww = src.ww; r.wh = src.wh;
    this.derived.set(key, r);
    return r;
  },

  // Solid-color silhouette (for hit flash, shadows, heat glow).
  silhouette(name, color) {
    const key = name + '|sil|' + color.hex;
    let r = this.derived.get(key);
    if (r) return r;
    const src = this.get(name);
    const c = src.toCanvas();
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color.css;
    g.fillRect(0, 0, c.width, c.height);
    r = new Region(c, 0, 0, c.width, c.height, key);
    r.ww = src.ww; r.wh = src.wh;
    this.derived.set(key, r);
    return r;
  },

  // Team palette swap: team sprites use white / dcc6c6 / 9d7f7f as palette slots.
  team(name, team) {
    const key = name + '|team|' + team.name;
    let r = this.derived.get(key);
    if (r) return r;
    const src = this.get(name);
    const c = src.toCanvas();
    const g = c.getContext('2d');
    const data = g.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    const pal = team.palette;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const v = d[i];
      const slot = v > 240 ? 0 : v > 190 ? 1 : 2;
      const shade = slot === 0 ? v / 255 : slot === 1 ? v / 220 : v / 157;
      d[i] = Math.min(255, pal[slot].r * shade); d[i + 1] = Math.min(255, pal[slot].g * shade); d[i + 2] = Math.min(255, pal[slot].b * shade);
    }
    g.putImageData(data, 0, 0);
    r = new Region(c, 0, 0, c.width, c.height, key);
    r.ww = src.ww; r.wh = src.wh;
    this.derived.set(key, r);
    return r;
  },

  // Composite several regions (drawn centered) into one icon region.
  composite(name, layers, size) {
    let px = size * 32;
    for (const l of layers) { const lr = typeof l === 'string' ? this.get(l) : l; px = Math.max(px, lr.w, lr.h); }
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (const l of layers) {
      const lr = typeof l === 'string' ? this.get(l) : l;
      g.drawImage(lr.img, lr.x, lr.y, lr.w, lr.h, (px - lr.w) / 2, (px - lr.h) / 2, lr.w, lr.h);
    }
    return this.register(name, c);
  },

  // average color of a region (minimap)
  avgColor(name) {
    const c = this.get(name).toCanvas();
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    n = Math.max(n, 1);
    return [r / n | 0, g / n | 0, b / n | 0];
  },

  // region -> data URL for DOM <img>
  url(name) {
    const key = 'url|' + name;
    if (this.derived.has(key)) return this.derived.get(key);
    const u = this.get(name).toCanvas().toDataURL();
    this.derived.set(key, u);
    return u;
  },
};

// ---------------------------------------------------------------- audio
const Audio2 = {
  ctx: null, buffers: {}, sfxVol: 0.7, musicVol: 0.5, master: null,
  music: null, musicIndex: 0, lastPlay: {},

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.sfxVol;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; return; }
    for (const [name, uri] of Object.entries(ASSETS.sounds)) {
      try {
        const bin = atob(uri.split(',')[1]);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        this.ctx.decodeAudioData(buf.buffer).then(b => { this.buffers[name] = b; }).catch(() => {});
      } catch (e) { /* unsupported */ }
    }
  },

  setSfx(v) { this.sfxVol = v; if (this.master) this.master.gain.value = v; },
  setMusic(v) { this.musicVol = v; if (this.music) this.music.volume = v * 0.6; },

  // play at world position (attenuated by distance to camera); x undefined = UI sound
  play(name, x, y, vol = 1, pitch = 1) {
    if (!this.ctx || !this.buffers[name] || this.sfxVol <= 0) return;
    const now = this.ctx.currentTime;
    // limit spam of the same sound
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.035) return;
    this.lastPlay[name] = now;
    let pan = 0;
    if (x !== undefined) {
      const dx = x - Render.camX, dy = y - Render.camY;
      const dist = Math.hypot(dx, dy);
      const range = 420 / Math.max(Render.zoom / 3, 0.5);
      const fall = Mathf.clamp(1 - dist / range);
      vol *= fall * fall;
      if (vol < 0.02) return;
      pan = Mathf.clamp(dx / range, -1, 1) * 0.7;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.playbackRate.value = pitch * (0.92 + Math.random() * 0.16);
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    let node = gain;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      gain.connect(p); node = p;
    }
    src.connect(gain);
    node.connect(this.master);
    src.start();
  },

  startMusic() {
    if (this.music || !ASSETS.music.length) return;
    this.musicIndex = Math.floor(Math.random() * ASSETS.music.length);
    const next = () => {
      const a = new Audio(ASSETS.music[this.musicIndex % ASSETS.music.length]);
      this.musicIndex++;
      a.volume = this.musicVol * 0.6;
      a.onended = () => { this.music = null; setTimeout(() => { if (!this.stopped) next(); }, 20000 + Math.random() * 30000); };
      this.music = a;
      a.play().catch(() => {});
    };
    this.stopped = false;
    next();
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
};
