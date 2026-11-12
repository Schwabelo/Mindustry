// Logic: message, switch, micro/logic/hyper processors, memory cell/bank, logic displays. Processors run mlog text
// (the same format Mindustry copies to the clipboard), parsed and executed like logic/LParser.java + LExecutor.java.

// ================================================================ content ids (Mindustry's content order, for lookup / @id)
const L_ITEMS = ['copper', 'lead', 'metaglass', 'graphite', 'sand', 'coal', 'titanium', 'thorium', 'scrap', 'silicon', 'plastanium',
  'phase-fabric', 'surge-alloy', 'spore-pod', 'blast-compound', 'pyratite'];
const L_LIQUIDS = ['water', 'slag', 'oil', 'cryofluid'];
const L_UNITS = ['dagger', 'mace', 'fortress', 'scepter', 'reign', 'nova', 'pulsar', 'quasar', 'vela', 'corvus', 'crawler', 'atrax', 'spiroct',
  'arkyid', 'toxopid', 'flare', 'horizon', 'zenith', 'antumbra', 'eclipse', 'mono', 'poly', 'mega', 'quad', 'oct', 'risso', 'minke', 'bryde', 'sei',
  'omura', 'retusa', 'oxynoe', 'cyerce', 'aegires', 'navanax', 'alpha', 'beta', 'gamma'];
function contentKind(o) {
  if (!o || typeof o !== 'object') return null;
  if (o instanceof Building || o instanceof Unit) return null;
  if (ITEMS.includes(o)) return 'item';
  if (LIQUIDS.includes(o)) return 'liquid';
  if (Object.values(UNITS).includes(o)) return 'unit';
  if (o.cls) return 'block';
  return null;
}
function contentId(o) {
  const k = contentKind(o);
  if (k === 'item') return L_ITEMS.indexOf(o.name);
  if (k === 'liquid') return L_LIQUIDS.indexOf(o.name);
  if (k === 'unit') return L_UNITS.indexOf(o.name);
  if (k === 'block') return BLOCK_LIST.indexOf(o);
  return -1;
}
const TEAM_IDS = { derelict: 0, sharded: 1, crux: 2 };

// ================================================================ values
function lnum(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return 0;
  return 1; // objects and strings count as 1 (LVar.num)
}
function lstr(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') {
    if (Math.abs(v - Math.round(v)) < 0.00001) return String(Math.round(v));
    return String(parseFloat(v.toFixed(5)));
  }
  if (typeof v === 'string') return v;
  if (v instanceof Building) return v.block.name;
  if (v instanceof Unit) return v.type.name;
  if (v.name) return v.name;
  return String(v);
}
// %rrggbbaa colours and packcolor use Color.toDoubleBits: the RGBA8888 int stored in the bits of a double
const _cv = new DataView(new ArrayBuffer(8));
function packColor(r, g, b, a) {
  const c = v => Math.max(0, Math.min(255, Math.round(v * 255)));
  const bits = ((c(r) << 24) >>> 0) + (c(g) << 16) + (c(b) << 8) + c(a);
  _cv.setBigUint64(0, BigInt(bits)); return _cv.getFloat64(0);
}
function unpackColor(v) {
  _cv.setFloat64(0, lnum(v)); const bits = Number(_cv.getBigUint64(0) & 0xffffffffn);
  return [((bits >>> 24) & 255) / 255, ((bits >>> 16) & 255) / 255, ((bits >>> 8) & 255) / 255, (bits & 255) / 255];
}
const big = v => BigInt.asIntN(64, BigInt(Math.trunc(lnum(v)) || 0));
const fromBig = b => Number(BigInt.asIntN(64, b));
const DEGR = Math.PI / 180;
const LOPS = {
  add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b, idiv: (a, b) => Math.floor(a / b),
  mod: (a, b) => a % b, emod: (a, b) => ((a % b) + b) % b, pow: (a, b) => Math.pow(a, b),
  land: (a, b) => (a !== 0 && b !== 0) ? 1 : 0, lessThan: (a, b) => a < b ? 1 : 0, lessThanEq: (a, b) => a <= b ? 1 : 0,
  greaterThan: (a, b) => a > b ? 1 : 0, greaterThanEq: (a, b) => a >= b ? 1 : 0,
  shl: (a, b) => fromBig(big(a) << (big(b) & 63n)), shr: (a, b) => fromBig(big(a) >> (big(b) & 63n)),
  ushr: (a, b) => fromBig(BigInt.asUintN(64, big(a)) >> (big(b) & 63n)),
  or: (a, b) => fromBig(big(a) | big(b)), and: (a, b) => fromBig(big(a) & big(b)), xor: (a, b) => fromBig(big(a) ^ big(b)), not: a => fromBig(~big(a)),
  max: Math.max, min: Math.min, angle: (a, b) => { let d = Math.atan2(b, a) / DEGR; return d < 0 ? d + 360 : d; },
  angleDiff: (a, b) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); },
  len: (a, b) => Math.hypot(a, b), noise: (a, b) => LNoise.noise(a, b), abs: Math.abs, sign: Math.sign, log: Math.log,
  logn: (a, b) => Math.log(a) / Math.log(b), log10: Math.log10, floor: Math.floor, ceil: Math.ceil, round: Math.round, sqrt: Math.sqrt,
  rand: a => Math.random() * a, sin: a => Math.sin(a * DEGR), cos: a => Math.cos(a * DEGR), tan: a => Math.tan(a * DEGR),
  asin: a => Math.asin(a) / DEGR, acos: a => Math.acos(a) / DEGR, atan: a => Math.atan(a) / DEGR,
};
const LNoise = { n: null, noise(x, y) { if (!this.n) this.n = makeNoise(9001); return this.n.oct(x, y, 1, 0.5, 1) * 2 - 1; } };
const UNARY = new Set(['not', 'abs', 'sign', 'log', 'log10', 'floor', 'ceil', 'round', 'sqrt', 'rand', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan']);
function lequal(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 0.000001;
  if ((a === null || typeof a === 'object' || typeof a === 'string') && (b === null || typeof b === 'object' || typeof b === 'string')) return a === b;
  return Math.abs(lnum(a) - lnum(b)) < 0.000001;
}
function lcond(op, a, b) {
  switch (op) {
    case 'equal': return lequal(a, b);
    case 'notEqual': return !lequal(a, b);
    case 'lessThan': return lnum(a) < lnum(b);
    case 'lessThanEq': return lnum(a) <= lnum(b);
    case 'greaterThan': return lnum(a) > lnum(b);
    case 'greaterThanEq': return lnum(a) >= lnum(b);
    case 'strictEqual': return typeof a === typeof b && (typeof a === 'number' ? a === b : a === b);
    case 'always': return true;
  }
  return false;
}

// ================================================================ parser (LParser) -> compiled instruction list
function tokenize(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '#') break;
    if (c === '"') { let j = line.indexOf('"', i + 1); if (j < 0) j = line.length; out.push(line.slice(i, j + 1)); i = j + 1; continue; }
    let j = i; while (j < line.length && line[j] !== ' ' && line[j] !== '\t' && line[j] !== '#') j++;
    out.push(line.slice(i, j)); i = j;
  }
  return out;
}
function parseMlog(code) {
  const stmts = [], labels = {};
  for (const raw of code.replace(/\r/g, '').split(/\n|;/)) {
    const t = tokenize(raw.trim());
    if (!t.length) continue;
    if (t.length === 1 && t[0].endsWith(':') && t[0].length > 1) { labels[t[0].slice(0, -1)] = stmts.length; continue; }
    stmts.push(t);
    if (stmts.length >= 1000) break; // LExecutor.maxInstructions
  }
  return { stmts, labels };
}

