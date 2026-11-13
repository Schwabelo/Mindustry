# Mindustry Lite (single HTML file)

`dist/mindustry-lite.html` is a self-contained browser game built from this repository.
Open it directly in a desktop browser; no server or install needed. Every sprite, sound,
music track and the font is embedded in the file.

## What it is

A JavaScript re-implementation of Mindustry's core survival loop, with stats and behaviour
taken from the Java source (`core/src/mindustry/content/*.java`, `world/blocks/**`):

- Procedurally generated map with Mindustry floors, edge blending (from `edge-stencil.png`),
  ores (copper, lead, coal, sand, scrap, titanium, thorium), static walls and wall darkness
- Alpha core unit: fly, shoot, mine ore, build and deconstruct with build plans
- Items: conveyor, titanium, plastanium (stack) and armored conveyors, junction, bridge and phase conveyors,
  sorter + inverted sorter, router + distributor, overflow + underflow gates, mass driver, unloader
- Liquids: mechanical, rotary and impulse pumps (water from water, oil from tar), conduit, pulse and plated
  conduits, liquid router, liquid container, liquid tank, liquid junction, bridge and phase conduits; water boosts drills (1.6x) and cools turrets, cryofluid cools better;
  oil extractor (sand + water + power on sandy floors)
- Production/crafting: mechanical, pneumatic, laser and blast drills, water extractor; graphite press, multi-press,
  silicon smelter, silicon crucible, melter, separator, disassembler, coal centrifuge (slag as a liquid), kiln,
  pulverizer, incinerator, cryofluid mixer, plastanium compressor, cultivator, spore press, pyratite mixer, blast mixer,
  surge smelter, phase weaver
- Power: combustion, thermal (on hot rock / magma rock vents), steam, differential and RTG generators, solar panel (+large), thorium reactor (needs
  cryofluid or it melts down), impact reactor, battery (+large), power node (+large), surge tower, diode
- Defense: doors (click to open/close), scrap walls (4 sizes), shock mines, overdrive dome, repair point;
  copper/titanium/thorium/plastanium/phase/surge walls (+large; plastanium absorbs enemy lasers,
  phase reflects bullets, surge arcs lightning), mender, mend projector, force projector, overdrive projector
  (phase fabric boosts the projectors); turrets duo, scatter, scorch, hail, lancer, arc, wave, salvo, segment,
  swarmer, ripple, fuse, cyclone, tsunami, parallax, spectre, meltdown, foreshadow
- Fires: incendiary ammo and burning buildings spread fire; water puts it out; explosive cargo blows up
- Cores: shard → foundation → nucleus (placed over the old core), with alpha → beta → gamma ships;
  containers and vaults touching the core share its storage
- Payload conveyor and payload router carry units between factories and reconstructors; illuminator
- Units: ground factory (dagger, crawler, nova), air factory (flare, mono), and all four
  reconstructors (additive, multiplicative, exponential, tetrative) for tiers 2-5:
  dagger → mace → fortress → scepter → reign, nova → pulsar → quasar → vela → corvus,
  crawler → atrax → spiroct → arkyid → toxopid, flare → horizon → zenith → antumbra → eclipse,
  mono → poly → mega → quad → oct; naval factory with risso → minke → bryde → sei → omura and
  retusa → oxynoe → cyerce → aegires → navanax (ships only move on water and must launch onto it); with their abilities (repair fields, shield regen, force fields,
  vela's healing beam, corvus's charged laser, sapping spiders, quad heal bombs); legged units walk
  over buildings and water; monos auto-mine, polys rebuild destroyed blocks, megas repair
- Enemies follow the wave table from `game/Waves.java` with flow-field pathfinding
- Unit command mode: select units, move/attack orders with pathfinding and formations, commands (move, repair,
  rebuild, assist, mine), stances (hold fire, pursue, patrol, ram, boost, hold position), factory rally points
- Campaign: the 29 Serpulo sectors of the tech tree with their real maps (exported from `core/assets/maps` with
  `tools/MapExport.java`), terrain, ores, derelict ruins, enemy bases, drop zones, wave tables, weather and launch loadouts.
  Sectors unlock like in the tech tree (parent captured + research); capture by surviving the win wave or by destroying
  every enemy core (enemy cores stay full of items, as with Serpulo's enemyInfiniteItems). Sector requirements in the
  tech tree (e.g. Pneumatic Drill needs Frozen Forest) apply. Sectors you leave are stored (IndexedDB) and resume where you
  left them; you can also restart one from scratch
- Launch pads: advanced launch pad (power + oil) fires 100-item pods to the sector's destination; the export rate is
  averaged over a minute like SectorInfo, and landing pads (1500 water per landing) in the destination receive pods at the
  summed export rate of every stored sector sending there. In free play a landing pad lands pods endlessly
- Tech tree (J): Mindustry's Serpulo research tree with its real research costs (exported from `SerpuloTechTree`);
  blocks and units are locked until researched with items from your core (pay in parts), items unlock when they first
  reach the core. Research is kept across games; untick "Tech tree" on the title screen to play with everything unlocked
- Schematics: copy areas with their settings (sorter items, bridge / node / processor links and code, factory
  plans...), rotate / flip, save a library, and import / export Mindustry schematic codes
- Weather: rain (wet status), snow, sandstorm and spore storm (wind, spore-slowed air units), fog; each map gets
  rain, fog and the storm of its main biome; weather changes solar, water extractor and cultivator output
- Guardian (boss) waves: per-map boss groups from `Waves.generate` (tier 4 guardians from about wave 40, final
  guardians from wave 120+), boss status (1.5x health, 1.3x damage), guardian warnings, health bar and boss music
- Logic: message, switch, micro/logic/hyper processors running mlog text (paste code copied from Mindustry),
  memory cell/bank, logic displays; read/write/draw/print/format/sensor/control/radar/op/jump/select/lookup/
  packcolor/ubind/ucontrol/uradar/ulocate and the rest of the normal-processor instruction set
- Save/load: autosave every minute, Continue on the title screen, save file export/import

It is not a port of the Java game; there is no campaign, tech tree, multiplayer, world processors,
or the Erekir planet.

## Controls

| Input | Action |
| --- | --- |
| WASD | move |
| Mouse wheel | zoom |
| Left click | build / shoot / mine ore / configure |
| Left drag | build in a line |
| Right click | remove (drag for an area) / cancel |
| R | rotate |
| Q or middle click | pick block under cursor |
| 1-9 | select block in the current category |
| G | toggle units attack / defend |
| Shift (hold) or C | command mode: drag to select units, right-click to move / attack, Ctrl+right-click to queue |
| F (hold) | copy an area as a schematic; then click to place, R rotate, Z / X flip, right-click to drop |
| T | schematic library: save, use, copy and import codes (Mindustry's base64 format) |
| J | research (tech tree) |
| N | call the next wave now |
| X | clear build queue |
| Space / Esc | pause |

## Building

```
pip install numpy pillow fonttools brotli
python3 web/build.py
```

`build.py` packs sprites from `core/assets-raw/sprites` into an atlas, adds the same outlines
the Mindustry packer adds to units and turrets, generates floor edge textures, embeds sounds
from `core/assets/sounds`, three music tracks and a subset of `core/assets/fonts/font.woff`,
then concatenates `web/src/*.js` into `web/template.html`.

## License

The assets are from Mindustry by Anuken and are licensed GPL-3.0, so this file is GPL-3.0 too.
