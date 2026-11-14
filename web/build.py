#!/usr/bin/env python3
"""
Builds web/dist/mindustry-lite.html: a single self-contained HTML file.

- Packs sprites from core/assets-raw/sprites into atlas pages (PNG, base64)
- Adds Mindustry-style outlines to unit and turret sprites (same as the packer in tools/)
- Generates floor edge textures from edge-stencil.png (same as Generators.java "edges")
- Embeds selected sounds + music (ogg) and a subset of the Mindustry font
- Concatenates web/src/*.js in name order into the page

Usage: python3 web/build.py
"""
import base64, io, json, os, sys, glob
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
SPR = os.path.join(ROOT, "core", "assets-raw", "sprites")
ICONS = os.path.join(ROOT, "core", "assets-raw", "icons")
ASSETS = os.path.join(ROOT, "core", "assets")
OUT = os.path.join(WEB, "dist", "mindustry-lite.html")

# ---------------------------------------------------------------- sprite index
_index = {}
for path in glob.glob(os.path.join(SPR, "**", "*.png"), recursive=True):
    name = os.path.basename(path)[:-4]
    if "/ui/" in path.replace("\\", "/"):
        continue
    _index.setdefault(name, []).append(path)


def find(name):
    if name not in _index:
        sys.exit("missing sprite: " + name)
    paths = sorted(_index[name], key=len)
    return paths[0]


UNIT_OUTLINE = ((0x56, 0x56, 0x66), 3)
BLOCK_OUTLINE = ((0x40, 0x40, 0x49), 4)

# name -> outline spec (None = no outline)
sprites = {}


def add(names, outline=None):
    for n in names:
        sprites[n] = outline


FLOORS = {
    # name: variants
    "deep-water": 0, "shallow-water": 0, "sand-water": 0, "darksand-water": 0, "tar": 0,
    "stone": 3, "basalt": 3, "sand-floor": 3, "darksand": 3, "dirt": 3, "grass": 3,
    "salt": 0, "snow": 3, "ice": 3, "moss": 3, "char": 3, "hotrock": 3, "magmarock": 3,
    # sector maps
    "tainted-water": 0, "deep-tainted-water": 0, "darksand-tainted-water": 0, "crater-stone": 3, "dacite": 3, "ice-snow": 3,
    "shale": 3, "core-zone": 0, "spore-moss": 3, "metal-floor": 0, "metal-floor-damaged": 3, "metal-floor-2": 0,
    "metal-floor-3": 0, "metal-floor-4": 0, "metal-floor-5": 0, "dark-panel-1": 0, "dark-panel-2": 0, "dark-panel-3": 0,
    "dark-panel-4": 0, "dark-panel-5": 0, "dark-panel-6": 0,
    # custom game maps
    "mud": 3, "molten-slag": 0, "space": 0,
}
for f, v in FLOORS.items():
    add([f] if v == 0 else [f"{f}{i}" for i in range(1, v + 1)])

WALLS = ["stone-wall", "dune-wall", "sand-wall", "snow-wall", "ice-wall", "dirt-wall",
         "shale-wall", "salt-wall", "red-ice-wall", "red-stone-wall", "spore-wall", "dark-metal", "dacite-wall", "carbon-wall",
         "crystalline-stone-wall", "shrubs"]
for w in WALLS:
    add([f"{w}1", f"{w}2", f"{w}-large"])
add(["metal-wall-1", "metal-wall-2", "metal-wall-3", "spore-pine", "snow-pine", "pine", "white-tree", "white-tree-dead",
     "white-tree-shadow", "white-tree-dead-shadow", "basalt-boulder1", "basalt-boulder2", "shale-boulder1", "shale-boulder2",
     "dacite-boulder1", "dacite-boulder2", "spore-cluster1", "spore-cluster2", "spore-cluster3"])

ORES = ["copper", "lead", "coal", "titanium", "scrap", "thorium"]
for o in ORES:
    add([f"ore-{o}{i}" for i in range(1, 4)])

