// Schematics (game/Schematics.java, io/TypeIO.java): copy an area with F, place it as build plans (R rotate, Z / X flip),
// save a library, and import / export Mindustry's base64 "msch" format so real schematics paste straight in.

// ---------------------------------------------------------------- binary helpers (DataOutputStream, big-endian)
function modUtf8(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 1 && c <= 0x7f) out.push(c);
    else if (c <= 0x7ff) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
class BinW {
  constructor() { this.a = []; this.dv = new DataView(new ArrayBuffer(8)); }
  u8(v) { this.a.push(v & 255); }
  i16(v) { this.u8(v >> 8); this.u8(v); }
  i32(v) { this.u8(v >>> 24); this.u8(v >>> 16); this.u8(v >>> 8); this.u8(v); }
  f32(v) { this.dv.setFloat32(0, v); for (let i = 0; i < 4; i++) this.u8(this.dv.getUint8(i)); }
  utf(s) { const b = modUtf8(s); this.i16(b.length); for (const x of b) this.u8(x); }
  bytes(arr) { for (const x of arr) this.u8(x); }
  out() { return Uint8Array.from(this.a); }
}
class BinR {
  constructor(u8) { this.b = u8; this.p = 0; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }
  u8() { return this.b[this.p++]; }
  i8() { const v = this.dv.getInt8(this.p); this.p += 1; return v; }
  i16() { const v = this.dv.getInt16(this.p); this.p += 2; return v; }
  u16() { const v = this.dv.getUint16(this.p); this.p += 2; return v; }
  i32() { const v = this.dv.getInt32(this.p); this.p += 4; return v; }
  i64() { const v = this.dv.getBigInt64(this.p); this.p += 8; return Number(v); }
  f32() { const v = this.dv.getFloat32(this.p); this.p += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.p); this.p += 8; return v; }
  bytes(n) { const v = this.b.slice(this.p, this.p + n); this.p += n; return v; }
  utf() {
    const n = this.u16(), end = this.p + n; let s = '';
    while (this.p < end) {
      const a = this.b[this.p++];
      if (a < 0x80) s += String.fromCharCode(a);
      else if ((a & 0xe0) === 0xc0) s += String.fromCharCode(((a & 31) << 6) | (this.b[this.p++] & 63));
      else { const b = this.b[this.p++], c = this.b[this.p++]; s += String.fromCharCode(((a & 15) << 12) | ((b & 63) << 6) | (c & 63)); }
    }
    return s;
  }
}
async function zPipe(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
const zInflate = u8 => zPipe(u8, new DecompressionStream('deflate'));
const zDeflate = u8 => zPipe(u8, new CompressionStream('deflate'));
const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s.trim().replace(/\s+/g, '')), c => c.charCodeAt(0));
const unpack2 = p => [p >> 16, (p << 16) >> 16];
const pack2 = (x, y) => ((x & 0xffff) << 16) | (y & 0xffff);

// content types (ContentType ordinals): item 0, block 1, liquid 4, unit 6
const CT = { item: 0, block: 1, liquid: 4, unit: 6 };
const CT_LIST = { 0: () => L_ITEMS, 4: () => L_LIQUIDS, 6: () => L_UNITS, 1: () => BLOCK_LIST.map(b => b.name) };

