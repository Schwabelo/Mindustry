// Map editor (MapEditorDialog): paint floors, walls, ores and boulders with pencil / line / fill / eraser, place buildings
// of any team, set drop zones, edit the map's rules, undo, save to the browser, export / import files and test-play.
// Saved maps show up in the custom game dialog. Maps use the same compact format as the exported sector / built-in maps.

const UserMaps = {
  KEY: 'mindustry-lite-maps',
  all() { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { return {}; } },
  names() { return Object.keys(this.all()).sort((a, b) => a.localeCompare(b)); },
  get(name) { const m = this.all()[name]; return m ? JSON.parse(JSON.stringify(m)) : null; },
  put(name, m) {
    const a = this.all(); a[name] = m;
    localStorage.setItem(this.KEY, JSON.stringify(a)); // throws when storage is full
  },
  remove(name) { const a = this.all(); delete a[name]; try { localStorage.setItem(this.KEY, JSON.stringify(a)); } catch (e) { /* ignore */ } },
  index(name) {
    const m = this.all()[name];
    if (!m) return null;
    const teams = new Set(m.builds.filter(b => b[1].startsWith('core-') && b[0] !== 2).map(b => b[0]));
    return { name: 'user:' + name, title: m.title || name, author: m.author || 'you', desc: m.desc || '', w: m.w, h: m.h,
      teams: teams.size, spawns: m.spawns.length, resources: (m.pal.ore || []).filter(Boolean), user: true, saved: m.saved || 0 };
  },
};