add(["boulder1", "boulder2", "sand-boulder1", "sand-boulder2", "snow-boulder1", "snow-boulder2", "spawn"])
# sandbox blocks (custom games with infinite resources)
add(["item-source", "item-void", "liquid-source", "liquid-void", "source-bottom", "power-source", "power-void"])

ITEMS = ["copper", "lead", "metaglass", "graphite", "sand", "coal", "titanium", "scrap", "silicon", "thorium", "plastanium",
         "spore-pod", "pyratite", "blast-compound", "surge-alloy", "phase-fabric"]
add([f"item-{i}" for i in ITEMS])

# blocks
for c in ["conveyor", "titanium-conveyor"]:
    add([f"{c}-{a}-{b}" for a in range(5) for b in range(4)])
add(["conduit-bottom"] + [f"conduit-bottom-{i}" for i in range(5)] + [f"conduit-top-{i}" for i in range(5)])
add(["mechanical-pump", "mechanical-pump-liquid", "liquid-router", "liquid-router-bottom", "liquid-junction",
     "bridge-conduit", "bridge-conduit-end", "bridge-conduit-bridge", "bridge-conduit-arrow", "liquid-tank", "liquid-tank-bottom",
     "liquid-water", "liquid-cryofluid", "liquid-oil"])
add([f"fire{i}" for i in range(40)])
add(["scorch", "swarmer"], BLOCK_OUTLINE)
add(["scorch-heat", "cultivator", "cultivator-bottom", "cultivator-top", "spore-press", "spore-press-bottom", "spore-press-top",
     "spore-press-liquid", "spore-press-piston0", "spore-press-piston1", "pyratite-mixer", "blast-mixer"])
add(["spectre", "meltdown", "foreshadow", "segment", "parallax"], BLOCK_OUTLINE)
add(["spectre-heat", "meltdown-heat", "foreshadow-heat", "block-4", "surge-smelter", "surge-smelter-top", "phase-weaver",
     "phase-weaver-bottom", "phase-weaver-weave", "phase-wall", "phase-wall-large", "surge-wall", "surge-wall-large",
     "core-foundation", "core-foundation-team", "core-nucleus", "core-nucleus-team", "vault", "vault-team", "beta-cell", "gamma-cell"])
add(["beta", "gamma"], UNIT_OUTLINE)
add(["small-mount-weapon"], UNIT_OUTLINE)
add(["fuse", "cyclone", "cyclone-barrel-1", "cyclone-barrel-2", "cyclone-barrel-3", "tsunami"], BLOCK_OUTLINE)
add(["fuse-heat", "tsunami-liquid", "tsunami-top", "oil-extractor", "oil-extractor-rotator", "oil-extractor-top", "oil-extractor-liquid",
     "plastanium-compressor", "plastanium-compressor-top", "plastanium-wall", "plastanium-wall-large",
     "force-projector", "force-projector-top", "force-projector-team", "overdrive-projector", "overdrive-projector-top",
     "mend-projector", "mend-projector-top"])
add(["junction", "router", "sorter", "overflow-gate", "bridge-conveyor", "bridge-conveyor-end",
     "bridge-conveyor-bridge", "bridge-conveyor-arrow", "center",
     "mechanical-drill", "mechanical-drill-rotator", "mechanical-drill-top",
     "pneumatic-drill", "pneumatic-drill-rotator", "pneumatic-drill-top", "drill-item-2",
     "graphite-press", "silicon-smelter", "silicon-smelter-top", "kiln", "kiln-top",
     "pulverizer", "pulverizer-rotator", "pulverizer-top", "incinerator",
     "combustion-generator", "combustion-generator-top", "power-node", "battery", "battery-top", "solar-panel",
     "copper-wall", "copper-wall-large", "titanium-wall", "titanium-wall-large",
     "mender", "mender-top", "core-shard", "core-shard-team", "container", "container-team",
     "unloader", "unloader-center", "ground-factory", "air-factory", "factory-out-3", "factory-in-3", "factory-top-3",
     "block-1", "block-2", "block-border", "block-select", "place-arrow"])
