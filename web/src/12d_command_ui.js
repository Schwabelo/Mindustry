// Command panel (HudFragment unit command table): selected unit icons, commands and stances.
UI.commandPanel = function () {
  let el = document.getElementById('cmdPanel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cmdPanel'; el.className = 'panel';
    el.style.cssText = 'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);padding:6px 8px;z-index:5;display:none;max-width:calc(100vw - 16px)';
    document.getElementById('hud').appendChild(el);
  }
  const sel = Command.selected.filter(u => !u.dead);
  if (!sel.length && !Command.factories.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  if (Command.factories.length) {
    el.innerHTML = `<div style="font-size:13px;color:#ccc">${titleCase(Command.factories[0].block.name)}: right-click to set where new units go</div>`;
    return;
  }
  const counts = {};
  for (const u of sel) counts[u.type.name] = (counts[u.type.name] || 0) + 1;
  const all = (pred) => sel.length && sel.every(pred);
  const btn = (key, active, fn) => {
    const [icon, title] = CMD_INFO[key];
    return `<div class="bbtn${active ? ' sel' : ''}" data-k="${key}" data-f="${fn}" title="${title}" style="width:34px;height:34px"><img src="${Assets.url('icon-' + icon)}" style="width:22px;height:22px"></div>`;
  };
  const cmds = [...new Set(sel.flatMap(u => unitCommands(u.type)))];
  const stances = [...new Set(sel.flatMap(u => unitStances(u.type)))];
  el.innerHTML =
    `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:5px;font-size:13px">` +
    Object.entries(counts).map(([n, c]) => `<span style="display:flex;align-items:center;gap:2px"><img src="${Assets.url(n)}" style="height:20px;image-rendering:pixelated">${c}</span>`).join('') +
    `<span style="color:#999;margin-left:4px">right-click: move / attack · Ctrl: queue</span></div>` +
    `<div style="display:flex;gap:3px;flex-wrap:wrap">` +
    cmds.map(c => btn(c, all(u => u.controller instanceof CommandAI && u.controller.command === c), 'c')).join('') +
    `<div style="width:8px"></div>` +
    stances.map(s => btn(s, s !== 'stop' && all(u => u.controller instanceof CommandAI && u.controller.stances.has(s)), 's')).join('') +
    `</div>`;
  for (const b of el.querySelectorAll('.bbtn')) b.onclick = () => {
    const k = b.dataset.k, f = b.dataset.f;
    if (f === 'c') Command.setCommand(k); else if (f === 's') Command.setStance(k);
    Audio2.play('click', undefined, undefined, 0.3);
  };
};
// refresh the panel a few times a second (units die, commands change)
{
  const _uu = UI.update.bind(UI);
  let n = 0;
  UI.update = function () { _uu(); if (++n % 20 === 0 && (Command.selected.length || document.getElementById('cmdPanel'))) UI.commandPanel(); };
}
