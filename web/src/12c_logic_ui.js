// Logic editor + processor/message config popups (loaded after 12_ui.js, which defines UI).

// ================================================================ editor UI
const LogicUI = {
  el: null,
  open(title, text, onSave, extraHtml = '') {
    if (!this.el) {
      const d = document.createElement('div');
      d.id = 'logicEditor';
      d.innerHTML = `<div class="panel" style="position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:20;width:min(640px,calc(100vw - 24px));padding:12px;display:flex;flex-direction:column;gap:8px">
        <div id="leTitle" style="color:var(--accent);font-size:16px"></div><div id="leExtra" style="font-size:12px;color:#bbb"></div>
        <textarea id="leText" spellcheck="false" style="height:min(55vh,420px);background:#111;color:#e8e8e8;border:2px solid #454545;font:13px monospace;padding:6px;resize:vertical"></textarea>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button id="leSave">Save</button><button id="leCopy">Copy</button><button id="lePaste">Paste</button><button id="leClear">Clear</button><button id="leCancel">Cancel</button></div></div>`;
      document.body.appendChild(d);
      this.el = d;
      $('leCancel').onclick = () => this.close();
      $('leCopy').onclick = () => { try { navigator.clipboard.writeText($('leText').value); UI.toast('Copied', 1); } catch (e) { /* ignore */ } };
      $('lePaste').onclick = async () => { try { $('leText').value = await navigator.clipboard.readText(); } catch (e) { UI.toast('Paste with Ctrl+V into the box', 2); } };
      $('leClear').onclick = () => { $('leText').value = ''; };
    }
    this.el.classList.remove('hidden'); this.el.style.display = '';
    $('leTitle').textContent = title; $('leExtra').innerHTML = extraHtml; $('leText').value = text;
    $('leSave').onclick = () => { onSave($('leText').value); this.close(); Audio2.play('click', undefined, undefined, 0.4); };
    if (Game.state === 'playing') { this.paused = true; Game.state = 'paused'; }
    setTimeout(() => $('leText').focus(), 0);
  },
  close() { if (this.el) this.el.style.display = 'none'; if (this.paused) { this.paused = false; Game.state = 'playing'; } },
};
const _openCfg = UI.openConfig.bind(UI);
UI.openConfig = function (b) {
  if (b instanceof LogicProcessor) {
    const el = $('config'); el.innerHTML = ''; this.configOpen = b;
    const btn = document.createElement('div'); btn.className = 'wide bbtn'; btn.style.cursor = 'pointer'; btn.textContent = 'Edit code';
    btn.onclick = () => {
      this.closeConfig();
      LogicUI.open(`${titleCase(b.block.name)} (${b.block.ipt * 60} instructions/s)`, b.code, code => b.setCode(code),
        `Links: ${b.links.map(l => l.name).join(', ') || 'none'}. Click blocks in range while the processor is selected to link them. mlog text: the same format Mindustry copies to the clipboard.`);
    };
    el.appendChild(btn);
    const info = document.createElement('div'); info.className = 'wide'; info.textContent = 'Click blocks in range to link/unlink';
    el.appendChild(info);
    el.classList.remove('hidden');
    const [sx, sy] = Render.worldToScreen(b.x, b.y + b.block.size * TS / 2);
    el.style.left = Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, sx - el.offsetWidth / 2)) + 'px';
    el.style.top = Math.max(4, sy - el.offsetHeight - 10) + 'px';
    return;
  }
  if (b instanceof MessageBlock) { LogicUI.open('Message', b.text, t => { b.text = t.slice(0, MAX_TEXT); }); return; }
  return _openCfg(b);
};
