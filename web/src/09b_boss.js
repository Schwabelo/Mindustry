// Guardian (boss) waves: Waves.generate's boss groups, generated per map seed and added on top of the default wave table;
// the boss status effect (StatusEffects.boss: 1.5x health, 1.3x damage), guardian warnings, the guardian health bar, boss music.

STATUS.boss = { speedMultiplier: 1, healthMultiplier: 1.5, damageMultiplier: 1.3, color: Teams.crux.color, noFx: true };

// --- boss groups (Waves.generate, difficulty 0.5 -> pow(0.5, 1.12))
let BOSS_GROUPS = [];
function genBossGroups(seed) {
  const rand = makeRand((seed * 7919 + 12345) >>> 0);
  const d = Math.pow(0.5, 1.12);
  const rr = (a, b) => a + rand() * (b - a), ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const air = ['flare', 'horizon', 'zenith', rand() < 0.5 ? 'quad' : 'antumbra', rand() < 0.1 ? 'quad' : 'eclipse'];
  const species = [['dagger', 'mace', 'fortress', 'scepter', 'reign'], ['nova', 'pulsar', 'quasar', 'vela', 'corvus'],
    ['crawler', 'atrax', 'spiroct', 'arkyid', 'toxopid'], air];
  const pick = () => species[Math.floor(rand() * species.length)];
  const shieldsPerWave = 20 + d * 30;
  const bossWave = Math.floor(rr(50, 70) * Mathf.lerp(1, 0.5, d));
  const bossSpacing = Math.floor(rr(25, 40) * Mathf.lerp(1, 0.5, d));
  const tier = d < 0.6 ? 3 : 4;
  const out = [];
  out.push({ unit: pick()[tier], unitAmount: 1, begin: bossWave, spacing: bossSpacing, max: 16, unitScaling: bossSpacing, shieldScaling: shieldsPerWave, boss: true });
  out.push({ unit: pick()[tier], unitAmount: 1, begin: bossWave + ri(3, 5) * bossSpacing, spacing: bossSpacing, max: 16, unitScaling: bossSpacing, shieldScaling: shieldsPerWave, boss: true });
  const finalStart = 120 + ri(0, 30);
  out.push({ unit: pick()[tier], unitAmount: 1, begin: finalStart, spacing: Math.floor(bossSpacing / 2), unitScaling: bossSpacing, shields: 500, shieldScaling: shieldsPerWave * 4, boss: true });
  out.push({ unit: pick()[tier], unitAmount: 1, begin: finalStart + 15, spacing: Math.floor(bossSpacing / 2), unitScaling: bossSpacing, shields: 500, shieldScaling: shieldsPerWave * 4, boss: true });
  return out;
}

// --- making a unit a guardian: permanent boss status + 1.3x damage on all its weapons
const _bossWeapons = new Map();
function bossBullet(b) {
  if (!b) return b;
  const c = Object.assign({}, b);
  for (const k of ['damage', 'splashDamage', 'lightningDamage']) if (c[k]) c[k] *= STATUS.boss.damageMultiplier;
  if (c.laserLightning) c.laserLightning = Object.assign({}, c.laserLightning, { damage: c.laserLightning.damage * STATUS.boss.damageMultiplier });
  if (c.fragBullet) c.fragBullet = bossBullet(c.fragBullet);
  c._back = null; c._front = null;
  return c;
}
function bossWeapon(w) {
  if (!_bossWeapons.has(w)) _bossWeapons.set(w, Object.assign({}, w, { bullet: bossBullet(w.bullet), orig: w }));
  return _bossWeapons.get(w);
}
function makeBoss(u) {
  u.boss = true;
  if (!u.statuses) u.statuses = {};
  u.statuses.boss = Infinity;
  for (const m of u.mounts) m.weapon = bossWeapon(m.weapon.orig || m.weapon);
}
// weapon sprites are looked up by index in the unit type; boss weapons point back to the original
t_widx = function (u, w) { return u.type.weapons.indexOf(w.orig || w); };

