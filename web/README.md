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
- Items: conveyor, titanium conveyor, junction, router, sorter, overflow gate, bridge conveyor, unloader
- Liquids: mechanical pump (water from water, oil from tar), conduit, liquid router, liquid junction,
  bridge conduit, liquid tank; water boosts drills (1.6x) and cools turrets, cryofluid cools better;
  oil extractor (sand + water + power on sandy floors)
- Production/crafting: mechanical, pneumatic and laser drills; graphite press, silicon smelter, kiln,
  pulverizer, incinerator, cryofluid mixer, plastanium compressor, cultivator, spore press, pyratite mixer, blast mixer,
  surge smelter, phase weaver
- Power: combustion, steam, differential and RTG generators, solar panel (+large), thorium reactor (needs
  cryofluid or it melts down), impact reactor, battery (+large), power node (+large), surge tower, diode
- Defense: copper/titanium/thorium/plastanium/phase/surge walls (+large; plastanium absorbs enemy lasers,
  phase reflects bullets, surge arcs lightning), mender, mend projector, force projector, overdrive projector
  (phase fabric boosts the projectors); turrets duo, scatter, scorch, hail, lancer, arc, wave, salvo, segment,
  swarmer, ripple, fuse, cyclone, tsunami, parallax, spectre, meltdown, foreshadow
- Fires: incendiary ammo and burning buildings spread fire; water puts it out; explosive cargo blows up
- Cores: shard → foundation → nucleus (placed over the old core), with alpha → beta → gamma ships;
  containers and vaults touching the core share its storage
- Units: ground factory (dagger, crawler, nova), air factory (flare, mono), and all four
  reconstructors (additive, multiplicative, exponential, tetrative) for tiers 2-5:
  dagger → mace → fortress → scepter → reign, nova → pulsar → quasar → vela → corvus,
  crawler → atrax → spiroct → arkyid → toxopid, flare → horizon → zenith → antumbra → eclipse,
  mono → poly → mega → quad → oct; naval factory with risso → minke → bryde → sei → omura and
  retusa → oxynoe → cyerce → aegires → navanax (ships only move on water and must launch onto it); with their abilities (repair fields, shield regen, force fields,
  vela's healing beam, corvus's charged laser, sapping spiders, quad heal bombs); legged units walk
  over buildings and water; monos auto-mine, polys rebuild destroyed blocks, megas repair
- Enemies follow the wave table from `game/Waves.java` with flow-field pathfinding
- Save/load: autosave every minute, Continue on the title screen, save file export/import

It is not a port of the Java game; there is no campaign, tech tree, multiplayer, logic
processors, payload blocks, or the Erekir planet.

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
