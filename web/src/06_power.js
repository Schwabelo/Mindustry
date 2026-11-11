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

  canLink(node, other) {
    if (!this.isPower(other) || other === node || other.team !== node.team) return false;
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
      !node.proximity.includes(b) && !(b.block.cls === 'PowerNode' && b.power.links.length >= b.block.maxNodes));
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

  // called when a non-node power building is placed: nearest node in range links to it (PowerNode.getNodeLinks)
  autoLinkConsumer(b) {
    if (this.dirty) this.rebuild();
    const g = b.power.graph;
    const nodes = Game.teamBuildings(b.team).filter(n => n.block.cls === 'PowerNode' && !n.dead && n.power.graph !== g &&
      this.inLaserRange(n, b) && n.power.links.length < n.block.maxNodes);
    nodes.sort((a, c) => Mathf.dst2(b.x, b.y, a.x, a.y) - Mathf.dst2(b.x, b.y, c.x, c.y));
    if (nodes.length) this.link(nodes[0], b);
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