const EDITOR_TEAMS = ['sharded', 'crux', 'derelict'];
const Editor = {
  active: false, name: '', meta: null,
  tab: 'floor', tool: 'pencil', brush: 1, team: 'sharded', rotation: 0,
  sel: { floor: FLOOR.stone.id, wall: WALL_DEFS.indexOf('stone-wall') + 1, ore: 0, boulder: 1, block: null },
  undoStack: [], stroke: null, dirty: null, panning: null, lineStart: null, mouse: { x: 0, y: 0, tx: 0, ty: 0 },

  // ------------------------------------------------------------ world state
  resetGame() {
    Game.buildings = []; Game.units = []; Game.byTeam = { sharded: [], crux: [], derelict: [] };
    Game.rebuildQueue = []; Game.player = null; Fires.map.clear(); Puddles.map.clear(); Fireballs.list = [];
    Bullets.list = []; Bullets.lasers = []; Fx.list = []; Lightning.list = []; Decals.list = [];
  },
  blankMap(w, h) {
    const N = w * h;
    return { name: 'new', w, h, floor: `0*${N}`, ore: `0*${N}`, wall: `0*${N}`, boulder: `0*${N}`,
      pal: { floor: ['stone'], ore: [''], wall: [''], boulder: [''] }, builds: [[0, 'core-shard', w >> 1, h >> 1, 0]], spawns: [],
      groups: WAVE_GROUPS.map(g => Object.assign({}, g)), winWave: 0, attack: false, waveSpacing: 2 * 60 * 60, initialWave: 0,
      loadout: [['copper', 200]], weather: [], difficulty: 0 };
  },
  load(m) {
    this.resetGame();
    Rules.reset();
    World.loadSector(m);
    Sectors.placeMap(m);
    for (const b of Game.buildings) if (b.block.cls === 'Core') { for (const it of ITEMS) b.items[it.id] = 0; b.total = 0; }
    World.hasTrees = true; // trees may be painted in
    Power.dirty = true;
  },

  open(m, name, meta) {
    this.active = true;
    this.name = name || '';
    this.meta = Object.assign({ title: (m && m.title) || name || 'New map', author: (m && m.author) || '', desc: (m && m.desc) || '',
      winWave: m ? m.winWave || 0 : 0, waveSpacing: m ? m.waveSpacing : 7200, loadout: m ? m.loadout : [['copper', 200]],
      weather: m ? m.weather : [], groups: m ? m.groups : WAVE_GROUPS }, meta || {});
    Game.state = 'editor';
    $('title').classList.add('hidden'); $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('gameover').classList.add('hidden');
    UI.closeConfig();
    this.load(m || this.blankMap(200, 200));
    this.undoStack = [];
    const core = Game.playerCore();
    Render.camX = core ? core.x : World.w * TS / 2; Render.camY = core ? core.y : World.h * TS / 2;
    Render.zoom = Render.targetZoom = 2;
    this.buildUI();
    this.el.style.display = '';
    this.renderPalette(); this.renderTools(); this.updateMinimap(true);
  },
  close() {
    this.active = false;
    if (this.el) this.el.style.display = 'none';
    UI.showTitle();
  },

  // ------------------------------------------------------------ editing primitives
  layerArr(layer) { return layer === 'boulder' ? World.bkind : World[layer]; },
  setTile(tx, ty, layer, v) {
    if (!World.inside(tx, ty)) return;
    const i = ty * World.w + tx, arr = this.layerArr(layer);
    if (arr[i] === v) return;
    this.stroke.tiles.push([i, layer, arr[i]]);
    arr[i] = v;
    const h = (tx * 73856093 ^ ty * 19349663) >>> 0;
    if (layer === 'wall' && v) { if (World.bkind[i]) { this.stroke.tiles.push([i, 'boulder', World.bkind[i]]); World.bkind[i] = 0; World.boulder[i] = 0; } const b = World.build[i]; if (b) this.removeBuild(b); }
    if (layer === 'boulder') { World.boulder[i] = v ? (h >>> 3) % (BOULDER_KINDS[v - 1] === 'spore-cluster' ? 3 : 2) + 1 : 0; if (v && World.wall[i]) { this.stroke.tiles.push([i, 'wall', World.wall[i]]); World.wall[i] = 0; } }
    if (layer === 'floor' || layer === 'ore') { const fl = FLOOR_DEFS[World.floor[i]]; World.variant[i] = World.ore[i] ? h % 3 + 1 : fl.variants ? h % fl.variants + 1 : 0; }
    this.markDirty(tx, ty);
  },
  markDirty(tx, ty) {
    const d = this.dirty || (this.dirty = { x1: tx, y1: ty, x2: tx, y2: ty });
    d.x1 = Math.min(d.x1, tx); d.y1 = Math.min(d.y1, ty); d.x2 = Math.max(d.x2, tx); d.y2 = Math.max(d.y2, ty);
  },
  // redraw what changed: darkness around the edit, the chunks it touches, the minimap
  flush(final) {
    const d = this.dirty;
    if (!d) return;
    this.dirty = null;
    const W = World.w, H = World.h, R = 4;
    const x1 = Math.max(0, d.x1 - R - 1), y1 = Math.max(0, d.y1 - R - 1), x2 = Math.min(W - 1, d.x2 + R + 1), y2 = Math.min(H - 1, d.y2 + R + 1);
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
      const i = y * W + x;
      let dark = 0;
      if (World.wall[i] && !WALL_IS_TREE[World.wall[i] - 1]) {
        let minDst = R + 1;
        for (let cy = y - R; cy <= y + R; cy++) for (let cx = x - R; cx <= x + R; cx++)
          if (World.inside(cx, cy) && (!World.wall[cy * W + cx] || WALL_IS_TREE[World.wall[cy * W + cx] - 1])) minDst = Math.min(minDst, Math.abs(cx - x) + Math.abs(cy - y));
        dark = Math.max(minDst - 1, 0);
      }
      const edgeD = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (edgeD <= 2) dark = Math.max(dark, Math.round((2 - edgeD) * 2) + (edgeD === 0 ? 1 : 0));
      World.dark[i] = Math.min(dark, 4);
    }
    // trees draw up to 6 tiles out of their chunk
    for (let cy = Math.floor((y1 - 7) / CHUNK); cy <= Math.floor((y2 + 7) / CHUNK); cy++)
      for (let cx = Math.floor((x1 - 7) / CHUNK); cx <= Math.floor((x2 + 7) / CHUNK); cx++) World.chunks.delete(cx + ',' + cy);
    World._oreTiles = {};
    this.minimapDirty = true;
    if (final) this.updateMinimap();
  },

  removeBuild(b) {
    if (!b || b.dead) return;
    this.stroke.builds.push({ op: 'remove', data: this.buildData(b) });
    Game.removeBuilding(b);
    Power.dirty = true;
  },
  buildData(b) { const c = typeof blockConfig === 'function' ? blockConfig(b) : null; return [EDITOR_TEAMS.indexOf(b.team), b.block.name, b.tx, b.ty, b.rotation].concat(c ? [c] : []); },
  addBuild(blk, team, tx, ty, rot, cfg) {
    const s = blk.size, o = blk.sizeOffset;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) if (!World.inside(tx + o + dx, ty + o + dy)) return null;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const x = tx + o + dx, y = ty + o + dy, i = y * World.w + x;
      const ex = World.build[i];
      if (ex) this.removeBuild(ex);
      if (World.wall[i]) this.setTile(x, y, 'wall', 0);
      if (World.bkind[i]) this.setTile(x, y, 'boulder', 0);
    }
    const b = createBuilding(blk, team, tx, ty, blk.rotate ? rot : 0);
    Game.addBuilding(b);
    if (cfg) try { applySchemConfig(b, cfg); updateSchemPending(); } catch (e) { /* unsupported */ }
    this.stroke.builds.push({ op: 'add', b });
    Power.dirty = true;
    return b;
  },

  brushTiles(tx, ty) {
    const r = this.brush, out = [];
    if (r <= 1) return [[tx, ty]];
    const rr = (r - 1) / 2;
    for (let dy = -Math.ceil(rr); dy <= Math.ceil(rr); dy++) for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++)
      if (dx * dx + dy * dy <= rr * rr + 0.5) out.push([tx + dx, ty + dy]);
    return out;
  },
  paintAt(tx, ty, erase) {
    if (this.tab === 'block') {
      if (erase || !this.sel.block) { const b = World.buildAt(tx, ty); if (b) this.removeBuild(b); return; }
      const blk = this.sel.block, [px, py] = Input.placeTile(blk, this.mouse.wx, this.mouse.wy);
      const ex = World.buildAt(px, py);
      if (ex && ex.block === blk && ex.tx === px && ex.ty === py && ex.team === this.team && (!blk.rotate || ex.rotation === this.rotation)) return;
      this.addBuild(blk, this.team, px, py, this.rotation);
      return;
    }
    for (const [x, y] of this.brushTiles(tx, ty)) {
      if (!World.inside(x, y)) continue;
      if (erase) { this.setTile(x, y, 'wall', 0); this.setTile(x, y, 'ore', 0); this.setTile(x, y, 'boulder', 0); const b = World.buildAt(x, y); if (b) this.removeBuild(b); continue; }
      this.setTile(x, y, this.tab, this.sel[this.tab]);
    }
  },
  lineTiles(x0, y0, x1, y1) {
    const out = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { out.push([x0, y0]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
    return out;
  },
  // flood fill of the tab's layer (floors: same floor; walls / ores / boulders: same value on the same floor)
  fill(tx, ty) {
    if (this.tab === 'block' || !World.inside(tx, ty)) return;
    const arr = this.layerArr(this.tab), W = World.w, start = ty * W + tx, from = arr[start], to = this.sel[this.tab];
    if (from === to) return;
    const fl = World.floor[start], seen = new Uint8Array(World.w * World.h), stack = [start];
    seen[start] = 1;
    let n = 0;
    while (stack.length && n < 300000) {
      const i = stack.pop(), x = i % W, y = (i / W) | 0;
      this.setTile(x, y, this.tab, to); n++;
      for (const [dx, dy] of Geometry.d4) {
        const nx = x + dx, ny = y + dy;
        if (!World.inside(nx, ny)) continue;
        const j = ny * W + nx;
        if (seen[j] || arr[j] !== from || (this.tab !== 'floor' && World.floor[j] !== fl)) continue;
        seen[j] = 1; stack.push(j);
      }
    }
  },
  pickAt(tx, ty) {
    if (!World.inside(tx, ty)) return;
    const i = ty * World.w + tx, b = World.build[i];
    if (b) { this.tab = 'block'; this.sel.block = b.block; this.team = b.team; this.rotation = b.rotation; }
    else if (World.wall[i]) { this.tab = 'wall'; this.sel.wall = World.wall[i]; }
    else if (World.bkind[i]) { this.tab = 'boulder'; this.sel.boulder = World.bkind[i]; }
    else if (World.ore[i] && this.tab === 'ore') { this.sel.ore = World.ore[i]; }
    else { this.tab = 'floor'; this.sel.floor = World.floor[i]; }
    this.tool = 'pencil';
    this.renderPalette(); this.renderTools();
  },
  toggleSpawn(tx, ty) {
    if (!World.inside(tx, ty)) return;
    this.stroke.spawns = World.spawns.map(s => ({ x: s.x, y: s.y }));
    const near = World.spawns.findIndex(s => Math.abs(s.x - tx) <= 2 && Math.abs(s.y - ty) <= 2);
    if (near >= 0) World.spawns.splice(near, 1); else World.spawns.push({ x: tx, y: ty });
    this.markDirty(tx, ty);
  },

  beginStroke() { this.stroke = { tiles: [], builds: [], spawns: null }; },
  endStroke() {
    const s = this.stroke;
    this.stroke = null;
    this.flush(true);
    if (s && (s.tiles.length || s.builds.length || s.spawns)) { this.undoStack.push(s); if (this.undoStack.length > 60) this.undoStack.shift(); this.changed = true; }
  },
  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.beginStroke();
    for (let k = s.tiles.length - 1; k >= 0; k--) {
      const [i, layer, old] = s.tiles[k], x = i % World.w, y = (i / World.w) | 0;
      this.layerArr(layer)[i] = old;
      const h = (x * 73856093 ^ y * 19349663) >>> 0;
      if (layer === 'boulder') World.boulder[i] = old ? (h >>> 3) % (BOULDER_KINDS[old - 1] === 'spore-cluster' ? 3 : 2) + 1 : 0;
      if (layer === 'floor' || layer === 'ore') { const fl = FLOOR_DEFS[World.floor[i]]; World.variant[i] = World.ore[i] ? h % 3 + 1 : fl.variants ? h % fl.variants + 1 : 0; }
      this.markDirty(x, y);
    }
    for (let k = s.builds.length - 1; k >= 0; k--) {
      const op = s.builds[k];
      if (op.op === 'add') { if (!op.b.dead) Game.removeBuilding(op.b); }
      else { const [t, n, x, y, r, c] = op.data; if (BLOCKS[n]) { const b = createBuilding(BLOCKS[n], EDITOR_TEAMS[t], x, y, r); Game.addBuilding(b); if (c) try { applySchemConfig(b, c); updateSchemPending(); } catch (e) { /* ignore */ } } }
    }
    if (s.spawns) { World.spawns.length = 0; World.spawns.push(...s.spawns); for (const sp of s.spawns) this.markDirty(sp.x, sp.y); this.markDirty(0, 0); this.markDirty(World.w - 1, World.h - 1); }
    Power.dirty = true;
    this.stroke = null;
    this.flush(true);
  },

  // ------------------------------------------------------------ serialisation (compact map format)
  toMap() {
    const W = World.w, H = World.h, N = W * H;
    const enc = (arr, nameOf, keepEmpty) => {
      const names = new Map(), out = [];
      const pal = keepEmpty ? [''] : [];
      if (keepEmpty) names.set(0, 0);
      let prev = -1, run = 0;
      const push = () => { if (run) out.push(run === 1 ? String(prev) : `${prev}*${run}`); };
      for (let i = 0; i < N; i++) {
        let k = names.get(arr[i]);
        if (k === undefined) { k = pal.length; pal.push(nameOf(arr[i])); names.set(arr[i], k); }
        if (k === prev) run++; else { push(); prev = k; run = 1; }
      }
      push();
      return [out.join(','), pal];
    };
    const [floor, pf] = enc(World.floor, v => FLOOR_DEFS[v].name, false);
    const [ore, po] = enc(World.ore, v => v ? ITEMS[v - 1].name : '', true);
    const [wall, pw] = enc(World.wall, v => v ? WALL_DEFS[v - 1] : '', true);
    const [boulder, pb] = enc(World.bkind, v => v ? BOULDER_KINDS[v - 1] : '', true);
    const builds = Game.buildings.filter(b => !(b instanceof ConstructBuild) && !b.dead).map(b => this.buildData(b));
    const M = this.meta;
    const attack = builds.some(b => b[0] === 1 && b[1].startsWith('core-'));
    return { name: this.name, title: M.title || this.name, author: M.author, desc: M.desc, w: W, h: H, floor, ore, wall, boulder,
      pal: { floor: pf, ore: po, wall: pw, boulder: pb }, builds, spawns: World.spawns.map(s => [s.x, s.y]),
      groups: M.groups, winWave: M.winWave || 0, attack, waveSpacing: M.waveSpacing || 7200, initialWave: (M.waveSpacing || 7200) * 2,
      loadout: M.loadout, weather: M.weather, difficulty: 0, saved: Date.now() };
  },
  save(silent) {
    let name = this.name;
    if (!name) {
      name = (prompt('Map name', this.meta.title || 'My map') || '').trim();
      if (!name) return false;
      if (UserMaps.all()[name] && !confirm(`Replace the saved map "${name}"?`)) return false;
      this.name = name;
    }
    if (!this.meta.title || this.meta.title === 'New map') this.meta.title = name;
    if (!Game.byTeam.sharded.some(b => b.block.cls === 'Core')) { UI.toast('Place a core for your team (Blocks tab) before saving', 3, true); return false; }
    try { UserMaps.put(name, this.toMap()); } catch (e) { UI.toast('Browser storage is full: export the map to a file or delete old maps', 4, true); return false; }
    this.changed = false;
    if (!silent) { UI.toast(`Saved "${name}"`, 2); Audio2.play('uiButton'); }
    this.renderTop();
    return true;
  },
  exportFile() {
    const m = this.toMap(), blob = new Blob([JSON.stringify(m)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = (this.name || this.meta.title || 'map').replace(/[^\w.-]+/g, '_') + '.mlmap.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importFile(done) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const m = JSON.parse(await f.text());
        if (!m.w || !m.h || !m.floor || !m.pal) throw new Error('not a map');
        for (const n of m.pal.floor) if (!FLOOR[n]) throw new Error('unknown floor ' + n);
        let name = m.title || m.name || f.name.replace(/\..*$/, '');
        while (UserMaps.all()[name]) name += ' (2)';
        m.name = name; m.saved = Date.now();
        UserMaps.put(name, m);
        UI.toast(`Imported "${name}"`, 2);
        if (done) done(name);
      } catch (e) { UI.toast('Could not import: ' + e.message, 3, true); }
    };
    inp.click();
  },
  testPlay() {
    if (!this.save(true)) return;
    const name = 'user:' + this.name, idx = UserMaps.index(this.name);
    const mode = idx.spawns > 0 ? 'survival' : idx.teams > 1 ? 'attack' : 'sandbox';
    this.active = false;
    this.el.style.display = 'none';
    Custom.start({ map: name, mode, seed: 1, rules: Custom.baseRules(name, mode), fromEditor: this.name });
  },

  // ------------------------------------------------------------ UI
  buildUI() {
    if (this.el) return;
    const el = this.el = document.createElement('div');
    el.id = 'editorUI';
    el.style.cssText = 'position:fixed;inset:0;z-index:15;pointer-events:none;user-select:none';
    el.innerHTML = `
      <div id="edTop" class="panel" style="position:absolute;left:0;right:0;top:0;height:40px;display:flex;align-items:center;gap:6px;padding:0 8px;pointer-events:auto;background:rgba(20,20,24,0.96)"></div>
      <div id="edTools" class="panel" style="position:absolute;left:4px;top:48px;width:66px;display:flex;flex-direction:column;gap:3px;padding:4px;pointer-events:auto"></div>
      <div id="edPal" class="panel" style="position:absolute;right:4px;top:48px;bottom:4px;width:min(292px,46vw);display:flex;flex-direction:column;pointer-events:auto;background:rgba(20,20,24,0.96)">
        <div id="edTabs" style="display:flex;gap:2px;padding:4px"></div><div id="edExtra" style="padding:0 6px"></div>
        <div id="edGrid" style="flex:1;overflow:auto;display:flex;flex-wrap:wrap;gap:3px;padding:6px;align-content:flex-start"></div>
        <div id="edSel" style="padding:6px;font-size:12px;color:#ccc;border-top:2px solid #333"></div></div>
      <canvas id="edMini" class="panel" width="160" height="160" style="position:absolute;left:80px;bottom:4px;width:160px;height:160px;pointer-events:auto;image-rendering:pixelated;background:#000"></canvas>
      <div id="edHint" style="position:absolute;left:250px;bottom:6px;font-size:11px;color:#aaa;text-shadow:0 0 3px #000"></div>
      <div id="edModal" class="overlay hidden" style="pointer-events:auto"></div>`;
    document.body.appendChild(el);
    for (const id of ['edTop', 'edTools', 'edPal', 'edMini', 'edModal']) for (const ev of ['mousedown', 'pointerdown', 'wheel']) el.querySelector('#' + id).addEventListener(ev, e => e.stopPropagation());
    el.querySelector('#edMini').addEventListener('mousedown', e => {
      const r = e.target.getBoundingClientRect(), s = Math.max(World.w, World.h) / 160;
      const ox = (160 - World.w / s) / 2, oy = (160 - World.h / s) / 2;
      Render.camX = ((e.clientX - r.left) - ox) * s * TS; Render.camY = (160 - (e.clientY - r.top) - oy) * s * TS;
    });
    el.querySelector('#edHint').textContent = 'Left: paint · Right drag / WASD: move · Wheel: zoom · B/E/F/L/I/G tools · [ ] brush · R rotate · Ctrl+Z undo';
  },
  renderTop() {
    const t = this.el.querySelector('#edTop');
    t.innerHTML = `<span style="color:var(--accent)">Editor</span><span style="color:#ccc;font-size:13px;margin-right:auto">${this.name ? this.name : 'unsaved'}${this.changed ? ' *' : ''} · ${World.w}×${World.h}</span>
      <button id="edUndo">Undo</button><button id="edRules">Map info</button><button id="edSave">Save</button><button id="edExport">Export</button>
      <button id="edTest" class="accent">Test play</button><button id="edExit">Exit</button>`;
    t.querySelector('#edUndo').onclick = () => this.undo();
    t.querySelector('#edRules').onclick = () => this.showRules();
    t.querySelector('#edSave').onclick = () => this.save();
    t.querySelector('#edExport').onclick = () => this.exportFile();
    t.querySelector('#edTest').onclick = () => this.testPlay();
    t.querySelector('#edExit').onclick = () => { if (!this.changed || confirm('Leave the editor without saving?')) this.close(); };
  },
  TOOLS: [['pencil', 'B', 'Pencil'], ['line', 'L', 'Line'], ['fill', 'F', 'Fill'], ['eraser', 'E', 'Eraser'], ['pick', 'I', 'Pick'], ['spawn', 'G', 'Drop zone']],
  renderTools() {
    const t = this.el.querySelector('#edTools');
    let h = '';
    for (const [k, key, title] of this.TOOLS) h += `<button data-tool="${k}" title="${title} (${key})" style="padding:4px 0;font-size:11px;${this.tool === k ? 'border-color:var(--accent);color:var(--accent)' : ''}">${title.split(' ')[0]}</button>`;
    h += `<div style="text-align:center;font-size:11px;color:#aaa;margin-top:6px">Brush</div>`;
    for (const s of [1, 2, 3, 5, 9, 15]) h += `<button data-brush="${s}" style="padding:2px 0;font-size:11px;${this.brush === s ? 'border-color:var(--accent);color:var(--accent)' : ''}">${s}</button>`;
    t.innerHTML = h;
    for (const b of t.querySelectorAll('[data-tool]')) b.onclick = () => { this.tool = b.dataset.tool; this.renderTools(); };
    for (const b of t.querySelectorAll('[data-brush]')) b.onclick = () => { this.brush = +b.dataset.brush; this.renderTools(); };
    this.renderTop();
  },
  paletteItems() {
    if (this.tab === 'floor') return FLOOR_DEFS.map(f => ({ v: f.id, icon: f.variants ? f.name + '1' : f.name, title: titleCase(f.name) }));
    if (this.tab === 'wall') return WALL_DEFS.map((n, i) => ({ v: i + 1, icon: WALL_SINGLE.has(n) || WALL_TREE.has(n) ? n : n + '1', title: titleCase(n) }));
    if (this.tab === 'ore') return [{ v: 0, icon: null, title: 'No ore' }].concat(ORE_ITEMS.map(n => ({ v: Items[n].id + 1, icon: 'ore-' + n + '1', title: titleCase(n) + ' ore' })));
    if (this.tab === 'boulder') return BOULDER_KINDS.map((n, i) => ({ v: i + 1, icon: n + '1', title: titleCase(n) }));
    const cores = ['core-shard', 'core-foundation', 'core-nucleus'].map(n => BLOCKS[n]).filter(Boolean);
    const list = cores.concat(BLOCK_LIST.filter(b => b.buildable !== false && !cores.includes(b)));
    return list.map(b => ({ v: b, icon: 'icon:' + b.name, title: titleCase(b.name) }));
  },
  renderPalette() {
    const tabs = this.el.querySelector('#edTabs');
    tabs.innerHTML = [['floor', 'Floor'], ['wall', 'Walls'], ['ore', 'Ores'], ['boulder', 'Rocks'], ['block', 'Blocks']]
      .map(([k, n]) => `<button data-tab="${k}" style="flex:1;padding:3px 0;font-size:12px;${this.tab === k ? 'border-color:var(--accent);color:var(--accent)' : ''}">${n}</button>`).join('');
    for (const b of tabs.querySelectorAll('[data-tab]')) b.onclick = () => { this.tab = b.dataset.tab; if (this.tool === 'pick') this.tool = 'pencil'; this.renderPalette(); this.renderTools(); };
    const extra = this.el.querySelector('#edExtra');
    extra.innerHTML = this.tab === 'block' ? `<div style="display:flex;gap:3px;align-items:center;font-size:12px">Team ${EDITOR_TEAMS.map(t =>
      `<button data-team="${t}" style="flex:1;padding:2px 0;font-size:11px;color:${Teams[t] ? Teams[t].color.css : '#ccc'};${this.team === t ? 'border-color:var(--accent)' : ''}">${t}</button>`).join('')}</div>
      <div style="font-size:11px;color:#999;margin-top:3px">R: rotate (${'→↑←↓'[this.rotation]}) · right part of the map: your core is the Sharded core</div>` : '';
    for (const b of extra.querySelectorAll('[data-team]')) b.onclick = () => { this.team = b.dataset.team; this.renderPalette(); };
    const grid = this.el.querySelector('#edGrid');
    grid.innerHTML = '';
    const cur = this.sel[this.tab];
    for (const it of this.paletteItems()) {
      const d = document.createElement('div');
      d.className = 'bbtn'; d.title = it.title;
      d.style.cssText = `width:40px;height:40px;${it.v === cur ? 'border-color:var(--accent)' : ''}`;
      d.innerHTML = it.icon ? `<img src="${Assets.url(it.icon)}" style="width:32px;height:32px;image-rendering:pixelated">` : '<span style="font-size:18px">&times;</span>';
      d.onclick = () => { this.sel[this.tab] = it.v; if (this.tool === 'eraser' || this.tool === 'pick' || this.tool === 'spawn') this.tool = 'pencil'; this.renderPalette(); this.renderTools(); };
      grid.appendChild(d);
    }
    const s = this.paletteItems().find(i => i.v === cur);
    this.el.querySelector('#edSel').textContent = s ? s.title : 'Nothing selected';
  },
  updateMinimap(force) {
    if (!force && !this.minimapDirty) return;
    this.minimapDirty = false;
    World.buildMinimapBase();
    const c = this.el.querySelector('#edMini'), g = c.getContext('2d');
    const tmp = document.createElement('canvas'); tmp.width = World.w; tmp.height = World.h;
    tmp.getContext('2d').putImageData(World.minimapBase, 0, 0);
    const s = Math.max(World.w, World.h) / 160;
    g.fillStyle = '#000'; g.fillRect(0, 0, 160, 160);
    g.imageSmoothingEnabled = false;
    g.drawImage(tmp, (160 - World.w / s) / 2, (160 - World.h / s) / 2, World.w / s, World.h / s);
    this.miniImg = g.getImageData(0, 0, 160, 160);
  },
  drawMinimapMarks() {
    const c = this.el && this.el.querySelector('#edMini');
    if (!c || !this.miniImg) return;
    const g = c.getContext('2d');
    g.putImageData(this.miniImg, 0, 0);
    const s = Math.max(World.w, World.h) / 160, ox = (160 - World.w / s) / 2, oy = (160 - World.h / s) / 2;
    const toM = (wx, wy) => [ox + wx / TS / s, 160 - (oy + wy / TS / s)];
    for (const b of Game.buildings) if (b.block.cls === 'Core') { const [x, y] = toM(b.x, b.y); g.fillStyle = b.team === 'sharded' ? '#ffd37f' : b.team === 'crux' ? '#f25555' : '#777'; g.fillRect(x - 2, y - 2, 5, 5); }
    g.fillStyle = '#f25555';
    for (const sp of World.spawns) { const [x, y] = toM(sp.x * TS, sp.y * TS); g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
    const v = Render.view(), [x1, y1] = toM(v.x1, v.y2), [x2, y2] = toM(v.x2, v.y1);
    g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x1, y1, x2 - x1, y2 - y1);
  },
  showRules() {
    const M = this.meta, modal = this.el.querySelector('#edModal');
    const lo = Object.fromEntries(M.loadout || []);
    const wx = new Set((M.weather || []).map(w => w[0]));
    modal.innerHTML = `<div class="box panel" style="max-height:90vh;overflow:auto;min-width:320px">
      <h1>Map info</h1>
      <label style="font-size:13px">Title <input id="emTitle" value="${(M.title || '').replace(/"/g, '&quot;')}" style="width:100%"></label>
      <label style="font-size:13px">Author <input id="emAuthor" value="${(M.author || '').replace(/"/g, '&quot;')}" style="width:100%"></label>
      <label style="font-size:13px">Description <textarea id="emDesc" rows="3" style="width:100%">${(M.desc || '').replace(/</g, '&lt;')}</textarea></label>
      <label style="font-size:13px;display:flex;justify-content:space-between">Win wave (0 = none) <input id="emWin" type="number" min="0" value="${M.winWave || 0}" style="width:80px"></label>
      <label style="font-size:13px;display:flex;justify-content:space-between">Wave spacing (s) <input id="emSpacing" type="number" min="1" value="${Math.round((M.waveSpacing || 7200) / 60)}" style="width:80px"></label>
      <div style="font-size:13px;color:var(--accent)">Starting items</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px">${ITEMS.map(it => `<label style="font-size:11px;display:flex;align-items:center;gap:3px"><img src="${Assets.url(it.icon)}" style="width:16px;height:16px"><input data-lo="${it.name}" type="number" min="0" value="${lo[it.name] || 0}" style="width:52px"></label>`).join('')}</div>
      <div style="font-size:13px;color:var(--accent)">Weather</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${Object.entries(WEATHER_DEFS).map(([k, w]) => `<label style="font-size:12px"><input type="checkbox" data-wx="${k}" ${wx.has(k) ? 'checked' : ''}> ${w.title}</label>`).join('')}</div>
      <div style="font-size:11px;color:#999">Drop zones: ${World.spawns.length} (tool G). Enemy cores: ${Game.byTeam.crux.filter(b => b.block.cls === 'Core').length}. Waves use Mindustry's default wave table.</div>
      <button class="accent" id="emOk">Done</button></div>`;
    modal.classList.remove('hidden');
    modal.querySelector('#emOk').onclick = () => {
      M.title = modal.querySelector('#emTitle').value.trim() || M.title;
      M.author = modal.querySelector('#emAuthor').value.trim();
      M.desc = modal.querySelector('#emDesc').value.trim();
      M.winWave = Math.max(0, Math.round(+modal.querySelector('#emWin').value || 0));
      M.waveSpacing = Math.max(1, +modal.querySelector('#emSpacing').value || 120) * 60;
      M.loadout = [...modal.querySelectorAll('[data-lo]')].map(i => [i.dataset.lo, Math.max(0, Math.round(+i.value || 0))]).filter(([, v]) => v > 0);
      M.weather = [...modal.querySelectorAll('[data-wx]')].filter(i => i.checked).map(i => {
        const old = (this.meta.weather || []).find(w => w[0] === i.dataset.wx);
        const d = WEATHER_DEFS[i.dataset.wx].duration;
        return old || [i.dataset.wx, d * 2, d * 6, d / 2, d * 1.5, 1];
      });
      this.changed = true;
      modal.classList.add('hidden');
      this.renderTop();
    };
  },

  // ------------------------------------------------------------ input
  mouseTile(e) {
    const [wx, wy] = Render.screenToWorld(e.clientX, e.clientY);
    this.mouse = { x: e.clientX, y: e.clientY, wx, wy, tx: Math.round(wx / TS), ty: Math.round(wy / TS) };
    return this.mouse;
  },
  down(e) {
    if (!this.active || e.target !== Render.canvas) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const m = this.mouseTile(e);
    if (e.button === 2 || e.button === 1) { this.panning = { x: e.clientX, y: e.clientY, cx: Render.camX, cy: Render.camY, moved: false }; return; }
    if (e.button !== 0) return;
    this.beginStroke();
    if (this.tool === 'pick') { this.pickAt(m.tx, m.ty); this.stroke = null; return; }
    if (this.tool === 'fill') { this.fill(m.tx, m.ty); this.endStroke(); return; }
    if (this.tool === 'spawn') { this.toggleSpawn(m.tx, m.ty); this.endStroke(); return; }
    if (this.tool === 'line') { this.lineStart = [m.tx, m.ty]; return; }
    this.painting = true; this.last = [m.tx, m.ty];
    this.paintAt(m.tx, m.ty, this.tool === 'eraser');
  },
  move(e) {
    if (!this.active) return;
    const m = this.mouseTile(e);
    if (this.panning) {
      const p = this.panning, z = Render.zoom;
      Render.camX = p.cx - (e.clientX - p.x) / z; Render.camY = p.cy + (e.clientY - p.y) / z;
      p.moved = true;
      return;
    }
    if (this.painting && this.stroke) {
      const [lx, ly] = this.last;
      if (lx !== m.tx || ly !== m.ty) {
        if (this.tab === 'block') this.paintAt(m.tx, m.ty, this.tool === 'eraser');
        else for (const [x, y] of this.lineTiles(lx, ly, m.tx, m.ty).slice(1)) this.paintAt(x, y, this.tool === 'eraser');
        this.last = [m.tx, m.ty];
      }
    }
  },
  up(e) {
    if (!this.active) return;
    if (this.panning) {
      const p = this.panning;
      this.panning = null;
      // a right click without dragging erases (like right-click removing blocks in game)
      if (!p.moved && e.button === 2) { const m = this.mouseTile(e); this.beginStroke(); this.paintAt(m.tx, m.ty, true); this.endStroke(); }
      return;
    }
    if (this.lineStart && this.stroke) {
      const m = this.mouseTile(e), [sx, sy] = this.lineStart;
      for (const [x, y] of this.lineTiles(sx, sy, m.tx, m.ty)) this.paintAt(x, y, false);
      this.lineStart = null;
      this.endStroke();
      return;
    }
    if (this.painting) { this.painting = false; this.endStroke(); }
  },
  key(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const modal = this.el.querySelector('#edModal');
    if (!modal.classList.contains('hidden')) { if (e.code === 'Escape') modal.classList.add('hidden'); return; }
    Input.keys.add(e.code);
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); this.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); this.save(); return; }
    const tools = { KeyB: 'pencil', KeyL: 'line', KeyF: 'fill', KeyE: 'eraser', KeyI: 'pick', KeyG: 'spawn' };
    if (tools[e.code]) { this.tool = tools[e.code]; this.renderTools(); return; }
    if (e.code === 'KeyR') { this.rotation = (this.rotation + (e.shiftKey ? 3 : 1)) % 4; this.renderPalette(); return; }
    const sizes = [1, 2, 3, 5, 9, 15];
    if (e.code === 'BracketRight') { this.brush = sizes[Math.min(sizes.length - 1, sizes.indexOf(this.brush) + 1)]; this.renderTools(); }
    if (e.code === 'BracketLeft') { this.brush = sizes[Math.max(0, sizes.indexOf(this.brush) - 1)]; this.renderTools(); }
  },

  // per frame: camera keys, redraw edits, overlay
  frame() {
    const k = Input.keys, sp = 12 / Render.zoom * Time.frameDelta * (k.has('ShiftLeft') ? 2.5 : 1);
    if (k.has('KeyW') || k.has('ArrowUp')) Render.camY += sp;
    if (k.has('KeyS') || k.has('ArrowDown')) Render.camY -= sp;
    if (k.has('KeyA') || k.has('ArrowLeft')) Render.camX -= sp;
    if (k.has('KeyD') || k.has('ArrowRight')) Render.camX += sp;
    Render.camX = Mathf.clamp(Render.camX, 0, World.w * TS); Render.camY = Mathf.clamp(Render.camY, 0, World.h * TS);
    if (this.dirty) this.flush(false);
    if (Power.dirty) Power.rebuild ? (Power.rebuild(), Power.dirty = false) : 0;
  },
  overlay() {
    Render.begin();
    const m = this.mouse;
    if (m.tx === undefined) return;
    if (this.tab === 'block' && this.sel.block && this.tool !== 'eraser' && this.tool !== 'pick' && this.tool !== 'spawn' && this.tool !== 'fill') {
      const blk = this.sel.block, [px, py] = Input.placeTile(blk, m.wx, m.wy);
      Draw.setAlpha(0.6);
      Draw.rect('icon:' + blk.name, px * TS + blk.offset, py * TS + blk.offset, blk.size * TS, blk.size * TS, blk.rotate ? this.rotation * 90 : 0);
      Draw.setAlpha(1);
      Lines.set(Teams[this.team] ? Teams[this.team].color.css : '#fff', 1);
      Lines.rect(px * TS + blk.offset - blk.size * TS / 2, py * TS + blk.offset - blk.size * TS / 2, blk.size * TS, blk.size * TS);
    } else {
      const tiles = this.tool === 'line' && this.lineStart ? this.lineTiles(this.lineStart[0], this.lineStart[1], m.tx, m.ty) : [[m.tx, m.ty]];
      Lines.set(this.tool === 'eraser' ? '#e55454' : this.tool === 'spawn' ? '#f25555' : '#ffd37f', 1);
      const big = this.tool === 'pencil' || this.tool === 'eraser' || this.tool === 'line';
      for (const [x, y] of tiles) for (const [bx, by] of big ? this.brushTiles(x, y) : [[x, y]]) if (tiles.length < 400) Lines.rect(bx * TS - TS / 2, by * TS - TS / 2, TS, TS);
    }
    this.drawMinimapMarks();
  },
};

