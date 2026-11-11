// Boot + main loop.

function buildIcons() {
  for (const b of Object.values(BLOCKS)) {
    if (b.name === 'build') continue;
    let layers;
    if (b.iconLayers) layers = b.iconLayers;
    else if (b.cls === 'Conveyor') layers = [b.name + '-0-0'];
    else if (b.cls === 'Core' || b.cls === 'StorageBlock') layers = [b.name, Assets.team(b.name + '-team', Teams.sharded)];
    else if (b.cls === 'Battery') layers = ['battery', 'battery-top'];
    else if (b.cls === 'MendProjector') layers = ['mender', 'mender-top'];
    else if (b.cls === 'GenericCrafter' && b.flame) layers = [b.name];
    else layers = [b.name];
    Assets.composite('icon:' + b.name, layers, b.size);
  }
}

let lastFrame = 0, errorShown = false;
Time.frameDelta = 1;

function mainLoop(now) {
  try {
    const dtMs = Math.min(now - lastFrame || 16.67, 100);
    lastFrame = now;
    Time.frameDelta = dtMs / (1000 / 60);
    if (Game.state === 'playing') {
      const d = Time.frameDelta;
      const steps = Math.max(1, Math.ceil(d / 1.5));
      for (let i = 0; i < steps; i++) {
        Time.delta = d / steps;
        Game.update();
        if (Game.state !== 'playing') break;
      }
    } else if (Game.state === 'title' && World.floor) {
      // slow drift over the title backdrop
      Render.camX += 0.15 * Time.frameDelta;
      Render.camY += Math.sin(now / 9000) * 0.08 * Time.frameDelta;
      if (Render.camX > (World.w - 30) * TS) Render.camX = 30 * TS;
    }
    renderFrame();
    UI.update();
  } catch (e) {
    console.error(e);
    if (!errorShown) { errorShown = true; UI.toast('Error: ' + e.message, 8, true); }
  }
  requestAnimationFrame(mainLoop);
}

async function boot() {
  Render.init();
  await Assets.load();
  buildIcons();
  Decals.init();
  UI.init();
  Input.init();
  // title backdrop
  World.generate(UI.seed + 7);
  Render.camX = World.w * TS * 0.3; Render.camY = World.h * TS * 0.5;
  Render.zoom = Render.targetZoom = 3;
  try { await document.fonts.load('16px MindustryFont'); } catch (e) { /* font optional */ }
  document.getElementById('loading').remove();
  UI.showTitle();
  requestAnimationFrame(mainLoop);
}

boot().catch(e => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.textContent = 'Failed to load: ' + e.message;
});