for i in range(1, 9):
    add([f"rubble-{i}-0"])
add(["rubble-1-1", "rubble-2-1"])
# turrets (outlined like the packer does)
add(["duo", "duo-barrel-l", "duo-barrel-r", "scatter", "scatter-mid", "hail", "lancer", "arc"], BLOCK_OUTLINE)
add(["hail-heat", "lancer-heat", "arc-heat"])
add(["salvo-barrel", "salvo-side-l", "salvo-side-r", "ripple", "wave"], BLOCK_OUTLINE)
add(["salvo-barrel-heat", "ripple-heat", "wave-liquid", "wave-top", "block-3",
     "laser-drill", "laser-drill-rotator", "laser-drill-top", "drill-item-3", "thorium-wall", "thorium-wall-large",
     "power-node-large", "battery-large", "battery-large-top", "cryofluid-mixer", "cryofluid-mixer-bottom"])

# units
UNITS = {
    "alpha": ["alpha"], "dagger": ["dagger", "dagger-base", "dagger-leg"],
    "mace": ["mace", "mace-base", "mace-leg"], "fortress": ["fortress", "fortress-base", "fortress-leg"],
    "crawler": ["crawler", "crawler-base", "crawler-leg"], "flare": ["flare"], "horizon": ["horizon"],
    "nova": ["nova", "nova-base", "nova-leg"], "mono": ["mono"],
    "pulsar": ["pulsar", "pulsar-base", "pulsar-leg"], "quasar": ["quasar", "quasar-base", "quasar-leg"],
    "zenith": ["zenith"], "poly": ["poly"], "mega": ["mega"],
}
for parts in UNITS.values():
    add(parts, UNIT_OUTLINE)
add(["pulsar-cell", "quasar-cell", "zenith-cell", "poly-cell", "mega-cell"])
add(["heal-shotgun-weapon", "beam-weapon", "zenith-missiles", "poly-weapon", "heal-weapon-mount"], UNIT_OUTLINE)
add(["missile", "missile-back", "additive-reconstructor", "additive-reconstructor-top", "multiplicative-reconstructor",
     "multiplicative-reconstructor-top", "factory-in-5", "factory-out-5"])
add(["mono-cell", "alpha-cell", "mace-cell", "fortress-cell", "crawler-cell", "horizon-cell", "nova-cell"])
add(["small-basic-weapon", "large-weapon", "flamethrower", "artillery", "heal-weapon"], UNIT_OUTLINE)

# tier 4-5 units, spider line, exponential/tetrative reconstructors
T45 = {
    "scepter": ["scepter", "scepter-base", "scepter-leg"], "reign": ["reign", "reign-base", "reign-leg"],
    "vela": ["vela", "vela-base", "vela-leg"], "antumbra": ["antumbra"], "eclipse": ["eclipse"], "quad": ["quad"], "oct": ["oct"],
    "corvus": ["corvus", "corvus-leg", "corvus-leg-base", "corvus-foot", "corvus-joint", "corvus-joint-base"],
    "atrax": ["atrax", "atrax-base", "atrax-leg", "atrax-leg-base", "atrax-foot", "atrax-joint"],
    "spiroct": ["spiroct", "spiroct-leg", "spiroct-leg-base", "spiroct-foot", "spiroct-joint"],
    "arkyid": ["arkyid", "arkyid-leg", "arkyid-leg-base", "arkyid-foot", "arkyid-joint-base"],
    "toxopid": ["toxopid", "toxopid-leg", "toxopid-leg-base", "toxopid-foot", "toxopid-joint-base"],
}
for parts in T45.values():
    add(parts, UNIT_OUTLINE)
