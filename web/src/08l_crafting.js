// Crafting: multi-press, silicon crucible, melter, separator, disassembler, coal centrifuge; blast drill and water extractor.
// Stats from content/Blocks.java; Separator / SolidPump logic from world/blocks/production/*.java.

// ---------------------------------------------------------------- melter (scrap -> slag)
class Melter extends LiquidCrafter {
  draw() {
    const n = this.block.name;
    Draw.rect(n + '-bottom', this.x, this.y);
    drawLiquidFill(this, null, 2);
    Draw.rect(n, this.x, this.y);
  }
  info() { return [`${this.block.consumeItems.map(c => c.item.name).join(' + ')} → ${(this.block.outputLiquid.amount * 60).toFixed(0)} slag/s`, `Slag: ${Math.round(this.liquid.amount)}/${this.block.liquidCapacity}`]; }
}

// ---------------------------------------------------------------- separator / disassembler (slag -> random items)
class Separator extends Building {
  constructor(...a) { super(...a); this.progress = 0; this.totalProgress = 0; }
  acceptItem(source, item) { return (this.block.consumeItems || []).some(c => c.item === item) && this.items[item.id] < this.block.itemCapacity; }
  acceptLiquid(source, l) { return l === Liquids.slag && this.liquid.amount < this.block.liquidCapacity; }
  outputTotal() { let n = 0; for (const r of this.block.results) n += this.items[r.item.id]; return n; }
  canRun() {
    const b = this.block;
    return this.liquid.type === Liquids.slag && this.liquid.amount >= b.slagUse * Time.delta &&
      (b.consumeItems || []).every(c => this.has(c.item, c.amount)) && this.outputTotal() < b.itemCapacity;
  }
  shouldConsume() { return this.canRun(); }
  update() {
    const b = this.block;
    const eff = this.canRun() ? this.efficiency : 0;
    if (eff > 0) {
      this.removeLiquid(b.slagUse * Time.delta * eff);
      this.progress += Time.delta * eff / b.craftTime;
      this.warmup = Mathf.lerp(this.warmup, 1, Mathf.clamp(0.02 * Time.delta));
    } else this.warmup = Mathf.lerp(this.warmup, 0, Mathf.clamp(0.02 * Time.delta));
    this.totalProgress += this.warmup * Time.delta;
    if (this.progress >= 1) {
      this.progress %= 1;
      // weighted random result (Separator.updateTile)
      const sum = b.results.reduce((s, r) => s + r.amount, 0);
      let pick = Math.floor(Math.random() * sum), item = null;
      for (const r of b.results) { if (pick < r.amount) { item = r.item; break; } pick -= r.amount; }
      if (item && this.items[item.id] < b.itemCapacity) this.addItem(item);
      for (const c of b.consumeItems || []) this.removeItem(c.item, c.amount);
    }
    if (this.timer('dump', 5)) {
      for (const r of b.results) if (this.has(r.item)) { this.dump(r.item); break; }
    }
  }
  draw() {
    const n = this.block.name;
    Draw.rect(n + '-bottom', this.x, this.y);
    drawLiquidFill(this, null, 2);
    Draw.rect(n + '-spinner', this.x, this.y, undefined, undefined, this.totalProgress * 3);
    Draw.rect(n, this.x, this.y);
  }
  info() {
    const b = this.block, sum = b.results.reduce((s, r) => s + r.amount, 0);
    return [`${b.consumeItems && b.consumeItems.length ? b.consumeItems.map(c => c.item.name).join(' + ') + ' + ' : ''}slag → random: ` +
      b.results.map(r => `${r.item.name} ${Math.round(r.amount / sum * 100)}%`).join(', '), `${(60 / b.craftTime).toFixed(1)} items/s at full speed`,
      `Slag: ${Math.round(this.liquid.amount)}/${b.liquidCapacity}`];
  }
}

