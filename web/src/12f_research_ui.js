// Research dialog (ResearchDialog): pan / zoom tech tree, node info with cost progress, partial research from the core.
const ResearchUI = {
  NODE: 48, SP: 14, ROW: 84,
  pos: null, sel: null, view: { x: 0, y: 0, z: 1 }, el: null, wasPlaying: false,

  layout() {
    // tidy tree: place child subtrees left to right, shifting each until its contour clears the previous ones
    const step = this.NODE + this.SP;
    const lay = n => {
      if (!n.children.length) return { pos: new Map([[n.name, 0]]), left: [0], right: [0] };
      let pos = new Map(), left = [], right = [], offs = [];
      n.children.forEach((c, i) => {
        const s = lay(c);
        let off = 0;
        if (i > 0) { off = -Infinity; for (let d = 0; d < Math.min(right.length, s.left.length); d++) off = Math.max(off, right[d] - s.left[d] + step); }
        offs.push(off);
        for (const [k, v] of s.pos) pos.set(k, v + off);
        s.left.forEach((v, d) => { left[d] = d < left.length && left[d] !== undefined ? Math.min(left[d], v + off) : v + off; });
        s.right.forEach((v, d) => { right[d] = d < right.length && right[d] !== undefined ? Math.max(right[d], v + off) : v + off; });
      });
      const px = (offs[0] + offs[offs.length - 1]) / 2;
      const out = new Map([[n.name, 0]]);
      for (const [k, v] of pos) out.set(k, v - px);
      return { pos: out, left: [0, ...left.map(v => v - px)], right: [0, ...right.map(v => v - px)] };
    };
    const r = lay(TECH['core-shard']);
    const depth = new Map();
    const walk = (n, d) => { depth.set(n.name, d); n.children.forEach(c => walk(c, d + 1)); };
    walk(TECH['core-shard'], 0);
    const minX = Math.min(...r.pos.values());
    this.pos = new Map();
    for (const [k, v] of r.pos) this.pos.set(k, { x: v - minX + 40, y: depth.get(k) * this.ROW + 40 });
    this.width = Math.max(...[...this.pos.values()].map(p => p.x)) + this.NODE + 40;
    this.height = Math.max(...[...this.pos.values()].map(p => p.y)) + this.NODE + 40;
  },

  state(n) {
    if (Research.has(n.name)) return 'done';
    if (n.parent && !Research.has(n.parent)) return 'hidden';
    return 'open';
  },
  icon(n) { return n.type === 'i' ? Assets.url('item-' + n.name) : n.type === 'l' ? Assets.url('liquid-' + n.name) : n.type === 'u' ? Assets.url(n.name) : Assets.url('icon:' + n.name); },
  core() { return Game.state !== 'title' && Game.state !== undefined && Research.active() ? Game.playerCore() : null; },

  open() {
    if (!this.pos) this.layout();
    let el = this.el;
    if (!el) {
      el = this.el = document.createElement('div'); el.id = 'researchDialog';
      el.style.cssText = 'position:fixed;inset:0;z-index:26;background:rgba(14,14,18,0.97);display:none;user-select:none';
      el.innerHTML = `<div style="position:absolute;left:0;right:0;top:0;height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:3px solid var(--line);background:#141418">
          <span style="color:var(--accent);font-size:18px">Research</span><span id="rsCount" style="color:#aaa;font-size:13px"></span><span id="rsMode" style="font-size:12px;color:#e55454"></span>
          <span style="flex:1"></span><button id="rsReset">Reset research</button><button id="rsClose">Close</button></div>
        <div id="rsView" style="position:absolute;left:0;right:0;top:47px;bottom:0;overflow:hidden;cursor:grab;touch-action:none">
          <div id="rsWorld" style="position:absolute;left:0;top:0;transform-origin:0 0"><svg id="rsLines" style="position:absolute;left:0;top:0;overflow:visible"></svg></div></div>
        <div id="rsInfo" class="panel" style="position:absolute;right:10px;top:56px;width:min(300px,calc(100vw - 20px));max-height:calc(100vh - 70px);overflow:auto;padding:10px;background:rgba(18,18,22,0.98);display:none"></div>`;
      document.body.appendChild(el);
      for (const ev of ['mousedown', 'pointerdown', 'wheel', 'keydown']) el.addEventListener(ev, e => e.stopPropagation());
      el.querySelector('#rsClose').onclick = () => this.close();
      el.querySelector('#rsReset').onclick = () => {
        if (!confirm('Reset all research? Every block and unit will have to be researched again.')) return;
        Research.reset(); this.render(); if (!$('hud').classList.contains('hidden')) UI.selectCategory(UI.category);
      };
      this.bindView(el.querySelector('#rsView'));
      this.build();
      // start centred on the top of the tree
      const vw = window.innerWidth;
      this.view = { x: vw / 2 - this.pos.get('core-shard').x - this.NODE / 2, y: 20, z: 1 };
    }
    this.wasPlaying = Game.state === 'playing';
    if (this.wasPlaying) Game.state = 'paused';
    el.style.display = '';
    this.render();
    this.applyView();
  },
  close() {
    if (!this.el) return;
    this.el.style.display = 'none';
    if (this.wasPlaying && Game.state === 'paused') Game.state = 'playing';
    this.wasPlaying = false;
  },
  focus(name) {
    const p = this.pos.get(name), r = this.el.querySelector('#rsView').getBoundingClientRect();
    this.view.x = r.width / 2 - (p.x + this.NODE / 2) * this.view.z; this.view.y = r.height / 2 - (p.y + this.NODE / 2) * this.view.z; this.applyView();
  },
  isOpen() { return !!this.el && this.el.style.display !== 'none'; },

  build() {
    const world = this.el.querySelector('#rsWorld'), svg = this.el.querySelector('#rsLines');
    world.style.width = this.width + 'px'; world.style.height = this.height + 'px';
    svg.setAttribute('width', this.width); svg.setAttribute('height', this.height);
    this.nodeEls = new Map(); this.lineEls = new Map();
    const h = this.NODE / 2;
    for (const n of Object.values(TECH)) {
      const p = this.pos.get(n.name);
      if (n.parent) {
        const q = this.pos.get(n.parent), my = (q.y + this.NODE + p.y) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${q.x + h},${q.y + this.NODE} V${my} H${p.x + h} V${p.y}`);
        path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '3');
        svg.appendChild(path); this.lineEls.set(n.name, path);
      }
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;left:${p.x}px;top:${p.y}px;width:${this.NODE}px;height:${this.NODE}px;box-sizing:border-box;border:3px solid #555;background:#1b1b20;display:flex;align-items:center;justify-content:center;cursor:pointer`;
      d.innerHTML = `<img src="${this.icon(n)}" style="width:32px;height:32px;image-rendering:pixelated;pointer-events:none"><div class="rsBar" style="position:absolute;left:3px;bottom:3px;height:3px;background:var(--accent);width:0"></div>`;
      d.title = titleCase(n.name);
      d.onclick = e => { if (this.dragged) return; this.sel = n; this.render(); Audio2.play('click', undefined, undefined, 0.3); };
      world.appendChild(d); this.nodeEls.set(n.name, d);
    }
  },

  render() {
    if (!this.el) return;
    const all = Object.values(TECH).filter(n => n.name !== 'core-shard');
    this.el.querySelector('#rsCount').textContent = `${all.filter(n => Research.has(n.name)).length} / ${all.length} researched`;
    this.el.querySelector('#rsMode').textContent = Game.state === 'title' || !Game.state ? '' : Research.active() ? '' : 'Tech tree is off in this game: everything is unlocked';
    for (const n of Object.values(TECH)) {
      const st = this.state(n), d = this.nodeEls.get(n.name), img = d.firstChild;
      d.style.borderColor = this.sel === n ? '#fff' : st === 'done' ? 'var(--accent)' : st === 'open' ? (Research.missing(n).length ? '#555' : '#8a8a8a') : '#2c2c2c';
      d.style.background = st === 'hidden' ? '#121214' : '#1b1b20';
      const src = st === 'hidden' ? Assets.url('icon-lock') : this.icon(n);
      if (img.getAttribute('src') !== src) img.src = src;
      img.style.width = img.style.height = st === 'hidden' ? '20px' : '32px';
      img.style.filter = st === 'done' ? '' : st === 'open' ? 'grayscale(0.6) brightness(0.75)' : 'opacity(0.35)';
      const frac = st === 'open' && n.req.length ? n.req.reduce((a, r) => a + Math.min(1, Research.progress(n, r.item) / r.amount), 0) / n.req.length : 0;
      d.lastChild.style.width = (frac > 0 ? frac * (this.NODE - 6) : 0) + 'px';
      const line = this.lineEls.get(n.name);
      if (line) line.setAttribute('stroke', st === 'done' ? '#ffd37f' : st === 'open' ? '#6b6b6b' : '#2e2e2e');
    }
    this.renderInfo();
  },

  renderInfo() {
    const box = this.el.querySelector('#rsInfo'), n = this.sel;
    if (!n) { box.style.display = 'none'; return; }
    box.style.display = '';
    const st = this.state(n), core = this.core();
    const kind = { b: 'Block', u: 'Unit', i: 'Item', l: 'Liquid' }[n.type];
    let html = `<div style="display:flex;gap:10px;align-items:center"><img src="${this.icon(n)}" style="width:40px;height:40px;image-rendering:pixelated">
      <div><div style="font-size:17px;color:var(--accent)">${titleCase(n.name)}</div><div style="font-size:12px;color:#999">${kind}</div></div>
      <span style="flex:1"></span><button id="rsInfoClose" style="padding:2px 8px">&times;</button></div>`;
    const desc = (typeof DESCRIPTIONS !== 'undefined' && DESCRIPTIONS[n.name]) || '';
    if (desc) html += `<div style="font-size:12px;color:#bbb;margin:8px 0">${desc}</div>`;
    if (st === 'done') html += `<div style="color:#84f491;margin-top:8px">${n.type === 'i' || n.type === 'l' ? 'Obtained' : 'Researched'}</div>`;
    else if (n.type === 'i') html += `<div style="margin-top:8px;font-size:13px">Unlocks when ${titleCase(n.name)} reaches your core.</div>`;
    else if (n.type === 'l') html += `<div style="margin-top:8px;font-size:13px">Unlocks when one of your buildings holds ${titleCase(n.name)}.</div>`;
    else {
      html += `<div style="margin-top:8px;font-size:13px;color:#ccc">Cost (items come out of your core, you can pay in parts):</div>`;
      for (const r of n.req) {
        const paid = Research.progress(n, r.item), have = core ? core.items[r.item.id] : 0;
        html += `<div style="margin-top:5px;font-size:13px"><div style="display:flex;align-items:center;gap:5px"><img src="${Assets.url(r.item.icon)}" style="width:16px;height:16px;image-rendering:pixelated">
          <span>${titleCase(r.item.name)}</span><span style="flex:1"></span><span>${paid} / ${r.amount}</span>${core ? `<small style="color:${have > 0 ? '#aaa' : '#e55454'}">&nbsp;(core ${have})</small>` : ''}</div>
          <div style="height:4px;background:#333;margin-top:2px"><div style="height:4px;width:${Math.min(100, paid / r.amount * 100)}%;background:var(--accent)"></div></div></div>`;
      }
      const miss = Research.missing(n);
      const what = m => m.startsWith('sector:') ? 'capture ' + Sectors.title(m.slice(7)) : m.startsWith('on:') ? 'be on ' + Sectors.title(m.slice(3)) + ' (or capture it)'
        : (TECH[m] && (TECH[m].type === 'i' || TECH[m].type === 'l') ? 'get ' : 'research ') + titleCase(m);
      if (miss.length) html += `<div style="margin-top:8px;font-size:13px;color:#e55454">Requires: ${miss.map(what).join(', ')}</div>`;
      let why = '';
      if (!Research.active()) why = Game.state === 'title' || !Game.state ? 'Start a game with the tech tree on to research' : 'Tech tree is off in this game';
      else if (!core) why = 'No core';
      else if (miss.length) why = '';
      const off = !!(why || miss.length);
      html += `<button id="rsDo" class="accent" style="margin-top:10px;width:100%${off ? ';opacity:0.4;cursor:default' : ''}" ${off ? 'disabled' : ''}>Research</button>`;
      if (why) html += `<div style="font-size:12px;color:#999;margin-top:4px">${why}</div>`;
    }
    const unlocks = n.children.filter(c => c.type === 'b' || c.type === 'u');
    if (unlocks.length) html += `<div style="margin-top:10px;font-size:12px;color:#999">Leads to: ${unlocks.map(c => titleCase(c.name)).join(', ')}</div>`;
    box.innerHTML = html;
    box.querySelector('#rsInfoClose').onclick = () => { this.sel = null; this.render(); };
    const btn = box.querySelector('#rsDo');
    if (btn) btn.onclick = () => {
      const r = Research.spend(n, this.core());
      if (r === 'spent') { UI.toast('Put items toward ' + titleCase(n.name) + '. Bring more to finish it.', 2); Audio2.play('uiButton'); }
      else if (!r) UI.toast('Your core has none of the needed items', 2, true);
      this.render();
    };
  },

  applyView() {
    const w = this.el.querySelector('#rsWorld');
    w.style.transform = `translate(${this.view.x}px,${this.view.y}px) scale(${this.view.z})`;
  },
  bindView(v) {
    let drag = null;
    v.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y }; this.dragged = false;
      v.style.cursor = 'grabbing';
    });
    window.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.dragged = true;
      if (this.dragged) { this.view.x = drag.vx + dx; this.view.y = drag.vy + dy; this.applyView(); }
    });
    window.addEventListener('pointerup', () => { if (drag) { drag = null; v.style.cursor = 'grab'; setTimeout(() => { this.dragged = false; }, 0); } });
    v.addEventListener('wheel', e => {
      e.preventDefault();
      const r = v.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const z = Math.max(0.25, Math.min(2, this.view.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      this.view.x = mx - (mx - this.view.x) * z / this.view.z; this.view.y = my - (my - this.view.y) * z / this.view.z; this.view.z = z;
      this.applyView();
    }, { passive: false });
  },
};

