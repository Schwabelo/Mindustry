#!/usr/bin/env python3
"""Converts sector maps exported from Mindustry (tools/MapExport.java) into compact Lite sector files.

usage: compact_maps.py <export dir with <sector>.json + techtree.json> <lite block names json>
writes web/sectors/<sector>.json and web/sectors/index.json
"""
import json, os, re, sys, collections, glob
sys.path.insert(0, os.path.dirname(__file__))
from mapjson import load

SRC, NAMES = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'sectors')
lite = json.load(open(NAMES))
LITE_BLOCKS = {b.split(':')[0] for b in lite['blocks']} | {'core-shard', 'core-foundation', 'core-nucleus'}
LITE_UNITS = set(lite['units'])
tree = json.load(open(os.path.join(SRC, 'techtree.json')))
SECTORS = [n for n in tree if n['type'] == 'sector']

FLOORS = {'deep-water', 'shallow-water', 'tainted-water', 'deep-tainted-water', 'darksand-tainted-water', 'sand-water', 'darksand-water',
          'tar', 'stone', 'crater-stone', 'char', 'basalt', 'hotrock', 'magmarock', 'sand-floor', 'darksand', 'dirt', 'dacite', 'grass',
          'salt', 'snow', 'ice', 'ice-snow', 'shale', 'moss', 'core-zone', 'spore-moss', 'metal-floor', 'metal-floor-damaged',
          'metal-floor-2', 'metal-floor-3', 'metal-floor-4', 'metal-floor-5'} | {f'dark-panel-{i}' for i in range(1, 7)}
def floor_name(n):
    if n in FLOORS: return n
    if n.startswith('metal-tiles'): return 'metal-floor'  # autotiled floors: plain metal floor in Lite
    return None
WALLS = {'stone-wall', 'dune-wall', 'sand-wall', 'snow-wall', 'ice-wall', 'dirt-wall', 'shale-wall', 'salt-wall', 'red-ice-wall',
         'red-stone-wall', 'spore-wall', 'dark-metal', 'dacite-wall', 'carbon-wall', 'crystalline-stone-wall', 'metal-wall-1',
         'metal-wall-2', 'metal-wall-3', 'spore-pine', 'snow-pine', 'white-tree', 'white-tree-dead'}
BOULDERS = {'boulder', 'sand-boulder', 'snow-boulder', 'basalt-boulder', 'shale-boulder', 'dacite-boulder', 'spore-cluster'}
ORES = {'ore-copper', 'ore-lead', 'ore-coal', 'ore-titanium', 'ore-scrap', 'ore-thorium'}

def rle(arr):
    out, prev, n = [], None, 0
    for v in arr + [None]:
        if v == prev: n += 1; continue
        if prev is not None: out.append(str(prev) if n == 1 else f'{prev}*{n}')
        prev, n = v, 1
    return ','.join(out)

def unpos(p): return [p >> 16, p & 0xFFFF]

BUNDLE = {}
for line in open(os.path.join(os.path.dirname(__file__), '..', '..', 'core', 'assets', 'bundles', 'bundle.properties'), encoding='utf-8'):
    if line.startswith('sector.') and ' = ' in line:
        k, v = line.rstrip('\n').split(' = ', 1)
        BUNDLE[k] = re.sub(r'\[[a-z#0-9]*\]', '', v.replace('\\n', '\n'))
def convert(name, d, outdir):
    """compacts one exported map; returns (data, resources)"""
    W, H, N = d['w'], d['h'], d['w'] * d['h']
    fl = [d['floorPal'][int(v)] for v in d['floor'].rstrip(',').split(',')]
    ov = [d['orePal'][int(v)] for v in d['ore'].rstrip(',').split(',')]
    bpal = d['blockPal']
    # older exports put "air" in front of the palette after numbering tiles, so indices point one entry too early
    shift = 1 if bpal.count('air') > 1 else 0
    bl = [bpal[int(v) + shift] for v in d['block'].rstrip(',').split(',')]
    # tiles under buildings were written as index 0: clear them
    SIZES = dict(lite['sizes'], **{'world-processor': 1, 'advanced-launch-pad': 4, 'repair-turret': 2, 'interplanetary-accelerator': 7,
                                     'landing-pad': 4, 'thruster': 4})
    for t, blk, x, y, r, cfg in d['builds']:
        sz = SIZES.get(blk, 1); off = (sz - 1) // 2
        for dy in range(sz):
            for dx in range(sz):
                tx, ty = x - off + dx, y - off + dy
                if 0 <= tx < W and 0 <= ty < H: bl[ty * W + tx] = 'air'
    floor, ore, wall, boulder = [], [], [], []
    for i in range(N):
        f = floor_name(fl[i]) or 'stone'
        if fl[i] != f and not fl[i].startswith('metal-tiles'): unknown['floor:' + fl[i]] += 1
        o = ov[i]
        oo = ''
        if o in ORES: oo = o[4:]
        elif floor_name(o): f = floor_name(o)  # floors painted as overlays replace the floor
        elif o not in ('air', 'spawn', 'pebbles', 'tendrils', 'rune-overlay'): unknown['overlay:' + o] += 1
        b = bl[i]
        ww, bb = '', ''
        if b in WALLS: ww = b
        elif b in BOULDERS: bb = b
        elif b != 'air': unknown['block:' + b] += 1; ww = 'stone-wall'
        floor.append(f); ore.append(oo); wall.append(ww); boulder.append(bb)
    pals = {}
    def enc(key, arr, keep_empty=True):
        pal = sorted(set(arr) - {''})
        if keep_empty: pal = [''] + pal
        pals[key] = pal
        ix = {n: i for i, n in enumerate(pal)}
        return rle([ix[v] for v in arr])
    data = {'name': name, 'w': W, 'h': H}
    data['floor'] = enc('floor', floor, False)
    data['ore'] = enc('ore', ore); data['wall'] = enc('wall', wall); data['boulder'] = enc('boulder', boulder)
    data['pal'] = pals
    teams = {'sharded': 0, 'crux': 1, 'derelict': 2}
    builds = []
    for t, blk, x, y, r, cfg in d['builds']:
        if blk not in LITE_BLOCKS: unknown['build:' + blk] += 1; continue
        if isinstance(cfg, str) and cfg not in LITE_UNITS and not cfg.replace('-', '').isalpha(): cfg = None
        builds.append([teams.get(t, 1), blk, x, y, r] + ([cfg] if cfg is not None else []))
    data['builds'] = builds
    data['spawns'] = d['spawns']
    groups = []
    for g in d['groups']:
        if g['type'] not in LITE_UNITS: unknown['unit:' + g['type']] += 1; continue
        o = {'unit': g['type']}
        for k, lk in (('begin', 'begin'), ('end', 'end'), ('spacing', 'spacing'), ('max', 'max'), ('scaling', 'unitScaling'),
                      ('amount', 'unitAmount'), ('shields', 'shields'), ('shieldScaling', 'shieldScaling')):
            if k in g: o[lk] = g[k]
        if o.get('end', 0) >= 2**31 - 1: del o['end']
        if g.get('effect') == 'boss': o['boss'] = True
        if 'spawn' in g and g['spawn'] != -1: o['spawn'] = unpos(g['spawn'])
        groups.append(o)
    data['groups'] = groups
    data['winWave'] = d['winWave'] if d['winWave'] > 0 else 0
    data['attack'] = d['attack']
    data['waveSpacing'] = d['waveSpacing']
    data['initialWave'] = d['initialWaveSpacing'] if d['initialWaveSpacing'] > 0 else d['waveSpacing'] * 2
    data['loadout'] = d['loadout']
    data['weather'] = d['weather']
    data['difficulty'] = d['difficulty']
    json.dump(data, open(os.path.join(outdir, name + '.json'), 'w'), separators=(',', ':'))
    res = sorted({o for o in ore if o} | ({'sand'} if any(f in ('sand-floor', 'darksand') for f in floor) else set()))
    print(f"{name:22s} {os.path.getsize(os.path.join(outdir, name + '.json')) // 1024} KB, {len(builds)} builds, {len(groups)} groups")
    return data, res