// --- spawning
const _bossRunWave = Game.runWave;
Game.runWave = function () {
  const w = this.wave - 1;
  const sx = World.spawn.x * TS, sy = World.spawn.y * TS;
  _bossRunWave.call(this);
  const spawned = [];
  for (const g of BOSS_GROUPS) {
    const n = groupSpawned(g, w);
    if (!n) continue;
    const type = UNITS[g.unit], shield = groupShield(g, w);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 360, d = Math.random() * (type.flying ? 40 : 14);
      const u = this.spawnUnit(type, 'crux', sx + Angles.trnsx(a, d), sy + Angles.trnsy(a, d), Angles.angle(sx, sy, World.coreTile.x * TS, World.coreTile.y * TS));
      u.shield = shield;
      makeBoss(u);
      Fx.create('unitSpawn', u.x, u.y, 0, Teams.crux.color);
      spawned.push(type.name);
    }
  }
  if (spawned.length) {
    UI.toast(`[!] Guardian${spawned.length > 1 ? 's' : ''} arrived: ${[...new Set(spawned)].map(titleCase).join(', ')}`, 5, true);
    Render.shake(4, 30);
    BossHud.musicAt = Time.time + (8 + Math.random() * 7) * 60;
  }
  // HudFragment: warn 10, 5, 2 and 1 waves before the next guardian
  outer:
  for (let i = this.wave - 1; i <= this.wave + 10; i++) {
    for (const g of BOSS_GROUPS) {
      if (groupSpawned(g, i) > 0) {
        const diff = (i + 2) - this.wave;
        if (diff === 1 || diff === 2 || diff === 5 || diff === 10) UI.toast(`Guardian (${titleCase(g.unit)}) approaching in ${diff} wave${diff === 1 ? '' : 's'}`, 4, true);
        break outer;
      }
    }
  }
};
const _bossNewGame = Game.newGame;
Game.newGame = function (seed) { BOSS_GROUPS = []; return _bossNewGame.call(this, seed); }; // free play uses DefaultWaves only (custom games have no generated guardians)

// --- guardian health bar + boss music
const BossHud = {
  el: null, musicAt: 0, frame: 0,
  update() {
    if (this.musicAt && Time.time >= this.musicAt) { this.musicAt = 0; Audio2.playBossMusic && Audio2.playBossMusic(); }
    if (++this.frame % 6) return;
    const bosses = Game.units.filter(u => u.boss && !u.dead && u.team === 'crux');
    if (!this.el) {
      const hud = document.getElementById('hud');
      if (!hud) return;
      const d = document.createElement('div');
      d.id = 'bossBar';
      d.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);width:min(320px,calc(100vw - 32px));pointer-events:none;z-index:4;display:none';
      d.innerHTML = '<div style="background:#000a;border:3px solid #000a;padding:3px"><div style="position:relative;height:26px;background:#3a1010">' +
        '<div id="bossFill" style="position:absolute;left:0;top:0;bottom:0;background:#ff341c"></div>' +
        '<div id="bossText" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:3px;color:#fff;font-size:14px;text-shadow:0 0 3px #000"></div></div></div>';
      hud.appendChild(d);
      this.el = d;
    }
    const toasts = document.getElementById('toasts');
    if (!bosses.length || Game.state === 'title') { this.el.style.display = 'none'; this.shown = ''; if (toasts) toasts.style.top = ''; return; }
    this.el.style.display = '';
    if (toasts) toasts.style.top = '56px'; // keep messages below the guardian bar
    let max = 0, val = 0;
    for (const b of bosses) { max += b.maxHealth + (b.maxShield || 0); val += b.health; }
    document.getElementById('bossFill').style.width = (max ? Math.max(0, val / max) * 100 : 0) + '%';
    const key = bosses.slice(0, 6).map(b => b.type.name).join(',') + (bosses.length > 6 ? '+' : '');
    if (key !== this.shown) {
      this.shown = key;
      document.getElementById('bossText').innerHTML = bosses.slice(0, 6).map(b => `<img src="${Assets.url(b.type.name)}" style="height:18px;image-rendering:pixelated">`).join('') +
        (bosses.length > 6 ? '<span style="color:#ffd37f">+</span>' : '') + ' Guardian';
    }
  },
};
const _bossGameUpdate = Game.update;
Game.update = function () { _bossGameUpdate.call(this); BossHud.update(); };

// guardians get a red ring so you can tell them apart on the field
const _bossDraw = Unit.prototype.draw;
Unit.prototype.draw = function () {
  if (this.boss && !this.dead) {
    const r = this.type.hitSize * 0.75 + 3 + Mathf.absin(Time.time, 6, 1.5);
    Lines.set(rgba(Teams.crux.color, 0.5), 1); Lines.poly(this.x, this.y, 8, r, Time.time * 0.4);
  }
  _bossDraw.call(this);
};