// ---------------------------------------------------------------- water extractor (SolidPump)
const WATER_ATTR = { char: -0.25, basalt: -0.25, hotrock: -0.5, magmarock: -0.75, mud: 1, grass: 0.1, salt: -0.3, snow: 0.2, ice: 0.4, 'ice-snow': 0.3 }; // Attribute.water
class SolidPump extends Building {
  constructor(...a) {
    super(...a);
    let valid = 0, attr = 0;
    const s = this.block.size;
    this.eachTile((x, y) => { const f = World.floorAt(x, y); if (!f.isLiquid) valid++; attr += WATER_ATTR[f.name] || 0; });
    this.fraction = Math.max(valid / (s * s) + attr / (s * s), 0);
    this.rot = 0;
  }
  acceptLiquid() { return false; }
  update() {
    const lq = this.liquid, b = this.block;
    if (lq.type !== Liquids.water) { lq.type = Liquids.water; lq.amount = 0; }
    const eff = this.efficiency * (lq.amount < b.liquidCapacity ? 1 : 0);
    if (eff > 0 && this.fraction > 0) lq.amount = Math.min(b.liquidCapacity, lq.amount + b.pumpAmount * this.fraction * eff * Time.delta);
    this.warmup = Mathf.lerp(this.warmup, eff > 0 && this.fraction > 0 ? 1 : 0, Mathf.clamp(0.02 * Time.delta));
    this.rot += this.warmup * Time.delta * 3;
    this.dumpLiquid(Liquids.water);
  }
  draw() {
    const n = this.block.name;
    Draw.rect(n, this.x, this.y);
    drawLiquidFill(this, n + '-liquid');
    Draw.rect(n + '-rotator', this.x, this.y, undefined, undefined, this.rot);
    Draw.rect(n + '-top', this.x, this.y);
  }
  info() { return [`Extracting ${(this.block.pumpAmount * this.fraction * this.efficiency * 60).toFixed(1)} water/s`].concat(this.efficiency <= 0 ? ['Needs power'] : []); }
}

// blast drill heat rim
const _drDraw = Drill.prototype.draw;
Drill.prototype.draw = function () {
  _drDraw.call(this);
  if (!this.block.drawRim || this.warmup <= 0.01) return;
  Draw.additive(true);
  Draw.setAlpha(Mathf.clamp(this.warmup * 0.6 + Mathf.absin(Time.time, 3, 0.25) * this.warmup));
  Draw.rect(Assets.tinted(this.block.name + '-rim', col('ff5512')), this.x, this.y);
  Draw.setAlpha(1);
  Draw.additive(false);
};

Object.assign(BuildClasses, { Melter, Separator, SolidPump });

// ---------------------------------------------------------------- blocks
defBlock('multi-press', 'GenericCrafter', {
  requirements: req('titanium', 100, 'silicon', 25, 'lead', 100, 'graphite', 50), outputItem: { item: Items.graphite, amount: 2 }, craftTime: 30,
  itemCapacity: 20, size: 3, hasItems: true, hasLiquids: true, hasPower: true, consumesPower: 1.8, consumeItems: [{ item: Items.coal, amount: 3 }],
  consumeLiquid: { liquid: 'water', amount: 0.1 }, liquidInputs: ['water'], liquidCapacity: 60, craftEffect: 'pulverizeMedium',
  category: 'crafting', flags: ['factory'],
});
defBlock('silicon-crucible', 'GenericCrafter', {
  requirements: req('titanium', 120, 'metaglass', 80, 'plastanium', 35, 'silicon', 60), outputItem: { item: Items.silicon, amount: 8 },
  craftTime: 90, size: 3, hasPower: true, hasItems: true, itemCapacity: 30, consumesPower: 4, fadeTop: true, craftEffect: 'smeltsmoke',
  consumeItems: [{ item: Items.coal, amount: 4 }, { item: Items.sand, amount: 6 }, { item: Items.pyratite, amount: 1 }],
  category: 'crafting', flags: ['factory'], iconLayers: ['silicon-crucible', 'silicon-crucible-top'],
});
defBlock('melter', 'Melter', {
  requirements: req('copper', 30, 'lead', 35, 'graphite', 45), health: 200, outputLiquid: { liquid: 'slag', amount: 12 / 60 }, craftTime: 10,
  hasLiquids: true, hasPower: true, hasItems: true, consumesPower: 1, consumeItems: [{ item: Items.scrap, amount: 1 }], liquidCapacity: 10,
  outputsLiquid: true, category: 'crafting', flags: ['factory'], iconLayers: ['melter-bottom', 'melter'],
});
defBlock('separator', 'Separator', {
  requirements: req('copper', 30, 'titanium', 25), results: [{ item: Items.copper, amount: 5 }, { item: Items.lead, amount: 3 },
    { item: Items.graphite, amount: 2 }, { item: Items.titanium, amount: 2 }], hasPower: true, craftTime: 35, size: 2, consumesPower: 1.1,
  slagUse: 4 / 60, hasLiquids: true, hasItems: true, liquidCapacity: 40, itemCapacity: 10, consumeItems: [], category: 'crafting', flags: ['factory'],
  iconLayers: ['separator-bottom', 'separator-spinner', 'separator'],
});
defBlock('disassembler', 'Separator', {
  requirements: req('plastanium', 40, 'titanium', 100, 'silicon', 150, 'thorium', 80), results: [{ item: Items.sand, amount: 2 },
    { item: Items.graphite, amount: 1 }, { item: Items.titanium, amount: 1 }, { item: Items.thorium, amount: 1 }], hasPower: true, craftTime: 15,
  size: 3, itemCapacity: 20, consumesPower: 4, consumeItems: [{ item: Items.scrap, amount: 1 }], slagUse: 0.12, hasLiquids: true, hasItems: true,
  liquidCapacity: 72, category: 'crafting', flags: ['factory'], iconLayers: ['disassembler-bottom', 'disassembler-spinner', 'disassembler'],
});
defBlock('coal-centrifuge', 'GenericCrafter', {
  requirements: req('titanium', 20, 'graphite', 40, 'lead', 30), outputItem: { item: Items.coal, amount: 1 }, craftTime: 30, size: 2,
  hasPower: true, hasItems: true, hasLiquids: true, consumesPower: 0.7, consumeItems: [], consumeLiquid: { liquid: 'oil', amount: 0.1 },
  liquidInputs: ['oil'], liquidCapacity: 60, craftEffect: 'smeltsmoke', category: 'crafting', flags: ['factory'],
});
defBlock('blast-drill', 'Drill', {
  requirements: req('copper', 65, 'silicon', 60, 'titanium', 50, 'thorium', 75), drillTime: 280, size: 4, drawRim: true, hasPower: true,
  tier: 5, itemCapacity: 20, liquidBoost: 1.8, warmupSpeed: 0.01, consumesPower: 3, liquidUse: 0.1, category: 'production', hasItems: true,
  iconLayers: ['blast-drill', 'blast-drill-rotator', 'blast-drill-top'],
});
defBlock('water-extractor', 'SolidPump', {
  requirements: req('metaglass', 30, 'graphite', 30, 'lead', 30, 'copper', 30), pumpAmount: 0.11, size: 2, liquidCapacity: 40, hasPower: true,
  consumesPower: 1.5, hasLiquids: true, outputsLiquid: true, category: 'production',
  iconLayers: ['water-extractor', 'water-extractor-rotator', 'water-extractor-top'],
});

