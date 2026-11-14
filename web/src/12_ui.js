// HUD (DOM): wave panel, core items, block menu, tooltips, config popups, minimap, overlays.

const $ = id => document.getElementById(id);
const titleCase = s => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const UI = {
  category: 'distribution',
  configOpen: null,
  minimapDirty: true,
  labels: [],
  frame: 0,
  itemEls: {},

  init() {
    // logo + skip button icons
    $('logoImg').src = Assets.url('logo');
    $('skipWave').innerHTML = `<img src="${Assets.url('icon-play')}">`;
    $('skipWave').onclick = () => { if (Game.state === 'playing' && Game.enemiesAlive() === 0) { Game.runWave(); Audio2.play('uiButton'); } else if (Game.enemiesAlive() > 0) UI.toast('Kill the enemies first', 1.5, true); };

    // categories
    const cats = $('cats');
    for (const c of CATEGORIES) {
      if (!BLOCK_LIST.some(b => b.category === c)) continue;
      const btn = document.createElement('div');
      btn.className = 'bbtn'; btn.dataset.cat = c; btn.title = titleCase(c);
      btn.innerHTML = `<img src="${Assets.url('icon-' + c)}">`;
      btn.onclick = () => { this.selectCategory(c); Audio2.play('click', undefined, undefined, 0.3); };
      cats.appendChild(btn);
    }
    this.selectCategory('distribution');

    // overlays
    $('playBtn').onclick = () => this.startGame();
    $('continueBtn').onclick = () => this.startGame(true);
    $('importBtn').onclick = () => { this.initAudio(); SaveIO.importFile(() => this.enterGame()); };
    $('saveBtn').onclick = () => { SaveIO.saveLocal(); Audio2.play('uiButton'); };
    $('loadBtn').onclick = () => { if (SaveIO.hasSave() && SaveIO.loadLocal()) { $('pause').classList.add('hidden'); Game.state = 'playing'; UI.toast('Save loaded', 1.5); } else if (!SaveIO.hasSave()) UI.toast('No save yet', 1.5); };
    $('exportBtn').onclick = () => SaveIO.exportFile();
    $('importBtn2').onclick = () => SaveIO.importFile(() => { $('pause').classList.add('hidden'); Game.state = 'playing'; });
    $('newMapBtn').onclick = () => { this.seed = Math.floor(Math.random() * 1e6); this.updateSeed(); Audio2.play('uiButton'); };
    $('resumeBtn').onclick = () => this.togglePause();
    $('restartBtn').onclick = () => { $('pause').classList.add('hidden'); Game.newGame(Game.seed); Game.state = 'playing'; };
    $('quitBtn').onclick = () => { $('pause').classList.add('hidden'); this.showTitle(); };
    $('goRestart').onclick = () => { $('gameover').classList.add('hidden'); Game.newGame(Math.floor(Math.random() * 1e6)); Game.state = 'playing'; };
    $('goTitle').onclick = () => { $('gameover').classList.add('hidden'); this.showTitle(); };
    $('musicVol').oninput = e => { Audio2.setMusic(e.target.value / 100); this.saveSettings(); };
    $('sfxVol').oninput = e => { Audio2.setSfx(e.target.value / 100); this.saveSettings(); };
    this.loadSettings();

    const controls = [
      ['WASD', 'move'], ['Mouse wheel', 'zoom'], ['Left click', 'build / shoot / mine ore / configure'],
      ['Left drag', 'build in a line'], ['Right click', 'remove (drag for an area) / cancel'], ['R', 'rotate block'],
      ['Q / middle click', 'pick block under cursor'], ['1-9', 'select block in category'], ['Shift (hold) or C', 'command units: drag to select, right-click to move / attack'],
      ['F (hold) / T', 'copy an area as a schematic / schematic library'],
      ['J', 'research (tech tree)'], ['N', 'call next wave now'], ['X', 'clear build queue'], ['Space / Esc', 'pause'],
    ];
    $('controls').innerHTML = controls.map(([k, v]) => `<b>${k}</b><span>${v}</span>`).join('');

    // stop clicks on HUD from reaching the game
    for (const id of ['wave', 'blockMenu', 'minimapWrap', 'config']) $(id).addEventListener('mousedown', e => e.stopPropagation());
    $('minimap').addEventListener('mousedown', e => this.minimapClick(e));

    this.seed = Math.floor(Math.random() * 1e6);
    this.updateSeed();
  },

  updateSeed() { $('seedText').textContent = 'Map seed: ' + this.seed; },

  loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('mindustry-lite-settings') || '{}');
      if (s.music !== undefined) { $('musicVol').value = s.music; Audio2.musicVol = s.music / 100; }
      if (s.sfx !== undefined) { $('sfxVol').value = s.sfx; Audio2.sfxVol = s.sfx / 100; }
    } catch (e) { /* storage unavailable */ }
  },
  saveSettings() {
    try { localStorage.setItem('mindustry-lite-settings', JSON.stringify({ music: +$('musicVol').value, sfx: +$('sfxVol').value })); } catch (e) { /* ignore */ }
  },

  showTitle() {
    if (Game.state === 'playing' || Game.state === 'paused') SaveIO.saveLocal(true);
    Game.state = 'title';
    $('hud').classList.add('hidden');
    $('title').classList.remove('hidden');
    const info = SaveIO.saveInfo();
    $('continueBtn').classList.toggle('hidden', !info);
    if (info) $('continueBtn').textContent = `Continue (wave ${info.wave})`;
  },

  initAudio() {
    Audio2.init(); Audio2.resume();
    Audio2.setSfx(+$('sfxVol').value / 100);
    Audio2.musicVol = +$('musicVol').value / 100;
    Audio2.startMusic();
  },

  enterGame() {
    $('title').classList.add('hidden');
    Game.state = 'playing';
    $('hud').classList.remove('hidden');
    Audio2.play('uiButton');
  },

  startGame(resume) {
    this.initAudio();
    if (resume) { if (!SaveIO.loadLocal()) return; }
    else { Game.researchMode = false; Game.newGame(this.seed); } // free play: everything unlocked, like custom games
    this.enterGame();
  },

  onNewGame() {
    this.itemEls = {};
    $('items').innerHTML = '';
    this.minimapDirty = true;
    this.closeConfig();
  },

  togglePause() {
    if (Game.state === 'playing') { Game.state = 'paused'; $('pause').classList.remove('hidden'); }
    else if (Game.state === 'paused') { Game.state = 'playing'; $('pause').classList.add('hidden'); }
  },

  showGameOver() {
    let best = 0;
    try { best = +(localStorage.getItem('mindustry-lite-best') || 0); } catch (e) { /* ignore */ }
    const survived = Game.wave - 1;
    if (survived > best) { best = survived; try { localStorage.setItem('mindustry-lite-best', best); } catch (e) { /* ignore */ } }
    $('goText').innerHTML = `You survived <b style="color:var(--accent)">${survived}</b> wave${survived === 1 ? '' : 's'}.<br>` +
      `Enemies destroyed: ${Game.stats.kills} &middot; Blocks built: ${Game.stats.built}<br>Best: ${best} waves`;
    $('gameover').classList.remove('hidden');
  },

  toast(msg, secs = 2.5, warn = false) {
    const el = document.createElement('div');
    el.className = 'toast panel';
    if (warn) el.style.borderColor = '#e55454';
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = 0; }, secs * 1000);
    setTimeout(() => el.remove(), secs * 1000 + 600);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  },

  // ------------------------------------------------------------ block menu
  selectCategory(c) {
    this.category = c;
    for (const el of $('cats').children) el.classList.toggle('sel', el.dataset.cat === c);
    const blocks = $('blocks');
    blocks.innerHTML = '';
    this.hoverBlock = null;
    const shown = BLOCK_LIST.filter(b => b.category === c && !Research.locked(b));
    if (!shown.length) blocks.innerHTML = `<div style="font-size:12px;color:#999;padding:6px">Nothing researched here yet. Press J to research.</div>`;
    shown.forEach((b, i) => {
      const btn = document.createElement('div');
      btn.className = 'bbtn'; btn.dataset.block = b.name;
      btn.innerHTML = `<img src="${Assets.url('icon:' + b.name)}">`;
      btn.onclick = () => {
        Input.select(Input.selected === b ? null : b);
        Audio2.play('click', undefined, undefined, 0.3);
      };
      btn.onmouseenter = () => { this.hoverBlock = b; this.showBlockInfo(b); };
      btn.onmouseleave = () => { if (this.hoverBlock === b) this.hoverBlock = null; this.showBlockInfo(Input.selected); };
      blocks.appendChild(btn);
    });
    this.refreshBlockButtons();
  },

  selectIndex(i) {
    const list = BLOCK_LIST.filter(b => b.category === this.category && !Research.locked(b));
    if (list[i]) Input.select(Input.selected === list[i] ? null : list[i]);
  },

  refreshBlockButtons() {
    const core = Game.playerCore();
    for (const el of $('blocks').children) {
      const b = BLOCKS[el.dataset.block];
      if (!b) continue;
      el.classList.toggle('sel', Input.selected === b);
      el.classList.toggle('locked', !!core && !b.requirements.every(r => core.items[r.item.id] >= r.amount));
    }
  },

  showBlockInfo(b) {
    const el = $('blockInfo');
    if (!b) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const core = Game.playerCore();
    const req = b.requirements.map(r => {
      const have = core ? core.items[r.item.id] : 0;
      const short = have < r.amount;
      return `<span style="color:${short ? '#e55454' : '#fff'}"><img src="${Assets.url(r.item.icon)}">${r.amount} ${titleCase(r.item.name)}` +
        (short ? `<small>(have ${have})</small>` : '') + `</span>`;
    }).join('');
    el.innerHTML = `<div class="name">${titleCase(b.name)}</div><div class="req">${req}</div>` +
      `<div class="stats">${this.blockStats(b).join('<br>')}</div><div class="desc">${DESCRIPTIONS[b.name] || ''}</div>`;
  },

  blockStats(b) {
    const s = [];
    s.push(`Health: ${b.health}` + (b.size > 1 ? ` &middot; Size: ${b.size}x${b.size}` : ''));
    if (b.cls === 'Conveyor') s.push(`Speed: ${b.displayedSpeed} items/s`);
    if (b.cls === 'Drill') {
      const mines = ['copper', 'lead', 'sand', 'coal', 'scrap', 'titanium', 'thorium'].filter(n => Items[n] && Items[n].hardness <= b.tier).map(titleCase);
      s.push(`Mines: ${mines.join(', ')}`, `Base speed: ${(60 / (b.drillTime + 50) * 4).toFixed(2)}/s`);
    }
    if (b.cls === 'GenericCrafter') s.push(`${b.consumeItems.map(c => c.amount + ' ' + c.item.name).join(' + ')} &rarr; ${b.outputItem.amount} ${b.outputItem.item.name}`);
    if (b.consumesPower) s.push(`Power use: ${(b.consumesPower * 60).toFixed(0)}/s`);
    if (b.powerProduction) s.push(`Power output: ${(b.powerProduction * 60).toFixed(1)}/s`);
    if (b.cls === 'Battery') s.push(`Capacity: ${b.capacity}`);
    if (b.cls === 'PowerNode') s.push(`Laser range: ${b.laserRange} tiles &middot; Max links: ${b.maxNodes}`);
    if (b.cls === 'ItemTurret') s.push(`Range: ${(b.range / TS).toFixed(1)} tiles &middot; Ammo: ${Object.keys(b.ammo).join(', ')}`, `Targets: ${[b.targetGround && 'ground', b.targetAir && 'air'].filter(Boolean).join(' + ')}`);
    if (b.cls === 'PowerTurret') s.push(`Range: ${(b.range / TS).toFixed(1)} tiles &middot; Damage: ${b.shootType.damage}`, `Targets: ground`);
    if (b.coolant) s.push(`Coolant: water/cryofluid, +${Math.round(b.coolant * 0.4 * (b.coolantMultiplier || 5) * 100 / 1)}% fire rate with water`);
    if (b.liquidUse) s.push(`Water boost: 1.6x speed (uses ${(b.liquidUse * 60).toFixed(1)}/s)`);
    if (b.cls === 'Pump') s.push(`Output: ${(b.pumpAmount * 60).toFixed(0)} water/s per tile`);
    if (b.hasLiquids && b.cls !== 'Drill' && !b.coolant) s.push(`Liquid capacity: ${b.liquidCapacity}`);
    if (b.cls === 'MendProjector') s.push(`Heals ${b.healPercent}% every ${(b.reload / 60).toFixed(1)}s in ${(b.range / TS).toFixed(1)} tiles`);
    if (b.cls === 'UnitFactory') s.push(`Produces: ${b.plans.map(p => p.unit).join(', ')}`);
    return s;
  },

  // ------------------------------------------------------------ config popups
  openConfig(b) {
    const el = $('config');
    el.innerHTML = '';
    this.configOpen = b;
    const addBtn = (img, title, sel, fn) => {
      const d = document.createElement('div');
      d.className = 'bbtn' + (sel ? ' sel' : ''); d.title = title;
      d.innerHTML = img ? `<img src="${img}">` : `<span style="font-size:18px">&times;</span>`;
      d.onclick = () => { fn(); Audio2.play('click', undefined, undefined, 0.3); this.openConfig(b); };
      el.appendChild(d);
    };
    if (b instanceof UnitFactory) {
      const head = document.createElement('div'); head.className = 'wide'; head.textContent = 'Unit to produce';
      el.appendChild(head);
      b.block.plans.forEach((p, i) => { if (!Research.locked(p.unit)) addBtn(Assets.url(p.unit), titleCase(p.unit) + ': ' + p.requirements.map(r => r.amount + ' ' + r.item.name).join(', '), b.currentPlan === i, () => b.configure(i)); });
      addBtn(null, 'None', b.currentPlan === -1, () => b.configure(-1));
    } else if (typeof LiquidSource !== 'undefined' && b instanceof LiquidSource) {
      const head = document.createElement('div'); head.className = 'wide'; head.textContent = 'Output liquid';
      el.appendChild(head);
      for (const l of LIQUIDS) addBtn(Assets.url(l.icon), titleCase(l.name), b.source === l, () => b.configure(b.source === l ? null : l));
      addBtn(null, 'Clear', !b.source, () => b.configure(null));
    } else {
      const head = document.createElement('div'); head.className = 'wide'; head.textContent = b instanceof Sorter ? 'Sort item' : typeof ItemSource !== 'undefined' && b instanceof ItemSource ? 'Output item' : 'Unload item';
      el.appendChild(head);
      for (const it of ITEMS) addBtn(Assets.url(it.icon), titleCase(it.name), b.sortItem === it, () => b.configure(b.sortItem === it ? null : it));
      addBtn(null, 'Clear', !b.sortItem, () => b.configure(null));
    }
    el.classList.remove('hidden');
    const [sx, sy] = Render.worldToScreen(b.x, b.y + b.block.size * TS / 2);
    el.style.left = Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, sx - el.offsetWidth / 2)) + 'px';
    el.style.top = Math.max(4, sy - el.offsetHeight - 10) + 'px';
  },
  closeConfig() { this.configOpen = null; $('config').classList.add('hidden'); },

  // ------------------------------------------------------------ world labels (canvas text)
  worldLabel(x, y, text, item) { this.labels.push({ x, y, text, item }); },
  drawWorldLabels() {
    const ctx = Render.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const d = Render.dpr;
    ctx.font = `${Math.round(13 * d)}px MindustryFont, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of this.labels) {
      const [sx, sy] = Render.worldToScreen(l.x, l.y);
      const w = ctx.measureText(l.text).width + (l.item ? 20 * d : 0) + 10 * d;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(sx * d - w / 2, sy * d - 10 * d, w, 20 * d);
      if (l.item) {
        const r = Assets.get(l.item.icon);
        ctx.drawImage(r.img, r.x, r.y, r.w, r.h, sx * d - w / 2 + 4 * d, sy * d - 8 * d, 16 * d, 16 * d);
      }
      ctx.fillStyle = l.item ? '#fff' : '#e55454';
      ctx.fillText(l.text, sx * d + (l.item ? 10 * d : 0), sy * d + 1);
    }
    this.labels = [];
  },

  // ------------------------------------------------------------ per-frame HUD update
  update() {
    if (Game.state === 'title') return;
    this.frame++;
    const core = Game.playerCore();
    if (this.frame % 6 === 0) {
      $('waveTitle').textContent = `Wave ${Game.wave}` + (Game.winWave ? ` / ${Game.winWave}` : '');
      const secs = Math.max(0, Math.ceil(Game.waveCountdown / 60));
      const enemies = Game.enemiesAlive();
      $('waveSub').textContent = (Game.waveCountdown === Infinity ? (Game.waveStatus || 'No more waves') : `Next in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`) + (enemies ? ` · ${enemies} enem${enemies === 1 ? 'y' : 'ies'}` : '');
      const p = Game.player;
      $('playerHealth').firstChild.style.width = (p ? p.healthf * 100 : 0) + '%';
      if (core) {
        for (const it of ITEMS) {
          const n = core.items[it.id];
          let el = this.itemEls[it.name];
          if (!el && (n > 0 || it === Items.copper || it === Items.lead)) {
            el = document.createElement('div'); el.className = 'it'; el.title = titleCase(it.name);
            el.innerHTML = `<img src="${Assets.url(it.icon)}"><span></span>`;
            $('items').appendChild(el);
            this.itemEls[it.name] = el;
          }
          if (el) el.lastChild.textContent = n;
        }
      }
      const myUnits = Game.units.filter(u => u.team === 'sharded' && !u.isPlayer).length;
      const queue = p ? p.plans.length : 0;
      $('status').innerHTML = `Units: ${myUnits} &middot; <span style="color:#999">Shift / C to command</span>` +
        (queue ? `<br>Build queue: ${queue}` : '') + (!p ? '<br><span style="color:#e55454">Respawning...</span>' : '');
      this.refreshBlockButtons();
      // refresh costs (have/need colors) for whatever is shown: hovered button first, else the selection
      if (this.frame % 30 === 0 && (this.hoverBlock || Input.selected)) this.showBlockInfo(this.hoverBlock || Input.selected);
    }
    this.updateHover();
    this.updateHints();
    if (this.frame % 20 === 0 || this.minimapDirty) { this.drawMinimap(); this.minimapDirty = false; }
  },

  // contextual tips, each shown once per browser
  hintsSeen: null,
  updateHints() {
    if (Game.state !== 'playing' || this.frame % 60 !== 0) return;
    if (!this.hintsSeen) {
      try { this.hintsSeen = new Set(JSON.parse(localStorage.getItem('mindustry-lite-hints') || '[]')); } catch (e) { this.hintsSeen = new Set(); }
    }
    const core = Game.playerCore();
    if (!core) return;
    const has = cls => Game.byTeam.sharded.some(b => b.block.cls === cls);
    const hints = [
      ['mine', () => Time.time > 60, 'Click copper ore near your core to mine it by hand.'],
      ['drill', () => Time.time > 60 * 8 && !has('Drill'), 'Open the production tab and place Mechanical Drills on ore. Connect them to the core with conveyors.'],
      ['turret', () => has('Drill') && !has('ItemTurret') && Time.time > 60 * 20, 'Build Duo turrets (turret tab) near the core, and feed them copper with a conveyor.'],
      ['wave', () => Game.waveCountdown < 60 * 20 && Game.wave === 1, 'The first wave is coming from the red drop zone. Check the minimap (top right).'],
      ['coal', () => core.items[Items.coal.id] > 0 || has('GenericCrafter'), 'Graphite presses turn coal into graphite: better Duo ammo, and needed for Pneumatic Drills and Hail turrets.'],
      ['power', () => core.items[Items.graphite.id] > 20 && !has('ConsumeGenerator'), 'Combustion generators burn coal for power. Power nodes link them to silicon smelters, menders and lancers.'],
      ['units', () => has('UnitFactory'), 'Units hold position and shoot what comes in range. Hold Shift (or press C), drag to select them, right-click to move or attack.'],
    ];
    for (const [id, cond, text] of hints) {
      if (this.hintsSeen.has(id) || !cond()) continue;
      this.hintsSeen.add(id);
      try { localStorage.setItem('mindustry-lite-hints', JSON.stringify([...this.hintsSeen])); } catch (e) { /* ignore */ }
      this.toast(text, 7);
      Audio2.play('uiNotify', undefined, undefined, 0.4);
      break;
    }
  },

  updateHover() {
    const el = $('hover');
    if (Input.selected || Input.removeStart || Game.state !== 'playing') { el.classList.add('hidden'); return; }
    const [tx, ty] = Input.tile;
    let html = '';
    // unit under cursor
    let unit = null;
    for (const u of Game.units) if (Mathf.within(u.x, u.y, Input.wx, Input.wy, u.type.hitSize / 2 + 2)) { unit = u; break; }
    const b = World.buildAt(tx, ty);
    if (unit) {
      html = `<div class="name">${titleCase(unit.type.name)}${unit.isPlayer ? ' (you)' : ''}</div>` + this.bar(unit.healthf, Teams[unit.team].color) +
        `<div>${Math.ceil(unit.health)} / ${unit.maxHealth}${unit.shield > 0 ? ` &middot; shield ${Math.ceil(unit.shield)}` : ''}${unit.armor ? ` &middot; armor ${unit.armor}` : ''}</div>`;
      if (unit.isPlayer && unit.stack.amount) html += `<div>Carrying ${unit.stack.amount} ${unit.stack.item.name}</div>`;
    } else if (b) {
      const blk = b.current || b.block;
      html = `<div class="name">${titleCase(blk.name)}${b instanceof ConstructBuild ? (b.breaking ? ' (deconstructing)' : ' (building)') : ''}</div>` +
        this.bar(b.healthf, Teams[b.team].color) + `<div>${Math.ceil(b.health)} / ${b.maxHealth}</div>`;
      if (b instanceof ConstructBuild) html += `<div>Progress: ${Math.floor(b.progress * 100)}%</div>`;
      else {
        for (const line of b.info()) html += `<div>${line}</div>`;
        if (b.power && b.power.graph) {
          const g = b.power.graph;
          html += `<div style="color:#fbd367">Power: +${g.produced * 60 | 0}/s, -${g.needed * 60 | 0}/s${g.capacity ? `, stored ${g.stored | 0}/${g.capacity}` : ''}</div>`;
        }
        if (b.liquid && b.liquid.type && b.liquid.amount > 0.05) html += `<div style="color:${b.liquid.type.color.css}">${titleCase(b.liquid.type.name)}: ${b.liquid.amount.toFixed(1)} / ${b.block.liquidCapacity}</div>`;
        if (b.items && !(b instanceof Core) && !(b instanceof Conveyor) && b.total > 0) {
          html += '<div>' + ITEMS.filter(i => b.items[i.id] > 0).map(i => `${b.items[i.id]} ${i.name}`).join(', ') + '</div>';
        }
        if (b instanceof PowerNode || b instanceof ItemBridge || b instanceof MassDriver) html += `<div style="color:#999">Click to link</div>`;
        else if (b instanceof Sorter || b instanceof Unloader || b instanceof UnitFactory) html += `<div style="color:#999">Click to configure</div>`;
      }
    } else if (World.inside(tx, ty) && !World.wall[ty * World.w + tx]) {
      const it = World.drop(tx, ty);
      if (it) {
        html = `<div class="name">${titleCase(it.name)} ${World.oreItem(tx, ty) ? 'ore' : '(floor)'}</div>`;
        const p = Game.player;
        if (World.oreItem(tx, ty) && p) {
          if (it.hardness > p.type.mineTier) html += '<div style="color:#999">Too hard to mine by hand; use a drill</div>';
          else html += Input.canMine(p, tx, ty) ? '<div style="color:#999">Click to mine</div>' : '<div style="color:#999">Move closer to mine</div>';
        } else html += '<div style="color:#999">Drills can extract sand here</div>';
      }
    }
    if (!html) { el.classList.add('hidden'); return; }
    el.innerHTML = html;
    el.classList.remove('hidden');
    const x = Input.mx + 16, y = Input.my + 16;
    el.style.left = Math.min(x, window.innerWidth - el.offsetWidth - 6) + 'px';
    el.style.top = Math.min(y, window.innerHeight - el.offsetHeight - 6) + 'px';
  },

  bar(f, c) { return `<div class="bar"><div style="width:${Math.max(0, f * 100)}%;background:${lerpCol(Pal.health, c, f).css}"></div></div>`; },

  // ------------------------------------------------------------ minimap
  drawMinimap() {
    const cv = $('minimap');
    if (!World.minimapBase) return;
    if (cv.width !== World.w) { cv.width = World.w; cv.height = World.h; }
    const g = cv.getContext('2d');
    g.putImageData(World.minimapBase, 0, 0);
    const H = World.h;
    for (const b of Game.buildings) {
      const c = Teams[b.team].color;
      g.fillStyle = b instanceof ConstructBuild ? 'rgba(255,211,127,0.5)' : c.css;
      const s = (b.current || b.block).size;
      g.fillRect(b.minX, H - 1 - b.maxY, s, s);
    }
    for (const u of Game.units) {
      g.fillStyle = u.isPlayer ? '#fff' : Teams[u.team].color.css;
      g.fillRect(Math.round(u.x / TS) - 1, H - 1 - Math.round(u.y / TS) - 1, 2, 2);
    }
    g.fillStyle = Teams.crux.color.css;
    for (const sp of World.spawns) g.fillRect(sp.x - 2, H - 1 - sp.y - 2, 5, 5);
    const v = Render.view();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1;
    g.strokeRect(v.x1 / TS + 0.5, H - 1 - v.y2 / TS + 0.5, (v.x2 - v.x1) / TS, (v.y2 - v.y1) / TS);
  },

  minimapClick(e) {
    e.stopPropagation();
  },
};