add([n + "-cell" for n in T45])
add(["scepter-weapon", "scepter-mount", "reign-weapon", "repair-beam-weapon-center-large", "missiles-mount", "large-bullet-mount",
     "large-laser-mount", "large-artillery", "atrax-weapon", "spiroct-weapon", "mount-purple-weapon", "large-purple-mount",
     "toxopid-cannon"], UNIT_OUTLINE)
add(["large-bomb", "large-bomb-back", "exponential-reconstructor", "exponential-reconstructor-top", "tetrative-reconstructor",
     "tetrative-reconstructor-top", "factory-in-7", "factory-out-7", "factory-in-9", "factory-out-9"])

# naval units + naval factory
NAVAL = ["risso", "minke", "bryde", "sei", "omura", "retusa", "oxynoe", "cyerce", "aegires", "navanax"]
add(NAVAL, UNIT_OUTLINE)
add([n + "-cell" for n in NAVAL])
add(["mount-weapon", "artillery-mount", "sei-launcher", "omura-cannon", "retusa-weapon", "plasma-mount-weapon", "point-defense-mount",
     "plasma-missile-mount", "emp-cannon-mount", "plasma-laser-mount", "repair-beam-weapon-center"], UNIT_OUTLINE)
add(["message", "switch", "switch-on", "micro-processor", "logic-processor", "hyper-processor", "memory-cell", "memory-bank",
     "logic-display", "large-logic-display"])
add(["thermal-generator", "illuminator", "illuminator-top", "payload-conveyor", "payload-conveyor-top", "payload-conveyor-icon",
     "payload-router", "payload-router-top", "payload-router-over", "payload-router-icon"])
add(["advanced-launch-pad", "advanced-launch-pad-light", "advanced-launch-pad-pod", "landing-pad"])
add(["door", "door-open", "door-large", "door-large-open", "scrap-wall-gigantic", "shock-mine", "shock-mine-team-top",
     "overdrive-dome", "overdrive-dome-top", "repair-point-base"] + [f"scrap-wall{i}" for i in range(1, 6)]
    + [f"scrap-wall-large{i}" for i in range(1, 5)] + [f"scrap-wall-huge{i}" for i in range(1, 4)])
add(["repair-point"], BLOCK_OUTLINE)
add(["multi-press", "silicon-crucible", "silicon-crucible-top", "melter", "melter-bottom", "separator", "separator-bottom",
     "separator-spinner", "disassembler", "disassembler-bottom", "disassembler-spinner", "coal-centrifuge", "blast-drill", "blast-drill-rim",
     "blast-drill-rotator", "blast-drill-top", "water-extractor", "water-extractor-liquid", "water-extractor-rotator", "water-extractor-top",
     "liquid-slag", "drill-item-4"])
add(["rotary-pump", "rotary-pump-liquid", "impulse-pump", "impulse-pump-liquid", "plated-conduit-cap", "liquid-container",
     "liquid-container-bottom", "phase-conduit", "phase-conduit-arrow", "phase-conduit-bridge", "phase-conduit-end"]
    + [f"pulse-conduit-top-{i}" for i in range(5)] + [f"plated-conduit-top-{i}" for i in range(5)])
add(["plastanium-conveyor", "plastanium-conveyor-0", "plastanium-conveyor-1", "plastanium-conveyor-2", "plastanium-conveyor-edge",
     "plastanium-conveyor-stack", "phase-conveyor", "phase-conveyor-arrow", "phase-conveyor-bridge", "phase-conveyor-end",
     "inverted-sorter", "underflow-gate", "distributor", "mass-driver-base"])
