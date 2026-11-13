// Sector saves: the save records which sector it is, and loading rebuilds that sector's terrain and rules.
{
  const _ser = SaveIO.serialize;
  SaveIO.serialize = function () { const d = _ser.apply(this, arguments); if (Sectors.current) d.sec = Sectors.current.name; return d; };
  const _load = SaveIO.load;
  SaveIO.load = function (data) {
    const m = data && data.sec ? Sectors.map(data.sec) : null;
    if (data && data.sec && !m) throw new Error('Sector maps are still loading');
    Sectors.current = Sectors.pending = m;
    if (!m) Sectors.clearRules();
    const r = _load.call(this, data);
    Sectors.pending = null;
    if (m) { Sectors.applyRules(m); Pathfinder.init(); }
    return r;
  };
}
