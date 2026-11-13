// Unit command mode (DesktopInput command mode + ai/types/CommandAI): hold Shift, drag to select units, right-click to
// move or attack, commands (move/repair/rebuild/assist/mine) and stances (stop, hold fire, pursue, patrol, ram, boost,
// hold position). Factories in command mode take a rally point for the units they make.

// ---------------------------------------------------------------- path fields to an arbitrary tile (ControlPathfinder)
const CommandPaths = {
  cache: new Map(), version: 0,
  passable(kind, i) {
    const fl = FLOOR_DEFS[World.floor[i]];
    if (World.wall[i]) return false;
    if (kind === 'naval') return fl.isLiquid && !(World.build[i] && World.build[i].block.solid && !World.build[i].open);
    if (kind === 'legs') return true;
    if (fl.isDeep) return false;
    const b = World.build[i];
    return !(b && b.block.solid && !b.open && !(b instanceof ConstructBuild && b.progress < 0.1));
  },
  field(kind, tx, ty) {
    const key = kind + ':' + tx + ',' + ty;
    let f = this.cache.get(key);
    if (f && f.version === this.version) return f;
    const W = World.w, H = World.h, N = W * H, dist = new Int32Array(N).fill(-1);
    const q = new Int32Array(N); let qh = 0, qt = 0;
    const start = ty * W + tx;
    if (!World.inside(tx, ty)) return null;
    dist[start] = 0; q[qt++] = start;
    while (qh < qt) {
      const i = q[qh++], x = i % W, y = (i / W) | 0, d = dist[i] + 1;
      if (x > 0 && dist[i - 1] < 0 && this.passable(kind, i - 1)) { dist[i - 1] = d; q[qt++] = i - 1; }
      if (x < W - 1 && dist[i + 1] < 0 && this.passable(kind, i + 1)) { dist[i + 1] = d; q[qt++] = i + 1; }
      if (y > 0 && dist[i - W] < 0 && this.passable(kind, i - W)) { dist[i - W] = d; q[qt++] = i - W; }
      if (y < H - 1 && dist[i + W] < 0 && this.passable(kind, i + W)) { dist[i + W] = d; q[qt++] = i + W; }
    }
    f = { dist, version: this.version };
    if (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, f);
    return f;
  },
  // next waypoint (world coords) for a unit heading to tile (tx, ty); null = go straight
  next(kind, u, tx, ty) {
    const f = this.field(kind, tx, ty);
    if (!f) return null;
    const W = World.w, cx = Math.round(u.x / TS), cy = Math.round(u.y / TS);
    if (!World.inside(cx, cy)) return null;
    const here = f.dist[cy * W + cx];
    if (here < 0) return null;
    let best = null, bd = here;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!World.inside(nx, ny)) continue;
      const d = f.dist[ny * W + nx];
      if (d < 0 || d >= bd) continue;
      if (dx && dy && (f.dist[cy * W + nx] < 0 || f.dist[ny * W + cx] < 0)) continue; // no corner cutting
      bd = d; best = [nx * TS, ny * TS];
    }
    return best;
  },
};
for (const fn of ['addBuilding', 'removeBuilding']) {
  const orig = Game[fn];
  Game[fn] = function (b) { CommandPaths.version++; return orig.call(this, b); };
}
const _cpToggle = Door.prototype.toggle;
Door.prototype.toggle = function () { _cpToggle.call(this); CommandPaths.version++; };
function pathKind(u) { return u.isFlying ? 'air' : u.type.naval ? 'naval' : u.type.legs ? 'legs' : 'ground'; }

