// Power: steam, differential and RTG generators, large solar panel, thorium reactor, impact reactor, surge tower, diode.
// Stats from content/Blocks.java; logic from world/blocks/power/*.java.

Items.thorium.radioactivity = 1;
Items['phase-fabric'].radioactivity = 0.6;

// ================================================================ fuel generators (ConsumeGenerator)
class FuelGenerator extends PowerBuilding {
  constructor(...a) { super(...a); this.generateTime = 0; this.duration = 1; this.productionEfficiency = 0; this.curEff = 0; this.totalTime = 0; }
  fuelEff(item) {
    const f = this.block.fuel;
    if (f === 'flammable') return item.flammability >= 0.2 ? item.flammability : 0;
    if (f === 'radioactive') return item.radioactivity || 0;
    return item.name === f ? 1 : 0;
  }
  acceptItem(source, item) { return this.fuelEff(item) > 0 && this.total < this.block.itemCapacity; }
  acceptLiquid(source, l) {
    const c = this.block.consumeLiquid;
    return !!c && l.name === c.liquid && (this.liquid.type === l || this.liquid.amount < 0.2) && this.liquid.amount < this.block.liquidCapacity;
  }
  liquidOk() {
    const c = this.block.consumeLiquid;
    return !c || (this.liquid.type && this.liquid.type.name === c.liquid && this.liquid.amount >= c.amount * Time.delta);
  }
  update() {
    const b = this.block;
    if (this.generateTime <= 0 && this.total > 0 && this.liquidOk()) {
      const it = ITEMS.find(i => this.items[i.id] > 0 && this.fuelEff(i) > 0);
      if (it) {
        this.removeItem(it); this.curEff = this.fuelEff(it); this.generateTime = 1;
        this.duration = b.itemDuration * ((b.durationMultipliers && b.durationMultipliers[it.name]) || 1);
        if (b.fuel === 'flammable') Fx.create('generatespark', this.x + Mathf.range(b.size * 3), this.y + Mathf.range(b.size * 3));
      }
    }
    if (this.generateTime > 0 && this.liquidOk()) {
      if (b.consumeLiquid) this.removeLiquid(b.consumeLiquid.amount * Time.delta);
      this.productionEfficiency = this.curEff;
      this.generateTime -= Time.delta / this.duration;
    } else this.productionEfficiency = 0;
    this.warmup = Mathf.approach(this.warmup, this.productionEfficiency > 0 ? 1 : 0, 0.05 * Time.delta);
    this.totalTime += this.warmup * Time.delta;
  }
  get powerOut() { return this.block.powerProduction * this.productionEfficiency; }
  writeState() { return this.generateTime > 0 ? { g: this.generateTime, d: this.duration, e: this.curEff } : null; }
  readState(s) { this.generateTime = s.g || 0; this.duration = s.d || 1; this.curEff = s.e || 0; }
  draw() {
    const b = this.block, n = b.name;
    Draw.rect(n, this.x, this.y);
    const lq = this.liquid;
    if (b.drawLiquid && lq && lq.type && lq.amount > 0.01) {
      Draw.setAlpha(Mathf.clamp(lq.amount / b.liquidCapacity));
      Draw.rect(Assets.tinted(n + '-liquid', lq.type.color), this.x, this.y);
      Draw.setAlpha(1);
    }
    if (b.turbines) {
      Draw.rect(n + '-turbine', this.x, this.y, undefined, undefined, this.totalTime * 2);
      Draw.rect(n + '-turbine', this.x, this.y, undefined, undefined, 45 - this.totalTime * 2);
      Draw.rect(n + '-cap', this.x, this.y);
    }
    if (b.warmupTop && this.warmup > 0.01) {
      Draw.setAlpha(this.warmup * (0.7 + Mathf.absin(Time.time, 8, 0.3)));
      Draw.rect(n + '-top', this.x, this.y);
      Draw.setAlpha(1);
    } else if (b.plainTop) Draw.rect(n + '-top', this.x, this.y);
  }
  info() {
    const b = this.block, lines = [`+${(this.powerOut * 60).toFixed(0)} power/s`];
    if (b.consumeLiquid && !this.liquidOk()) lines.push(`Needs ${b.consumeLiquid.liquid}`);
    if (this.total === 0 && this.generateTime <= 0) lines.push(b.fuel === 'flammable' ? 'Needs flammable items (coal, spore pods, pyratite...)' : b.fuel === 'radioactive' ? 'Needs thorium or phase fabric' : `Needs ${b.fuel}`);
    return lines;
  }
}

