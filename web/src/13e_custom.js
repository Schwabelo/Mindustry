// Custom games (CustomGameDialog + CustomRulesDialog): pick one of Mindustry's built-in maps (Maps.defaultMapNames, exported
// by tools/MapExport.java) or a random map, a game mode preset (Gamemode.survival / sandbox / attack) and edit the rules.
// Wins like Logic.checkGameState: survive the win wave, or destroy every enemy core in attack mode.

const Custom = {
  current: null,      // { map, mode, seed, rules } of the custom game being played (null: free play / campaign)
  activeMap: null,    // map data of the current custom game
  cache: new Map(),
  won: false,

  index(name) { return MAP_INDEX.find(m => m.name === name) || null; },
  map(name) {
    if (!name) return null;
    if (!this.cache.has(name)) { const t = Sectors.maps && Sectors.maps['map:' + name]; if (!t) return null; this.cache.set(name, JSON.parse(t)); }
    return this.cache.get(name);
  },
  title(c) { return c && c.map ? (this.index(c.map) || {}).title || c.map : 'Random map'; },

  // Gamemode presets applied over the map's own rules
  modes: {
    survival: { title: 'Survival', desc: 'Enemies come in waves. Survive.', valid: m => !m || m.spawns > 0 },
    sandbox: { title: 'Sandbox', desc: 'Infinite resources, instant building, no wave timer. Source and void blocks.', valid: () => true },
    attack: { title: 'Attack', desc: 'Destroy every enemy core.', valid: m => !!m && m.teams > 1 },
  },
  baseRules(name, mode) {
    const idx = this.index(name), m = this.map(name);
    const r = { waveSpacing: m ? m.waveSpacing : 2 * 60 * 60, winWave: 0, initialWaveSpacing: 0, waves: true, waveTimer: true, teams: {} };
    if (mode === 'survival') { r.waves = true; r.waveTimer = true; }
    if (mode === 'sandbox') { r.infiniteResources = true; r.waves = true; r.waveTimer = false; }
    if (mode === 'attack') {
      r.attackMode = true; r.waveTimer = true; r.waveSpacing = 2 * 60 * 60;
      r.waves = !!(idx && idx.spawns > 0); // maps without drop zones keep waves off (their own rules)
      r.teams.crux = { infiniteResources: true, buildAi: true };
    }
    return Rules.make(r);
  },

  start(cfg) {
    Sectors.current = Sectors.pending = null;
    this.current = cfg;
    Game.researchMode = false;
    UI.initAudio();
    Game.newGame(cfg.seed);
    UI.enterGame();
  },

  // map, rules and win state on top of a fresh game (Game.newGame wrapper below)
  apply(c) {
    const R = Rules.cur;
    Game.attackMode = !!R.attackMode;
    Game.winWave = R.winWave || 0;
    Game.waveSpacing = R.waveSpacing;
    const m = this.activeMap;
    if (m) {
      Sectors.placeMap(m);
      const groups = m.groups.filter(g => !g.boss);
      Game.waveGroups = () => groups;
      BOSS_GROUPS = m.groups.filter(g => g.boss);
      Pathfinder.init();
      const core = Game.playerCore();
      if (core && Game.player) { Game.player.x = core.x; Game.player.y = core.y; Render.camX = core.x; Render.camY = core.y; }
      if (World.coreTile) World.prerenderAround(World.coreTile.x, World.coreTile.y, 2);
      UI.minimapDirty = true;
    }
    this.won = false;
    this.hadEnemyCores = Game.byTeam.crux.some(b => b.block.cls === 'Core' && !b.dead);
  },

  checkWin() {
    if (!this.current || this.won || Game.state !== 'playing') return;
    const R = Rules.cur;
    const enemyCores = Game.byTeam.crux.some(b => b.block.cls === 'Core' && !b.dead);
    const win = R.attackMode ? !enemyCores && this.hadEnemyCores
      : R.waves && R.winWave > 0 && Game.wave >= R.winWave && Game.enemiesAlive() === 0;
    if (enemyCores) this.hadEnemyCores = true;
    if (win) { this.won = true; CustomUI.showWin(); }
  },
};