// ---------------------------------------------------------------- commands + stances available per unit type (UnitType.init)
function unitCommands(t) {
  const c = ['move'];
  const heals = t.weapons.some(w => w.bullet && w.bullet.healPercent > 0) || (t.abilities || []).some(a => a.type === 'repairField' || a.type === 'repairBeam');
  if (t.flying || t.canBoost) {
    if (t.flying && heals) c.push('repair');
    if (t.buildSpeed > 0) c.push('rebuild', 'assist');
    if (t.mineTier > 0) c.push('mine');
  }
  return c;
}
function defaultCommand(t) { return t.name === 'mono' ? 'mine' : t.name === 'poly' ? 'rebuild' : t.name === 'mega' ? 'repair' : unitCommands(t)[0]; }
function unitStances(t) {
  const attack = t.weapons.some(w => w.bullet);
  const s = attack ? ['stop', 'holdfire', 'pursuetarget', 'patrol'] : ['stop', 'patrol'];
  if (attack && !t.flying) s.push('ram');
  if (attack && t.canBoost) s.push('boost');
  s.push('holdposition');
  return s;
}
const CMD_INFO = {
  move: ['command-rally', 'Move'], repair: ['mode-survival', 'Repair'], rebuild: ['hammer', 'Rebuild'], assist: ['players', 'Assist player'], mine: ['production', 'Mine'],
  stop: ['cancel', 'Cancel orders'], holdfire: ['none', 'Stance: hold fire'], pursuetarget: ['command-attack', 'Stance: pursue target'], patrol: ['refresh', 'Stance: patrol path'],
  ram: ['line', 'Stance: ram (straight line, no pathfinding)'], boost: ['elevation', 'Boost'], holdposition: ['effect', 'Stance: hold position'],
};