defBlock('steam-generator', 'FuelGenerator', {
  requirements: req('copper', 35, 'graphite', 25, 'lead', 40, 'silicon', 30), powerProduction: 5.5, itemDuration: 90, size: 2,
  fuel: 'flammable', durationMultipliers: { pyratite: 3 }, consumeLiquid: { liquid: 'water', amount: 0.1 }, hasLiquids: true,
  liquidInputs: ['water'], liquidCapacity: 10, hasItems: true, hasPower: true, outputsPower: true, category: 'power', flags: ['generator'],
  turbines: true, drawLiquid: true, iconLayers: ['steam-generator', 'steam-generator-turbine', 'steam-generator-cap'],
});
defBlock('differential-generator', 'FuelGenerator', {
  requirements: req('copper', 70, 'titanium', 50, 'lead', 100, 'silicon', 65, 'metaglass', 50), powerProduction: 18, itemDuration: 220, size: 3,
  fuel: 'pyratite', consumeLiquid: { liquid: 'cryofluid', amount: 0.1 }, hasLiquids: true, liquidInputs: ['cryofluid'], liquidCapacity: 10,
  hasItems: true, hasPower: true, outputsPower: true, category: 'power', flags: ['generator'], drawLiquid: true, plainTop: true,
  iconLayers: ['differential-generator', 'differential-generator-top'],
});
defBlock('rtg-generator', 'FuelGenerator', {
  requirements: req('lead', 100, 'silicon', 75, 'phase-fabric', 25, 'plastanium', 75, 'thorium', 50), size: 2, powerProduction: 4.5,
  itemDuration: 60 * 14, fuel: 'radioactive', durationMultipliers: { 'phase-fabric': 210 / 14 }, hasItems: true, hasPower: true,
  outputsPower: true, category: 'power', flags: ['generator'], warmupTop: true,
});
defBlock('solar-panel-large', 'SolarGenerator', {
  requirements: req('lead', 60, 'silicon', 70, 'phase-fabric', 15), size: 3, powerProduction: 1.6, category: 'power', hasPower: true,
  outputsPower: true, flags: ['generator'],
});