const MAX_TEXT = 400, MAX_GRAPHICS = 256;
class LVars {
  constructor() { this.map = new Map(); }
  get(name) { return this.map.has(name) ? this.map.get(name) : null; }
}

// constant / literal resolution. Returns {c: value} for constants or {v: name} for variables
function resolveToken(tok, proc) {
  if (tok === undefined || tok === null) return { c: null };
  if (tok.startsWith('"')) return { c: tok.slice(1, tok.endsWith('"') && tok.length > 1 ? -1 : undefined).replace(/\\n/g, '\n') };
  if (tok === 'true') return { c: 1 }; if (tok === 'false') return { c: 0 }; if (tok === 'null') return { c: null };
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(tok)) return { c: parseFloat(tok) };
  if (/^0x[0-9a-f]+$/i.test(tok)) return { c: parseInt(tok, 16) };
  if (/^0b[01]+$/i.test(tok)) return { c: parseInt(tok.slice(2), 2) };
  if (/^%[0-9a-f]{6}([0-9a-f]{2})?$/i.test(tok)) {
    const h = tok.slice(1); const p = i => parseInt(h.substr(i, 2), 16) / 255;
    return { c: packColor(p(0), p(2), p(4), h.length === 8 ? p(6) : 1) };
  }
  if (tok.startsWith('@')) {
    const n = tok.slice(1);
    const dyn = ['this', 'thisx', 'thisy', 'links', 'ipt', 'time', 'tick', 'second', 'minute', 'counter', 'unit', 'waveNumber', 'waveTime', 'mapw', 'maph', 'server', 'client'];
    if (dyn.includes(n)) return { d: n };
    if (n === 'pi') return { c: Math.PI }; if (n === 'e') return { c: Math.E };
    if (n === 'degToRad') return { c: DEGR }; if (n === 'radToDeg') return { c: 1 / DEGR };
    if (n in TEAM_IDS) return { c: { team: n } };
    if (Items[n]) return { c: Items[n] };
    if (Liquids[n]) return { c: Liquids[n] };
    if (UNITS[n]) return { c: UNITS[n] };
    if (BLOCKS[n]) return { c: BLOCKS[n] };
    if (n === 'air' || n === 'solid') return { c: { name: n } };
    return { c: { prop: n } }; // sensor property names like @health, @x, @totalItems
  }
  return { v: tok };
}

class LProgram {
  constructor(proc, code) {
    this.proc = proc;
    const { stmts, labels } = parseMlog(code || '');
    this.vars = new Map();
    this.ins = stmts.map(t => this.compile(t, labels));
    this.counter = 0; this.textBuffer = ''; this.graphics = []; this.waitUntil = 0; this.stopped = false;
  }
  ref(tok) {
    const r = resolveToken(tok, this.proc);
    if ('v' in r) {
      const n = r.v;
      if (!this.vars.has(n)) this.vars.set(n, null);
      return { v: n };
    }
    return r;
  }
  compile(t, labels) {
    const op = t[0], a = t.slice(1);
    const jumpTo = s => s in labels ? labels[s] : parseInt(s);
    switch (op) {
      case 'jump': return { op, dest: jumpTo(a[0]), cond: a[1] || 'always', a: this.ref(a[2] || 'x'), b: this.ref(a[3] || 'false') };
      case 'op': return { op, fn: a[0], res: this.ref(a[1]), a: this.ref(a[2]), b: this.ref(a[3]) };
      case 'select': return { op, res: this.ref(a[0]), cond: a[1], a: this.ref(a[2]), b: this.ref(a[3]), t: this.ref(a[4]), f: this.ref(a[5]) };
      case 'draw': return { op, type: a[0], args: a.slice(1, 7).map(x => this.ref(x)), raw: a.slice(1) };
      case 'control': return { op, type: a[0], target: this.ref(a[1]), args: a.slice(2, 6).map(x => this.ref(x)) };
      case 'radar': return { op, t: [a[0], a[1], a[2]], sort: a[3], from: this.ref(a[4]), order: this.ref(a[5]), res: this.ref(a[6]) };
      case 'uradar': return { op, t: [a[0], a[1], a[2]], sort: a[3], order: this.ref(a[5]), res: this.ref(a[6]) };
      case 'ulocate': return { op, kind: a[0], group: a[1], enemy: this.ref(a[2]), ore: this.ref(a[3]), ox: this.ref(a[4]), oy: this.ref(a[5]), found: this.ref(a[6]), build: this.ref(a[7]) };
      case 'ucontrol': return { op, type: a[0], args: a.slice(1, 6).map(x => this.ref(x)) };
      case 'lookup': return { op, type: a[0], res: this.ref(a[1]), id: this.ref(a[2]) };
      case 'stop': case 'end': case 'noop': return { op };
      default: return { op, args: a.map(x => this.ref(x)) };
    }
  }
  get(r) {
    if ('c' in r) return r.c;
    if ('v' in r) {
      const lk = this.proc.linkByName(r.v);
      if (lk) return lk;
      return this.vars.get(r.v);
    }
    const p = this.proc;
    switch (r.d) {
      case 'this': return p; case 'thisx': return p.tx; case 'thisy': return p.ty;
      case 'links': return p.links.length; case 'ipt': return p.block.ipt;
      case 'time': return Time.time * 1000 / 60; case 'tick': return Time.time; case 'second': return Time.time / 60; case 'minute': return Time.time / 3600;
      case 'counter': return this.counter; case 'unit': return p.unit && !p.unit.dead ? p.unit : null;
      case 'waveNumber': return Game.wave; case 'waveTime': return Game.waveCountdown / 60;
      case 'mapw': return World.w; case 'maph': return World.h; case 'server': return 1; case 'client': return 0;
    }
    return null;
  }
  set(r, val) {
    if (typeof val === 'number' && !isFinite(val)) val = null; // LVar.setnum: NaN/Infinity become invalid
    if ('v' in r) { if (!this.proc.linkByName(r.v)) this.vars.set(r.v, val); return; }
    if (r.d === 'counter') this.counter = Math.floor(lnum(val));
  }
  num(r) { return lnum(this.get(r)); }
}