// ---------------------------------------------------------------- CommandAI
class CommandAI {
  constructor(u) {
    this.command = defaultCommand(u.type);
    this.stances = new Set();
    this.targetPos = null; this.attackTarget = null; this.queue = [];
    this.target = null; this.retarget = 0; this.sub = null; this.subKind = null; this.home = u.x !== undefined ? [u.x, u.y] : null;
  }
  setCommand(u, c) {
    this.command = c; this.sub = null;
    if (c !== 'move') { this.targetPos = null; this.attackTarget = null; this.queue = []; }
  }
  toggleStance(s) {
    if (s === 'stop') { this.targetPos = null; this.attackTarget = null; this.queue = []; return; }
    const exclusive = ['holdfire', 'pursuetarget'];
    if (this.stances.has(s)) { this.stances.delete(s); return; }
    if (exclusive.includes(s)) for (const e of exclusive) this.stances.delete(e);
    this.stances.add(s);
  }
  order(pos, target, queue) {
    if (this.command !== 'move') this.setCommand(null, 'move');
    if (queue && (this.targetPos || this.attackTarget)) { this.queue.push(target ? { target } : { pos }); return; }
    this.queue = []; this.attackTarget = target || null; this.targetPos = target ? null : pos;
  }
  subAI(u) {
    if (this.subKind !== this.command) {
      this.subKind = this.command;
      this.sub = this.command === 'repair' ? new RepairAI() : this.command === 'mine' ? new MinerAI() : new BuilderAI();
    }
    return this.sub;
  }
  update(u) {
    const t = u.type;
    if (this.command !== 'move') {
      // repair / rebuild / assist / mine reuse the existing AIs
      if (this.command === 'mine' && !(t.mineTier > 0)) this.command = 'move';
      else { this.subAI(u).update(u); return; }
    }
    if (t.canBoost) u.elevation = Mathf.approach(u.elevation, this.stances.has('boost') ? 1 : u.elevation, 0.08 * Time.delta);
    // targets in range
    this.retarget -= Time.delta;
    if (this.retarget <= 0) { this.retarget = 15; this.target = Targeting.closestTarget(u.team, u.x, u.y, u.range, t.targetAir, t.targetGround); }
    if (this.target && this.target.dead) this.target = null;
    if (this.attackTarget && (this.attackTarget.dead || (this.attackTarget.team === u.team))) this.attackTarget = null;
    if (!this.attackTarget && !this.targetPos && this.stances.has('pursuetarget') && this.target) this.attackTarget = this.target;
    if (t.autoDropBombs) return this.updateBomber(u);
    // move
    let goal = null, within = 0;
    if (this.attackTarget) { goal = [this.attackTarget.x, this.attackTarget.y]; within = u.range * 0.8; }
    else if (this.targetPos) { goal = this.targetPos; within = Math.max(2, u.hitSize / 2); }
    if (goal && !this.stances.has('holdposition')) {
      const d = Math.hypot(goal[0] - u.x, goal[1] - u.y);
      if (d <= within + 1) {
        u.moveAt(0, 0);
        if (!this.attackTarget) this.arrived();
      } else this.moveTowards(u, goal, within);
    } else u.moveAt(0, 0);
    // shoot
    const shootAt = this.stances.has('holdfire') ? null : (this.attackTarget && Math.hypot(this.attackTarget.x - u.x, this.attackTarget.y - u.y) <= u.range + 8 ? this.attackTarget : this.target);
    aimAndShoot(u, shootAt, !!shootAt);
    if (!shootAt && Math.hypot(u.vx, u.vy) > 0.05) u.lookAngle(Angles.angle(0, 0, u.vx, u.vy));
  }
  // bombers (horizon, quad) have to fly over their target and drop bombs on whatever enemy is under them
  updateBomber(u) {
    const t = u.type, hold = this.stances.has('holdposition'), at = this.attackTarget;
    if (at && !hold) {
      if (t.circleTarget) circleAttack(u, at, t.circleTargetRadius); else u.moveTo(at.x, at.y, 0);
    } else if (this.targetPos && !hold) {
      if (Math.hypot(this.targetPos[0] - u.x, this.targetPos[1] - u.y) <= 6) { u.moveAt(0, 0); this.arrived(); }
      else u.moveTo(this.targetPos[0], this.targetPos[1], 0);
    } else u.moveAt(0, 0);
    const below = World.buildWorld(u.x, u.y);
    const over = (below && below.team !== u.team && !below.dead) || (at && Math.hypot(at.x - u.x, at.y - u.y) < 12);
    const shoot = !this.stances.has('holdfire') && !!over;
    for (const m of u.mounts) { m.shoot = shoot; m.aimX = m.aimY = undefined; }
    u.aimX = u.x; u.aimY = u.y;
    if (Math.hypot(u.vx, u.vy) > 0.05) u.lookAngle(Angles.angle(0, 0, u.vx, u.vy));
  }
  arrived() {
    const cur = this.targetPos;
    if (this.stances.has('patrol') && cur) this.queue.push({ pos: cur });
    this.targetPos = null;
    const nx = this.queue.shift();
    if (nx) { if (nx.target && !nx.target.dead) this.attackTarget = nx.target; else if (nx.pos) this.targetPos = nx.pos; }
  }
  moveTowards(u, goal, within) {
    const kind = pathKind(u);
    if (kind === 'air' || this.stances.has('ram')) { u.moveTo(goal[0], goal[1], within); return; }
    const tx = Math.round(goal[0] / TS), ty = Math.round(goal[1] / TS);
    if (Math.hypot(goal[0] - u.x, goal[1] - u.y) < TS * 2.5) { u.moveTo(goal[0], goal[1], within); return; }
    const nxt = CommandPaths.next(kind, u, tx, ty);
    if (!nxt) { u.moveTo(goal[0], goal[1], within); return; }
    const dx = nxt[0] - u.x, dy = nxt[1] - u.y, d = Math.hypot(dx, dy) || 1;
    u.moveAt(dx / d * u.speed(), dy / d * u.speed());
  }
}
function commandAI(u) {
  if (!(u.controller instanceof CommandAI)) u.controller = new CommandAI(u);
  return u.controller;
}