// ================================================================ thorium reactor (NuclearReactor)
class NuclearReactor extends PowerBuilding {
  constructor(...a) { super(...a); this.heat = 0; this.heatLast = 0; this.fuelTimer = 0; this.flash = 0; this.productionEfficiency = 0; }
  acceptItem(source, item) { return item === Items.thorium && this.items[item.id] < this.block.itemCapacity; }
  acceptLiquid(source, l) { return l === Liquids.cryofluid && this.liquid.amount < this.block.liquidCapacity; }
  update() {
    const b = this.block;
    const fuel = this.items[Items.thorium.id];
    const fullness = fuel / b.itemCapacity;
    this.productionEfficiency = fullness;
    if (fuel > 0) {
      this.heat += this.heatLast = fullness * b.heating * Math.min(Time.delta, 4);
      this.fuelTimer += Time.delta;
      if (this.fuelTimer >= b.itemDuration / (1 + (this.heat > this.heatLast ? this.heat * 10 : 0))) { this.fuelTimer = 0; this.removeItem(Items.thorium); }
    } else {
      this.productionEfficiency = 0;
      this.heat = Math.max(0, this.heat - Time.delta / (60 * 20));
    }
    if (this.heat > 0 && this.liquid.amount > 0) {
      const used = Math.min(this.liquid.amount, this.heat / b.coolantPower);
      this.heat -= used * b.coolantPower;
      this.removeLiquid(used);
    }
    if (this.heat > 0.3) {
      const smoke = 1 + (this.heat - 0.3) / 0.7;
      if (Math.random() < smoke / 20 * Time.delta) Fx.create('reactorSmoke', this.x + Mathf.range(b.size * TS / 2), this.y + Mathf.range(b.size * TS / 2));
    }
    this.heat = Mathf.clamp(this.heat);
    if (this.team === 'sharded' && this.heat > 0.5 && Time.time - (Game.lastReactorWarn || -9999) > 60 * 6) {
      Game.lastReactorWarn = Time.time;
      UI.toast('[!] Thorium reactor overheating, it needs cryofluid!', 3, true);
    }
    if (this.heat >= 0.999) Game.destroyBuilding(this);
  }
  get powerOut() { return this.block.powerProduction * this.productionEfficiency; }
  writeState() { return { heat: this.heat }; }
  readState(s) { this.heat = s.heat || 0; }
  shouldMeltdown() { return this.items[Items.thorium.id] >= 5 || this.heat >= 0.5; }
  draw() {
    const b = this.block, s = b.size * TS;
    Draw.rect(b.name, this.x, this.y);
    if (this.heat > 0.001) { Fill.set(`rgba(255,149,117,${(0.64 * this.heat).toFixed(3)})`); Fill.rect(this.x, this.y, s, s); }
    if (this.liquid.amount > 0.01) {
      Draw.setAlpha(Mathf.clamp(this.liquid.amount / b.liquidCapacity));
      Draw.rect(Assets.tinted(b.name + '-top', Liquids.cryofluid.color), this.x, this.y);
      Draw.setAlpha(1);
    }
    if (this.heat > 0.46) {
      this.flash += (1 + (this.heat - 0.46) / 0.54 * 5.4) * Time.frameDelta;
      const f = Mathf.absin(this.flash, 9, 1);
      Draw.setAlpha(0.3 * (1 - f)); Draw.rect(Assets.tinted(b.name + '-lights', col('ff0000')), this.x, this.y);
      Draw.setAlpha(0.3 * f); Draw.rect(Assets.tinted(b.name + '-lights', col('ffff00')), this.x, this.y);
      Draw.setAlpha(1);
    }
  }
  info() {
    return [`+${(this.powerOut * 60).toFixed(0)} power/s`, `Heat: ${Math.round(this.heat * 100)}%${this.heat > 0.5 ? ' DANGER' : ''}`,
      `Thorium: ${this.items[Items.thorium.id]}/${this.block.itemCapacity} · Cryofluid: ${Math.round(this.liquid.amount)}/${this.block.liquidCapacity}`];
  }
}
defBlock('thorium-reactor', 'NuclearReactor', {
  requirements: req('lead', 300, 'silicon', 200, 'graphite', 150, 'thorium', 150, 'metaglass', 50), size: 3, health: 1400,
  itemDuration: 360, powerProduction: 15, heating: 0.005, coolantPower: 0.125, itemCapacity: 30, liquidCapacity: 30,
  hasItems: true, hasLiquids: true, liquidInputs: ['cryofluid'], hasPower: true, outputsPower: true, category: 'power', flags: ['generator', 'reactor'],
  meltdownRadius: 19, meltdownDamage: 1250 * 4, meltdownFires: 11,
  iconLayers: ['thorium-reactor'],
});

