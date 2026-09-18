/* ==========================================================================
   map.js — Mapa de mi comunidad.

   Capa geográfica complementaria: hace visible que las personas, los
   recursos y las necesidades existen físicamente cerca unas de otras.
   No es Google Maps ni la navegación principal: es la misma comunidad de la
   constelación vista desde la proximidad física.

   · Mapa ilustrado propio (Canvas 2D isométrico): torres extruidas con
     ventanas, casas con techo a dos aguas, jardín, cancha, calles y árboles.
     Cero dependencias; el residencial es ficticio y no apunta a ningún lugar
     real, así que no tiene sentido pintar tiles de OpenStreetMap.
   · Cada persona conserva su identidad visual de la constelación (mismo
     color de tono, mismas iniciales). Las relaciones de confianza se ven
     como un anillo más fuerte; las personas nuevas se ven neutrales.
     Nunca se muestra una puntuación.
   · Privacidad: posiciones aproximadas por diseño (edificio + unos metros de
     jitter). Nunca coordenadas, ni número de departamento, ni domicilio:
     solo "mismo edificio", "Torre B · 120 m", "Casas del norte · 340 m".
   · Situación: usa el mismo pipeline (Resolver.resolve) y el mismo grafo
     (State.graph). Destaca solo a las personas relevantes y traza conexiones
     suaves desde tu ubicación a las posibles soluciones. Los hogares extra
     (community.households) que tienen algo parecido se insinúan como
     "ayuda potencial", sin entrar al grafo del resolver.
   · Constelación ↔ Mapa: ViewHandoff traspasa las posiciones en pantalla de
     cada persona para que el cambio de vista sea un movimiento, no un corte.

   Ruta: #/map · #/map?s=<id> · #/map?q=<texto>
   API:  CommunityMap.mount(main, params) · CommunityMap.dispose()
   ========================================================================== */

/* Traspaso entre vistas (constelación ↔ mapa): posiciones relativas por persona. */
const ViewHandoff = (() => {
  let data = null;
  return {
    set(d) { data = Object.assign({ at: Date.now() }, d); },
    take() { const d = data; data = null; return d && Date.now() - d.at < 4000 ? d : null; }
  };
})();