// ---------------------------------------------------------------- selection + orders
const Command = {
  selected: [], factories: [], rect: null, toggled: false,
  active() { return Game.state === 'playing' && (Input.keys.has('ShiftLeft') || Input.keys.has('ShiftRight') || this.toggled); },
  commandable(u) { return u && !u.dead && u.team === 'sharded' && !u.isPlayer && u.type.name !== 'alpha' && u.type.name !== 'beta' && u.type.name !== 'gamma'; },
  unitAt(wx, wy) {
    let best = null, bd = Infinity;
    for (const u of Game.units) { if (u.dead) continue; const d = Math.hypot(u.x - wx, u.y - wy) - u.hitSize / 2; if (d < 4 && d < bd) { bd = d; best = u; } }
    return best;
  },
  select(list, add) {
    this.selected = add ? [...new Set([...this.selected, ...list])] : list;
    this.factories = [];
    UI.commandPanel && UI.commandPanel();
  },
  finishRect(x1, y1, x2, y2, add) {
    const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)], [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
    if (bx - ax < 3 && by - ay < 3) {
      // click: a unit, a factory, or nothing (clears)
      const u = this.unitAt(x1, y1);
      if (this.commandable(u)) { this.select([u], add); return; }
      const b = World.buildWorld(x1, y1);
      if (b && b.team === 'sharded' && (b instanceof UnitFactory || b instanceof Reconstructor)) { this.selected = []; this.factories = [b]; UI.commandPanel && UI.commandPanel(); return; }
      if (!add) this.select([]);
      return;
    }
    this.select(Game.units.filter(u => this.commandable(u) && u.x >= ax && u.x <= bx && u.y >= ay && u.y <= by), add);
  },
  issue(wx, wy, queue) {
    // factories: set where their units go
    if (this.factories.length) {
      for (const f of this.factories) f.rally = [wx, wy];
      Fx.create('commandMark', wx, wy, 0, Pal.accent);
      Audio2.play('click', undefined, undefined, 0.4);
      return;
    }
    this.selected = this.selected.filter(u => this.commandable(u));
    if (!this.selected.length) return;
    const hitU = this.unitAt(wx, wy);
    const b = World.buildWorld(wx, wy);
    const target = hitU && hitU.team !== 'sharded' ? hitU : b && b.team !== 'sharded' && !b.dead ? b : null;
    // formation: spread units in rings around the point (CommandAI.commandPosition / formation)
    const units = this.selected.slice().sort((a, c) => c.hitSize - a.hitSize);
    const space = Math.max(...units.map(u => u.hitSize)) * 1.1 + 2;
    let ring = 0, inRing = 0, cap = 1;
    for (const u of units) {
      const ai = commandAI(u);
      let pos = [wx, wy];
      if (!target && units.length > 1) {
        if (inRing >= cap) { ring++; inRing = 0; cap = Math.max(1, Math.floor(2 * Math.PI * ring)); }
        const a = inRing / cap * 360 + ring * 17;
        pos = [wx + Angles.trnsx(a, ring * space), wy + Angles.trnsy(a, ring * space)];
        inRing++;
      }
      ai.order(pos, target, queue);
    }
    Fx.create(target ? 'commandAttack' : 'commandMark', target ? target.x : wx, target ? target.y : wy, 0, target ? Pal.remove : Pal.accent);
    Audio2.play('click', undefined, undefined, 0.4);
  },
  setCommand(c) {
    for (const u of this.selected) {
      if (!unitCommands(u.type).includes(c)) continue;
      commandAI(u).setCommand(u, c);
    }
    UI.commandPanel && UI.commandPanel();
  },
  setStance(s) {
    const units = this.selected.filter(u => unitStances(u.type).includes(s) || s === 'stop');
    const turnOn = s === 'stop' || units.some(u => !(u.controller instanceof CommandAI) || !u.controller.stances.has(s));
    for (const u of units) {
      const ai = commandAI(u);
      if (s === 'stop') ai.toggleStance('stop');
      else if (ai.stances.has(s) !== turnOn) ai.toggleStance(s);
    }
    UI.commandPanel && UI.commandPanel();
  },
};

// units made by a factory with a rally point head there under command
const _cmdSpawn = Game.spawnUnit;
Game.spawnUnit = function (type, team, x, y, rot) {
  const u = _cmdSpawn.call(this, type, team, x, y, rot);
  if (team === 'sharded') {
    let src = null;
    for (const b of this.byTeam.sharded) if ((b instanceof UnitFactory || b instanceof Reconstructor) && b.rally && Math.hypot(b.x - x, b.y - y) < b.block.size * TS) { src = b; break; }
    if (src && !(type.name === 'mono')) commandAI(u).order(src.rally.slice(), null, false);
  }
  return u;
};

