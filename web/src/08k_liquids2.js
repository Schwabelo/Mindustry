// Rotary + impulse pumps, pulse + plated conduits, liquid container, phase conduit. Stats from content/Blocks.java.

// ArmoredConduit: only accepts liquid from other conduits or from directly behind, and caps its end instead of leaking
const _cdAccept = Conduit.prototype.acceptLiquid;
Conduit.prototype.acceptLiquid = function (source, l) {
  if (!_cdAccept.call(this, source, l)) return false;
  if (!this.block.armored) return true;
  return source instanceof Conduit || source.relativeTo(this) === this.rotation;
};
const _cdDraw = Conduit.prototype.draw;
Conduit.prototype.draw = function () {
  _cdDraw.call(this);
  if (!this.block.armored) return;
  const f = this.front();
  if (!f || !f.liquid || f.team !== this.team) Draw.rect(this.block.name + '-cap', this.x, this.y, undefined, undefined, this.rotation * 90);
};

// powered liquid bridge (phase conduit): only moves liquid while powered
const _lbUpdate = LiquidBridge.prototype.update;
LiquidBridge.prototype.update = function () {
  if (this.block.consumesPower && this.efficiency <= 0 && this.linkValid(this.link)) return;
  _lbUpdate.call(this);
};

defBlock('rotary-pump', 'Pump', {
  requirements: req('copper', 70, 'metaglass', 50, 'silicon', 20, 'titanium', 35), pumpAmount: 0.2, consumesPower: 0.3, hasPower: true,
  liquidCapacity: 80, size: 2, category: 'liquid', hasLiquids: true, outputsLiquid: true, floating: true, solid: true,
});
defBlock('impulse-pump', 'Pump', {
  requirements: req('copper', 80, 'metaglass', 90, 'silicon', 30, 'titanium', 40, 'thorium', 35), pumpAmount: 0.22, consumesPower: 1.3,
  hasPower: true, liquidCapacity: 200, size: 3, category: 'liquid', hasLiquids: true, outputsLiquid: true, floating: true, solid: true,
});
defBlock('pulse-conduit', 'Conduit', {
  requirements: req('titanium', 2, 'metaglass', 1), liquidCapacity: 40, liquidPressure: 1.025, health: 90, category: 'liquid',
  hasLiquids: true, rotate: true, solid: false, group: 'liquid', underBullets: true, iconLayers: ['conduit-bottom', 'pulse-conduit-top-0'],
});
defBlock('plated-conduit', 'Conduit', {
  requirements: req('thorium', 2, 'metaglass', 1, 'plastanium', 1), liquidCapacity: 50, liquidPressure: 1.025, health: 220, armored: true,
  category: 'liquid', hasLiquids: true, rotate: true, solid: false, group: 'liquid', underBullets: true,
  iconLayers: ['conduit-bottom', 'plated-conduit-top-0'],
});
defBlock('liquid-container', 'LiquidRouter', {
  requirements: req('titanium', 10, 'metaglass', 15), liquidCapacity: 700, size: 2, solid: true, category: 'liquid', hasLiquids: true,
  outputsLiquid: true, iconLayers: ['liquid-container-bottom', 'liquid-container'],
});
defBlock('phase-conduit', 'LiquidBridge', {
  requirements: req('phase-fabric', 5, 'silicon', 7, 'metaglass', 20, 'titanium', 10), range: 12, liquidCapacity: 100, hasPower: true,
  consumesPower: 0.3, category: 'liquid', hasLiquids: true, outputsLiquid: true, floating: true, configurable: true, underBullets: true, hasItems: false,
});

// liquid menu in Mindustry's order
{
  const order = ['mechanical-pump', 'rotary-pump', 'impulse-pump', 'conduit', 'pulse-conduit', 'plated-conduit', 'liquid-router',
    'liquid-container', 'liquid-tank', 'liquid-junction', 'bridge-conduit', 'phase-conduit'];
  const cat = BLOCK_LIST.filter(b => b.category === 'liquid');
  const firstIdx = BLOCK_LIST.findIndex(b => b.category === 'liquid');
  const rest = BLOCK_LIST.filter(b => b.category !== 'liquid');
  cat.sort((a, c) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(c.name) + 1 || 99));
  BLOCK_LIST.length = 0;
  BLOCK_LIST.push(...rest.slice(0, firstIdx), ...cat, ...rest.slice(firstIdx));
}

Object.assign(DESCRIPTIONS, {
  'rotary-pump': 'Powered 2x2 pump: 12 liquid/s per liquid tile under it (up to 48/s). Needs power.',
  'impulse-pump': 'Powered 3x3 pump: 13.2 liquid/s per liquid tile under it (up to 119/s). Needs power.',
  'pulse-conduit': 'Faster conduit with double the capacity of a normal conduit.',
  'plated-conduit': 'Tough conduit that only takes liquid from other conduits or from directly behind, so it never pulls from blocks at its sides.',
  'liquid-container': 'Mid-size 2x2 liquid storage (700). Outputs to all sides like a liquid router.',
  'phase-conduit': 'Powered liquid bridge with 12-tile range. Click it, then click another phase conduit in a straight line.',
});
