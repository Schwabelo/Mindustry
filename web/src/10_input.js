// Desktop input (DesktopInput.java-like): WASD movement, mouse building/removal/mining/shooting, config modes.

const Input = {
  keys: new Set(),
  mx: 0, my: 0, wx: 0, wy: 0,
  left: false, right: false,
  selected: null, rotation: 0,
  dragStart: null,       // [tx, ty] while dragging a placement line
  removeStart: null,     // [tx, ty] while dragging a removal rect
  shooting: false,
  linkSource: null,      // power node / bridge in link mode
  ghosts: [],
  lastBridge: null,
  hoverBuild: null,

  reset() {
    this.selected = null; this.dragStart = null; this.removeStart = null; this.linkSource = null;
    this.ghosts = []; this.lastBridge = null; this.lastBridges = {}; this.shooting = false; this.left = this.right = false;
  },

  init() {
    const cv = Render.canvas;
    window.addEventListener('keydown', e => this.keyDown(e));
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.left = this.right = false; this.shooting = false; });
    cv.addEventListener('mousemove', e => { this.mx = e.clientX; this.my = e.clientY; });
    cv.addEventListener('mousedown', e => this.mouseDown(e));
    window.addEventListener('mouseup', e => this.mouseUp(e));
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const f = Math.pow(1.0015, -e.deltaY);
      Render.targetZoom = Mathf.clamp(Render.targetZoom * f, 1.2, 8);
    }, { passive: false });
  },

  get tile() { return [Math.round(this.wx / TS), Math.round(this.wy / TS)]; },

  // tile origin for placing a block of given size under the cursor (Mindustry offsets even sizes)
  placeTile(block, wx = this.wx, wy = this.wy) {
    const off = block ? block.offset : 0;
    return [Math.round((wx - off) / TS), Math.round((wy - off) / TS)];
  },

  keyDown(e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    this.keys.add(e.code);
    if (Game.state === 'title') return;
    switch (e.code) {
      case 'Escape':
        if (this.linkSource || this.selected || UI.configOpen) { this.linkSource = null; this.select(null); UI.closeConfig(); }
        else UI.togglePause();
        break;
      case 'Space':
        e.preventDefault();
        UI.togglePause();
        break;
      case 'KeyR':
        if (this.selected) {
          this.rotation = Mathf.mod(this.rotation + (e.shiftKey ? -1 : 1), 4);
          Audio2.play('rotate', undefined, undefined, 0.3);
        }
        break;
      case 'KeyQ': this.pick(); break;
      case 'KeyG':
        Game.command = Game.command === 'defend' ? 'attack' : 'defend';
        UI.toast(Game.command === 'attack' ? 'Units: ATTACK (marching to enemy spawn)' : 'Units: DEFEND (guarding the core)', 2.5);
        break;
      case 'KeyX':
        if (Game.player) { Game.player.plans = []; UI.toast('Build queue cleared', 1.5); }
        break;
      case 'KeyN':
        if (Game.state === 'playing') { Game.runWave(); }
        break;
      default:
        if (/^Digit[1-9]$/.test(e.code)) UI.selectIndex(parseInt(e.code.slice(5)) - 1);
    }
  },

  select(block) {
    this.selected = block;
    this.dragStart = null;
    UI.refreshBlockButtons();
    UI.showBlockInfo(block);
  },

  pick() {
    const [tx, ty] = this.tile;
    const b = World.buildAt(tx, ty);
    if (b && b.team === 'sharded' && b.block.buildable) {
      this.select(b.block);
      UI.selectCategory(b.block.category);
      if (b.block.rotate) this.rotation = b.rotation;
    } else if (b instanceof ConstructBuild && b.current.buildable) {
      this.select(b.current); UI.selectCategory(b.current.category);
    }
  },

  mouseDown(e) {
    if (Game.state !== 'playing') return;
    UI.closeConfig();
    this.updateWorldMouse();
    const [tx, ty] = this.tile;
    if (e.button === 1) { e.preventDefault(); this.pick(); return; }
    if (e.button === 2) {
      this.right = true;
      if (this.selected) { this.select(null); return; }
      if (this.linkSource) { this.linkSource = null; return; }
      this.removeStart = [tx, ty];
      return;
    }
    if (e.button !== 0) return;
    this.left = true;
    if (this.selected) {
      this.dragStart = this.placeTile(this.selected);
      return;
    }
    const b = World.buildAt(tx, ty);
    // link mode (power node / bridge)
    if (this.linkSource) {
      const src = this.linkSource;
      if (src.dead) { this.linkSource = null; }
      else if (b === src || !b) { this.linkSource = null; return; }
      else if (src instanceof PowerNode && b.power && b.team === 'sharded') {
        const r = Power.toggleLink(src, b);
        if (r) Audio2.play('click', undefined, undefined, 0.4);
        return;
      } else if (src instanceof ItemBridge && b instanceof ItemBridge) {
        if (src.linkValid(b) || src.link === b) { src.configure(b); Audio2.play('click', undefined, undefined, 0.4); }
        this.linkSource = null;
        return;
      } else this.linkSource = null;
    }
    if (b && b.team === 'sharded' && !(b instanceof ConstructBuild)) {
      if (b instanceof PowerNode || b instanceof ItemBridge) { this.linkSource = b; Audio2.play('click', undefined, undefined, 0.3); return; }
      if (b instanceof Sorter || b instanceof Unloader || b instanceof UnitFactory) { UI.openConfig(b); return; }
    }
    // mining
    const p = Game.player;
    if (p && !b && this.canMine(p, tx, ty)) {
      p.mineTile = [tx, ty];
      return;
    }
    if (p) p.mineTile = null;
    this.shooting = true;
  },

  mouseUp(e) {
    if (e.button === 0) {
      this.left = false;
      this.shooting = false;
      if (this.dragStart && this.selected && Game.state === 'playing') {
        for (const pl of this.linePlans()) this.addPlan(pl);
      }
      this.dragStart = null;
    }
    if (e.button === 2) {
      this.right = false;
      if (this.removeStart && Game.state === 'playing') this.removeArea(this.removeStart, this.tile);
      this.removeStart = null;
    }
  },

  canMine(u, tx, ty) {
    if (!World.inside(tx, ty) || World.wall[ty * World.w + tx]) return false;
    const it = World.oreItem(tx, ty);
    if (!it || it.hardness > u.type.mineTier) return false;
    return Math.hypot(tx * TS - u.x, ty * TS - u.y) <= MINE_RANGE;
  },

  // plans along a straight line from the drag start (Placement.normalizeLine)
  linePlans() {
    const b = this.selected;
    if (!b) return [];
    const [sx, sy] = this.dragStart || this.placeTile(b);
    const [ex, ey] = this.placeTile(b);
    const dx = ex - sx, dy = ey - sy;
    const out = [];
    let rot = this.rotation;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx !== 0 && b.rotate) rot = dx > 0 ? 0 : 2;
      const step = b.size * Math.sign(dx || 1);
      const n = Math.floor(Math.abs(dx) / b.size);
      for (let i = 0; i <= n; i++) out.push({ block: b, x: sx + step * i, y: sy, rotation: rot });
    } else {
      if (b.rotate) rot = dy > 0 ? 1 : 3;
      const step = b.size * Math.sign(dy);
      const n = Math.floor(Math.abs(dy) / b.size);
      for (let i = 0; i <= n; i++) out.push({ block: b, x: sx, y: sy + step * i, rotation: rot });
    }
    if (out.length > 1 && b.rotate) this.rotation = rot;
    return out;
  },

  addPlan(pl) {
    const p = Game.player;
    if (!p) return;
    // replace an existing plan on the same tile
    p.plans = p.plans.filter(o => !(o.x === pl.x && o.y === pl.y));
    if (!Game.validPlace(pl.block, pl.x, pl.y, pl.rotation)) {
      // allow instant rotation of an existing same block
      return;
    }
    pl.breaking = false;
    p.plans.push(pl);
  },

  removeArea(a, b) {
    const p = Game.player;
    if (!p) return;
    const x1 = Math.min(a[0], b[0]), x2 = Math.max(a[0], b[0]), y1 = Math.min(a[1], b[1]), y2 = Math.max(a[1], b[1]);
    // cancel queued placement plans in the area first
    const before = p.plans.length;
    p.plans = p.plans.filter(pl => pl.breaking || pl.x < x1 || pl.x > x2 || pl.y < y1 || pl.y > y2);
    if (p.plans.length !== before && x1 === x2 && y1 === y2) return;
    const seen = new Set();
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
      const bd = World.buildAt(x, y);
      if (!bd || seen.has(bd) || bd.team !== 'sharded') continue;
      seen.add(bd);
      const blk = bd.current || bd.block;
      if (blk.cls === 'Core') continue;
      if (p.plans.some(pl => pl.breaking && pl.x === bd.tx && pl.y === bd.ty)) continue;
      p.plans.push({ block: blk, x: bd.tx, y: bd.ty, rotation: bd.rotation, breaking: true });
    }
  },

  onBridgePlaced(b) {
    // auto-link from the previously placed bridge of the same kind (ItemBridge.lastBuild)
    this.lastBridges = this.lastBridges || {};
    const prev = this.lastBridges[b.block.name];
    if (prev && !prev.dead && prev !== b && !prev.link && prev.linkValid(b)) prev.configure(b);
    this.lastBridges[b.block.name] = b;
  },

  updateWorldMouse() {
    [this.wx, this.wy] = Render.screenToWorld(this.mx, this.my);
  },

  // ------------------------------------------------------------ per-tick player logic
  updatePlayer() {
    this.updateWorldMouse();
    const p = Game.player;
    // ghosts of destroyed blocks get re-queued after a short delay (rebuild)
    if (p && this.ghosts.length) {
      for (const g of this.ghosts) {
        if (Time.time - g.time > 120 && !g.queued) {
          g.queued = true;
          if (Game.validPlace(g.block, g.x, g.y, g.rotation)) p.plans.push({ block: g.block, x: g.x, y: g.y, rotation: g.rotation, breaking: false });
        }
      }
      this.ghosts = this.ghosts.filter(g => !g.queued);
    }
    if (!p) return;
    const t = p.type;
    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    const len = Math.hypot(mx, my);
    const speed = p.speed() * (this.keys.has('ShiftLeft') ? 0.5 : 1);
    if (len > 0) p.moveAt(mx / len * speed, my / len * speed);

    p.aimX = this.wx; p.aimY = this.wy;
    const shooting = this.shooting && !this.selected && Game.state === 'playing';
    for (const m of p.mounts) m.shoot = shooting;
    if (shooting) p.lookAt(this.wx, this.wy);
    else if (p.plans.length && this.activePlan) p.lookAt(this.activePlan.x * TS, this.activePlan.y * TS);
    else if (p.mineTile) p.lookAt(p.mineTile[0] * TS, p.mineTile[1] * TS);
    else if (len > 0) p.lookAngle(Angles.angle(0, 0, mx, my));

    this.updateMining(p);
    this.updateBuilding(p);
    this.updateTransfer(p);
  },

  updateMining(p) { p.updateMining(); },

  updateTransfer(p) {
    if (!p.stack.amount) return;
    const core = Game.playerCore();
    if (!core || Math.hypot(core.x - p.x, core.y - p.y) >= TRANSFER_RANGE) return;
    p.timerTransfer = (p.timerTransfer || 0) - Time.delta;
    if (p.timerTransfer > 0) return;
    p.timerTransfer = 4;
    core.handleItem(p, p.stack.item);
    Fx.create('itemTransfer', p.x, p.y, 0, null, { item: p.stack.item, tx: core.x, ty: core.y });
    if (--p.stack.amount <= 0) p.stack.item = null;
  },

  // BuilderComp.update
  updateBuilding(p) {
    this.activePlan = null;
    if (!p.plans.length) return;
    const core = Game.playerCore();
    // find first plan within range
    let idx = -1;
    for (let i = 0; i < p.plans.length; i++) {
      const pl = p.plans[i];
      const px = pl.x * TS + pl.block.offset, py = pl.y * TS + pl.block.offset;
      if (Math.hypot(px - p.x, py - p.y) <= BUILD_RANGE) { idx = i; break; }
    }
    if (idx < 0) return;
    const pl = p.plans[idx];
    this.activePlan = pl;
    const bs = 1 / Math.max(pl.block.buildTime, 0.0001) * p.type.buildSpeed * Time.delta;
    let ex = World.buildAt(pl.x, pl.y);

    if (pl.breaking) {
      if (!ex || ex.team !== 'sharded') { p.plans.splice(idx, 1); return; }
      if (!(ex instanceof ConstructBuild)) ex = Game.beginBreak(ex);
      ex.deconstruct(p, core, bs);
      if (ex.dead) p.plans.splice(idx, 1);
      return;
    }

    if (ex instanceof ConstructBuild && ex.current === pl.block && ex.tx === pl.x && ex.ty === pl.y) {
      // continue (also resumes a deconstruction in reverse)
    } else if (ex && ex.block === pl.block && ex.tx === pl.x && ex.ty === pl.y) {
      if (pl.block.rotate && ex.rotation !== pl.rotation) { ex.rotation = pl.rotation; Game.refreshAround(ex); Audio2.play('rotate', ex.x, ex.y, 0.3); }
      p.plans.splice(idx, 1);
      return;
    } else {
      if (!Game.validPlace(pl.block, pl.x, pl.y, pl.rotation)) { p.plans.splice(idx, 1); return; }
      if (!core || !pl.block.requirements.every(r => core.items[r.item.id] > 0)) {
        // not enough resources: move to back of the queue
        pl.stuck = (pl.stuck || 0) + Time.delta;
        if (pl.stuck > 30 && p.plans.length > 1) { p.plans.splice(idx, 1); p.plans.push(pl); pl.stuck = 0; }
        return;
      }
      const config = pl.block.cls === 'ItemBridge' ? null : pl.config;
      ex = Game.beginPlace(pl.block, pl.x, pl.y, pl.rotation, 'sharded', config);
    }
    const ok = ex.construct(p, core, bs);
    if (!ok) {
      pl.stuck = (pl.stuck || 0) + Time.delta;
      if (pl.stuck > 60 && p.plans.length > 1) { p.plans.splice(idx, 1); p.plans.push(pl); pl.stuck = 0; }
    }
    if (ex.dead) p.plans.splice(p.plans.indexOf(pl), 1);
  },

  // ------------------------------------------------------------ drawing (world overlays)
  drawWorld() {
    const p = Game.player;
    // build plans (ghosts)
    if (p) {
      for (const pl of p.plans) this.drawPlan(pl, pl === this.activePlan);
    }
    // build beam
    if (p && this.activePlan) {
      const pl = this.activePlan;
      const bx = pl.x * TS + pl.block.offset, by = pl.y * TS + pl.block.offset, hs = pl.block.size * TS / 2;
      const sx = p.x + Angles.trnsx(p.rotation, 4), sy = p.y + Angles.trnsy(p.rotation, 4);
      const corners = [[bx - hs, by - hs], [bx + hs, by - hs], [bx + hs, by + hs], [bx - hs, by + hs]];
      const c = pl.breaking ? Pal.remove : Pal.accent;
      Fill.set(rgba(c, 0.18 + Mathf.absin(Time.time, 3, 0.06)));
      // fan between the two silhouette corners
      let best = null, bestAng = -1;
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        const a = Angles.angleDist(Angles.angle(sx, sy, ...corners[i]), Angles.angle(sx, sy, ...corners[j]));
        if (a > bestAng) { bestAng = a; best = [corners[i], corners[j]]; }
      }
      Fill.tri(sx, sy, best[0][0], best[0][1], best[1][0], best[1][1]);
      Lines.set(rgba(c, 0.8), 0.7);
      Lines.line(sx, sy, best[0][0], best[0][1]); Lines.line(sx, sy, best[1][0], best[1][1]);
      Fill.set(c.css); Fill.square(sx, sy, 1.2, 45);
    }

    if (Game.state !== 'playing') return;
    const [tx, ty] = this.tile;
    // link mode visuals
    if (this.linkSource && !this.linkSource.dead) {
      const s = this.linkSource;
      if (s instanceof PowerNode) {
        Lines.set(rgba(Pal.powerLight, 0.7), 1);
        Lines.dashCircle(s.x, s.y, s.block.laserRange * TS, Time.time / 100);
        for (const o of Game.teamBuildings('sharded')) {
          if (o === s || !o.power || o.dead) continue;
          const linked = Power.linked(s, o);
          if (!linked && !Power.canLink(s, o)) continue;
          const hs = o.block.size * TS / 2 + 1;
          Lines.set(linked ? rgba(Pal.place, 0.9) : rgba(Pal.powerLight, 0.45), linked ? 1 : 0.6);
          Lines.square(o.x, o.y, hs);
        }
      } else if (s instanceof ItemBridge) {
        Lines.set(rgba(Pal.accent, 0.6), 1);
        for (let d = 0; d < 4; d++) {
          const [dx, dy] = Geometry.d4[d];
          Lines.line(s.x, s.y, s.x + dx * s.block.range * TS, s.y + dy * s.block.range * TS);
        }
      }
      Lines.set(Pal.accent.css, 1);
      Lines.square(s.x, s.y, s.block.size * TS / 2 + 1.5 + Mathf.absin(Time.time, 4, 1));
    }
    // removal rectangle
    if (this.removeStart) {
      const [ax, ay] = this.removeStart;
      const x1 = Math.min(ax, tx) * TS - 4, y1 = Math.min(ay, ty) * TS - 4;
      const x2 = Math.max(ax, tx) * TS + 4, y2 = Math.max(ay, ty) * TS + 4;
      Fill.set(rgba(Pal.remove, 0.15)); Fill.rect((x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1);
      Lines.set(Pal.remove.css, 1); Lines.rect(x1, y1, x2 - x1, y2 - y1);
      return;
    }
    // placement preview
    if (this.selected) {
      const plans = this.dragStart ? this.linePlans() : [{ block: this.selected, ...(([x, y]) => ({ x, y }))(this.placeTile(this.selected)), rotation: this.rotation }];
      for (const pl of plans) {
        const valid = Game.validPlace(pl.block, pl.x, pl.y, pl.rotation);
        this.drawPlan(pl, false, valid ? 'preview' : 'invalid');
      }
      const last = plans[plans.length - 1];
      const b = this.selected;
      const cx = last.x * TS + b.offset, cy = last.y * TS + b.offset;
      if (b.range && (b.cls === 'ItemTurret' || b.cls === 'PowerTurret' || b.cls === 'MendProjector')) {
        Lines.set(rgba(Pal.accent, 0.7), 1);
        Lines.dashCircle(cx, cy, b.range, Time.time / 80);
      }
      if (b.cls === 'PowerNode') {
        Lines.set(rgba(Pal.powerLight, 0.6), 1);
        Lines.dashCircle(cx, cy, b.laserRange * TS, Time.time / 100);
      }
      if (b.cls === 'Drill') {
        // show the ore it would mine
        const tmp = { eachTile: Drill.prototype.eachTile, tx: last.x, ty: last.y, block: b };
        const counts = new Map();
        tmp.eachTile.call(tmp, (x, y) => { const it = World.drop(x, y); if (it && it.hardness <= b.tier) counts.set(it, (counts.get(it) || 0) + 1); });
        let best = null, bc = 0;
        for (const [it, c] of counts) if (c > bc) { best = it; bc = c; }
        if (best) {
          const rate = 60 / (b.drillTime + 50 * best.hardness) * bc;
          UI.worldLabel(cx, cy + b.size * 4 + 5, `${rate.toFixed(2)}/s`, best);
        } else UI.worldLabel(cx, cy + b.size * 4 + 5, 'no ore', null);
      }
      return;
    }
    // hover highlight
    const hb = World.buildAt(tx, ty);
    if (hb && hb.team === 'sharded') {
      const s = (hb.current || hb.block).size;
      Lines.set(rgba(Pal.accent, 0.8), 0.8);
      Lines.square(hb.x, hb.y, s * TS / 2 + 0.5);
      hb.drawSelect();
    } else if (Game.player && this.canMine(Game.player, tx, ty) && !hb) {
      Lines.set(rgba(Pal.accent, 0.6 + Mathf.absin(Time.time, 5, 0.3)), 0.8);
      Lines.square(tx * TS, ty * TS, TS / 2 + 0.5);
    }
  },

  drawPlan(pl, active, mode) {
    const b = pl.block;
    const cx = pl.x * TS + b.offset, cy = pl.y * TS + b.offset;
    const hs = b.size * TS / 2;
    if (pl.breaking) {
      Fill.set(rgba(Pal.remove, 0.25 + (active ? Mathf.absin(Time.time, 4, 0.15) : 0)));
      Fill.square(cx, cy, hs);
      Lines.set(rgba(Pal.remove, 0.9), 0.8); Lines.square(cx, cy, hs);
      return;
    }
    const rot = b.rotate ? pl.rotation * 90 : 0;
    Draw.setAlpha(mode === 'invalid' ? 0.35 : 0.55);
    Draw.rect('icon:' + b.name, cx, cy, undefined, undefined, rot);
    Draw.setAlpha(1);
    const c = mode === 'invalid' ? Pal.remove : Pal.accent;
    Lines.set(rgba(c, mode ? 0.9 : 0.6), 0.6);
    Lines.square(cx, cy, hs);
    if (b.rotate) {
      Draw.setAlpha(0.8);
      Draw.rect(mode === 'invalid' ? Assets.tinted('place-arrow', Pal.remove) : 'place-arrow', cx + Angles.trnsx(rot, hs * 0.2), cy + Angles.trnsy(rot, hs * 0.2), undefined, undefined, rot - 90);
      Draw.setAlpha(1);
    }
  },
};
