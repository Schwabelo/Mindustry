// Sector bases and launch pad trade.
// - Every sector you leave is kept (IndexedDB, too big for localStorage) and resumes where you left it; the autosave slot
//   only points at the stored sector.
// - SectorInfo export / import: pods launched toward the sector's destination are counted per second and averaged over a
//   minute (export rate); a sector imports the summed export rate of every stored base that sends to it, as 100-item pods
//   landing on landing pads (LandingPad.updateTimers).

const SectorStore = {
  db: null,
  open() {
    if (!this.db) this.db = new Promise((res, rej) => {
      const r = indexedDB.open('mindustry-lite', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('sectors');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('sectors', mode), req = fn(t.objectStore('sectors'));
      t.oncomplete = () => res(req.result);
      t.onerror = () => rej(t.error);
    });
  },
  get(name) { return this.run('readonly', s => s.get(name)); },
  put(name, data) { return this.run('readwrite', s => s.put(data, name)); },
  del(name) { return this.run('readwrite', s => s.delete(name)); },
};

Object.assign(Sectors, {
  bases: new Set(),         // sectors with a stored base
  info: {},                 // name -> { dest, exports: { item: items per second } }
  exportStats: {},          // current sector: item -> { counter, means: [] }
  importTimers: {},         // item -> 0..1 (SectorInfo.importCooldownTimers)
  waiting: {},              // item -> landing pads ready for a pod this frame
  statTimer: 0,

  destination(name) { return (this.info[name] && this.info[name].dest) || null; },
  setDestination(name, dest) { (this.info[name] = this.info[name] || { exports: {} }).dest = dest; this.save(); },
  exportsOf(name) { return (this.info[name] && this.info[name].exports) || {}; },

  // ------------------------------------------------------------ exports (the sector being played)
  podLaunched(stacks) {
    const cur = this.current, dest = cur && this.destination(cur.name);
    if (!dest || dest === cur.name) return;
    for (const [item, n] of stacks) (this.exportStats[item.name] = this.exportStats[item.name] || this.newStat(0)).counter += n;
  },
  newStat(mean) { return { counter: 0, means: new Array(60).fill(mean), mean }; },
  resetStats() {
    this.exportStats = {}; this.importTimers = {}; this.waiting = {};
    if (this.current) for (const [k, v] of Object.entries(this.exportsOf(this.current.name))) this.exportStats[k] = this.newStat(v);
  },
  // SectorInfo.update: once a second, push the counter into a 60-sample window
  updateStats() {
    for (const st of Object.values(this.exportStats)) {
      st.means.push(Math.max(st.counter, 0)); st.means.shift(); st.counter = 0;
      st.mean = st.means.reduce((a, b) => a + b, 0) / st.means.length;
    }
  },
  // SectorInfo.prepare: exports stop when there are no working launch pads
  flushExports() {
    const cur = this.current;
    if (!cur) return;
    const pads = Game.byTeam.sharded.filter(b => b instanceof LaunchPad && !b.dead);
    const active = pads.some(p => p.padEfficiency > 0 || p.launchCounter >= p.block.launchTime);
    const ex = {};
    if (active) for (const [k, st] of Object.entries(this.exportStats)) if (st.mean > 0.001) ex[k] = Math.round(st.mean * 1000) / 1000;
    (this.info[cur.name] = this.info[cur.name] || {}).exports = ex;
    this.save();
  },

  // ------------------------------------------------------------ imports (landing pads here)
  importRate(item) {
    const cur = this.current;
    if (!cur) return 0;
    let r = 0;
    for (const s of this.bases) if (s !== cur.name && this.destination(s) === cur.name) r += this.exportsOf(s)[item] || 0;
    return r;
  },
  importSources(item) {
    const cur = this.current;
    let n = 0;
    if (cur) for (const s of this.bases) if (s !== cur.name && this.destination(s) === cur.name && (this.exportsOf(s)[item] || 0) > 0) n++;
    return n;
  },
  importReady(item) { return this.importRate(item.name) > 0 && (this.importTimers[item.name] || 0) >= 1; },
  queueLanding(pad) { (this.waiting[pad.config.name] = this.waiting[pad.config.name] || []).push(pad); },
  handleImport(item, n) { /* landing pads put the items straight into the sector */ },
  updateTrade() {
    if (!this.current) return;
    const cap = BLOCKS['landing-pad'].itemCapacity;
    for (const it of ITEMS) {
      const rate = this.importRate(it.name);
      this.importTimers[it.name] = rate > 0 ? (this.importTimers[it.name] || 0) + rate / 60 / cap * Time.delta : 0;
    }
    // one pod per item per frame, rotating between pads (LandingPad priority swap)
    for (const [item, pads] of Object.entries(this.waiting)) {
      const ok = pads.filter(p => !p.dead && p.config && p.config.name === item);
      if (ok.length) {
        ok.sort((a, b) => a.priority - b.priority);
        const first = ok[0], head = ok[ok.length - 1];
        first.handleLanding();
        [first.priority, head.priority] = [head.priority, first.priority];
      }
      delete this.waiting[item];
    }
    if ((this.statTimer += Time.delta) >= 60) { this.statTimer = 0; this.updateStats(); }
  },

  // ------------------------------------------------------------ stored bases
  async storeCurrent() {
    const cur = this.current;
    if (!cur || !Game.playerCore()) return;
    this.flushExports();
    const d = SaveIO.serialize();
    try { await SectorStore.put(cur.name, d); this.bases.add(cur.name); this.save(); }
    catch (e) { console.error(e); UI.toast('Could not store this sector in the browser', 3, true); }
  },
  async dropBase(name) {
    this.bases.delete(name); this.save();
    try { await SectorStore.del(name); } catch (e) { /* ignore */ }
  },
  async launch(name, opts = {}) {
    await this.ready;
    const m = this.map(name);
    if (!m) { UI.toast('Sector map still loading, try again in a moment', 2, true); return false; }
    if ((Game.state === 'playing' || Game.state === 'paused') && this.current) await this.storeCurrent();
    if (opts.fresh) await this.dropBase(name);
    if (this.bases.has(name)) {
      let d = null;
      try { d = await SectorStore.get(name); } catch (e) { /* storage unavailable */ }
      if (d) { SaveIO.load(d); this.resetStats(); return true; }
      this.bases.delete(name);
    }
    this.current = this.pending = m;
    Game.researchMode = true;
    Game.newGame(1);
    this.resetStats();
    return true;
  },
  async resume(name) {
    let d = null;
    try { d = await SectorStore.get(name); } catch (e) { /* storage unavailable */ }
    if (!d) return false;
    SaveIO.load(d); this.resetStats();
    return true;
  },
});

// campaign state also keeps bases and trade settings
{
  try {
    const d = JSON.parse(localStorage.getItem(Sectors.KEY) || '{}');
    Sectors.bases = new Set(d.bases || []); Sectors.info = d.info || {};
  } catch (e) { /* storage unavailable */ }
  Sectors.save = function () {
    try { localStorage.setItem(this.KEY, JSON.stringify({ captured: [...this.captured], bases: [...this.bases], info: this.info })); } catch (e) { /* ignore */ }
  };
  const _reset = Sectors.reset;
  Sectors.reset = function () {
    for (const b of this.bases) SectorStore.del(b).catch(() => {});
    this.bases = new Set(); this.info = {};
    _reset.call(this);
  };
  const _gu = Game.update;
  Game.update = function () { _gu.apply(this, arguments); if (this.state === 'playing') Sectors.updateTrade(); };

  // autosave of a sector game: the sector goes to IndexedDB, the slot only remembers which sector it was
  const _sl = SaveIO.saveLocal;
  SaveIO.saveLocal = function (silent) {
    if (!Sectors.current) return _sl.call(this, silent);
    if (Game.state !== 'playing' && Game.state !== 'paused') return false;
    Sectors.flushExports();
    const d = this.serialize(), name = d.sec;
    Sectors.bases.add(name); Sectors.save();
    SectorStore.put(name, d).catch(e => { console.error(e); if (!silent) UI.toast('Could not save in this browser. Use "Export save" instead.', 4, true); });
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, ref: name, wave: d.wave, date: d.date, seed: d.seed })); } catch (e) { /* ignore */ }
    if (!silent) UI.toast('Game saved', 1.5);
    return true;
  };
  const savedRef = () => { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); return d && d.ref ? d.ref : null; } catch (e) { return null; } };
  const _ll = SaveIO.loadLocal;
  SaveIO.loadLocal = function () {
    const ref = savedRef();
    if (!ref) return _ll.call(this);
    Sectors.resume(ref).then(ok => { if (!ok) UI.toast('Could not load the sector save', 3, true); });
    return true;
  };
  // losing a sector loses its base
  const _cl = SaveIO.clearLocal;
  SaveIO.clearLocal = function () { if (Sectors.current) Sectors.dropBase(Sectors.current.name); return _cl.call(this); };
  // Continue on the title screen resumes the stored sector
  const _sg = UI.startGame;
  UI.startGame = async function (resume) {
    const ref = resume ? savedRef() : null;
    if (!ref) return _sg.call(this, resume);
    await Sectors.ready;
    this.initAudio();
    if (await Sectors.resume(ref)) this.enterGame();
    else UI.toast('Could not load the sector save', 3, true);
  };
}
