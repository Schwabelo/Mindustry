// Frame rendering, layered like Mindustry's Renderer: floor -> decals -> blocks -> units -> bullets -> fx -> overlays.

function inView(v, x, y, pad) { return x > v.x1 - pad && x < v.x2 + pad && y > v.y1 - pad && y < v.y2 + pad; }

function renderFrame() {
  const ctx = Render.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, Render.W, Render.H);
  if (!World.floor) return;

  // camera follow
  const p = Game.player;
  const core = Game.playerCore();
  const focus = p || core;
  if (focus) {
    const k = Math.min(1, 0.12 * Time.frameDelta);
    Render.camX += (focus.x - Render.camX) * k;
    Render.camY += (focus.y - Render.camY) * k;
  }
  Render.zoom += (Render.targetZoom - Render.zoom) * Math.min(1, 0.2 * Time.frameDelta);

  Render.begin();
  const v = Render.view();
  World.drawFloors();
  Render.base();
  Decals.draw();

  // boulders + spawn zone
  const tx1 = Math.max(0, Math.floor(v.x1 / TS)), tx2 = Math.min(World.w - 1, Math.ceil(v.x2 / TS));
  const ty1 = Math.max(0, Math.floor(v.y1 / TS)), ty2 = Math.min(World.h - 1, Math.ceil(v.y2 / TS));
  for (let ty = ty1; ty <= ty2; ty++) for (let tx = tx1; tx <= tx2; tx++) {
    const i = ty * World.w + tx;
    const bo = World.boulder[i];
    if (bo) {
      const f = FLOOR_DEFS[World.floor[i]];
      Draw.rect((f.boulder || 'boulder') + bo, tx * TS, ty * TS);
    }
  }
  const sx = World.spawn.x * TS, sy = World.spawn.y * TS;
  if (inView(v, sx, sy, SPAWN_SAFE_RADIUS * TS + 20)) {
    Lines.set(rgba(Teams.crux.color, 0.5 + Mathf.absin(Time.time, 10, 0.3)), 1.5);
    Lines.dashCircle(sx, sy, SPAWN_SAFE_RADIUS * TS, -Time.time / 120);
  }

  // blocks: conveyor beds, then items, then the rest
  const vis = [];
  for (const b of Game.buildings) if (inView(v, b.x, b.y, b.hitSize + 8)) vis.push(b);
  for (const b of vis) if (b instanceof Conveyor) b.drawUnder();
  for (const b of vis) if (b instanceof Conveyor) b.drawItems();
  const turrets = [];
  for (const b of vis) {
    if (b instanceof Conveyor) continue;
    if (b instanceof Turret) { turrets.push(b); continue; }
    b.draw();
  }
  for (const b of vis) if (b.hitTime > 0 && !(b instanceof ConstructBuild)) {
    Draw.setAlpha(b.hitTime * 0.35);
    Fill.set('#fff'); Fill.square(b.x, b.y, b.block.size * TS / 2);
    Draw.setAlpha(1);
  }
  for (const b of turrets) b.draw();

  // ground units
  const ground = [], air = [];
  for (const u of Game.units) {
    if (!inView(v, u.x, u.y, u.type.hitSize * 3 + 20)) continue;
    (u.isFlying ? air : ground).push(u);
  }
  for (const u of ground) u.drawShadow();
  for (const u of ground) u.draw();

  // bridges + power lasers
  for (const b of vis) if (b instanceof ItemBridge) b.drawBridge();
  Power.drawLasers();

  // bullets & effects
  Bullets.draw();
  Lightning.draw();

  // flying units (shadows first)
  for (const u of air) u.drawShadow();
  for (const u of air) u.draw();

  Fx.draw();
  Draw.reset();

  // health bars for recently damaged player buildings and all damaged units nearby
  for (const b of vis) {
    if (b.health < b.maxHealth && Time.time - b.lastHit < 240 && !(b instanceof ConstructBuild)) drawBar(b.x, b.y - b.block.size * TS / 2 - 2, b.block.size * TS * 0.8, b.healthf, Teams[b.team].color);
  }
  for (const u of Game.units) {
    if (u.health < u.maxHealth && inView(v, u.x, u.y, 20) && !u.isPlayer) drawBar(u.x, u.y - u.type.hitSize / 2 - 3, u.type.hitSize, u.healthf, Teams[u.team].color);
  }

  Input.drawWorld();
  Draw.reset();
  UI.drawWorldLabels();
}

function drawBar(x, y, w, f, c) {
  Fill.set('rgba(0,0,0,0.6)'); Fill.rect(x, y, w + 1, 2);
  Fill.set(lerpCol(Pal.health, c, f).css); Fill.rect(x - w / 2 + w * f / 2, y, w * f, 1.2);
}
