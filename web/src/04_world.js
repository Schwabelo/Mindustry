// World: tiles, procedural map generation, cached floor rendering (floors + edges + ores + static walls + darkness).

const FLOOR_DEFS = [
  // order = blend priority (Mindustry block id order): higher draws its edges onto lower
  { name: 'deep-water', variants: 0, isLiquid: true, isDeep: true, speed: 0.2, liquidDrop: 'water', liquidMultiplier: 1.5 },
  { name: 'shallow-water', variants: 0, isLiquid: true, speed: 0.5, liquidDrop: 'water' },
  { name: 'sand-water', variants: 0, isLiquid: true, speed: 0.8, liquidDrop: 'water' },
  { name: 'darksand-water', variants: 0, isLiquid: true, speed: 0.8, liquidDrop: 'water' },
  { name: 'tar', variants: 0, speed: 0.19 * 4, wall: 'dune-wall', liquidDrop: 'oil', isLiquid: true },
  { name: 'stone', variants: 3, wall: 'stone-wall', boulder: 'boulder' },
  { name: 'char', variants: 3, wall: 'stone-wall', boulder: 'boulder' },
  { name: 'basalt', variants: 3, wall: 'dune-wall', boulder: 'boulder' },
  { name: 'hotrock', variants: 3, wall: 'dune-wall', boulder: 'boulder', heat: 0.5 },
  { name: 'magmarock', variants: 3, wall: 'dune-wall', boulder: 'boulder', heat: 0.75 },
  { name: 'sand-floor', variants: 3, itemDrop: 'sand', playerUnmineable: true, wall: 'sand-wall', boulder: 'sand-boulder', oil: 0.7 },
  { name: 'darksand', variants: 3, itemDrop: 'sand', playerUnmineable: true, wall: 'dune-wall', boulder: 'sand-boulder', oil: 1.5 },
  { name: 'dirt', variants: 3, wall: 'dirt-wall', boulder: 'boulder' },
  { name: 'grass', variants: 3, wall: 'stone-wall', boulder: 'boulder' },
  { name: 'salt', variants: 0, wall: 'sand-wall', oil: 0.3 },
  { name: 'snow', variants: 3, wall: 'snow-wall', boulder: 'snow-boulder' },
  { name: 'ice', variants: 3, wall: 'ice-wall', boulder: 'snow-boulder' },
  { name: 'moss', variants: 3, wall: 'stone-wall', boulder: 'boulder' },
];
const FLOOR = {};
FLOOR_DEFS.forEach((f, i) => { f.id = i; f.speed = f.speed || 1; FLOOR[f.name] = f; });
const WALL_DEFS = ['stone-wall', 'dune-wall', 'sand-wall', 'snow-wall', 'ice-wall', 'dirt-wall'];
const ORE_ITEMS = ['copper', 'lead', 'coal', 'titanium', 'scrap', 'thorium'];

const MAP_W = 150, MAP_H = 150, CHUNK = 16;

