// Config popups for launch pads (sector destination) and landing pads (item to receive).
{
  const _oc = UI.openConfig.bind(UI);
  UI.openConfig = function (b) {
    if (!(b instanceof LaunchPad || b instanceof LandingPad)) return _oc(b);
    const el = $('config'); el.innerHTML = ''; this.configOpen = b;
    const head = t => { const d = document.createElement('div'); d.className = 'wide'; d.innerHTML = t; el.appendChild(d); };
    const btn = (html, title, sel, fn, wide) => {
      const d = document.createElement('div');
      d.className = 'bbtn' + (sel ? ' sel' : '') + (wide ? ' wide' : ''); d.title = title; d.innerHTML = html;
      if (wide) Object.assign(d.style, { width: 'auto', padding: '2px 6px', fontSize: '12px', textAlign: 'left' });
      d.onclick = () => { fn(); Audio2.play('click', undefined, undefined, 0.3); this.openConfig(b); };
      el.appendChild(d);
    };
    if (b instanceof LaunchPad) {
      const cur = Sectors.current;
      if (!cur) head('Free play: launched pods go nowhere. Use the campaign to trade between sectors.');
      else {
        const dest = Sectors.destination(cur.name);
        head(`Send this sector's pods to:`);
        const targets = Sectors.order.filter(n => n !== cur.name && (Sectors.bases.has(n) || Sectors.captured.has(n)));
        for (const n of targets) btn(Sectors.title(n), 'Destination', dest === n, () => Sectors.setDestination(cur.name, dest === n ? null : n), true);
        if (!targets.length) head('<span style="color:#999">No other sector with a base yet.</span>');
        head(`<span style="color:#999;font-size:12px">Every launch pad here sends to the same sector; it imports them with landing pads.</span>`);
      }
    } else {
      head('Item to receive');
      for (const it of ITEMS) btn(`<img src="${Assets.url(it.icon)}">`, titleCase(it.name), b.config === it, () => b.configure(b.config === it ? null : it));
      btn(`<span style="font-size:18px">&times;</span>`, 'Clear', !b.config, () => b.configure(null));
      if (b.config && !b.isFake()) {
        const rate = Sectors.importRate(b.config.name);
        head(`<span style="font-size:12px;color:#bbb">${rate > 0 ? `${Math.round(rate * 60)} ${titleCase(b.config.name)}/min from ${Sectors.importSources(b.config.name)} sector(s)` : 'No sector sends this item here yet.'}</span>`);
      }
    }
    el.classList.remove('hidden');
    const [sx, sy] = Render.worldToScreen(b.x, b.y + b.block.size * TS / 2);
    el.style.left = Math.max(4, Math.min(window.innerWidth - el.offsetWidth - 4, sx - el.offsetWidth / 2)) + 'px';
    el.style.top = Math.max(4, sy - el.offsetHeight - 10) + 'px';
  };
}
