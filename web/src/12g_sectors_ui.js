// Campaign map (PlanetDialog, as a tree of the Serpulo sectors): previews, capture status, requirements, launching.
const SectorUI = {
  N: 72, SP: 64, ROW: 118,
  el: null, sel: null, previews: new Map(), wasPlaying: false,

  layout() {
    const kids = n => Sectors.order.filter(c => Sectors.index[c].parent === n);
    const step = this.N + this.SP;
    const lay = n => {
      const ch = kids(n);
      if (!ch.length) return { pos: new Map([[n, 0]]), left: [0], right: [0] };
      const pos = new Map(), left = [], right = [], offs = [];
      ch.forEach((c, i) => {
        const s = lay(c);
        let off = 0;
        if (i > 0) { off = -Infinity; for (let d = 0; d < Math.min(right.length, s.left.length); d++) off = Math.max(off, right[d] - s.left[d] + step); }
        offs.push(off);
        for (const [k, v] of s.pos) pos.set(k, v + off);
        s.left.forEach((v, d) => { left[d] = left[d] === undefined ? v + off : Math.min(left[d], v + off); });
        s.right.forEach((v, d) => { right[d] = right[d] === undefined ? v + off : Math.max(right[d], v + off); });
      });
      const px = (offs[0] + offs[offs.length - 1]) / 2, out = new Map([[n, 0]]);
      for (const [k, v] of pos) out.set(k, v - px);
      return { pos: out, left: [0, ...left.map(v => v - px)], right: [0, ...right.map(v => v - px)] };
    };
    const r = lay('groundZero'), depth = new Map();
    const walk = (n, d) => { depth.set(n, d); kids(n).forEach(c => walk(c, d + 1)); };
    walk('groundZero', 0);
    const minX = Math.min(...r.pos.values());
    this.pos = new Map();
    for (const [k, v] of r.pos) this.pos.set(k, { x: v - minX + 30, y: depth.get(k) * this.ROW + 30 });
    this.width = Math.max(...[...this.pos.values()].map(p => p.x)) + this.N + 30;
    this.height = Math.max(...[...this.pos.values()].map(p => p.y)) + this.N + 50;
  },

  // small picture of the map: floors, walls, ores, cores
  preview(name) {
    if (this.previews.has(name)) return this.previews.get(name);
    return this.previewMap(name, Sectors.map(name));
  },
  previewMap(name, m) {
    if (this.previews.has(name)) return this.previews.get(name);
    const S = 96, c = document.createElement('canvas');
    c.width = c.height = S;
    if (!m) return c;
    const dec = str => { const out = new Uint8Array(m.w * m.h); let i = 0; for (const t of str.split(',')) { const k = t.indexOf('*'), v = +(k < 0 ? t : t.slice(0, k)), n = k < 0 ? 1 : +t.slice(k + 1); out.fill(v, i, i + n); i += n; } return out; };
    const fl = dec(m.floor), wl = dec(m.wall), or = dec(m.ore);
    const colOf = n => { const f = FLOOR[n]; return Assets.avgColor(f.variants ? n + '1' : n); };
    const fc = m.pal.floor.map(colOf), wc = m.pal.wall.map(n => n ? Assets.avgColor(WALL_SINGLE.has(n) || WALL_TREE.has(n) ? n : n + '1').map(v => v * 0.75) : null);
    const oc = m.pal.ore.map(n => n ? [Items[n].color.r, Items[n].color.g, Items[n].color.b] : null);
    const g = c.getContext('2d'), img = g.createImageData(S, S), scale = Math.max(m.w, m.h) / S;
    const ox = (S - m.w / scale) / 2, oy = (S - m.h / scale) / 2;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const x = Math.floor((px - ox) * scale), y = Math.floor((S - 1 - py - oy) * scale), o = (py * S + px) * 4;
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) { img.data[o + 3] = 0; continue; }
      const i = y * m.w + x, col = wl[i] ? wc[wl[i]] : or[i] ? oc[or[i]] : fc[fl[i]];
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const [t, n, x, y] of m.builds) if (n.startsWith('core-')) {
      g.fillStyle = t === 0 ? '#ffd37f' : t === 1 ? '#f25555' : '#777';
      g.fillRect(ox + x / scale - 2, S - 1 - (oy + y / scale) - 2, 5, 5);
    }
    g.fillStyle = '#f25555';
    for (const [x, y] of m.spawns) { g.beginPath(); g.arc(ox + x / scale, S - 1 - (oy + y / scale), 3, 0, Math.PI * 2); g.fill(); }
    this.previews.set(name, c);
    return c;
  },

  state(name) { return Sectors.captured.has(name) ? 'captured' : Sectors.available(name) ? 'open' : 'locked'; },

  async open() {
    await Sectors.ready;
    if (!this.pos) this.layout();
    if (!this.el) {
      const el = this.el = document.createElement('div');
      el.id = 'sectorDialog';
      el.style.cssText = 'position:fixed;inset:0;z-index:25;background:#0e0e12;display:none;user-select:none';
      el.innerHTML = `<div style="position:absolute;left:0;right:0;top:0;height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:3px solid var(--line);background:#141418">
          <span style="color:var(--accent);font-size:18px">Campaign: Serpulo</span><span id="scCount" style="color:#aaa;font-size:13px"></span>
          <span style="flex:1"></span><button id="scResearch">Research</button><button id="scClose">Close</button></div>
        <div id="scView" style="position:absolute;left:0;right:0;top:47px;bottom:0;overflow:hidden;cursor:grab;touch-action:none">
          <div id="scWorld" style="position:absolute;left:0;top:0;transform-origin:0 0"><svg id="scLines" style="position:absolute;left:0;top:0;overflow:visible"></svg></div></div>
        <div id="scInfo" class="panel" style="position:absolute;right:10px;top:56px;width:min(320px,calc(100vw - 20px));max-height:calc(100vh - 70px);overflow:auto;padding:10px;background:rgba(18,18,22,0.98);display:none"></div>`;
      document.body.appendChild(el);
      for (const ev of ['mousedown', 'pointerdown', 'wheel', 'keydown']) el.addEventListener(ev, e => e.stopPropagation());
      el.querySelector('#scClose').onclick = () => this.close();
      el.querySelector('#scResearch').onclick = () => { ResearchUI.open(); };
      this.build();
      this.view = { x: window.innerWidth / 2 - this.pos.get('groundZero').x - this.N / 2, y: 10, z: 1 };
      ResearchUI.bindView.call(this, el.querySelector('#scView'));
    }
    this.wasPlaying = Game.state === 'playing';
    if (this.wasPlaying) Game.state = 'paused';
    this.el.style.display = '';
    if (!this.sel) this.sel = Sectors.current ? Sectors.current.name : Sectors.order.find(n => this.state(n) === 'open') || 'groundZero';
    this.render(); this.applyView();
  },
  close() {
    if (!this.el) return;
    this.el.style.display = 'none';
    if (this.wasPlaying && Game.state === 'paused') Game.state = 'playing';
  },
  isOpen() { return !!this.el && this.el.style.display !== 'none'; },
  applyView() { this.el.querySelector('#scWorld').style.transform = `translate(${this.view.x}px,${this.view.y}px) scale(${this.view.z})`; },

  build() {
    const world = this.el.querySelector('#scWorld'), svg = this.el.querySelector('#scLines');
    world.style.width = this.width + 'px'; world.style.height = this.height + 'px';
    svg.setAttribute('width', this.width); svg.setAttribute('height', this.height);
    this.nodeEls = new Map(); this.lineEls = new Map();
    const h = this.N / 2;
    for (const n of Sectors.order) {
      const p = this.pos.get(n), par = Sectors.index[n].parent;
      if (!p) continue;
      if (this.pos.has(par)) {
        const q = this.pos.get(par), my = (q.y + this.N + 18 + p.y) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${q.x + h},${q.y + this.N + 18} V${my} H${p.x + h} V${p.y}`);
        path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '3');
        svg.appendChild(path); this.lineEls.set(n, path);
      }
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;left:${p.x}px;top:${p.y}px;width:${this.N}px;height:${this.N}px;box-sizing:border-box;border:3px solid #555;background:#111;cursor:pointer`;
      const cv = this.preview(n);
      cv.style.cssText = 'width:100%;height:100%;image-rendering:pixelated;display:block;pointer-events:none';
      d.appendChild(cv);
      const lab = document.createElement('div');
      lab.style.cssText = `position:absolute;left:50%;top:${this.N + 2}px;transform:translateX(-50%);white-space:nowrap;font-size:11px;color:#ccc;pointer-events:none`;
      lab.textContent = Sectors.title(n);
      d.appendChild(lab);
      d.onclick = () => { if (this.dragged) return; this.sel = n; this.render(); Audio2.play('click', undefined, undefined, 0.3); };
      world.appendChild(d); this.nodeEls.set(n, d);
    }
  },

  render() {
    const cap = Sectors.order.filter(n => Sectors.captured.has(n)).length;
    this.el.querySelector('#scCount').textContent = `${cap} / ${Sectors.order.length} sectors captured`;
    for (const n of Sectors.order) {
      const d = this.nodeEls.get(n); if (!d) continue;
      const st = this.state(n);
      const attacked = Sectors.info[n] && Sectors.info[n].attacked;
      d.style.borderColor = this.sel === n ? '#fff' : attacked ? '#e55454' : st === 'captured' ? '#84f491' : st === 'open' ? 'var(--accent)' : '#333';
      d.firstChild.style.filter = st === 'locked' ? 'grayscale(1) brightness(0.35)' : '';
      d.lastChild.style.color = st === 'locked' ? '#666' : st === 'captured' ? '#84f491' : '#fff';
      d.lastChild.textContent = Sectors.title(n) + (Sectors.bases.has(n) || (Sectors.current && Sectors.current.name === n && Game.state !== 'title') ? ' \u25cf' : '');
      const line = this.lineEls.get(n);
      if (line) line.setAttribute('stroke', st === 'locked' ? '#333' : st === 'captured' ? '#84f491' : '#ffd37f');
    }
    this.renderInfo();
  },

  renderInfo() {
    const box = this.el.querySelector('#scInfo'), n = this.sel;
    if (!n) { box.style.display = 'none'; return; }
    box.style.display = '';
    const m = Sectors.index[n], st = this.state(n), playing = Sectors.current && Sectors.current.name === n && Game.state !== 'title';
    const diff = ['', 'Low', 'Low', 'Medium', 'Medium', 'High', 'High', 'Extreme', 'Extreme', 'Eradication', 'Eradication'][Math.round(m.difficulty)] || '';
    let html = `<div style="display:flex;align-items:center;gap:8px"><span style="font-size:17px;color:var(--accent)">${m.title}</span><span style="flex:1"></span><button id="scInfoClose" style="padding:2px 8px">&times;</button></div>
      <div style="font-size:13px;margin-top:4px;color:${st === 'captured' ? '#84f491' : st === 'open' ? '#ffd37f' : '#e55454'}">${st === 'captured' ? 'Captured' : st === 'open' ? 'Available' : 'Locked'}${playing ? ' &middot; playing now' : ''}</div>
      <div style="font-size:12px;color:#bbb;margin:8px 0;white-space:pre-line">${m.desc}</div>
      <div style="font-size:13px">Goal: ${Sectors.goal(m)}</div>
      <div style="font-size:13px">Enemy threat: ${diff} &middot; ${m.w}x${m.h} tiles</div>
      <div style="font-size:13px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:4px">Resources: ${m.resources.map(r => `<img src="${Assets.url('item-' + r)}" title="${titleCase(r)}" style="width:16px;height:16px;image-rendering:pixelated">`).join('')}</div>`;
    const miss = Sectors.missing(n);
    if (miss.length) html += `<div style="margin-top:8px;font-size:13px;color:#e55454">Requires: ${miss.map(x => x.kind === 'sector' ? 'capture ' + Sectors.title(x.name) : 'research ' + titleCase(x.name)).join(', ')}</div>`;
    // launch pad trade
    const ex = Object.entries(Sectors.exportsOf(n)), dest = Sectors.destination(n);
    const icon = it => `<img src="${Assets.url('item-' + it)}" style="width:16px;height:16px;image-rendering:pixelated;vertical-align:middle">`;
    if (Sectors.bases.has(n) || playing) {
      html += `<div style="font-size:13px;margin-top:6px">Exports: ${ex.length ? ex.map(([k, v]) => `${icon(k)} ${Math.round(v * 60)}/min`).join(' ') : 'none'}${ex.length || dest ? ` &rarr; ${dest ? Sectors.title(dest) : 'no destination'}` : ''}</div>`;
      const into = [...Sectors.bases].filter(s => s !== n && Sectors.destination(s) === n);
      const imp = {};
      for (const s of into) for (const [k, v] of Object.entries(Sectors.exportsOf(s))) imp[k] = (imp[k] || 0) + v;
      if (Object.keys(imp).length) html += `<div style="font-size:13px">Imports: ${Object.entries(imp).map(([k, v]) => `${icon(k)} ${Math.round(v * 60)}/min`).join(' ')} (needs landing pads)</div>`;
    }
    const based = Sectors.bases.has(n) && !playing;
    const bi = Sectors.info[n] || {};
    if (bi.attacked) html += `<div style="margin-top:8px;font-size:13px;color:#e55454">Under attack! Hold it to wave ${bi.attacked.winWave}; it produces nothing until then.</div>`;
    if (based && bi.items) {
      const stock = Object.entries(bi.items).filter(([, v]) => v > 0);
      const prod = Object.entries(bi.production || {}).filter(([, v]) => v > 0);
      html += `<div style="font-size:13px;margin-top:6px">Core: ${stock.length ? stock.map(([k, v]) => `${icon(k)} ${v}`).join(' ') : 'empty'}</div>`;
      if (prod.length) html += `<div style="font-size:12px;color:#aaa">Producing while away: ${prod.map(([k, v]) => `${icon(k)} ${Math.round(v * 60)}/min`).join(' ')}</div>`;
    }
    const leaving = Sectors.current && (Game.state === 'playing' || Game.state === 'paused') && !playing ? Sectors.current.name : null;
    // LaunchLoadoutDialog: a new sector is launched to from a base, paying the core and resources
    const needLoadout = st !== 'locked' && !based && !playing && Sectors.needsLoadout(n);
    const sources = needLoadout ? Sectors.launchSources() : [];
    if (needLoadout) {
      if (!this.lo || this.lo.target !== n) this.lo = { target: n, source: leaving && sources.includes(leaving) ? leaving : sources[0], core: 'core-shard', max: true };
      const lo = this.lo;
      if (!sources.length) html += `<div style="margin-top:8px;font-size:13px;color:#e55454">You need a base to launch from.</div>`;
      else {
        const srcCore = Sectors.sourceCore(lo.source);
        const cores = ['core-shard', 'core-foundation', 'core-nucleus'].filter(c => BLOCKS[c] && BLOCKS[c].size <= srcCore.size && (c === 'core-shard' || Research.has(c)));
        if (!cores.includes(lo.core)) lo.core = 'core-shard';
        const plan = Sectors.loadoutPlan(lo.source, lo.core, lo.max);
        lo.plan = plan;
        const sel = (id, opts, cur) => `<select id="${id}" style="background:#111;color:#ddd;border:2px solid #454545;padding:2px">${opts.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
        html += `<div style="margin-top:10px;font-size:13px;display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center">
          <span>Launch from</span>${sel('scSrc', sources.map(x => [x, Sectors.title(x)]), lo.source)}
          <span>Core</span>${sel('scCore', cores.map(c => [c, titleCase(c)]), lo.core)}
          <span>Resources</span><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="scMax" ${lo.max ? 'checked' : ''}> as much as possible (up to ${Math.floor(0.5 * plan.core.itemCapacity)} each)</label></div>
          <div style="font-size:12px;margin-top:6px">Costs: ${Object.entries(plan.total).map(([k, v]) => `<span style="color:${(plan.have[k] || 0) >= v ? '#ddd' : '#e55454'}">${icon(k)} ${v}${(plan.have[k] || 0) < v ? ` (${plan.have[k] || 0})` : ''}</span>`).join(' ')}</div>`;
      }
    }
    if (st !== 'locked') {
      const blocked = needLoadout && (!sources.length || !this.lo.plan || !this.lo.plan.valid);
      html += `<button id="scLaunch" class="accent" style="margin-top:10px;width:100%${blocked ? ';opacity:0.4' : ''}" ${blocked ? 'disabled' : ''}>${playing ? 'Return' : based ? 'Resume base' : st === 'captured' ? 'Revisit' : 'Launch'}</button>`;
      if (based || playing) html += `<button id="scFresh" style="margin-top:6px;width:100%">Restart sector from scratch</button>`;
      if (leaving) html += `<div style="font-size:12px;color:#aaa;margin-top:4px">${Sectors.title(leaving)} keeps running at its measured production while you're away.</div>`;
    }
    box.innerHTML = html;
    box.querySelector('#scInfoClose').onclick = () => { this.sel = null; this.render(); };
    const on = (id, ev, fn) => { const e = box.querySelector(id); if (e) e[ev] = fn; };
    on('#scSrc', 'onchange', e => { this.lo.source = e.target.value; this.renderInfo(); });
    on('#scCore', 'onchange', e => { this.lo.core = e.target.value; this.renderInfo(); });
    on('#scMax', 'onchange', e => { this.lo.max = e.target.checked; this.renderInfo(); });
    const go = async fresh => {
      if (fresh && !confirm(`Throw away everything built on ${m.title} and start it over?`)) return;
      UI.initAudio();
      if (playing && !fresh) { this.close(); return; }
      const opts = { fresh };
      if (needLoadout && !fresh) opts.loadout = { source: this.lo.source, plan: this.lo.plan };
      if (await Sectors.launch(n, opts)) {
        this.lo = null;
        this.close();
        $('pause').classList.add('hidden'); $('gameover').classList.add('hidden');
        UI.enterGame();
        SaveIO.saveLocal(true);
      }
    };
    const btn = box.querySelector('#scLaunch'), fb = box.querySelector('#scFresh');
    if (btn) btn.onclick = () => go(false);
    if (fb) fb.onclick = () => go(true);
  },
};

UI.openCampaign = () => SectorUI.open();
UI.showCaptured = (name, next) => {
  let el = document.getElementById('capturedDialog');
  if (!el) { el = document.createElement('div'); el.id = 'capturedDialog'; document.body.appendChild(el); }
  const wasPlaying = Game.state === 'playing';
  if (wasPlaying) Game.state = 'paused';
  el.innerHTML = `<div class="panel" style="position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:24;width:min(420px,calc(100vw - 24px));padding:16px;background:rgba(18,18,22,0.98);text-align:center">
    <div style="font-size:22px;color:#84f491">Sector captured</div><div style="margin:8px 0;font-size:16px">${Sectors.title(name)}</div>
    <div style="font-size:13px;color:#bbb">The enemy is gone and waves have stopped. Keep building here, or launch to a new sector.${next.length ? `<br><br>Now available: ${next.map(n => Sectors.title(n)).join(', ')}` : ''}</div>
    <div style="display:flex;gap:8px;margin-top:12px"><button id="capStay" style="flex:1">Keep playing</button><button id="capMap" class="accent" style="flex:1">Campaign map</button></div></div>`;
  el.style.display = '';
  const done = () => { el.style.display = 'none'; if (wasPlaying && Game.state === 'paused') Game.state = 'playing'; };
  el.querySelector('#capStay').onclick = done;
  el.querySelector('#capMap').onclick = () => { done(); SectorUI.open(); };
  el.addEventListener('mousedown', e => e.stopPropagation());
};

(() => {
  const _init = UI.init;
  UI.init = function () {
    _init.apply(this, arguments);
    $('campaignBtn').onclick = () => { this.initAudio(); SectorUI.open(); };
    $('campaignPauseBtn').onclick = () => { $('pause').classList.add('hidden'); Game.state = 'playing'; SectorUI.open(); };
  };
  // free play leaves the campaign; Continue waits for the sector maps
  const _sg = UI.startGame;
  UI.startGame = async function (resume) {
    await Sectors.ready;
    if (!resume) Sectors.current = null;
    return _sg.call(this, resume);
  };
  const _key = Input.keyDown;
  Input.keyDown = function (e) {
    if (SectorUI.isOpen() && !ResearchUI.isOpen()) { if (e.code === 'Escape') { SectorUI.close(); e.preventDefault(); } return; }
    return _key.call(this, e);
  };
  // game over in a sector: "Restart" replays that sector
  const _go = UI.showGameOver;
  UI.showGameOver = function () {
    _go.apply(this, arguments);
    if (Sectors.current) $('goText').innerHTML = `${Sectors.title(Sectors.current.name)} was lost on wave ${Game.wave}.<br>Restart the sector or pick another one from the campaign map.`;
  };
})();
