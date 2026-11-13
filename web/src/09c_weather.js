// Weather (content/Weathers.java, type/Weather.java, ParticleWeather, RainWeather): rain, snow, sandstorm, spore storm, fog.
// Each map gets the weathers its biome allows (WeatherEntry: frequency 2x-6x duration, duration 0.5x-1.5x).
// Effects: status (rain -> wet, spore storm -> spore-slowed on air units), wind force, and environment attributes
// (light for solar panels, water for water extractors, spores for cultivators).

STATUS.sporeSlowed = { speedMultiplier: 0.8, healthMultiplier: 1, color: col('7457ce') };
const MIN = 60 * 60;
const WEATHER_DEFS = {
  rain: { title: 'Rain', duration: 10 * MIN, attrs: { light: -0.2, water: 0.2 }, status: 'wet', statusAir: true, statusGround: true, sound: 'rain', soundVol: 0.25 },
  snowing: { title: 'Snow', duration: 10 * MIN, attrs: { light: -0.15 }, sound: 'windHowl', soundVol: 0.04, particles: { color: col('ffffff'), sizeMin: 2.6, sizeMax: 13, minAlpha: 1, maxAlpha: 1, density: 1200, speed: 6.1, dir: [0.4, -1] } },
  sandstorm: { title: 'Sandstorm', duration: 7 * MIN, attrs: { light: -0.1, water: -0.1 }, force: 0.1, wind: true, sound: 'wind', soundVol: 0.8,
    particles: { color: col('f7cba4'), sizeMin: 70, sizeMax: 140, minAlpha: 0, maxAlpha: 0.2, density: 1500, speed: 5.4 }, noise: { color: col('f7cba4'), scale: 2000, alpha: 0.35 } },
  sporestorm: { title: 'Spore storm', duration: 7 * MIN, attrs: { spores: 1, light: -0.15 }, status: 'sporeSlowed', statusAir: true, statusGround: false, force: 0.1, wind: true, sound: 'wind', soundVol: 0.7,
    particles: { color: col('7457ce'), sizeMin: 2.5, sizeMax: 5, minAlpha: 0.1, maxAlpha: 0.8, density: 2000, speed: 4.3, circle: true }, noise: { color: col('7457ce'), scale: 2000, alpha: 0.5 } },
  fog: { title: 'Fog', duration: 15 * MIN, attrs: { light: -0.3, water: 0.05 }, fog: true },
};

