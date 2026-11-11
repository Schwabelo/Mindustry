# Mindustry Lite (single HTML file)

`dist/mindustry-lite.html` is a self-contained browser game built from this repository.
Open it directly in a desktop browser; no server or install needed. Every sprite, sound,
music track and the font is embedded in the file.

## What it is

A JavaScript re-implementation of Mindustry's core survival loop, with stats and behaviour
taken from the Java source (`core/src/mindustry/content/*.java`, `world/blocks/**`):

- Procedurally generated map with Mindustry floors, edge blending (from `edge-stencil.png`),
  ores, static walls and wall darkness
- Alpha core unit: fly, shoot, mine ore, build and deconstruct with build plans
- Blocks: conveyor, titanium conveyor, junction, router, sorter, overflow gate, bridge conveyor,
  unloader, mechanical/pneumatic drill, graphite press, silicon smelter, kiln, pulverizer,
  combustion generator, solar panel, battery, power node, copper/titanium walls (+large),
  mender, duo, scatter, hail, lancer, arc, ground factory, container, core shard
- Enemies: dagger, mace, fortress, crawler, flare, horizon, nova, using the wave table from
  `game/Waves.java`, with ground flow-field pathfinding and Mindustry's AI behaviours
- Player-built units (dagger / crawler / nova) that defend the core or attack (G)

It is not a port of the Java game; there is no campaign, tech tree, multiplayer, logic
processors, liquids or saves.

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
