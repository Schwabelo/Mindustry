// Content fixes that apply across many blocks (checked against core/src/mindustry/**):
// - Wall (and Door): buildCostMultiplier = 6 unless the block sets its own
// - Block.canOverdrive = false: cores, batteries, power nodes, conduits, liquid routers/tanks/bridges, logic memory/displays,
//   overflow gates, walls, landing pads
// (material-scaled default health lives in defBlock, 03_content.js)

for (const b of Object.values(BLOCKS)) {
  if ((b.cls === 'Wall' || b.cls === 'Door') && b.buildCostMultiplier === 1) { b.buildCostMultiplier = 6; b.buildTime *= 6; }
}

function canOverdrive(b) {
  return !(b instanceof Core || b instanceof Battery || b instanceof PowerNode || b instanceof Conduit || b instanceof LiquidRouter
    || b instanceof LiquidBridge || b instanceof MemoryBlock || b instanceof LogicDisplay || b instanceof OverflowGate || b instanceof Wall
    || (typeof LandingPad !== 'undefined' && b instanceof LandingPad));
}

// Turret aiming values from Blocks.java (unset ones use the Turret defaults: rotateSpeed 5, shootCone 8, shootY = size * 4)
Object.assign(BLOCKS.wave, { rotateSpeed: 5 });
Object.assign(BLOCKS.tsunami, { rotateSpeed: 5 });
Object.assign(BLOCKS.scorch, { rotateSpeed: 5 });
Object.assign(BLOCKS.fuse, { rotateSpeed: 5 });
Object.assign(BLOCKS.ripple, { rotateSpeed: 5, shootCone: 8, scaleLifetimeOffset: 0.1 });
Object.assign(BLOCKS.lancer, { shootCone: 8 });
Object.assign(BLOCKS.spectre, { shootY: 16 });

// ItemTurret / PowerTurret.limitRange(margin): ammo lifetime = (range + rangeChange + margin + extraRangeMargin + 10) / speed
for (const [name, margin] of [['duo', 5], ['scatter', 2], ['hail', 0], ['swarmer', 5], ['salvo', 9], ['cyclone', 9], ['spectre', 9]]) {
  const t = BLOCKS[name];
  for (const bt of Object.values(t.ammo || {})) bt.lifetime = (t.range + (bt.rangeChange || 0) + margin + (bt.extraRangeMargin || 0) + 10) / bt.speed;
}

// StatusComp.apply with StatusEffects.java transitions:
// - an effect already present just takes the longer duration
// - opposites (burning <-> wet/freezing, melting <-> wet/freezing): the existing one loses half the new duration; if it runs
//   out, the new effect replaces it with its full duration
// - affinities: tarred + burning/melting -> burning/melting for the summed time; burning/melting + tarred -> 8 armor-piercing
//   damage, capped at 300/200 ticks; wet + shocked -> 14 damage; freezing + blasted -> 18 armor-piercing damage
// - shocked and blasted are reactive: they never stay on a unit, they only trigger reactions
STATUS.shocked = { speedMultiplier: 1, healthMultiplier: 1, color: Pal.lancerLaser, reactive: true, noFx: true };
STATUS.blasted.reactive = true;
const STATUS_OPPOSITES = { burning: ['wet', 'freezing'], melting: ['wet', 'freezing'], wet: ['burning', 'melting'], freezing: ['burning', 'melting'] };
Unit.prototype.statusTime = function (n) { return n === 'burning' ? this.burnTime : ((this.statuses && this.statuses[n]) || 0); };
Unit.prototype.setStatusTime = function (n, t) {
  if (n === 'burning') { this.burnTime = Math.max(0, t); return; }
  if (t > 0) this.statuses[n] = t; else delete this.statuses[n];
};
Unit.prototype.applyStatus = function (name, duration) {
  if (!this.statuses) this.statuses = {};
  if (name === 'burning' && this.type.immuneBurning) return;
  if (this.statusTime(name) > 0) { this.setStatusTime(name, Math.max(this.statusTime(name), duration)); return; }
  const present = Object.keys(this.statuses).concat(this.burnTime > 0 ? ['burning'] : []);
  for (const ex of present) {
    const t = this.statusTime(ex);
    if (t <= 0) continue;
    if ((STATUS_OPPOSITES[ex] || []).includes(name)) {
      const left = t - duration * 0.5;
      if (left <= 0) { this.setStatusTime(ex, 0); this.setStatusTime(name, duration); } else this.setStatusTime(ex, left);
      return;
    }
    if (ex === 'tarred' && (name === 'burning' || name === 'melting')) { this.setStatusTime('tarred', 0); this.setStatusTime(name, t + duration); return; }
    if ((ex === 'burning' || ex === 'melting') && name === 'tarred') {
      this.damage(8, true);
      this.setStatusTime(ex, Math.min(duration + t, ex === 'burning' ? 300 : 200));
      return;
    }
    if (ex === 'wet' && name === 'shocked') { this.damage(14); return; }
    if (ex === 'freezing' && name === 'blasted') { this.damage(18, true); return; }
  }
  if (STATUS[name] && STATUS[name].reactive) return;
  this.setStatusTime(name, duration);
};

if (BLOCKS.cyclone.ammo['blast-compound']) BLOCKS.cyclone.ammo['blast-compound'].explodeRange = 30; // FlakBulletType default