// ================================================================ executor
function execOnce(prog) {
  const p = prog.proc, ins = prog.ins;
  if (!ins.length || prog.stopped) return;
  if (prog.counter >= ins.length || prog.counter < 0) prog.counter = 0;
  const s = ins[prog.counter++];
  const A = s.args;
  switch (s.op) {
    case 'set': prog.set(A[0], prog.get(A[1])); break;
    case 'op': {
      const f = LOPS[s.fn];
      if (s.fn === 'equal') prog.set(s.res, lequal(prog.get(s.a), prog.get(s.b)) ? 1 : 0);
      else if (s.fn === 'notEqual') prog.set(s.res, lequal(prog.get(s.a), prog.get(s.b)) ? 0 : 1);
      else if (s.fn === 'strictEqual') prog.set(s.res, lcond('strictEqual', prog.get(s.a), prog.get(s.b)) ? 1 : 0);
      else if (f) prog.set(s.res, UNARY.has(s.fn) ? f(prog.num(s.a)) : f(prog.num(s.a), prog.num(s.b)));
      break;
    }
    case 'select': prog.set(s.res, lcond(s.cond, prog.get(s.a), prog.get(s.b)) ? prog.get(s.t) : prog.get(s.f)); break;
    case 'jump': if (!isNaN(s.dest) && lcond(s.cond, prog.get(s.a), prog.get(s.b))) prog.counter = s.dest; break;
    case 'end': prog.counter = ins.length; break;
    case 'stop': prog.counter--; prog.stopped = true; break;
    case 'wait': prog.waitUntil = Time.time + prog.num(A[0]) * 60; break;
    case 'noop': break;
    case 'read': {
      const cell = prog.get(A[1]), at = Math.floor(prog.num(A[2]));
      if (cell instanceof MemoryBlock) prog.set(A[0], at >= 0 && at < cell.mem.length ? cell.mem[at] : null);
      else if (cell instanceof LogicProcessor && cell.program) { const nm = lstr(prog.get(A[2])); prog.set(A[0], cell.program.vars.has(nm) ? cell.program.vars.get(nm) : null); }
      else if (typeof cell === 'string') { prog.set(A[0], at >= 0 && at < cell.length ? cell.charCodeAt(at) : null); }
      break;
    }
    case 'write': {
      const cell = prog.get(A[1]), at = Math.floor(prog.num(A[2]));
      if (cell instanceof MemoryBlock && at >= 0 && at < cell.mem.length) cell.mem[at] = prog.num(A[0]);
      break;
    }
    case 'print': if (prog.textBuffer.length < MAX_TEXT) prog.textBuffer += lstr(prog.get(A[0])); break;
    case 'printchar': { const v = prog.get(A[0]); if (typeof v === 'number') prog.textBuffer += String.fromCharCode(Math.floor(v)); break; }
    case 'format': {
      const txt = lstr(prog.get(A[0]));
      let best = -1, at = -1;
      for (let d = 0; d <= 9; d++) { const i = prog.textBuffer.indexOf('{' + d + '}'); if (i >= 0) { best = d; at = i; break; } }
      if (at >= 0) prog.textBuffer = prog.textBuffer.slice(0, at) + txt + prog.textBuffer.slice(at + 3);
      break;
    }
    case 'printflush': { const m = prog.get(A[0]); if (m instanceof MessageBlock) m.text = prog.textBuffer.slice(0, MAX_TEXT); prog.textBuffer = ''; break; }
    case 'draw': {
      if (prog.graphics.length >= MAX_GRAPHICS) break;
      const v = s.args.map(r => prog.get(r));
      if (s.type === 'print') { prog.graphics.push({ type: 'print', v, align: s.raw[2] || 'bottomLeft', text: prog.textBuffer }); prog.textBuffer = ''; break; }
      prog.graphics.push({ type: s.type, v, align: s.raw[2] });
      break;
    }
    case 'drawflush': { const d = prog.get(A[0]); if (d instanceof LogicDisplay) d.flush(prog.graphics); prog.graphics = []; break; }
    case 'getlink': { const i = Math.floor(prog.num(A[1])); prog.set(A[0], p.links[i] ? p.links[i].b : null); break; }
    case 'sensor': prog.set(A[0], senseValue(prog.get(A[1]), prog.get(A[2]))); break;
    case 'lookup': {
      const i = Math.floor(prog.num(s.id));
      const list = s.type === 'item' ? L_ITEMS.map(n => Items[n]) : s.type === 'liquid' ? L_LIQUIDS.map(n => Liquids[n]) : s.type === 'unit' ? L_UNITS.map(n => UNITS[n]) : s.type === 'block' ? BLOCK_LIST : [];
      prog.set(s.res, list[i] || null);
      break;
    }
    case 'packcolor': prog.set(A[0], packColor(prog.num(A[1]), prog.num(A[2]), prog.num(A[3]), prog.num(A[4]))); break;
    case 'unpackcolor': { const c = unpackColor(prog.get(A[4])); for (let i = 0; i < 4; i++) prog.set(A[i], c[i]); break; }
    case 'control': controlBuilding(p, prog.get(s.target), s.type, s.args.map(r => prog.get(r))); break;
    case 'radar': {
      const from = prog.get(s.from);
      if (!(from instanceof Building) || from.team !== p.team || !p.isLinked(from)) { prog.set(s.res, null); break; }
      prog.set(s.res, radarSearch(from, from.range || from.block.range || 0, s.t, s.sort, prog.num(s.order)));
      break;
    }
    case 'ubind': {
      const t = prog.get(A[0]);
      if (t instanceof Unit) { p.unit = t.team === p.team && !t.dead ? t : null; }
      else if (contentKind(t) === 'unit') {
        const list = Game.units.filter(u => u.type === t && u.team === p.team && !u.dead && !u.isPlayer);
        if (!list.length) p.unit = null;
        else { p.bindIdx = ((p.bindIdx || 0) + 1) % list.length; p.unit = list[p.bindIdx]; }
      } else p.unit = null;
      if (p.unit) p.unit.boundBy = p;
      break;
    }
    case 'ucontrol': unitControl(prog, s.type, s.args); break;
    case 'uradar': {
      const u = p.unit;
      if (!u || u.dead) { prog.set(s.res, null); break; }
      prog.set(s.res, radarSearch(u, u.range, s.t, s.sort, prog.num(s.order)));
      break;
    }
    case 'ulocate': ulocate(prog, s); break;
  }
}