index, unknown = [], collections.Counter()
for sec in SECTORS:
    name = sec['name']
    path = os.path.join(SRC, name + '.json')
    if not os.path.exists(path): print('no map for', name); continue
    d = load(path)
    data, res = convert(name, d, OUT)
    index.append({'name': name, 'title': BUNDLE.get(f'sector.{name}.name', name), 'desc': BUNDLE.get(f'sector.{name}.description', ''),
                  'parent': sec['parent'], 'difficulty': d['difficulty'], 'winWave': data['winWave'], 'attack': d['attack'],
                  'w': data['w'], 'h': data['h'], 'resources': res,
                  'research': [o[9:] for o in sec['obj'] if o.startswith('research:')],
                  'sectors': [o[7:] for o in sec['obj'] if o.startswith('sector:')]})
if index: json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)

# ---------------------------------------------------------------- custom game maps (Maps.defaultMapNames) -> web/maps
MAPS_OUT = os.path.join(os.path.dirname(__file__), '..', 'maps')
os.makedirs(MAPS_OUT, exist_ok=True)
ERELIR_ITEMS = {'beryllium', 'tungsten', 'oxide', 'carbide'}
mindex = []
for path in sorted(glob.glob(os.path.join(SRC, 'map-*.json'))):
    d = load(path)
    if any(n in ERELIR_ITEMS for n, a in d['loadout']): print('skip (Erekir)', d['name']); continue
    name = d['name'][4:]
    data, res = convert(name, d, MAPS_OUT)
    mindex.append({'name': name, 'title': d['title'], 'author': d.get('author', ''), 'desc': d.get('desc', ''), 'w': data['w'], 'h': data['h'],
                   'teams': d['teams'], 'spawns': d['mapSpawns'], 'resources': res, 'waves': d['waves'], 'attack': d['attack']})
if mindex: json.dump(mindex, open(os.path.join(MAPS_OUT, 'index.json'), 'w'), indent=1)

# ---------------------------------------------------------------- BaseRegistry parts for the enemy base builder AI
bp = os.path.join(SRC, 'baseparts.json')
if os.path.exists(bp):
    src = json.load(open(bp))
    def keep(part):
        tiles = [t for t in part['tiles'] if t[0] in LITE_BLOCKS]
        if len(tiles) < len(part['tiles']): unknown['basepart:' + ','.join(sorted({t[0] for t in part['tiles'] if t[0] not in LITE_BLOCKS}))] += 1; return None
        return {'w': part['w'], 'h': part['h'], 'cx': part['cx'], 'cy': part['cy'], 'tier': round(part['tier'], 1), 'core': part['core'], 'req': part['req'],
                'tiles': [t[:4] + ([t[4]] if t[4] is not None else []) for t in tiles]}
    out = {'cores': [p for p in map(keep, src['cores']) if p], 'parts': [p for p in map(keep, src['parts']) if p],
           'req': {k: [p for p in map(keep, v) if p] for k, v in src['req'].items()}}
    out['req'] = {k: v for k, v in out['req'].items() if v}
    json.dump(out, open(os.path.join(MAPS_OUT, 'baseparts.json'), 'w'), separators=(',', ':'))
    print('base parts:', len(out['cores']), 'cores,', len(out['parts']), 'free,', {k: len(v) for k, v in out['req'].items()})
print('unknown:', unknown.most_common())