{
  // World.generate: the custom game's map instead of a generated one
  const _gen = World.generate;
  World.generate = function (seed) {
    if (Custom.activeMap && !Sectors.pending) return this.loadSector(Custom.activeMap);
    return _gen.call(this, seed);
  };
  const _ng = Game.newGame;
  Game.newGame = function (seed) {
    const c = Sectors.pending || Sectors.current ? null : Custom.current;
    if (!c) { Custom.current = null; Custom.activeMap = null; return _ng.call(this, seed); }
    Custom.activeMap = c.map ? Custom.map(c.map) : null;
    Custom.hadEnemyCores = false;
    Rules.next = c.rules;
    const r = _ng.call(this, c.map ? 1 : seed);
    Custom.apply(c);
    // Logic.play: first wave after initialWaveSpacing, or twice the wave spacing
    this.wave = 1;
    this.waveCountdown = Rules.cur.initialWaveSpacing > 0 ? Rules.cur.initialWaveSpacing : Rules.cur.waveSpacing * 2;
    setTimeout(() => UI.toast(`${Custom.title(c)} · ${Custom.modes[c.mode].title}`, 4), 300);
    return r;
  };
  const _ws = Weather.setup;
  Weather.setup = function (seed) {
    _ws.call(this, seed);
    const m = Custom.activeMap;
    if (!m || !Custom.current || Sectors.current) return;
    this.entries = Rules.cur.weather ? m.weather.filter(w => WEATHER_DEFS[w[0]]).map(([name, minF, maxF, minD, maxD]) => ({ name, minF, maxF, minD, maxD })) : [];
    this.initCooldowns();
    this.active = [];
  };
  const _gu = Game.update;
  let t = 0;
  Game.update = function () { _gu.apply(this, arguments); if ((t += Time.delta) >= 30) { t = 0; Custom.checkWin(); } };

  // launching a sector or free play ends the custom game
  const _launch = Sectors.launch;
  Sectors.launch = function () { Custom.current = null; Custom.activeMap = null; return _launch.apply(this, arguments); };
  const _sg = UI.startGame;
  UI.startGame = function (resume) { if (!resume) { Custom.current = null; Custom.activeMap = null; } return _sg.apply(this, arguments); };

  // saves remember the custom game and the rules
  const _ser = SaveIO.serialize;
  SaveIO.serialize = function () {
    const d = _ser.apply(this, arguments);
    d.rules = Rules.serialize();
    if (Custom.current && !Sectors.current) d.custom = { map: Custom.current.map, mode: Custom.current.mode, seed: Custom.current.seed, won: Custom.won };
    return d;
  };
  const _load = SaveIO.load;
  SaveIO.load = function (data) {
    const c = data && data.custom && !data.sec ? data.custom : null;
    if (c && c.map && !Custom.map(c.map)) throw new Error('Maps are still loading');
    Rules.reset(data && data.rules ? data.rules : undefined);
    Custom.current = c ? Object.assign({}, c, { rules: Rules.make(data.rules || {}) }) : null;
    Custom.activeMap = c && c.map ? Custom.map(c.map) : null;
    const r = _load.call(this, data);
    if (c) {
      const R = Rules.cur;
      Game.attackMode = !!R.attackMode; Game.winWave = R.winWave || 0; Game.waveSpacing = R.waveSpacing;
      const m = Custom.activeMap;
      if (m) { const groups = m.groups.filter(g => !g.boss); Game.waveGroups = () => groups; BOSS_GROUPS = m.groups.filter(g => g.boss); Pathfinder.init(); }
      Custom.won = !!c.won; Custom.hadEnemyCores = Game.byTeam.crux.some(b => b.block.cls === 'Core');
    }
    return r;
  };
}

