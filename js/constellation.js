/* ==========================================================================
   constellation.js — Community Constellation.

   La comunidad como una constelación viva. Cada persona es un nodo; lo que
   sabe, tiene o suele hacer gira a su alrededor. Cuando el usuario cuenta una
   situación, la necesidad crea gravedad: las capacidades compatibles son
   atraídas hacia ella, el resto se atenúa y aparecen conexiones.

   La historia que cuenta: "La solución ya estaba ahí. Solo no la veías."

   Es un módulo aislado. Lee del grafo (State.graph) y del pipeline
   (Resolver.resolve) sin modificarlos; nunca toca State salvo cuando el
   usuario comparte un objeto desde la cámara (State.learnUserCapability),
   que es exactamente lo mismo que ya hace una oferta resuelta.

   Capa de confianza (js/trust.js, js/verification.js), si está cargada:
     · relaciones persona↔persona como líneas persistentes (Trust.relations,
       Trust.strengthOf); las relaciones fuertes acercan el nodo al usuario
     · círculos activos iluminados durante una situación (Trust.activeCircles)
     · tooltip con señales humanas (Trust.signals, Verification.labels)
     · "lazo fortalecido" al volver tras resolver algo con alguien
   Nunca se muestra un número de confianza ni un ranking.

   Ruta: #/constellation            constelación en reposo
         #/constellation?s=<id>     con una situación ya guardada
   API:  Constellation.mount(main, params) · Constellation.dispose()

   Canvas 2D con profundidad (paralaje por capas) en vez de WebGL: cero
   dependencias, corre en cualquier móvil y el resultado es cálido, no
   "sci-fi". Los halos se cachean como sprites para mantener 60 fps.
   ========================================================================== */