// ---------------------------------------------------------------- TypeIO objects
function readObj(r) {
  const t = r.u8();
  switch (t) {
    case 0: return null;
    case 1: return { int: r.i32() };
    case 2: return { int: r.i64() };
    case 3: return { num: r.f32() };
    case 4: return r.u8() ? { str: r.utf() } : null;
    case 5: { const ct = r.u8(), id = r.i16(); return { content: [ct, id] }; }
    case 6: { const n = r.i16(), a = []; for (let i = 0; i < n; i++) a.push(r.i32()); return { ints: a }; }
    case 7: return { point: [r.i32(), r.i32()] };
    case 8: { const n = r.u8(), a = []; for (let i = 0; i < n; i++) a.push(unpack2(r.i32())); return { points: a }; }
    case 9: { r.u8(); r.i16(); return null; }
    case 10: return { bool: r.u8() !== 0 };
    case 11: return { num: r.f64() };
    case 12: r.i32(); return null;
    case 13: r.i16(); return null;
    case 14: { const n = r.i32(); return { bytes: r.bytes(n) }; }
    case 16: { const n = r.i32(); r.bytes(n); return null; }
    case 17: r.i32(); return null;
    case 18: { const n = r.i16(); for (let i = 0; i < n; i++) { r.f32(); r.f32(); } return null; }
    case 19: r.f32(); r.f32(); return null;
    case 20: r.u8(); return null;
    case 21: { const n = r.i16(), a = []; for (let i = 0; i < n; i++) a.push(r.i32()); return { ints: a }; }
    case 22: { const n = r.i32(); for (let i = 0; i < n; i++) readObj(r); return null; }
    case 23: r.i16(); return null;
  }
  throw new Error('unsupported config type ' + t);
}
function writeObj(w, c, contentIds) {
  if (!c) { w.u8(0); return; }
  if (c.item || c.unit || c.liquid || c.block) {
    const kind = c.item ? 'item' : c.unit ? 'unit' : c.liquid ? 'liquid' : 'block', name = c[kind];
    if (kind === 'block') { w.u8(0); return; } // Lite's block order isn't Mindustry's; leave block configs out
    const ct = CT[kind], i = CT_LIST[ct]().indexOf(name);
    if (i < 0) { w.u8(0); return; }
    w.u8(5); w.u8(ct); w.i16(i); return;
  }
  if ('int' in c) { w.u8(1); w.i32(c.int); return; }
  if ('str' in c) { w.u8(4); w.u8(1); w.utf(c.str); return; }
  if ('bool' in c) { w.u8(10); w.u8(c.bool ? 1 : 0); return; }
  if (c.point) { w.u8(7); w.i32(c.point[0]); w.i32(c.point[1]); return; }
  if (c.points) { w.u8(8); w.u8(c.points.length); for (const p of c.points) w.i32(pack2(p[0], p[1])); return; }
  if (c.bytes) { w.u8(14); w.i32(c.bytes.length); w.bytes(c.bytes); return; }
  w.u8(0);
}

// processor config: deflated {version, code, links (relative)} (LogicBlock.compress)
async function decodeLogic(bytes) {
  const r = new BinR(await zInflate(bytes));
  const ver = r.u8(), n = r.i32();
  const code = new TextDecoder().decode(r.bytes(n));
  const links = [];
  const total = r.i32();
  if (ver !== 0) for (let i = 0; i < total; i++) links.push({ name: r.utf(), x: r.i16(), y: r.i16() });
  return { logic: { code, links } };
}
async function encodeLogic(lg) {
  const w = new BinW(), code = new TextEncoder().encode(lg.code);
  w.u8(1); w.i32(code.length); w.bytes(code); w.i32(lg.links.length);
  for (const l of lg.links) { w.utf(l.name); w.i16(l.x); w.i16(l.y); }
  return zDeflate(w.out());
}

