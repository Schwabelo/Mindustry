// Content fixes that apply across many blocks (checked against core/src/mindustry/**):
// - Wall (and Door): buildCostMultiplier = 6 unless the block sets its own
// - Block.canOverdrive = false: cores, batteries, power nodes, conduits, liquid routers/tanks/bridges, logic memory/displays,
//   overflow gates, walls, landing pads
// (material-scaled default health lives in defBlock, 03_content.js)

for (const b of Object.values(BLOCKS)) {
  if ((b.cls === 'Wall' || b.cls === 'Door') && b.buildCostMultiplier === 1) { b.buildCostMultiplier = 6; b.buildTime *= 6; }
}

function canOverdrive(b) {
  return !(b instanceof Core || b instanceof Battery || b instanceof PowerNode || b instanceof Conduit || b instanceof LiquidRouter
    || b instanceof LiquidBridge || b instanceof MemoryBlock || b instanceof LogicDisplay || b instanceof OverflowGate || b instanceof Wall
    || (typeof LandingPad !== 'undefined' && b instanceof LandingPad));
}