// ================================================================ impact reactor
class ImpactReactor extends PowerBuilding {
  constructor(...a) { super(...a); this.warmup = 0; this.totalProgress = 0; this.useTimer = 0; }
  acceptItem(source, item) { return item === Items['blast-compound'] && this.items[item.id] < this.block.itemCapacity; }
  acceptLiquid(source, l) { return l === Liquids.cryofluid && this.liquid.amount < this.block.liquidCapacity; }
  hasInputs() { return this.has(Items['blast-compound']) && this.liquid.type === Liquids.cryofluid && this.liquid.amount >= this.block.cryoUse * Time.delta; }
  shouldConsume() { return this.hasInputs(); }
  update() {
    const b = this.block;
    if (this.hasInputs() && this.power.satisfaction >= 0.99) {
      this.warmup = Mathf.lerp(this.warmup, 1, Mathf.clamp(b.warmupSpeed * Time.delta));
      if (Math.abs(this.warmup - 1) < 0.001) this.warmup = 1;
      this.removeLiquid(b.cryoUse * Time.delta);
      this.useTimer += Time.delta;
      if (this.useTimer >= b.itemDuration) { this.useTimer = 0; this.removeItem(Items['blast-compound']); }
    } else this.warmup = Mathf.lerp(this.warmup, 0, Mathf.clamp(0.01 * Time.delta));
    this.totalProgress += this.warmup * Time.delta;
  }
  get powerOut() { return this.block.powerProduction * Math.pow(this.warmup, 5); }
  writeState() { return { w: this.warmup }; }
  readState(s) { this.warmup = s.w || 0; }
  shouldMeltdown() { return this.warmup >= 0.3; }
  draw() {
    const b = this.block, n = b.name;
    Draw.rect(n + '-bottom', this.x, this.y);
    if (this.warmup > 0.001) {
      Draw.additive(true);
      for (let i = 0; i < 4; i++) {
        const r = b.size * TS - 3 + Mathf.absin(Time.time, 2 + i, 5 - i * 0.5);
        const c = lerpCol(col('ffd06b'), col('ff361b'), i / 4);
        Draw.setAlpha(Mathf.clamp((0.3 + Mathf.absin(Time.time, 2 + i * 2, 0.3 + i * 0.05)) * this.warmup));
        Draw.rect(Assets.tinted(n + '-plasma-' + i, c), this.x, this.y, r, r, this.totalProgress * (12 + i * 6));
      }
      Draw.setAlpha(1);
      Draw.additive(false);
    }
    Draw.rect(n, this.x, this.y);
  }
  info() {
    const b = this.block;
    const lines = [`Output: ${(this.powerOut * 60).toFixed(0)}/s · Uses ${b.consumesPower * 60}/s`, `Warmup: ${Math.round(this.warmup * 100)}%`];
    if (!this.has(Items['blast-compound'])) lines.push('Needs blast compound');
    if (!(this.liquid.amount > 0)) lines.push('Needs cryofluid');
    if (this.hasInputs() && this.power.satisfaction < 0.99) lines.push(`Needs ${b.consumesPower * 60} power/s to start (use batteries)`);
    return lines;
  }
}
defBlock('impact-reactor', 'ImpactReactor', {
  requirements: req('lead', 500, 'silicon', 300, 'graphite', 400, 'thorium', 100, 'surge-alloy', 250, 'metaglass', 250), size: 4, health: 900,
  powerProduction: 130, itemDuration: 140, liquidCapacity: 80, consumesPower: 25, cryoUse: 0.25, warmupSpeed: 0.001, itemCapacity: 10,
  hasItems: true, hasLiquids: true, liquidInputs: ['cryofluid'], hasPower: true, outputsPower: true, category: 'power', flags: ['generator', 'reactor'],
  meltdownRadius: 12, meltdownDamage: 1900 * 4, meltdownFires: 8,
  iconLayers: ['impact-reactor-bottom', 'impact-reactor'],
});

// reactor meltdowns (PowerGenerator.onDestroyed): huge blast that hurts every team
const _pwExplosion = buildingExplosion;
buildingExplosion = function (b) {
  const blk = b.block;
  if (blk.meltdownRadius && b.shouldMeltdown && b.shouldMeltdown()) {
    const r = blk.meltdownRadius * TS;
    Damage.splash(null, b.x, b.y, r, blk.meltdownDamage, true, true, 1);
    for (let i = 0; i < blk.meltdownFires; i++) Fires.createWorld(b.x + Mathf.range(r * 0.7), b.y + Mathf.range(r * 0.7));
    Fx.create('reactorExplosion', b.x, b.y, 0, null, r);
    Decals.add('scorch', b.x, b.y, Math.random() * 360, 4, 1);
    Render.shake(6, 40);
    Audio2.play('explosion', b.x, b.y, 1);
    if (b.team === 'sharded') UI.toast(`${titleCase(blk.name)} melted down!`, 4, true);
    return;
  }
  _pwExplosion(b);
};