add(["mass-driver"], BLOCK_OUTLINE)
add([f"armored-conveyor-{a}-{b}" for a in range(5) for b in range(4)])
add(["steam-generator", "steam-generator-liquid", "steam-generator-turbine", "steam-generator-cap", "differential-generator",
     "differential-generator-liquid", "differential-generator-top", "rtg-generator", "rtg-generator-top", "solar-panel-large",
     "thorium-reactor", "thorium-reactor-top", "thorium-reactor-lights", "impact-reactor", "impact-reactor-bottom",
     "impact-reactor-plasma-0", "impact-reactor-plasma-1", "impact-reactor-plasma-2", "impact-reactor-plasma-3",
     "surge-tower", "diode", "diode-arrow"])
add(["mine-bullet", "mine-bullet-back", "missile-large", "missile-large-back", "circle-bullet", "circle-bullet-back", "naval-factory"])

# effects
add(["bullet", "bullet-back", "shell", "shell-back", "laser", "laser-end", "minelaser", "minelaser-end",
     "circle-shadow", "particle", "casing", "white", "laser-white", "laser-white-end"])

ICON_NAMES = ["turret", "production", "distribution", "liquid", "crafting", "power", "defense", "units", "effect",
              "pause", "play", "settings", "hammer", "cancel", "rotate", "trash", "info", "menu", "eye",
              "refresh", "exit", "home", "map", "item", "power", "check", "add", "mode-survival", "players", "none",
              "command-rally", "command-attack", "line", "elevation", "units", "tree", "lock"]


# ---------------------------------------------------------------- image helpers
def outline(img, spec):
    color, radius = spec
    a = np.array(img.convert("RGBA"))
    pad = radius
    h, w = a.shape[:2]
    big = np.zeros((h + pad * 2, w + pad * 2, 4), dtype=np.uint8)
    big[pad:pad + h, pad:pad + w] = a
    alpha = big[:, :, 3] > 0
    grown = np.zeros_like(alpha)
    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            if dx * dx + dy * dy <= radius * radius:
                grown |= np.roll(np.roll(alpha, dy, 0), dx, 1)
    ring = grown & ~alpha
    big[ring] = [color[0], color[1], color[2], 255]
    return Image.fromarray(big, "RGBA")


