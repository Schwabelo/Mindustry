// Advanced launch pad (LaunchPad.java) and landing pad (LandingPad.java). Pods launched to the sector's destination count as
// that sector's exports (SectorInfo.export, items/second averaged over a minute); landing pads in the destination receive
// 100-item pods at the summed export rate of every sector sending there (09e_sectors.js / 13c_sector_store.js).
// Outside the campaign (free play) or for other teams a landing pad is "fake": it just lands pods whenever it has water.

defBlock('advanced-launch-pad', 'LaunchPad', {
  requirements: req('copper', 350, 'silicon', 250, 'lead', 300, 'titanium', 200), size: 4, itemCapacity: 100, hasItems: true,
  launchTime: 60 * 30, hasPower: true, consumesPower: 8, hasLiquids: true, liquidCapacity: 40, liquidInputs: ['oil'],
  consumeLiquid: { liquid: 'oil', amount: 9 / 60 }, category: 'effect', configurable: true, flags: ['launchPad'],
});
defBlock('landing-pad', 'LandingPad', {
  requirements: req('copper', 200, 'graphite', 100, 'titanium', 100), size: 4, itemCapacity: 100, hasItems: true,
  hasLiquids: true, liquidCapacity: 3000, liquidInputs: ['water'], consumeLiquidAmount: 1500, arrivalDuration: 150, cooldownTime: 150,
  category: 'effect', configurable: true,
});
Object.assign(DESCRIPTIONS, {
  'advanced-launch-pad': 'Launches 100-item pods to the sector set as this sector\'s destination. Needs power and oil. Only one item type per pod. Click it to pick the destination.',
  'landing-pad': 'Receives pods of the selected item from sectors that send their exports here. Each landing uses 1500 water. In free play it lands pods endlessly.',
});

const PAD_LIGHT = col('eab678'), PAD_DARK = col('6e7080'), PAD_SHADOW = col('000000');
const pow5Out = x => 1 - Math.pow(1 - x, 5), pow4In = x => x * x * x * x;

FX.launchPod = {
  life: 120,
  draw(e) {
    // LaunchPayload: pod climbs away, shrinking shadow drifts off
    const alpha = 1 - pow5Out(e.fin), scale = (1 - alpha) * 1.3 + 1;
    const cx = e.x + e.fin * e.fin * 12, cy = e.y + Math.pow(e.fin, 5) * 100, rot = e.fin * 150;
    const reg = Assets.get(e.data.pod);
    Draw.setAlpha(alpha * 0.22);
    const sd = Math.pow(e.fin, 3) * 250;
    Draw.rect(Assets.tinted(e.data.pod, PAD_SHADOW), cx - sd * 0.707, cy - sd * 0.707, reg.ww * scale, reg.wh * scale, rot);
    Draw.setAlpha(alpha);
    Draw.rect(reg, cx, cy, reg.ww * scale, reg.wh * scale, rot);
    Draw.setAlpha(1);
  },
};
FX.podLand = {
  life: 40,
  draw(e) { Lines.set(rgba(Pal.accent, e.fout), 3 * e.fout + 0.5); Lines.circle(e.x, e.y, 6 + e.fin * 40); },
};

class LaunchPad extends Building {
  constructor(...a) { super(...a); this.launchCounter = 0; }
  acceptItem(source, item) { return this.total < this.block.itemCapacity && (this.total === 0 || this.items[item.id] > 0); }
  shouldConsume() { return this.launchCounter < this.block.launchTime; }
  get padEfficiency() {
    const cl = this.block.consumeLiquid, lq = this.liquid;
    return lq.type && lq.type.name === cl.liquid && lq.amount >= cl.amount * Time.delta ? this.efficiency : 0;
  }
  update() {
    const eff = this.shouldConsume() ? this.padEfficiency : 0;
    if (eff > 0) { this.removeLiquid(this.block.consumeLiquid.amount * Time.delta); this.launchCounter += eff * Time.delta; }
    this.warmup = Mathf.approach(this.warmup, eff > 0 || this.launchCounter >= this.block.launchTime ? 1 : 0, 0.02 * Time.delta);
    if (this.launchCounter >= this.block.launchTime && this.total >= this.block.itemCapacity) this.launch();
  }
  launch() {
    const stacks = [];
    for (const it of ITEMS) if (this.items[it.id]) stacks.push([it, this.items[it.id]]);
    Audio2.play('padLaunch', this.x, this.y, 1 + Mathf.range(0.1));
    Fx.create('launchPod', this.x, this.y, 0, null, { pod: this.block.name + '-pod' });
    Render.shake(3, 3);
    this.items.fill(0); this.total = 0; this.launchCounter = 0;
    if (this.team === 'sharded' && typeof Sectors !== 'undefined') Sectors.podLaunched(stacks);
  }
  info() {
    const dest = typeof Sectors !== 'undefined' && Sectors.current ? Sectors.destination(Sectors.current.name) : null;
    return [`Items: ${this.total}/${this.block.itemCapacity}`, `Launch: ${Math.floor(Math.min(1, this.launchCounter / this.block.launchTime) * 100)}%`,
      `Power: ${Math.round(this.efficiency * 100)}%`, Sectors.current ? `Destination: ${dest ? Sectors.title(dest) : 'none (click to set)'}` : 'Free play: pods go nowhere'];
  }
  draw() {
    drawLiquidFill(this, null, 2);
    Draw.rect(this.block.name, this.x, this.y);
    const progress = Math.min(this.total / this.block.itemCapacity, this.launchCounter / this.block.launchTime);
    const light = this.block.name + '-light', corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const a = Mathf.clamp((progress - j / 3) * 3), off = -(j - 1);
      const x = this.x + corners[i][0] * off, y = this.y + corners[i][1] * off;
      Draw.rect(Assets.tinted(light, PAD_DARK), x, y, undefined, undefined, i * 90);
      if (a > 0) { Draw.setAlpha(a); Draw.rect(Assets.tinted(light, PAD_LIGHT), x, y, undefined, undefined, i * 90); Draw.setAlpha(1); }
    }
    Draw.rect(this.block.name + '-pod', this.x, this.y);
  }
  writeState() { return { lc: Math.round(this.launchCounter) }; }
  readState(s) { this.launchCounter = s.lc || 0; }
}