const CommunityMap = (() => {
  const ROUTE = '/map';
  const ISO = { x: 0.87, y: 0.5, h: 1.25 };   /* proyección isométrica: 1 m = 1 unidad */
  const MIN_SCALE = 0.32, MAX_SCALE = 2.6;
  const NEAR_RADIUS = 190;                    /* m: lo que se ve al entrar */

  /* Paleta (misma identidad que css/styles.css y constellation.js) */
  const C = {
    cream: '#F7F1E6', paper: '#FFFDF9', amarillo: '#EFB94B', amarilloSoft: '#FBEFD1',
    terracota: '#C55E3E', terracotaLight: '#E07A5A', terracotaDark: '#A64D30', verde: '#586D53', verdeDark: '#304431',
    sage: '#9DB58F', tierra: '#A9825E', ink: '#2B221B', ink2: '#5C4F45', ink3: '#8C7D70', line: '#E4D9C8', verdeSoft: '#E2EADF'
  };
  const TONES = { 1: '#D96F4F', 2: '#5E7A59', 3: '#D9A03A', 4: '#B98D64', 5: '#7F927B' };
  const KIND_COLOR = {
    object: C.amarillo, skill: C.terracotaLight, knowledge: C.sage, time: '#C9B48A',
    route: '#F2C48D', contact: '#D9A066', food: '#F3A18A', context: '#E8D3A0'
  };
  const GROUND = { top: '#EEF0E2', bottom: '#E2E8D6', street: '#EADFCB', streetLine: '#F7F1E6', park: '#CBD9C1', parkLight: '#D8E3CD', court: '#E6D3AE' };
  const BUILD = {
    tower: { top: '#F5ECDC', left: '#E2D2B8', right: '#C7B294', window: '#FBF7EE', windowDark: '#EADFC9' },
    house: { top: '#F7EEDF', left: '#EBDCC3', right: '#D4BFA0', roofFront: '#D08A63', roofBack: '#B06E4C', gable: '#E4D1B5', door: '#A64D30' },
    hall: { top: '#E4EADF', left: '#D3DCCB', right: '#BFCAB5' },
    gate: { top: '#EAD9C4', left: '#DCC7AC', right: '#C8B08F' }
  };

  /* ---- Estado del módulo ---- */
  let root = null, canvas = null, ctx = null;
  let raf = 0, running = false, visible = true;
  let W = 0, H = 0, DPR = 1;
  let reduced = false, mobile = false;
  let cam = { scale: 1, cx: 0, cy: 0, tScale: 1, tcx: 0, tcy: 0 };
  let marks = [];          /* usuario, personas del grafo y hogares extra */
  let byId = new Map();
  let buildings = [];
  let trees = [];
  let clusters = [];       /* etiquetas de hileras de casas */
  let links = [];
  let story = null;
  let mode = 'idle';
  let layers = { people: true, resources: true, needs: true, circle: '' };
  let hovered = null, selected = null;
  let hoveredBuilding = null;
  let pointerState = null; /* arrastre / pinch */
  let listeners = [];
  let timeouts = [];
  let hashListener = null;
  let lastT = 0, breath = 0;
  let spriteCache = new Map();
  let arrive = null;       /* llegada desde la constelación { at, dusk } */
  let wideShown = false;
  const hasTrust = () => typeof Trust !== 'undefined' && typeof Trust.relations === 'function';

  /* ---- Utilidades ---- */
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const now = () => performance.now();
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  function later(fn, ms) { const id = setTimeout(fn, reduced ? Math.min(ms, 40) : ms); timeouts.push(id); return id; }
  function clearTimers() { timeouts.forEach(clearTimeout); timeouts = []; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  function font(weight, size) { return `${weight} ${size}px ${getComputedStyle(document.body).fontFamily}`; }
  function truncate(text, max) { const t = String(text || ''); return t.length > max ? t.slice(0, max - 1).replace(/[\s,;:]+$/, '') + '…' : t; }

  function glowSprite(color, radius) {
    const key = `${color}-${Math.round(radius)}`;
    let s = spriteCache.get(key);
    if (s) return s;
    const size = Math.ceil(radius * 2 * DPR) + 2;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, rgba(color, 0.55)); grad.addColorStop(0.4, rgba(color, 0.2)); grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    s = { canvas: c, size };
    spriteCache.set(key, s);
    return s;
  }
  function drawGlow(x, y, radius, color, alpha) {
    if (alpha <= 0.01 || radius < 1) return;
    const s = glowSprite(color, radius);
    ctx.globalAlpha = alpha;
    ctx.drawImage(s.canvas, x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  /* ---- Proyección ---- */
  function iso(e, n, h = 0) { return { x: (e + n) * ISO.x, y: (e - n) * ISO.y - h * ISO.h }; }
  function toScreen(p) { return { x: W / 2 + (p.x - cam.cx) * cam.scale, y: H / 2 + (p.y - cam.cy) * cam.scale }; }
  function S(e, n, h = 0) { return toScreen(iso(e, n, h)); }
  function heightOf(b) {
    if (!b) return 0;
    if (b.kind === 'tower') return (b.floors || 4) * 3.6;
    if (b.kind === 'house') return (b.floors || 1) * 3 + 3;
    if (b.kind === 'hall' || b.kind === 'gate') return 4;
    return 0;
  }

  /* ---- Datos → marcas ---- */
  function community() { return State.community(); }
  function personColor(p) { return TONES[p.tone] || TONES[3]; }
  function buildingOf(id) { return buildings.find(b => b.id === id) || null; }

  function buildMarks() {
    const c = community();
    const g = State.graph();
    buildings = c.buildings || [];
    marks = []; byId = new Map(); links = [];

    const add = (entity, kind) => {
      if (!entity || !entity.offset) return;
      const b = buildingOf(entity.building);
      const m = {
        id: entity.id, kind, entity, name: entity.name, initials: entity.initials || (entity.name || '?').slice(0, 1),
        e: entity.offset.x, n: entity.offset.y, building: b, top: heightOf(b) + (kind === 'user' ? 12 : 9),
        color: kind === 'household' ? C.paper : personColor(entity),
        caps: (entity.capabilities || []).slice(0, 5), open: entity.open || [],
        act: 1, actT: 1, matched: false, maybe: false, from: null, arriveAt: 0, hit: 0,
        stage: 'unknown', strength: 0
      };
      if (kind === 'person' && hasTrust()) { m.stage = Trust.stage(entity.id); m.strength = Trust.strength(entity.id); }
      marks.push(m); byId.set(m.id, m);
    };
    add(g.user, 'user');
    g.people.forEach(p => add(p, 'person'));
    (c.households || []).forEach(h => add(h, 'household'));

    /* Personas en el mismo edificio: se reparten en un pequeño anillo sobre la azotea. */
    const groups = new Map();
    marks.forEach(m => { const k = m.building ? m.building.id : m.id; (groups.get(k) || groups.set(k, []).get(k)).push(m); });
    groups.forEach(list => {
      if (list.length < 2) return;
      const b = list[0].building;
      /* Todas parten del mismo edificio (misma varilla) y se abren en abanico en píxeles, para que
         nunca se encimen aunque el mapa esté muy alejado. */
      list.sort((a, c) => (a.kind === 'user' ? -1 : c.kind === 'user' ? 1 : a.name.localeCompare(c.name)));
      list.forEach((m, i) => { m.slot = i; m.slots = list.length; if (b) { m.e = b.offset.x; m.n = b.offset.y; } });
    });

    /* Árboles: deterministas, junto a calles y jardín */
    trees = [];
    (c.streets || []).forEach((line, li) => {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        const segs = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 42));
        for (let s = 0; s < segs; s++) {
          const t = (s + 0.5) / segs;
          const side = hash(`${li}-${i}-${s}`) < 0.5 ? -1 : 1;
          const ex = a.x + (b.x - a.x) * t, ny = a.y + (b.y - a.y) * t;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          trees.push({ e: ex - dy / d * 9 * side, n: ny + dx / d * 9 * side, r: 2.4 + hash(`t${li}${i}${s}`) * 1.6 });
        }
      }
    });
    const park = buildings.find(b => b.kind === 'park');
    if (park) for (let i = 0; i < 9; i++) {
      const a = hash(`p${i}`) * Math.PI * 2, r = 0.55 + hash(`pr${i}`) * 0.35;
      trees.push({ e: park.offset.x + Math.cos(a) * park.w / 2 * r, n: park.offset.y + Math.sin(a) * park.d / 2 * r, r: 3 + hash(`ps${i}`) * 1.5 });
    }
    /* Quitar árboles que caen dentro de una huella */
    trees = trees.filter(t => !buildings.some(b => b.kind !== 'park' && Math.abs(t.e - b.offset.x) < (b.w || 10) / 2 + 3 && Math.abs(t.n - b.offset.y) < (b.d || 10) / 2 + 3));

    /* Etiquetas de hileras de casas (una por hilera, nunca por casa) */
    const rows = new Map();
    buildings.filter(b => b.kind === 'house').forEach(b => (rows.get(b.label) || rows.set(b.label, []).get(b.label)).push(b));
    clusters = Array.from(rows.entries()).map(([label, list]) => ({
      label, e: list.reduce((s, b) => s + b.offset.x, 0) / list.length, n: list.reduce((s, b) => s + b.offset.y, 0) / list.length + 16
    }));
  }

  /* ---- Edificios: entrar al Community Twin ---- */
  const ENTERABLE = new Set(['tower', 'hall']);
  function hitBuilding(x, y) {
    let best = null, bd = Infinity;
    buildings.filter(b => ENTERABLE.has(b.kind)).forEach(b => {
      const p = S(b.offset.x, b.offset.y, heightOf(b) / 2);
      const r = Math.max(b.w || 10, b.d || 10) * 0.6 * cam.scale + 8;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < r && d < bd) { best = b; bd = d; }
    });
    return best;
  }
  function placeIcons(b) {
    return typeof Places !== 'undefined' ? Places.forBuilding(b.id).map(a => a.icon) : [];
  }
  function storyQuery() {
    const s = story && story.situation;
    return s ? (s.id && s.id !== 'preview' ? `s=${encodeURIComponent(s.id)}` : `q=${encodeURIComponent(s.text)}`) : '';
  }
  /* Mapa → Edificio: el mapa se acerca al edificio y el Community Twin lo levanta desde el suelo. */
  function enterBuilding(b) {
    if (!b) return;
    try { sessionStorage.setItem('entre-todos:twin-building', b.id); } catch (err) { /* sin persistencia */ }
    const p = iso(b.offset.x, b.offset.y, heightOf(b) / 2);
    cam.tScale = MAX_SCALE; cam.tcx = p.x; cam.tcy = p.y;
    hovered = null; hoveredBuilding = null; updateTooltip(null);
    later(() => {
      ViewHandoff.set({ from: 'map', building: b.id });
      const q = storyQuery();
      location.hash = `/twin?b=${encodeURIComponent(b.id)}${q ? '&' + q : ''}`;
    }, reduced ? 0 : 650);
  }

  /* ---- Cámara ---- */
  function fit(points, pad, immediate) {
    if (!points.length) return;
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    const scale = clamp(Math.min(W / Math.max(1, maxX - minX), (H - 90) / Math.max(1, maxY - minY)), MIN_SCALE, MAX_SCALE);
    cam.tScale = scale; cam.tcx = (minX + maxX) / 2; cam.tcy = (minY + maxY) / 2 + 20 / scale;
    if (immediate || reduced) { cam.scale = cam.tScale; cam.cx = cam.tcx; cam.cy = cam.tcy; }
  }
  function fitNear(immediate) {
    const me = byId.get(State.user().id);
    const pts = marks.filter(m => Math.hypot(m.e - me.e, m.n - me.n) <= NEAR_RADIUS).map(m => iso(m.e, m.n, m.top));
    pts.push(iso(me.e, me.n, 0));
    fit(pts, mobile ? 30 : 40, immediate);
  }
  function fitAll(immediate) {
    const pts = buildings.map(b => iso(b.offset.x, b.offset.y, heightOf(b))).concat(marks.map(m => iso(m.e, m.n, m.top)));
    fit(pts, mobile ? 18 : 30, immediate);
  }
  function fitMarks(list, immediate) {
    const me = byId.get(State.user().id);
    const pts = list.concat([me]).map(m => iso(m.e, m.n, m.top)).concat(list.concat([me]).map(m => iso(m.e, m.n, 0)));
    fit(pts, mobile ? 46 : 70, immediate);
  }
  function zoomBy(factor, sx, sy) {
    const next = clamp(cam.tScale * factor, MIN_SCALE, MAX_SCALE);
    if (sx != null) {
      /* Zoom alrededor del puntero: el punto bajo el cursor no se mueve */
      const wx = cam.tcx + (sx - W / 2) / cam.tScale, wy = cam.tcy + (sy - H / 2) / cam.tScale;
      cam.tcx = wx - (sx - W / 2) / next; cam.tcy = wy - (sy - H / 2) / next;
    }
    cam.tScale = next;
    if (reduced) { cam.scale = cam.tScale; cam.cx = cam.tcx; cam.cy = cam.tcy; }
  }
  function isWide() { return cam.scale < 0.62; }

  /* ---- Situación: destacar solo a quienes importan ---- */
  function clearStory() {
    clearTimers();
    story = null; mode = 'idle'; links = []; hoveredBuilding = null;
    marks.forEach(m => { m.actT = 1; m.matched = false; m.maybe = false; m.need = null; m.because = null; });
    setCaption(isWide() ? 'wide' : 'idle');
    setActions('idle');
    setSummary('');
    fitNear();
  }

  function matchHouseholds(needs) {
    const out = [];
    const norm = t => (typeof Matching !== 'undefined' ? Matching.normalize(t) : String(t || '').toLowerCase());
    marks.filter(m => m.kind === 'household').forEach(m => {
      needs.forEach(n => {
        const tags = (n.tags || []).map(norm);
        const hit = m.caps.find(cap => (!n.kinds || n.kinds.includes(cap.kind)) && (cap.tags || []).some(ct => tags.some(t => t.length >= 3 && (norm(ct) === t || norm(ct).includes(t) || t.includes(norm(ct))))));
        if (hit && !out.some(o => o.mark === m)) out.push({ mark: m, cap: hit, need: n });
      });
    });
    return out;
  }

  function show(situation) {
    clearTimers();
    story = null; links = [];
    mode = 'situation';
    const u = situation.understanding;
    const result = Resolver.resolve(situation, State.graph());
    const st = { situation, result, steps: [], maybe: [], ephemeral: !situation.id || situation.id === 'preview', done: false };
    marks.forEach(m => { m.matched = false; m.maybe = false; m.need = null; m.because = null; });

    if (u.kind === 'need') {
      const stepFor = {};
      result.solutions.forEach(sol => sol.steps.concat(sol.extras).forEach(s => { if (!stepFor[s.needId]) stepFor[s.needId] = s; }));
      result.needs.forEach(need => {
        const s = stepFor[need.id];
        if (!s) { st.steps.push({ need, gap: true }); return; }
        const m = byId.get(s.personId);
        if (!m) return;
        const cap = State.capability(s.personId, s.capabilityId);
        st.steps.push({ need, mark: m, cap, because: s.because, alternatives: (s.alternatives || []).map(id => byId.get(id)).filter(Boolean) });
        m.matched = true;
        if (!m.need) { m.need = u.lang === 'en' ? (need.labelEn || need.label) : need.label; m.because = s.because; }
      });
      st.maybe = matchHouseholds(result.needs.filter(n => !stepFor[n.id] || true));
      st.maybe.forEach(x => { x.mark.maybe = true; x.mark.need = x.cap.label; });
    } else {
      (result.opportunities || []).forEach(o => {
        const m = byId.get(o.personId);
        if (!m) return;
        st.steps.push({ open: o, mark: m, because: o.text });
        m.matched = true; m.need = o.title; m.because = o.text;
      });
    }
    /* Place Capabilities: edificios cuyo lugar también ayuda (recepción, bicicletero, salón, elevador) */
    st.placeSteps = [];
    (result.solutions || []).forEach(sol => (sol.placeSteps || []).forEach(p => { if (!st.placeSteps.some(x => x.amenityId === p.amenityId)) st.placeSteps.push(p); }));
    st.placeSteps = st.placeSteps.slice(0, 4);
    st.placeBuildings = [];
    st.placeSteps.forEach(p => { const b = buildingOf(p.placeId); if (b && !st.placeBuildings.some(x => x.b === b)) st.placeBuildings.push({ b, steps: [] }); const pb = st.placeBuildings.find(x => x.b === b); if (pb) pb.steps.push(p); });
    marks.forEach(m => { m.actT = m.matched ? 1 : m.maybe ? 0.72 : (m.kind === 'user' ? 1 : 0.22); });
    story = st;
    setActions('story');
    setCaption('thinking', u, st);

    const me = byId.get(State.user().id);
    const targets = [];
    st.steps.forEach(s => { if (s.mark && !targets.includes(s.mark)) targets.push(s.mark); });
    st.maybe.forEach(x => { if (!targets.includes(x.mark)) targets.push(x.mark); });
    st.placeBuildings.forEach(pb => targets.push({ e: pb.b.offset.x, n: pb.b.offset.y, top: heightOf(pb.b) }));
    fitMarks(targets.length ? targets : [me]);

    let t = 700;
    targets.filter(m => m.matched).forEach((m, i) => {
      later(() => {
        m.hit = now();
        links.push({ from: me, to: m, born: now(), progress: 0, label: `${m.name} · ${truncate(m.need, 22)}`, kind: 'solution' });
      }, t + i * 420);
    });
    t += targets.filter(m => m.matched).length * 420 + 300;
    st.maybe.forEach((x, i) => later(() => links.push({ from: me, to: x.mark, born: now(), progress: 0, kind: 'maybe' }), t + i * 160));
    t += st.maybe.length * 160 + 200;
    st.placeBuildings.forEach((pb, i) => later(() => {
      pb.born = now();
      links.push({ from: me, to: { building: pb.b }, born: now(), progress: 0, kind: 'place', label: `${pb.steps[0].icon} ${truncate(pb.steps[0].label, 22)}` });
    }, t + i * 260));
    t += st.placeBuildings.length * 260 + 500;
    later(() => { st.done = true; setCaption('coverage', u, st); setSummary(summaryHtml(st)); }, t);
  }

  /* ---- Simulación ---- */
  function step(dt) {
    const k = clamp(dt / 16.67, 0.25, 2.2);
    breath += dt * 0.0011;
    const f = reduced ? 1 : 0.11 * k;
    cam.scale = lerp(cam.scale, cam.tScale, f);
    cam.cx = lerp(cam.cx, cam.tcx, f);
    cam.cy = lerp(cam.cy, cam.tcy, f);
    marks.forEach(m => { m.act = lerp(m.act, m.actT, (reduced ? 0.5 : 0.07) * k); });
    const tNow = now();
    links.forEach(l => { if (tNow >= l.born) l.progress = Math.min(1, l.progress + dt / (reduced ? 40 : 720)); });
    if (mode === 'idle' && !story) {
      const wide = isWide();
      if (wide && !wideShown) { wideShown = true; setCaption('wide'); }
      else if (!wide && wideShown) { wideShown = false; setCaption('idle'); }
    }
  }

  /* ---- Dibujo ---- */
  function poly(points, fill, stroke, lw) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.lineJoin = 'round'; ctx.stroke(); }
  }

  function drawGround() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, GROUND.top); g.addColorStop(1, GROUND.bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    /* Manchas de pasto más claro, muy sutiles */
    for (let i = 0; i < 5; i++) {
      const p = S(-300 + hash(`g${i}`) * 640, -280 + hash(`gn${i}`) * 520, 0);
      drawGlow(p.x, p.y, (120 + hash(`gr${i}`) * 90) * cam.scale, '#F3F3E3', 0.35);
    }
    /* Calles */
    const c = community();
    (c.streets || []).forEach(line => {
      const pts = line.map(p => S(p.x, p.y, 0));
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = GROUND.street; ctx.lineWidth = Math.max(3, 9 * cam.scale); ctx.stroke();
      if (cam.scale > 0.55) {
        ctx.setLineDash([6 * cam.scale, 7 * cam.scale]);
        ctx.strokeStyle = GROUND.streetLine; ctx.lineWidth = Math.max(0.6, 0.9 * cam.scale); ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }

  function footprint(b, h) {
    const e = b.offset.x, n = b.offset.y, w = (b.w || 10) / 2, d = (b.d || 10) / 2;
    return [S(e - w, n - d, h), S(e + w, n - d, h), S(e + w, n + d, h), S(e - w, n + d, h)];
  }

  function drawFlat(b) {
    if (b.kind === 'park') {
      const pts = [];
      for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; pts.push(S(b.offset.x + Math.cos(a) * b.w / 2, b.offset.y + Math.sin(a) * b.d / 2, 0)); }
      poly(pts, GROUND.park);
      const inner = [];
      for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; inner.push(S(b.offset.x - 8 + Math.cos(a) * b.w * 0.26, b.offset.y + 4 + Math.sin(a) * b.d * 0.26, 0)); }
      poly(inner, GROUND.parkLight);
    } else if (b.kind === 'court') {
      poly(footprint(b, 0), GROUND.court, rgba(C.paper, 0.7), 1);
      const a = S(b.offset.x, b.offset.y - b.d / 2, 0), c2 = S(b.offset.x, b.offset.y + b.d / 2, 0);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c2.x, c2.y); ctx.strokeStyle = rgba(C.paper, 0.7); ctx.lineWidth = 1; ctx.stroke();
    }
  }

  function drawBox(b, h, pal) {
    const g0 = footprint(b, 0), g1 = footprint(b, h);
    /* Sombra */
    const sh = g0.map(p => ({ x: p.x + 3 * cam.scale, y: p.y + 2 * cam.scale }));
    poly(sh, rgba(C.ink, 0.1));
    /* Caras visibles: A-B (izquierda) y B-C (derecha); azotea */
    poly([g0[0], g0[1], g1[1], g1[0]], pal.left);
    poly([g0[1], g0[2], g1[2], g1[1]], pal.right);
    poly(g1, pal.top, rgba(C.ink, 0.12), 0.8);
    return { g0, g1 };
  }

  function drawWindows(b, h, pal) {
    if (cam.scale < 0.6) return;
    const floors = b.floors || 1;
    const e = b.offset.x, n = b.offset.y, w = (b.w || 10) / 2, d = (b.d || 10) / 2;
    const fh = h / floors;
    const face = (from, to, cols, color) => {
      for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
        const u0 = (c + 0.25) / cols, u1 = (c + 0.7) / cols;
        const z0 = f * fh + fh * 0.3, z1 = f * fh + fh * 0.75;
        const P = (u, z) => S(from.e + (to.e - from.e) * u, from.n + (to.n - from.n) * u, z);
        poly([P(u0, z0), P(u1, z0), P(u1, z1), P(u0, z1)], color);
      }
    };
    const cols = Math.max(2, Math.round((b.w || 10) / 6));
    face({ e: e - w, n: n - d }, { e: e + w, n: n - d }, cols, pal.window);
    face({ e: e + w, n: n - d }, { e: e + w, n: n + d }, Math.max(2, Math.round((b.d || 10) / 6)), pal.windowDark);
  }

  function drawHouse(b) {
    const pal = BUILD.house;
    const wallH = (b.floors || 1) * 3, roofH = 3;
    const { g1 } = drawBox(b, wallH, pal);
    const e = b.offset.x, n = b.offset.y, w = (b.w || 10) / 2;
    const r1 = S(e - w, n, wallH + roofH), r2 = S(e + w, n, wallH + roofH);
    poly([g1[3], g1[2], r2, r1], pal.roofBack);
    poly([g1[1], g1[2], r2], pal.gable);
    poly([g1[0], g1[1], r2, r1], pal.roofFront, rgba(C.ink, 0.1), 0.6);
    if (cam.scale > 0.75) {
      const d = (b.d || 10) / 2;
      const P = (u, z) => S(e - w + (2 * w) * u, n - d, z);
      poly([P(0.42, 0), P(0.58, 0), P(0.58, 2.1), P(0.42, 2.1)], pal.door);
    }
  }

  function drawTower(b) {
    const pal = BUILD[b.kind] || BUILD.tower;
    const h = heightOf(b);
    drawBox(b, h, pal);
    if (b.kind === 'tower') drawWindows(b, h, pal);
  }

  function drawTree(t) {
    const g = S(t.e, t.n, 0), top = S(t.e, t.n, t.r * 1.6);
    const r = Math.max(1.6, t.r * cam.scale);
    ctx.strokeStyle = rgba(C.tierra, 0.8); ctx.lineWidth = Math.max(0.8, 0.6 * cam.scale);
    ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    ctx.fillStyle = rgba(C.ink, 0.08); ctx.beginPath(); ctx.ellipse(g.x + r * 0.5, g.y + r * 0.2, r * 1.1, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#86A07B'; ctx.beginPath(); ctx.arc(top.x, top.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.sage; ctx.beginPath(); ctx.arc(top.x - r * 0.3, top.y - r * 0.35, r * 0.7, 0, Math.PI * 2); ctx.fill();
  }

  function drawScene() {
    buildings.filter(b => b.kind === 'park' || b.kind === 'court').forEach(drawFlat);
    const solids = buildings.filter(b => b.kind !== 'park' && b.kind !== 'court');
    const items = solids.map(b => ({ depth: b.offset.x - b.offset.y + (b.d || 10) / 2, draw: () => (b.kind === 'house' ? drawHouse(b) : drawTower(b)) }))
      .concat(trees.map(t => ({ depth: t.e - t.n, draw: () => drawTree(t) })));
    items.sort((a, b) => a.depth - b.depth).forEach(i => i.draw());
    /* Edificio bajo el cursor o con un lugar que ayuda: contorno de la azotea y halo en la base */
    const lit = (story ? story.placeBuildings.filter(pb => pb.born).map(pb => pb.b) : []).concat(hoveredBuilding ? [hoveredBuilding] : []);
    lit.forEach(b => {
      const base = S(b.offset.x, b.offset.y, 0);
      drawGlow(base.x, base.y, Math.max(b.w || 10, b.d || 10) * cam.scale * 1.1, hoveredBuilding === b ? C.amarillo : C.sage, 0.5);
      const roof = footprint(b, heightOf(b));
      ctx.setLineDash(hoveredBuilding === b ? [] : [4, 4]);
      poly(roof, null, rgba(hoveredBuilding === b ? C.terracota : C.verde, 0.9), 1.6);
      ctx.setLineDash([]);
    });
    /* Etiquetas de lugares: torres, hileras de casas y lugares comunes. Nunca "Casa 14". */
    if (cam.scale >= 0.48) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      solids.filter(b => b.kind === 'tower' || (cam.scale >= 0.8 && (b.kind === 'hall' || b.kind === 'gate'))).forEach(b => {
        /* Al pie del edificio (vértice frontal), lejos del abanico de personas sobre la azotea */
        const p = S(b.offset.x + (b.w || 10) / 2, b.offset.y - (b.d || 10) / 2, 0);
        drawText(b.label, p.x, p.y + 9, { size: mobile ? 10 : 11, color: C.ink2, weight: 600, bg: rgba(C.paper, 0.75) });
        /* Place Capabilities del edificio, como iconos discretos */
        const icons = placeIcons(b);
        if (icons.length && cam.scale >= 0.7) drawText(icons.join(' '), p.x, p.y + 26, { size: mobile ? 10 : 11, color: C.ink, alpha: 0.9, bg: rgba(C.paper, 0.75) });
      });
      clusters.forEach(cl => { const p = S(cl.e, cl.n, 0); drawText(cl.label, p.x, p.y + 8, { size: mobile ? 10 : 11, color: C.ink2, weight: 600, bg: rgba(C.paper, 0.7) }); });
      if (cam.scale >= 0.8) buildings.filter(b => b.kind === 'park' || b.kind === 'court').forEach(b => {
        const p = S(b.offset.x, b.offset.y, 0);
        drawText(b.label, p.x, p.y, { size: 10.5, color: C.verdeDark, weight: 500 });
      });
    }
  }

  function drawText(text, x, y, o) {
    ctx.font = font(o.weight || 500, o.size || 11);
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    if (o.bg) {
      const w = ctx.measureText(text).width + 10, h = (o.size || 11) + 6;
      const left = o.align === 'left' ? x - 5 : o.align === 'right' ? x - w + 5 : x - w / 2;
      ctx.fillStyle = o.bg;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(left, y - h / 2, w, h, h / 2) : ctx.rect(left, y - h / 2, w, h); ctx.fill();
    }
    ctx.fillStyle = o.color || C.ink;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }

  /* Posición en pantalla de una marca (con llegada desde la constelación) */
  function markPos(m) {
    if (m.building && !m.entity) { const b = m.building; return Object.assign(S(b.offset.x, b.offset.y, heightOf(b) + 2), { t: 1 }); }
    const p = S(m.e, m.n, m.top);
    if (m.slots > 1) {
      const r = markRadius(m), spacing = r * 2.3;
      p.x += (m.slot - (m.slots - 1) / 2) * spacing;
      p.y -= (m.slot % 2) * r * 1.1 + 6;
    }
    if (m.from && m.arriveAt) {
      const t = reduced ? 1 : clamp((now() - m.arriveAt) / 1100, 0, 1);
      if (t < 1) { const k = easeInOut(t); return { x: lerp(m.from.x, p.x, k), y: lerp(m.from.y, p.y, k), t }; }
      m.from = null;
    }
    return { x: p.x, y: p.y, t: 1 };
  }

  function curveCtrl(a, b, bend) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    return { x: mx - dy / d * bend, y: my + dx / d * bend - 18 };
  }
  function quadAt(a, c, b, t) { const u = 1 - t; return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }; }

  function drawLinks() {
    const tNow = now();
    links.forEach(l => {
      if (tNow < l.born) return;
      const a = markPos(l.from), b = markPos(l.to);
      const c = curveCtrl(a, b, Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.16));
      const prog = easeOut(l.progress);
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const p = quadAt(a, c, b, (i / 24) * prog); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
      ctx.lineCap = 'round';
      if (l.kind === 'maybe') { ctx.setLineDash([3, 6]); ctx.strokeStyle = rgba(C.tierra, 0.45); ctx.lineWidth = 1; }
      else if (l.kind === 'place') { ctx.setLineDash([5, 5]); ctx.strokeStyle = rgba(C.verde, 0.7); ctx.lineWidth = 1.6; }
      else { ctx.setLineDash([]); ctx.strokeStyle = rgba(C.terracota, 0.75); ctx.lineWidth = 2; ctx.shadowColor = rgba(C.amarillo, 0.5); ctx.shadowBlur = mobile ? 0 : 6; }
      ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]);
      if (l.kind === 'place' && l.progress >= 0.98 && l.label) {
        drawText(l.label, b.x, b.y - 14, { size: mobile ? 10.5 : 11.5, weight: 600, color: C.verdeDark, bg: rgba(C.verdeSoft, 0.95) });
      }
      if (l.kind === 'solution') {
        if (!reduced) {
          const gt = l.progress < 1 ? l.progress : ((tNow - l.born) / 2600) % 1;
          const gp = quadAt(a, c, b, easeOut(gt));
          drawGlow(gp.x, gp.y, 8, C.amarillo, 0.8);
          ctx.fillStyle = C.paper; ctx.beginPath(); ctx.arc(gp.x, gp.y, 1.8, 0, Math.PI * 2); ctx.fill();
        }
        if (l.progress >= 0.98 && l.label) {
          /* Conexión corta (mismo edificio): la etiqueta va debajo del nombre para no tapar a nadie */
          const short = Math.hypot(b.x - a.x, b.y - a.y) < 110;
          const mp = short ? { x: b.x, y: b.y + markRadius(l.to) + 32 } : quadAt(a, c, b, 0.56);
          drawText(l.label, mp.x, mp.y - 10, { size: mobile ? 10.5 : 11.5, weight: 600, color: C.terracotaDark, bg: rgba(C.paper, 0.92) });
        }
      }
    });
  }

  function circleMembers() {
    if (!hasTrust()) return null;
    if (layers.circle === 'frequent') return { label: 'Tu red frecuente', members: Trust.frequent() };
    if (layers.circle) { const c = Trust.circle(layers.circle); return c ? { label: c.label, members: c.members, sensitive: c.sensitive } : null; }
    return null;
  }

  function hull(points) {
    const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    pts.forEach(p => { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); });
    const upper = [];
    pts.slice().reverse().forEach(p => { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); });
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  function drawCircleLayer() {
    const c = circleMembers();
    if (!c) return;
    const members = c.members.map(id => byId.get(id)).filter(Boolean);
    if (!members.length) return;
    const me = byId.get(State.user().id);
    const pts = members.concat([me]).map(m => markPos(m));
    if (pts.length >= 3) {
      const h = hull(pts).map(p => p);
      ctx.setLineDash([3, 6]);
      poly(h.map(p => ({ x: p.x, y: p.y + 4 })), rgba(C.amarillo, 0.08), rgba(C.amarillo, 0.55), 1.2);
      ctx.setLineDash([]);
    }
    members.forEach(m => {
      const p = markPos(m);
      ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(p.x, p.y, markRadius(m) + 6, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(C.amarillo, 0.9); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
    });
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = Math.min(...pts.map(p => p.y)) - 26;
    drawText(c.sensitive ? `${c.label} · privado` : c.label, cx, clamp(cy, 14, H - 20), { size: 12, weight: 600, color: '#7A5A0E', bg: rgba(C.amarilloSoft, 0.95) });
  }

  function markRadius(m) {
    const base = (m.kind === 'household' ? 10.5 : m.kind === 'user' ? 14 : 12.5) * (mobile ? 0.92 : 1);
    return base * clamp(0.75 + cam.scale * 0.25, 0.8, 1.1);
  }

  function drawMark(m) {
    const p = markPos(m);
    const g = S(m.e, m.n, 0);
    const a = m.act * (m.from ? lerp(0.6, 1, p.t) : 1);
    const r = markRadius(m);
    const hv = hovered === m || selected === m;
    const hit = m.hit ? clamp(1 - (now() - m.hit) / 900, 0, 1) : 0;
    const br = reduced ? 0 : Math.sin(breath * 1.2 + hash(m.id) * 6) * 1.2;
    /* Pie: sombra en el suelo y varilla hasta el marcador */
    if (p.t >= 1) {
      ctx.fillStyle = rgba(C.ink, 0.12 * a); ctx.beginPath(); ctx.ellipse(g.x, g.y, 5 * cam.scale + 2, 2.4 * cam.scale + 1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(C.ink2, 0.35 * a); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(p.x, p.y + r + br); ctx.stroke();
    }
    const y = p.y + br;
    /* Ayuda potencial distribuida: al alejar, cada hogar con recursos deja ver un halo cálido */
    const wideGlow = isWide() && m.caps.length ? 0.35 : 0;
    if (m.matched || hit) drawGlow(p.x, y, r * 3 + hit * 18, C.amarillo, (0.45 + hit * 0.4) * a);
    else if (m.maybe) drawGlow(p.x, y, r * 2.4, C.amarillo, 0.3 * a);
    else if (wideGlow) drawGlow(p.x, y, r * 2.2, C.amarillo, wideGlow * a);
    if (m.kind === 'user') drawGlow(p.x, y, r * 2.6, C.amarillo, 0.35 * a);

    ctx.globalAlpha = 0.3 + a * 0.7;
    ctx.beginPath(); ctx.arc(p.x, y, r * (hv ? 1.08 : 1) * (1 + hit * 0.15), 0, Math.PI * 2);
    ctx.fillStyle = m.color; ctx.fill();
    /* Confianza: anillo más fuerte cuanto más relación; lo nuevo, neutral */
    if (m.kind === 'user') { ctx.strokeStyle = rgba(C.amarillo, 0.95); ctx.lineWidth = 2.2; ctx.stroke(); }
    else if (m.kind === 'household') { ctx.strokeStyle = rgba(C.ink3, 0.55); ctx.lineWidth = 1; ctx.stroke(); }
    else if (m.stage === 'circle') { ctx.strokeStyle = rgba(C.amarillo, 1); ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = rgba(C.paper, 0.9); ctx.lineWidth = 1; ctx.stroke(); }
    else if (m.strength > 0) { ctx.strokeStyle = rgba(C.amarillo, 0.5 + m.strength * 0.5); ctx.lineWidth = 1.2 + m.strength * 2.4; ctx.stroke(); }
    else { ctx.strokeStyle = rgba(C.paper, 0.85); ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.fillStyle = m.kind === 'household' ? C.ink2 : C.paper;
    ctx.font = font(700, Math.round(r * 0.78));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.initials, p.x, y + 0.5);
    ctx.globalAlpha = 1;

    /* Recursos: puntitos por tipo (misma paleta que la constelación) */
    if (layers.resources && m.caps.length && a > 0.3) {
      const n = Math.min(m.caps.length, 4);
      m.caps.slice(0, n).forEach((cap, i) => {
        const dot = 2.2 + (isWide() ? 0.6 : 0);
        const x = p.x + (i - (n - 1) / 2) * (dot * 3.2);
        ctx.globalAlpha = a;
        ctx.fillStyle = KIND_COLOR[cap.kind] || C.cream;
        ctx.beginPath(); ctx.arc(x, y - r - 6, dot, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba(C.ink, 0.25); ctx.lineWidth = 0.6; ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }
    /* Necesidad activa: pequeño aro punteado con punto terracota */
    if (layers.needs && m.open.length && a > 0.3 && m.kind !== 'user') {
      ctx.globalAlpha = a;
      ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(p.x + r * 0.85, y - r * 0.85, 5, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(C.terracota, 0.9); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.terracota; ctx.beginPath(); ctx.arc(p.x + r * 0.85, y - r * 0.85, 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    /* Nombre: al acercar, al participar en la solución o al pasar el cursor */
    const showName = m.kind === 'user' || hv || m.matched || cam.scale >= 0.95 || (m.maybe && cam.scale >= 0.7);
    if (showName) {
      const label = m.kind === 'user' ? 'Tú' : m.name;
      drawText(label, p.x, y + r + 9, { size: mobile ? 10.5 : 11.5, weight: m.matched || m.kind === 'user' ? 700 : 500, color: C.ink, alpha: 0.35 + a * 0.65, bg: rgba(C.paper, 0.75) });
      if (layers.needs && m.open.length && hv && !m.matched) {
        drawText(`Necesita: ${truncate(m.open[0].title, 26)}`, p.x, y + r + 23, { size: 10, weight: 500, color: C.terracotaDark, alpha: a, bg: rgba(C.paper, 0.8) });
      }
    }
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawGround();
    drawScene();
    drawCircleLayer();
    drawLinks();
    if (layers.people) {
      const order = marks.slice().sort((a, b) => (a.e - a.n) - (b.e - b.n));
      order.forEach(m => { if (!(hovered === m || selected === m || m.kind === 'user')) drawMark(m); });
      order.forEach(m => { if (hovered === m || selected === m || m.kind === 'user') drawMark(m); });
    }
    /* Llegada desde la constelación: el atardecer se disuelve en el día */
    if (arrive) {
      const t = reduced ? 1 : clamp((now() - arrive.at) / 900, 0, 1);
      if (t < 1) {
        const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
        g.addColorStop(0, '#3B322A'); g.addColorStop(1, '#2A3A2E');
        ctx.globalAlpha = 1 - easeOut(t); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      } else arrive = null;
    }
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min(48, t - (lastT || t));
    lastT = t;
    if (visible) { step(dt); render(); }
    raf = requestAnimationFrame(frame);
  }

  /* ---- Interacción ---- */
  function hitTest(x, y) {
    let best = null, bd = Infinity;
    if (!layers.people) return null;
    marks.forEach(m => {
      if (m.act < 0.15) return;
      const p = markPos(m);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < markRadius(m) + 7 && d < bd) { best = m; bd = d; }
    });
    return best;
  }

  function whereLabel(m) {
    const ent = m.entity;
    const label = typeof Matching !== 'undefined' ? Matching.distanceLabelFor(ent) : (ent.distance === 0 ? 'mismo edificio' : `${ent.distance} m`);
    if (m.kind === 'user') return ent.location && ent.location.buildingLabel ? ent.location.buildingLabel : 'Aquí vives';
    if (label === 'mismo edificio') return 'Mismo edificio';
    const where = ent.location && ent.location.buildingLabel ? ent.location.buildingLabel : (ent.place || '');
    return [where, label].filter(Boolean).join(' · ');
  }

  function tooltipHtml(m) {
    const p = m.entity;
    const isUser = m.kind === 'user';
    let out = `<strong>${esc(isUser ? 'Tú' : p.name)}</strong><span>${esc(whereLabel(m))}</span>`;
    if (m.kind === 'person' && hasTrust()) out += Trust.signals(p.id, 'es', { max: 2 }).map(t => `<em>${esc(t)}</em>`).join('');
    if (m.kind === 'household') out += '<em class="cmap__tip-new">Vecino nuevo · todavía no se han ayudado</em>';
    if (m.kind === 'person' && typeof Verification !== 'undefined') {
      const labels = Verification.labels(p, 'es', { short: true });
      if (labels.length) out += `<span class="cmap__tip-verified">${esc(labels.join(' · '))}</span>`;
    }
    if (m.matched && m.need) out += `<em class="cmap__tip-match">${esc(m.need)}${m.because ? ` · ${esc(m.because)}` : ''}</em>`;
    else if (m.maybe && m.need) out += `<em class="cmap__tip-match">Tiene algo parecido: ${esc(m.need)}</em>`;
    const caps = m.caps.slice(0, 3).map(c => esc(c.label)).join(' · ');
    const more = (p.capabilities || []).length > 3 ? ` y ${(p.capabilities || []).length - 3} más` : '';
    if (caps) out += `<span class="cmap__tip-caps">${caps}${more}</span>`;
    if (layers.needs && m.open.length && !isUser) out += `<span class="cmap__tip-need">Necesita: ${esc(m.open[0].title)}</span>`;
    return out;
  }

  function buildingTooltipHtml(b) {
    const list = typeof Places !== 'undefined' ? Places.forBuilding(b.id) : [];
    const here = story ? story.placeSteps.filter(p => p.placeId === b.id) : [];
    return `<strong>${esc(b.label)}</strong>`
      + (typeof Places !== 'undefined' ? `<span>${esc(Places.distanceLabel(b) === 'tu edificio' ? 'Tu edificio' : Places.distanceLabel(b))}</span>` : '')
      + (list.length ? `<span class="cmap__tip-caps">${list.map(a => `${a.icon} ${esc(a.label)}${a.hours ? ` (${esc(a.hours)})` : ''}`).join(' · ')}</span>` : '')
      + here.map(p => `<em class="cmap__tip-match">${p.icon} ${esc(p.label)}: ${esc(p.covers ? 'lo resuelve el lugar' : 'complementa a las personas')}</em>`).join('')
      + '<em class="cmap__tip-new">Toca para entrar al edificio</em>';
  }

  function updateTooltip(m, x, y) {
    const tip = root && root.querySelector('.cmap__tip');
    if (!tip) return;
    if (!m) { tip.hidden = true; return; }
    tip.innerHTML = m.entity ? tooltipHtml(m) : buildingTooltipHtml(m);
    tip.hidden = false;
    const rect = canvas.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x + 16, top = y - th / 2;
    if (left + tw > rect.width - 8) left = x - tw - 16;
    top = clamp(top, 8, rect.height - th - 8);
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  function on(el, ev, fn, opts) { el.addEventListener(ev, fn, opts); listeners.push(() => el.removeEventListener(ev, fn, opts)); }

  function bindPointer() {
    const pointers = new Map();
    const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    on(canvas, 'pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) pointerState = { start: p, last: p, moved: 0, cx: cam.tcx, cy: cam.tcy };
      else if (pointers.size === 2) { const [a, b] = Array.from(pointers.values()); pointerState = { pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y), s0: cam.tScale, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; }
    });
    on(canvas, 'pointermove', e => {
      const p = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (pointerState && pointerState.pinch && pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const next = clamp(pointerState.s0 * (d / (pointerState.d0 || 1)), MIN_SCALE, MAX_SCALE);
        zoomBy(next / cam.tScale, pointerState.mid.x, pointerState.mid.y);
        cam.scale = cam.tScale; cam.cx = cam.tcx; cam.cy = cam.tcy;
        return;
      }
      if (pointerState && !pointerState.pinch && pointers.size === 1) {
        const dx = p.x - pointerState.last.x, dy = p.y - pointerState.last.y;
        pointerState.moved += Math.hypot(dx, dy);
        pointerState.last = p;
        cam.tcx -= dx / cam.scale; cam.tcy -= dy / cam.scale;
        cam.cx = cam.tcx; cam.cy = cam.tcy;
        if (pointerState.moved > 4) { hovered = null; updateTooltip(null); }
        return;
      }
      if (e.pointerType === 'touch') return;
      hovered = hitTest(p.x, p.y);
      hoveredBuilding = hovered ? null : hitBuilding(p.x, p.y);
      canvas.style.cursor = hovered || hoveredBuilding ? 'pointer' : 'grab';
      const target = hovered || hoveredBuilding || selected;
      updateTooltip(target, hovered || hoveredBuilding ? p.x : (selected ? markPos(selected).x : 0), hovered || hoveredBuilding ? p.y : (selected ? markPos(selected).y : 0));
    });
    const end = e => {
      const p = local(e);
      const wasTap = pointerState && !pointerState.pinch && pointerState.moved < 6;
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        if (wasTap) {
          const m = hitTest(p.x, p.y);
          if (!m) {
            const b = hitBuilding(p.x, p.y);
            if (b) { selected = null; if (hoveredBuilding === b || e.pointerType !== 'touch') { enterBuilding(b); return; } hoveredBuilding = b; updateTooltip(b, p.x, p.y); return; }
          }
          selected = m === selected ? null : m;
          if (selected) selected.hit = now();
          updateTooltip(selected, p.x, p.y);
        }
        pointerState = null;
      } else if (pointers.size === 1) {
        const rest = Array.from(pointers.values())[0];
        pointerState = { start: rest, last: rest, moved: 10, cx: cam.tcx, cy: cam.tcy };
      }
    };
    on(canvas, 'pointerup', end);
    on(canvas, 'pointercancel', end);
    on(canvas, 'pointerleave', () => { if (!pointerState) { hovered = null; hoveredBuilding = null; if (!selected) updateTooltip(null); } });
    on(canvas, 'wheel', e => {
      e.preventDefault();
      const p = local(e);
      zoomBy(Math.exp(-e.deltaY * 0.0016), p.x, p.y);
    }, { passive: false });
    on(canvas, 'dblclick', e => { const p = local(e); zoomBy(1.6, p.x, p.y); });
  }

  /* ---- Vista (HTML alrededor del canvas) ---- */
  function counts() {
    const others = marks.filter(m => m.kind !== 'user');
    const resources = others.reduce((s, m) => s + (m.entity.capabilities || []).length, 0);
    const maxD = Math.max(...others.map(m => Number.isFinite(m.entity.distance) ? m.entity.distance : 0), 0);
    const needs = others.reduce((s, m) => s + m.open.length, 0);
    return { people: others.length, resources, needs, maxD: Math.ceil(maxD / 50) * 50 };
  }

  const COPY = {
    idleTitle: 'Todo esto está a unos pasos.',
    wideTitle: 'No sabías que tenías tanta ayuda tan cerca.',
    privacy: 'Las ubicaciones se muestran de forma aproximada para proteger la privacidad.'
  };

  function setCaption(state, u, st) {
    const cap = root && root.querySelector('.cmap__caption');
    if (!cap) return;
    const k = counts();
    let title = '', sub = '';
    if (state === 'idle') { title = COPY.idleTitle; sub = `${k.people} vecinos y ${k.resources} cosas, habilidades y trayectos a menos de ${k.maxD} m de ti. Aleja el mapa para ver toda la comunidad.`; }
    else if (state === 'wide') { title = COPY.wideTitle; sub = `${k.people + 1} hogares, ${k.resources} recursos y ${k.needs} necesidades abiertas, todo dentro de tu residencial.`; }
    else if (state === 'thinking') { title = u.kind === 'need' ? 'Viendo quién está cerca…' : 'Viendo a quién le sirve…'; sub = u.summary || ''; }
    else if (state === 'coverage') { title = coverageLine(u, st); sub = coverageSub(u, st); }
    cap.classList.remove('is-in'); void cap.offsetWidth; cap.classList.add('is-in');
    cap.innerHTML = `<p class="cmap__title">${esc(title)}</p>${sub ? `<p class="cmap__sub">${esc(sub)}</p>` : ''}`;
  }

  function coverageLine(u, st) {
    const people = Array.from(new Set(st.steps.filter(s => s.mark).map(s => s.mark)));
    if (u.kind !== 'need') {
      if (!people.length) return 'Por ahora nadie cerca necesita esto.';
      return `${people.length} ${people.length === 1 ? 'vecino cerca necesita' : 'vecinos cerca necesitan'} justo esto.`;
    }
    const placeCover = (st.placeSteps || []).find(p => p.covers);
    if (!people.length && placeCover) return `El lugar mismo puede resolverlo: ${placeCover.label.toLowerCase()} en ${placeCover.buildingLabel}.`;
    if (!people.length) return st.maybe.length ? 'Nadie de tu red todavía, pero hay vecinos cerca con algo parecido.' : 'Todavía nadie cerca puede resolverlo.';
    const maxD = Math.max(...people.map(m => m.entity.distance || 0));
    const where = maxD === 0 ? 'en tu mismo edificio' : `a menos de ${Math.ceil(maxD / 10) * 10} m de ti`;
    if (people.length === 1) return `${people[0].name} puede resolverlo ${maxD === 0 ? 'desde tu mismo edificio' : `a ${typeof Matching !== 'undefined' ? Matching.distanceLabelFor(people[0].entity) : `${maxD} m`}`}.`;
    return `${people.length} personas ${where} pueden resolverlo.`;
  }

  function coverageSub(u, st) {
    const parts = [];
    const covered = st.steps.filter(s => s.mark).length, gaps = st.steps.filter(s => s.gap && s.need && s.need.priority !== 'optional').length;
    if (u.kind === 'need' && covered) parts.push(gaps ? `${gaps === 1 ? 'Una cosa' : `${gaps} cosas`} sí tendrías que conseguir.` : 'Sin comprar nada.');
    if (st.placeSteps && st.placeSteps.length) parts.push(`El lugar también ayuda: ${st.placeSteps.slice(0, 2).map(p => `${p.label.toLowerCase()} en ${p.buildingLabel}`).join(' y ')}.`);
    if (st.maybe.length) parts.push(`Además, ${st.maybe.length} ${st.maybe.length === 1 ? 'vecino que aún no conoces tiene' : 'vecinos que aún no conoces tienen'} algo parecido cerca.`);
    return parts.join(' ');
  }

  function summaryHtml(st) {
    const items = st.steps.filter(s => s.mark).map(s => {
      const what = s.open ? s.open.title : (s.need.label);
      return `<li><span class="cmap__dot" style="--c:${s.mark.color}"></span><span><strong>${esc(s.mark.name)}</strong> · ${esc(whereLabel(s.mark))}<span class="cmap__because">${esc(what)}${s.because ? ` — ${esc(s.because)}` : ''}</span></span></li>`;
    }).join('');
    const maybe = st.maybe.map(x => `<li class="is-maybe"><span class="cmap__dot cmap__dot--maybe"></span><span><strong>${esc(x.mark.name)}</strong> · ${esc(whereLabel(x.mark))}<span class="cmap__because">Todavía no se han ayudado, pero tiene: ${esc(x.cap.label)}.</span></span></li>`).join('');
    const coveredByPlace = new Set((st.placeSteps || []).filter(p => p.covers).map(p => p.needId));
    const q = storyQuery();
    const places = (st.placeSteps || []).map(p => `<li class="is-place"><span class="cmap__dot cmap__dot--place">${p.icon}</span><span><strong>${esc(p.label)}</strong> · ${esc(p.buildingLabel)}<span class="cmap__because">${esc(p.because)}</span><a class="cmap__place-link" href="#/twin?b=${esc(p.placeId)}${q ? '&' + q : ''}">Entrar al edificio →</a></span></li>`).join('');
    const gaps = st.steps.filter(s => s.gap && s.need && s.need.priority !== 'optional' && !coveredByPlace.has(s.need.id)).map(s => `<li class="is-gap"><span class="cmap__dot cmap__dot--gap"></span><span>${esc(s.need.label)}<span class="cmap__because">Esto sí tendrías que conseguirlo.</span></span></li>`).join('');
    if (!items && !maybe && !gaps && !places) return '';
    return `<ul class="cmap__list">${items}${places}${maybe}${gaps}</ul>`;
  }

  function setSummary(html) { const el = root && root.querySelector('.cmap__summary'); if (el) el.innerHTML = html; }

  function setActions(state) {
    const el = root && root.querySelector('.cmap__actions');
    if (!el) return;
    if (state === 'idle') { el.innerHTML = ''; return; }
    const s = story && story.situation;
    const persisted = s && s.id && s.id !== 'preview';
    const primary = persisted
      ? `<a class="btn btn--primary" href="#/s/${esc(s.id)}">Ver la solución completa</a>`
      : `<button class="btn btn--primary" type="button" data-cmap="resolve">Resolverlo con ellos</button>`;
    el.innerHTML = `${primary}<button class="btn btn--ghost" type="button" data-cmap="clear">Ver el mapa en reposo</button>`;
  }

  function circleOptions() {
    if (!hasTrust()) return '';
    const opts = ['<option value="">Círculos: ninguno</option>'];
    if (Trust.frequent().length) opts.push('<option value="frequent">Tu red frecuente</option>');
    Trust.circles().filter(c => c.members.length).forEach(c => opts.push(`<option value="${esc(c.id)}">${esc(c.label)}${c.private ? ' · privado' : ''}</option>`));
    return `<label class="cmap__circle"><span class="sr-only">Círculo</span><select name="cmap-circle">${opts.join('')}</select></label>`;
  }

  /* Conmutador de los tres niveles: Mapa (dónde) · Edificio (cómo está organizado) · Constelación (quién con quién).
     El mismo bloque vive en las tres vistas. */
  function viewSwitch(active, params) {
    const q = params && params.q ? `q=${encodeURIComponent(params.q)}` : (params && params.s ? `s=${encodeURIComponent(params.s)}` : '');
    const twinB = (typeof CommunityTwin !== 'undefined' && CommunityTwin.lastBuilding()) || (State.user().building || 'central');
    const opt = (id, href, data, icon, label, small) => `
        <a class="viewswitch__opt ${active === id ? 'is-active' : ''}" ${active === id ? 'aria-current="page"' : ''} href="${href}" ${data}>
          ${icon}<span>${label}</span><small>${small}</small>
        </a>`;
    return `
      <div class="viewswitch viewswitch--3" role="group" aria-label="Cómo ver tu comunidad">
        ${opt('map', `#/map${q ? '?' + q : ''}`, 'data-constellation="to-map" data-twin="to-map"',
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8 9 5l6 3 6-3v11l-6 3-6-3-6 3z"/><path d="M9 5v11"/><path d="M15 8v11"/></svg>', 'Mapa', 'dónde')}
        ${opt('twin', `#/twin?b=${encodeURIComponent(twinB)}${q ? '&' + q : ''}`, 'data-cmap="to-twin" data-constellation="to-twin"',
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V8l6-4 6 4v13"/><path d="M6 21h12"/><path d="M10 12h1M13 12h1M10 16h1M13 16h1"/></svg>', 'Edificio', 'el lugar')}
        ${opt('constellation', `#/constellation${q ? '?' + q : ''}`, 'data-cmap="to-constellation" data-twin="to-constellation"',
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="16" r="2.2"/><circle cx="12" cy="6" r="2.2"/><circle cx="19" cy="13" r="2.2"/><path d="M7.8 14.6 10.6 8"/><path d="M13.9 7.4 17.2 11.6"/><path d="M8.2 16.2 16.8 13.6"/></svg>', 'Constelación', 'relaciones')}
      </div>`;
  }

  function template(params) {
    const c = State.community();
    const chips = c.examples.map(ex => `<button class="chip-btn" type="button" data-cmap="try" data-text="${esc(ex.text)}">${esc(ex.label)}</button>`).join('');
    return `
      <section class="cmap" aria-labelledby="cmap-title">
        <a class="back" href="#/">← Inicio</a>
        <p class="eyebrow">${esc(c.name)} · ${c.members} vecinos</p>
        <h1 id="cmap-title" class="page__title">Mapa de mi comunidad</h1>
        <p class="page__sub">Las personas, lo que tienen y lo que necesitan existen a unos pasos unas de otras. Cuenta una situación y verás solo a quien puede ayudarte. Toca una torre para entrar al edificio.</p>
        ${viewSwitch('map', params)}
        <form class="cmap__form" data-form="cmap" novalidate>
          <label class="sr-only" for="cmap-input">Cuéntanos tu situación</label>
          <textarea id="cmap-input" name="situation" rows="2" placeholder="${esc(c.placeholders[3] || c.placeholders[0])}" autocomplete="off">${esc(params.q || '')}</textarea>
          <button class="btn btn--primary btn--sm" type="submit">Ver quién está cerca</button>
        </form>
        <div class="examples examples--dark"><span class="examples__label">Prueba con:</span><div class="examples__list">${chips}</div></div>
        <div class="cmap__stage">
          <canvas class="cmap__canvas" aria-hidden="true"></canvas>
          <div class="cmap__tip" hidden></div>
          <div class="cmap__caption is-in" role="status" aria-live="polite"></div>
          <div class="cmap__tools">
            <button class="cmap__tool" type="button" data-cmap="zoom-in" title="Acercar"><span aria-hidden="true">+</span><span class="sr-only">Acercar</span></button>
            <button class="cmap__tool" type="button" data-cmap="zoom-out" title="Alejar"><span aria-hidden="true">−</span><span class="sr-only">Alejar</span></button>
            <button class="cmap__tool" type="button" data-cmap="fit-near" title="Volver a mi zona"><span aria-hidden="true">⌖</span><span class="sr-only">Volver a mi zona</span></button>
            <button class="cmap__tool" type="button" data-cmap="fit-all" title="Ver toda la comunidad"><span aria-hidden="true">⤢</span><span class="sr-only">Ver toda la comunidad</span></button>
          </div>
        </div>
        <div class="cmap__layers" role="group" aria-label="Capas del mapa">
          <button class="cmap__layer" type="button" data-cmap="layer" data-layer="people" aria-pressed="true"><i class="cmap__swatch cmap__swatch--people"></i>Personas</button>
          <button class="cmap__layer" type="button" data-cmap="layer" data-layer="resources" aria-pressed="true"><i class="cmap__swatch cmap__swatch--resources"></i>Recursos</button>
          <button class="cmap__layer" type="button" data-cmap="layer" data-layer="needs" aria-pressed="true"><i class="cmap__swatch cmap__swatch--needs"></i>Necesidades</button>
          ${circleOptions()}
        </div>
        <div class="cmap__actions btn-row"></div>
        <div class="cmap__summary"></div>
        <p class="muted small cmap__foot">${esc(COPY.privacy)} Nunca se muestra un número de departamento, un domicilio ni una ubicación exacta.</p>
      </section>`;
  }

  /* ---- Acciones ---- */
  function positions() {
    const out = {};
    marks.forEach(m => { if (m.kind !== 'household') { const p = markPos(m); out[m.id] = { fx: p.x / W, fy: p.y / H }; } });
    return out;
  }

  function handleAction(e) {
    const el = e.target.closest('[data-cmap]');
    if (!el || !root || !root.contains(el)) return;
    const a = el.dataset.cmap;
    e.preventDefault();
    if (a === 'to-twin') {
      const b = (typeof CommunityTwin !== 'undefined' && CommunityTwin.lastBuilding()) || State.user().building || 'central';
      const q = storyQuery();
      location.hash = `/twin?b=${encodeURIComponent(b)}${q ? '&' + q : ''}`;
      return;
    }
    if (a === 'to-constellation') {
      /* Mapa → Constelación: la misma situación (si hay) y las posiciones actuales viajan con el usuario. */
      ViewHandoff.set({ from: 'map', positions: positions() });
      const s = story && story.situation;
      const q = s ? (s.id && s.id !== 'preview' ? `?s=${encodeURIComponent(s.id)}` : `?q=${encodeURIComponent(s.text)}`) : '';
      location.hash = `/constellation${q}`;
      return;
    }
    if (a === 'try') { const input = root.querySelector('#cmap-input'); if (input) input.value = el.dataset.text; preview(el.dataset.text); }
    else if (a === 'clear') clearStory();
    else if (a === 'resolve') { if (story && typeof App !== 'undefined' && App.submitSituation) App.submitSituation(story.situation.text); }
    else if (a === 'zoom-in') zoomBy(1.4);
    else if (a === 'zoom-out') zoomBy(1 / 1.4);
    else if (a === 'fit-near') fitNear();
    else if (a === 'fit-all') fitAll();
    else if (a === 'layer') {
      const key = el.dataset.layer;
      layers[key] = !layers[key];
      el.setAttribute('aria-pressed', String(layers[key]));
    }
  }

  function handleChange(e) {
    if (e.target.name !== 'cmap-circle' || !root || !root.contains(e.target)) return;
    layers.circle = e.target.value || '';
    const c = circleMembers();
    if (c && c.members.length) fitMarks(c.members.map(id => byId.get(id)).filter(Boolean));
  }

  function handleSubmit(e) {
    const form = e.target.closest('[data-form="cmap"]');
    if (!form || !root || !root.contains(form)) return;
    e.preventDefault();
    const input = form.querySelector('textarea');
    const text = (input.value || '').trim();
    if (!text) { input.focus(); return; }
    preview(text);
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'cmap-input') {
      e.preventDefault();
      const form = e.target.closest('form');
      if (form) form.requestSubmit ? form.requestSubmit() : handleSubmit({ target: form, preventDefault() {} });
    }
  }

  function preview(text) {
    const understanding = Resolver.understandSituation(text);
    const needs = Resolver.discoverNeeds(understanding);
    show({ id: 'preview', text, understanding, needs, excluded: [] });
    const stage = root.querySelector('.cmap__stage');
    if (stage && mobile) stage.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---- Montaje / desmontaje ---- */
  function resize() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(280, Math.round(rect.width)), h = Math.round(rect.height);
    DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2);
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    spriteCache.clear();
  }
  let resizeTimer = 0;
  function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); }

  function mount(main, params) {
    dispose();
    const p = params || {};
    reduced = UI.reducedMotion();
    mobile = window.innerWidth < 640 || (navigator.maxTouchPoints > 0 && window.innerWidth < 900);
    main.innerHTML = template(p);
    root = main.querySelector('.cmap');
    canvas = root.querySelector('canvas');
    ctx = canvas.getContext('2d', { alpha: false });
    W = H = 0;
    resize();
    buildMarks();
    fitNear(true);
    layers = { people: true, resources: true, needs: true, circle: '' };
    wideShown = false;

    /* Llegada desde la constelación: cada persona viaja desde donde estaba en el cielo hasta su edificio. */
    const h = ViewHandoff.take();
    if (h && h.from === 'constellation' && h.positions) {
      const at = now();
      marks.forEach(m => { const q = h.positions[m.id]; if (q) { m.from = { x: q.fx * W, y: q.fy * H }; m.arriveAt = at; } });
      arrive = { at };
      root.querySelector('.cmap__stage').classList.add('is-arriving');
    }

    setCaption('idle');
    bindPointer();
    on(window, 'resize', onResize);
    on(document, 'click', handleAction);
    on(document, 'change', handleChange);
    on(document, 'submit', handleSubmit, true);
    on(document, 'keydown', handleKey);
    on(document, 'visibilitychange', () => { visible = !document.hidden; });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => { visible = entries.some(en => en.isIntersecting) && !document.hidden; }, { threshold: 0.05 });
      io.observe(canvas);
      listeners.push(() => io.disconnect());
    }
    hashListener = () => { if (Router.current().path !== ROUTE) dispose(); };
    window.addEventListener('hashchange', hashListener);
    running = true; lastT = 0;
    raf = requestAnimationFrame(frame);

    const delay = h ? 1200 : 500;
    if (p.s) {
      const s = State.getSituation(p.s);
      if (s && s.understanding.kind !== 'helping') later(() => show(s), delay);
    } else if (p.q) {
      later(() => preview(p.q), delay);
    }
  }

  function dispose() {
    running = false;
    cancelAnimationFrame(raf);
    clearTimeout(resizeTimer);
    clearTimers();
    listeners.forEach(off => off());
    listeners = [];
    if (hashListener) { window.removeEventListener('hashchange', hashListener); hashListener = null; }
    story = null; mode = 'idle'; hovered = null; selected = null; pointerState = null; arrive = null;
    marks = []; links = []; byId = new Map();
    root = null; canvas = null; ctx = null;
  }

  return { mount, dispose, show, preview, clear: clearStory, viewSwitch, ROUTE, _debug: () => ({ marks, links, story, mode, cam, W, H }) };
})();