// ================================================================ sensor (Senseable)
function senseValue(t, prop) {
  if (!t) return null;
  if (typeof t === 'string') { if (prop && prop.prop === 'size') return t.length; return null; }
  const k = contentKind(prop);
  if (k === 'item') return t.items ? t.items[prop.id] : (t.stack && t.stack.item === prop ? t.stack.amount : 0);
  if (k === 'liquid') return t.liquid && t.liquid.type === prop ? t.liquid.amount : 0;
  if (contentKind(t)) {
    const n = prop && prop.prop;
    if (n === 'name') return t.name; if (n === 'id') return contentId(t);
    if (n === 'size') return t.size || 1; if (n === 'health' || n === 'maxHealth') return t.health || 0;
    return null;
  }
  const n = prop && prop.prop;
  if (!n) return null;
  if (t instanceof Building) {
    const b = t, blk = b.block, g = b.power && b.power.graph;
    switch (n) {
      case 'totalItems': return b.total || 0;
      case 'firstItem': return b.firstItem ? b.firstItem() : null;
      case 'totalLiquids': return b.liquid ? b.liquid.amount : 0;
      case 'totalPower': return b.power && b.power.stored !== undefined ? b.power.stored : 0;
      case 'itemCapacity': return blk.hasItems ? blk.itemCapacity : 0;
      case 'liquidCapacity': return blk.hasLiquids ? blk.liquidCapacity : 0;
      case 'powerCapacity': return blk.capacity || 0;
      case 'powerNetStored': return g ? g.stored : 0;
      case 'powerNetCapacity': return g ? g.capacity : 0;
      case 'powerNetIn': return g ? g.produced : 0;
      case 'powerNetOut': return g ? g.needed : 0;
      case 'ammo': return b.totalAmmo !== undefined ? b.totalAmmo : (b.liquid ? b.liquid.amount : 0);
      case 'ammoCapacity': return blk.maxAmmo || blk.liquidCapacity || 0;
      case 'memoryCapacity': return b.mem ? b.mem.length : 0;
      case 'health': return b.health; case 'maxHealth': return b.maxHealth;
      case 'heat': return b.heat || 0;
      case 'efficiency': return b.efficiency; case 'progress': return b.progress !== undefined ? Mathf.clamp(b.progress > 1 && blk.constructTime ? b.progress / blk.constructTime : b.progress) : 0;
      case 'timescale': return b.timeScale || 1;
      case 'rotation': return b.turretRotation !== undefined ? b.turretRotation : b.rotation * 90;
      case 'x': return b.x / TS; case 'y': return b.y / TS;
      case 'size': return blk.size; case 'solid': return blk.solid && !b.open ? 1 : 0; case 'dead': return b.dead ? 1 : 0;
      case 'range': return (b.range || blk.range || 0) / TS;
      case 'shooting': return b.target ? 1 : 0;
      case 'team': return TEAM_IDS[b.team];
      case 'type': return blk;
      case 'enabled': return b instanceof SwitchBlock ? (b.on ? 1 : 0) : (b.disabledUntil > Time.time ? 0 : 1);
      case 'config': return b.sortItem !== undefined ? b.sortItem : (b.plan ? UNITS[b.plan.unit] : null);
      case 'displayWidth': return blk.displaySize || 0; case 'displayHeight': return blk.displaySize || 0;
      case 'bufferSize': return 0; case 'operations': return 0;
      case 'controlled': return b.logicCtrlUntil > Time.time ? 1 : 0;
      case 'payloadCount': return b.payload ? 1 : 0; case 'payloadType': return b.payload || null;
      case 'id': return b.id;
    }
    return null;
  }
  if (t instanceof Unit) {
    const u = t;
    switch (n) {
      case 'totalItems': return u.stack.amount; case 'firstItem': return u.stack.amount > 0 ? u.stack.item : null;
      case 'itemCapacity': return u.type.itemCapacity;
      case 'health': return u.health; case 'maxHealth': return u.maxHealth; case 'shield': return u.shield; case 'armor': return u.armor;
      case 'x': return u.x / TS; case 'y': return u.y / TS; case 'rotation': return u.rotation;
      case 'velocityX': return u.vx * 60 / TS; case 'velocityY': return u.vy * 60 / TS;
      case 'shootX': return u.aimX / TS; case 'shootY': return u.aimY / TS;
      case 'dead': return u.dead ? 1 : 0; case 'team': return TEAM_IDS[u.team]; case 'type': return u.type;
      case 'flying': return u.isFlying ? 1 : 0; case 'boosting': return u.type.canBoost && u.elevation > 0.5 ? 1 : 0;
      case 'range': return u.range / TS; case 'speed': return u.type.speed * 60 / TS;
      case 'shooting': return u.mounts.some(m => m.shoot) ? 1 : 0;
      case 'mining': return u.mineTile ? 1 : 0;
      case 'mineX': return u.mineTile ? u.mineTile[0] : -1; case 'mineY': return u.mineTile ? u.mineTile[1] : -1;
      case 'flag': return u.flag || 0;
      case 'controlled': return u.controller instanceof LogicAI ? 1 : u.isPlayer ? 2 : 0;
      case 'controller': return u.controller instanceof LogicAI ? u.controller.proc : u;
      case 'name': return u.type.name; case 'size': return u.hitSize / TS;
      case 'payloadCount': return 0; case 'id': return u.id;
    }
    return null;
  }
  return null;
}

