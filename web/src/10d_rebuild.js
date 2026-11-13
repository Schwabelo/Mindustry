// Rebuild ghosts (team block plans): destroyed blocks show as faint outlines until a builder rebuilds them.
{
  const _dw = Input.drawWorld;
  Input.drawWorld = function () {
    const q = Game.rebuildQueue;
    if (q && q.length) {
      const v = Render.view();
      Draw.setAlpha(0.3);
      for (const g of q) {
        const x = g.x * TS + g.block.offset, y = g.y * TS + g.block.offset;
        if (x < v.x1 - 32 || x > v.x2 + 32 || y < v.y1 - 32 || y > v.y2 + 32) continue;
        Draw.rect(Assets.get('icon:' + g.block.name), x, y, g.block.size * TS, g.block.size * TS, g.block.rotate ? g.rotation * 90 : 0);
      }
      Draw.setAlpha(1);
    }
    return _dw.apply(this, arguments);
  };
}