// ---------------------------------------------------------------- dialog
const CustomUI = {
  el: null, sel: null, mode: 'survival', rules: null,

  RULE_GROUPS: [
    ['Waves', [
      ['waves', 'Waves', 'bool'], ['waveTimer', 'Wave timer', 'bool', r => r.waves], ['waitEnemies', 'Wait for wave to end', 'bool', r => r.waves && r.waveTimer],
      ['winWave', 'Win wave (0 = none)', 'int', r => r.waves], ['waveSpacing', 'Wave spacing (s)', 'sec', r => r.waves && r.waveTimer],
      ['initialWaveSpacing', 'First wave after (s, 0 = 2× spacing)', 'sec', r => r.waves && r.waveTimer], ['dropZoneRadius', 'Drop zone radius (tiles)', 'tiles', r => r.waves],
    ]],
    ['Resources & buildings', [
      ['infiniteResources', 'Infinite resources', 'bool'], ['buildCostMultiplier', 'Build cost ×', 'num', r => !r.infiniteResources],
      ['buildSpeedMultiplier', 'Build speed ×', 'num'], ['deconstructRefundMultiplier', 'Deconstruct refund ×', 'num', r => !r.infiniteResources],
      ['blockHealthMultiplier', 'Block health ×', 'num'], ['blockDamageMultiplier', 'Block damage ×', 'num'],
      ['fire', 'Fire', 'bool'], ['reactorExplosions', 'Reactor explosions', 'bool'],
    ]],
    ['Units', [
      ['unitCap', 'Unit cap modifier', 'int'], ['unitDamageMultiplier', 'Unit damage ×', 'num'], ['unitHealthMultiplier', 'Unit health ×', 'num'],
      ['unitBuildSpeedMultiplier', 'Unit build speed ×', 'num'], ['unitCostMultiplier', 'Unit cost ×', 'num'],
    ]],
    ['Enemy team', [
      ['attackMode', 'Attack mode (destroy enemy cores to win)', 'bool'], ['enemyCoreBuildRadius', 'No-build radius around enemy cores (tiles)', 'tiles'],
      ['crux.buildAi', 'AI builds a base (needs waves off)', 'bool'], ['crux.buildAiTier', 'AI base tier (0-1)', 'num', r => r.teams.crux.buildAi],
      ['crux.infiniteResources', 'Enemy infinite resources', 'bool'], ['crux.fillItems', 'Enemy cores stay full', 'bool'],
      ['crux.unitDamageMultiplier', 'Enemy unit damage ×', 'num'], ['crux.unitHealthMultiplier', 'Enemy unit health ×', 'num'],
      ['crux.blockHealthMultiplier', 'Enemy block health ×', 'num'],
    ]],
    ['Environment', [['weather', 'Weather', 'bool'], ['solarMultiplier', 'Solar power ×', 'num']]],
  ],

  get(k) { const r = this.rules; if (k.startsWith('crux.')) return r.teams.crux[k.slice(5)]; return r[k]; },
  set(k, v) { const r = this.rules; if (k.startsWith('crux.')) r.teams.crux[k.slice(5)] = v; else r[k] = v; },

  async open() {
    UI.initAudio();
    await Sectors.ready;
    if (!this.el) {
      const el = this.el = document.createElement('div');
      el.id = 'customDialog';
      el.style.cssText = 'position:fixed;inset:0;z-index:25;background:#0e0e12;display:none;user-select:none;overflow:hidden';
      el.innerHTML = `<div style="position:absolute;left:0;right:0;top:0;height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:3px solid var(--line);background:#141418">
          <span style="color:var(--accent);font-size:18px">Custom game</span><span style="flex:1"></span><button id="cgClose">Close</button></div>
        <div id="cgMaps" style="position:absolute;left:0;top:47px;bottom:0;right:min(380px,100vw);overflow:auto;padding:10px;display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start"></div>
        <div id="cgInfo" class="panel" style="position:absolute;right:0;top:47px;bottom:0;width:min(380px,100vw);box-sizing:border-box;overflow:auto;padding:10px;background:rgba(18,18,22,0.98)"></div>`;
      document.body.appendChild(el);
      for (const ev of ['mousedown', 'pointerdown', 'wheel', 'keydown']) el.addEventListener(ev, e => e.stopPropagation());
      el.querySelector('#cgClose').onclick = () => this.close();
      this.buildMaps();
    }
    this.el.style.display = '';
    if (!this.sel) this.select(MAP_INDEX[0] ? MAP_INDEX[0].name : null);
    else this.render();
  },
  close() { if (this.el) this.el.style.display = 'none'; },
  isOpen() { return !!this.el && this.el.style.display !== 'none'; },

  buildMaps() {
    const list = this.el.querySelector('#cgMaps');
    const card = (name, title, sub, canvas) => {
      const d = document.createElement('div');
      d.dataset.map = name || '';
      d.style.cssText = 'width:120px;cursor:pointer;border:3px solid #555;background:#111;box-sizing:border-box';
      if (canvas) { canvas.style.cssText = 'width:114px;height:114px;image-rendering:pixelated;display:block'; d.appendChild(canvas); }
      else d.insertAdjacentHTML('beforeend', '<div style="width:114px;height:114px;display:flex;align-items:center;justify-content:center;font-size:40px;color:#666">?</div>');
      d.insertAdjacentHTML('beforeend', `<div style="padding:3px 4px;font-size:12px;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div><div style="padding:0 4px 4px;font-size:10px;color:#888">${sub}</div>`);
      d.onclick = () => { this.select(name); Audio2.play('click', undefined, undefined, 0.3); };
      list.appendChild(d);
    };
    card(null, 'Random map', 'generated', null);
    for (const m of MAP_INDEX) card(m.name, m.title, `${m.w}×${m.h}${m.teams > 1 ? ' · enemy base' : ''}`, SectorUI.previewMap('map:' + m.name, this.mapData(m.name)));
  },
  mapData(name) { const m = Custom.map(name); return m; },

  select(name) {
    this.sel = name;
    const idx = name ? Custom.index(name) : null;
    if (!Custom.modes[this.mode].valid(idx)) this.mode = Object.keys(Custom.modes).find(k => Custom.modes[k].valid(idx));
    this.rules = Custom.baseRules(name, this.mode);
    this.render();
  },

  render() {
    for (const d of this.el.querySelectorAll('#cgMaps > div')) d.style.borderColor = (d.dataset.map || null) === this.sel ? 'var(--accent)' : '#555';
    const info = this.el.querySelector('#cgInfo'), idx = this.sel ? Custom.index(this.sel) : null;
    const res = idx ? idx.resources.map(r => Items[r] ? `<img src="${Assets.url(Items[r].icon)}" style="width:16px;height:16px;vertical-align:middle">` : '').join(' ') : '';
    let h = `<div style="color:var(--accent);font-size:17px">${idx ? idx.title : 'Random map'}</div>`;
    if (idx) h += `<div style="color:#999;font-size:12px">by ${idx.author || '?'} · ${idx.w}×${idx.h} · ${idx.spawns} drop zone${idx.spawns === 1 ? '' : 's'}${idx.teams > 1 ? ' · enemy cores' : ''}</div>
      ${idx.desc ? `<p style="font-size:12px;color:#ccc;margin:6px 0">${idx.desc}</p>` : ''}<div style="font-size:12px">Resources: ${res}</div>`;
    else h += `<p style="font-size:12px;color:#ccc;margin:6px 0">A generated map (seed ${UI.seed}), like free play.</p>`;
    h += `<div style="margin:10px 0 4px;color:#aaa">Mode</div><div style="display:flex;gap:6px;flex-wrap:wrap">`;
    for (const [k, md] of Object.entries(Custom.modes)) {
      const ok = md.valid(idx);
      h += `<button data-mode="${k}" ${ok ? '' : 'disabled'} class="${this.mode === k ? 'accent' : ''}" title="${md.desc}" style="flex:1;${ok ? '' : 'opacity:0.35;cursor:not-allowed'}">${md.title}</button>`;
    }
    h += `</div><div style="font-size:11px;color:#999;margin-top:3px">${Custom.modes[this.mode].desc}</div>`;
    for (const [g, rows] of this.RULE_GROUPS) {
      h += `<div style="margin:12px 0 4px;color:var(--accent);font-size:13px">${g}</div>`;
      for (const [k, label, type, cond] of rows) {
        const on = !cond || cond(this.rules), v = this.get(k);
        const show = type === 'sec' ? Math.round(v / 60) : type === 'tiles' ? Math.round(v / TS) : v;
        const input = type === 'bool' ? `<input type="checkbox" data-k="${k}" data-t="${type}" ${v ? 'checked' : ''} ${on ? '' : 'disabled'}>`
          : `<input type="number" data-k="${k}" data-t="${type}" value="${show}" step="${type === 'num' ? 0.1 : 1}" ${on ? '' : 'disabled'} style="width:70px;background:#222;color:#eee;border:2px solid #444;font:inherit;padding:1px 3px">`;
        h += `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;padding:2px 0;color:${on ? '#ddd' : '#666'}"><span>${label}</span>${input}</label>`;
      }
    }
    h += `<div style="display:flex;gap:6px;margin-top:14px"><button id="cgReset" style="flex:1">Reset rules</button><button id="cgStart" class="accent" style="flex:2">Play</button></div>`;
    info.innerHTML = h;
    for (const b of info.querySelectorAll('[data-mode]')) b.onclick = () => { this.mode = b.dataset.mode; this.rules = Custom.baseRules(this.sel, this.mode); this.render(); };
    for (const inp of info.querySelectorAll('input[data-k]')) inp.onchange = () => {
      const t = inp.dataset.t, k = inp.dataset.k;
      let v = t === 'bool' ? inp.checked : +inp.value;
      if (t !== 'bool') { if (!isFinite(v)) v = 0; v = Math.max(t === 'int' && k === 'unitCap' ? -999 : 0, v); if (t === 'sec') v *= 60; if (t === 'tiles') v *= TS; if (t === 'int') v = Math.round(v); }
      if (k === 'crux.buildAiTier') v = Mathf.clamp(v, 0, 1);
      this.set(k, v);
      this.render();
    };
    info.querySelector('#cgReset').onclick = () => { this.rules = Custom.baseRules(this.sel, this.mode); this.render(); };
    info.querySelector('#cgStart').onclick = () => {
      const rules = JSON.parse(JSON.stringify(this.rules));
      this.close();
      Custom.start({ map: this.sel, mode: this.mode, seed: this.sel ? 1 : UI.seed, rules });
    };
  },

  showWin() {
    Audio2.play('uiUnlock');
    Game.state = 'paused';
    let el = document.getElementById('cgWin');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cgWin'; el.className = 'overlay';
      el.innerHTML = `<div class="box panel"><h1 style="color:var(--accent)">Victory</h1><p id="cgWinText"></p>
        <button class="accent" id="cgWinStay">Keep playing</button><button id="cgWinTitle">Title</button></div>`;
      document.body.appendChild(el);
      el.querySelector('#cgWinStay').onclick = () => { el.classList.add('hidden'); Game.state = 'playing'; };
      el.querySelector('#cgWinTitle').onclick = () => { el.classList.add('hidden'); UI.showTitle(); };
    }
    const c = Custom.current;
    el.querySelector('#cgWinText').innerHTML = Rules.cur.attackMode ? `Every enemy core on ${Custom.title(c)} is destroyed.` : `You survived ${Rules.cur.winWave} waves on ${Custom.title(c)}.`;
    el.classList.remove('hidden');
  },
};

(() => {
  const _init = UI.init;
  UI.init = function () {
    _init.apply(this, arguments);
    $('customBtn').onclick = () => CustomUI.open();
  };
  const _key = Input.keyDown;
  Input.keyDown = function (e) {
    if (CustomUI.isOpen()) { if (e.code === 'Escape') { CustomUI.close(); e.preventDefault(); } return; }
    return _key.call(this, e);
  };
  // game over in a custom game: "Try again" replays it
  const _go = UI.showGameOver;
  UI.showGameOver = function () {
    _go.apply(this, arguments);
    if (Custom.current) $('goText').innerHTML = `Your core on ${Custom.title(Custom.current)} was destroyed on wave ${Game.wave}.<br>Try again with the same map and rules.`;
  };
})();
