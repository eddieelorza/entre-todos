/* ==========================================================================
   world/world-data.js — El modelo del mundo: del grafo a posiciones en el espacio.

   Módulo de lectura, sin DOM ni Three: traduce lo que ya sabe el MVP
   (State.graph, community.buildings/streets/households, Trust, Places,
   Resolver) a un modelo plano que la escena dibuja. Corre también en Node
   (scripts/test-world.mjs).

   Cada número de aquí representa un concepto del producto:
     geografía            → phys    posición física (offset en metros, comprimida)
     edificio             → home    piso declarado dentro de su edificio
     distancia entre nodos→ social  qué tan cerca está alguien de ti en confianza
     gravedad             → plan()  la necesidad reorganiza a quienes pueden ayudar

   API:
     WorldData.build()            { buildings, streets, trees, people, relations, circles, bounds }
     WorldData.plan(text|situation, model)   guion espacial de una situación (Resolver.resolve)
     WorldData.closer(model, a, b)           tras una ayuda completada, a y b se acercan
   ========================================================================== */

const WorldData = (() => {
  const S = 0.5;            /* compresión de distancias: 1 m de plano = 0.5 u (los edificios conservan su tamaño) */
  const FLOOR_H = 3.2;
  const SKY_Y = 24;         /* altura del plano de la constelación */

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  const hasTrust = () => typeof Trust !== 'undefined' && typeof Trust.relations === 'function';

  /* ---- Lugar ---- */
  function heightOf(b) {
    if (b.kind === 'park' || b.kind === 'court') return 0.3;
    return (b.floors || 1) * FLOOR_H;
  }

  function buildingModel(b) {
    const flat = b.kind === 'park' || b.kind === 'court';
    const k = flat ? 0.62 : 1;
    return {
      id: b.id, label: b.label, kind: b.kind, zone: b.zone || b.id, floors: b.floors || 1,
      x: b.offset.x * S, z: -b.offset.y * S, w: (b.w || 10) * k, d: (b.d || 10) * k, h: heightOf(b),
      enterable: b.kind === 'tower' || b.kind === 'hall',
      amenities: typeof Places !== 'undefined' ? Places.forBuilding(b.id) : (b.amenities || [])
    };
  }

  /* Dónde flota una amenidad respecto a su edificio (mismo criterio que twin.js). */
  function amenityPos(a, b, i = 0, n = 1) {
    const side = { front: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] }[a.side || 'front'];
    if (a.level === 'outside') return { x: b.x + side[0] * (b.w / 2 + 5), y: 2.2, z: b.z + side[1] * (b.d / 2 + 5) };
    if (a.level === 'roof') return { x: b.x, y: b.h + 2.4, z: b.z };
    if (a.level === 'all') return { x: b.x - b.w * 0.28, y: b.h * 0.5, z: b.z };
    if (a.level === -1) return { x: b.x + b.w * 0.3, y: 1.2, z: b.z + b.d / 2 + 4 };
    const lvl = clamp(Number(a.level) || 0, 0, b.floors - 1);
    /* en la fachada que mira a la cámara, repartidas a lo ancho para que sus nombres no choquen */
    return { x: b.x + (n > 1 ? (i / (n - 1) - 0.5) * b.w * 0.8 : 0), y: lvl * FLOOR_H + FLOOR_H * 0.5, z: b.z + b.d / 2 + 1.2 };
  }

  function treesFor(buildings, streets) {
    const out = [];
    const blocked = (x, z) => buildings.some(b => b.kind !== 'park' && Math.abs(x - b.x) < b.w / 2 + 4 && Math.abs(z - b.z) < b.d / 2 + 4);
    streets.forEach((line, li) => {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const n = Math.floor(len / 26);
        for (let k = 1; k <= n; k++) {
          const t = k / (n + 1);
          const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
          const sideSign = (k + li) % 2 ? 1 : -1;
          const x = lerp(a.x, b.x, t) + nx * 7 * sideSign, z = lerp(a.z, b.z, t) + nz * 7 * sideSign;
          if (!blocked(x, z)) out.push({ x, z, s: 0.8 + hash(`t${li}-${i}-${k}`) * 0.6 });
        }
      }
    });
    const park = buildings.find(b => b.kind === 'park');
    if (park) for (let i = 0; i < 9; i++) {
      const x = park.x + (hash(`p${i}x`) - 0.5) * park.w * 0.9, z = park.z + (hash(`p${i}z`) - 0.5) * park.d * 0.9;
      out.push({ x, z, s: 0.9 + hash(`p${i}s`) * 0.7 });
    }
    return out;
  }

  /* ---- Personas ---- */
  function floorOf(entity, b) {
    const m = /piso\s*(\d+)/i.exec(entity.place || '');
    if (m) return clamp(parseInt(m[1], 10), 0, b.floors - 1);
    return clamp(Math.floor(hash(entity.id) * b.floors), 0, b.floors - 1);
  }

  function personModel(entity, kind, byBuilding, index) {
    const b = byBuilding[entity.building];
    const off = entity.offset || { x: 0, y: 0 };
    const base = b || { x: off.x * S, z: -off.y * S, w: 8, d: 8, h: 4, floors: 1 };
    /* Sobre el techo, en un pequeño racimo: nunca señala un departamento. */
    const shared = b && b.kind === 'tower';
    const a = shared ? 0.6 + index * 2.399963 : hash(entity.id) * Math.PI * 2, r = shared ? 4 + Math.sqrt(index) * 5.2 : 0.5;
    const floor = b ? floorOf(entity, b) : 0;
    const phys = { x: base.x + Math.cos(a) * r, y: base.h + 8 + (shared ? (index % 2) * 3.4 : 0), z: base.z + Math.sin(a) * r };
    const home = { x: base.x + (((index * 2 + floor) % 5) / 4 - 0.5) * base.w * 0.74, y: floor * FLOOR_H + FLOOR_H * 0.55, z: base.z - base.d * 0.12 + (hash(entity.id + 'hz') - 0.5) * base.d * 0.3 };
    return {
      id: entity.id, name: entity.name, initials: entity.initials || entity.name.charAt(0), tone: entity.tone || 3,
      kind, building: entity.building || null, buildingLabel: b ? b.label : '', floor, place: entity.place || '',
      caps: (entity.capabilities || []).map((c, i) => ({ id: c.id || `${entity.id}-cap-${i}`, kind: c.kind, label: c.label, tags: c.tags || [] })),
      phys, home, social: { x: phys.x, y: SKY_Y, z: phys.z }, tier: 'far', strength: 0, via: null
    };
  }

  /* ---- Relaciones ---- */
  function relationsModel(ids) {
    if (!hasTrust()) return [];
    const me = State.user().id;
    const out = [];
    Trust.relations().forEach(r => {
      if (!ids.has(r.a) || !ids.has(r.b)) return;
      const strength = Trust.strengthOf(r);
      out.push({
        a: r.a, b: r.b, strength, interactions: r.interactions,
        /* Nueva vs frecuente: nunca un número en pantalla, solo cómo se ve el lazo. */
        stage: r.interactions >= 3 ? 'frequent' : r.interactions >= 2 ? 'growing' : 'new',
        mine: r.a === me || r.b === me
      });
    });
    return out;
  }

  /* Posiciones sociales: tú al centro; la confianza decide la distancia, la geografía conserva el rumbo. */
  function layoutSocial(people, relations) {
    const me = people.find(p => p.kind === 'user');
    if (!me) return;
    const byId = Object.fromEntries(people.map(p => [p.id, p]));
    const explicit = hasTrust() ? Trust.circles().filter(c => c.kind === 'explicit' && !c.sensitive && c.id !== 'vecinos') : [];
    const pts = people.map(p => {
      let tier = 'far', radius = 112;
      if (p.kind === 'user') { tier = 'me'; radius = 0; }
      else if (p.kind === 'household') { tier = 'new'; radius = 140 + hash(p.id + 'ring') * 22; }
      else if (hasTrust()) {
        const s = Trust.strength(p.id);
        const v = s ? null : Trust.via(p.id);
        p.strength = s;
        p.via = v ? v.personId : null;
        if (s > 0) { tier = 'direct'; radius = lerp(64, 26, clamp(s / 0.75, 0, 1)); }
        else if (v) { tier = 'via'; radius = 82; }
        else if (explicit.some(c => (c.members || []).includes(p.id))) { tier = 'circle'; radius = 100; }
      }
      p.tier = tier;
      let dx = p.phys.x - me.phys.x, dz = p.phys.z - me.phys.z;
      if (Math.hypot(dx, dz) < 12) { const a = hash(p.id + 'bearing') * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); }
      const a = Math.atan2(dz, dx);
      return { p, radius, x: Math.cos(a) * radius, z: Math.sin(a) * radius };
    });
    const idx = Object.fromEntries(pts.map((q, i) => [q.p.id, i]));
    for (let it = 0; it < 220; it++) {
      /* lazos entre terceros: quienes se ayudan entre sí se acercan entre sí */
      relations.forEach(r => {
        if (r.mine) return;
        const a = pts[idx[r.a]], b = pts[idx[r.b]];
        if (!a || !b) return;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.01;
        const rest = lerp(46, 22, r.strength);
        const f = (d - rest) * 0.012 * (0.4 + r.strength);
        a.x += dx / d * f * d * 0.5; a.z += dz / d * f * d * 0.5;
        b.x -= dx / d * f * d * 0.5; b.z -= dz / d * f * d * 0.5;
      });
      /* cada quien vuelve a su distancia de confianza contigo */
      pts.forEach(q => {
        if (!q.radius) { q.x = 0; q.z = 0; return; }
        const d = Math.hypot(q.x, q.z) || 0.01;
        const k = (q.radius - d) * 0.22;
        q.x += q.x / d * k; q.z += q.z / d * k;
      });
      /* nadie se encima */
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.01;
        const min = a.p.kind === 'household' && b.p.kind === 'household' ? 15 : 19;
        if (d >= min) continue;
        const push = (min - d) / 2, ux = dx / d, uz = dz / d;
        if (a.radius) { a.x -= ux * push; a.z -= uz * push; }
        if (b.radius) { b.x += ux * push; b.z += uz * push; }
      }
    }
    pts.forEach(q => {
      const depth = q.p.kind === 'household' ? -5 : (hash(q.p.id + 'y') - 0.5) * 9;
      q.p.social = { x: me.phys.x + q.x, y: SKY_Y + depth + (q.p.kind === 'user' ? 2 : 0), z: me.phys.z + q.z };
    });
    return byId;
  }

  function circlesModel(ids) {
    if (!hasTrust()) return [];
    return Trust.circles().filter(c => (c.members || []).some(id => ids.has(id))).map(c => ({
      id: c.id, label: c.label, kind: c.kind, sensitive: Boolean(c.sensitive), members: (c.members || []).filter(id => ids.has(id))
    }));
  }

  function build() {
    const c = State.community();
    const g = State.graph();
    const buildings = (c.buildings || []).map(buildingModel);
    const byBuilding = Object.fromEntries(buildings.map(b => [b.id, b]));
    buildings.forEach(b => { const inside = b.amenities.filter(a => typeof a.level === 'number' && a.level >= 0); b.amenities.forEach(a => { a.pos = amenityPos(a, b, inside.indexOf(a), inside.length); }); });
    const streets = (c.streets || []).map(line => line.map(p => ({ x: p.x * S, z: -p.y * S })));
    const entities = [{ e: g.user, kind: 'user' }]
      .concat(g.people.map(p => ({ e: p, kind: 'person' })))
      .concat((c.households || []).map(h => ({ e: h, kind: 'household' })));
    const perBuilding = {};
    const people = entities.map(x => {
      const n = perBuilding[x.e.building] = (perBuilding[x.e.building] || 0) + 1;
      return personModel(x.e, x.kind, byBuilding, n - 1);
    });
    const ids = new Set(people.map(p => p.id));
    const relations = relationsModel(ids);
    layoutSocial(people, relations);
    const xs = buildings.map(b => b.x), zs = buildings.map(b => b.z);
    return {
      community: { id: c.id, name: c.name, members: c.members, examples: c.examples || [] },
      geo: buildings.length > 0,
      buildings, streets, trees: treesFor(buildings, streets), people, relations, circles: circlesModel(ids),
      me: people.find(p => p.kind === 'user'),
      bounds: { minX: Math.min(...xs, -60), maxX: Math.max(...xs, 60), minZ: Math.min(...zs, -60), maxZ: Math.max(...zs, 60) },
      skyY: SKY_Y, floorH: FLOOR_H
    };
  }

  /* ---- La necesidad crea gravedad ---- */
  function situationFrom(input) {
    if (input && typeof input === 'object') return input;
    const understanding = Resolver.understandSituation(String(input || ''));
    const needs = Resolver.discoverNeeds(understanding);
    return { id: 'preview', text: String(input || ''), understanding, needs, excluded: [] };
  }

  function plan(input, model) {
    const situation = situationFrom(input);
    const u = situation.understanding;
    const result = Resolver.resolve(situation, State.graph());
    const me = model.me;
    const G = { x: me.social.x, y: model.skyY + 3, z: me.social.z };   /* centro de gravedad: donde estás tú */
    const byId = Object.fromEntries(model.people.map(p => [p.id, p]));
    const story = { situation, understanding: u, result, center: G, icon: u.icon || '🤝', needs: [], steps: [], places: [], targets: {}, matched: new Set(), alternates: new Set(), circles: [], coverage: { covered: 0, total: 0 } };

    if (u.kind !== 'need') {
      const opps = result.opportunities || [];
      opps.forEach((o, i) => {
        const p = byId[o.personId]; if (!p) return;
        const a = -Math.PI / 2 + (i / Math.max(1, opps.length)) * Math.PI * 2;
        const need = { id: `open-${o.openId}`, label: o.title, optional: false, covered: true, pos: { x: G.x + Math.cos(a) * 17, y: G.y, z: G.z + Math.sin(a) * 17 } };
        story.needs.push(need);
        story.matched.add(p.id);
        story.targets[p.id] = { x: G.x + Math.cos(a) * 48, y: G.y, z: G.z + Math.sin(a) * 48 };
        story.steps.push({ need, person: p, cap: { id: need.id, kind: 'time', label: o.title }, capPos: need.pos, because: o.text, fromUser: true });
      });
      story.targets[me.id] = { x: G.x, y: G.y + 1, z: G.z };
      story.coverage = { covered: opps.length, total: opps.length };
      return story;
    }

    const needs = result.needs || [];
    const stepFor = {}, altFor = {}, placeFor = {};
    (result.solutions || []).forEach(sol => {
      sol.steps.concat(sol.extras || []).forEach(s => { if (!stepFor[s.needId]) { stepFor[s.needId] = s; altFor[s.needId] = s.alternatives || []; } });
      (sol.placeSteps || []).forEach(ps => { if (!placeFor[ps.needId]) placeFor[ps.needId] = ps; });
    });
    const R = needs.length <= 1 ? 0 : clamp(16 + needs.length * 2.6, 22, 36);
    /* El arco de necesidades se abre hacia el fondo; tú quedas al frente, del lado de la cámara. */
    needs.forEach((n, i) => {
      const a = needs.length === 1 ? -Math.PI / 2 : lerp(-Math.PI * 1.12, Math.PI * 0.12, i / (needs.length - 1));
      const step = stepFor[n.id], ps = placeFor[n.id];
      const need = {
        id: `need-${n.id}`, needId: n.id, label: (u.lang === 'en' && n.labelEn) || n.label, optional: n.priority === 'optional',
        covered: Boolean(step || (ps && ps.covers)), pos: { x: G.x + Math.cos(a) * R, y: G.y + (i % 2 ? 1.2 : -0.6), z: G.z + Math.sin(a) * R }, angle: a
      };
      story.needs.push(need);
      if (step && byId[step.personId]) {
        const p = byId[step.personId];
        const src = p.caps.find(c => c.id === step.capabilityId) || { id: step.capabilityId, kind: 'object', label: step.capabilityId };
        story.matched.add(p.id);
        story.steps.push({ need, person: p, cap: src, because: step.because, alternatives: (altFor[n.id] || []).filter(id => byId[id]) });
        (altFor[n.id] || []).forEach(id => story.alternates.add(id));
      }
      if (ps) story.places.push({ need, buildingId: ps.placeId, amenityId: ps.amenityId, icon: ps.icon, label: ps.label, buildingLabel: ps.buildingLabel, because: ps.because, covers: ps.covers });
    });
    /* Cada persona converge hacia el promedio de lo que cubre, por fuera del arco. */
    const per = new Map();
    story.steps.forEach(s => (per.get(s.person) || per.set(s.person, []).get(s.person)).push(s.need));
    const seats = [];
    per.forEach((list, p) => {
      const a = list.length === 1 && R === 0 ? -Math.PI / 2 : Math.atan2(list.reduce((t, n) => t + n.pos.z, 0) / list.length - G.z, list.reduce((t, n) => t + n.pos.x, 0) / list.length - G.x);
      /* el arco va de -1.2π a 0.2π; atan2 devuelve el lado izquierdo como ángulos positivos */
      seats.push({ id: p.id, a: a > Math.PI * 0.5 ? a - Math.PI * 2 : a });
    });
    /* Que no se encimen: cada quien conserva su lado, con un mínimo de separación angular; tú quedas al frente. */
    seats.sort((x, y) => x.a - y.a);
    const lo = -Math.PI * 1.3, hi = Math.PI * 0.3, gap = Math.min(0.62, (hi - lo) / Math.max(1, seats.length));
    for (let it = 0; it < 80; it++) {
      for (let i = 0; i < seats.length - 1; i++) {
        const d = seats[i + 1].a - seats[i].a;
        if (d < gap) { const push = (gap - d) / 2; seats[i].a -= push; seats[i + 1].a += push; }
      }
      if (seats.length) { seats[0].a = Math.max(lo, seats[0].a); seats[seats.length - 1].a = Math.min(hi, seats[seats.length - 1].a); }
    }
    const ring = R + 30 + Math.max(0, seats.length - 5) * 3;
    const targets = seats.map(q => ({ id: q.id, x: G.x + Math.cos(q.a) * ring, y: G.y + 0.5, z: G.z + Math.sin(q.a) * ring }));
    targets.forEach(t => { story.targets[t.id] = { x: t.x, y: t.y, z: t.z }; });
    story.steps.forEach(s => {
      const t = story.targets[s.person.id];
      s.capPos = { x: lerp(s.need.pos.x, t.x, 0.5), y: lerp(s.need.pos.y, t.y, 0.5) + 0.8, z: lerp(s.need.pos.z, t.z, 0.5) };
    });
    story.targets[me.id] = { x: G.x, y: G.y - 1, z: G.z + R + 34 };
    /* Círculos que esta situación ilumina (amigas para un vestido; la red de apoyo para acompañar a mamá). */
    if (hasTrust()) {
      const ac = Trust.activeCircles(u, situation.needs);
      story.circles = (ac.explicit || []).concat(ac.emergent || [])
        .map(c => ({ id: c.id, label: c.label, members: (c.members || []).filter(id => byId[id] && byId[id].kind === 'person') }))
        .filter(c => c.members.length && c.members.length < 10).slice(0, 2);
    }
    story.coverage = { covered: story.needs.filter(n => n.covered && !n.optional).length, total: story.needs.filter(n => !n.optional).length };
    story.headline = Resolver.headline(result.solutions || [], u, id => State.person(id));
    return story;
  }

  /* Ayuda completada: los dos nodos quedan un poco más cerca. Devuelve la nueva posición social de `b`. */
  function closer(model, aId, bId, amount = 0.22) {
    const a = model.people.find(p => p.id === aId), b = model.people.find(p => p.id === bId);
    if (!a || !b) return null;
    const dx = a.social.x - b.social.x, dz = a.social.z - b.social.z, d = Math.hypot(dx, dz) || 1;
    const move = Math.max(0, Math.min(d - 22, d * amount));
    b.social = { x: b.social.x + dx / d * move, y: b.social.y, z: b.social.z + dz / d * move };
    return b.social;
  }

  return { build, plan, closer, S, FLOOR_H, SKY_Y };
})();