// ================================================================ surge tower, diode
defBlock('surge-tower', 'PowerNode', {
  requirements: req('titanium', 7, 'lead', 10, 'silicon', 15, 'surge-alloy', 15), size: 2, maxNodes: 2, laserRange: 40, category: 'power',
  hasPower: true, configurable: true, solid: true,
});
// PowerDiode: moves stored battery power from the graph behind it to the graph in front when the back is fuller
class Diode extends Building {
  update() {
    const back = this.nearby(this.rotation + 2), front = this.nearby(this.rotation);
    if (!back || !front || !back.power || !front.power || back.team !== this.team || front.team !== this.team) return;
    const bg = back.power.graph, fg = front.power.graph;
    if (!bg || !fg || bg === fg || bg.capacity <= 0 || fg.capacity <= 0) return;
    const bf = bg.stored / bg.capacity, ff = fg.stored / fg.capacity;
    if (bf <= ff) return;
    let amount = bg.stored * (bf - ff) / 2;
    amount = Mathf.clamp(amount, 0, fg.capacity * (1 - ff));
    if (amount <= 0) return;
    for (const bt of bg.batteries) bt.power.stored -= amount * (bt.power.stored / bg.stored);
    const free = fg.capacity - fg.stored;
    for (const bt of fg.batteries) bt.power.stored += amount * ((bt.block.capacity - bt.power.stored) / free);
    bg.stored -= amount; fg.stored += amount;
  }
  draw() {
    Draw.rect('diode', this.x, this.y);
    Draw.rect('diode-arrow', this.x, this.y, undefined, undefined, this.rotation * 90);
  }
  info() {
    const back = this.nearby(this.rotation + 2), front = this.nearby(this.rotation);
    const pct = b => b && b.power && b.power.graph && b.power.graph.capacity > 0 ? Math.round(b.power.graph.stored / b.power.graph.capacity * 100) + '%' : 'no batteries';
    return [`Behind: ${pct(back)} → Front: ${pct(front)}`, 'Moves battery charge forward only'];
  }
}
defBlock('diode', 'Diode', {
  requirements: req('silicon', 10, 'plastanium', 5, 'metaglass', 10), rotate: true, category: 'power', solid: true,
  iconLayers: ['diode', 'diode-arrow'],
});

Object.assign(BuildClasses, { FuelGenerator, NuclearReactor, ImpactReactor, Diode });

// power menu in Mindustry's order
{
  const order = ['combustion-generator', 'steam-generator', 'differential-generator', 'rtg-generator', 'solar-panel', 'solar-panel-large',
    'thorium-reactor', 'impact-reactor', 'power-node', 'power-node-large', 'surge-tower', 'diode', 'battery', 'battery-large'];
  const power = BLOCK_LIST.filter(b => b.category === 'power');
  const rest = BLOCK_LIST.filter(b => b.category !== 'power');
  const sorted = power.slice().sort((a, c) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(c.name) + 1 || 99));
  const firstIdx = BLOCK_LIST.findIndex(b => b.category === 'power');
  BLOCK_LIST.length = 0;
  BLOCK_LIST.push(...rest.slice(0, firstIdx), ...sorted, ...rest.slice(firstIdx));
}

Object.assign(FX, {
  reactorSmoke: { life: 70, draw(e) {
    Fill.set(rgba(col('808080'), e.fout * 0.7));
    randLen(e, 4, e.fin * 12, (x, y) => Fill.circle(e.x + x, e.y + y + e.fin * 6, 1 + e.fin * 3));
  } },
  reactorExplosion: { life: 60, draw(e) {
    const r = e.data || 150;
    if (e.fin < 0.15) { Fill.set(rgba(col('ffd06b'), 1 - e.fin / 0.15)); Fill.circle(e.x, e.y, r * e.fin / 0.15); }
    Lines.set(rgba(col('ff795e'), e.fout), 6 * e.fout); Lines.circle(e.x, e.y, r * (0.4 + e.fin * 0.6));
    Fill.set(rgba(col('ff9c5a'), e.fout)); randLen(e, 30, r * e.fin, (x, y) => Fill.circle(e.x + x, e.y + y, 2 + e.fout * 7));
    Fill.set(rgba(col('6e7080'), e.fout * 0.8)); randLen(e, 20, r * 0.6 * e.fin, (x, y) => Fill.circle(e.x + x, e.y + y, 3 + e.fin * 9), 0, 360);
  } },
});

Object.assign(DESCRIPTIONS, {
  'steam-generator': 'Burns flammable items and uses water to make more power than a combustion generator. Pyratite lasts 3x longer.',
  'differential-generator': 'Generates large amounts of power from pyratite and cryofluid.',
  'rtg-generator': 'Slowly decays thorium or phase fabric into power. No cooling needed, never explodes.',
  'solar-panel-large': 'A much bigger solar panel. Needs phase fabric to build.',
  'thorium-reactor': 'Huge power from thorium, more the fuller it is. Heats up and MUST be cooled with cryofluid, or it melts down and destroys everything nearby.',
  'impact-reactor': 'Endgame generator: blast compound + cryofluid, needs 1500 power/s to start and makes 7800/s once fully warmed up (takes about 2 minutes). Explodes if destroyed while running.',
  'surge-tower': 'Long-range power node with two links.',
  'diode': 'Moves stored battery power one way: from the batteries behind it to the batteries in front, when the back is fuller.',
});
