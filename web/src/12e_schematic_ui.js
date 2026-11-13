// Schematic library dialog (SchematicsDialog): saved schematics with previews, save / use / copy / delete / import.
const _schemCache = new Map();
async function schemFromCode(code) { if (!_schemCache.has(code)) _schemCache.set(code, readSchematic(code)); return _schemCache.get(code); }
function schemPreview(s, px) {
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, px, px);
  const cell = Math.min(px / s.width, px / s.height), ox = (px - s.width * cell) / 2, oy = (px - s.height * cell) / 2;
  for (const t of s.tiles) {
    const b = BLOCKS[t.block]; if (!b || !Assets.has('icon:' + b.name)) continue;
    const r = Assets.get('icon:' + b.name), sz = b.size * cell;
    const x = ox + (t.x + b.sizeOffset) * cell, y = oy + (s.height - (t.y + b.sizeOffset + b.size)) * cell;
    g.save(); g.translate(x + sz / 2, y + sz / 2); if (b.rotate) g.rotate(-t.rot * Math.PI / 2);
    g.drawImage(r.img, r.x, r.y, r.w, r.h, -sz / 2, -sz / 2, sz, sz); g.restore();
  }
  return c;
}
function costHtml(s) {
  return Object.entries(Schem.cost(s)).map(([n, a]) => `<span style="display:inline-flex;align-items:center;gap:2px;margin-right:6px"><img src="${Assets.url('item-' + n)}" style="width:14px;height:14px;image-rendering:pixelated">${a}</span>`).join('');
}
UI.openSchematics = function () {
  let el = document.getElementById('schemDialog');
  if (!el) {
    el = document.createElement('div'); el.id = 'schemDialog';
    document.body.appendChild(el);
  }
  const wasPlaying = Game.state === 'playing';
  if (wasPlaying) Game.state = 'paused';
  const close = () => { el.style.display = 'none'; if (wasPlaying && Game.state === 'paused') Game.state = 'playing'; };
  el.style.display = '';
  el.innerHTML = `<div class="panel" style="position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:20;width:min(720px,calc(100vw - 24px));max-height:calc(100vh - 40px);overflow:auto;padding:12px;background:rgba(18,18,22,0.97)">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><span style="color:var(--accent);font-size:18px">Schematics</span><button id="schClose">Close</button></div>
    <div id="schCurrent"></div>
    <div style="display:flex;gap:6px;margin:8px 0"><textarea id="schImport" placeholder="Paste a schematic code (bXNjaA...) from Mindustry or Lite" style="flex:1;height:44px;background:#111;color:#ddd;border:2px solid #454545;font:12px monospace;padding:4px"></textarea><button id="schImportBtn">Import</button></div>
    <div id="schList" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px"></div>
    <div style="font-size:12px;color:#999;margin-top:8px">In game: hold F and move the mouse to copy an area, release F. Click to place, R rotate, Z / X flip, right-click to drop it.</div></div>`;
  document.getElementById('schClose').onclick = close;
  const cur = document.getElementById('schCurrent');
  if (Schem.current) {
    cur.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><span id="schCurPrev"></span><div style="flex:1"><div>Copied: ${Schem.current.width}x${Schem.current.height}, ${Schem.current.tiles.length} blocks</div><div style="font-size:12px;margin:4px 0">${costHtml(Schem.current)}</div>
      <input id="schName" placeholder="Name" value="${Schem.current.name === 'Schematic' ? '' : Schem.current.name}" style="background:#111;color:#ddd;border:2px solid #454545;padding:4px;width:160px"> <button id="schSave">Save</button></div></div>`;
    document.getElementById('schCurPrev').appendChild(schemPreview(Schem.current, 72));
    document.getElementById('schSave').onclick = async () => {
      const name = (document.getElementById('schName').value || 'Schematic ' + (SchemLib.list().length + 1)).slice(0, 40);
      const code = await SchemLib.add(Schem.current, name);
      UI.toast(code ? `Saved "${name}"` : 'Could not save (storage blocked)', 1.5);
      UI.openSchematics(); if (wasPlaying) Game.state = 'paused';
    };
  }
  document.getElementById('schImportBtn').onclick = async () => {
    const code = document.getElementById('schImport').value.trim();
    if (!code) return;
    try {
      const s = await readSchematic(code);
      if (!s.tiles.length) { UI.toast('No blocks in that schematic exist in Lite', 2.5, true); return; }
      const l = SchemLib.list(); l.push({ name: s.name, code }); SchemLib.saveList(l);
      UI.toast(`Imported "${s.name}"` + (s.missing.length ? ` (skipped ${s.missing.length} block types Lite doesn't have)` : ''), 3);
      UI.openSchematics(); if (wasPlaying) Game.state = 'paused';
    } catch (e) { UI.toast('Invalid schematic: ' + e.message, 2.5, true); }
  };
  const list = document.getElementById('schList');
  const lib = SchemLib.list();
  if (!lib.length) list.innerHTML = '<div style="color:#999;font-size:13px">No saved schematics yet.</div>';
  lib.forEach((e, i) => {
    const card = document.createElement('div');
    card.style.cssText = 'background:#0006;border:2px solid #454545;padding:6px;display:flex;flex-direction:column;gap:4px;align-items:center';
    card.innerHTML = `<div class="pv"></div><div style="font-size:13px;text-align:center;word-break:break-word">${e.name.replace(/</g, '&lt;')}</div><div class="cost" style="font-size:11px;text-align:center"></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center"><button data-a="use" style="padding:3px 8px;font-size:12px">Use</button><button data-a="copy" style="padding:3px 8px;font-size:12px">Copy</button><button data-a="del" style="padding:3px 8px;font-size:12px">Delete</button></div>`;
    list.appendChild(card);
    schemFromCode(e.code).then(s => { card.querySelector('.pv').appendChild(schemPreview(s, 110)); card.querySelector('.cost').innerHTML = costHtml(s); }).catch(() => { card.querySelector('.pv').textContent = '(unreadable)'; });
    card.querySelector('[data-a=use]').onclick = async () => { try { Schem.current = Schem.clone(await schemFromCode(e.code)); close(); UI.toast(`Placing "${e.name}": click to place, R rotate, Z / X flip`, 2.5); } catch (err) { UI.toast('Invalid schematic', 2, true); } };
    card.querySelector('[data-a=copy]').onclick = () => { try { navigator.clipboard.writeText(e.code); UI.toast('Schematic code copied', 1.5); } catch (err) { UI.toast('Clipboard blocked', 1.5); } };
    card.querySelector('[data-a=del]').onclick = () => { const l = SchemLib.list(); l.splice(i, 1); SchemLib.saveList(l); UI.openSchematics(); if (wasPlaying) Game.state = 'paused'; };
  });
};
