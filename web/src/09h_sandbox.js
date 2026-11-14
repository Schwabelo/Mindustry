// Sandbox blocks (BuildVisibility.sandboxOnly: only buildable with infinite resources): item source / void, liquid source /
// void, power source / void. They cost nothing.

{
  const sb = { requirements: [], buildable: true, sandboxOnly: true, health: 40 };
  defBlock('item-source', 'ItemSource', Object.assign({}, sb, { category: 'distribution', hasItems: true, configurable: true, itemsPerSecond: 100 }));
  defBlock('item-void', 'ItemVoid', Object.assign({}, sb, { category: 'distribution', hasItems: true }));
  defBlock('liquid-source', 'LiquidSource', Object.assign({}, sb, { category: 'liquid', hasLiquids: true, liquidCapacity: 100, outputsLiquid: true, floating: true, configurable: true,
    iconLayers: ['source-bottom', 'liquid-source'] }));
  defBlock('liquid-void', 'LiquidVoid', Object.assign({}, sb, { category: 'liquid', hasLiquids: true, liquidCapacity: 10, floating: true }));
  defBlock('power-source', 'PowerSource', Object.assign({}, sb, { category: 'power', hasPower: true, outputsPower: true, powerProduction: 1000000 / 60,
    maxNodes: 100, laserRange: 6, configurable: true }));
  defBlock('power-void', 'PowerVoid', Object.assign({}, sb, { category: 'power', hasPower: true, consumesPower: 1e30 }));
  Object.assign(DESCRIPTIONS, {
    'item-source': 'Outputs the selected item endlessly (100/s). Sandbox only.',
    'item-void': 'Destroys every item put into it. Sandbox only.',
    'liquid-source': 'Outputs the selected liquid endlessly. Sandbox only.',
    'liquid-void': 'Destroys every liquid put into it. Sandbox only.',
    'power-source': 'Produces practically unlimited power and links to nodes like a power node. Sandbox only.',
    'power-void': 'Drains all power from its network. Sandbox only.',
  });
}

class ItemSource extends Building {
  constructor(...a) { super(...a); this.sortItem = null; this.counter = 0; }
  configure(item) { this.sortItem = item; }
  acceptItem() { return false; }
  update() {
    const it = this.sortItem;
    if (!it) return;
    this.counter += Time.delta;
    const limit = 60 / this.block.itemsPerSecond;
    while (this.counter >= limit) {
      this.items[it.id] = 1; this.total = 1;
      this.dump(it);
      this.items[it.id] = 0; this.total = 0;
      this.counter -= limit;
    }
  }
  draw() { Draw.rect(this.block.name, this.x, this.y); if (this.sortItem) Draw.rect(this.sortItem.icon, this.x, this.y, 4, 4); }
  info() { return [`Output: ${this.sortItem ? titleCase(this.sortItem.name) : 'none (click to pick)'}`]; }
  writeState() { return { si: this.sortItem ? this.sortItem.name : null }; }
  readState(s) { this.sortItem = s.si ? Items[s.si] : null; }
}
class ItemVoid extends Building {
  acceptItem() { return true; }
  handleItem() {}
}
class LiquidSource extends Building {
  constructor(...a) { super(...a); this.source = null; }
  configure(l) { this.source = l; }
  acceptLiquid() { return false; }
  update() {
    if (!this.source) { this.liquid.amount = 0; return; }
    this.liquid.type = this.source; this.liquid.amount = this.block.liquidCapacity;
    this.dumpLiquid(this.source);
  }
  draw() {
    Draw.rect('source-bottom', this.x, this.y);
    if (this.source) { Fill.set(this.source.color.css); Fill.square(this.x, this.y, 3); }
    Draw.rect(this.block.name, this.x, this.y);
  }
  info() { return [`Output: ${this.source ? titleCase(this.source.name) : 'none (click to pick)'}`]; }
  writeState() { return { ls: this.source ? this.source.name : null }; }
  readState(s) { this.source = s.ls ? Liquids[s.ls] : null; }
}
class LiquidVoid extends Building {
  acceptLiquid() { return true; }
  handleLiquid() {}
}
class PowerSource extends PowerNode {
  get powerOut() { return this.block.powerProduction; }
  info() { return ['+∞ power', ...super.info()]; }
}
class PowerVoid extends PowerBuilding {
  info() { return ['Drains its network']; }
}
Object.assign(BuildClasses, { ItemSource, ItemVoid, LiquidSource, LiquidVoid, PowerSource, PowerVoid });

// hidden unless infinite resources are on
{
  const _locked = Research.locked;
  Research.locked = function (c) {
    const b = typeof c === 'string' ? BLOCKS[c] : c;
    if (b && b.sandboxOnly && !Rules.cur.infiniteResources) return true;
    return _locked.call(this, c);
  };
}