const World = {
  w: MAP_W, h: MAP_H, seed: 1,
  floor: null, variant: null, ore: null, wall: null, boulder: null, dark: null, build: null,
  chunks: new Map(), chunkFrame: 0,
  minimapBase: null,
  spawn: { x: 0, y: 0 }, coreTile: { x: 0, y: 0 },

  idx(x, y) { return y * this.w + x; },
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; },
  tileAt(wx, wy) { return [Math.round(wx / TS), Math.round(wy / TS)]; },

  buildAt(x, y) { return this.inside(x, y) ? this.build[y * this.w + x] : null; },
  buildWorld(wx, wy) { return this.buildAt(Math.round(wx / TS), Math.round(wy / TS)); },
  floorAt(x, y) { return FLOOR_DEFS[this.floor[y * this.w + x]]; },
  oreItem(x, y) { const o = this.ore[y * this.w + x]; return o ? ITEMS[o - 1] : null; },
  // item a drill would get from this tile
  drop(x, y) {
    const o = this.oreItem(x, y);
    if (o) return o;
    const f = this.floorAt(x, y);
    return f.itemDrop ? Items[f.itemDrop] : null;
  },
  isWall(x, y) { return !this.inside(x, y) || this.wall[y * this.w + x] > 0; },
  // solid for ground units / building collision
  solid(x, y) {
    if (!this.inside(x, y)) return true;
    const i = y * this.w + x;
    if (this.wall[i]) return true;
    const b = this.build[i];
    return !!(b && b.block.solid && !b.open);
  },
  // passable for ground pathing (deep water impassable)
  groundPassable(x, y) {
    if (!this.inside(x, y)) return false;
    const i = y * this.w + x;
    return !this.wall[i] && !FLOOR_DEFS[this.floor[i]].isDeep;
  },

  // ------------------------------------------------------------ generation
  generate(seed) {
    this.seed = seed;
    const W = this.w, H = this.h, N = W * H;
    this.floor = new Uint8Array(N); this.variant = new Uint8Array(N); this.ore = new Uint8Array(N);
    this.wall = new Uint8Array(N); this.boulder = new Uint8Array(N); this.dark = new Uint8Array(N);
    this.build = new Array(N).fill(null);
    this.chunks.clear();

    const rand = makeRand(seed);
    const nElev = makeNoise(seed + 1), nTemp = makeNoise(seed + 2), nMoist = makeNoise(seed + 3), nWater = makeNoise(seed + 4);
    const nOre = ORE_ITEMS.map((_, i) => makeNoise(seed + 10 + i));
    const nMisc = makeNoise(seed + 20);

    // core & spawn
    const core = { x: 22 + rand.int(6), y: 30 + rand.int(H - 60) };
    const spawn = { x: W - 24 - rand.int(6), y: 25 + rand.int(H - 50) };
    this.coreTile = core; this.spawn = spawn;

    const elev = new Float32Array(N), water = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let e = nElev.oct(x, y, 4, 0.5, 38);
      // ridges
      e += Math.abs(nMisc(x / 22, y / 22)) * 0.12;
      const edgeD = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (edgeD < 6) e += (6 - edgeD) * 0.06;
      elev[i] = e;
      water[i] = nWater.oct(x, y, 3, 0.5, 45);

      const t = nTemp.oct(x, y, 3, 0.5, 150), m = nMoist.oct(x, y, 3, 0.5, 55);
      let f;
      if (t < 0.38) f = m > 0.55 ? 'ice' : 'snow';
      else if (t > 0.62) f = m > 0.5 ? 'darksand' : 'sand-floor';
      else if (m > 0.66) f = 'moss';
      else if (m > 0.56) f = 'grass';
      else if (m < 0.34) f = 'basalt';
      else if (m < 0.4) f = 'dirt';
      else f = 'stone';
      // patches
      const p = nMisc.oct(x + 400, y, 2, 0.5, 14);
      if (p > 0.76 && f === 'stone') f = 'char';
      if (p < 0.22 && (f === 'stone' || f === 'basalt')) f = 'darksand';
      if (p > 0.78 && f === 'sand-floor') f = 'salt';
      this.floor[i] = FLOOR[f].id;
    }

    for (let i = 0; i < N; i++) {
      const fl = FLOOR_DEFS[this.floor[i]];
      if (water[i] > 0.66 && elev[i] < 0.58) {
        let wf = water[i] > 0.73 ? 'deep-water' : 'shallow-water';
        if (wf === 'shallow-water' && (fl.name === 'sand-floor' || fl.name === 'salt')) wf = 'sand-water';
        if (wf === 'shallow-water' && fl.name === 'darksand') wf = 'darksand-water';
        this.floor[i] = FLOOR[wf].id;
      } else if (elev[i] > 0.6) {
        this.wall[i] = WALL_DEFS.indexOf(fl.wall || 'stone-wall') + 1;
      }
    }

    // tar pools in sandy / dark areas
    const nTar = makeNoise(seed + 30);
    for (let i = 0; i < N; i++) {
      if (this.wall[i]) continue;
      const fl = FLOOR_DEFS[this.floor[i]];
      if (fl.isLiquid || !(fl.name === 'darksand' || fl.name === 'sand-floor' || fl.name === 'basalt' || fl.name === 'char')) continue;
      const x = i % W, y = (i / W) | 0;
      if (nTar.oct(x, y, 2, 0.5, 9) > 0.74) this.floor[i] = FLOOR.tar.id;
    }

    // clear areas around core and spawn
    const clear = (cx, cy, r) => {
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inside(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy) + nMisc(x / 3, y / 3) * 1.5;
        if (d <= r) {
          const i = y * W + x;
          this.wall[i] = 0;
          if (FLOOR_DEFS[this.floor[i]].isLiquid) this.floor[i] = FLOOR.stone.id;
        }
      }
    };
    clear(core.x, core.y, 9);
    clear(spawn.x, spawn.y, 7);

    // carve a guaranteed ground path from spawn to core (cheapest path where walls/deep water are expensive)
    this.carvePath(spawn, core, rand);
    // a second, alternate route so the map isn't a single corridor
    const mid = { x: Math.floor((core.x + spawn.x) / 2) + rand.range(15) | 0, y: Mathf.clamp(Math.floor(H / 2 + rand.range(H / 3)), 12, H - 12) };
    this.carvePath(spawn, mid, rand);
    this.carvePath(mid, core, rand);

    // ores
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (this.wall[i] || FLOOR_DEFS[this.floor[i]].isLiquid) continue;
      const dCore = Math.hypot(x - core.x, y - core.y);
      if (dCore < 4) continue;
      const rich = Mathf.clamp(1 - dCore / 120);
      const th = [0.75 - rich * 0.04, 0.76 - rich * 0.03, 0.765, dCore > 30 ? 0.765 : 2, 0.8, dCore > 55 ? 0.775 : 2];
      for (let o = 0; o < ORE_ITEMS.length; o++) {
        const v = nOre[o].oct(x, y, 2, 0.5, 13);
        if (v > th[o]) { this.ore[i] = Items[ORE_ITEMS[o]].id + 1; }
      }
    }
    // guaranteed starter ores near core
    const blob = (item, dist, r) => {
      for (let tries = 0; tries < 60; tries++) {
        const a = rand() * Math.PI * 2;
        const bx = Math.round(core.x + Math.cos(a) * dist), by = Math.round(core.y + Math.sin(a) * dist);
        if (!this.inside(bx, by) || this.wall[by * W + bx]) continue;
        for (let y = by - r; y <= by + r; y++) for (let x = bx - r; x <= bx + r; x++) {
          if (!this.inside(x, y)) continue;
          const i = y * W + x;
          if (this.wall[i] || FLOOR_DEFS[this.floor[i]].isLiquid) continue;
          if (Math.hypot(x - bx, y - by) + nMisc(x / 2.5, y / 2.5) * 1.2 <= r) {
            if (item === 'sand') { this.floor[i] = FLOOR.darksand.id; this.ore[i] = 0; }
            else if (item === 'tar') { this.floor[i] = FLOOR.tar.id; this.ore[i] = 0; }
            else this.ore[i] = Items[item].id + 1;
          }
        }
        return;
      }
    };
    blob('copper', 8, 3); blob('copper', 13, 3); blob('lead', 11, 3); blob('lead', 16, 2);
    blob('sand', 16, 3); blob('coal', 19, 2); blob('coal', 24, 3); blob('scrap', 22, 2);
    blob('titanium', 36, 3); blob('titanium', 44, 3); blob('thorium', 60, 3); blob('thorium', 72, 3);
    blob('tar', 32, 2);

    for (let i = 0; i < N; i++) {
      const fl = FLOOR_DEFS[this.floor[i]];
      this.variant[i] = fl.variants ? rand.int(fl.variants) + 1 : 0;
      if (this.ore[i]) this.variant[i] = rand.int(3) + 1;
      if (!this.wall[i] && !fl.isLiquid && !this.ore[i] && fl.boulder && rand() < 0.012) {
        const x = i % W, y = (i / W) | 0;
        if (Math.hypot(x - core.x, y - core.y) > 6) this.boulder[i] = rand.int(2) + 1;
      }
    }

    // geothermal vents: an extra pass with its own noise, run after everything else, so maps from older
    // versions keep every other tile (and existing saves stay valid). Only basalt and char can heat up.
    const nVent = makeNoise(seed + 50);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, fl = FLOOR_DEFS[this.floor[i]];
      if (this.wall[i] || (fl.name !== 'basalt' && fl.name !== 'char')) continue;
      if (Math.hypot(x - core.x, y - core.y) < 12) continue;
      const v = nVent.oct(x, y, 2, 0.5, 6);
      if (v > 0.66) {
        this.floor[i] = v > 0.74 ? FLOOR.magmarock.id : FLOOR.hotrock.id;
        this.variant[i] = ((x * 7 + y * 13) % 3) + 1;
      }
    }

    this.computeDarkness();
    this.buildMinimapBase();
    this._oreTiles = {};
  },

  // all ore tiles of an item, sorted by distance to the starting core
  oreTiles(item) {
    let t = this._oreTiles[item.id];
    if (!t) {
      t = [];
      const W = this.w, c = this.coreTile;
      for (let i = 0; i < this.ore.length; i++) if (this.ore[i] === item.id + 1 && !this.wall[i]) t.push(i);
      t.sort((a, b) => Math.hypot(a % W - c.x, (a / W | 0) - c.y) - Math.hypot(b % W - c.x, (b / W | 0) - c.y));
      this._oreTiles[item.id] = t;
    }
    return t;
  },
  closestOre(item, cx, cy) {
    const W = this.w;
    for (const i of this.oreTiles(item)) if (!this.build[i]) return [i % W, (i / W) | 0];
    return null;
  },

  carvePath(from, to, rand) {
    const W = this.w, H = this.h;
    const dist = new Float64Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1);
    const heap = new MinHeap();
    const s = from.y * W + from.x, t = to.y * W + to.x;
    dist[s] = 0; heap.push(s, 0);
    const jitter = makeNoise(this.seed + 99 + from.x);
    while (heap.size) {
      const [i, d] = heap.pop();
      if (i === t) break;
      if (d > dist[i]) continue;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of Geometry.d4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 2 || ny < 2 || nx >= W - 2 || ny >= H - 2) continue;
        const ni = ny * W + nx;
        let c = 1 + (jitter(nx / 8, ny / 8) + 1) * 1.5;
        if (this.wall[ni]) c += 6;
        if (FLOOR_DEFS[this.floor[ni]].isDeep) c += 8;
        const nd = d + c;
        if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = i; heap.push(ni, nd); }
      }
    }
    let cur = t;
    while (cur !== -1) {
      const x = cur % W, y = (cur / W) | 0;
      const r = 2;
      for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
        if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
        if (Math.hypot(xx - x, yy - y) > r + 0.3) continue;
        const i = yy * W + xx;
        this.wall[i] = 0;
        if (FLOOR_DEFS[this.floor[i]].isDeep) this.floor[i] = FLOOR['shallow-water'].id;
      }
      cur = prev[cur];
    }
  },

  computeDarkness() {
    const W = this.w, H = this.h, R = 4;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let dark = 0;
      if (this.wall[i]) {
        let minDst = R + 1;
        for (let cy = y - R; cy <= y + R; cy++) for (let cx = x - R; cx <= x + R; cx++) {
          if (this.inside(cx, cy) && !this.wall[cy * W + cx]) minDst = Math.min(minDst, Math.abs(cx - x) + Math.abs(cy - y));
        }
        dark = Math.max(minDst - 1, 0);
      }
      const edgeD = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (edgeD <= 2) dark = Math.max(dark, Math.round((2 - edgeD) * 2) + (edgeD === 0 ? 1 : 0));
      this.dark[i] = Math.min(dark, 4);
    }
  },

  // ------------------------------------------------------------ chunk rendering
  renderChunk(cx, cy) {
    const px = CHUNK * 32;
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const W = this.w;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const put = (reg, tx, ty, size = 1) => {
      // tile (tx,ty) bottom-left of a size x size area
      const sx = (tx - x0) * 32 + (32 * size - reg.w) / 2;
      const sy = (CHUNK - (ty - y0) - size) * 32 + (32 * size - reg.h) / 2;
      g.drawImage(reg.img, reg.x, reg.y, reg.w, reg.h, sx, sy, reg.w, reg.h);
    };
    const putPart = (reg, col, row, tx, ty) => {
      const sx = (tx - x0) * 32, sy = (CHUNK - 1 - (ty - y0)) * 32;
      g.drawImage(reg.img, reg.x + col * 32, reg.y + row * 32, 32, 32, sx, sy, 32, 32);
    };

    for (let ty = y0; ty < y0 + CHUNK; ty++) for (let tx = x0; tx < x0 + CHUNK; tx++) {
      if (!this.inside(tx, ty)) continue;
      const i = ty * W + tx;
      const fl = FLOOR_DEFS[this.floor[i]];
      put(Assets.get(fl.variants ? fl.name + Mathf.clamp(this.variant[i], 1, fl.variants) : fl.name), tx, ty);
      // edges from higher-priority neighbouring floors
      const blenders = [];
      for (const [dx, dy] of Geometry.d8) {
        const nx = tx + dx, ny = ty + dy;
        if (!this.inside(nx, ny)) continue;
        const of = this.floor[ny * W + nx];
        if (of > fl.id && !blenders.includes(of)) blenders.push(of);
      }
      blenders.sort((a, b) => a - b);
      for (const bid of blenders) {
        const edge = Assets.get(FLOOR_DEFS[bid].name + '-edge');
        for (const [dx, dy] of Geometry.d8) {
          const nx = tx + dx, ny = ty + dy;
          if (!this.inside(nx, ny) || this.floor[ny * W + nx] !== bid) continue;
          putPart(edge, 1 - dx, 1 + dy, tx, ty);
        }
      }
      if (this.ore[i] && !this.wall[i]) put(Assets.get('ore-' + ITEMS[this.ore[i] - 1].name + Mathf.clamp(this.variant[i], 1, 3)), tx, ty);
    }
    // walls (with large variants on aligned 2x2 groups) + darkness
    const done = new Set();
    for (let ty = y0; ty < y0 + CHUNK; ty++) for (let tx = x0; tx < x0 + CHUNK; tx++) {
      if (!this.inside(tx, ty)) continue;
      const i = ty * W + tx;
      const wl = this.wall[i];
      if (!wl || done.has(i)) continue;
      const name = WALL_DEFS[wl - 1];
      if (tx % 2 === 0 && ty % 2 === 0 && this.inside(tx + 1, ty + 1) &&
        this.wall[i + 1] === wl && this.wall[i + W] === wl && this.wall[i + W + 1] === wl && ((tx * 7 + ty * 13 + this.seed) % 5) < 2) {
        put(Assets.get(name + '-large'), tx, ty, 2);
        done.add(i + 1); done.add(i + W); done.add(i + W + 1);
      } else {
        put(Assets.get(name + (((tx * 31 + ty * 17) % 2) + 1)), tx, ty);
      }
    }
    for (let ty = y0; ty < y0 + CHUNK; ty++) for (let tx = x0; tx < x0 + CHUNK; tx++) {
      if (!this.inside(tx, ty)) continue;
      const d = this.dark[ty * W + tx];
      if (d > 0) {
        const bright = 1 - Math.min((d + 0.5) / 4, 1);
        g.fillStyle = `rgba(0,0,0,${1 - bright})`;
        g.fillRect((tx - x0) * 32, (CHUNK - 1 - (ty - y0)) * 32, 32, 32);
      }
    }
    // spawn marker
    if (Math.floor(this.spawn.x / CHUNK) === cx && Math.floor(this.spawn.y / CHUNK) === cy) put(Assets.get('spawn'), this.spawn.x, this.spawn.y);
    return c;
  },

  drawFloors() {
    const v = Render.view();
    const z = Render.z, ctx = Render.ctx;
    const cx1 = Math.max(0, Math.floor((v.x1 + 4) / (CHUNK * TS))), cx2 = Math.min(Math.ceil(this.w / CHUNK) - 1, Math.floor((v.x2 + 4) / (CHUNK * TS)));
    const cy1 = Math.max(0, Math.floor((v.y1 + 4) / (CHUNK * TS))), cy2 = Math.min(Math.ceil(this.h / CHUNK) - 1, Math.floor((v.y2 + 4) / (CHUNK * TS)));
    let rendered = 0;
    this.chunkFrame++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let cy = cy1; cy <= cy2; cy++) for (let cx = cx1; cx <= cx2; cx++) {
      const key = cx + ',' + cy;
      let ch = this.chunks.get(key);
      if (!ch) {
        if (rendered >= 4) continue;
        ch = { canvas: this.renderChunk(cx, cy), used: 0 };
        this.chunks.set(key, ch);
        rendered++;
      }
      ch.used = this.chunkFrame;
      const wx1 = cx * CHUNK * TS - 4, wx2 = wx1 + CHUNK * TS;
      const wyTop = (cy + 1) * CHUNK * TS - 4, wyBot = wyTop - CHUNK * TS;
      const sx1 = Math.round(wx1 * z + Render.ox), sx2 = Math.round(wx2 * z + Render.ox);
      const sy1 = Math.round(Render.oy - wyTop * z), sy2 = Math.round(Render.oy - wyBot * z);
      ctx.drawImage(ch.canvas, sx1, sy1, sx2 - sx1, sy2 - sy1);
    }
    // evict
    if (this.chunks.size > 70) {
      const arr = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < arr.length - 60; i++) this.chunks.delete(arr[i][0]);
    }
  },

  prerenderAround(tx, ty, r) {
    const ccx = Math.floor(tx / CHUNK), ccy = Math.floor(ty / CHUNK);
    for (let cy = ccy - r; cy <= ccy + r; cy++) for (let cx = ccx - r; cx <= ccx + r; cx++) {
      if (cx < 0 || cy < 0 || cx * CHUNK >= this.w || cy * CHUNK >= this.h) continue;
      const key = cx + ',' + cy;
      if (!this.chunks.has(key)) this.chunks.set(key, { canvas: this.renderChunk(cx, cy), used: 0 });
    }
  },

  // ------------------------------------------------------------ minimap base image
  buildMinimapBase() {
    const W = this.w, H = this.h;
    const img = new ImageData(W, H);
    const cache = {};
    const avg = name => cache[name] || (cache[name] = Assets.avgColor(name));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let c;
      if (this.wall[i]) { c = avg(WALL_DEFS[this.wall[i] - 1] + '1'); c = [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75]; }
      else if (this.ore[i]) { const it = ITEMS[this.ore[i] - 1]; c = [it.color.r, it.color.g, it.color.b]; }
      else { const f = FLOOR_DEFS[this.floor[i]]; c = avg(f.variants ? f.name + '1' : f.name); }
      const d = this.dark[i];
      const b = d > 0 ? 1 - Math.min((d + 0.5) / 4, 1) : 1;
      const o = ((H - 1 - y) * W + x) * 4;
      img.data[o] = c[0] * b; img.data[o + 1] = c[1] * b; img.data[o + 2] = c[2] * b; img.data[o + 3] = 255;
    }
    this.minimapBase = img;
  },
};

// binary min-heap keyed by number priority
class MinHeap {
  constructor() { this.keys = []; this.pri = []; }
  get size() { return this.keys.length; }
  push(k, p) {
    const K = this.keys, P = this.pri;
    let i = K.length; K.push(k); P.push(p);
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (P[par] <= p) break;
      K[i] = K[par]; P[i] = P[par]; i = par;
    }
    K[i] = k; P[i] = p;
  }
  pop() {
    const K = this.keys, P = this.pri;
    const topK = K[0], topP = P[0];
    const lk = K.pop(), lp = P.pop();
    if (K.length) {
      let i = 0; const n = K.length;
      while (true) {
        let l = 2 * i + 1, r = l + 1, m = i;
        let mp = lp;
        if (l < n && P[l] < mp) { m = l; mp = P[l]; }
        if (r < n && P[r] < mp) { m = r; mp = P[r]; }
        if (m === i) break;
        K[i] = K[m]; P[i] = P[m]; i = m;
      }
      K[i] = lk; P[i] = lp;
    }
    return [topK, topP];
  }
}