// ---------------------------------------------------------------- read / write msch
async function readSchematic(b64) {
  const raw = fromB64(b64);
  if (String.fromCharCode(raw[0], raw[1], raw[2], raw[3]) !== 'msch') throw new Error('Not a schematic (missing header)');
  const ver = raw[4];
  if (ver > 1) throw new Error('Schematic from a newer game version');
  const r = new BinR(await zInflate(raw.subarray(5)));
  const width = r.i16(), height = r.i16();
  if (width > 128 || height > 128) throw new Error('Schematic too large');
  const tags = {};
  const nt = r.u8();
  for (let i = 0; i < nt; i++) tags[r.utf()] = r.utf();
  let idToName = {};
  try {
    const cm = JSON.parse(tags.contentMap || '{}');
    for (const ct in cm) { idToName[ct] = {}; for (const name in cm[ct]) idToName[ct][cm[ct][name]] = name; }
  } catch (e) { idToName = {}; }
  const nb = r.u8(), names = [];
  for (let i = 0; i < nb; i++) names.push(r.utf());
  const total = r.i32();
  if (total > 128 * 128) throw new Error('Too many blocks');
  const tiles = [], missing = new Set();
  for (let i = 0; i < total; i++) {
    const bi = r.i8(), pos = r.i32();
    let cfg = ver === 0 ? { int: r.i32() } : readObj(r);
    const rot = r.u8() & 3;
    const name = names[bi];
    if (!BLOCKS[name] || !BLOCKS[name].buildable) { if (name && name !== 'air') missing.add(name); continue; }
    if (cfg && cfg.content) {
      const [ct, id] = cfg.content;
      const nm = (idToName[ct] && idToName[ct][id]) || (CT_LIST[ct] ? CT_LIST[ct]()[id] : null);
      cfg = ct === 0 ? { item: nm } : ct === 4 ? { liquid: nm } : ct === 6 ? { unit: nm } : ct === 1 ? { block: nm } : null;
    }
    if (cfg && cfg.bytes) { if (BLOCKS[name].cls === 'LogicProcessor') { try { cfg = await decodeLogic(cfg.bytes); } catch (e) { cfg = null; } } else cfg = null; }
    if (cfg && (cfg.ints || 'num' in cfg)) cfg = null;
    const [x, y] = unpack2(pos);
    tiles.push({ block: name, x, y, rot, cfg });
  }
  return { name: tags.name || 'Imported', description: tags.description || '', width, height, tiles, missing: [...missing] };
}
async function writeSchematic(s) {
  const w = new BinW(), contentIds = {};
  const tw = new BinW(); // tiles first (they fill contentIds)
  const names = [...new Set(s.tiles.map(t => t.block))];
  tw.i32(s.tiles.length);
  for (const t of s.tiles) {
    tw.u8(names.indexOf(t.block)); tw.i32(pack2(t.x, t.y));
    let cfg = t.cfg;
    if (cfg && cfg.logic) cfg = { bytes: await encodeLogic(cfg.logic) };
    writeObj(tw, cfg, contentIds);
    tw.u8(t.rot);
  }
  w.i16(s.width); w.i16(s.height);
  const tags = { name: s.name || 'Schematic', description: s.description || '', labels: '[]' };
  w.u8(Object.keys(tags).length);
  for (const k in tags) { w.utf(k); w.utf(tags[k]); }
  w.u8(names.length); for (const n of names) w.utf(n);
  w.bytes(tw.out());
  const body = await zDeflate(w.out());
  const out = new Uint8Array(5 + body.length);
  out.set([109, 115, 99, 104, 1]); out.set(body, 5);
  return toB64(out);
}

// ---------------------------------------------------------------- create from the world (Schematics.create)
function blockConfig(b) {
  const rel = o => [o.tx - b.tx, o.ty - b.ty];
  if (b instanceof Sorter || b instanceof Unloader) return b.sortItem ? { item: b.sortItem.name } : null;
  if (b instanceof UnitFactory) return b.currentPlan >= 0 ? { int: b.currentPlan } : null;
  if (b instanceof MassDriver) return b.link && !b.link.dead ? { point: rel(b.link) } : null;
  if (b instanceof ItemBridge) return b.link && !b.link.dead ? { point: rel(b.link) } : null;
  if (b instanceof PowerNode) return b.power.links.length ? { points: b.power.links.filter(o => !o.dead).map(rel) } : null;
  if (b instanceof LogicProcessor) return { logic: { code: b.code, links: b.links.filter(l => !l.b.dead).map(l => ({ name: l.name, x: l.b.tx - b.tx, y: l.b.ty - b.ty })) } };
  if (b instanceof MessageBlock) return b.text ? { str: b.text } : null;
  if (b instanceof SwitchBlock) return { bool: !!b.on };
  if (b instanceof Door) return { bool: !!b.open };
  if (b instanceof Illuminator) { const h = LIGHT_COLORS[b.colorIdx] || 'ffffff'; return { int: (parseInt(h + 'ff', 16) | 0) }; }
  if (b instanceof PayloadConveyor && b.block.router) return b.sortUnit ? { unit: b.sortUnit } : null;
  return null;
}
function createSchematic(x1, y1, x2, y2) {
  const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)], [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
  const seen = new Set();
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    if (!World.inside(x, y)) continue;
    const b = World.build[y * World.w + x];
    if (b && !b.dead && b.team === 'sharded' && !(b instanceof ConstructBuild) && b.block.buildable) seen.add(b);
  }
  if (!seen.size) return null;
  const list = [...seen];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of list) { minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY); maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY); }
  return {
    name: 'Schematic', width: maxX - minX + 1, height: maxY - minY + 1,
    tiles: list.map(b => ({ block: b.block.name, x: b.tx - minX, y: b.ty - minY, rot: b.block.rotate ? b.rotation : 0, cfg: blockConfig(b) })),
  };
}