// ---------------------------------------------------------------- input hooks
const _cmdDown = Input.mouseDown.bind(Input);
Input.mouseDown = function (e) {
  if (!Command.active()) return _cmdDown(e);
  this.updateWorldMouse();
  if (e.button === 0) { Command.rect = [this.wx, this.wy, e.ctrlKey || e.metaKey]; return; }
  if (e.button === 2) { Command.issue(this.wx, this.wy, e.ctrlKey || e.metaKey); return; }
};
const _cmdUp = Input.mouseUp.bind(Input);
Input.mouseUp = function (e) {
  if (Command.rect && e.button === 0) {
    this.updateWorldMouse();
    const [x, y, add] = Command.rect; Command.rect = null;
    Command.finishRect(x, y, this.wx, this.wy, add);
    this.left = false; this.shooting = false;
    return;
  }
  return _cmdUp(e);
};
const _cmdKey = Input.keyDown.bind(Input);
Input.keyDown = function (e) {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.code === 'Escape' && (Command.selected.length || Command.factories.length)) { Command.select([]); return; }
  if (e.code === 'KeyC' && Game.state === 'playing') { Command.toggled = !Command.toggled; UI.toast(Command.toggled ? 'Command mode ON (C to turn off)' : 'Command mode off', 1.2); return; }
  return _cmdKey(e);
};
const _cmdDraw = Input.drawWorld.bind(Input);
Input.drawWorld = function () {
  _cmdDraw();
  Command.selected = Command.selected.filter(u => !u.dead);
  for (const u of Command.selected) {
    Lines.set(rgba(Pal.accent, 0.8), 1); Lines.circle(u.x, u.y, u.hitSize / 2 + 3);
    const ai = u.controller instanceof CommandAI ? u.controller : null;
    if (!ai) continue;
    let px = u.x, py = u.y;
    const pts = [];
    if (ai.attackTarget) pts.push([ai.attackTarget.x, ai.attackTarget.y, true]);
    else if (ai.targetPos) pts.push([ai.targetPos[0], ai.targetPos[1], false]);
    for (const q of ai.queue) pts.push(q.target ? [q.target.x, q.target.y, true] : [q.pos[0], q.pos[1], false]);
    for (const [x, y, atk] of pts) {
      Lines.set(rgba(atk ? Pal.remove : Pal.accent, 0.45), 0.8); Lines.line(px, py, x, y);
      Lines.set(rgba(atk ? Pal.remove : Pal.accent, 0.8), 1); Lines.square(x, y, 2.5, 45);
      px = x; py = y;
    }
  }
  for (const f of Command.factories) {
    Lines.set(rgba(Pal.accent, 0.9), 1); Lines.square(f.x, f.y, f.block.size * TS / 2 + 1.5);
    if (f.rally) { Lines.set(rgba(Pal.accent, 0.5), 0.8); Lines.line(f.x, f.y, f.rally[0], f.rally[1]); }
  }
  if (Command.rect) {
    const [x, y] = Command.rect;
    Draw.setAlpha(0.15); Fill.set(Pal.accent.css); Fill.rect((x + Input.wx) / 2, (y + Input.wy) / 2, Math.abs(Input.wx - x), Math.abs(Input.wy - y)); Draw.setAlpha(1);
    Lines.set(rgba(Pal.accent, 0.9), 1);
    Lines.line(x, y, Input.wx, y); Lines.line(Input.wx, y, Input.wx, Input.wy); Lines.line(Input.wx, Input.wy, x, Input.wy); Lines.line(x, Input.wy, x, y);
  }
  if (Command.active() && !Command.selected.length && !Command.factories.length && !Command.rect) {
    UI.worldLabel && UI.worldLabel(Input.wx, Input.wy + 10, 'Drag to select units');
  }
};
Object.assign(FX, {
  commandMark: { life: 30, draw(e) { Lines.set(rgba(e.color || Pal.accent, e.fout), 1.5); Lines.square(e.x, e.y, 2 + e.fin * 6, 45); } },
  commandAttack: { life: 30, draw(e) { Lines.set(rgba(e.color || Pal.remove, e.fout), 1.5); Lines.circle(e.x, e.y, 4 + e.fin * 8); } },
});

// Every player-team unit (except the player's own) runs CommandAI with its type's default command, like Mindustry:
// it holds position and fires at enemies in range until ordered elsewhere.
{
  const _mc = makeController;
  makeController = function (type, team) {
    if (team === 'sharded') return new CommandAI({ type });
    return _mc(type, team);
  };
}