// ---------------------------------------------------------------- hooks
{
  const _rf = renderFrame;
  renderFrame = function () {
    if (!Editor.active) return _rf.apply(this, arguments);
    Editor.frame();
    Time.time += Time.frameDelta;
    const pc = Game.playerCore;
    Game.playerCore = () => null; // no camera follow
    try { _rf.apply(this, arguments); } finally { Game.playerCore = pc; }
    Editor.overlay();
  };
  const _uu = UI.update;
  UI.update = function () { if (Editor.active) return; return _uu.apply(this, arguments); };
  const _key = Input.keyDown;
  Input.keyDown = function (e) { if (Editor.active) return Editor.key(e); return _key.call(this, e); };
  window.addEventListener('mousedown', e => Editor.down(e), true);
  window.addEventListener('mousemove', e => Editor.move(e), true);
  window.addEventListener('mouseup', e => Editor.up(e), true);
  window.addEventListener('wheel', e => {
    if (!Editor.active || e.target !== Render.canvas) return;
    e.preventDefault(); e.stopImmediatePropagation();
    Render.targetZoom = Mathf.clamp(Render.targetZoom * Math.pow(1.0015, -e.deltaY), 1, 8);
  }, { capture: true, passive: false });

  // user maps in the custom game dialog
  const _idx = Custom.index;
  Custom.index = function (name) { return name && name.startsWith('user:') ? UserMaps.index(name.slice(5)) : _idx.call(this, name); };
  const _map = Custom.map;
  Custom.map = function (name) { return name && name.startsWith('user:') ? UserMaps.get(name.slice(5)) : _map.call(this, name); };
  const _open = CustomUI.open;
  CustomUI.open = async function () {
    await _open.apply(this, arguments);
    if (this.sel && this.sel.startsWith('user:') && !Custom.index(this.sel)) this.select(MAP_INDEX[0].name);
    const list = this.el.querySelector('#cgMaps');
    for (const d of [...list.querySelectorAll('[data-user]')]) d.remove();
    for (const n of UserMaps.names()) {
      const idx = UserMaps.index(n), m = UserMaps.get(n);
      const d = document.createElement('div');
      d.dataset.map = 'user:' + n; d.dataset.user = '1';
      d.style.cssText = 'width:120px;cursor:pointer;border:3px solid #555;background:#111;box-sizing:border-box';
      const cv = SectorUI.previewMap('user:' + n + '@' + idx.saved, m);
      cv.style.cssText = 'width:114px;height:114px;image-rendering:pixelated;display:block';
      d.appendChild(cv);
      d.insertAdjacentHTML('beforeend', `<div style="padding:3px 4px;font-size:12px;color:#ffd37f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div><div style="padding:0 4px 4px;font-size:10px;color:#888">${idx.w}×${idx.h} · your map</div>`);
      d.children[1].textContent = idx.title;
      d.onclick = () => { this.select('user:' + n); Audio2.play('click', undefined, undefined, 0.3); };
      list.appendChild(d);
    }
    this.render();
  };
  const _render = CustomUI.render;
  CustomUI.render = function () {
    _render.apply(this, arguments);
    const info = this.el.querySelector('#cgInfo');
    const name = this.sel && this.sel.startsWith('user:') ? this.sel.slice(5) : null;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-top:6px';
    if (name) {
      row.innerHTML = '<button id="cgEdit" style="flex:1">Edit map</button><button id="cgDel" style="flex:1">Delete map</button>';
      row.querySelector('#cgEdit').onclick = () => { this.close(); Editor.open(UserMaps.get(name), name); };
      row.querySelector('#cgDel').onclick = () => { if (confirm(`Delete "${name}"?`)) { UserMaps.remove(name); this.sel = MAP_INDEX[0].name; this.open(); } };
    } else if (this.sel) {
      row.innerHTML = '<button id="cgEdit" style="flex:1">Open a copy in the editor</button>';
      row.querySelector('#cgEdit').onclick = () => { this.close(); const m = JSON.parse(JSON.stringify(Custom.map(this.sel))); const idx = Custom.index(this.sel); Editor.open(m, '', { title: idx.title + ' (edit)', author: idx.author, desc: idx.desc }); };
    }
    if (row.innerHTML) info.appendChild(row);
  };
}

