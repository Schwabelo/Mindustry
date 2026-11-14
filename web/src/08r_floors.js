// Floor effects on ground units (StatusComp.update): standing on a floor with a status applies it every tick (wet in water,
// tarred on tar, melting on slag, muddy in mud). Hovering and boosting / flying units are unaffected.

STATUS.muddy = { speedMultiplier: 0.94, healthMultiplier: 1, color: col('46382a'), noFx: true }; // StatusEffects.muddy (show = false)
{
  const _uu = Unit.prototype.update;
  Unit.prototype.update = function () {
    if (!this.dead && !this.isFlying && !this.type.hovering && !(this.elevation > 0.001)) {
      const tx = Math.round(this.x / TS), ty = Math.round(this.y / TS);
      if (World.inside(tx, ty)) {
        const fl = FLOOR_DEFS[World.floor[ty * World.w + tx]];
        if (fl.status && STATUS[fl.status]) this.applyStatus(fl.status, fl.statusDuration);
      }
    }
    return _uu.apply(this, arguments);
  };
}