const Weather = {
  active: [], entries: [], statusTimer: 0,
  setup(seed) {
    // which weathers this map gets, from its floors
    const n = { snow: 0, sand: 0, moss: 0 }, N = World.w * World.h;
    for (let i = 0; i < N; i++) {
      const f = FLOOR_DEFS[World.floor[i]].name;
      if (f === 'snow' || f === 'ice') n.snow++; else if (f === 'sand-floor' || f === 'darksand') n.sand++; else if (f === 'moss') n.moss++;
    }
    // like a sector: rain and fog anywhere, plus the one storm that fits the map's main biome
    const kinds = ['rain', 'fog'];
    const biome = [['snowing', n.snow / N / 0.12], ['sandstorm', n.sand / N / 0.12], ['sporestorm', n.moss / N / 0.04]].sort((a, b) => b[1] - a[1])[0];
    if (biome[1] >= 1) kinds.push(biome[0]);
    const rand = makeRand((seed * 48271 + 11) >>> 0);
    this.rand = rand;
    this.entries = kinds.map(k => {
      const d = WEATHER_DEFS[k].duration;
      // first occurrence comes sooner than the regular interval so it actually shows up in a session
      return { name: k, minF: d * 2, maxF: d * 6, minD: d / 2, maxD: d * 1.5, cooldown: d * (0.25 + rand() * 1.5) };
    });
    this.active = [];
  },
  start(name, duration, intensity = 1) {
    const def = WEATHER_DEFS[name];
    const a = this.rand ? this.rand() * 360 : Math.random() * 360;
    const w = { name, life: duration, total: duration, intensity, opacity: 0, wind: [Math.cos(a * DEG), Math.sin(a * DEG)] };
    this.active.push(w);
    if (Game.state !== 'title') UI.toast(`${def.title} started`, 2);
    return w;
  },
  update() {
    const dt = Time.delta;
    for (const e of this.entries) {
      if (this.active.some(w => w.name === e.name)) continue;
      e.cooldown -= dt;
      if (e.cooldown <= 0) {
        const r = this.rand || Math.random;
        this.start(e.name, e.minD + r() * (e.maxD - e.minD));
        e.cooldown = e.minF + r() * (e.maxF - e.minF);
      }
    }
    for (const w of this.active) {
      w.life -= dt;
      w.opacity = Mathf.approach(w.opacity, w.life > 0 ? 1 : 0, dt / 300); // ~5s fade in / out
      const def = WEATHER_DEFS[w.name], k = w.intensity * w.opacity;
      if (def.force && k > 0) {
        for (const u of Game.units) {
          if (u.dead) continue;
          const mass = u.hitSize * u.hitSize * Math.PI; // Unit.impulse divides by mass
          u.vx += w.wind[0] * def.force * k * dt / mass; u.vy += w.wind[1] * def.force * k * dt / mass;
        }
      }
    }
    if (this.active.some(w => w.life <= 0 && w.opacity <= 0.001)) {
      for (const w of this.active) if (w.life <= 0 && w.opacity <= 0.001 && Game.state !== 'title') UI.toast(`${WEATHER_DEFS[w.name].title} ended`, 1.5);
      this.active = this.active.filter(w => !(w.life <= 0 && w.opacity <= 0.001));
    }
    // weather status effects (Weather.updateEffect: reapplied every statusDuration)
    if ((this.statusTimer -= dt) <= 0) {
      this.statusTimer = 115;
      for (const w of this.active) {
        const def = WEATHER_DEFS[w.name];
        if (!def.status || w.opacity < 0.5) continue;
        for (const u of Game.units) if (!u.dead && (u.isFlying ? def.statusAir : def.statusGround)) u.applyStatus(def.status, 120);
      }
    }
    this.updateSound();
  },
  env(attr) { let s = 0; for (const w of this.active) s += (WEATHER_DEFS[w.name].attrs[attr] || 0) * w.intensity * w.opacity; return s; },
  updateSound() {
    if (!Audio2.loopSound) return;
    const vols = {};
    for (const w of this.active) {
      const def = WEATHER_DEFS[w.name];
      if (!def.sound) continue;
      let v = def.soundVol * w.opacity;
      if (w.name === 'snowing') v = (0.02 + Math.abs(Math.sin(Time.time / 1100)) * 0.12) * w.opacity; // windHowl oscillates
      vols[def.sound] = Math.max(vols[def.sound] || 0, v);
    }
    for (const s of ['rain', 'wind', 'windHowl']) Audio2.loopSound(s, Game.state === 'playing' ? vols[s] || 0 : 0);
  },
  save() { return { a: this.active.map(w => ({ n: w.name, l: Math.round(w.life), t: w.total, i: w.intensity, o: w.opacity, w: w.wind })), c: this.entries.map(e => Math.round(e.cooldown)) }; },
  load(d, seed) {
    this.setup(seed);
    if (!d) return;
    this.active = (d.a || []).filter(w => WEATHER_DEFS[w.n]).map(w => ({ name: w.n, life: w.l, total: w.t, intensity: w.i, opacity: w.o, wind: w.w }));
    (d.c || []).forEach((c, i) => { if (this.entries[i]) this.entries[i].cooldown = c; });
  },

  // ------------------------------------------------------------ drawing (over the world, under the HUD)
  draw() {
    if (!this.active.length) return;
    const v = Render.view();
    for (const w of this.active) {
      const def = WEATHER_DEFS[w.name], k = w.opacity * w.intensity;
      if (k <= 0.005) continue;
      if (w.name === 'rain') this.drawRain(v, k, w);
      if (def.noise) this.drawNoise(v, def.noise, k, w, 1);
      if (def.fog) { for (let i = 0; i < 3; i++) this.drawNoise(v, { color: col('666666'), scale: 1100 * Math.pow(0.6, i), alpha: 0.47 * Math.pow(0.7, i), fog: true }, k, w, 1 + i * 2); }
      if (def.particles) this.drawParticles(v, def.particles, k, w, def.wind);
    }
    Draw.setAlpha(1);
  },
  // world-fixed particles that wrap around the view (ParticleWeather.drawParticles)
  drawParticles(v, p, k, w, wind) {
    const vw = v.x2 - v.x1, vh = v.y2 - v.y1, pad = p.sizeMax;
    const spanX = vw + pad * 2, spanY = vh + pad * 2;
    const total = Math.min(400, Math.floor(vw * vh / p.density * k));
    const dir = wind ? w.wind : p.dir, t = Time.time;
    const reg = p.circle ? null : Assets.tinted('particle', p.color);
    for (let i = 0; i < total; i++) {
      const h1 = hash01(i * 3 + 1), h2 = hash01(i * 3 + 2), h3 = hash01(i * 3 + 3);
      const size = p.sizeMin + h3 * (p.sizeMax - p.sizeMin), sp = p.speed * (0.6 + h1 * 0.4) / 8;
      let x = h1 * 8000 + t * dir[0] * sp, y = h2 * 8000 + t * dir[1] * sp;
      x = v.x1 - pad + Mathf.mod(x - (v.x1 - pad), spanX); y = v.y1 - pad + Mathf.mod(y - (v.y1 - pad), spanY);
      Draw.setAlpha((p.minAlpha + h2 * (p.maxAlpha - p.minAlpha)) * k);
      if (reg) Draw.rect(reg, x, y, size, size);
      else { Fill.set(p.color.css); Fill.circle(x, y, size / 2); }
    }
    Draw.setAlpha(1);
  },
  drawRain(v, k, w) {
    const vw = v.x2 - v.x1, vh = v.y2 - v.y1, pad = 16;
    const total = Math.min(350, Math.floor(vw * vh / 1200 * k)), t = Time.time;
    Lines.set('rgba(122,149,234,0.8)', 0.75);
    for (let i = 0; i < total; i++) {
      const h1 = hash01(i * 5 + 1), h2 = hash01(i * 5 + 2);
      const len = 6 + hash01(i * 5 + 3) * 6;
      let x = h1 * 9000 + t * 0.6, y = h2 * 9000 - t * 3.5;
      x = v.x1 - pad + Mathf.mod(x - (v.x1 - pad), vw + pad * 2); y = v.y1 - pad + Mathf.mod(y - (v.y1 - pad), vh + pad * 2);
      Draw.setAlpha(0.85 * k);
      Lines.line(x, y, x + 0.6 * len / 3.5, y - len);
    }
    // splashes (RainWeather.drawUnder)
    const splashes = Math.floor(total / 3);
    Lines.set('rgba(122,149,234,0.8)', 0.5);
    for (let i = 0; i < splashes; i++) {
      const cyc = 40, ph = Mathf.mod(Time.time + hash01(i * 7 + 4) * cyc, cyc) / cyc, round = Math.floor((Time.time + hash01(i * 7 + 4) * cyc) / cyc);
      const x = v.x1 + hash01(i * 7 + round * 131 + 5) * vw, y = v.y1 + hash01(i * 7 + round * 131 + 6) * vh;
      Draw.setAlpha((1 - ph) * 0.6 * k);
      Lines.circle(x, y, 0.5 + ph * 2.5);
    }
    Draw.setAlpha(1);
  },
  drawNoise(v, n, k, w, speedMul) {
    const reg = Assets.tinted(n.fog ? 'fog' : 'noise', n.color);
    const s = n.scale, t = Time.time;
    const dir = n.fog ? [1, 0.01] : w.wind;
    const ox = Mathf.mod(t * dir[0] * 0.15 * speedMul, s), oy = Mathf.mod(t * dir[1] * 0.15 * speedMul, s);
    Draw.setAlpha(n.alpha * k);
    const x0 = Math.floor((v.x1 - ox) / s) * s + ox, y0 = Math.floor((v.y1 - oy) / s) * s + oy;
    for (let x = x0; x < v.x2 + s; x += s) for (let y = y0; y < v.y2 + s; y += s) Draw.rect(reg, x + s / 2, y + s / 2, s, s);
    Draw.setAlpha(1);
  },
};
function hash01(i) { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }

// hooks
{
  const _ng = Game.newGame;
  Game.newGame = function (seed) { const r = _ng.call(this, seed); Weather.setup(seed); return r; };
  const _gu = Game.update;
  Game.update = function () { _gu.call(this); Weather.update(); };
}
// attributes: solar panels (light), water extractors (water), cultivators (spores)
const _solarOut = Object.getOwnPropertyDescriptor(SolarGenerator.prototype, 'powerOut');
Object.defineProperty(SolarGenerator.prototype, 'powerOut', { configurable: true, get() { return _solarOut.get.call(this) * Math.max(0, 1 + Weather.env('light')); } });
const _cultEff = Object.getOwnPropertyDescriptor(Cultivator.prototype, 'efficiency');
const _bEff = Object.getOwnPropertyDescriptor(Building.prototype, 'efficiency');
Object.defineProperty(Cultivator.prototype, 'efficiency', { configurable: true, get() { return _bEff.get.call(this) * (1 + (this.attrBoost || 0) + Weather.env('spores')); } });
const _spFrac = SolidPump.prototype.update;
SolidPump.prototype.update = function () { const f = this.fraction; this.fraction = Math.max(0, f + Weather.env('water')); _spFrac.call(this); this.fraction = f; };