class LandingPad extends Building {
  constructor(...a) {
    super(...a);
    this.config = null; this.priority = Math.floor(Math.random() * 2 ** 31);
    this.cooldown = 0; this.arriving = null; this.arrivingTimer = 0; this.liquidRemoved = 0;
  }
  acceptItem() { return false; }
  configure(item) { this.config = item; }
  isFake() { return this.team !== 'sharded' || typeof Sectors === 'undefined' || !Sectors.current; }
  get water() { return this.liquid.type && this.liquid.type.name === 'water' ? this.liquid.amount : 0; }
  handleLanding() {
    if (!this.config) return;
    this.cooldown = 1; this.arriving = this.config; this.arrivingTimer = 0; this.liquidRemoved = 0;
    Audio2.play('padLand', this.x, this.y, 0.75);
    if (!this.isFake()) Sectors.importTimers[this.config.name] = 0;
  }
  update() {
    const b = this.block;
    if (this.arriving) {
      this.arrivingTimer += Time.delta / b.arrivalDuration;
      const toRemove = Math.min(b.consumeLiquidAmount / b.arrivalDuration * Time.delta, b.consumeLiquidAmount - this.liquidRemoved);
      this.liquidRemoved += toRemove; this.removeLiquid(toRemove);
      if (Math.random() < 0.2 * pow5Out(Math.min(1, this.arrivingTimer)) * Time.delta) Fx.create('smokeSmall', this.x + Mathf.range(12), this.y + Mathf.range(12));
      if (this.arrivingTimer >= 1) {
        this.removeLiquid(Math.max(0, b.consumeLiquidAmount - this.liquidRemoved));
        Fx.create('podLand', this.x, this.y);
        Render.shake(3, 3);
        this.items.fill(0); this.total = 0;
        this.addItem(this.arriving, b.itemCapacity);
        if (!this.isFake()) Sectors.handleImport(this.arriving, b.itemCapacity);
        this.arriving = null; this.arrivingTimer = 0;
      }
    }
    if (this.total > 0) { const only = this.config && this.items[this.config.id] === this.total ? this.config : null; this.dump(only); this.dump(only); }
    if (!this.arriving) this.cooldown = Mathf.clamp(this.cooldown - Time.delta / b.cooldownTime);
    if (this.config && !this.arriving && this.cooldown <= 0 && this.water >= b.consumeLiquidAmount && this.total === 0) {
      if (this.isFake()) this.handleLanding();
      else if (Sectors.importReady(this.config)) Sectors.queueLanding(this);
    }
  }
  info() {
    const lines = [`Item: ${this.config ? titleCase(this.config.name) : 'none (click to pick)'}`, `Water: ${Math.floor(this.water)}/${this.block.consumeLiquidAmount} per landing`];
    if (!this.isFake() && this.config) {
      const rate = Sectors.importRate(this.config.name), src = Sectors.importSources(this.config.name);
      lines.push(`Sources: ${src || 'none'}` + (rate > 0 ? ` · ${Math.round(rate * 60)}/min` : ''));
    } else if (this.isFake()) lines.push('Free play: pods land whenever there is water');
    return lines;
  }
  draw() {
    drawLiquidFill(this, null, 2);
    Draw.rect(this.block.name, this.x, this.y);
    const pod = 'advanced-launch-pad-pod';
    if (this.arriving) {
      const fin = Mathf.clamp(this.arrivingTimer), fout = 1 - fin, alpha = pow5Out(fin), scale = (1 - alpha) * 1.3 + 1;
      const reg = Assets.get(pod), cy = this.y + pow4In(fout) * 110, rot = fout * 110;
      Draw.setAlpha(alpha);
      Draw.rect(reg, this.x, cy, reg.ww * scale, reg.wh * scale, rot);
      Draw.setAlpha(1);
    } else if (this.cooldown > 0) {
      Draw.setAlpha(this.cooldown); Draw.rect(pod, this.x, this.y); Draw.setAlpha(1);
    }
  }
  writeState() { return { c: this.config ? this.config.name : null, cd: this.cooldown, ar: this.arriving ? this.arriving.name : null, at: this.arrivingTimer, lr: this.liquidRemoved }; }
  readState(s) {
    this.config = s.c ? Items[s.c] : null; this.cooldown = s.cd || 0; this.arriving = s.ar ? Items[s.ar] : null;
    this.arrivingTimer = s.at || 0; this.liquidRemoved = s.lr || 0;
  }
}
Object.assign(BuildClasses, { LaunchPad, LandingPad });
