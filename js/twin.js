/* ==========================================================================
   twin.js — Community Twin: el edificio en 3D, y lo que puede hacer por ti.

   Nivel 2 de tres formas de ver la comunidad:
     1. Mapa           dónde están los edificios          (js/map.js)
     2. Community Twin cómo está organizado el lugar      (este módulo)
     3. Constelación   cómo están conectadas las personas (js/constellation.js)

   La idea: "The community is not just people. The place itself can help."
   Cada edificio declara Place Capabilities (community.buildings[].amenities,
   catálogo en js/places.js): recepción 24 h, área de paquetes, bicicletero,
   elevador de carga, salón común, roof garden, área infantil… El resolver las
   combina con personas y objetos (Resolver.placeSteps) y aquí se ven en su
   sitio: al contar una situación, el edificio destaca las zonas relevantes y
   a las personas disponibles que viven en él.

   · Three.js (WebGL) cargado bajo demanda desde jsdelivr como módulo ES; sin
     conexión, la vista degrada a la ficha del edificio (misma información).
   · Pisos apilados, elevadores como núcleo, sótano, azotea y zonas exteriores
     construidos con geometría básica: legible, cálido, no fotorrealista.
   · Personas como marcadores flotando junto a la fachada, a la altura de su
     piso declarado ("Piso 4"), nunca en un departamento concreto. Misma
     identidad visual que el mapa y la constelación (tono, iniciales).
   · Transición Mapa → Edificio → Personas → Constelación: el mapa se acerca al
     edificio; el edificio se levanta piso a piso desde el mismo ángulo
     isométrico; "Ver a las personas" vuelve el edificio de cristal y las
     personas se adelantan mientras cae la tarde; "Ver la constelación"
     entrega sus posiciones en pantalla (ViewHandoff) y cada una vuela a su
     lugar en el cielo.

   Ruta: #/twin?b=<edificio>&s=<situación> · #/twin?b=<edificio>&q=<texto>
   API:  CommunityTwin.mount(main, params) · dispose() · show(situation) · lastBuilding()
   ========================================================================== */