// ---------------------------------------------------------------- transforms (rotate / flip), positions in world space
function transformSchematic(s, fn, cfgFn, rotFn) {
  const px = (s.width - 1) * TS / 2, py = (s.height - 1) * TS / 2;
  for (const t of s.tiles) {
    const blk = BLOCKS[t.block], o = blk.offset;
    const [wx, wy] = fn(t.x * TS + o - px, t.y * TS + o - py);
    t.x = Math.round((wx + px - o) / TS); t.y = Math.round((wy + py - o) / TS);
    if (blk.rotate) t.rot = rotFn(t.rot);
    if (t.cfg) {
      if (t.cfg.point) t.cfg.point = cfgFn(t.cfg.point);
      if (t.cfg.points) t.cfg.points = t.cfg.points.map(cfgFn);
      if (t.cfg.logic) t.cfg.logic.links.forEach(l => { [l.x, l.y] = cfgFn([l.x, l.y]); });
    }
  }
  // normalise back to a 0-based bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of s.tiles) { const b = BLOCKS[t.block]; minX = Math.min(minX, t.x + b.sizeOffset); minY = Math.min(minY, t.y + b.sizeOffset); maxX = Math.max(maxX, t.x + b.sizeOffset + b.size - 1); maxY = Math.max(maxY, t.y + b.sizeOffset + b.size - 1); }
  for (const t of s.tiles) { t.x -= minX; t.y -= minY; }
  s.width = maxX - minX + 1; s.height = maxY - minY + 1;
}
const Schem = {
  rotate(s) { transformSchematic(s, (x, y) => [-y, x], ([x, y]) => [-y, x], r => (r + 1) % 4); },
  flipX(s) { transformSchematic(s, (x, y) => [-x, y], ([x, y]) => [-x, y], r => r % 2 === 0 ? (r + 2) % 4 : r); },
  flipY(s) { transformSchematic(s, (x, y) => [x, -y], ([x, y]) => [x, -y], r => r % 2 === 1 ? (r + 2) % 4 : r); },
  clone(s) { return JSON.parse(JSON.stringify(s)); },
  current: null, selStart: null,
  plansAt(s, cx, cy) {
    const ox = cx - Math.floor(s.width / 2), oy = cy - Math.floor(s.height / 2);
    // place the block's footprint, not just its origin, inside the box
    return s.tiles.map(t => ({ block: BLOCKS[t.block], x: t.x + ox, y: t.y + oy, rotation: t.rot, cfg: t.cfg }));
  },
  place(s, cx, cy) {
    let n = 0;
    for (const pl of this.plansAt(s, cx, cy)) {
      const before = Game.player ? Game.player.plans.length : 0;
      Input.addPlan({ block: pl.block, x: pl.x, y: pl.y, rotation: pl.rotation, config: pl.cfg ? { schem: pl.cfg } : undefined });
      if (Game.player && Game.player.plans.length > before) n++;
    }
    return n;
  },
  cost(s) {
    const tot = {};
    for (const t of s.tiles) for (const r of BLOCKS[t.block].requirements) tot[r.item.name] = (tot[r.item.name] || 0) + r.amount;
    return tot;
  },
};

