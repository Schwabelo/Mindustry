// Fixes that need Game (see 08z_fidelity.js for content fixes).
// ForceFieldAbility.created: the field starts at full strength
{
  const _su = Game.spawnUnit;
  Game.spawnUnit = function (type, team, x, y, rot) {
    const u = _su.apply(this, arguments);
    for (const a of type.abilities || []) if (a.type === 'forceField') u.shield = Math.max(u.shield || 0, a.max);
    return u;
  };
}