const Constellation = (() => {
  const ROUTE = '/constellation';
  const SOUND_KEY = 'entre-todos:constellation-sound';

  /* Paleta (misma identidad que css/styles.css) */
  const C = {
    cream: '#F7F1E6', paper: '#FFFDF9', amarillo: '#EFB94B', amarilloSoft: '#FBEFD1',
    terracota: '#C55E3E', terracotaLight: '#E07A5A', verde: '#586D53', verdeDark: '#304431',
    sage: '#9DB58F', tierra: '#A9825E', ink: '#2B221B'
  };
  const TONES = { 1: '#D96F4F', 2: '#5E7A59', 3: '#D9A03A', 4: '#B98D64', 5: '#7F927B' };
  const KIND_COLOR = {
    object: C.amarillo, skill: C.terracotaLight, knowledge: C.sage, time: C.cream,
    route: '#F2C48D', contact: '#D9A066', food: '#F3A18A', context: '#E8D3A0'
  };

  /* ---- Estado del módulo ---- */
  let root = null;        /* contenedor de la vista */
  let canvas = null;
  let ctx = null;
  let raf = 0;
  let running = false;
  let W = 0, H = 0, DPR = 1;
  let nodes = [];         /* todos los nodos: persona, capacidad, necesidad, abierto, polvo */
  let byId = new Map();
  let links = [];         /* conexiones dibujadas */
  let pulses = [];        /* destellos que viajan por una conexión (comunidad viva) */
  let mode = 'idle';      /* idle | situation */
  let story = null;       /* situación activa y su guion */
  let pointer = { x: 0, y: 0, tx: 0, ty: 0, inside: false };
  let hovered = null;
  let lastT = 0;
  let breath = 0;
  let nextPulseAt = 0;
  let visible = true;
  let listeners = [];
  let imageCache = new Map();
  let spriteCache = new Map();
  let reduced = false;
  let mobile = false;
  let timeouts = [];
  let hashListener = null;
  let relLinks = [];      /* relaciones persona↔persona (Trust) */
  const hasTrust = () => typeof Trust !== 'undefined' && typeof Trust.relations === 'function';

  /* ------------------------------------------------------------------
     Utilidades
     ------------------------------------------------------------------ */
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function later(fn, ms) {
    const id = setTimeout(fn, reduced ? Math.min(ms, 40) : ms);
    timeouts.push(id);
    return id;
  }

  function clearTimers() {
    timeouts.forEach(clearTimeout);
    timeouts = [];
  }

  /* Halo suave cacheado como sprite (radio en px CSS). */
  function glowSprite(color, radius) {
    const key = `${color}-${Math.round(radius)}`;
    let s = spriteCache.get(key);
    if (s) return s;
    const size = Math.ceil(radius * 2 * DPR) + 2;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, rgba(color, 0.55));
    grad.addColorStop(0.35, rgba(color, 0.22));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    s = { canvas: c, size };
    spriteCache.set(key, s);
    return s;
  }

  function drawGlow(x, y, radius, color, alpha) {
    if (alpha <= 0.01) return;
    const s = glowSprite(color, radius);
    ctx.globalAlpha = alpha;
    ctx.drawImage(s.canvas, x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------
     Sonido: una nota sutil por conexión; un acorde por solución multipersona
     ------------------------------------------------------------------ */
  const Sound = (() => {
    let actx = null;
    let enabled = false;
    const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]; /* pentatónica mayor, cálida */

    function load() {
      try { enabled = localStorage.getItem(SOUND_KEY) === 'on'; } catch (e) { enabled = false; }
      return enabled;
    }
    function set(on) {
      enabled = on;
      try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch (e) { /* sin persistencia */ }
      if (on) ensure();
    }
    function ensure() {
      if (!enabled) return null;
      try {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
        return actx;
      } catch (e) { return null; }
    }
    function tone(freq, at, dur, gain) {
      const a = ensure();
      if (!a) return;
      const t = a.currentTime + at;
      const osc = a.createOscillator();
      const osc2 = a.createOscillator();
      const g = a.createGain();
      const f = a.createBiquadFilter();
      osc.type = 'sine'; osc.frequency.value = freq;
      osc2.type = 'triangle'; osc2.frequency.value = freq * 2; /* armónico suave */
      f.type = 'lowpass'; f.frequency.value = 1800;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      const g2 = a.createGain(); g2.gain.value = 0.18;
      osc.connect(f); osc2.connect(g2); g2.connect(f); f.connect(g); g.connect(a.destination);
      osc.start(t); osc2.start(t);
      osc.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05);
    }
    function note(i) { tone(SCALE[i % SCALE.length], 0, 1.4, 0.09); }
    function chord(n) {
      const base = [0, 2, 4, 5, 7];
      base.slice(0, clamp(n, 2, 5)).forEach((s, i) => tone(SCALE[s], i * 0.07, 2.4, 0.07));
    }
    function isOn() { return enabled; }
    return { load, set, isOn, note, chord, ensure };
  })();

  /* ------------------------------------------------------------------
     Construcción de nodos a partir del grafo
     ------------------------------------------------------------------ */
  function personColor(p) { return TONES[p.tone] || TONES[3]; }

  function buildNodes() {
    const g = State.graph();
    const people = [g.user].concat(g.people);
    nodes = [];
    byId = new Map();
    links = [];
    pulses = [];

    /* Polvo lejano: da profundidad al paralaje, casi invisible */
    const dust = mobile ? 18 : 34;
    for (let i = 0; i < dust; i++) {
      nodes.push({ id: `dust-${i}`, type: 'dust', x: Math.random() * W, y: Math.random() * H, z: -1 - Math.random() * 0.6, r: 0.8 + Math.random() * 1.2, phase: Math.random() * Math.PI * 2 });
    }

    const pr = mobile ? 13 : 15;
    people.forEach(p => {
      const n = {
        id: p.id, type: 'person', person: p, isUser: p.id === g.user.id,
        x: 0, y: 0, vx: 0, vy: 0, z: (Math.random() - 0.5) * 0.6, r: pr,
        home: { x: 0, y: 0 }, target: null, act: 0.8, actT: 0.8, color: personColor(p),
        phase: Math.random() * Math.PI * 2, caps: []
      };
      nodes.push(n);
      byId.set(n.id, n);
      p.capabilities.forEach((c, i) => {
        const strong = c.evidence && c.evidence.count >= 3;
        const cn = {
          id: c.id, type: 'cap', cap: c, owner: n, index: i,
          x: 0, y: 0, vx: 0, vy: 0, z: n.z + (Math.random() - 0.5) * 0.3, r: (mobile ? 3.4 : 4) + (strong ? 1.2 : 0),
          color: KIND_COLOR[c.kind] || C.cream, act: 0.8, actT: 0.8, target: null,
          orbit: (mobile ? 24 : 30) + (i % 2) * 8 + Math.random() * 6, speed: (0.12 + Math.random() * 0.1) * (i % 2 ? -1 : 1),
          angle: Math.random() * Math.PI * 2, spawn: 1
        };
        n.caps.push(cn);
        nodes.push(cn);
        byId.set(cn.id, cn);
      });
    });

    layoutHomes(people);
    nodes.forEach(n => {
      if (n.type === 'person') { n.x = n.home.x; n.y = n.home.y; }
    });
    nodes.filter(n => n.type === 'cap').forEach(placeCapAtOrbit);
    relLinks = relationsList();
  }

  /* Relaciones del Trust Graph entre nodos presentes. La fuerza es interna: solo modula grosor, alpha y cercanía. */
  function relationsList() {
    if (!hasTrust()) return [];
    const out = [];
    Trust.relations().forEach(r => {
      const a = byId.get(r.a), b = byId.get(r.b);
      if (a && b && a.type === 'person' && b.type === 'person') out.push({ a, b, rel: r, strength: Trust.strengthOf(r) });
    });
    return out;
  }

  /* Posiciones base: distancias aproximadas del grafo (offset en metros), normalizadas
     y relajadas para que nadie se encime. No es un mapa: solo conserva "quién está cerca de quién". */
  function layoutHomes(people) {
    const pad = mobile ? 44 : 64;
    /* Con offsets (comunidad con capa geográfica) los usamos; si no, distancia aproximada en anillos con ángulo áureo. */
    const pts = people.map((p, i) => {
      if (p.offset) return { id: p.id, x: p.offset.x || 0, y: -(p.offset.y || 0) };
      const d = p.distance == null ? 120 : p.distance;
      const a = i * 2.399963;
      return { id: p.id, x: Math.cos(a) * (40 + d), y: Math.sin(a) * (40 + d) };
    });
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
    const usableW = W - pad * 2, usableH = H - pad * 2 - 66;
    const scale = Math.min(usableW / spanX, usableH / spanY) * 0.92;
    const cx = W / 2, cy = H / 2 - 24;
    const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    pts.forEach((p, i) => {
      const a = i * 2.399963; /* ángulo áureo: jitter estable y orgánico */
      p.x = cx + (p.x - mx) * scale + Math.cos(a) * 18;
      p.y = cy + (p.y - my) * scale + Math.sin(a) * 18;
    });
    /* Después de varias interacciones la red se aprieta: quien tiene relación con el usuario se acerca a él. */
    if (hasTrust()) {
      const meId = State.user().id;
      const me = pts.find(p => p.id === meId);
      if (me) Trust.relations().forEach(r => {
        const other = r.a === meId ? r.b : (r.b === meId ? r.a : null);
        const q = other && pts.find(p => p.id === other);
        if (!q) return;
        const k = Trust.strengthOf(r) * 0.55;
        q.x += (me.x - q.x) * k; q.y += (me.y - q.y) * k;
      });
    }
    const minD = mobile ? 66 : 86;
    const meIdx = pts.findIndex(p => p.id === State.user().id);
    const pull = {};
    if (hasTrust()) pts.forEach(p => { if (p.id !== State.user().id) pull[p.id] = Trust.strength(p.id); });
    for (let it = 0; it < 60; it++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
          const d = Math.hypot(dx, dy) || 0.01;
          /* Con el usuario, un lazo fuerte permite estar más cerca */
          const other = i === meIdx ? pts[j].id : (j === meIdx ? pts[i].id : null);
          const lim = other ? minD * (1 - 0.4 * (pull[other] || 0)) : minD;
          if (d < lim) {
            const push = (lim - d) / 2 * 0.5;
            const ux = dx / d, uy = dy / d;
            pts[i].x -= ux * push; pts[i].y -= uy * push;
            pts[j].x += ux * push; pts[j].y += uy * push;
          }
        }
        pts[i].x = clamp(pts[i].x, pad, W - pad);
        pts[i].y = clamp(pts[i].y, pad, H - pad - 58);
      }
    }
    pts.forEach(p => { const n = byId.get(p.id); if (n) n.home = { x: p.x, y: p.y }; });
  }

  function placeCapAtOrbit(cn) {
    cn.x = cn.owner.x + Math.cos(cn.angle) * cn.orbit;
    cn.y = cn.owner.y + Math.sin(cn.angle) * cn.orbit;
  }

  /* ------------------------------------------------------------------
     Guion de una situación: la necesidad crea gravedad
     ------------------------------------------------------------------ */
  function clearStory() {
    clearTimers();
    story = null;
    mode = 'idle';
    nodes = nodes.filter(n => n.type !== 'need' && n.type !== 'open' && n.type !== 'center');
    byId.forEach((n, id) => { if (n.type === 'need' || n.type === 'open' || n.type === 'center') byId.delete(id); });
    links = links.filter(l => l.kind === 'alive');
    nodes.forEach(n => {
      if (n.type === 'person' || n.type === 'cap') { n.actT = 0.8; n.target = null; n.matched = false; n.alt = false; n.inCircle = false; }
    });
    setCaption('idle');
    setActions('idle');
    setSummary('');
  }

  /* situation: { id?, text, understanding, needs, excluded } — persistida o efímera */
  function show(situation) {
    clearStory();
    mode = 'situation';
    const u = situation.understanding;
    const result = Resolver.resolve(situation, State.graph());
    const cx = W / 2, cy = H / 2 - (mobile ? 22 : 26);
    const center = { id: 'center', type: 'center', x: cx, y: cy, z: 0, r: 0, born: now(), icon: u.icon || '🤝', act: 0, actT: 1 };
    nodes.push(center); byId.set('center', center);
    story = { situation, result, center, needNodes: [], steps: [], stage: 0, done: false, playedChord: false, notes: 0, ephemeral: !situation.id || situation.id === 'preview' };

    if (u.kind === 'need') planNeed(story, cx, cy);
    else planOpportunity(story, cx, cy);

    nodes.forEach(n => { if ((n.type === 'person' || n.type === 'cap') && !n.matched && !n.alt) n.actT = 0.14; });
    planCircles(story);
    setCaption('thinking', u);
    setActions('story');
    runStory(story);
  }

  /* Círculos que se iluminan con esta situación (amigas para un vestido, red de apoyo para acompañar a mamá). */
  function planCircles(st) {
    st.circles = [];
    st.circleLabels = [];
    if (!hasTrust() || st.situation.understanding.kind !== 'need') return;
    const ac = Trust.activeCircles(st.situation.understanding, st.situation.needs);
    const people = nodes.filter(n => n.type === 'person' && !n.isUser);
    const list = (ac.explicit || []).concat(ac.emergent || []).map(c => {
      const members = (c.members || []).map(id => byId.get(id)).filter(n => n && n.type === 'person');
      return { id: c.id, label: c.label, members, sensitive: Boolean(c.sensitive) };
    }).filter(c => c.members.length && c.members.length < people.length * 0.75);
    st.circles = list.slice(0, 2);
    st.circleLabels = st.circles.map(c => c.label);
    st.circles.forEach(c => c.members.forEach(n => {
      n.inCircle = true;
      if (!n.matched) n.actT = Math.max(n.actT, 0.42);
    }));
  }

  function ringRadius(n) {
    const base = Math.min(W, H) * (mobile ? 0.2 : 0.22);
    return n <= 1 ? 0 : clamp(base, 64, 130);
  }

  function planNeed(st, cx, cy) {
    const { needs, solutions } = st.result;
    const ordered = needs.slice();
    const R = ringRadius(ordered.length);
    /* Un paso por necesidad, tomando el mejor entre todas las estrategias (bici: reparar · prestada · taller). */
    const stepFor = {};
    const altFor = {};
    solutions.forEach(sol => {
      sol.steps.concat(sol.extras).forEach(s => {
        if (!stepFor[s.needId]) { stepFor[s.needId] = s; altFor[s.needId] = s.alternatives || []; }
      });
    });
    ordered.forEach((need, i) => {
      const a = -Math.PI / 2 + (i / ordered.length) * Math.PI * 2;
      const nn = {
        id: `need-${need.id}`, type: 'need', need, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, z: 0.1,
        r: mobile ? 9 : 11, born: null, act: 0, actT: 1, covered: Boolean(stepFor[need.id]), optional: need.priority === 'optional', index: i
      };
      nodes.push(nn); byId.set(nn.id, nn);
      st.needNodes.push(nn);
      const step = stepFor[need.id];
      if (step) {
        const cap = byId.get(step.capabilityId);
        const person = byId.get(step.personId);
        if (cap && person) {
          cap.matched = true; person.matched = true;
          /* alternatives son personas ("Si no puede: …"), no capacidades */
          const alternatives = (altFor[need.id] || []).map(id => byId.get(id)).filter(a => a && a.type === 'person');
          st.steps.push({ need: nn, cap, person, because: step.because, alternatives });
          alternatives.forEach(alt => { if (!alt.matched) alt.alt = true; });
        }
      }
    });
    /* Objetivos: la persona se acerca desde su lado; su capacidad se coloca entre ella y la necesidad. */
    const perPerson = new Map();
    st.steps.forEach(s => { (perPerson.get(s.person) || perPerson.set(s.person, []).get(s.person)).push(s.need); });
    perPerson.forEach((needList, person) => {
      const mx = needList.reduce((a, n) => a + n.x, 0) / needList.length;
      const my = needList.reduce((a, n) => a + n.y, 0) / needList.length;
      let dx = person.home.x - mx, dy = person.home.y - my;
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      /* Si la persona está casi en el centro, empújala hacia fuera del anillo */
      const out = R + (mobile ? 62 : 80);
      let tx = mx + dx * (mobile ? 64 : 82), ty = my + dy * (mobile ? 64 : 82);
      if (Math.hypot(tx - cx, ty - cy) < out) { tx = cx + (tx - cx) / (Math.hypot(tx - cx, ty - cy) || 1) * out; ty = cy + (ty - cy) / (Math.hypot(tx - cx, ty - cy) || 1) * out; }
      person.target = { x: clamp(tx, 30, W - 30), y: clamp(ty, 30, H - 74) };
    });
    /* Que dos personas atraídas no se encimen: separación mínima entre objetivos */
    const targets = Array.from(perPerson.keys()).map(p => p.target);
    const minD = mobile ? 58 : 72;
    for (let it = 0; it < 40; it++) {
      for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
        const dx = targets[j].x - targets[i].x, dy = targets[j].y - targets[i].y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < minD) {
          const push = (minD - d) / 2, ux = dx / d, uy = dy / d;
          targets[i].x -= ux * push; targets[i].y -= uy * push; targets[j].x += ux * push; targets[j].y += uy * push;
        }
      }
      targets.forEach(t => { t.x = clamp(t.x, 30, W - 30); t.y = clamp(t.y, 30, H - 74); });
    }
    st.steps.forEach(s => {
      const pt = s.person.target;
      let dx = pt.x - s.need.x, dy = pt.y - s.need.y;
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      s.cap.target = { x: s.need.x + dx * (mobile ? 26 : 32), y: s.need.y + dy * (mobile ? 26 : 32) };
    });
    st.coverage = {
      covered: st.steps.filter(s => !s.need.optional).length,
      total: st.needNodes.filter(n => !n.optional).length
    };
  }

  function planOpportunity(st, cx, cy) {
    const user = byId.get(State.user().id);
    user.matched = true;
    user.target = { x: cx, y: cy };
    const opps = st.result.opportunities;
    const R = ringRadius(Math.max(2, opps.length));
    opps.forEach((o, i) => {
      const person = byId.get(o.personId);
      if (!person) return;
      const a = -Math.PI / 2 + (i / opps.length) * Math.PI * 2 + (opps.length === 1 ? Math.PI / 2 : 0);
      const on = {
        id: `open-${o.openId}`, type: 'open', open: o, owner: person, x: person.x, y: person.y, z: 0.1, vx: 0, vy: 0,
        r: mobile ? 7 : 8, act: 0, actT: 1, born: null, covered: true, index: i,
        target: { x: cx + Math.cos(a) * (R * 0.55), y: cy + Math.sin(a) * (R * 0.55) }
      };
      nodes.push(on); byId.set(on.id, on);
      person.matched = true;
      person.target = { x: clamp(cx + Math.cos(a) * (R + (mobile ? 40 : 56)), 30, W - 30), y: clamp(cy + Math.sin(a) * (R + (mobile ? 40 : 56)), 30, H - 40) };
      st.needNodes.push(on);
      st.steps.push({ need: on, cap: on, person, because: o.text, alternatives: [], fromUser: true });
    });
    st.coverage = { covered: opps.length, total: opps.length };
  }

  function runStory(st) {
    const u = st.situation.understanding;
    const gap = reduced ? 30 : 1;
    let t = 700 * gap;
    /* 1. Las necesidades florecen una a una */
    st.needNodes.forEach((nn, i) => {
      later(() => { nn.born = now(); }, t + i * 360 * gap);
    });
    t += st.needNodes.length * 360 * gap + 500 * gap;
    later(() => setCaption('searching', u, st), t - 400 * gap);
    /* 2. Cada capacidad compatible despierta, es atraída y se conecta */
    st.steps.forEach((s, i) => {
      later(() => {
        s.cap.actT = 1; s.person.actT = 1;
        s.cap.wake = now(); s.person.wake = now();
        s.alternatives.forEach(a => { if (!a.matched) a.actT = Math.max(a.actT, 0.45); });
        s.person.caps.forEach(c => { if (!c.matched) c.actT = Math.max(c.actT, 0.55); });
        const link = { kind: 'solution', from: s.fromUser ? st.center : s.need, to: s.cap, progress: 0, born: now(), alpha: 1, index: i, step: s };
        links.push(link);
        s.alternatives.forEach(a => links.push({ kind: 'alt', from: s.need, to: a, progress: 0, born: now() + 300, alpha: 0.35 }));
        later(() => { Sound.note(st.notes++); s.need.hit = now(); }, reduced ? 10 : 640);
      }, t + i * 560 * gap);
    });
    t += st.steps.length * 560 * gap + 900 * gap;
    /* 3. Cobertura y cierre */
    later(() => {
      setCaption('coverage', u, st);
      setSummary(summaryHtml(st));
      st.done = true;
      const people = new Set(st.steps.map(s => s.person.id));
      if (people.size >= 2 && !st.playedChord) { st.playedChord = true; Sound.chord(people.size); }
      st.center.done = now();
    }, t);
    later(() => { if (story === st) setCaption('closing', u, st); }, t + 2300 * gap);
  }

  /* ------------------------------------------------------------------
     Simulación
     ------------------------------------------------------------------ */
  function now() { return performance.now(); }

  function step(dt) {
    const k = clamp(dt / 16.67, 0.25, 2.2);
    breath += dt * 0.0011;
    pointer.x = lerp(pointer.x, pointer.tx, 0.06 * k);
    pointer.y = lerp(pointer.y, pointer.ty, 0.06 * k);
    const cx = W / 2, cy = H / 2;
    const ringR = story ? ringRadius(story.needNodes.length) : 0;

    nodes.forEach(n => {
      if (n.type === 'dust') return;
      n.act = lerp(n.act, n.actT, (reduced ? 0.4 : 0.05) * k);
      if (n.type === 'person') {
        let tx, ty;
        if (n.target) { tx = n.target.x; ty = n.target.y; }
        else {
          tx = n.home.x; ty = n.home.y;
          if (mode === 'situation') {
            /* Lo que no participa se aparta un poco para dejar sitio a la solución. */
            const dx = n.home.x - cx, dy = n.home.y - cy;
            const d = Math.hypot(dx, dy) || 1;
            const minR = ringR + (mobile ? 70 : 96);
            if (d < minR) { tx = cx + dx / d * minR; ty = cy + dy / d * minR; }
          }
          if (!reduced) { tx += Math.sin(breath * 0.7 + n.phase) * 3; ty += Math.cos(breath * 0.5 + n.phase) * 3; }
        }
        const spring = n.target ? 0.028 : 0.02;
        n.vx = (n.vx + (tx - n.x) * spring * k) * Math.pow(0.86, k);
        n.vy = (n.vy + (ty - n.y) * spring * k) * Math.pow(0.86, k);
        if (reduced) { n.x = tx; n.y = ty; n.vx = n.vy = 0; }
        else { n.x += n.vx * k; n.y += n.vy * k; }
        n.x = clamp(n.x, 24, W - 24); n.y = clamp(n.y, 24, H - 62);
      } else if (n.type === 'cap') {
        if (n.spawn < 1) n.spawn = Math.min(1, n.spawn + dt / 1400);
        if (n.target) {
          n.vx = (n.vx + (n.target.x - n.x) * 0.05 * k) * Math.pow(0.8, k);
          n.vy = (n.vy + (n.target.y - n.y) * 0.05 * k) * Math.pow(0.8, k);
          if (reduced) { n.x = n.target.x; n.y = n.target.y; } else { n.x += n.vx * k; n.y += n.vy * k; }
        } else {
          n.angle += n.speed * dt / 1000 * (reduced ? 0 : 1);
          const ox = n.owner.x + Math.cos(n.angle) * n.orbit;
          const oy = n.owner.y + Math.sin(n.angle) * n.orbit;
          if (n.spawn < 1) { const e = easeOut(n.spawn); n.x = lerp(n.x, ox, e * 0.12 * k); n.y = lerp(n.y, oy, e * 0.12 * k); }
          else { n.x = lerp(n.x, ox, 0.25 * k); n.y = lerp(n.y, oy, 0.25 * k); }
        }
      } else if (n.type === 'open') {
        const tx = n.born ? n.target.x : n.owner.x, ty = n.born ? n.target.y : n.owner.y;
        n.vx = (n.vx + (tx - n.x) * 0.045 * k) * Math.pow(0.82, k);
        n.vy = (n.vy + (ty - n.y) * 0.045 * k) * Math.pow(0.82, k);
        if (reduced) { n.x = tx; n.y = ty; } else { n.x += n.vx * k; n.y += n.vy * k; }
      }
    });

    /* Conexiones: progreso del trazo */
    const tNow = now();
    links.forEach(l => {
      if (l.kind === 'alive') {
        l.progress = Math.min(1, (tNow - l.born) / 1400);
        if (tNow - l.born > 4200) l.dead = true;
      } else if (tNow >= l.born) {
        l.progress = Math.min(1, l.progress + dt / (reduced ? 60 : 640));
      }
    });
    links = links.filter(l => !l.dead);

    /* Comunidad viva: pequeños pulsos entre personas que se han ayudado */
    if (!reduced && tNow > nextPulseAt) {
      spawnAlivePulse();
      nextPulseAt = tNow + (mode === 'idle' ? 2400 : 5200) + Math.random() * 2600;
    }
  }

  function spawnAlivePulse() {
    const people = nodes.filter(n => n.type === 'person');
    if (people.length < 2) return;
    /* Pares reales primero: conexiones y situaciones resueltas de la sesión */
    const pairs = [];
    State.connections().filter(c => c.status !== 'asked').forEach(c => pairs.push([State.user().id, c.personId]));
    State.situations().forEach(s => (s.people || []).forEach(p => pairs.push([State.user().id, p])));
    let a, b;
    if (relLinks.length && Math.random() < 0.7) {
      /* Relación real, elegida con más probabilidad cuanto más fuerte */
      const total = relLinks.reduce((sum, l) => sum + 0.2 + l.strength, 0);
      let pick = Math.random() * total;
      const l = relLinks.find(x => (pick -= 0.2 + x.strength) <= 0) || relLinks[0];
      if (Math.random() < 0.5) { a = l.a; b = l.b; } else { a = l.b; b = l.a; }
    } else if (pairs.length && Math.random() < 0.45) {
      const pr = pairs[Math.floor(Math.random() * pairs.length)];
      a = byId.get(pr[1]); b = byId.get(pr[0]);
    } else {
      /* Quien tiene evidencia de haber ayudado, ayuda a alguien cerca */
      const helpers = people.filter(p => p.caps.some(c => c.cap.evidence && c.cap.evidence.count));
      a = helpers[Math.floor(Math.random() * helpers.length)] || people[0];
      const others = people.filter(p => p !== a).sort((p, q) => dist(p, a) - dist(q, a)).slice(0, 4);
      b = others[Math.floor(Math.random() * others.length)];
    }
    if (!a || !b || a === b) return;
    links.push({ kind: 'alive', from: a, to: b, progress: 0, born: now(), alpha: mode === 'idle' ? 0.5 : 0.22 });
  }

  /* ------------------------------------------------------------------
     Dibujo
     ------------------------------------------------------------------ */
  function px(n) { /* posición con paralaje por profundidad */
    const p = reduced ? 0 : 1;
    return { x: n.x + pointer.x * (n.z || 0) * 14 * p, y: n.y + pointer.y * (n.z || 0) * 10 * p };
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, '#3B322A');
    g.addColorStop(0.55, '#33352B');
    g.addColorStop(1, '#2A3A2E');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    /* Dos luces de atardecer, muy suaves */
    drawGlow(W * 0.15 + pointer.x * -20, H * 0.9, Math.max(W, H) * 0.55, '#8A4A2E', 0.28);
    drawGlow(W * 0.9 + pointer.x * -12, H * 0.05, Math.max(W, H) * 0.5, '#5F7A55', 0.26);
    /* Polvo lejano */
    nodes.forEach(n => {
      if (n.type !== 'dust') return;
      const p = px(n);
      const tw = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(breath * 2 + n.phase);
      ctx.globalAlpha = 0.08 + tw * 0.1;
      ctx.fillStyle = C.cream;
      ctx.beginPath(); ctx.arc(p.x, p.y, n.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function curve(a, b, bend) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: mx - dy / d * bend, y: my + dx / d * bend };
  }

  function quadAt(a, c, b, t) {
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  }

  function drawRelations() {
    relLinks.forEach(l => {
      const a = px(l.a), b = px(l.b);
      const act = Math.max(l.a.act, l.b.act);
      const alpha = (0.06 + l.strength * 0.3) * (0.3 + act * 0.7);
      const c = curve(a, b, Math.min(22, dist(a, b) * 0.1));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(C.amarilloSoft, alpha);
      ctx.lineWidth = 0.7 + l.strength * 1.8;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
  }

  function drawCircles() {
    if (!story || !story.circles || !story.circles.length) return;
    const age = (now() - story.center.born) / 1000;
    const a = easeOut(clamp((age - 0.6) / 1.2, 0, 1));
    if (a <= 0) return;
    story.circles.forEach((c, i) => {
      const pts = c.members.map(px);
      ctx.setLineDash([2, 5]);
      pts.forEach((p, j) => {
        const n = c.members[j];
        ctx.beginPath(); ctx.arc(p.x, p.y, n.r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(C.amarilloSoft, 0.45 * a); ctx.lineWidth = 1; ctx.stroke();
      });
      ctx.setLineDash([]);
      /* La etiqueta cuelga del miembro que no participa en la solución (o del primero), bajo su nombre */
      let k = c.members.findIndex(m => !m.matched);
      if (k < 0) k = 0;
      const anchor = pts[k], node = c.members[k];
      const label = c.sensitive ? `${c.label} · privado` : c.label;
      drawLabel(label, anchor.x, Math.min(anchor.y + node.r + 22, H - 86), { size: mobile ? 10.5 : 11.5, alpha: 0.85 * a, max: 34, lines: 1, color: C.amarilloSoft, weight: 600 });
    });
  }

  function drawLinks() {
    const tNow = now();
    drawRelations();
    links.forEach(l => {
      if (tNow < l.born) return;
      const a = px(l.from), b = px(l.to);
      const bend = l.kind === 'alive' ? Math.min(60, dist(a, b) * 0.18) : 10;
      const c = curve(a, b, bend);
      const prog = easeOut(l.progress);
      let alpha = l.alpha;
      if (l.kind === 'alive') {
        const age = tNow - l.born;
        alpha = l.alpha * (age < 1400 ? age / 1400 : Math.max(0, 1 - (age - 1400) / 2800));
      }
      ctx.lineCap = 'round';
      /* Trazo parcial de la curva */
      ctx.beginPath();
      const segs = 24;
      for (let i = 0; i <= segs; i++) {
        const t = (i / segs) * prog;
        const p = quadAt(a, c, b, t);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      if (l.kind === 'alt') {
        ctx.setLineDash([3, 6]);
        ctx.strokeStyle = rgba(C.cream, alpha * 0.6);
        ctx.lineWidth = 1;
      } else if (l.kind === 'alive') {
        ctx.setLineDash([]);
        ctx.strokeStyle = rgba(C.amarilloSoft, alpha * 0.5);
        ctx.lineWidth = 1;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = rgba(C.amarillo, alpha * 0.85);
        ctx.lineWidth = 1.7;
        ctx.shadowColor = rgba(C.amarillo, 0.5);
        ctx.shadowBlur = mobile ? 0 : 8;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
      /* Destello viajero */
      if (!reduced && l.kind !== 'alt') {
        let gt;
        if (l.kind === 'alive') gt = clamp((tNow - l.born) / 1400, 0, 1);
        else gt = l.progress < 1 ? l.progress : ((tNow - l.born) / 2600) % 1;
        const gp = quadAt(a, c, b, easeOut(gt));
        drawGlow(gp.x, gp.y, 9, C.amarilloSoft, l.kind === 'alive' ? alpha : 0.8);
        ctx.fillStyle = rgba(C.paper, l.kind === 'alive' ? alpha : 0.95);
        ctx.beginPath(); ctx.arc(gp.x, gp.y, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      /* Al llegar, la persona recibe un pequeño pulso */
      if (l.kind === 'alive' && l.progress >= 1 && !l.arrived) { l.arrived = true; l.to.hit = tNow; }
    });
    /* Ataduras capacidad → persona de los pasos activos */
    if (story) {
      story.steps.forEach(s => {
        if (s.fromUser || !s.cap.target) return;
        const a = px(s.cap), b = px(s.person);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = rgba(C.cream, 0.22 * s.cap.act);
        ctx.lineWidth = 1; ctx.stroke();
      });
    }
  }

  function drawCenter(n) {
    if (!story) return;
    const p = px(n);
    const age = (now() - n.born) / 1000;
    const grow = easeOut(clamp(age / 1.2, 0, 1));
    const br = reduced ? 0 : Math.sin(breath * 1.6) * 0.06;
    const R = (mobile ? 74 : 92) * grow * (1 + br) + (story.done ? 14 : 0);
    drawGlow(p.x, p.y, R, C.amarillo, 0.55);
    drawGlow(p.x, p.y, R * 0.45, C.amarilloSoft, 0.5);
    const single = story.needNodes.length <= 1;
    ctx.font = `${Math.round((mobile ? 26 : 30) * grow)}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = grow;
    ctx.fillText(n.icon, p.x, p.y - (single ? (mobile ? 28 : 34) : 0));
    ctx.globalAlpha = 1;
  }

  function drawNeed(n) {
    if (!n.born) return;
    const p = px(n);
    const age = (now() - n.born) / 1000;
    const s = reduced ? 1 : easeOutBack(clamp(age / 0.7, 0, 1));
    const r = n.r * s;
    const hit = n.hit ? clamp(1 - (now() - n.hit) / 900, 0, 1) : 0;
    if (n.covered) drawGlow(p.x, p.y, r * 3.2 + hit * 18, C.amarillo, 0.35 + hit * 0.4);
    ctx.beginPath(); ctx.arc(p.x, p.y, r + hit * 3, 0, Math.PI * 2);
    if (n.covered) {
      ctx.fillStyle = rgba(C.amarilloSoft, 0.92);
      ctx.fill();
      ctx.strokeStyle = rgba(C.amarillo, 0.95); ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = rgba(C.cream, 0.7); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.setLineDash([]);
    }
    /* Etiqueta */
    const label = n.need ? n.need.label : n.open.title;
    drawLabel(label, p.x, p.y + r + 6, { size: mobile ? 11 : 12, alpha: Math.min(1, s), max: mobile ? 18 : 22, color: C.cream, weight: n.covered ? 600 : 400 });
  }

  function drawLabel(text, x, y, o) {
    const size = o.size || 12;
    ctx.font = `${o.weight || 500} ${size}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'top';
    const words = String(text).split(' ');
    const lines = [];
    let cur = '';
    words.forEach(w => {
      if ((cur + ' ' + w).trim().length > (o.max || 20) && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    const shown = lines.slice(0, o.lines || 2);
    if (lines.length > shown.length) shown[shown.length - 1] = shown[shown.length - 1].replace(/,?\s*\S*$/, '…');
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    shown.forEach((ln, i) => {
      ctx.fillStyle = rgba(C.ink, 0.55);
      ctx.fillText(ln, x + 0.5, y + i * (size + 3) + 1);
      ctx.fillStyle = o.color || C.cream;
      ctx.fillText(ln, x, y + i * (size + 3));
    });
    ctx.globalAlpha = 1;
  }

  function drawCap(n) {
    const p = px(n);
    const a = n.act * (n.spawn < 1 ? easeOut(n.spawn) : 1);
    const z = 1 + (n.z || 0) * 0.15;
    const hv = hovered === n;
    const wake = n.wake ? clamp(1 - (now() - n.wake) / 900, 0, 1) : 0;
    const r = n.r * z * (1 + wake * 0.8) * (hv ? 1.3 : 1);
    drawGlow(p.x, p.y, r * 3.4 + wake * 14, n.color, (0.35 + wake * 0.5) * a);
    ctx.globalAlpha = a;
    if (n.cap.image) {
      const img = imageFor(n.cap.id, n.cap.image);
      const ir = Math.max(r, n.r) * 2.4;
      if (img && img.complete) {
        ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, ir, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, p.x - ir, p.y - ir, ir * 2, ir * 2); ctx.restore();
        ctx.strokeStyle = rgba(C.amarillo, 0.9); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, ir, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      ctx.fillStyle = n.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    /* Etiqueta cuando participa en la solución o al pasar el cursor */
    /* La etiqueta se muestra al despertar y se desvanece a los segundos (el resumen de abajo la conserva); al pasar el cursor vuelve. */
    let labelA = 0;
    if (hv) labelA = 1;
    else if (n.matched && n.target && n.act > 0.6 && n.wake) {
      const age = (now() - n.wake) / 1000;
      labelA = n.act * (reduced ? 1 : clamp(1 - (age - 4.2) / 1.2, 0, 1));
    }
    if (labelA > 0.02) {
      const dx = p.x - px(n.owner).x;
      const align = n.target ? (n.target.x < W / 2 ? 'right' : 'left') : (dx < 0 ? 'right' : 'left');
      const off = (r + 7) * (align === 'left' ? 1 : -1);
      drawLabel(n.cap.label, p.x + off, p.y - 7, { size: mobile ? 10.5 : 11.5, alpha: labelA, max: mobile ? 20 : 26, lines: 2, align, color: C.cream, weight: 500 });
    }
  }

  function drawPerson(n) {
    const p = px(n);
    const a = n.act;
    const z = 1 + (n.z || 0) * 0.12;
    const hv = hovered === n;
    const hit = n.hit ? clamp(1 - (now() - n.hit) / 1000, 0, 1) : 0;
    const wake = n.wake ? clamp(1 - (now() - n.wake) / 1000, 0, 1) : 0;
    const br = reduced ? 0 : Math.sin(breath * 1.3 + n.phase) * 0.035;
    const r = n.r * z * (1 + br + hit * 0.18 + wake * 0.25) * (hv ? 1.08 : 1);
    drawGlow(p.x, p.y, r * 2.8 + hit * 22 + wake * 20, n.color, (0.4 + hit * 0.5 + wake * 0.5) * a);
    if (n.isUser) drawGlow(p.x, p.y, r * 3.4, C.amarillo, 0.35 * a);
    ctx.globalAlpha = 0.35 + a * 0.65;
    ctx.fillStyle = n.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    if (n.isUser) { ctx.strokeStyle = rgba(C.amarillo, 0.95); ctx.lineWidth = 2; ctx.stroke(); }
    else { ctx.strokeStyle = rgba(C.cream, 0.35 * a); ctx.lineWidth = 1; ctx.stroke(); }
    ctx.fillStyle = C.paper;
    ctx.font = `700 ${Math.round(r * 0.8)}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n.person.initials, p.x, p.y + 0.5);
    ctx.globalAlpha = 1;
    const label = n.isUser ? 'Tú' : n.person.name;
    drawLabel(label, p.x, p.y + r + 5, { size: mobile ? 11 : 12, alpha: 0.25 + a * 0.75, max: 14, lines: 1, color: C.cream, weight: n.matched ? 700 : 500 });
  }

  function drawOpen(n) {
    if (!n.born) return;
    drawNeed(n);
  }

  function imageFor(id, src) {
    let img = imageCache.get(id);
    if (!img) { img = new Image(); img.src = src; imageCache.set(id, img); }
    return img;
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground();
    drawLinks();
    const center = byId.get('center');
    if (center) drawCenter(center);
    const order = nodes.filter(n => n.type !== 'dust').sort((a, b) => (a.z || 0) - (b.z || 0));
    order.forEach(n => {
      if (n.type === 'cap' && n.act < 0.05 && !n.matched) return;
      if (n.type === 'cap') drawCap(n);
    });
    drawCircles();
    order.forEach(n => { if (n.type === 'person') drawPerson(n); });
    order.forEach(n => { if (n.type === 'need') drawNeed(n); else if (n.type === 'open') drawOpen(n); });
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min(48, t - (lastT || t));
    lastT = t;
    if (visible) { step(dt); render(); }
    raf = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------
     Interacción: puntero, paralaje, tooltip
     ------------------------------------------------------------------ */
  function hitTest(x, y) {
    let best = null, bd = Infinity;
    nodes.forEach(n => {
      if (n.type === 'dust' || n.type === 'center') return;
      if (n.type === 'cap' && n.act < 0.3) return;
      if ((n.type === 'need' || n.type === 'open') && !n.born) return;
      const p = px(n);
      const d = Math.hypot(p.x - x, p.y - y);
      const tol = n.type === 'person' ? n.r + 8 : n.type === 'cap' ? 11 : n.r + 8;
      if (d < tol && d < bd) { best = n; bd = d; }
    });
    return best;
  }

  function tooltipHtml(n) {
    if (n.type === 'person') {
      const p = n.person;
      const signals = hasTrust() && !n.isUser ? Trust.signals(p.id, 'es', { max: 2 }) : [];
      const labels = typeof Verification !== 'undefined' && !n.isUser ? Verification.labels(p, 'es', { short: true }) : [];
      const caps = p.capabilities.slice(0, 2).map(c => esc(c.label)).join(' · ');
      const more = p.capabilities.length > 2 ? ` y ${p.capabilities.length - 2} más` : '';
      return `<strong>${esc(n.isUser ? 'Tú' : p.name)}</strong><span>${esc(UI.placeLine(p))}</span>`
        + signals.map(t => `<em>${esc(t)}</em>`).join('')
        + (labels.length ? `<span class="constellation__tip-verified">${esc(labels.join(' · '))}</span>` : '')
        + (caps ? `<span class="constellation__tip-caps">${caps}${more}</span>` : '');
    }
    if (n.type === 'cap') {
      const c = n.cap;
      const ev = c.evidence && c.evidence.label ? `<em>${esc(c.evidence.label)}</em>` : '';
      return `<strong>${esc(c.label)}</strong><span>${esc(n.owner.isUser ? 'Tú' : n.owner.person.name)}</span>${ev}`;
    }
    if (n.type === 'need') {
      const st = story && story.steps.find(s => s.need === n);
      const who = st ? `<em>${esc(st.person.person.name)}: ${esc(st.because)}</em>` : '<em>Esto sí tendrías que conseguirlo.</em>';
      return `<strong>${esc(n.need.label)}</strong>${n.need.why ? `<span>${esc(n.need.why)}</span>` : ''}${who}`;
    }
    if (n.type === 'open') {
      return `<strong>${esc(n.open.title)}</strong><span>${esc(n.owner.person.name)}</span><em>${esc(n.open.text)}</em>`;
    }
    return '';
  }

  function updateTooltip(n, x, y) {
    const tip = root.querySelector('.constellation__tip');
    if (!tip) return;
    if (!n) { tip.hidden = true; return; }
    tip.innerHTML = tooltipHtml(n);
    tip.hidden = false;
    const rect = canvas.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x + 14, top = y - th / 2;
    if (left + tw > rect.width - 8) left = x - tw - 14;
    top = clamp(top, 8, rect.height - th - 8);
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  function on(el, ev, fn, opts) {
    el.addEventListener(ev, fn, opts);
    listeners.push(() => el.removeEventListener(ev, fn, opts));
  }

  function bindPointer() {
    on(canvas, 'pointermove', e => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      pointer.tx = (x / r.width - 0.5) * 2;
      pointer.ty = (y / r.height - 0.5) * 2;
      pointer.inside = true;
      if (e.pointerType === 'touch') return;
      hovered = hitTest(x, y);
      canvas.style.cursor = hovered ? 'pointer' : 'default';
      updateTooltip(hovered, x, y);
    });
    on(canvas, 'pointerleave', () => { pointer.tx = pointer.ty = 0; hovered = null; updateTooltip(null); });
    on(canvas, 'pointerdown', e => {
      Sound.ensure();
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const n = hitTest(x, y);
      hovered = n;
      updateTooltip(n, x, y);
      if (n && n.type === 'person') n.hit = now();
    });
    /* Móvil: inclinación del dispositivo como paralaje suave (sin pedir permisos extra) */
    if (window.DeviceOrientationEvent && mobile && typeof DeviceOrientationEvent.requestPermission !== 'function') {
      on(window, 'deviceorientation', e => {
        if (e.gamma == null) return;
        pointer.tx = clamp(e.gamma / 30, -1, 1);
        pointer.ty = clamp((e.beta - 45) / 30, -1, 1);
      });
    }
  }

  /* ------------------------------------------------------------------
     Vista (HTML alrededor del canvas)
     ------------------------------------------------------------------ */
  const COPY = {
    idleTitle: 'Cada punto es alguien de tu comunidad.',
    idleSub: 'Lo que sabe, tiene o suele hacer gira a su alrededor. Cuenta una situación y mira cómo la comunidad se organiza alrededor de ella.',
    closing: 'La solución ya estaba ahí. Solo no la veías.'
  };

  function setCaption(state, u, st) {
    const cap = root && root.querySelector('.constellation__caption');
    if (!cap) return;
    let title = '', sub = '';
    if (state === 'idle') { title = COPY.idleTitle; sub = COPY.idleSub; }
    else if (state === 'thinking') { title = u.kind === 'need' ? 'Viendo qué podría hacer falta…' : 'Viendo a quién le sirve…'; sub = u.summary || ''; }
    else if (state === 'searching') {
      title = u.kind === 'need' ? 'Buscando en tu comunidad…' : 'Buscando quién necesita algo de ahí…';
      sub = st && st.circleLabels && st.circleLabels.length ? `Mirando primero en ${st.circleLabels.map(l => l.toLowerCase()).join(' y ')}.` : '';
    }
    else if (state === 'bond') { title = `Tu lazo con ${st.name} se fortaleció.`; sub = st.signal || 'Los actos pequeños se vuelven relaciones de confianza.'; }
    else if (state === 'coverage') { title = coverageLine(u, st); sub = coverageSub(u, st); }
    else if (state === 'closing') { title = COPY.closing; sub = coverageLine(u, st); }
    cap.classList.remove('is-in'); void cap.offsetWidth; cap.classList.add('is-in');
    cap.classList.toggle('is-closing', state === 'closing');
    cap.innerHTML = `<p class="constellation__title">${esc(title)}</p>${sub ? `<p class="constellation__sub">${esc(sub)}</p>` : ''}`;
  }

  function coverageLine(u, st) {
    const { covered, total } = st.coverage;
    const people = new Set(st.steps.map(s => s.person.id));
    if (u.kind !== 'need') {
      if (!total) return 'Por ahora nadie cerca necesita esto. Lo recordamos.';
      return u.kind === 'opportunity'
        ? `Puedes ayudar a ${total} ${total === 1 ? 'vecino' : 'vecinos'} con un viaje que ya vas a hacer.`
        : `${total} ${total === 1 ? 'persona cerca necesita' : 'personas cerca necesitan'} justo esto.`;
    }
    if (!total) return 'Todavía no sabemos qué haría falta para esto.';
    if (!covered) return 'Todavía nadie cerca puede resolverlo. Cuando aparezca, lo verás aquí.';
    if (total === 1) {
      const p = st.steps[0].person.person;
      return `${p.name} ya puede resolverlo${p.distance === 0 ? ' desde tu mismo edificio' : ''}.`;
    }
    return `${covered} de ${total} necesidades ya existen dentro de tu comunidad.`;
  }

  function coverageSub(u, st) {
    const people = Array.from(new Set(st.steps.map(s => s.person.person.name)));
    const strategies = st.result.solutions ? st.result.solutions.length : 0;
    if (!people.length) return '';
    const who = people.length === 1 ? people[0] : `${people.slice(0, -1).join(', ')} y ${people[people.length - 1]}`;
    const gaps = st.coverage.total - st.coverage.covered;
    const parts = [`${people.length === 1 ? 'Con' : 'Entre'} ${who}.`];
    if (strategies > 1) parts.push(`Hay ${strategies} formas de resolverlo.`);
    if (u.kind === 'need' && gaps > 0) parts.push(`${gaps === 1 ? 'Una cosa' : `${gaps} cosas`} sí tendrías que conseguir.`);
    else if (u.kind === 'need') parts.push('Sin comprar nada.');
    return parts.join(' ');
  }

  /* Resumen accesible (y legible) de lo que muestra la constelación */
  function summaryHtml(st) {
    if (!st.steps.length) return '';
    const items = st.steps.map(s => {
      const p = s.person.person;
      const what = s.fromUser ? s.need.open.title : s.need.need.label;
      return `<li><span class="constellation__dot" style="--c:${s.person.color}"></span><span class="constellation__body"><strong>${esc(p.name)}</strong> · ${esc(what)}<span class="constellation__because">${esc(s.because)}</span></span></li>`;
    }).join('');
    const gaps = st.needNodes.filter(n => !n.covered && !n.optional).map(n => `<li class="is-gap"><span class="constellation__dot constellation__dot--gap"></span><span class="constellation__body">${esc(n.need ? n.need.label : n.open.title)}<span class="constellation__because">Esto sí tendrías que conseguirlo.</span></span></li>`).join('');
    return `<ul class="constellation__list">${items}${gaps}</ul>`;
  }

  function setSummary(html) {
    const el = root && root.querySelector('.constellation__summary');
    if (el) el.innerHTML = html;
  }

  function setActions(state) {
    const el = root && root.querySelector('.constellation__actions');
    if (!el) return;
    if (state === 'idle') { el.innerHTML = ''; return; }
    const s = story && story.situation;
    const persisted = s && s.id && s.id !== 'preview';
    const primary = persisted
      ? `<a class="btn btn--primary" href="#/s/${esc(s.id)}">Ver la solución completa</a>`
      : `<button class="btn btn--primary" type="button" data-constellation="resolve">Resolverlo con ellos</button>`;
    el.innerHTML = `${primary}<button class="btn btn--ghost" type="button" data-constellation="clear">Ver la comunidad en reposo</button>`;
  }

  function template(params) {
    const c = State.community();
    const chips = c.examples.map(ex => `<button class="chip-btn" type="button" data-constellation="try" data-text="${esc(ex.text)}">${esc(ex.label)}</button>`).join('');
    const soundOn = Sound.load();
    return `
      <section class="constellation" aria-labelledby="constellation-title">
        <a class="back" href="#/">← Inicio</a>
        <p class="eyebrow">${esc(c.name)} · ${c.members} vecinos</p>
        <h1 id="constellation-title" class="page__title">Tu comunidad, vista de otra forma</h1>
        <p class="page__sub">No es un mapa ni un directorio. Es lo que tu comunidad ya sabe hacer, y cómo se acomoda alrededor de lo que necesitas.</p>
        <form class="constellation__form" data-form="constellation" novalidate>
          <label class="sr-only" for="constellation-input">Cuéntanos tu situación</label>
          <textarea id="constellation-input" name="situation" rows="2" placeholder="${esc(c.placeholders[c.placeholders.length > 3 ? 3 : 0])}" autocomplete="off">${esc(params.q || '')}</textarea>
          <button class="btn btn--primary btn--sm" type="submit">Ver cómo se organiza</button>
        </form>
        <div class="examples examples--dark"><span class="examples__label">Prueba con:</span><div class="examples__list">${chips}</div></div>
        <div class="constellation__stage">
          <canvas class="constellation__canvas" aria-hidden="true"></canvas>
          <div class="constellation__tip" hidden></div>
          <div class="constellation__caption is-in" role="status" aria-live="polite"></div>
          <div class="constellation__tools">
            <button class="constellation__tool" type="button" data-constellation="sound" aria-pressed="${soundOn}" title="Sonido">
              <span aria-hidden="true">${soundOn ? '🔔' : '🔕'}</span><span class="sr-only">Sonido</span>
            </button>
            <button class="constellation__tool" type="button" data-constellation="camera" title="Compartir algo desde tu cámara">
              <span aria-hidden="true">📷</span><span class="sr-only">Compartir algo desde tu cámara</span>
            </button>
          </div>
        </div>
        <div class="constellation__actions btn-row"></div>
        <div class="constellation__summary"></div>
        <p class="muted small constellation__foot">Lo que ves no lo publicó nadie: se aprende de las situaciones que la comunidad resuelve. Nunca se muestra un número de departamento.</p>
      </section>`;
  }

  /* ------------------------------------------------------------------
     Cámara: el usuario elige un objeto y entra a la constelación
     ------------------------------------------------------------------ */
  const Camera = (() => {
    let stream = null;
    let frameCanvas = null;
    let pick = null;

    function stop() {
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    }

    function shell(inner) {
      return `
        <div class="dialog__form camera">
          <h2 id="dialog-title" class="dialog__title">Comparte algo que ya tienes</h2>
          <p class="dialog__meta">Apunta al objeto, captura y tócalo. Entra a la constelación como algo que tu comunidad sabe de ti.</p>
          ${inner}
          <p class="muted small">La foto no se sube a ningún lado: se recorta y se guarda solo en este dispositivo.</p>
        </div>`;
    }

    async function open() {
      pick = null;
      frameCanvas = null;
      const dialog = UI.openDialog(shell(`<p class="camera__status">Abriendo la cámara…</p>`));
      const canUse = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
      if (!canUse) return fallback(dialog);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      } catch (err) {
        return fallback(dialog);
      }
      if (!document.getElementById('dialog').open) return stop();
      dialog.innerHTML = shell(`
        <div class="camera__view"><video class="camera__video" autoplay playsinline muted></video></div>
        <div class="btn-row btn-row--end">
          <button class="btn btn--ghost" type="button" data-constellation="camera-close">Cancelar</button>
          <button class="btn btn--primary" type="button" data-constellation="camera-capture" data-autofocus>Capturar</button>
        </div>`);
      const video = dialog.querySelector('video');
      video.srcObject = stream;
    }

    function fallback(dialog) {
      dialog.innerHTML = shell(`
        <p class="camera__status">No pudimos abrir la cámara aquí. Puedes elegir una foto.</p>
        <label class="btn btn--secondary camera__file">Elegir una foto<input type="file" accept="image/*" capture="environment" data-constellation-file hidden></label>
        <div class="btn-row btn-row--end"><button class="btn btn--ghost" type="button" data-constellation="camera-close">Cancelar</button></div>`);
      const input = dialog.querySelector('[data-constellation-file]');
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(img.src); fromImage(img, dialog); };
        img.src = URL.createObjectURL(file);
      });
    }

    function capture() {
      const dialog = document.getElementById('dialog');
      const video = dialog.querySelector('video');
      if (!video || !video.videoWidth) return;
      fromImage(video, dialog, video.videoWidth, video.videoHeight);
      stop();
    }

    function fromImage(source, dialog, w, h) {
      const sw = w || source.naturalWidth || source.width, sh = h || source.naturalHeight || source.height;
      const max = 900;
      const k = Math.min(1, max / Math.max(sw, sh));
      frameCanvas = document.createElement('canvas');
      frameCanvas.width = Math.round(sw * k); frameCanvas.height = Math.round(sh * k);
      frameCanvas.getContext('2d').drawImage(source, 0, 0, frameCanvas.width, frameCanvas.height);
      dialog.innerHTML = shell(`
        <div class="camera__view camera__view--pick">
          <img class="camera__photo" src="${frameCanvas.toDataURL('image/jpeg', 0.85)}" alt="Tu foto">
          <span class="camera__ring" hidden></span>
          <p class="camera__hint">Toca el objeto que quieres compartir</p>
        </div>
        <label class="camera__label" for="camera-name">¿Qué es?</label>
        <input id="camera-name" class="camera__name" type="text" maxlength="60" placeholder="p. ej. Escalera de aluminio" autocomplete="off">
        <div class="btn-row btn-row--end">
          <button class="btn btn--ghost" type="button" data-constellation="camera-close">Cancelar</button>
          <button class="btn btn--primary" type="button" data-constellation="camera-confirm" disabled>Compartirlo con mi comunidad</button>
        </div>`);
      const view = dialog.querySelector('.camera__view');
      const ring = dialog.querySelector('.camera__ring');
      const confirmBtn = dialog.querySelector('[data-constellation="camera-confirm"]');
      const nameInput = dialog.querySelector('#camera-name');
      const check = () => { confirmBtn.disabled = !(pick && nameInput.value.trim()); };
      view.addEventListener('click', e => {
        const img = view.querySelector('img');
        const r = img.getBoundingClientRect();
        const x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
        pick = { x, y };
        ring.hidden = false;
        ring.style.left = `${x * 100}%`; ring.style.top = `${y * 100}%`;
        view.querySelector('.camera__hint').textContent = 'Así entrará a la constelación';
        check();
        nameInput.focus();
      });
      nameInput.addEventListener('input', check);
    }

    function confirm() {
      if (!pick || !frameCanvas) return;
      const dialog = document.getElementById('dialog');
      const name = (dialog.querySelector('#camera-name').value || '').trim();
      if (!name) return;
      const size = Math.min(frameCanvas.width, frameCanvas.height) * 0.34;
      const out = document.createElement('canvas');
      out.width = out.height = 128;
      const sx = clamp(pick.x * frameCanvas.width - size / 2, 0, frameCanvas.width - size);
      const sy = clamp(pick.y * frameCanvas.height - size / 2, 0, frameCanvas.height - size);
      out.getContext('2d').drawImage(frameCanvas, sx, sy, size, size, 0, 0, 128, 128);
      const image = out.toDataURL('image/jpeg', 0.78);
      const slug = Resolver.normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'objeto';
      const tags = Resolver.normalize(name).split(' ').filter(w => w.length > 2);
      const cap = State.learnUserCapability({
        id: `eddie-cam-${slug}`, kind: 'object', label: name, tags, image,
        evidence: { count: 1, label: 'Lo compartiste desde tu cámara', learned: true }
      });
      UI.closeDialog();
      stop();
      addUserCap(cap);
      UI.toast(`Ahora tu comunidad sabe que tienes: ${name}.`);
    }

    function close() { stop(); UI.closeDialog(); }

    return { open, capture, confirm, close, stop };
  })();

  /* Un objeto nuevo del usuario entra volando desde abajo hasta su órbita */
  function addUserCap(cap) {
    const user = byId.get(State.user().id);
    if (!user) return;
    const existing = byId.get(cap.id);
    if (existing) { existing.cap = cap; existing.wake = now(); imageCache.delete(cap.id); return; }
    const i = user.caps.length;
    const cn = {
      id: cap.id, type: 'cap', cap, owner: user, index: i, x: W / 2, y: H + 30, vx: 0, vy: 0, z: 0.2, r: mobile ? 4 : 5,
      color: KIND_COLOR.object, act: 1, actT: mode === 'situation' ? 0.6 : 0.8, target: null,
      orbit: (mobile ? 26 : 32) + (i % 2) * 8, speed: 0.14 * (i % 2 ? -1 : 1), angle: Math.PI / 2, spawn: 0, wake: now() + 900
    };
    user.caps.push(cn); nodes.push(cn); byId.set(cn.id, cn);
    user.hit = now() + 900;
    Sound.note(4);
  }

  /* ------------------------------------------------------------------
     Montaje / desmontaje
     ------------------------------------------------------------------ */
  function resize() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(280, Math.round(rect.width));
    const h = Math.round(rect.height);
    DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2);
    if (w === W && h === H) return;
    const dw = Math.abs(w - W), dh = Math.abs(h - H);
    W = w; H = h;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    spriteCache.clear();
    if (!nodes.length) return;
    /* Cambios pequeños (barra de scroll, barra de direcciones del móvil) no reinician nada. */
    if (dw < 40 && dh < 120) return;
    layoutHomes([State.user()].concat(State.graph().people));
    nodes.forEach(n => { if (n.type === 'person' && !n.target) { n.x = n.home.x; n.y = n.home.y; } });
    if (story) { const s = story.situation; show(s); }
  }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }

  function handleAction(e) {
    const el = e.target.closest('[data-constellation]');
    if (!el || !root || !root.contains(el) && !document.getElementById('dialog').contains(el)) return;
    e.preventDefault();
    const a = el.dataset.constellation;
    if (a === 'try') {
      const input = root.querySelector('#constellation-input');
      if (input) input.value = el.dataset.text;
      Sound.ensure();
      preview(el.dataset.text);
    } else if (a === 'clear') {
      clearStory();
    } else if (a === 'resolve') {
      if (story && typeof App !== 'undefined' && App.submitSituation) App.submitSituation(story.situation.text);
    } else if (a === 'sound') {
      const next = !Sound.isOn();
      Sound.set(next);
      el.setAttribute('aria-pressed', String(next));
      el.querySelector('span').textContent = next ? '🔔' : '🔕';
      if (next) Sound.note(2);
    } else if (a === 'camera') {
      Camera.open();
    } else if (a === 'camera-capture') {
      Camera.capture();
    } else if (a === 'camera-confirm') {
      Camera.confirm();
    } else if (a === 'camera-close') {
      Camera.close();
    }
  }

  function handleSubmit(e) {
    const form = e.target.closest('[data-form="constellation"]');
    if (!form || !root || !root.contains(form)) return;
    e.preventDefault();
    const input = form.querySelector('textarea');
    const text = (input.value || '').trim();
    if (!text) { input.focus(); return; }
    Sound.ensure();
    preview(text);
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'constellation-input') {
      e.preventDefault();
      const form = e.target.closest('form');
      if (form) form.requestSubmit ? form.requestSubmit() : handleSubmit({ target: form, preventDefault() {} });
    }
  }

  /* Situación efímera: no se guarda hasta que el usuario decide resolverla */
  function preview(text) {
    const understanding = Resolver.understandSituation(text);
    const needs = Resolver.discoverNeeds(understanding);
    show({ id: 'preview', text, understanding, needs, excluded: [] });
    const stage = root.querySelector('.constellation__stage');
    if (stage && mobile) stage.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  function mount(main, params) {
    dispose();
    reduced = UI.reducedMotion();
    mobile = window.innerWidth < 640 || (navigator.maxTouchPoints > 0 && window.innerWidth < 900);
    main.innerHTML = template(params || {});
    root = main.querySelector('.constellation');
    canvas = root.querySelector('canvas');
    ctx = canvas.getContext('2d', { alpha: false });
    W = H = 0;
    resize();
    buildNodes();
    setCaption('idle');
    bindPointer();
    on(window, 'resize', onResize);
    on(document, 'click', handleAction);
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
    running = true;
    lastT = 0;
    nextPulseAt = now() + 1200;
    raf = requestAnimationFrame(frame);
    if (!(params && (params.s || params.q))) revealStrengthenedBonds();

    const p = params || {};
    if (p.s) {
      const s = State.getSituation(p.s);
      if (s && s.understanding.kind !== 'helping') later(() => show(s), 500);
    } else if (p.q) {
      later(() => preview(p.q), 500);
    }
  }

  /* Historia "construcción de confianza": si desde la última visita una relación con el usuario
     creció (p. ej. Mariana pasa de 3 a 4 interacciones), el nodo llega desde más lejos hasta su
     nueva posición, más cerca, con un pulso y una frase humana. Sin números de confianza. */
  const TRUST_SNAP = () => `entre-todos:constellation-trust:${State.community().id}`;
  function revealStrengthenedBonds() {
    if (!hasTrust()) return;
    const meId = State.user().id;
    const current = {};
    Trust.relations().forEach(r => {
      const other = r.a === meId ? r.b : (r.b === meId ? r.a : null);
      if (other) current[other] = r.interactions;
    });
    let prev = null;
    try { prev = JSON.parse(localStorage.getItem(TRUST_SNAP()) || 'null'); } catch (e) { prev = null; }
    try { localStorage.setItem(TRUST_SNAP(), JSON.stringify(current)); } catch (e) { /* sin persistencia */ }
    if (!prev) return;
    const grown = Object.keys(current).filter(id => current[id] > (prev[id] || 0)).map(id => byId.get(id)).filter(Boolean);
    if (!grown.length) return;
    const me = byId.get(meId);
    grown.forEach((n, i) => {
      /* Parte de más lejos y la red la trae hacia el usuario */
      const dx = n.home.x - me.home.x, dy = n.home.y - me.home.y;
      const d = Math.hypot(dx, dy) || 1;
      n.x = clamp(n.home.x + dx / d * 90, 24, W - 24); n.y = clamp(n.home.y + dy / d * 60, 24, H - 62);
      n.caps.forEach(placeCapAtOrbit);
      later(() => {
        n.wake = now(); n.hit = now();
        links.push({ kind: 'alive', from: me, to: n, progress: 0, born: now(), alpha: 0.9 });
        Sound.note(4 + i);
      }, 900 + i * 700);
    });
    const first = grown[0];
    const signal = Trust.signals(first.id, 'es', { max: 1 })[0] || '';
    later(() => setCaption('bond', null, { name: first.person.name, signal }), 700);
    later(() => { if (mode === 'idle') setCaption('idle'); }, 7500);
  }

  function dispose() {
    running = false;
    cancelAnimationFrame(raf);
    clearTimeout(resizeTimer);
    clearTimers();
    Camera.stop();
    listeners.forEach(off => off());
    listeners = [];
    if (hashListener) { window.removeEventListener('hashchange', hashListener); hashListener = null; }
    story = null; mode = 'idle'; hovered = null;
    nodes = []; links = []; pulses = []; byId = new Map();
    root = null; canvas = null; ctx = null;
  }

  /* _debug: solo para inspección en consola; no forma parte de la API. */
  return { mount, dispose, show, preview, clear: clearStory, ROUTE, _debug: () => ({ nodes, links, story, mode, W, H }) };
})();