// slag as ammo for wave and tsunami (Blocks.java)
BLOCKS.wave.liquidAmmo.slag = liquidBullet(Liquids.slag, { drag: 0.01, damage: 4, status: 'melting', statusDuration: 240 });
BLOCKS.tsunami.liquidAmmo.slag = tsunamiShot(Liquids.slag, { damage: 4.75, status: 'melting' });

// crafting + production menus in Mindustry's order
function sortCategory(cat, order) {
  const list = BLOCK_LIST.filter(b => b.category === cat);
  const firstIdx = BLOCK_LIST.findIndex(b => b.category === cat);
  const rest = BLOCK_LIST.filter(b => b.category !== cat);
  list.sort((a, c) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(c.name) + 1 || 99));
  BLOCK_LIST.length = 0;
  BLOCK_LIST.push(...rest.slice(0, firstIdx), ...list, ...rest.slice(firstIdx));
}
sortCategory('crafting', ['graphite-press', 'multi-press', 'silicon-smelter', 'silicon-crucible', 'kiln', 'plastanium-compressor', 'phase-weaver',
  'surge-smelter', 'cryofluid-mixer', 'pyratite-mixer', 'blast-mixer', 'melter', 'separator', 'disassembler', 'spore-press', 'pulverizer',
  'coal-centrifuge', 'incinerator']);
sortCategory('production', ['mechanical-drill', 'pneumatic-drill', 'laser-drill', 'blast-drill', 'water-extractor', 'cultivator', 'oil-extractor']);

Object.assign(DESCRIPTIONS, {
  'multi-press': 'Upgraded graphite press: 3 coal + water + power → 2 graphite, four times faster.',
  'silicon-crucible': 'Big silicon smelter: 4 coal + 6 sand + 1 pyratite → 8 silicon. Needs power.',
  'melter': 'Melts scrap into slag. Feed slag to a separator or disassembler.',
  'separator': 'Separates slag into copper, lead, graphite and titanium (random). Needs power.',
  'disassembler': 'Breaks scrap + slag down into sand, graphite, titanium and thorium (random). Needs power.',
  'coal-centrifuge': 'Turns oil into coal. Needs power.',
  'blast-drill': 'The biggest drill: 4x4, mines every ore, needs power. Water boosts it 1.8x.',
  'water-extractor': 'Pumps water from the ground anywhere. Needs power. Works worse on char and basalt.',
});
