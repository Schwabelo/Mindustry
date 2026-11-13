// Hooks that need Game / Input / UI (loaded after them): core upgrades, player unit per core tier, linked storage.

// ---------------------------------------------------------------- core upgrades (CoreBlock: placed over a smaller core, instantly)
function coreUnder(block, x, y) {
  const s = block.size, o = block.sizeOffset;
  let core = null;
  for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
    const b = World.buildAt(x + o + dx, y + o + dy);
    if (b && b.block.cls === 'Core' && b.team === 'sharded') core = b;
  }
  return core;
}

const _validPlace = Game.validPlace;
Game.validPlace = function (block, x, y, rot, team = 'sharded') {
  if (!block.coreUpgrade) return _validPlace.call(this, block, x, y, rot, team);
  const core = coreUnder(block, x, y);
  if (!core || core.block.size >= block.size) return false;
  // the old core must lie fully inside the new footprint; everything else must be free
  const s = block.size, o = block.sizeOffset;
  if (core.minX < x + o || core.maxX > x + o + s - 1 || core.minY < y + o || core.maxY > y + o + s - 1) return false;
  for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
    const tx = x + o + dx, ty = y + o + dy;
    if (!World.inside(tx, ty) || World.isWall(tx, ty)) return false;
    const b = World.buildAt(tx, ty);
    if (b && b !== core) return false;
    if (FLOOR_DEFS[World.floor[ty * World.w + tx]].isDeep) return false;
  }
  return true;
};

Game.upgradeCore = function (block, x, y) {
  const old = coreUnder(block, x, y);
  if (!old) return false;
  if (!block.requirements.every(r => old.items[r.item.id] >= r.amount)) {
    UI.toast('Not enough resources for ' + titleCase(block.name), 2.5, true);
    return false;
  }
  const items = old.items.slice();
  for (const r of block.requirements) items[r.item.id] -= r.amount;
  const linked = old.proximity.filter(p => p.linkedCore === old);
  for (const p of linked) { p.linkedCore = null; p.items = new Int32Array(ITEMS.length); p.total = 0; }
  this.removeBuilding(old);
  old.dead = true;
  const core = createBuilding(block, 'sharded', x, y, 0);
  this.addBuilding(core);
  for (let i = 0; i < ITEMS.length; i++) core.items[i] = Math.min(items[i], core.storageCapacity());
  core.total = core.items.reduce((a, b) => a + b, 0);
  Fx.create('coreFlash', core.x, core.y, block.size);
  Fx.create('placeBlock', core.x, core.y, block.size);
  Audio2.play('coreLand', core.x, core.y, 1);
  Render.shake(3, 20);
  // switch the player to the new core unit
  const p = this.player;
  if (p && !p.dead && UNITS[block.unitType] && p.type.name !== block.unitType) {
    const nu = this.spawnUnit(UNITS[block.unitType], 'sharded', p.x, p.y, p.rotation);
    nu.controller = 'player'; nu.plans = p.plans;
    p.dead = true;
    this.player = nu;
  }
  UI.toast(`Core upgraded to ${titleCase(block.name)}`, 3);
  Pathfinder.dirty = true;
  return true;
};

const _addPlan = Input.addPlan;
Input.addPlan = function (pl) {
  if (pl.block.coreUpgrade && !Game.validPlace(pl.block, pl.x, pl.y, 0)) {
    UI.toast('Place it over your current core (it must be a bigger core)', 2.5, true);
    return;
  }
  _addPlan.call(this, pl);
};

// player unit type follows the core tier
const _spawnPlayer = Game.spawnPlayer;
Game.spawnPlayer = function (initial) {
  const core = this.playerCore();
  if (!core) return;
  const t = UNITS[core.block.unitType || 'alpha'] || UNITS.alpha;
  const u = this.spawnUnit(t, 'sharded', core.x, core.y, 90);
  u.controller = 'player';
  this.player = u;
  Fx.create('unitSpawn', core.x, core.y, 0, Pal.accent);
  Fx.create('coreFlash', core.x, core.y, core.block.size);
  if (!initial) Audio2.play('coreLand', core.x, core.y, 0.4);
};

// linked storage: removing items through a linked container takes them from the core
const _sbRemove = StorageBlock.prototype.removeItem;
StorageBlock.prototype.removeItem = function (item, n = 1) {
  if (this.linkedCore && !this.linkedCore.dead && !(this instanceof Core)) return this.linkedCore.removeItem(item, n);
  return _sbRemove.call(this, item, n);
};

// meltdown beams are drawn with the bullets
const _bDraw5 = Bullets.draw;
Bullets.draw = function () {
  _bDraw5.call(this);
  for (const b of Game.buildings) if (b instanceof LaserTurret && b.bulletLife > 0) b.drawLaser();
};

// mender-type blocks: the hover info shows the boost item
const _uiStats = UI.blockStats;
UI.blockStats = function (b) {
  const s = _uiStats.call(this, b);
  if (b.coreUpgrade) s.push(`Storage: ${b.itemCapacity} · Unit cap +${b.unitCapModifier} · Ship: ${b.unitType}`, 'Place it over your current core to upgrade instantly');
  if (b.phaseRadiusBoost || b.speedBoostPhase || b.boostItem === 'phase-fabric') s.push('Boost: phase fabric');
  if (b.chanceDeflect) s.push('Reflects bullets');
  if (b.lightningChance) s.push(`${Math.round(b.lightningChance * 100)}% chance to arc lightning when hit`);
  return s;
};