def edge_for(floor):
    sten = np.array(Image.open(find("edge-stencil")).convert("RGBA")).astype(np.float32) / 255
    base_name = floor if FLOORS[floor] == 0 else floor + "1"
    tex = np.array(Image.open(find(base_name)).convert("RGBA")).astype(np.float32) / 255
    th, tw = tex.shape[:2]
    reps = np.tile(tex, (sten.shape[0] // th + 1, sten.shape[1] // tw + 1, 1))[:sten.shape[0], :sten.shape[1]]
    out = (sten * reps * 255).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


images = {}
for name, spec in sprites.items():
    im = Image.open(find(name)).convert("RGBA")
    if spec:
        im = outline(im, spec)
    images[name] = im
for f in FLOORS:
    images[f + "-edge"] = edge_for(f)
for n in ICON_NAMES:
    p = os.path.join(ICONS, n + ".png")
    if os.path.exists(p):
        images["icon-" + n] = Image.open(p).convert("RGBA")
images["logo"] = Image.open(os.path.join(SPR, "ui", "logo.png")).convert("RGBA")
for n in ["noise", "fog"]:
    images[n] = Image.open(os.path.join(ASSETS, "sprites", n + ".png")).convert("RGBA")
images["icon-logic"] = Image.open(os.path.join(ICONS, "file-text.png")).convert("RGBA")


# ---------------------------------------------------------------- atlas packing (shelf)
def pack(imgs, page_w=2048, page_h=2048, pad=2):
    order = sorted(imgs.items(), key=lambda kv: (-kv[1].height, -kv[1].width))
    pages, regions = [], {}
    page = Image.new("RGBA", (page_w, page_h), (0, 0, 0, 0))
    x = y = shelf = 0
    for name, im in order:
        w, h = im.size
        if x + w + pad > page_w:
            x, y, shelf = 0, y + shelf + pad, 0
        if y + h + pad > page_h:
            pages.append(page)
            page = Image.new("RGBA", (page_w, page_h), (0, 0, 0, 0))
            x = y = shelf = 0
        page.alpha_composite(im, (x, y))
        regions[name] = [len(pages), x, y, w, h]
        x += w + pad
        shelf = max(shelf, h)
    # crop last page
    used_h = y + shelf + pad
    pages.append(page.crop((0, 0, page_w, min(page_h, max(used_h, 4)))))
    return pages, regions


pages, regions = pack(images)


def png_uri(im):
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


page_uris = [png_uri(p) for p in pages]

# ---------------------------------------------------------------- sounds
SOUNDS = {
    "shootDuo": "shoot/shootDuo", "shootAlpha": "shoot/shootAlpha", "shoot": "shoot/shoot",
    "shootScatter": "shoot/shootScatter", "shootArtillerySmall": "shoot/shootArtillerySmall",
    "shootArtillery": "shoot/shootArtillery", "shootLancer": "shoot/shootLancer", "chargeLancer": "charge/chargeLancer",
    "shootArc": "shoot/shootArc", "shootFlame": "shoot/shootFlame", "shootHorizon": "shoot/shootHorizon",
    "shootLaser": "shoot/shootLaser", "shootPulsar": "shoot/shootPulsar", "shootMissile": "shoot/shootMissile",
    "shootMissilePlasmaShort": "shoot/shootMissilePlasmaShort", "shootFuse": "shoot/shootFuse", "shootSpectre": "shoot/shootSpectre", "shootForeshadow": "shoot/shootForeshadow", "shootCyclone": "shoot/shootCyclone", "shootSalvo": "shoot/shootSalvo", "shootRipple": "shoot/shootRipple",
    "explosion": "explosions/explosion", "explosionCrawler": "explosions/explosionCrawler",
    "explosionArtillery": "explosions/explosionArtillery", "blockExplode": "explosions/blockExplode1",
    "blockExplodeWall": "explosions/blockExplodeWall", "unitExplode": "explosions/unitExplode1",
    "place": "block/blockPlace1", "place2": "block/blockPlace2", "break": "block/blockBreak1",
    "click": "block/click", "unitCreate": "block/unitCreate", "blockHeal": "block/blockHeal",
    "rotate": "block/blockRotate", "waveSpawn": "ui/waveSpawn", "uiButton": "ui/uiButton",
    "uiNotify": "ui/uiNotify", "padLaunch": "block/padLaunch", "padLand": "block/padLand", "uiUnlock": "ui/uiUnlock", "coreLand": "block/coreLand",
    "shootScepter": "shoot/shootScepter", "shootScepterSecondary": "shoot/shootScepterSecondary", "shootReign": "shoot/shootReign",
    "chargeVela": "charge/chargeVela", "beamPlasma": "beams/beamPlasma", "chargeCorvus": "charge/chargeCorvus",
    "shootCorvus": "shoot/shootCorvus", "shootEclipse": "shoot/shootEclipse", "shootQuad": "shoot/shootQuad",
    "explosionQuad": "explosions/explosionQuad", "shootAtrax": "shoot/shootAtrax", "shootSap": "shoot/shootSap",
    "shootArtillerySap": "shoot/shootArtillerySap", "shootArtillerySapBig": "shoot/shootArtillerySapBig",
    "shootToxopidShotgun": "shoot/shootToxopidShotgun", "walkerStep": "movement/walkerStep", "mechStepHeavy": "movement/mechStepHeavy",
    "unitCreateBig": "block/unitCreateBig",
    "shootMissileShort": "shoot/shootMissileShort", "shootMissileLong": "shoot/shootMissileLong", "shootOmura": "shoot/shootOmura",
    "shootRetusa": "shoot/shootRetusa", "shootFlamePlasma": "shoot/shootFlamePlasma", "shootMissilePlasma": "shoot/shootMissilePlasma",
    "shootNavanax": "shoot/shootNavanax", "explosionNavanax": "explosions/explosionNavanax", "explosionPlasmaSmall": "explosions/explosionPlasmaSmall",
    "beamPlasmaSmall": "beams/beamPlasmaSmall",
    "rain": "environment/rain", "wind": "environment/wind", "windHowl": "environment/windHowl",
}
sounds = {}
for k, rel in SOUNDS.items():
    p = os.path.join(ASSETS, "sounds", rel + ".ogg")
    if not os.path.exists(p):
        sys.exit("missing sound " + p)
    sounds[k] = "data:audio/ogg;base64," + base64.b64encode(open(p, "rb").read()).decode()

MUSIC = ["game1", "game2", "game3"]
boss_music = ["data:audio/ogg;base64," + base64.b64encode(open(os.path.join(ASSETS, "music", "boss1.ogg"), "rb").read()).decode()]
music = ["data:audio/ogg;base64," + base64.b64encode(open(os.path.join(ASSETS, "music", m + ".ogg"), "rb").read()).decode()
         for m in MUSIC]

# ---------------------------------------------------------------- font subset
font_uri = ""
try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
    f = TTFont(os.path.join(ASSETS, "fonts", "font.woff"))
    opts = subset.Options()
    opts.flavor = "woff2"
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=list(range(0x20, 0x7f)) + list(range(0xa0, 0x100)) + [0x2022, 0x2014, 0x2192, 0x2190, 0x2191, 0x2193, 0x00d7])
    sub.subset(f)
    buf = io.BytesIO()
    f.flavor = "woff2"
    f.save(buf)
    font_uri = "data:font/woff2;base64," + base64.b64encode(buf.getvalue()).decode()
except Exception as e:  # font is optional
    print("font subset failed:", e)

# ---------------------------------------------------------------- assemble
srcs = sorted(glob.glob(os.path.join(WEB, "src", "*.js")))
js = "\n".join(f"// ==== {os.path.basename(s)} ====\n" + open(s).read() for s in srcs)
assets_js = "const ASSETS = " + json.dumps({
    "pages": page_uris, "regions": regions, "sounds": sounds, "music": music, "bossMusic": boss_music,
}, separators=(",", ":")) + ";\n"

# ---------------------------------------------------------------- sector maps (tools/compact_maps.py), zlib + base64
import zlib
sector_files = sorted(glob.glob(os.path.join(WEB, "sectors", "*.json")))
sector_index = json.load(open(os.path.join(WEB, "sectors", "index.json")))
sector_maps = {os.path.basename(f)[:-5]: open(f).read() for f in sector_files if not f.endswith("index.json")}
# custom game maps (Maps.defaultMapNames) and BaseRegistry parts ride along in the same pack
for f in sorted(glob.glob(os.path.join(WEB, "maps", "*.json"))):
    n = os.path.basename(f)[:-5]
    if n == "index": continue
    sector_maps["baseparts" if n == "baseparts" else "map:" + n] = open(f).read()
map_index = json.load(open(os.path.join(WEB, "maps", "index.json")))
assets_js += "const MAP_INDEX = " + json.dumps(map_index, separators=(",", ":")) + ";\n"
assets_js += "const SECTOR_INDEX = " + json.dumps(sector_index, separators=(",", ":")) + ";\n"
assets_js += "const SECTOR_PACK = '" + base64.b64encode(zlib.compress(json.dumps(sector_maps, separators=(",", ":")).encode(), 9)).decode() + "';\n"

tpl = open(os.path.join(WEB, "template.html")).read()
html = (tpl.replace("/*__FONT__*/", font_uri)
           .replace("/*__ASSETS__*/", assets_js)
           .replace("/*__GAME__*/", js))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w").write(html)
print(f"wrote {OUT}: {len(html)/1e6:.2f} MB, {len(regions)} regions on {len(pages)} page(s), "
      f"{len(sounds)} sounds, {len(music)} music tracks")