// ---------------------------------------------------------------- applying configs when schematic blocks finish building
const SchemPending = [];
function applySchemConfig(b, cfg) {
  const abs = p => [b.tx + p[0], b.ty + p[1]];
  if (cfg.item && (b instanceof Sorter || b instanceof Unloader)) b.configure(Items[cfg.item] || null);
  else if ('int' in cfg && b instanceof UnitFactory) b.configure(cfg.int);
  else if (cfg.unit && b instanceof PayloadConveyor) b.sortUnit = cfg.unit;
  else if ('str' in cfg && b instanceof MessageBlock) b.text = cfg.str;
  else if ('bool' in cfg && b instanceof SwitchBlock) b.on = cfg.bool;
  else if ('bool' in cfg && b instanceof Door) b.open = cfg.bool;
  else if ('int' in cfg && b instanceof Illuminator) { const h = ((cfg.int >>> 8) & 0xffffff).toString(16).padStart(6, '0'); if (!LIGHT_COLORS.includes(h)) LIGHT_COLORS.push(h); b.colorIdx = LIGHT_COLORS.indexOf(h); }
  else if (cfg.point && (b instanceof ItemBridge || b instanceof MassDriver)) SchemPending.push({ b, kind: 'link', at: abs(cfg.point), t: Time.time });
  else if (cfg.points && b instanceof PowerNode) {
    for (const o of [...b.power.links]) Power.unlink(b, o); // schematic links replace auto-linking
    SchemPending.push({ b, kind: 'power', at: cfg.points.map(abs), t: Time.time });
  } else if (cfg.logic && b instanceof LogicProcessor) {
    b.setCode(cfg.logic.code);
    SchemPending.push({ b, kind: 'logic', links: cfg.logic.links.map(l => ({ name: l.name, at: abs([l.x, l.y]) })), t: Time.time });
  }
}
function updateSchemPending() {
  for (let i = SchemPending.length - 1; i >= 0; i--) {
    const e = SchemPending[i], b = e.b;
    if (b.dead || Time.time - e.t > 60 * 60 * 20) { SchemPending.splice(i, 1); continue; }
    if (e.kind === 'link') {
      const o = World.buildAt(e.at[0], e.at[1]);
      if (o && !(o instanceof ConstructBuild) && o.block === b.block) { if (b.link !== o) b.configure(o); SchemPending.splice(i, 1); } // configure toggles, so only set it once
    } else if (e.kind === 'power') {
      e.at = e.at.filter(([x, y]) => { const o = World.buildAt(x, y); if (o && o.power && !(o instanceof ConstructBuild)) { Power.link(b, o); return false; } return true; });
      if (!e.at.length) SchemPending.splice(i, 1);
    } else if (e.kind === 'logic') {
      e.links = e.links.filter(l => { const o = World.buildAt(l.at[0], l.at[1]); if (o && o !== b && !(o instanceof ConstructBuild)) { if (!b.isLinked(o)) b.links.push({ b: o, name: l.name }); return false; } return true; });
      if (!e.links.length) SchemPending.splice(i, 1);
    }
  }
}
{
  const _fc = Game.finishConstruct;
  Game.finishConstruct = function (cb) {
    const sc = cb.config && cb.config.schem;
    if (sc) cb.config = null;
    const b = _fc.call(this, cb);
    if (b && sc) applySchemConfig(b, sc);
    return b;
  };
  const _gu = Game.update;
  let n = 0;
  Game.update = function () { _gu.call(this); if (SchemPending.length && ++n % 15 === 0) updateSchemPending(); };
}