const CommunityTwin = (() => {
  const ROUTE = '/twin';
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.min.js';
  const KEY_LAST = 'entre-todos:twin-building';
  const ENTERABLE = new Set(['tower', 'hall']);

  const C = {
    cream: '#F7F1E6', paper: '#FFFDF9', amarillo: '#EFB94B', amarilloSoft: '#FBEFD1',
    terracota: '#C55E3E', terracotaDark: '#A64D30', verde: '#586D53', verdeDark: '#304431',
    sage: '#9DB58F', tierra: '#A9825E', ink: '#2B221B', ink2: '#5C4F45', ink3: '#8C7D70'
  };
  const TONES = { 1: '#D96F4F', 2: '#5E7A59', 3: '#D9A03A', 4: '#B98D64', 5: '#7F927B' };
  const SKY = { day: 0xEEF0E2, dusk: 0x3B322A };

  /* ---- Estado ---- */
  let THREE = null;
  let root = null, stage = null, host = null, labelLayer = null;
  let renderer = null, scene = null, camera = null, raycaster = null;
  let raf = 0, running = false, lastT = 0, visible = true;
  let W = 0, H = 0;
  let reduced = false, mobile = false;
  let building = null, params = {};
  let fh = 3.2, BH = 0;                 /* altura de piso y del edificio */
  let floorMeshes = [], glassMats = [], edgeMats = [];
  let amenities = [];                  /* { data, group, anchor, label, matched, mats[] } */
  let people = [];                     /* { entity, kind, sprite, label, base, matched, floor } */
  let links = [];                      /* { line, born, from, to } */
  let elevator = null;
  let mePos = null;
  let orbit = { az: 0.78, el: 0.55, dist: 60, taz: 0.78, tel: 0.55, tdist: 60, ty: 0, y: 0 };
  let auto = true, pointerState = null;
  let mode = 'building';               /* building | people */
  let story = null;
  let entrance = null;                 /* { at } levantamiento piso a piso */
  let skyMix = 0, skyTarget = 0;       /* 0 día · 1 atardecer */
  let hovered = null, selected = null;
  let listeners = [], timeouts = [], hashListener = null;
  let pulse = 0;

  /* ---- Utilidades ---- */
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const now = () => performance.now();
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  function later(fn, ms) { const id = setTimeout(fn, reduced ? Math.min(ms, 40) : ms); timeouts.push(id); return id; }
  function clearTimers() { timeouts.forEach(clearTimeout); timeouts = []; }
  function on(el, ev, fn, opts) { el.addEventListener(ev, fn, opts); listeners.push(() => el.removeEventListener(ev, fn, opts)); }
  const hasTrust = () => typeof Trust !== 'undefined' && typeof Trust.relations === 'function';

  function lastBuilding() {
    try { return sessionStorage.getItem(KEY_LAST) || null; } catch (err) { return null; }
  }
  function rememberBuilding(id) {
    try { sessionStorage.setItem(KEY_LAST, id); } catch (err) { /* sin persistencia */ }
  }

  function loadThree() {
    if (THREE) return Promise.resolve(THREE);
    if (!window.WebGLRenderingContext) return Promise.reject(new Error('sin WebGL'));
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000));
    return Promise.race([import(THREE_URL), timeout]).then(mod => { THREE = mod; return THREE; });
  }

  /* ---- Datos del edificio ---- */
  function community() { return State.community(); }
  function buildings() { return (community().buildings || []).filter(b => ENTERABLE.has(b.kind)); }
  function pickBuilding(id) {
    const list = buildings();
    return list.find(b => b.id === id) || list.find(b => b.id === State.user().building) || list[0] || null;
  }
  function amenitiesOf(b) { return typeof Places !== 'undefined' ? Places.forBuilding(b.id) : []; }
  function residentsOf(b) {
    const g = State.graph();
    const c = community();
    const all = [{ e: g.user, kind: 'user' }].concat(g.people.map(p => ({ e: p, kind: 'person' })), (c.households || []).map(h => ({ e: h, kind: 'household' })));
    return all.filter(x => x.e.building === b.id);
  }
  function floorOf(entity, b) {
    const m = /piso\s*(\d+)/i.exec(entity.place || '');
    const floors = b.floors || 1;
    if (m) return clamp(parseInt(m[1], 10), 0, floors - 1);
    return clamp(Math.floor(hash(entity.id) * floors), 0, floors - 1);
  }
  function personColor(p) { return TONES[p.tone] || TONES[3]; }
  function whereLabel(x) {
    const ent = x.e;
    const label = typeof Matching !== 'undefined' ? Matching.distanceLabelFor(ent) : '';
    const floor = /piso\s*\d+/i.test(ent.place || '') ? ent.place : null;
    if (x.kind === 'user') return floor ? `Vives aquí · ${floor}` : 'Vives aquí';
    return [floor, label === 'mismo edificio' ? 'Mismo edificio' : label].filter(Boolean).join(' · ');
  }

  /* ---- Three: construcción ---- */
  function mat(hex, o = {}) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(hex), roughness: 0.88, metalness: 0 }, o));
    if (o.transparent) m.transparent = true;
    return m;
  }
  function box(w, h, d, hex, o = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex, o));
    return m;
  }
  function edges(mesh, hex, alpha) {
    const geo = new THREE.EdgesGeometry(mesh.geometry, 20);
    const m = new THREE.LineBasicMaterial({ color: new THREE.Color(hex), transparent: true, opacity: alpha });
    const lines = new THREE.LineSegments(geo, m);
    mesh.add(lines);
    edgeMats.push(m);
    return lines;
  }
  function levelY(level) {
    if (level === 'all') return BH / 2;
    if (level === 'roof') return BH + 0.25;
    if (level === 'outside') return 0;
    if (level === -1) return -1.7;
    return (Number(level) || 0) * fh + 0.12;
  }
  /* Zonas exteriores siempre en lados que la cámara ve (frente +z y derecha +x). */
  function outsidePos(side, b, extra = 0) {
    const w = b.w, d = b.d;
    if (side === 'left') return new THREE.Vector3(-(w / 2 + 3 + extra), 0, d / 2 + 4 + extra);
    if (side === 'right') return new THREE.Vector3(w / 2 + 5 + extra, 0, -d * 0.1);
    if (side === 'back') return new THREE.Vector3(w / 2 + 4 + extra, 0, -(d / 2 + 3 + extra));
    return new THREE.Vector3(w * 0.12, 0, d / 2 + 6 + extra);
  }

  function buildBuilding(b) {
    const g = new THREE.Group();
    const w = b.w, d = b.d, floors = b.floors || 1;
    fh = b.kind === 'tower' ? 3.2 : 4;
    BH = floors * fh;
    floorMeshes = []; glassMats = []; edgeMats = [];
    const hasLobby = amenitiesOf(b).some(a => a.type === 'lobby' || a.type === 'reception');
    for (let f = 0; f < floors; f++) {
      const glass = f === 0 && hasLobby;
      const m = box(w, fh - 0.22, d, glass ? '#E9EFE3' : '#F7F0E1', { transparent: true, opacity: glass ? 0.5 : 1 });
      m.position.y = f * fh + (fh - 0.22) / 2;
      m.userData.floor = f;
      edges(m, C.ink, 0.16);
      /* Bandas de ventanas en fachadas frontal y derecha */
      if (!glass) {
        const band = box(w * 0.92, fh * 0.34, 0.06, '#CFC2A6');
        band.position.set(0, 0.05, d / 2 + 0.02);
        const band2 = box(0.06, fh * 0.34, d * 0.9, '#C5B79A');
        band2.position.set(w / 2 + 0.02, 0.05, 0);
        m.add(band, band2);
        glassMats.push(band.material, band2.material);
      }
      glassMats.push(m.material);
      floorMeshes.push(m);
      g.add(m);
    }
    const roof = box(w + 0.5, 0.35, d + 0.5, '#E4D6BE');
    roof.position.y = BH + 0.17;
    edges(roof, C.ink, 0.18);
    glassMats.push(roof.material);
    floorMeshes.push(roof);
    g.add(roof);
    /* Entrada */
    const door = box(3.2, 2.6, 0.3, '#A64D30');
    door.position.set(0, 1.3, d / 2 + 0.1);
    g.add(door);
    glassMats.push(door.material);
    return g;
  }

  /* Un grupo por Place Capability, con anclaje para la etiqueta. */
  function buildAmenity(a, b) {
    const g = new THREE.Group();
    const w = b.w, d = b.d;
    const y = levelY(a.level);
    let anchor = new THREE.Vector3(0, y + 1.5, 0);
    const mats = [];
    const add = (mesh, x, yy, z) => { mesh.position.set(x, yy, z); g.add(mesh); mats.push(mesh.material); return mesh; };
    const pad = (pw, pd, hex, x, z, yy = y) => add(box(pw, 0.18, pd, hex), x, yy + 0.09, z);

    switch (a.type) {
      case 'lobby': {
        pad(w * 0.62, d * 0.62, '#EFE2C5', 0, d * 0.05);
        add(box(1.4, 0.5, 1.4, '#B98D64'), -w * 0.2, y + 0.25, d * 0.1);
        add(box(1.4, 0.5, 1.4, '#B98D64'), w * 0.2, y + 0.25, d * 0.1);
        anchor = new THREE.Vector3(0, y + 2.4, d * 0.05);
        break;
      }
      case 'reception': {
        add(box(3.4, 1.05, 0.9, '#A9825E'), -w * 0.18, y + 0.52, d * 0.18);
        add(box(0.5, 0.6, 0.5, '#5E7A59'), -w * 0.18, y + 1.35, d * 0.18);
        anchor = new THREE.Vector3(-w * 0.18, y + 2.6, d * 0.18);
        break;
      }
      case 'packages': {
        const shelf = add(box(2.2, 2.2, 0.7, '#D3C2A6'), w * 0.22, y + 1.1, -d * 0.2);
        edges(shelf, C.ink, 0.25);
        [[-0.6, 0.55], [0.4, 0.55], [-0.1, 1.5]].forEach(([dx, dy]) => add(box(0.6, 0.45, 0.5, '#EFB94B'), w * 0.22 + dx, y + dy, -d * 0.2 + 0.1));
        anchor = new THREE.Vector3(w * 0.22, y + 3.1, -d * 0.2);
        break;
      }
      case 'elevators': {
        const shaft = add(box(2.4, BH, 2.4, '#9DB58F', { transparent: true, opacity: 0.85 }), 0, BH / 2, -d * 0.18);
        edges(shaft, C.verdeDark, 0.3);
        const cab = box(1.9, 2.2, 1.9, '#F7F1E6');
        cab.position.set(0, 1.2, -d * 0.18);
        g.add(cab); mats.push(cab.material);
        elevator = { cab, t: hash(a.id) * 10 };
        anchor = new THREE.Vector3(0, BH + 1.2, -d * 0.18);
        break;
      }
      case 'parking': {
        const slab = add(box(w * 1.25, 2.8, d * 1.25, '#8C7D70', { transparent: true, opacity: 0.28 }), 0, -1.5, 0);
        edges(slab, C.ink, 0.35);
        [[-w * 0.3, -d * 0.25], [w * 0.05, -d * 0.25], [w * 0.38, d * 0.2]].forEach(([x, z]) => add(box(2, 1, 4.2, '#C55E3E', { transparent: true, opacity: 0.85 }), x, -2.3, z));
        anchor = new THREE.Vector3(w * 0.62, -1.2, d * 0.62);
        break;
      }
      case 'bikes': {
        const p = outsidePos(a.side || 'left', b, 1);
        pad(6, 3, '#E4D6BE', p.x, p.z);
        for (let i = 0; i < 4; i++) add(box(0.35, 0.9, 1.7, '#E07A5A'), p.x - 2.1 + i * 1.4, 0.55, p.z);
        add(box(6.4, 0.16, 3.4, '#B98D64', { transparent: true, opacity: 0.9 }), p.x, 2.3, p.z);
        [[-2.9, -1.4], [2.9, -1.4], [-2.9, 1.4], [2.9, 1.4]].forEach(([dx, dz]) => add(box(0.12, 2.3, 0.12, '#A9825E'), p.x + dx, 1.15, p.z + dz));
        anchor = new THREE.Vector3(p.x, 3.4, p.z);
        break;
      }
      case 'gym': {
        pad(w * 0.5, d * 0.55, '#E2EADF', -w * 0.2, 0);
        add(box(1.6, 0.9, 0.7, '#5C4F45'), -w * 0.3, y + 0.55, -d * 0.15);
        add(box(1.6, 0.9, 0.7, '#5C4F45'), -w * 0.1, y + 0.55, -d * 0.15);
        add(box(0.3, 0.3, 1.4, '#2B221B'), -w * 0.25, y + 0.25, d * 0.15);
        anchor = new THREE.Vector3(-w * 0.2, y + 2.4, 0);
        break;
      }
      case 'roof': {
        pad(w * 0.8, d * 0.78, '#9DB58F', 0, 0, BH + 0.3);
        for (let i = 0; i < 6; i++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.75 + hash(a.id + i) * 0.4, 12, 10), mat(i % 2 ? '#7F9A74' : '#5E7A59'));
          add(s, -w * 0.32 + (i % 3) * w * 0.32, BH + 1.1, -d * 0.28 + Math.floor(i / 3) * d * 0.56);
        }
        add(box(2.4, 0.5, 1.1, '#A9825E'), 0, BH + 0.75, d * 0.05);
        add(box(1.4, 0.9, 0.8, '#5C4F45'), w * 0.3, BH + 0.95, -d * 0.05);
        anchor = new THREE.Vector3(0, BH + 3.2, 0);
        break;
      }
      case 'hall': {
        const isWhole = b.kind === 'hall';
        pad(isWhole ? w * 0.85 : w * 0.6, isWhole ? d * 0.8 : d * 0.6, '#FBEFD1', isWhole ? 0 : w * 0.12, 0);
        for (let i = 0; i < 3; i++) {
          const t = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.2, 18), mat('#F7F1E6'));
          add(t, (isWhole ? -w * 0.28 : -w * 0.08) + i * (isWhole ? w * 0.28 : w * 0.2), y + 0.85, i % 2 ? d * 0.15 : -d * 0.15);
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.75, 8), mat('#A9825E'));
          add(leg, t.position.x, y + 0.4, t.position.z);
        }
        anchor = new THREE.Vector3(isWhole ? 0 : w * 0.12, y + 2.6, 0);
        break;
      }
      case 'kids': {
        const p = outsidePos(a.side || 'right', b, 2);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.2, 28), mat('#FBEFD1'));
        add(disc, p.x, 0.1, p.z);
        add(box(0.3, 2.2, 0.3, '#EFB94B'), p.x - 1.4, 1.1, p.z - 1.2);
        add(box(0.3, 2.2, 0.3, '#EFB94B'), p.x + 1.4, 1.1, p.z - 1.2);
        add(box(3.1, 0.25, 0.25, '#C55E3E'), p.x, 2.2, p.z - 1.2);
        add(box(2.4, 0.9, 1.2, '#E07A5A'), p.x, 0.55, p.z + 1.4);
        anchor = new THREE.Vector3(p.x, 3.2, p.z);
        break;
      }
      case 'pets': {
        const p = outsidePos(a.side || 'back', b, 2);
        pad(8, 6, '#B9C7AE', p.x, p.z);
        for (let i = 0; i < 8; i++) {
          const ang = i / 8 * Math.PI * 2;
          add(box(0.14, 1.1, 0.14, '#A9825E'), p.x + Math.cos(ang) * 3.6, 0.55, p.z + Math.sin(ang) * 2.7);
        }
        add(box(0.9, 0.5, 0.9, '#5E7A59'), p.x, 0.25, p.z);
        anchor = new THREE.Vector3(p.x, 2.6, p.z);
        break;
      }
      case 'meeting': {
        const p = outsidePos(a.side || 'front', b, 1);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 10), mat('#C55E3E'));
        add(post, p.x, 1.3, p.z);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), mat('#EFB94B'));
        add(head, p.x, 2.9, p.z);
        add(box(2.4, 0.4, 0.8, '#A9825E'), p.x + 2.2, 0.45, p.z);
        anchor = new THREE.Vector3(p.x, 4.1, p.z);
        break;
      }
      default: {
        pad(4, 4, '#E4D6BE', 0, 0);
      }
    }
    g.traverse(o => { if (o.isMesh) o.userData.amenity = a; });
    return { data: a, group: g, anchor, mats, matched: false, dim: false };
  }

  /* Persona como marcador: círculo con iniciales (misma identidad que mapa y constelación). */
  function spriteFor(x) {
    const p = x.e;
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const isUser = x.kind === 'user', isNew = x.kind === 'household';
    const color = isNew ? C.paper : personColor(p);
    const strength = x.kind === 'person' && hasTrust() ? Trust.strength(p.id) : 0;
    const stage = x.kind === 'person' && hasTrust() ? Trust.stage(p.id) : 'unknown';
    g.beginPath(); g.arc(size / 2, size / 2, 50, 0, Math.PI * 2);
    g.fillStyle = color; g.fill();
    g.lineWidth = isUser ? 8 : stage === 'circle' ? 9 : strength > 0 ? 4 + strength * 6 : 3;
    g.strokeStyle = isUser || stage === 'circle' || strength > 0 ? C.amarillo : (isNew ? C.ink3 : 'rgba(255,253,249,.85)');
    g.stroke();
    g.fillStyle = isNew ? C.ink2 : C.paper;
    g.font = `700 44px ${getComputedStyle(document.body).fontFamily}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(p.initials || (p.name || '?').slice(0, 1), size / 2, size / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
    const s = new THREE.Sprite(m);
    const sc = isUser ? 3.2 : isNew ? 2.4 : 2.8;
    s.scale.set(sc, sc, 1);
    s.userData.person = x;
    return s;
  }

  function buildPeople(b) {
    const list = residentsOf(b);
    const n = list.length;
    const w = b.w, d = b.d;
    people = [];
    list.forEach((x, i) => {
      const floor = floorOf(x.e, b);
      const sprite = spriteFor(x);
      /* Junto a la fachada frontal, a la altura de su piso; repartidas a lo ancho. Nunca "en" un departamento. */
      const t = n === 1 ? 0.5 : i / (n - 1);
      const base = new THREE.Vector3(-w / 2 + 3 + t * (w - 6), floor * fh + fh * 0.6, d / 2 + 1.8);
      sprite.position.copy(base);
      scene.add(sprite);
      people.push({ entity: x.e, kind: x.kind, sprite, base, floor, matched: false, label: null, phase: hash(x.e.id) * 6 });
      if (x.kind === 'user') mePos = base.clone();
    });
    if (!mePos) {
      /* No vives aquí: llegas por la entrada */
      mePos = new THREE.Vector3(0, 1.6, d / 2 + 6.5);
      const me = spriteFor({ e: State.user(), kind: 'user' });
      me.position.copy(mePos);
      scene.add(me);
      people.push({ entity: State.user(), kind: 'user', sprite: me, base: mePos.clone(), floor: 0, matched: false, label: null, visitor: true, phase: 0 });
    }
  }

  function buildScene(b) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY.day);
    scene.fog = new THREE.Fog(SKY.day, 110, 260);
    scene.add(new THREE.HemisphereLight(0xFFF7E8, 0xC9D3BE, 1.35));
    const sun = new THREE.DirectionalLight(0xFFE9C9, 1.25);
    sun.position.set(28, 52, 24);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xDDE7F0, 0.35);
    fill.position.set(-30, 20, -20);
    scene.add(fill);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(220, 64), mat('#DCE3D0'));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
    scene.add(ground);
    const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(b.w, b.d) * 0.95, Math.max(b.w, b.d) * 0.95 + 0.4, 48), mat('#C8D2BC'));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0;
    scene.add(ring);
    /* Andador hacia la entrada */
    const path = box(4, 0.05, 14, '#EADFCB');
    path.position.set(0, 0.02, b.d / 2 + 8);
    scene.add(path);

    const bg = buildBuilding(b);
    scene.add(bg);
    amenities = amenitiesOf(b).map(a => { const am = buildAmenity(a, b); scene.add(am.group); return am; });
    buildPeople(b);

    camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
    raycaster = new THREE.Raycaster();
    const far = Math.max(BH, b.w) * 4.4;
    orbit = { az: 0.2, el: 0.6, dist: far, taz: 0.52, tel: 0.48, tdist: Math.max(BH, b.w) * 2.5, y: BH * 0.35, ty: BH * 0.42 };
    if (reduced) { orbit.az = orbit.taz; orbit.el = orbit.tel; orbit.dist = orbit.tdist; orbit.y = orbit.ty; }
    entrance = { at: now() };
    floorMeshes.forEach(m => { if (!reduced) m.scale.y = 0.001; });
    amenities.forEach(am => { if (!reduced) am.group.scale.setScalar(0.001); });
  }

  /* ---- Etiquetas HTML proyectadas ---- */
  function makeLabel(cls, html) {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    labelLayer.appendChild(el);
    return el;
  }
  function buildLabels() {
    labelLayer.innerHTML = '';
    amenities.forEach(am => {
      am.label = makeLabel('twin__label', `<span class="twin__label-icon">${am.data.icon}</span><span class="twin__label-text">${esc(am.data.label)}${am.data.hours ? `<small>${esc(am.data.hours)}</small>` : ''}</span>`);
      am.label.dataset.amenity = am.data.id;
    });
    people.forEach(pp => {
      pp.label = makeLabel(`twin__name ${pp.kind === 'user' ? 'twin__name--me' : ''}`, esc(pp.kind === 'user' ? 'Tú' : pp.entity.name));
    });
  }
  const _v = () => new THREE.Vector3();
  function project(v3) {
    const v = _v().copy(v3).project(camera);
    return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, z: v.z };
  }
  function placeLabels() {
    amenities.forEach(am => {
      const p = project(am.anchor);
      const hide = p.z > 1 || (mode === 'people' && !am.matched);
      am.label.hidden = hide;
      if (hide) return;
      am.label.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      am.label.style.zIndex = String(Math.round((1 - p.z) * 10000) + (am.matched ? 500 : 0));
      am.label.classList.toggle('is-hot', am.matched);
      am.label.classList.toggle('is-dim', Boolean(story) && !am.matched);
      am.label.classList.toggle('is-selected', hovered === am || selected === am);
    });
    people.forEach(pp => {
      const pos = pp.sprite.position.clone(); pos.y -= 1.9;
      const p = project(pos);
      const hide = p.z > 1;
      pp.label.hidden = hide;
      if (hide) return;
      pp.label.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, 0)`;
      pp.label.style.zIndex = String(Math.round((1 - p.z) * 10000) + (pp.matched ? 500 : 0));
      pp.label.classList.toggle('is-hot', pp.matched);
      pp.label.classList.toggle('is-dim', Boolean(story) && !pp.matched && pp.kind !== 'user');
      pp.label.classList.toggle('is-people', mode === 'people');
    });
  }

  /* ---- Situación: el edificio destaca sus zonas relevantes ---- */
  function clearStory() {
    clearTimers();
    story = null;
    amenities.forEach(am => { am.matched = false; am.dim = false; });
    people.forEach(pp => { pp.matched = false; });
    links.forEach(l => scene && scene.remove(l.line));
    links = [];
    orbit.ty = BH * 0.42;
    setCaption('idle');
    setActions('idle');
    renderPanel();
  }

  function curveLine(from, to, hex) {
    const mid = from.clone().lerp(to, 0.5);
    mid.y += Math.max(2.5, from.distanceTo(to) * 0.22);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    const pts = curve.getPoints(40);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color: new THREE.Color(hex), transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, m);
    line.geometry.setDrawRange(0, 0);
    return line;
  }

  function show(situation) {
    if (!scene) { story = { situation, pending: true }; return; }
    clearStory();
    const u = situation.understanding;
    const result = Resolver.resolve(situation, State.graph());
    const placeSteps = [];
    (result.solutions || []).forEach(sol => (sol.placeSteps || []).forEach(p => { if (!placeSteps.some(x => x.amenityId === p.amenityId)) placeSteps.push(p); }));
    const here = placeSteps.filter(p => p.placeId === building.id);
    /* Otras zonas de este edificio que también sirven para la misma necesidad (recepción + área de paquetes). */
    Object.entries(result.places || {}).forEach(([needId, list]) => list.forEach(c => {
      if (c.placeId !== building.id || here.some(h => h.amenityId === c.amenityId)) return;
      here.push({ needId, placeId: c.placeId, amenityId: c.amenityId, type: c.type, icon: c.icon, label: c.label, buildingLabel: c.buildingLabel, because: c.because, covers: false, also: true });
    }));
    const elsewhere = placeSteps.filter(p => p.placeId !== building.id);
    const personIds = new Set();
    (result.solutions || []).forEach(sol => sol.steps.concat(sol.extras).forEach(s => personIds.add(s.personId)));
    (result.opportunities || []).forEach(o => personIds.add(o.personId));
    const st = { situation, result, here, elsewhere, placeSteps, people: [], ephemeral: !situation.id || situation.id === 'preview', done: false };
    amenities.forEach(am => { am.matched = here.some(p => p.amenityId === am.data.id); });
    people.forEach(pp => { pp.matched = pp.kind === 'person' && personIds.has(pp.entity.id); if (pp.matched) st.people.push(pp); });
    story = st;
    setActions('story');
    setCaption('thinking', u, st);
    renderPanel();

    /* Cámara hacia lo relevante */
    const focus = amenities.find(am => am.matched);
    if (focus) { orbit.ty = clamp(focus.anchor.y, 4, BH); orbit.tdist = Math.max(BH, building.w) * 2.3; }
    else if (st.people.length) orbit.ty = st.people[0].base.y;
    auto = false;

    let t = 600;
    const me = people.find(pp => pp.kind === 'user');
    amenities.filter(am => am.matched).forEach((am, i) => later(() => {
      am.born = now();
      if (me) { const line = curveLine(me.sprite.position.clone(), am.anchor.clone().add(new THREE.Vector3(0, -1.2, 0)), C.verde); scene.add(line); links.push({ line, born: now() }); }
    }, t + i * 420));
    t += amenities.filter(am => am.matched).length * 420;
    st.people.forEach((pp, i) => later(() => {
      pp.born = now();
      if (me && me !== pp) { const line = curveLine(me.sprite.position.clone(), pp.sprite.position.clone(), C.terracota); scene.add(line); links.push({ line, born: now() }); }
    }, t + i * 380));
    t += st.people.length * 380 + 700;
    later(() => { st.done = true; setCaption('done', u, st); renderPanel(); }, t);
  }

  /* ---- Bucle ---- */
  function step(dt) {
    const k = clamp(dt / 16.67, 0.25, 2.2);
    pulse += dt * 0.0022;
    const f = reduced ? 1 : 0.06 * k;
    if (auto && !reduced && !pointerState) orbit.taz += dt * 0.00006 * (mode === 'people' ? 0.5 : 1);
    orbit.az = lerp(orbit.az, orbit.taz, f);
    orbit.el = lerp(orbit.el, orbit.tel, f);
    orbit.dist = lerp(orbit.dist, orbit.tdist, f);
    orbit.y = lerp(orbit.y, orbit.ty, f);
    const target = new THREE.Vector3(0, orbit.y, 0);
    camera.position.set(
      target.x + orbit.dist * Math.cos(orbit.el) * Math.sin(orbit.az),
      target.y + orbit.dist * Math.sin(orbit.el),
      target.z + orbit.dist * Math.cos(orbit.el) * Math.cos(orbit.az)
    );
    camera.lookAt(target);

    /* Levantamiento piso a piso al entrar desde el mapa */
    if (entrance && !reduced) {
      const age = now() - entrance.at;
      floorMeshes.forEach((m, i) => {
        const t = clamp((age - i * 110) / 520, 0, 1);
        m.scale.y = Math.max(0.001, easeOutBack(t));
        m.position.y = (m.userData.floor != null ? m.userData.floor * fh + (fh - 0.22) / 2 : BH + 0.17) * (0.2 + 0.8 * easeOut(t)) + (1 - easeOut(t)) * 0.5;
      });
      amenities.forEach((am, i) => { const t = clamp((age - 500 - i * 120) / 520, 0, 1); am.group.scale.setScalar(Math.max(0.001, easeOutBack(t))); });
      if (age > 500 + floorMeshes.length * 110 + amenities.length * 120 + 600) {
        entrance = null;
        floorMeshes.forEach((m, i) => { m.scale.y = 1; m.position.y = m.userData.floor != null ? m.userData.floor * fh + (fh - 0.22) / 2 : BH + 0.17; });
        amenities.forEach(am => am.group.scale.setScalar(1));
      }
    }

    /* Modo personas: el edificio se vuelve cristal y cae la tarde */
    skyTarget = mode === 'people' ? 1 : 0;
    skyMix = lerp(skyMix, skyTarget, reduced ? 1 : 0.05 * k);
    const sky = new THREE.Color(SKY.day).lerp(new THREE.Color(SKY.dusk), skyMix);
    scene.background.copy(sky); scene.fog.color.copy(sky);
    const bo = lerp(1, 0.16, skyMix);
    glassMats.forEach(m => { m.transparent = true; m.opacity = Math.min(m.userData.baseOpacity ?? (m.userData.baseOpacity = m.opacity), bo); });
    edgeMats.forEach(m => { m.opacity = lerp(0.16, 0.5, skyMix); });

    /* Zonas relevantes: pulso ámbar; el resto se atenúa durante una situación */
    amenities.forEach(am => {
      const hot = am.matched ? 0.55 + Math.sin(pulse * 2 + hash(am.data.id)) * 0.25 : 0;
      const dim = story && !am.matched ? 0.35 : 1;
      am.mats.forEach(m => {
        if (!m.emissive) return;
        m.emissive.set(C.amarillo); m.emissiveIntensity = lerp(m.emissiveIntensity || 0, hot, 0.1 * k);
        m.transparent = true; m.opacity = lerp(m.opacity, Math.min(m.userData.baseOpacity ?? (m.userData.baseOpacity = m.opacity), dim * (mode === 'people' && !am.matched ? 0.15 : 1)), 0.1 * k);
      });
      if (am.matched && am.born) { const s = 1 + Math.sin(pulse * 2) * 0.02; am.group.scale.setScalar(s); }
    });

    /* Personas: flotan; en modo personas se adelantan; en una situación las relevantes crecen */
    people.forEach(pp => {
      const out = mode === 'people' ? (pp.visitor ? 0 : 3.2) : 0;
      const target = pp.base.clone(); target.z += out; target.y += mode === 'people' ? 0.8 : 0;
      if (!reduced) target.y += Math.sin(pulse * 1.3 + pp.phase) * 0.18;
      pp.sprite.position.lerp(target, reduced ? 1 : 0.08 * k);
      const base = pp.kind === 'user' ? 3.2 : pp.kind === 'household' ? 2.4 : 2.8;
      const want = base * (pp.matched ? 1.35 : 1) * (hovered === pp || selected === pp ? 1.12 : 1) * (mode === 'people' ? 1.15 : 1);
      const sc = lerp(pp.sprite.scale.x, want, 0.1 * k);
      pp.sprite.scale.set(sc, sc, 1);
      const alpha = story && !pp.matched && pp.kind !== 'user' ? 0.35 : 1;
      pp.sprite.material.opacity = lerp(pp.sprite.material.opacity, alpha, 0.1 * k);
    });

    /* Elevador */
    if (elevator) {
      elevator.t += dt * 0.00025;
      const y = 1.2 + (0.5 + 0.5 * Math.sin(elevator.t)) * (BH - 2.6);
      elevator.cab.position.y = reduced ? 1.2 : y;
    }
    /* Conexiones: trazo progresivo */
    const tNow = now();
    links.forEach(l => {
      const t = reduced ? 1 : clamp((tNow - l.born) / 900, 0, 1);
      l.line.geometry.setDrawRange(0, Math.round(easeOut(t) * 41));
    });
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min(48, t - (lastT || t));
    lastT = t;
    if (visible && renderer) { step(dt); renderer.render(scene, camera); placeLabels(); }
    raf = requestAnimationFrame(frame);
  }

  /* ---- Interacción ---- */
  function pick(x, y) {
    if (!raycaster) return null;
    const m = new THREE.Vector2((x / W) * 2 - 1, -(y / H) * 2 + 1);
    raycaster.setFromCamera(m, camera);
    const spriteHits = raycaster.intersectObjects(people.map(pp => pp.sprite), false);
    if (spriteHits.length) return people.find(pp => pp.sprite === spriteHits[0].object) || null;
    const meshes = [];
    amenities.forEach(am => am.group.traverse(o => { if (o.isMesh) meshes.push(o); }));
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length) { const a = hits[0].object.userData.amenity; return amenities.find(am => am.data === a) || null; }
    return null;
  }

  function tooltipHtml(t) {
    if (t.sprite) {
      const x = { e: t.entity, kind: t.kind };
      let out = `<strong>${esc(t.kind === 'user' ? 'Tú' : t.entity.name)}</strong><span>${esc(t.visitor ? 'Llegas por la entrada' : whereLabel(x))}</span>`;
      if (t.kind === 'person' && hasTrust()) out += Trust.signals(t.entity.id, 'es', { max: 2 }).map(s => `<em>${esc(s)}</em>`).join('');
      if (t.kind === 'household') out += '<em class="twin__tip-new">Vecino nuevo · todavía no se han ayudado</em>';
      const caps = (t.entity.capabilities || []).slice(0, 3).map(c => esc(c.label)).join(' · ');
      if (caps) out += `<span class="twin__tip-caps">${caps}</span>`;
      if (t.matched && story) {
        const step = (story.result.solutions || []).flatMap(s => s.steps.concat(s.extras)).find(s => s.personId === t.entity.id);
        if (step) out += `<em class="twin__tip-match">${esc(step.because)}</em>`;
      }
      return out;
    }
    const a = t.data;
    let out = `<strong>${a.icon} ${esc(a.label)}</strong><span>${esc([a.hours, a.note].filter(Boolean).join(' · ') || levelLabel(a))}</span><em class="twin__tip-why">${esc(a.why || '')}</em>`;
    if (t.matched && story) {
      const ps = story.here.find(p => p.amenityId === a.id);
      const need = ps && story.result.needs.find(n => n.id === ps.needId);
      if (need) out += `<em class="twin__tip-match">${esc(ps.covers ? 'Lo resuelve el lugar' : 'Complementa')}: ${esc(need.label)}</em>`;
    }
    return out;
  }
  function levelLabel(a) {
    if (a.level === 'all') return 'Todos los pisos';
    if (a.level === 'roof') return 'Azotea';
    if (a.level === 'outside') return 'Exterior';
    if (a.level === -1) return 'Sótano';
    return a.level === 0 ? 'Planta baja' : `Piso ${a.level}`;
  }
  function updateTooltip(t, x, y) {
    const tip = root && root.querySelector('.twin__tip');
    if (!tip) return;
    if (!t) { tip.hidden = true; return; }
    tip.innerHTML = tooltipHtml(t);
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x + 16, top = y - th / 2;
    if (left + tw > W - 8) left = x - tw - 16;
    top = clamp(top, 8, H - th - 8);
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  function bindPointer() {
    const pointers = new Map();
    const local = e => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    on(host, 'pointerdown', e => {
      host.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) pointerState = { last: p, moved: 0 };
      else if (pointers.size === 2) { const [a, b] = Array.from(pointers.values()); pointerState = { pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y), dist0: orbit.tdist }; }
    });
    on(host, 'pointermove', e => {
      const p = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (pointerState && pointerState.pinch && pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        orbit.tdist = clamp(pointerState.dist0 * (pointerState.d0 / (d || 1)), BH * 0.9, Math.max(BH, building.w) * 5);
        return;
      }
      if (pointerState && !pointerState.pinch) {
        const dx = p.x - pointerState.last.x, dy = p.y - pointerState.last.y;
        pointerState.moved += Math.hypot(dx, dy);
        pointerState.last = p;
        if (pointerState.moved > 3) auto = false;
        orbit.taz -= dx * 0.0065; orbit.tel = clamp(orbit.tel + dy * 0.005, 0.1, 1.35);
        if (pointerState.moved > 4) { hovered = null; updateTooltip(selected, 0, 0); if (!selected) updateTooltip(null); }
        return;
      }
      if (e.pointerType === 'touch') return;
      hovered = pick(p.x, p.y);
      host.style.cursor = hovered ? 'pointer' : 'grab';
      if (hovered) updateTooltip(hovered, p.x, p.y);
      else if (!selected) updateTooltip(null);
    });
    const end = e => {
      const p = local(e);
      const tap = pointerState && !pointerState.pinch && pointerState.moved < 6;
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        if (tap) {
          const t = pick(p.x, p.y);
          selected = t === selected ? null : t;
          updateTooltip(selected, p.x, p.y);
          highlightRow(selected);
        }
        pointerState = null;
      } else if (pointers.size === 1) {
        pointerState = { last: Array.from(pointers.values())[0], moved: 10 };
      }
    };
    on(host, 'pointerup', end);
    on(host, 'pointercancel', end);
    on(host, 'pointerleave', () => { if (!pointerState) { hovered = null; if (!selected) updateTooltip(null); } });
    on(host, 'wheel', e => {
      e.preventDefault();
      auto = false;
      orbit.tdist = clamp(orbit.tdist * Math.exp(e.deltaY * 0.0012), BH * 0.9, Math.max(BH, building.w) * 5);
    }, { passive: false });
  }

  function highlightRow(t) {
    root.querySelectorAll('.twin__row.is-selected').forEach(el => el.classList.remove('is-selected'));
    if (!t) return;
    const key = t.sprite ? `person:${t.entity.id}` : `amenity:${t.data.id}`;
    const row = root.querySelector(`.twin__row[data-key="${key}"]`);
    if (row) { row.classList.add('is-selected'); row.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }
  }

  /* ---- Vista ---- */
  const COPY = {
    idleTitle: 'La comunidad no es solo gente. El lugar también ayuda.',
    peopleTitle: 'Y quienes viven aquí ya saben hacer cosas.',
    privacy: 'Las personas se muestran junto a su piso, nunca en un departamento. Las ubicaciones son aproximadas para proteger la privacidad.'
  };

  function setCaption(state, u, st) {
    const cap = root && root.querySelector('.twin__caption');
    if (!cap) return;
    const list = amenitiesOf(building);
    let title = '', sub = '';
    if (state === 'idle') {
      title = mode === 'people' ? COPY.peopleTitle : COPY.idleTitle;
      sub = mode === 'people'
        ? `${people.filter(pp => pp.kind !== 'user').length} vecinos viven en ${building.label}. Toca a alguien para ver qué sabe hacer, o sigue a la constelación.`
        : `${building.label}: ${list.map(a => a.label.toLowerCase()).join(', ')}. Cuenta una situación y verás qué parte del edificio te sirve.`;
    } else if (state === 'thinking') { title = 'Viendo qué parte del lugar te sirve…'; sub = u.summary || ''; }
    else if (state === 'done') {
      const hereLabels = st.here.map(p => `${p.label.toLowerCase()}${p.amenity && p.amenity.hours ? '' : ''}`);
      const names = st.people.map(pp => pp.entity.name);
      if (st.here.length) {
        title = 'El lugar también ayuda.';
        sub = `${cap1(hereLabels.join(' y '))} aquí en ${building.label}`;
        if (names.length) sub += `; ${names.join(', ')} ${names.length > 1 ? 'viven' : 'vive'} aquí y ${names.length > 1 ? 'pueden' : 'puede'} ayudar.`;
        else sub += '.';
        if (st.elsewhere.length) sub += ` También: ${st.elsewhere.slice(0, 2).map(p => `${p.label.toLowerCase()} en ${p.buildingLabel}`).join(' y ')}.`;
      } else if (st.elsewhere.length) {
        title = `Aquí no hay nada para esto, pero en ${st.elsewhere[0].buildingLabel} sí.`;
        sub = `${cap1(st.elsewhere[0].label)}: ${st.elsewhere[0].because}`;
      } else if (names.length) {
        title = `${names.join(' y ')} ${names.length > 1 ? 'viven' : 'vive'} aquí y ${names.length > 1 ? 'pueden' : 'puede'} ayudar.`;
        sub = 'El edificio no aporta un lugar para esto; las personas sí.';
      } else {
        title = 'Este edificio no aporta nada para esto.';
        sub = 'Mira el mapa o la constelación: la solución suele estar en otra torre.';
      }
    }
    cap.classList.remove('is-in'); void cap.offsetWidth; cap.classList.add('is-in');
    cap.innerHTML = `<p class="twin__title">${esc(title)}</p>${sub ? `<p class="twin__sub">${esc(sub)}</p>` : ''}`;
  }
  const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);

  function setActions(state) {
    const el = root && root.querySelector('.twin__actions');
    if (!el) return;
    if (state === 'idle') { el.innerHTML = ''; return; }
    const s = story && story.situation;
    const persisted = s && s.id && s.id !== 'preview';
    const primary = persisted
      ? `<a class="btn btn--primary" href="#/s/${esc(s.id)}">Ver la solución completa</a>`
      : `<button class="btn btn--primary" type="button" data-twin="resolve">Resolverlo con ellos</button>`;
    el.innerHTML = `${primary}<button class="btn btn--ghost" type="button" data-twin="clear">Ver el edificio en reposo</button>`;
  }

  function storyQuery() {
    const s = story && story.situation;
    return s ? (s.id && s.id !== 'preview' ? `s=${encodeURIComponent(s.id)}` : `q=${encodeURIComponent(s.text)}`) : '';
  }

  function renderPanel() {
    const el = root && root.querySelector('.twin__panel');
    if (!el) return;
    const list = amenitiesOf(building);
    const here = story ? story.here : [];
    const needById = story ? Object.fromEntries(story.result.needs.map(n => [n.id, n])) : {};
    const amenityRows = list.map(a => {
      const ps = here.find(p => p.amenityId === a.id);
      const need = ps && needById[ps.needId];
      return `
        <li class="twin__row ${ps ? 'is-match' : ''} ${story && !ps ? 'is-dim' : ''}" data-key="amenity:${esc(a.id)}" data-twin="focus-amenity" data-id="${esc(a.id)}">
          <span class="twin__row-icon" aria-hidden="true">${a.icon}</span>
          <span class="twin__row-body">
            <strong>${esc(a.label)}</strong> <span class="twin__row-meta">${esc([levelLabel(a), a.hours, a.note].filter(Boolean).join(' · '))}</span>
            <span class="twin__row-why">${esc(a.why || '')}</span>
            ${need ? `<span class="twin__row-match">${esc(ps.covers ? 'Lo resuelve el lugar' : 'Complementa')}: ${esc(need.label)}</span>` : ''}
          </span>
        </li>`;
    }).join('');
    const residents = residentsOf(building).filter(x => x.kind !== 'user');
    const personRows = residents.map(x => {
      const pp = people.find(p => p.entity.id === x.e.id);
      const matched = pp && pp.matched;
      const sig = x.kind === 'person' && hasTrust() ? (Trust.signals(x.e.id, 'es', { max: 1 })[0] || '') : (x.kind === 'household' ? 'Vecino nuevo' : '');
      const caps = (x.e.capabilities || []).slice(0, 2).map(c => esc(c.label)).join(' · ');
      return `
        <li class="twin__row ${matched ? 'is-match' : ''} ${story && !matched ? 'is-dim' : ''}" data-key="person:${esc(x.e.id)}" data-twin="focus-person" data-id="${esc(x.e.id)}">
          ${UI.avatar(x.e, 'sm')}
          <span class="twin__row-body">
            <strong>${esc(x.e.name)}</strong> <span class="twin__row-meta">${esc(whereLabel(x))}</span>
            <span class="twin__row-why">${caps}</span>
            ${sig ? `<span class="twin__row-sig">${esc(sig)}</span>` : ''}
          </span>
        </li>`;
    }).join('');
    const elsewhere = story && story.elsewhere.length ? `
      <h3 class="section__sub">También en otros edificios</h3>
      <ul class="twin__rows">${story.elsewhere.map(p => `
        <li class="twin__row"><span class="twin__row-icon" aria-hidden="true">${p.icon}</span>
          <span class="twin__row-body"><strong>${esc(p.label)}</strong> <span class="twin__row-meta">${esc(p.buildingLabel)}</span><span class="twin__row-why">${esc(p.because)}</span>
          <a class="twin__row-link" href="#/twin?b=${esc(p.placeId)}${storyQuery() ? '&' + storyQuery() : ''}">Entrar a ${esc(p.buildingLabel)} →</a></span></li>`).join('')}</ul>` : '';
    el.innerHTML = `
      <section class="twin__col" aria-labelledby="twin-place-title">
        <h2 id="twin-place-title" class="card__title">Lo que este lugar puede hacer</h2>
        <p class="muted small">Place Capabilities: el edificio también resuelve. Toca una zona en el 3D o aquí.</p>
        <ul class="twin__rows">${amenityRows || '<li class="muted">Este edificio todavía no declara nada.</li>'}</ul>
        ${elsewhere}
      </section>
      <section class="twin__col" aria-labelledby="twin-people-title">
        <h2 id="twin-people-title" class="card__title">Quién vive aquí</h2>
        <p class="muted small">Junto a su piso, nunca en un departamento. Lo que saben hacer se aprende de las situaciones que resuelven.</p>
        <ul class="twin__rows">${personRows || '<li class="muted">Nadie de la demo vive aquí todavía.</li>'}</ul>
      </section>`;
  }

  function levelStrip() {
    const steps = [
      { id: 'map', label: 'Mapa', sub: 'dónde' },
      { id: 'building', label: 'Edificio', sub: 'cómo está organizado' },
      { id: 'people', label: 'Personas', sub: 'quién vive aquí' },
      { id: 'constellation', label: 'Constelación', sub: 'cómo se conectan' }
    ];
    const active = mode === 'people' ? 'people' : 'building';
    return `<ol class="twin__levels" aria-label="Recorrido">${steps.map(s => `<li class="${s.id === active ? 'is-active' : ''}"><span>${s.label}</span><small>${s.sub}</small></li>`).join('')}</ol>`;
  }

  function template(b, p) {
    const c = State.community();
    const chips = c.examples.map(ex => `<button class="chip-btn" type="button" data-twin="try" data-text="${esc(ex.text)}">${esc(ex.label)}</button>`).join('');
    const others = buildings().map(x => `<button class="chip-btn ${x.id === b.id ? 'is-active' : ''}" type="button" data-twin="switch" data-id="${esc(x.id)}" ${x.id === b.id ? 'aria-current="true"' : ''}>${esc(x.label)}</button>`).join('');
    const where = typeof Places !== 'undefined' ? Places.distanceLabel(b) : '';
    return `
      <section class="twin" aria-labelledby="twin-title">
        <a class="back" href="#/map">← Mapa</a>
        <p class="eyebrow">${esc(c.name)} · Community Twin</p>
        <h1 id="twin-title" class="page__title">${esc(b.label)} <span class="twin__where">· ${esc(where === 'tu edificio' ? 'tu edificio' : where.replace(`${b.label} · `, ''))}</span></h1>
        <p class="page__sub">Cómo está organizado el lugar y qué puede hacer por ti. La comunidad no es solo gente: el edificio también ayuda.</p>
        ${typeof CommunityMap !== 'undefined' ? CommunityMap.viewSwitch('twin', p) : ''}
        <div class="twin__switch" role="group" aria-label="Edificio">${others}</div>
        <form class="twin__form" data-form="twin" novalidate>
          <label class="sr-only" for="twin-input">Cuéntanos tu situación</label>
          <textarea id="twin-input" name="situation" rows="2" placeholder="Llega mi paquete mañana y no estaré…" autocomplete="off">${esc(p.q || '')}</textarea>
          <button class="btn btn--primary btn--sm" type="submit">Ver qué parte del lugar sirve</button>
        </form>
        <div class="examples examples--dark"><span class="examples__label">Prueba con:</span><div class="examples__list">${chips}<button class="chip-btn" type="button" data-twin="try" data-text="Necesito un espacio para reunirnos el sábado, somos 20.">Espacio para reunirnos</button><button class="chip-btn" type="button" data-twin="try" data-text="Necesito ayuda para bajar un ropero pesado el domingo, no puedo solo.">Bajar algo pesado</button></div></div>
        <div class="twin__stage">
          <div class="twin__host" aria-hidden="true"></div>
          <div class="twin__labels" aria-hidden="true"></div>
          <div class="twin__tip" hidden></div>
          <div class="twin__caption is-in" role="status" aria-live="polite"></div>
          <div class="twin__loading" role="status">Levantando el edificio…</div>
          <div class="twin__tools">
            <button class="twin__tool" type="button" data-twin="reset" title="Volver a la vista inicial"><span aria-hidden="true">⟲</span><span class="sr-only">Volver a la vista inicial</span></button>
            <button class="twin__tool" type="button" data-twin="people" aria-pressed="false" title="Ver a las personas"><span aria-hidden="true">👥</span><span class="sr-only">Ver a las personas</span></button>
          </div>
        </div>
        ${levelStrip()}
        <div class="twin__flow">
          <a class="btn btn--ghost btn--sm" href="#/map" data-twin="to-map">← Mapa</a>
          <button class="btn btn--secondary btn--sm" type="button" data-twin="people">Ver a las personas</button>
          <button class="btn btn--secondary btn--sm" type="button" data-twin="to-constellation">Ver la constelación →</button>
        </div>
        <div class="twin__actions btn-row"></div>
        <div class="twin__panel"></div>
        <p class="muted small twin__foot">${esc(COPY.privacy)}</p>
      </section>`;
  }

  /* ---- Acciones ---- */
  function positions() {
    const out = {};
    people.forEach(pp => { if (pp.kind !== 'household') { const p = project(pp.sprite.position); out[pp.entity.id] = { fx: clamp(p.x / W, 0, 1), fy: clamp(p.y / H, 0, 1) }; } });
    return out;
  }

  function setMode(next) {
    mode = next;
    root.querySelectorAll('[data-twin="people"]').forEach(el => {
      el.setAttribute('aria-pressed', String(mode === 'people'));
      if (el.classList.contains('btn')) el.textContent = mode === 'people' ? 'Ver el edificio' : 'Ver a las personas';
    });
    const strip = root.querySelector('.twin__levels');
    if (strip) strip.outerHTML = levelStrip();
    if (!story) setCaption('idle');
    if (mode === 'people') { orbit.tel = 0.36; orbit.tdist = Math.max(BH, building.w) * 2.4; }
  }

  function handleAction(e) {
    const el = e.target.closest('[data-twin]');
    if (!el || !root || !root.contains(el)) return;
    const a = el.dataset.twin;
    if (a === 'to-map') return; /* el enlace navega */
    e.preventDefault();
    if (a === 'try') { const input = root.querySelector('#twin-input'); if (input) input.value = el.dataset.text; preview(el.dataset.text); }
    else if (a === 'clear') clearStory();
    else if (a === 'resolve') { if (story && typeof App !== 'undefined' && App.submitSituation) App.submitSituation(story.situation.text); }
    else if (a === 'reset') { auto = true; orbit.taz = 0.52; orbit.tel = 0.48; orbit.tdist = Math.max(BH, building.w) * 2.5; orbit.ty = BH * 0.42; }
    else if (a === 'people') setMode(mode === 'people' ? 'building' : 'people');
    else if (a === 'switch') { const q = storyQuery(); location.hash = `/twin?b=${encodeURIComponent(el.dataset.id)}${q ? '&' + q : ''}`; }
    else if (a === 'to-constellation') {
      /* Edificio → Personas → Constelación: cada persona vuela desde su lugar en la fachada a su lugar en el cielo. */
      if (scene) ViewHandoff.set({ from: 'twin', positions: positions() });
      const q = storyQuery();
      location.hash = `/constellation${q ? '?' + q : ''}`;
    }
    else if (a === 'focus-amenity') {
      const am = amenities.find(x => x.data.id === el.dataset.id);
      if (am) { selected = am; auto = false; orbit.ty = clamp(am.anchor.y - 1, 3, BH + 2); const p = project(am.anchor); updateTooltip(am, p.x, p.y); highlightRow(am); if (am.data.level === -1) orbit.tel = 0.2; }
    }
    else if (a === 'focus-person') {
      const pp = people.find(x => x.entity.id === el.dataset.id);
      if (pp) { selected = pp; auto = false; orbit.ty = pp.base.y; const p = project(pp.sprite.position); updateTooltip(pp, p.x, p.y); highlightRow(pp); }
    }
  }

  function handleSubmit(e) {
    const form = e.target.closest('[data-form="twin"]');
    if (!form || !root || !root.contains(form)) return;
    e.preventDefault();
    const input = form.querySelector('textarea');
    const text = (input.value || '').trim();
    if (!text) { input.focus(); return; }
    preview(text);
  }
  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'twin-input') {
      e.preventDefault();
      const form = e.target.closest('form');
      if (form) form.requestSubmit ? form.requestSubmit() : handleSubmit({ target: form, preventDefault() {} });
    }
  }
  function preview(text) {
    const understanding = Resolver.understandSituation(text);
    const needs = Resolver.discoverNeeds(understanding);
    show({ id: 'preview', text, understanding, needs, excluded: [] });
    if (stage && mobile) stage.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---- Montaje ---- */
  function resize() {
    if (!host) return;
    const r = host.getBoundingClientRect();
    W = Math.max(280, Math.round(r.width)); H = Math.round(r.height);
    if (renderer) {
      renderer.setSize(W, H, false);
      camera.aspect = W / H; camera.updateProjectionMatrix();
    }
  }
  let resizeTimer = 0;
  function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); }

  function start3D() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    buildScene(building);
    buildLabels();
    resize();
    bindPointer();
    const loading = root.querySelector('.twin__loading');
    if (loading) loading.hidden = true;
    running = true; lastT = 0;
    raf = requestAnimationFrame(frame);
    if (story && story.pending) { const s = story.situation; story = null; later(() => show(s), 1400); }
  }

  function fallback(err) {
    const loading = root && root.querySelector('.twin__loading');
    if (!loading) return;
    loading.className = 'twin__fallback';
    loading.innerHTML = `<strong>La vista 3D no está disponible ahora</strong><span>${esc(err && err.message === 'sin WebGL' ? 'Este navegador no tiene WebGL.' : 'Hace falta conexión para cargar el motor 3D.')} La ficha del edificio de abajo tiene la misma información.</span>
      <div class="twin__fallback-list">${amenitiesOf(building).map(a => `<span class="focus__item">${a.icon} ${esc(a.label)}</span>`).join('')}</div>`;
    if (story && story.pending) { const s = story.situation; story = null; scene = null; showLite(s); }
  }
  /* Sin 3D: destacar en la ficha lo que el resolver encontró. */
  function showLite(situation) {
    const result = Resolver.resolve(situation, State.graph());
    const placeSteps = [];
    (result.solutions || []).forEach(sol => (sol.placeSteps || []).forEach(p => { if (!placeSteps.some(x => x.amenityId === p.amenityId)) placeSteps.push(p); }));
    story = { situation, result, here: placeSteps.filter(p => p.placeId === building.id), elsewhere: placeSteps.filter(p => p.placeId !== building.id), placeSteps, people: [], done: true };
    setActions('story');
    setCaption('done', situation.understanding, story);
    renderPanel();
  }

  function mount(main, p) {
    dispose();
    params = p || {};
    reduced = UI.reducedMotion();
    mobile = window.innerWidth < 640 || (navigator.maxTouchPoints > 0 && window.innerWidth < 900);
    building = pickBuilding(params.b);
    if (!building) { main.innerHTML = '<a class="back" href="#/map">← Mapa</a><h1 class="page__title">Este lugar no tiene edificios que recorrer</h1>'; return; }
    rememberBuilding(building.id);
    mode = 'building'; story = null; auto = true; hovered = null; selected = null; skyMix = 0;
    main.innerHTML = template(building, params);
    root = main.querySelector('.twin');
    stage = root.querySelector('.twin__stage');
    host = root.querySelector('.twin__host');
    labelLayer = root.querySelector('.twin__labels');
    renderPanel();
    setCaption('idle');
    on(window, 'resize', onResize);
    on(document, 'click', handleAction);
    on(document, 'submit', handleSubmit, true);
    on(document, 'keydown', handleKey);
    on(document, 'visibilitychange', () => { visible = !document.hidden; });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => { visible = entries.some(en => en.isIntersecting) && !document.hidden; }, { threshold: 0.05 });
      io.observe(stage);
      listeners.push(() => io.disconnect());
    }
    hashListener = () => { if (Router.current().path !== ROUTE) dispose(); };
    window.addEventListener('hashchange', hashListener);

    /* La situación (si viene en la URL) espera a que el edificio se levante. */
    if (params.s) { const s = State.getSituation(params.s); if (s && s.understanding.kind !== 'helping') story = { situation: s, pending: true }; }
    else if (params.q) {
      const understanding = Resolver.understandSituation(params.q);
      story = { situation: { id: 'preview', text: params.q, understanding, needs: Resolver.discoverNeeds(understanding), excluded: [] }, pending: true };
    }
    ViewHandoff.take(); /* la llegada desde el mapa ya viene expresada en el levantamiento del edificio */
    const mountedRoot = root;
    loadThree().then(() => { if (root === mountedRoot) start3D(); }).catch(err => { if (root === mountedRoot) fallback(err); });
  }

  function dispose() {
    running = false;
    cancelAnimationFrame(raf);
    clearTimeout(resizeTimer);
    clearTimers();
    listeners.forEach(off => off());
    listeners = [];
    if (hashListener) { window.removeEventListener('hashchange', hashListener); hashListener = null; }
    if (scene) {
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }
      });
    }
    if (renderer) { renderer.dispose(); if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); }
    renderer = null; scene = null; camera = null; raycaster = null; elevator = null; mePos = null;
    floorMeshes = []; glassMats = []; edgeMats = []; amenities = []; people = []; links = [];
    story = null; entrance = null; hovered = null; selected = null; pointerState = null;
    root = null; stage = null; host = null; labelLayer = null;
  }

  return { mount, dispose, show, preview, clear: clearStory, lastBuilding, ROUTE, _debug: () => ({ building, amenities, people, story, mode, orbit, three: Boolean(THREE), cam: camera && { pos: camera.position.toArray(), fov: camera.fov, aspect: camera.aspect }, size: [W, H] }) };
})();