// ---------------------------------------------------------------- editor start screen (new / open / import) + back from test play
const EditorHome = {
  open() {
    UI.initAudio();
    let el = document.getElementById('edHome');
    if (!el) {
      el = document.createElement('div');
      el.id = 'edHome'; el.className = 'overlay';
      el.style.zIndex = 26;
      document.body.appendChild(el);
      for (const ev of ['mousedown', 'pointerdown', 'wheel', 'keydown']) el.addEventListener(ev, e => e.stopPropagation());
    }
    const user = UserMaps.names();
    el.innerHTML = `<div class="box panel" style="max-height:90vh;overflow:auto;min-width:340px">
      <h1>Map editor</h1>
      <div style="display:flex;gap:6px;align-items:center;font-size:13px">New map <input id="ehW" type="number" value="200" min="50" max="500" style="width:60px"> × <input id="ehH" type="number" value="200" min="50" max="500" style="width:60px">
        <button id="ehNew" class="accent" style="flex:1">Create</button></div>
      <button id="ehImport">Import map file</button>
      <div style="color:var(--accent);font-size:13px;margin-top:6px">Your maps</div>
      <div id="ehUser" style="display:flex;flex-direction:column;gap:3px">${user.length ? '' : '<span style="color:#888;font-size:12px">None yet</span>'}</div>
      <div style="color:var(--accent);font-size:13px;margin-top:6px">Copy a built-in map</div>
      <select id="ehBase" style="font:inherit;background:#222;color:#eee;border:2px solid #444;padding:3px">
        ${MAP_INDEX.map(m => `<option value="${m.name}">${m.title}</option>`).join('')}
        ${Sectors.order.map(n => `<option value="sector:${n}">Sector: ${Sectors.title(n)}</option>`).join('')}</select>
      <button id="ehCopy">Open copy</button>
      <button id="ehClose">Close</button></div>`;
    const userEl = el.querySelector('#ehUser');
    for (const n of user) {
      const b = document.createElement('button');
      b.textContent = n; b.onclick = () => { el.classList.add('hidden'); Editor.open(UserMaps.get(n), n); };
      userEl.appendChild(b);
    }
    el.querySelector('#ehNew').onclick = () => {
      const w = Mathf.clamp(Math.round(+el.querySelector('#ehW').value || 200), 50, 500), h = Mathf.clamp(Math.round(+el.querySelector('#ehH').value || 200), 50, 500);
      el.classList.add('hidden'); Editor.open(Editor.blankMap(w, h), '');
    };
    el.querySelector('#ehImport').onclick = () => Editor.importFile(() => this.open());
    el.querySelector('#ehCopy').onclick = async () => {
      await Sectors.ready;
      const v = el.querySelector('#ehBase').value;
      const isSector = v.startsWith('sector:'), src = isSector ? Sectors.map(v.slice(7)) : Custom.map(v);
      if (!src) { UI.toast('Map still loading', 2); return; }
      const m = JSON.parse(JSON.stringify(src));
      const title = (isSector ? Sectors.title(v.slice(7)) : Custom.index(v).title) + ' (edit)';
      if (!m.groups) m.groups = WAVE_GROUPS;
      el.classList.add('hidden');
      Editor.open(m, '', { title });
    };
    el.querySelector('#ehClose').onclick = () => el.classList.add('hidden');
    el.classList.remove('hidden');
  },
};

(() => {
  const _init = UI.init;
  UI.init = function () {
    _init.apply(this, arguments);
    $('editorBtn').onclick = async () => { await Sectors.ready; EditorHome.open(); };
    // "Back to editor" while test-playing an editor map
    const back = document.createElement('button');
    back.id = 'backToEditor'; back.textContent = 'Back to editor';
    back.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:21;display:none';
    back.onclick = () => {
      const n = Custom.current && Custom.current.fromEditor;
      if (!n) return;
      for (const id of ['pause', 'gameover', 'cgWin']) { const o = document.getElementById(id); if (o) o.classList.add('hidden'); }
      Custom.current = null; Custom.activeMap = null;
      Editor.open(UserMaps.get(n), n);
    };
    document.body.appendChild(back);
    setInterval(() => { back.style.display = Custom.current && Custom.current.fromEditor && !Editor.active && Game.state !== 'title' ? '' : 'none'; }, 300);
  };
})();