// ================================================================ control (buildings)
function controlBuilding(p, b, type, v) {
  if (!(b instanceof Building) || b.team !== p.team || !p.isLinked(b)) return;
  switch (type) {
    case 'enabled':
      if (b instanceof SwitchBlock) { b.on = lnum(v[0]) !== 0; return; }
      if (lnum(v[0]) === 0) b.disabledUntil = Time.time + 6 * 60; else b.disabledUntil = 0;
      return;
    case 'shoot':
      b.logicCtrlUntil = Time.time + 60 * 2;
      b.logicAim = { x: lnum(v[0]) * TS, y: lnum(v[1]) * TS, shoot: lnum(v[2]) !== 0, unit: null };
      return;
    case 'shootp':
      b.logicCtrlUntil = Time.time + 60 * 2;
      b.logicAim = { unit: v[0] instanceof Unit || v[0] instanceof Building ? v[0] : null, shoot: lnum(v[1]) !== 0 };
      return;
    case 'config': {
      const c = v[0];
      if ((b instanceof Sorter || b instanceof Unloader) && (c === null || contentKind(c) === 'item')) b.configure(c);
      else if (b instanceof UnitFactory && contentKind(c) === 'unit') { const i = b.block.plans.findIndex(pl => pl.unit === c.name); if (i >= 0) b.configure(i); }
      else if (b instanceof PayloadConveyor && b.block.router) b.sortUnit = contentKind(c) === 'unit' ? c.name : null;
      return;
    }
    case 'color':
      if (b instanceof Illuminator) b.logicColor = unpackColor(v[0]);
      return;
  }
}
// turrets under logic control aim where the processor tells them
const _tFind = Turret.prototype.findTarget;
Turret.prototype.findTarget = function () {
  if (this.logicCtrlUntil > Time.time && this.logicAim) {
    const a = this.logicAim;
    if (!a.shoot) { this.target = null; return; }
    if (a.unit) { this.target = a.unit; return; }
    this.target = { x: a.x, y: a.y, dead: false, hitSize: 0, logicPoint: true };
    return;
  }
  return _tFind.call(this);
};
const _tValid = Turret.prototype.validTarget;
Turret.prototype.validTarget = function (t) {
  if (t && t.logicPoint) return this.logicCtrlUntil > Time.time;
  return _tValid.call(this, t);
};
const _tUpd = Turret.prototype.update;
Turret.prototype.update = function () {
  if (this.logicCtrlUntil > Time.time) this.timers.target = 999; // re-read the logic target every tick
  _tUpd.call(this);
};
// illuminator colour from logic
const _ilDraw = Illuminator.prototype.draw;
Illuminator.prototype.draw = function () {
  if (!this.logicColor) return _ilDraw.call(this);
  const [r, g, b] = this.logicColor;
  const hex = [r, g, b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  const idx = LIGHT_COLORS.indexOf(hex);
  if (idx < 0) LIGHT_COLORS.push(hex);
  this.colorIdx = LIGHT_COLORS.indexOf(hex);
  this.logicColor = null;
  _ilDraw.call(this);
};

// ================================================================ radar
function radarSearch(from, range, targets, sort, order) {
  const team = from.team;
  const match = u => targets.every(t => {
    switch (t) {
      case 'any': return true; case 'enemy': return u.team !== team; case 'ally': return u.team === team;
      case 'player': return u.isPlayer; case 'flying': return u.isFlying; case 'ground': return !u.isFlying;
      case 'boss': return !!u.boss; case 'attacker': return u.type.weapons.length > 0;
    }
    return true;
  });
  let best = null, bv = 0;
  for (const u of Game.units) {
    if (u.dead || !match(u)) continue;
    const d = Math.hypot(u.x - from.x, u.y - from.y);
    if (d > range + u.hitSize / 2) continue;
    const val = sort === 'health' ? u.health : sort === 'shield' ? u.shield : sort === 'armor' ? u.armor : sort === 'maxHealth' ? u.maxHealth : -d;
    const v = order ? val : -val;
    if (!best || v > bv) { best = u; bv = v; }
  }
  return best;
}

// ================================================================ unit control (LogicAI)
class LogicAI {
  constructor(proc, prev) { this.proc = proc; this.prev = prev; this.until = Time.time + 600; this.move = null; this.boost = false; this.aim = null; }
  update(u) {
    if (Time.time > this.until || this.proc.dead || this.proc.unit !== u) { u.controller = this.prev || makeController(u.type, u.team); u.mineTile = null; return; }
    const m = this.move;
    if (m) {
      const d = Math.hypot(m.x - u.x, m.y - u.y);
      if (d > (m.r || 0) + 1) u.moveTo(m.x, m.y, m.r || 0); else u.moveAt(0, 0);
    } else u.moveAt(0, 0);
    if (u.type.canBoost) u.elevation = Mathf.approach(u.elevation, this.boost ? 1 : (u.elevation > 0.5 && !this.boost ? 0 : u.elevation), 0.08 * Time.delta);
    const a = this.aim;
    if (a) {
      const tx = a.unit ? a.unit.x : a.x, ty = a.unit ? a.unit.y : a.y;
      if (a.unit && a.unit.dead) this.aim = null;
      else { u.aimX = tx; u.aimY = ty; u.lookAt(tx, ty); for (const mt of u.mounts) mt.shoot = a.shoot; }
    } else for (const mt of u.mounts) mt.shoot = false;
    if (Math.hypot(u.vx, u.vy) > 0.05 && !a) u.lookAngle(Angles.angle(0, 0, u.vx, u.vy));
  }
}
function ctrl(prog) {
  const p = prog.proc, u = p.unit;
  if (!u || u.dead || u.isPlayer) return null;
  if (!(u.controller instanceof LogicAI) || u.controller.proc !== p) u.controller = new LogicAI(p, u.controller);
  u.controller.until = Time.time + 600;
  return u.controller;
}
function unitControl(prog, type, args) {
  const p = prog.proc, u = p.unit;
  const v = args.map(r => prog.get(r)), n = i => lnum(v[i]);
  if (type === 'within') { prog.set(args[3], u && !u.dead && Math.hypot(u.x - n(0) * TS, u.y - n(1) * TS) <= n(2) * TS ? 1 : 0); return; }
  if (type === 'getBlock') {
    const x = Math.round(n(0)), y = Math.round(n(1));
    const b = World.inside(x, y) ? World.buildAt(x, y) : null;
    prog.set(args[2], b ? b.block : World.inside(x, y) && World.wall[y * World.w + x] ? { name: 'solid' } : { name: 'air' });
    prog.set(args[3], b || null);
    prog.set(args[4], World.inside(x, y) ? { name: World.floorAt(x, y).name } : null);
    return;
  }
  if (type === 'idle') { if (u && u.controller instanceof LogicAI) u.controller.until = 0; return; }
  const c = ctrl(prog);
  if (!c) return;
  switch (type) {
    case 'move': c.move = { x: n(0) * TS, y: n(1) * TS, r: 0 }; break;
    case 'pathfind': c.move = { x: n(0) * TS, y: n(1) * TS, r: 0 }; break;
    case 'approach': c.move = { x: n(0) * TS, y: n(1) * TS, r: n(2) * TS }; break;
    case 'stop': c.move = null; c.aim = null; u.mineTile = null; u.moveAt(0, 0); break;
    case 'boost': c.boost = n(0) !== 0; break;
    case 'target': c.aim = { x: n(0) * TS, y: n(1) * TS, shoot: n(2) !== 0 }; break;
    case 'targetp': c.aim = v[0] instanceof Unit || v[0] instanceof Building ? { unit: v[0], shoot: n(1) !== 0 } : null; break;
    case 'flag': u.flag = n(0); break;
    case 'mine': {
      const x = Math.round(n(0)), y = Math.round(n(1));
      u.mineTile = u.validMine && u.validMine(x, y) ? [x, y] : null;
      break;
    }
    case 'itemDrop': {
      const to = v[0], amt = Math.floor(n(1));
      if (!(to instanceof Building) || to.team !== u.team || u.stack.amount <= 0 || Math.hypot(to.x - u.x, to.y - u.y) > 3 * TS + to.hitSize / 2) break;
      let moved = 0;
      while (moved < amt && u.stack.amount > 0 && to.acceptItem(u.isPlayer ? to : to, u.stack.item)) { to.handleItem(to, u.stack.item); u.stack.amount--; moved++; }
      if (u.stack.amount <= 0) u.stack = { item: null, amount: 0 };
      break;
    }
    case 'itemTake': {
      const from = v[0], item = v[1], amt = Math.floor(n(2));
      if (!(from instanceof Building) || from.team !== u.team || contentKind(item) !== 'item' || !from.items) break;
      if (Math.hypot(from.x - u.x, from.y - u.y) > 3 * TS + from.hitSize / 2) break;
      if (u.stack.amount > 0 && u.stack.item !== item) break;
      const take = Math.min(amt, from.items[item.id], u.type.itemCapacity - u.stack.amount);
      if (take > 0) { from.removeItem(item, take); u.stack = { item, amount: u.stack.amount + take }; }
      break;
    }
  }
}
function ulocate(prog, s) {
  const p = prog.proc, u = p.unit;
  const out = (x, y, b) => { prog.set(s.ox, x); prog.set(s.oy, y); prog.set(s.found, x !== null ? 1 : 0); prog.set(s.build, b || null); };
  if (!u || u.dead) return out(null, null, null);
  if (s.kind === 'ore') {
    const item = prog.get(s.ore);
    if (contentKind(item) !== 'item') return out(null, null, null);
    let best = null, bd = Infinity;
    for (const i of World.oreTiles(item)) { const x = i % World.w, y = (i / World.w) | 0; const d = Math.hypot(x * TS - u.x, y * TS - u.y); if (d < bd && !World.build[i]) { bd = d; best = [x, y]; } }
    return best ? out(best[0], best[1], null) : out(null, null, null);
  }
  if (s.kind === 'spawn') return out(World.spawn.x, World.spawn.y, null);
  const enemy = s.kind === 'damaged' ? false : lnum(prog.get(s.enemy)) !== 0;
  const groupOk = b => {
    if (s.kind === 'damaged') return b.health < b.maxHealth;
    switch (s.group) {
      case 'core': return b.block.cls === 'Core';
      case 'storage': return !!b.block.storage && b.block.cls !== 'Core';
      case 'generator': return b.block.flags.includes('generator');
      case 'turret': return b instanceof Turret;
      case 'factory': return b.block.flags.includes('factory');
      case 'repair': return b instanceof MendProjector || b instanceof RepairPoint;
      case 'battery': return b.block.cls === 'Battery';
      case 'reactor': return b.block.flags.includes('reactor');
    }
    return false;
  };
  let best = null, bd = Infinity;
  for (const b of Game.buildings) {
    if (b.dead || b instanceof ConstructBuild) continue;
    if (enemy ? b.team === u.team : b.team !== u.team) continue;
    if (!groupOk(b)) continue;
    const d = Math.hypot(b.x - u.x, b.y - u.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best ? out(best.x / TS, best.y / TS, best) : out(null, null, null);
}

// ================================================================ blocks
function linkName(blockName) {
  const sp = blockName.split('-');
  if (sp.length >= 2 && (sp[sp.length - 1] === 'large' || !isNaN(parseFloat(sp[sp.length - 1])))) return sp[sp.length - 2];
  return sp[sp.length - 1];
}
class LogicProcessor extends Building {
  constructor(...a) { super(...a); this.code = ''; this.links = []; this.program = new LProgram(this, ''); this.acc = 0; this.unit = null; this.linkPos = null; }
  linkByName(n) { const l = this.links.find(l => l.name === n); return l && !l.b.dead ? l.b : null; }
  isLinked(b) { return this.links.some(l => l.b === b); }
  inRange(b) { return circleRect(this.x, this.y, this.block.range, b); }
  toggleLink(b) {
    if (b === this || b.team !== this.team || b instanceof ConstructBuild) return false;
    const i = this.links.findIndex(l => l.b === b);
    if (i >= 0) { this.links.splice(i, 1); return true; }
    if (!this.inRange(b)) return false;
    const base = linkName(b.block.name);
    let k = 1; while (this.links.some(l => l.name === base + k)) k++;
    this.links.push({ b, name: base + k });
    return true;
  }
  setCode(code) { this.code = code.slice(0, 1000 * 60); this.program = new LProgram(this, this.code); this.acc = 0; }
  hasCoolant() { return !this.block.cryoUse || (this.liquid && this.liquid.type === Liquids.cryofluid && this.liquid.amount >= this.block.cryoUse * Time.delta); }
  acceptLiquid(source, l) { return !!this.block.cryoUse && l === Liquids.cryofluid && this.liquid.amount < this.block.liquidCapacity; }
  update() {
    if (this.linkPos) { // links restored from a save
      for (const lp of this.linkPos) { const b = World.buildAt(lp.x, lp.y); if (b && b !== this && !this.isLinked(b)) this.links.push({ b, name: lp.n }); }
      this.linkPos = null;
    }
    if (this.links.some(l => l.b.dead)) this.links = this.links.filter(l => !l.b.dead);
    if (!this.hasCoolant()) return;
    if (this.block.cryoUse) this.removeLiquid(this.block.cryoUse * Time.delta);
    const prog = this.program;
    if (!prog.ins.length || prog.stopped) return;
    this.acc = Math.min(this.acc + this.block.ipt * Time.delta, this.block.ipt * 100);
    while (this.acc >= 1) {
      if (prog.waitUntil > Time.time) { this.acc = 0; break; }
      this.acc--;
      try { execOnce(prog); } catch (e) { prog.counter++; }
      if (prog.stopped) break;
    }
  }
  draw() {
    Draw.rect(this.block.name, this.x, this.y);
    if (this.program.ins.length && !this.program.stopped && this.hasCoolant()) {
      Draw.setAlpha(0.4 + Mathf.absin(Time.time, 6, 0.3));
      Fill.set(Pal.accent.css); Fill.square(this.x, this.y, 0.9);
      Draw.setAlpha(1);
    }
  }
  drawSelect() {
    Lines.set(rgba(Pal.accent, 0.5), 1); Lines.dashCircle(this.x, this.y, this.block.range, Time.time / 60);
    for (const l of this.links) { Lines.set(rgba(Pal.place, 0.9), 1); Lines.square(l.b.x, l.b.y, l.b.block.size * TS / 2 + 1); }
  }
  writeState() { return { c: this.code, l: this.links.map(l => ({ x: l.b.tx, y: l.b.ty, n: l.name })) }; }
  readState(s) { this.setCode(s.c || ''); this.linkPos = s.l || []; }
  info() {
    const p = this.program;
    return [p.ins.length ? `${p.ins.length} instructions${p.stopped ? ' (stopped)' : ''}` : 'No code: click it, then "Edit code"',
      `Links: ${this.links.map(l => l.name).join(', ') || 'none'}`].concat(this.block.cryoUse && !this.hasCoolant() ? ['Needs cryofluid'] : []);
  }
}
class MemoryBlock extends Building {
  constructor(...a) { super(...a); this.mem = new Float64Array(this.block.memoryCapacity); }
  writeState() { let last = -1; for (let i = 0; i < this.mem.length; i++) if (this.mem[i] !== 0) last = i; return last >= 0 ? { m: Array.from(this.mem.slice(0, last + 1)) } : null; }
  readState(s) { if (s.m) s.m.forEach((v, i) => { if (i < this.mem.length) this.mem[i] = v; }); }
  info() { return [`Memory: ${this.mem.length} slots`]; }
}
class MessageBlock extends Building {
  constructor(...a) { super(...a); this.text = ''; }
  writeState() { return this.text ? { t: this.text } : null; }
  readState(s) { this.text = s.t || ''; }
  info() { return this.text ? this.text.split('\n').slice(0, 12) : ['(empty message) Click to edit']; }
}
class SwitchBlock extends Building {
  constructor(...a) { super(...a); this.on = false; }
  toggle() { this.on = !this.on; Audio2.play('click', this.x, this.y, 0.5); }
  draw() { Draw.rect(this.on ? 'switch-on' : 'switch', this.x, this.y); }
  writeState() { return this.on ? { on: 1 } : null; }
  readState(s) { this.on = !!s.on; }
  info() { return [this.on ? 'ON' : 'OFF', 'Click to toggle']; }
}
class LogicDisplay extends Building {
  constructor(...a) {
    super(...a);
    const n = this.block.displaySize;
    this.canvas = document.createElement('canvas'); this.canvas.width = n; this.canvas.height = n;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, n, n);
    this.color = 'rgba(255,255,255,1)'; this.stroke = 1;
    this.region = { img: this.canvas, x: 0, y: 0, w: n, h: n, ww: n / 4, wh: n / 4 };
  }
  flush(cmds) {
    const g = this.ctx, n = this.block.displaySize;
    g.setTransform(1, 0, 0, -1, 0, n); // logic y goes up
    for (const c of cmds) {
      const v = c.v.map(lnum);
      switch (c.type) {
        case 'clear': g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = `rgb(${v[0]},${v[1]},${v[2]})`; g.fillRect(0, 0, n, n); g.restore(); break;
        case 'color': this.color = `rgba(${v[0]},${v[1]},${v[2]},${v[3] / 255})`; break;
        case 'col': { const [r, gg, b, a] = unpackColor(c.v[0]); this.color = `rgba(${r * 255},${gg * 255},${b * 255},${a})`; break; }
        case 'stroke': this.stroke = v[0]; break;
        case 'line': g.strokeStyle = this.color; g.lineWidth = this.stroke; g.beginPath(); g.moveTo(v[0], v[1]); g.lineTo(v[2], v[3]); g.stroke(); break;
        case 'rect': g.fillStyle = this.color; g.fillRect(v[0], v[1], v[2], v[3]); break;
        case 'lineRect': g.strokeStyle = this.color; g.lineWidth = this.stroke; g.strokeRect(v[0] + this.stroke / 2, v[1] + this.stroke / 2, v[2] - this.stroke, v[3] - this.stroke); break;
        case 'poly': case 'linePoly': {
          const sides = Math.max(3, Math.min(Math.floor(v[2]), 50)), r = v[3], rot = v[4] * DEGR;
          g.beginPath();
          for (let i = 0; i <= sides; i++) { const a = rot + i / sides * Math.PI * 2; const px = v[0] + Math.cos(a) * r, py = v[1] + Math.sin(a) * r; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
          if (c.type === 'poly') { g.fillStyle = this.color; g.fill(); } else { g.strokeStyle = this.color; g.lineWidth = this.stroke; g.stroke(); }
          break;
        }
        case 'triangle': g.fillStyle = this.color; g.beginPath(); g.moveTo(v[0], v[1]); g.lineTo(v[2], v[3]); g.lineTo(v[4], v[5]); g.closePath(); g.fill(); break;
        case 'image': {
          const ct = c.v[2], k = contentKind(ct);
          const name = k === 'item' ? ct.icon : k === 'liquid' ? ct.icon : k === 'unit' ? ct.name : k === 'block' ? 'icon:' + ct.name : null;
          if (!name || !Assets.has(name)) break;
          const reg = Assets.get(name), s = v[3];
          g.save(); g.translate(v[0], v[1]); g.rotate(v[4] * DEGR); g.scale(1, -1);
          g.drawImage(reg.img, reg.x, reg.y, reg.w, reg.h, -s / 2, -s / 2, s, s); g.restore();
          break;
        }
        case 'print': {
          if (!c.text) break;
          g.save(); g.translate(v[0], v[1]); g.scale(1, -1);
          g.fillStyle = this.color; g.font = '8px MindustryFont, monospace';
          const al = c.align || 'bottomLeft';
          g.textAlign = al.includes('Left') || al === 'left' ? 'left' : al.includes('Right') || al === 'right' ? 'right' : 'center';
          g.textBaseline = al.startsWith('bottom') ? 'bottom' : al.startsWith('top') ? 'top' : 'middle';
          c.text.split('\n').forEach((ln, i, arr) => g.fillText(ln, 0, (i - (arr.length - 1)) * 9));
          g.restore();
          break;
        }
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  draw() {
    Draw.rect(this.block.name, this.x, this.y);
    Draw.rect(this.region, this.x, this.y, this.region.ww, this.region.wh);
  }
  info() { return [`${this.block.displaySize}x${this.block.displaySize} display`]; }
}
Object.assign(BuildClasses, { LogicProcessor, MemoryBlock, MessageBlock, SwitchBlock, LogicDisplay });


defBlock('message', 'MessageBlock', { requirements: req('graphite', 5, 'copper', 5), category: 'logic', configurable: true, solid: true });
defBlock('switch', 'SwitchBlock', { requirements: req('graphite', 5, 'copper', 5), category: 'logic', configurable: true, solid: true });
defBlock('micro-processor', 'LogicProcessor', { requirements: req('copper', 90, 'lead', 50, 'silicon', 50), ipt: 2, range: 8 * 10, category: 'logic', configurable: true });
defBlock('logic-processor', 'LogicProcessor', { requirements: req('lead', 320, 'silicon', 80, 'graphite', 60, 'thorium', 50), ipt: 8, range: 8 * 22, size: 2, category: 'logic', configurable: true });
defBlock('hyper-processor', 'LogicProcessor', {
  requirements: req('lead', 450, 'silicon', 150, 'thorium', 75, 'surge-alloy', 50), ipt: 25, range: 8 * 42, size: 3, cryoUse: 0.08,
  hasLiquids: true, liquidInputs: ['cryofluid'], liquidCapacity: 10, category: 'logic', configurable: true,
});
defBlock('memory-cell', 'MemoryBlock', { requirements: req('graphite', 30, 'silicon', 30, 'copper', 30), memoryCapacity: 64, category: 'logic' });
defBlock('memory-bank', 'MemoryBlock', { requirements: req('graphite', 80, 'silicon', 80, 'phase-fabric', 30, 'copper', 30), memoryCapacity: 512, size: 2, category: 'logic' });
defBlock('logic-display', 'LogicDisplay', { requirements: req('lead', 100, 'silicon', 50, 'metaglass', 50), displaySize: 80, size: 3, category: 'logic' });
defBlock('large-logic-display', 'LogicDisplay', { requirements: req('lead', 200, 'silicon', 150, 'metaglass', 100, 'phase-fabric', 75), displaySize: 176, size: 6, category: 'logic' });

Object.assign(DESCRIPTIONS, {
  'message': 'Stores a text message. Click to edit. Processors can write to it with print + printflush.',
  'switch': 'A toggle switch. Click to flip it. Processors read it with sensor @enabled.',
  'micro-processor': 'Runs Mindustry logic (mlog) at 120 instructions/s. Click it, then click blocks in range to link them, and "Edit code" to program it. Paste code copied from Mindustry.',
  'logic-processor': 'Runs mlog at 480 instructions/s with a 22-tile link range.',
  'hyper-processor': 'Runs mlog at 1500 instructions/s with a 42-tile link range. Needs cryofluid.',
  'memory-cell': 'Stores 64 numbers for processors (read / write).',
  'memory-bank': 'Stores 512 numbers for processors (read / write).',
  'logic-display': '80x80 pixel screen processors can draw on (draw + drawflush).',
  'large-logic-display': '176x176 pixel screen processors can draw on.',
});