// ---------------------------------------------------------------- input: F select, click place, R / Z / X transform, T library
const SCHEM_KEY = 'mindustry-lite-schematics';
const SchemLib = {
  list() { try { return JSON.parse(localStorage.getItem(SCHEM_KEY) || '[]'); } catch (e) { return []; } },
  saveList(l) { try { localStorage.setItem(SCHEM_KEY, JSON.stringify(l)); return true; } catch (e) { return false; } },
  async add(s, name) { s = Schem.clone(s); s.name = name; const code = await writeSchematic(s); const l = this.list(); l.push({ name, code }); return this.saveList(l) ? code : null; },
};
{
  const _down = Input.mouseDown.bind(Input);
  Input.mouseDown = function (e) {
    if (Schem.current && Game.state === 'playing' && !Command.active()) {
      this.updateWorldMouse();
      if (e.button === 0) {
        const n = Schem.place(Schem.current, this.tile[0], this.tile[1]);
        UI.toast(n ? `Queued ${n} block${n === 1 ? '' : 's'}` : 'Nothing could be placed here', 1.2);
        Audio2.play('place', undefined, undefined, 0.4);
        return;
      }
      if (e.button === 2) { Schem.current = null; return; }
    }
    return _down(e);
  };
  const _key = Input.keyDown.bind(Input);
  Input.keyDown = function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (Game.state === 'playing') {
      if (e.code === 'KeyF' && !e.repeat) { this.updateWorldMouse(); Schem.selStart = this.tile.slice(); this.select(null); return; }
      if (e.code === 'KeyT') { UI.openSchematics && UI.openSchematics(); return; }
      if (Schem.current) {
        if (e.code === 'KeyR') { Schem.rotate(Schem.current); Audio2.play('rotate', undefined, undefined, 0.3); return; }
        if (e.code === 'KeyZ') { Schem.flipX(Schem.current); Audio2.play('rotate', undefined, undefined, 0.3); return; }
        if (e.code === 'KeyX') { Schem.flipY(Schem.current); Audio2.play('rotate', undefined, undefined, 0.3); return; }
        if (e.code === 'Escape') { Schem.current = null; return; }
      }
    }
    return _key(e);
  };
  window.addEventListener('keyup', e => {
    if (e.code !== 'KeyF' || !Schem.selStart) return;
    const [x0, y0] = Schem.selStart; Schem.selStart = null;
    if (Game.state !== 'playing') return;
    Input.updateWorldMouse();
    const s = createSchematic(x0, y0, Input.tile[0], Input.tile[1]);
    if (!s) { UI.toast('No blocks there to copy', 1.2); return; }
    Schem.current = s;
    UI.toast(`Copied ${s.tiles.length} block${s.tiles.length === 1 ? '' : 's'}: click to place, R rotate, Z / X flip, T to save`, 3);
  });
  const _draw = Input.drawWorld.bind(Input);
  Input.drawWorld = function () {
    _draw();
    if (Schem.selStart) {
      const [x0, y0] = Schem.selStart, [x1, y1] = this.tile;
      const ax = Math.min(x0, x1) * TS - 4, ay = Math.min(y0, y1) * TS - 4, w = (Math.abs(x1 - x0) + 1) * TS, h = (Math.abs(y1 - y0) + 1) * TS;
      Draw.setAlpha(0.15); Fill.set(Pal.accent.css); Fill.rect(ax + w / 2, ay + h / 2, w, h); Draw.setAlpha(1);
      Lines.set(rgba(Pal.accent, 0.9), 1); Lines.rect(ax, ay, w, h);
      UI.worldLabel && UI.worldLabel(ax + w / 2, ay + h + 6, `${Math.abs(x1 - x0) + 1} x ${Math.abs(y1 - y0) + 1}`);
    }
    if (Schem.current && Game.state === 'playing') {
      for (const pl of Schem.plansAt(Schem.current, this.tile[0], this.tile[1])) {
        const ok = Game.validPlace(pl.block, pl.x, pl.y, pl.rotation);
        this.drawPlan({ block: pl.block, x: pl.x, y: pl.y, rotation: pl.rotation }, false, ok ? 'place' : 'invalid');
      }
    }
  };
}