UI.openResearch = () => ResearchUI.open();
UI.onResearched = n => {
  const item = n.type === 'i' || n.type === 'l';
  if (Research.active() && Game.state !== 'title') {
    UI.toast(item ? `New ${n.type === 'i' ? 'item' : 'liquid'}: ${titleCase(n.name)}` : `Researched: ${titleCase(n.name)}`, 2.5);
    Audio2.play(item ? 'uiNotify' : 'uiUnlock');
  }
  if (!item && !$('hud').classList.contains('hidden')) { UI.selectCategory(UI.category); if (UI.configOpen) UI.openConfig(UI.configOpen); }
  if (ResearchUI.isOpen()) ResearchUI.render();
};

// hooks: J key / buttons, refuse picking unresearched blocks
(() => {
  const _key = Input.keyDown;
  Input.keyDown = function (e) {
    if (ResearchUI.isOpen()) { if (e.code === 'Escape' || e.code === 'KeyJ') { ResearchUI.close(); e.preventDefault(); } return; }
    if (e.code === 'KeyJ' && !e.repeat && (Game.state === 'playing' || Game.state === 'paused') && $('pause').classList.contains('hidden')) { ResearchUI.open(); return; }
    return _key.call(this, e);
  };
  const _select = Input.select;
  Input.select = function (block) {
    if (block && Research.locked(block)) { UI.toast(`${titleCase(block.name)} is not researched yet (J)`, 2, true); return; }
    return _select.call(this, block);
  };
  // the block menu depends on the game's research mode
  const _onNew = UI.onNewGame;
  UI.onNewGame = function () {
    _onNew.apply(this, arguments); this.selectCategory(this.category);
    if (Research.active() && !Research.has('conveyor')) setTimeout(() => UI.toast('Tech tree is on: press J (or the tree button) to research your first blocks', 6), 400);
  };
  const _init = UI.init;
  UI.init = function () {
    _init.apply(this, arguments);
    $('researchBtn').innerHTML = `<img src="${Assets.url('icon-tree')}">`;
    $('researchBtn').onclick = () => { if (Game.state === 'playing') ResearchUI.open(); };
    $('researchBtn').addEventListener('mousedown', e => e.stopPropagation());
    $('researchPauseBtn').onclick = () => { $('pause').classList.add('hidden'); Game.state = 'playing'; ResearchUI.open(); };
    $('researchTitleBtn').onclick = () => ResearchUI.open();
    $('researchMode').onchange = () => this.saveSettings();
  };
})();
