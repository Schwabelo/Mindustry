// Power graphs (PowerGraph.java): producers, consumers, batteries; connected by node lasers and adjacency.

const Power = {
  graphs: [],
  dirty: true,

  isPower(b) { return b && !b.dead && b.power && b.block.cls !== 'ConstructBuild'; },

  rebuild() {
    this.dirty = false;
    const all = Game.buildings.filter(b => this.isPower(b));
    for (const b of all) b.power.graph = null;
    this.graphs = [];
    for (const start of all) {
      if (start.power.graph) continue;
      const g = { id: this.graphs.length, members: [], producers: [], consumers: [], batteries: [], satisfaction: 0, produced: 0, needed: 0, stored: 0, capacity: 0 };
      const stack = [start];
      start.power.graph = g;
      while (stack.length) {
        const b = stack.pop();
        g.members.push(b);
        const neighbors = [...b.power.links];
        // adjacency conducts power, except between two pure consumers (BuildingComp.getPowerConnections)
        const pure = x => x.block.consumesPower > 0 && !x.block.outputsPower;
        for (const p of b.proximity) if (this.isPower(p) && !(pure(b) && pure(p))) neighbors.push(p);
        for (const n of neighbors) {
          if (this.isPower(n) && !n.power.graph) { n.power.graph = g; stack.push(n); }
        }
      }
      for (const m of g.members) {
        if (m.block.outputsPower) g.producers.push(m);
        if (m.block.consumesPower) g.consumers.push(m);
        if (m.block.cls === 'Battery') g.batteries.push(m);
      }
      this.graphs.push(g);
    }
  },

  update() {
    if (this.dirty) this.rebuild();
    for (const g of this.graphs) {
      let produced = 0, needed = 0;
      for (const p of g.producers) produced += p.powerOut * Time.delta;
      for (const c of g.consumers) if (c.shouldConsume()) needed += c.block.consumesPower * Time.delta;
      let stored = 0, cap = 0;
      for (const b of g.batteries) { stored += b.power.stored; cap += b.block.capacity; }
      let sat;
      if (needed <= 0) sat = 1;
      else if (produced >= needed) sat = 1;
      else {
        const use = Math.min(stored, needed - produced);
        if (use > 0 && stored > 0) for (const b of g.batteries) b.power.stored -= use * (b.power.stored / stored);
        sat = Mathf.clamp((produced + use) / needed);
        stored -= use;
      }
      if (produced > needed && cap > stored) {
        const extra = Math.min(produced - needed, cap - stored);
        const free = cap - stored;
        for (const b of g.batteries) b.power.stored += extra * ((b.block.capacity - b.power.stored) / free);
        stored += extra;
      }
      g.satisfaction = sat; g.produced = produced / Math.max(Time.delta, 1e-6); g.needed = needed / Math.max(Time.delta, 1e-6);
      g.stored = stored; g.capacity = cap;
      for (const c of g.consumers) c.power.satisfaction = c.shouldConsume() ? sat : (needed > 0 ? sat : 1);
      for (const m of g.members) m.power.status = cap > 0 ? stored / cap : sat;
    }
  },

  inLaserRange(node, other) {
    const r = node.block.laserRange * TS;
    return circleRect(node.x, node.y, r, other);
  },

  linked(a, b) { return a.power.links.includes(b); },

  link(a, b) {
    if (a === b || this.linked(a, b)) return false;
    a.power.links.push(b); b.power.links.push(a);
    this.dirty = true;
    return true;
  },
  unlink(a, b) {
    a.power.links = a.power.links.filter(x => x !== b);
    b.power.links = b.power.links.filter(x => x !== a);
    this.dirty = true;
  },

  nodeLinkCount(n) { return n.power.links.length; },

  // PowerNode.insulated: a laser can't pass insulated blocks (plastanium walls)
  insulated(a, b) {
    let x0 = a.tx, y0 = a.ty;
    const x1 = b.tx, y1 = b.ty, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      const o = World.buildAt(x0, y0);
      if (o && o.block.insulated) return true;
      if (x0 === x1 && y0 === y1) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  },

  canLink(node, other) {
    if (!this.isPower(other) || other === node || other.team !== node.team) return false;
    if (this.insulated(node, other)) return false;
    if (!this.inLaserRange(node, other) && !(other.block.cls === 'PowerNode' && this.inLaserRange(other, node))) return false;
    if (node.power.links.length >= node.block.maxNodes) return false;
    if (other.block.cls === 'PowerNode' && other.power.links.length >= other.block.maxNodes) return false;
    return true;
  },

  toggleLink(node, other) {
    if (this.linked(node, other)) { this.unlink(node, other); return 'unlinked'; }
    if (this.canLink(node, other)) { this.link(node, other); return 'linked'; }
    return null;
  },

  // called when a node is placed: link to power buildings in range (one per graph), like PowerNode.getPotentialLinks
  autoLinkNode(node) {
    if (this.dirty) this.rebuild();
    const own = new Set();
    for (const p of node.proximity) if (this.isPower(p) && p.power.graph) own.add(p.power.graph);
    const cands = Game.teamBuildings(node.team).filter(b => b !== node && this.isPower(b) && this.inLaserRange(node, b) &&
      !node.proximity.includes(b) && !(b.block.cls === 'PowerNode' && b.power.links.length >= b.block.maxNodes) && !this.insulated(node, b));
    cands.sort((a, b) => {
      const an = a.block.cls === 'PowerNode' ? 0 : 1, bn = b.block.cls === 'PowerNode' ? 0 : 1;
      if (an !== bn) return an - bn;
      return Mathf.dst2(node.x, node.y, a.x, a.y) - Mathf.dst2(node.x, node.y, b.x, b.y);
    });
    const graphs = new Set(own);
    for (const c of cands) {
      if (node.power.links.length >= node.block.maxNodes) break;
      const g = c.power.graph;
      if (g && graphs.has(g)) continue;
      this.link(node, c);
      if (g) graphs.add(g);
    }
    this.dirty = true;
  },

  // called when a non-node power building is placed (PowerNode.getNodeLinks): every node in range whose network isn't
  // already connected (through this block or its neighbours) links to it, nearest first, one per network
  autoLinkConsumer(b) {
    if (this.dirty) this.rebuild();
    const graphs = new Set();
    if (b.power.graph) graphs.add(b.power.graph);
    for (const p of b.proximity) if (this.isPower(p) && p.power.graph) graphs.add(p.power.graph);
    const nodes = Game.teamBuildings(b.team).filter(n => n.block.cls === 'PowerNode' && !n.dead && this.inLaserRange(n, b) &&
      n.power.links.length < n.block.maxNodes && !b.proximity.includes(n) && !this.insulated(n, b));
    nodes.sort((a, c) => Mathf.dst2(b.x, b.y, a.x, a.y) - Mathf.dst2(b.x, b.y, c.x, c.y));
    for (const n of nodes) {
      if (n.power.graph && graphs.has(n.power.graph)) continue;
      this.link(n, b);
      if (n.power.graph) graphs.add(n.power.graph);
    }
  },

  removeBuilding(b) {
    if (!b.power) return;
    for (const o of [...b.power.links]) this.unlink(b, o);
    this.dirty = true;
  },

  drawLasers() {
    const v = Render.view();
    for (const b of Game.buildings) {
      if (b.block.cls !== 'PowerNode' || b.dead) continue;
      for (const o of b.power.links) {
        // draw each pair once (from the node with the lower id, or always if other is not a node)
        if (o.block.cls === 'PowerNode' && o.id < b.id) continue;
        if (Math.max(b.x, o.x) < v.x1 - 20 || Math.min(b.x, o.x) > v.x2 + 20 || Math.max(b.y, o.y) < v.y1 - 20 || Math.min(b.y, o.y) > v.y2 + 20) continue;
        const sat = b.power.graph ? b.power.graph.satisfaction : 0;
        const c = lerpCol(Pal.white, Pal.powerLight, (1 - sat) * 0.86 + Mathf.absin(Time.time, 3, 0.1));
        const ang = Angles.angle(b.x, b.y, o.x, o.y);
        const s1 = b.block.size * TS / 2 - 1.5, s2 = o.block.size * TS / 2 - 1.5;
        const x1 = b.x + Angles.trnsx(ang, s1), y1 = b.y + Angles.trnsy(ang, s1);
        const x2 = o.x - Angles.trnsx(ang, s2), y2 = o.y - Angles.trnsy(ang, s2);
        Draw.setAlpha(0.8);
        Draw.laser(x1, y1, x2, y2, 0.3, c);
        Draw.setAlpha(1);
      }
    }
  },
};
