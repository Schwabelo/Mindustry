// Core utilities. World space follows Mindustry: y points up, 8 world units per tile,
// angles in degrees counter-clockwise, rotation 0=right 1=up 2=left 3=down.

const TS = 8;
const DEG = Math.PI / 180;

const Mathf = {
  clamp: (v, a = 0, b = 1) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  approach: (v, target, amt) => v < target ? Math.min(v + amt, target) : Math.max(v - amt, target),
  dst: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
  dst2: (x1, y1, x2, y2) => (x2 - x1) ** 2 + (y2 - y1) ** 2,
  within: (x1, y1, x2, y2, r) => (x2 - x1) ** 2 + (y2 - y1) ** 2 <= r * r,
  sign: v => v < 0 ? -1 : 1,
  mod: (a, n) => ((a % n) + n) % n,
  range: r => (Math.random() * 2 - 1) * r,
  random: (a, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a),
  chance: p => Math.random() < p,
  absin: (t, scl, mag) => Math.abs(Math.sin(t / scl)) * mag,
  sin: (t, scl, mag) => Math.sin(t / scl) * mag,
  slope: f => 1 - Math.abs(f - 0.5) * 2,
  pow2Out: f => 1 - (1 - f) * (1 - f),
  pow3Out: f => 1 - (1 - f) ** 3,
};

const Angles = {
  angle: (x1, y1, x2, y2) => {
    let a = Math.atan2(y2 - y1, x2 - x1) / DEG;
    return a < 0 ? a + 360 : a;
  },
  trnsx: (a, len, side = 0) => Math.cos(a * DEG) * len - Math.sin(a * DEG) * side,
  trnsy: (a, len, side = 0) => Math.sin(a * DEG) * len + Math.cos(a * DEG) * side,
  angleDist: (a, b) => {
    let d = Mathf.mod(a - b, 360);
    return d > 180 ? 360 - d : d;
  },
  moveToward: (from, to, speed) => {
    from = Mathf.mod(from, 360); to = Mathf.mod(to, 360);
    if (Math.abs(Angles.angleDist(from, to)) < speed) return to;
    let diff = to - from;
    if (diff > 180) diff -= 360; else if (diff < -180) diff += 360;
    return Mathf.mod(from + Math.sign(diff) * speed, 360);
  },
  within: (a, b, margin) => Angles.angleDist(a, b) <= margin,
};

const Geometry = {
  d4: [[1, 0], [0, 1], [-1, 0], [0, -1]],
  d8: [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]],
};

// Seeded RNG (mulberry32)
function makeRand(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = n => Math.floor(r() * n);
  r.range = v => (r() * 2 - 1) * v;
  return r;
}

// 2D simplex noise, seeded
function makeNoise(seed) {
  const rand = makeRand(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  function noise(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = grad[perm[ii + perm[jj]] & 7]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = grad[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = grad[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * n; // [-1, 1]
  }
  // fractal noise in [0,1]
  noise.oct = (x, y, octaves, falloff, scl) => {
    let v = 0, amp = 1, total = 0, f = 1 / scl;
    for (let o = 0; o < octaves; o++) {
      v += (noise(x * f, y * f) * 0.5 + 0.5) * amp;
      total += amp; amp *= falloff; f *= 2;
    }
    return v / total;
  };
  return noise;
}

// Colors: stored as [r,g,b] 0-255 plus css string
function col(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return { r, g, b, hex: '#' + hex.slice(0, 6), css: `rgb(${r},${g},${b})` };
}
function lerpCol(a, b, t) {
  const r = Math.round(Mathf.lerp(a.r, b.r, t)), g = Math.round(Mathf.lerp(a.g, b.g, t)), bl = Math.round(Mathf.lerp(a.b, b.b, t));
  return { r, g, b: bl, css: `rgb(${r},${g},${bl})`, hex: '#' + [r, g, bl].map(v => v.toString(16).padStart(2, '0')).join('') };
}
function rgba(c, a) { return `rgba(${c.r},${c.g},${c.b},${a})`; }

const Pal = {
  accent: col('ffd37f'), accentBack: col('d4816b'), darkOutline: col('2d2f39'), darkMetal: col('6e7080'),
  bulletYellow: col('fff8e8'), bulletYellowBack: col('f9c27a'), lightOrange: col('f68021'), lightishOrange: col('f8ad42'),
  lancerLaser: col('a9d8ff'), engine: col('ffbb64'), yellowBoltFront: col('ffd27e'), health: col('ff341c'),
  heal: col('98ffa9'), powerLight: col('fbd367'), white: col('ffffff'), remove: col('e55454'), place: col('6ecdec'),
  copperAmmoFront: col('eac1a8'), copperAmmoBack: col('d39169'), graphiteAmmoFront: col('dae1ee'), graphiteAmmoBack: col('7d89d8'),
  siliconAmmoFront: col('999ba0'), siliconAmmoBack: col('707594'), scrapAmmoFront: col('f5e0cc'), scrapAmmoBack: col('d8887e'),
  glassAmmoFront: col('ffffff'), glassAmmoBack: col('ebeef5'), lightFlame: col('ffdd55'), darkFlame: col('db401c'),
  lightPyraFlame: col('ffb855'), darkPyraFlame: col('db661c'), redSpark: col('fbb97f'), orangeSpark: col('d2b29c'),
  bulletYellowBack2: col('f9c27a'), gray: col('454545'), darkerGray: col('3a3a3a'), shadow: col('000000'),
  lightishGray: col('a2a2a2'), stoneGray: col('8f8f8f'), plasticSmoke: col('f1e479'),
};

const Teams = {
  sharded: { id: 1, name: 'sharded', color: col('ffd37f'), palette: [col('ffd37f'), col('eab678'), col('d4816b')] },
  crux: { id: 2, name: 'crux', color: col('f25555'), palette: [col('fc8e6c'), col('f25555'), col('a04553')] },
};

// Fixed-step clock
const Time = { time: 0, delta: 1 };
