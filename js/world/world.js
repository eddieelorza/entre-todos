/* ==========================================================================
   world/world.js — El director: una comunidad que se explora.

   Un solo mundo y una sola cámara. No se cambia de pantalla: se transforma
   el espacio, y cada transformación representa un concepto del producto.

     Mi comunidad   geografía → proximidad            (día, el residencial completo)
     Mi edificio    edificio → capacidades del lugar  (la fachada se vuelve cristal)
     Mis círculos   grupos que conoces                (un aro abraza a sus integrantes)
     Mis conexiones distancia entre nodos → confianza (las casas se van, los lazos quedan)
     Yo             persona → capacidad humana
     Necesidad      gravedad → convergencia → solución
     Ayuda completa pulso → los dos nodos quedan más cerca

   WebGL dibuja el mundo; HTML/CSS lleva texto, inputs, fotos, botones y
   accesibilidad. El MVP HTML sigue siendo el fallback: si no hay WebGL o
   Three.js no carga, `onFallback` devuelve al usuario a las vistas clásicas.

   Lee State / Trust / Places / Resolver a través de WorldData; no escribe
   en State. Las acciones reales (pedir ayuda) se delegan con `onAsk`.

   API: World.mount(host, { state?, q?, onAsk?, onFallback?, classicHref? })
        World.go(state, opts) · World.reveal() · World.need(text) · World.complete(personId)
        World.dispose()
   ========================================================================== */

const World = (() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.min.js';
  const FOV = 30;
  const NAV = [
    { id: 'community', label: 'Mi comunidad' }, { id: 'building', label: 'Mi edificio' }, { id: 'circles', label: 'Mis círculos' },
    { id: 'connections', label: 'Mis conexiones' }, { id: 'me', label: 'Yo' }
  ];
  const CONCEPTS = ['Casas', 'Personas', 'Relaciones', 'Confianza', 'Comunidad'];

  let THREE = null, root = null, host = null, options = {};
  let renderer = null, camera = null, raycaster = null, W = null, model = null;
  let width = 0, height = 0, dpr = 1, mobile = false, reduced = false;
  let raf = 0, running = false, visible = true, lastT = 0, slow = 0;
  let current = 'community', focus = null, story = null, selectedCircle = null, revealed = false;
  let cam = null, camT = null, userZoom = 1, drift = 0, shiftX = 0, shiftY = -1;
  let labels = new Map(), timers = [], listeners = [];
  let pointer = null, hoverId = null, nextAlive = 0, photo = null;
  let els = {};

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function later(fn, ms) { const id = setTimeout(fn, reduced ? Math.min(ms, 30) : ms); timers.push(id); return id; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function on(el, ev, fn, o) { el.addEventListener(ev, fn, o); listeners.push(() => el.removeEventListener(ev, fn, o)); }

  function loadThree() {
    try { const c = document.createElement('canvas'); if (!(c.getContext('webgl2') || c.getContext('webgl'))) return Promise.reject(new Error('sin WebGL')); } catch (err) { return Promise.reject(err); }
    if (THREE) return Promise.resolve(THREE);
    if (window.THREE_MODULE) { THREE = window.THREE_MODULE; return Promise.resolve(THREE); }
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000));
    return Promise.race([import(THREE_URL), timeout]).then(mod => { THREE = window.THREE_MODULE = mod; return THREE; });
  }

  /* ------------------------------------------------------------------
     Plantilla HTML: todo lo que se lee, se escribe o se pulsa
     ------------------------------------------------------------------ */
  function template() {
    const c = State.community();
    const chips = (c.examples || []).map(ex => `<button class="world__chip" type="button" data-world="try" data-text="${esc(ex.text)}">${esc(ex.label)}</button>`).join('');
    return `
      <section class="world${options.embedded ? ' world--embedded' : ''}" data-state="loading" data-sky="day" aria-labelledby="world-title">
        <div class="world__stage"><canvas class="world__canvas" aria-hidden="true"></canvas></div>
        <div class="world__vignette" aria-hidden="true"></div>
        <div class="world__labels"></div>
        <header class="world__top">
          <p class="world__eyebrow">${esc(c.name)} · ${esc(c.members)} vecinos</p>
          <h1 id="world-title" class="world__title" tabindex="-1">Tu comunidad</h1>
          <p class="world__sub" role="status" aria-live="polite"></p>
        </header>
        <nav class="world__nav" aria-label="Lugares de tu comunidad">
          ${NAV.map(n => `<button type="button" class="world__nav-btn" data-world="go" data-state="${n.id}">${esc(n.label)}</button>`).join('')}
        </nav>
        <ol class="world__concepts" aria-hidden="true">${CONCEPTS.map(x => `<li>${x}</li>`).join('')}</ol>
        <p class="world__line" aria-live="polite"></p>
        <aside class="world__card" hidden></aside>
        <div class="world__photo" hidden></div>
        <div class="world__dock">
          <div class="world__cta"></div>
          <form class="world__need" data-world-form="need" novalidate>
            <label class="sr-only" for="world-input">Cuéntanos qué necesitas resolver</label>
            <textarea id="world-input" name="situation" rows="1" placeholder="${esc((c.placeholders || ['Necesito…'])[0])}" autocomplete="off"></textarea>
            <button class="world__send" type="submit">Resolver</button>
          </form>
          <div class="world__chips" aria-label="Prueba con">${chips}</div>
        </div>
        <button class="world__skip" type="button" data-world="skip" hidden>Saltar</button>
        <a class="world__classic" href="${esc(options.classicHref || '#/')}">Vista clásica</a>
        <div class="world__loading" role="status"><span></span>Preparando tu comunidad…</div>
      </section>`;
  }

  function setTitle(title, sub) {
    if (els.title.textContent !== title) els.title.textContent = title;
    els.sub.textContent = sub || '';
  }
  function setLine(text, big) {
    els.line.classList.remove('is-in');
    if (!text) return;
    later(() => { els.line.textContent = text; els.line.classList.toggle('is-big', Boolean(big)); els.line.classList.add('is-in'); }, 220);
  }
  function setConcept(i) {
    els.concepts.classList.toggle('is-on', i >= 0);
    Array.from(els.concepts.children).forEach((li, k) => { li.classList.toggle('is-done', k < i); li.classList.toggle('is-now', k === i); });
  }
  function setCta(html) { els.cta.innerHTML = html || ''; }
  function setCard(html) {
    els.card.hidden = !html;
    els.card.innerHTML = html ? `<button class="world__card-close" type="button" data-world="close-card" aria-label="Cerrar">×</button>${html}` : '';
    root.classList.toggle('has-card', Boolean(html));
  }
  function setState(id) {
    current = id;
    root.dataset.state = id;
    root.querySelectorAll('.world__nav-btn').forEach(b => {
      const active = b.dataset.state === id || (id === 'need' && false);
      b.classList.toggle('is-active', active);
      if (active) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }

  /* ------------------------------------------------------------------
     Cámara: un dolly continuo entre poses
     ------------------------------------------------------------------ */
  /* Distancia a la que cabe una región, vista desde (az, el), sin quedar bajo el encabezado ni el muelle. */
  function fit(spanX, spanZ, el, az = Math.PI / 2, reserve = 0) {
    const t = Math.tan(FOV * Math.PI / 360), aspect = width / Math.max(1, height);
    const across = Math.abs(spanX * Math.sin(az)) + Math.abs(spanZ * Math.cos(az));
    const depth = Math.abs(spanX * Math.cos(az)) + Math.abs(spanZ * Math.sin(az));
    const usable = clamp((height - (reserve || (mobile ? 330 : 250))) / Math.max(1, height), 0.3, 0.9);
    return Math.max(across / (2 * t * aspect), (depth * Math.sin(el) + 30) / (2 * t * usable)) * 0.78;
  }
  function pose(id, o = {}) {
    const b = model.bounds, me = model.me;
    if (id === 'community') {
      const d = fit(b.maxX - b.minX + 40, b.maxZ - b.minZ + 30, 0.66, 0.9);
      return { x: (b.minX + b.maxX) / 2 + 8, y: 0, z: (b.minZ + b.maxZ) / 2 + 16, az: 0.9, el: 0.66, dist: mobile ? Math.min(d, 640) : d * 1.1 };
    }
    if (id === 'building') {
      const m = o.building;
      return { x: m.x, y: m.h * 0.48, z: m.z, az: 0.98, el: 0.4, dist: fit(m.w + 40, m.d + 40, 0.4, 0.98) * (mobile ? 0.8 : 0.92) + m.h };
    }
    if (id === 'approach') {
      const m = o.building;
      const b = model.bounds;
      return { x: lerp((b.minX + b.maxX) / 2, m.x, 0.4), y: 6, z: lerp((b.minZ + b.maxZ) / 2, m.z, 0.4), az: 1.12, el: 0.56, dist: fit(250, 190, 0.56, 1.12) * (mobile ? 0.8 : 1) };
    }
    if (id === 'need') {
      const g = o.center, r = o.radius || 60;
      return { x: g.x, y: g.y, z: g.z + r * 0.2, az: Math.PI / 2, el: 0.98, dist: fit(r * 2 + 24, r * 2 + 10, 0.98, Math.PI / 2, mobile ? height * 0.6 : 0) };
    }
    if (id === 'me') return { x: me.social.x, y: me.social.y, z: me.social.z, az: 1.35, el: 0.72, dist: mobile ? 120 : 96 };
    /* constelación */
    const r = mobile ? 96 : 128;
    return { x: me.social.x, y: model.skyY - 2, z: me.social.z + 6, az: Math.PI / 2 + 0.08, el: 0.94, dist: fit(r * 2, r * 2 * 0.86, 0.94) };
  }
  function moveCamera(p, rate) {
    /* el azimut viaja por el camino corto */
    let az = p.az; while (az - cam.az > Math.PI) az -= Math.PI * 2; while (az - cam.az < -Math.PI) az += Math.PI * 2;
    camT = Object.assign({}, p, { az });
    cam.rate = rate || 1.5;
    userZoom = 1;
  }
  function stepCamera(dt) {
    const k = reduced ? 1 : 1 - Math.exp(-cam.rate * dt);
    ['x', 'y', 'z', 'az', 'el', 'dist'].forEach(key => { cam[key] += (camT[key] - cam[key]) * k; });
    drift += dt;
    const az = cam.az + (reduced ? 0 : Math.sin(drift * 0.11) * 0.045), el = cam.el, d = cam.dist * userZoom;
    camera.position.set(cam.x + Math.cos(el) * Math.cos(az) * d, cam.y + Math.sin(el) * d, cam.z + Math.cos(el) * Math.sin(az) * d);
    camera.lookAt(cam.x, cam.y, cam.z);
    W.state.camDist = d;
  }

  /* ------------------------------------------------------------------
     Etiquetas HTML ancladas al mundo
     ------------------------------------------------------------------ */
  function label(id, o) {
    let l = labels.get(id);
    if (!l) {
      const el = document.createElement(o.action ? 'button' : 'span');
      if (o.action) { el.type = 'button'; el.dataset.world = o.action; el.dataset.id = o.target || id; }
      else el.setAttribute('aria-hidden', 'true');
      els.labels.appendChild(el);
      l = { el, x: 0, y: 0, shown: false };
      labels.set(id, l);
    }
    l.el.className = `world__label world__label--${o.kind}${o.cls ? ' ' + o.cls : ''}${l.shown ? ' is-in' : ''}`;
    if (l.html !== o.html) { l.el.innerHTML = o.html; l.html = o.html; }
    if (o.aria) l.el.setAttribute('aria-label', o.aria);
    Object.assign(l, { anchor: o.anchor, lift: o.lift || 0, below: Boolean(o.below), keep: true, alive: true, gate: o.gate || null });
    return l;
  }
  function beginLabels() { labels.forEach(l => { l.keep = false; }); }
  function endLabels() {
    labels.forEach((l, id) => {
      if (l.keep) return;
      l.alive = false; l.el.classList.remove('is-in');
      setTimeout(() => { if (!l.alive) { l.el.remove(); if (labels.get(id) === l) labels.delete(id); } }, 400);
    });
  }
  let camUp = null, vProj = null;
  function stepLabels() {
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    labels.forEach(l => {
      if (!l.alive) return;
      const a = l.anchor, p = a.pos || a, sprite = a.sprite;
      const k = sprite ? sprite.scale.x : 0;
      vProj.set(p.x, p.y + l.lift, p.z);
      if (sprite) vProj.copy(sprite.position);
      if (l.below) vProj.addScaledVector(camUp, -k * 0.56); else if (k) vProj.addScaledVector(camUp, k * 0.56);
      vProj.project(camera);
      const okGate = l.gate ? l.gate() : true;
      const ok = okGate && vProj.z < 1 && Math.abs(vProj.x) < 1.15 && Math.abs(vProj.y) < 1.15;
      if (ok !== l.shown) { l.shown = ok; l.el.classList.toggle('is-in', ok); }
      if (!ok) return;
      const x = (vProj.x * 0.5 + 0.5) * width, y = (-vProj.y * 0.5 + 0.5) * height;
      if (Math.abs(x - l.x) > 0.3 || Math.abs(y - l.y) > 0.3) { l.x = x; l.y = y; l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, ${l.below ? '2px' : '-100%'})`; }
    });
  }

  function personLabel(p, o = {}) {
    const m = p.model;
    label(`p:${m.id}`, {
      kind: 'person', cls: `${m.kind === 'user' ? 'is-me' : ''} ${o.cls || ''}`, html: `${esc(m.kind === 'user' ? 'Tú' : m.name)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}`, anchor: p, below: o.above !== true,
      action: 'person', target: m.id, aria: m.kind === 'user' ? 'Tú' : `${m.name}, ${m.buildingLabel}`, gate: o.gate || (() => p.act > 0.5)
    });
  }
  function buildingLabels(filter) {
    const seen = new Set();
    W.buildings.forEach(b => {
      const m = b.model;
      if (filter && !filter(m)) return;
      if (m.kind === 'house') { if (seen.has(m.zone)) return; seen.add(m.zone); }
      if (m.kind === 'gate') return;
      /* al pie del edificio: arriba viven las personas */
      const middle = m.kind === 'house' ? houseRowCenter(m.zone) : { x: m.x + m.w * 0.2, y: 0, z: m.z + m.d / 2 + 5 };
      label(`b:${m.id}`, {
        kind: 'building', html: esc(m.label), anchor: middle, lift: 0, below: true, action: m.enterable ? 'building' : null, target: m.id,
        aria: m.enterable ? `Entrar a ${m.label}` : null, gate: () => W.state.sky < 0.45 && b.solid > 0.7
      });
    });
  }
  function houseRowCenter(zone) {
    const row = model.buildings.filter(b => b.zone === zone);
    return { x: row.reduce((s, b) => s + b.x, 0) / row.length, y: 0, z: row.reduce((s, b) => s + b.z, 0) / row.length + 12 };
  }

  /* ------------------------------------------------------------------
     Piezas reutilizadas por los estados
     ------------------------------------------------------------------ */
  function resetStory() {
    story = null; photo = null;
    els.photo.hidden = true; els.photo.innerHTML = '';
    W.clearNodes('story');
    W.ribbons.slice().forEach(r => { if (r.story) { r.alphaT = 0; r.dying = true; } });
    W.capList.forEach(c => { c.hidden = false; });
    W.clearCircleRings();
    W.people.forEach(p => { p.wake = 0; });
  }
  function reapRibbons() {
    W.ribbons.slice().forEach(r => { if (r.dying && r.alpha < 0.02) W.removeRibbon(r); });
  }
  function layout(kind, o = {}) {
    W.people.forEach(p => {
      const m = p.model;
      let t = kind === 'social' ? m.social : m.phys;
      if (kind === 'building' && o.building && m.building === o.building.id) t = m.home;
      if (o.targets && o.targets[m.id]) t = o.targets[m.id];
      p.target.set(t.x, t.y, t.z);
      if (o.omega) p.omega = o.omega * (0.85 + (p.index % 5) * 0.06);
    });
  }
  function architecture(value, o = {}) {
    const origin = o.origin || { x: 0, z: 0 };
    let max = 1; W.buildings.forEach(b => { max = Math.max(max, Math.hypot(b.model.x - origin.x, b.model.z - origin.z)); });
    W.buildings.forEach(b => {
      const v = o.except && o.except[b.model.id] != null ? o.except[b.model.id] : value;
      const d = Math.hypot(b.model.x - origin.x, b.model.z - origin.z) / max;
      b.rate = o.rate || 3.2;
      if (o.wave) later(() => { b.solidT = v; }, o.delay + d * o.wave); else b.solidT = v;
    });
  }
  function relations(show, o = {}) {
    W.relationRibbons.forEach((r, i) => {
      const mine = r.relation.mine;
      const apply = () => { r.progressT = show ? 1 : 0; r.alphaT = show ? r.baseAlpha : 0; r.dimT = o.onlyMine && !mine ? 0.18 : o.dim || 1; r.speed = o.speed || 1.4; };
      if (o.stagger && show) later(apply, o.delay + i * o.stagger); else apply();
    });
  }
  function everyone(act, o = {}) {
    W.people.forEach(p => { p.actT = o.only ? (o.only.has(p.model.id) ? 1 : act) : act; if (p.model.kind === 'household') p.actT = Math.min(p.actT, o.households == null ? 0.78 : o.households); });
  }
  function sky(v, rate) { W.state.skyT = v; W.state.skyRate = rate || 0.9; root.dataset.sky = v > 0.5 ? 'dusk' : 'day'; }

  /* ------------------------------------------------------------------
     Estados
     ------------------------------------------------------------------ */
  function go(id, o = {}) {
    if (!W) return;
    if (id === 'connections' && !revealed && W.state.sky < 0.5 && !o.quick) return reveal();
    clearTimers(); resetStory(); setCard(''); setConcept(-1); setLine('');
    root.classList.remove('is-story'); els.skip.hidden = true;
    selectedCircle = null;
    ({ community: enterCommunity, building: enterBuilding, circles: enterCircles, connections: enterConnections, me: enterMe }[id] || enterCommunity)(o);
  }

  function enterCommunity() {
    setState('community'); focus = null;
    setTitle('Tu comunidad', 'Cada torre, cada casa y quien vive ahí. Toca un edificio para entrar.');
    sky(0, 1.3); architecture(1); layout('phys', { omega: 2.4 }); everyone(1); relations(false);
    moveCamera(pose('community'), 1.4);
    beginLabels(); buildingLabels(); personLabel(W.personById[model.me.id], { gate: () => W.state.sky < 0.5 }); endLabels();
    setCta(`<button class="world__primary" type="button" data-world="reveal">Ver lo que no se ve</button>`);
  }

  function enterBuilding(o = {}) {
    const b = W.buildingById[o.building || (focus && focus.model.id) || model.me.building] || W.buildings.find(x => x.model.enterable);
    if (!b) return enterCommunity();
    setState('building'); focus = b; b.ensureFloors();
    const m = b.model, mine = m.id === model.me.building;
    const residents = W.people.filter(p => p.model.building === m.id);
    setTitle(mine ? 'Tu edificio' : m.label, mine ? `${m.label}. El lugar también puede ayudar.` : 'El lugar también puede ayudar.');
    sky(0.12, 1.2); relations(false);
    const view = pose('building', { building: m });
    architecture(1, { except: occluders(m, view) });
    layout('phys', { omega: 2.6 });
    everyone(0.3, { only: new Set(residents.map(p => p.model.id)), households: 0.3 });
    moveCamera(view, 1.7);
    beginLabels(); endLabels();
    /* La arquitectura se vuelve cristal: aparecen las personas en su piso y lo que el lugar sabe hacer. */
    later(() => {
      b.rate = 2.2; b.solidT = 0.4;
      layout('building', { building: m, omega: 2.2 });
      residents.forEach(p => { p.actT = 1; });
    }, 650);
    later(() => {
      beginLabels();
      residents.forEach(p => personLabel(p, { gate: () => true }));
      m.amenities.forEach((a, i) => {
        const n = W.addNode('amenity', { x: m.x, y: a.pos.y, z: m.z }, { icon: a.icon, size: 6.2, glow: 0.15, data: a });
        n.target.set(a.pos.x, a.pos.y, a.pos.z);
        later(() => { n.bornT = 1; }, i * 140);
        label(`a:${a.id}`, { kind: 'amenity', html: `${esc(a.label)}${a.hours ? ` <em>${esc(a.hours)}</em>` : ''}`, anchor: n, gate: () => n.born > 0.6 });
      });
      endLabels();
      setCard(buildingCard(m, residents));
    }, 1250);
    setCta(`<button class="world__primary" type="button" data-world="reveal">Ver a las personas sin paredes</button><button class="world__ghost" type="button" data-world="go" data-state="community">Volver a la comunidad</button>`);
  }

  /* Lo que queda entre la cámara y el edificio se vuelve un fantasma de cristal: nada tapa a donde entras. */
  function occluders(m, view) {
    const cx = view.x + Math.cos(view.el) * Math.cos(view.az) * view.dist, cz = view.z + Math.cos(view.el) * Math.sin(view.az) * view.dist;
    const dx = cx - m.x, dz = cz - m.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
    const out = {};
    model.buildings.forEach(b => {
      if (b.id === m.id || b.kind === 'park' || b.kind === 'court') return;
      const along = (b.x - m.x) * ux + (b.z - m.z) * uz;
      if (along <= 0 || along > len) return;
      const off = Math.abs((b.x - m.x) * -uz + (b.z - m.z) * ux);
      if (off < (Math.max(b.w, b.d) + Math.max(m.w, m.d)) / 2 + 10 + along * 0.18) out[b.id] = 0.16;
    });
    return out;
  }

  function buildingCard(m, residents) {
    const names = residents.filter(p => p.model.kind !== 'user').map(p => p.model.name);
    const list = m.amenities.map(a => `<li><span aria-hidden="true">${esc(a.icon)}</span><div><strong>${esc(a.label)}${a.hours ? ` · ${esc(a.hours)}` : ''}</strong><p>${esc(a.why || a.note || '')}</p></div></li>`).join('');
    return `<p class="world__card-eyebrow">Lo que este lugar puede hacer</p><h2>${esc(m.label)}</h2>
      <ul class="world__list">${list || '<li><div><p>Todavía no sabemos qué puede hacer este lugar.</p></div></li>'}</ul>
      ${names.length ? `<p class="world__card-foot">Aquí viven ${esc(joinNames(names))}. Nunca mostramos un departamento.</p>` : ''}`;
  }
  function joinNames(list) { return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`; }

  function constellationBase(o = {}) {
    sky(1, o.skyRate || 1.6);
    architecture(0, { rate: 3 });
    layout('social', { omega: o.omega || 2.2 });
    revealed = true;
  }
  function constellationLabels(filter) {
    beginLabels();
    W.people.forEach(p => { if (p.model.kind !== 'household' && (!filter || filter(p))) personLabel(p); });
    endLabels();
  }

  function enterConnections() {
    setState('connections');
    setTitle('Tus conexiones', 'Quien está más cerca de ti no es quien vive más cerca: es con quien ya te has ayudado.');
    constellationBase(); everyone(0.4, { only: new Set(model.people.filter(p => p.tier === 'direct' || p.tier === 'via' || p.kind === 'user').map(p => p.id)), households: 0.22 });
    relations(true, { stagger: 60, delay: 200 });
    moveCamera(pose('constellation'), 1.3);
    constellationLabels(p => p.model.tier === 'direct' || p.model.tier === 'via' || p.model.kind === 'user');
    setCta(legend());
  }
  function legend() {
    return `<ul class="world__legend" aria-label="Cómo leer los lazos"><li class="is-new">Se ayudaron una vez</li><li class="is-growing">Empiezan a conocerse</li><li class="is-frequent">Se ayudan seguido</li></ul>`;
  }

  function enterCircles(o = {}) {
    setState('circles');
    const list = model.circles.filter(c => c.id !== 'vecinos' && c.members.length);
    const pick = list.find(c => c.id === o.circle) || list.find(c => c.id === 'amigas') || list[0];
    setTitle('Tus círculos', 'Grupos que ya conoces. Según lo que necesites, importa uno u otro.');
    constellationBase();
    relations(true, { dim: 0.35 });
    moveCamera(pose('constellation'), 1.3);
    setCta(`<div class="world__tabs" role="group" aria-label="Círculos">${list.map(c => `<button type="button" class="world__tab${pick && c.id === pick.id ? ' is-active' : ''}" data-world="circle" data-id="${esc(c.id)}" aria-pressed="${pick && c.id === pick.id}">${esc(c.label)}</button>`).join('')}</div>`);
    if (pick) showCircle(pick);
  }
  function showCircle(c) {
    selectedCircle = c.id;
    W.clearCircleRings();
    const members = c.members.map(id => W.personById[id]).filter(Boolean);
    const ids = new Set(c.members.concat(model.me.id));
    everyone(0.22, { only: ids, households: 0.12 });
    /* El círculo tiene su propia gravedad: sus integrantes se juntan un poco. */
    const cx = members.reduce((s, p) => s + p.model.social.x, 0) / members.length, cz = members.reduce((s, p) => s + p.model.social.z, 0) / members.length;
    const targets = {};
    members.forEach(p => { const s = p.model.social; targets[p.model.id] = { x: lerp(s.x, cx, 0.34), y: s.y, z: lerp(s.z, cz, 0.34) }; });
    layout('social', { targets, omega: 2.4 });
    const ring = W.addCircleRing(members, { color: c.sensitive ? W.C.amarillo : W.C.sage });
    beginLabels();
    members.forEach(p => personLabel(p)); personLabel(W.personById[model.me.id]);
    label(`c:${c.id}`, { kind: 'circle', html: esc(c.label), anchor: { pos: ring.top }, gate: () => ring.alpha > 0.4 });
    endLabels();
    root.querySelectorAll('.world__tab').forEach(t => { const onTab = t.dataset.id === c.id; t.classList.toggle('is-active', onTab); t.setAttribute('aria-pressed', String(onTab)); });
  }

  function enterMe() {
    setState('me');
    const me = W.personById[model.me.id], u = State.user();
    setTitle('Tú', 'Lo que tu comunidad sabe de ti, y nada más.');
    constellationBase(); everyone(0.3, { only: new Set([model.me.id]), households: 0.15 });
    relations(true, { onlyMine: true });
    moveCamera(pose('me'), 1.5);
    beginLabels(); personLabel(me);
    W.capList.filter(c => c.owner === me).forEach((c, i) => {
      c.hidden = true;
      const a = -0.6 + i * 1.5;
      const n = W.addNode('cap', me.pos, { color: W.KIND_COLOR[c.cap.kind] });
      n.target.set(model.me.social.x + Math.cos(a) * 17, model.me.social.y + 1, model.me.social.z + Math.sin(a) * 12 - 6);
      later(() => { n.bornT = 1; }, 500 + i * 160);
      label(`cap:${c.cap.id}`, { kind: 'cap', html: esc(c.cap.label), anchor: n, gate: () => n.born > 0.6 });
    });
    endLabels();
    const caps = (u.capabilities || []).map(c => `<li><div><strong>${esc(c.label)}</strong>${c.evidence ? `<p>${esc(c.evidence.label)}</p>` : ''}</div></li>`).join('');
    later(() => setCard(`<p class="world__card-eyebrow">${esc(u.place || '')} · ${esc(model.me.buildingLabel)}</p><h2>${esc(u.name)}</h2>
      <ul class="world__list">${caps}</ul><a class="world__link" href="${esc(options.profileHref || '#/me')}">Ver mi perfil completo</a>`), 900);
    setCta('');
  }

  /* ------------------------------------------------------------------
     MOMENTO WOW · Community Twin → Community Constellation
     CASAS → PERSONAS → RELACIONES → CONFIANZA → COMUNIDAD
     ------------------------------------------------------------------ */
  function reveal() {
    if (!W) return;
    clearTimers(); resetStory(); setCard(''); selectedCircle = null;
    const from = focus ? focus.model : model.buildings.find(b => b.id === model.me.building) || model.buildings[0];
    setState('connections'); focus = null;
    root.classList.add('is-story');
    setCta(''); beginLabels(); endLabels();
    els.skip.hidden = false;
    setTitle('Tu comunidad', '');
    /* 1–2 · vemos el residencial y la cámara se aproxima */
    sky(0, 1); architecture(1); layout('phys'); everyone(1); relations(false);
    moveCamera(pose('approach', { building: from }), 0.75);
    setConcept(0); setLine('Esto es lo que se ve: casas, torres, calles.');
    /* 3 · los edificios empiezan a desaparecer, de donde estás hacia afuera */
    later(() => { architecture(0.4, { origin: from, wave: 1500, delay: 0, rate: 1.7 }); sky(0.3, 0.5); }, 1900);
    later(() => {
      architecture(0, { origin: from, wave: 1600, delay: 0, rate: 1.5 });
      sky(1, 0.5);
      setConcept(1); setLine('Las paredes se van. Las personas se quedan.');
    }, 3700);
    /* 4–5 · las personas permanecen en su posición; aparecen las relaciones */
    later(() => {
      relations(true, { stagger: 170, delay: 0, speed: 0.95 });
      setConcept(2); setLine('Entre ellas ya hay historia: un paquete, una escalera, una tarde.');
    }, 6600);
    /* 6–7 · la cercanía deja de medirse en metros: emerge la constelación */
    later(() => {
      const order = { me: 0, direct: 0, via: 250, circle: 500, far: 650, new: 800 };
      W.people.forEach(p => later(() => {
        p.omega = 1.35 + (p.index % 5) * 0.07;
        p.target.set(p.model.social.x, p.model.social.y, p.model.social.z);
      }, order[p.model.tier] || 0));
      everyone(1, { households: 0.34 });
      moveCamera(pose('constellation'), 0.62);
      setConcept(3); setLine('Ahora la distancia no son metros: es confianza.');
    }, 9000);
    /* 8 · la frase */
    later(() => {
      revealed = true;
      setConcept(4); setLine('Tu comunidad tiene más de lo que puedes ver.', true);
      constellationLabels(p => p.model.tier === 'direct' || p.model.tier === 'via' || p.model.kind === 'user');
    }, 12600);
    later(() => {
      root.classList.remove('is-story'); els.skip.hidden = true;
      setConcept(-1); setLine('');
      setTitle('Tus conexiones', 'Cuéntale a tu comunidad qué necesitas resolver.');
      setCta(legend());
      const input = root.querySelector('#world-input'); if (input && !mobile) input.focus({ preventScroll: true });
    }, 17400);
  }

  /* ------------------------------------------------------------------
     NEED → SOLUTION · la necesidad crea gravedad
     ------------------------------------------------------------------ */
  function need(text) {
    if (!W || !(text && typeof text === 'object' ? text.understanding : String(text || '').trim())) return;
    clearTimers(); resetStory(); setCard(''); setConcept(-1); selectedCircle = null; focus = null;
    root.classList.remove('is-story'); els.skip.hidden = true;
    const st = story = WorldData.plan(text, model);
    const u = st.understanding, en = u.lang === 'en';
    setState('need');
    setTitle(u.title || u.summary || 'Tu situación', en ? 'Understanding what you need…' : 'Entendiendo lo que necesitas…');
    setCta(''); setLine('');
    /* Con muchas piezas (o poca pantalla) hablan las personas; el detalle vive en la ficha HTML. */
    const dense = st.needs.length > 5 || (mobile && st.needs.length > 3);
    const wasDay = W.state.sky < 0.5;
    /* Si veníamos del residencial, las paredes se apartan primero: el mundo responde. */
    sky(1, wasDay ? 1.5 : 2);
    architecture(0, wasDay ? { origin: model.me.phys, wave: 700, delay: 0, rate: 3.4 } : { rate: 3 });
    relations(true, { dim: 0.09 });
    revealed = true;
    const t0 = wasDay ? 900 : 0;
    const me = W.personById[model.me.id];
    const G = st.center;

    later(() => {
      /* los demás se apartan y se atenúan; quienes pueden ayudar todavía no lo saben */
      const targets = {};
      W.people.forEach(p => {
        const s = p.model.social, dx = s.x - G.x, dz = s.z - G.z, d = Math.hypot(dx, dz) || 1;
        const out = Math.max(d * 1.12, 78);
        targets[p.model.id] = { x: G.x + dx / d * out, y: s.y - 3, z: G.z + dz / d * out };
      });
      targets[me.model.id] = st.targets[me.model.id];
      layout('social', { targets, omega: 2.3 });
      everyone(0.14, { only: new Set([me.model.id]), households: 0.08 });
      const radius = Math.max(60, ...Object.keys(st.targets).map(id => Math.hypot(st.targets[id].x - G.x, st.targets[id].z - G.z) + 16));
      moveCamera(pose('need', { center: G, radius }), 1.25);
      const center = W.addNode('center', me.pos, { icon: st.icon, glow: 0.75 });
      center.target.set(G.x, G.y, G.z); center.bornT = 1; st.centerNode = center;
      beginLabels(); personLabel(me, { gate: () => true }); endLabels();
    }, t0);

    /* 1 · las necesidades florecen alrededor */
    let t = t0 + 900;
    st.needs.forEach((n, i) => later(() => {
      const node = W.addNode('need', G, { covered: n.covered, optional: n.optional, glow: 0.3 });
      node.target.set(n.pos.x, n.pos.y, n.pos.z); node.bornT = 1; n.node = node;
      /* las de arriba se leen hacia el centro; las de abajo, hacia afuera: nunca encima de quien llega */
      if (dense) { /* solo el nodo */ } else if (st.needs.length > 1 || st.understanding.kind !== 'need') label(`n:${n.id}`, { kind: 'need', cls: n.covered ? '' : 'is-gap', html: esc(n.label), anchor: node, below: n.pos.z < G.z - 4, gate: () => node.born > 0.5 });
      else n.node.size = 0.01;
    }, t + i * 300));
    t += st.needs.length * 300 + 500;
    later(() => { els.sub.textContent = en ? 'Looking at who and what is nearby…' : 'Buscando quién y qué cerca puede ayudar…'; }, t - 300);

    /* los círculos que esta situación ilumina */
    later(() => {
      st.circles.slice(0, 1).forEach(c => {
        const members = c.members.map(id => W.personById[id]).filter(Boolean);
        if (!members.some(p => st.matched.has(p.model.id))) return;   /* un círculo solo emerge si de verdad participa */
        members.forEach(p => { if (!st.matched.has(p.model.id)) p.actT = Math.max(p.actT, 0.42); });
        const ring = W.addCircleRing(members.filter(p => st.matched.has(p.model.id)).length >= 2 ? members.filter(p => st.matched.has(p.model.id)) : members, { color: W.C.sage });
        label(`c:${c.id}`, { kind: 'circle', html: esc(c.label), anchor: { pos: ring.top }, gate: () => ring.alpha > 0.4 });
      });
    }, t);

    /* 2 · cada persona despierta, es atraída, y su recurso llega hasta la necesidad */
    st.steps.forEach((s, i) => later(() => {
      const p = W.personById[s.person.id], tg = st.targets[s.person.id];
      p.actT = 1; p.wake = W.state.time; p.omega = 1.9;
      p.target.set(tg.x, tg.y, tg.z);
      /* Paulina → vestido: el recurso se lee junto a quien lo tiene */
      const mine = st.steps.filter(x => x.person === s.person && x.shown || x === s); s.shown = true;
      personLabel(p, { gate: () => true, above: tg.z < G.z - 4, sub: dense && mobile ? '' : mine.map(x => shortLabel(x.cap.label, dense ? 22 : 30)).slice(0, dense ? 1 : 3).join(' · ') });
      const dot = W.capList.find(c => c.cap.id === s.cap.id); if (dot) dot.hidden = true;
      const cap = W.addNode('cap', p.pos, { color: W.KIND_COLOR[s.cap.kind], glow: 0.6, omega: 2.1 });
      cap.bornT = 1; s.node = cap;
      later(() => { cap.target.set(s.capPos.x, s.capPos.y, s.capPos.z); }, 380);
      const carry = W.addRibbon(p, cap, 'carry', { story: true }); carry.progressT = 1;
      later(() => {
        const link = W.addRibbon(s.fromUser ? st.centerNode : s.need.node, cap, 'solution', { story: true }); link.progressT = 1; link.speed = 1.8;
        s.link = link;
        later(() => { if (s.need.node) s.need.node.hit = W.state.time; st.centerNode.hit = W.state.time; }, 520);
      }, 900);
      (s.alternatives || []).slice(0, 1).forEach(id => { const a = W.personById[id]; if (a && !st.matched.has(id)) a.actT = Math.max(a.actT, 0.4); });
    }, t + i * 620));
    t += st.steps.length * 620 + 300;

    /* el lugar también forma parte de la solución */
    st.places.slice(0, 2).forEach((pl, i) => later(() => {
      const b = W.buildingById[pl.buildingId]; if (!b || !pl.need.node) return;
      b.rate = 1.6; b.solidT = 0.3;
      const am = b.model.amenities.find(a => a.id === pl.amenityId) || { pos: { x: b.model.x, y: 4, z: b.model.z } };
      const node = W.addNode('place', am.pos, { icon: pl.icon, glow: 0.35, omega: 1.7, size: 6.4 });
      node.bornT = 1;
      const np = pl.need.node.target, dx = am.pos.x - np.x, dz = am.pos.z - np.z, d = Math.hypot(dx, dz) || 1;
      later(() => node.target.set(np.x + dx / d * 15, np.y + 2, np.z + dz / d * 15), 500);
      label(`pl:${pl.amenityId}`, { kind: 'cap', cls: 'is-place', html: dense ? esc(pl.label) : `${esc(pl.label)} · ${esc(pl.buildingLabel)}`, anchor: node, below: true, gate: () => node.born > 0.6 && !(dense && mobile) });
      const link = W.addRibbon(pl.need.node, node, 'solution', { story: true }); link.mat.color.set(W.C.sage); later(() => { link.progressT = 1; }, 1100);
    }, t + i * 500));
    t += st.places.length ? 1500 : 500;

    /* 3 · convergencia: aparece la solución, en HTML */
    later(() => {
      st.done = true;
      els.sub.textContent = st.headline || (en ? 'Here is a way to solve it.' : 'Encontramos una forma de resolverlo.');
      if (st.steps.length >= 2 && st.centerNode) W.burst(st.centerNode, { size: 40, duration: 1.8 });
      setCard(solutionCard(st));
    }, t + 400);
  }
  function shortLabel(s, max = 38) { const cut = String(s).split(/[;(]/)[0].trim(); return cut.length > max ? `${cut.slice(0, max - 2).trim()}…` : cut; }

  function solutionCard(st) {
    const en = st.understanding.lang === 'en';
    const steps = st.steps.map(s => `<li><span class="world__dot" style="background:${W.TONES[s.person.tone] || W.TONES[3]}">${esc(s.person.initials)}</span><div><strong>${esc(s.person.name)} · ${esc(shortLabel(s.cap.label))}</strong><p>${esc(s.because || '')}</p></div></li>`).join('');
    const places = st.places.map(p => `<li><span aria-hidden="true">${esc(p.icon)}</span><div><strong>${esc(p.label)} · ${esc(p.buildingLabel)}</strong><p>${esc(p.because || '')}</p></div></li>`).join('');
    const gaps = st.needs.filter(n => !n.covered && !n.optional).map(n => n.label);
    const first = st.steps.find(s => s.cap.kind === 'object' && !s.fromUser);
    return `<p class="world__card-eyebrow">${st.understanding.kind === 'need' ? (en ? 'A way to solve it' : 'Una forma de resolverlo') : (en ? 'You can help' : 'Puedes ayudar')}</p>
      <h2>${esc(st.headline || st.understanding.title || '')}</h2>
      <ul class="world__list">${steps}${places}</ul>
      ${gaps.length ? `<p class="world__card-foot">${en ? 'Still open' : 'Eso sí hay que conseguirlo'}: ${esc(gaps.join(', '))}.</p>` : ''}
      <div class="world__card-actions">
        <button class="world__primary" type="button" data-world="ask">${st.steps.length > 1 ? (en ? `Ask these ${st.steps.length} people` : `Pedirles ayuda`) : (en ? 'Ask' : 'Pedir ayuda')}</button>
        ${first ? `<button class="world__ghost" type="button" data-world="photo" data-id="${esc(first.person.id)}">${en ? 'See a photo first' : `Ver una foto antes`}</button>` : ''}
      </div>`;
  }

  /* ------------------------------------------------------------------
     VISUAL CONFIRM · la foto emerge junto a quien la manda
     ------------------------------------------------------------------ */
  function demoPhoto(icon, text) {
    const c = document.createElement('canvas'); c.width = 480; c.height = 360;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 360); bg.addColorStop(0, '#F7F1E6'); bg.addColorStop(1, '#E4D5BF');
    g.fillStyle = bg; g.fillRect(0, 0, 480, 360);
    g.fillStyle = 'rgba(169,130,94,.28)'; g.fillRect(0, 262, 480, 98);
    g.fillStyle = 'rgba(43,34,27,.10)'; g.beginPath(); g.ellipse(240, 258, 112, 16, 0, 0, Math.PI * 2); g.fill();
    g.font = '150px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#2B221B';
    g.fillText(icon, 240, 170);
    g.font = '600 20px -apple-system, "Segoe UI", Roboto, sans-serif'; g.fillText(String(text).slice(0, 40), 240, 312);
    g.font = '600 12px -apple-system, "Segoe UI", Roboto, sans-serif'; g.fillStyle = '#8C7D70'; g.textAlign = 'right'; g.fillText('Foto de demo', 466, 346);
    return c.toDataURL('image/jpeg', 0.82);
  }
  function showPhoto(personId) {
    if (!story) return;
    const s = story.steps.find(x => x.person.id === personId) || story.steps[0];
    if (!s) return;
    const p = W.personById[s.person.id];
    setCard('');
    els.sub.textContent = `${s.person.name} te mandó una foto.`;
    p.wake = W.state.time; W.burst(p, { size: 22, duration: 1.1 });
    photo = { person: p, step: s };
    later(() => {
      els.photo.innerHTML = `<figure class="world__photo-card"><img alt="Foto de demo: ${esc(shortLabel(s.cap.label))}" src="${demoPhoto(story.icon, shortLabel(s.cap.label))}"><figcaption><strong>${esc(s.person.name)}</strong> · ${esc(shortLabel(s.cap.label))}</figcaption></figure>
        <div class="world__confirm" role="group" aria-label="¿Te sirve?"><p>¿Te sirve?</p>
          <button class="world__primary" type="button" data-world="confirm" data-answer="yes">Sí, me sirve</button>
          <button class="world__ghost" type="button" data-world="confirm" data-answer="ask">Tengo una pregunta</button>
          <button class="world__ghost" type="button" data-world="confirm" data-answer="no">No es lo que busco</button></div>`;
      els.photo.hidden = false;
      stepPhoto(); void els.photo.offsetWidth; els.photo.classList.add('is-in');
      const b = els.photo.querySelector('button'); if (b) b.focus({ preventScroll: true });
    }, 650);
  }
  function hidePhoto() {
    els.photo.classList.remove('is-in');
    const gone = photo; photo = null;
    setTimeout(() => { if (!photo) { els.photo.hidden = true; els.photo.innerHTML = ''; } }, 380);
    return gone;
  }
  function confirmPhoto(answer) {
    const ph = photo; if (!ph) return;
    const name = ph.person.model.name;
    if (answer === 'yes') { hidePhoto(); complete(ph.person.model.id); return; }
    if (answer === 'ask') {
      els.sub.textContent = `Le preguntamos a ${name}. Suele contestar pronto.`;
      const c = els.photo.querySelector('.world__confirm p'); if (c) c.textContent = `${name} está viendo tu pregunta…`;
      later(() => { if (photo === ph) { const q = els.photo.querySelector('.world__confirm p'); if (q) q.textContent = `${name}: "Claro, pasa a verlo cuando quieras." ¿Te sirve?`; } }, 2400);
      return;
    }
    hidePhoto();
    ph.person.actT = 0.3;
    if (ph.step.link) { ph.step.link.alphaT = 0.2; }
    els.sub.textContent = `Sin problema. ${name} no se entera de nada más.`;
    later(() => setCard(solutionCard(story)), 900);
  }

  /* ------------------------------------------------------------------
     COMPLETION · un pulso cálido viaja, y quedan un poco más cerca
     ------------------------------------------------------------------ */
  function complete(personId) {
    const p = W.personById[personId], me = W.personById[model.me.id];
    if (!p || !me) return;
    let bond = W.relationRibbons.find(r => (r.from === p && r.to === me) || (r.from === me && r.to === p));
    const first = !bond;
    if (!bond) { bond = W.addRibbon(me, p, 'new', { relation: { a: me.model.id, b: personId, mine: true, stage: 'new', strength: 0.15 } }); W.relationRibbons.push(bond); }
    bond.progressT = 1; bond.alphaT = bond.baseAlpha; bond.dimT = 1; bond.speed = 1.1;
    els.sub.textContent = `${p.model.name} te ayudó.`;
    W.pulse(bond, { reverse: bond.from === me, duration: reduced ? 0.05 : 1.7, size: 9, onDone: () => {
      W.burst(me, { size: 30 }); W.burst(p, { size: 24 }); me.wake = p.wake = W.state.time;
      later(() => W.pulse(bond, { reverse: bond.from !== me, duration: reduced ? 0.05 : 1.5, size: 7 }), 250);
    } });
    later(() => {
      /* la relación cambia de cómo se ve, nunca de número */
      /* una primera ayuda es un lazo nuevo; las siguientes lo van volviendo frecuente */
      const next = first ? 'new' : bond.stage === 'new' ? 'growing' : 'frequent';
      W.restyleRibbon(bond, next); bond.relation.stage = next;
      WorldData.closer(model, me.model.id, personId);
      const wasNeed = current === 'need';
      if (wasNeed) { resetStoryKeep(bond); }
      setState('connections');
      constellationBase({ omega: 1.5 }); everyone(0.4, { only: new Set(model.people.filter(x => x.tier === 'direct' || x.tier === 'via' || x.kind === 'user' || x.id === personId).map(x => x.id)), households: 0.22 });
      relations(true); moveCamera(pose('constellation'), 0.9);
      constellationLabels(x => x.model.tier === 'direct' || x.model.tier === 'via' || x.model.kind === 'user' || x.model.id === personId);
      setTitle('Resuelto entre todos', first ? `${p.model.name} y tú ya se conocen. Así empieza un lazo.` : `${p.model.name} y tú quedaron un poco más cerca.`);
      setCta(legend());
    }, 3300);
  }
  function resetStoryKeep() { const keep = story; resetStory(); return keep; }

  /* ------------------------------------------------------------------
     Personas: ficha con señales humanas (Trust.signals), nunca un número de confianza
     ------------------------------------------------------------------ */
  function personCard(id) {
    const p = W.personById[id]; if (!p) return;
    if (p.model.kind === 'user') return go('me');
    const m = p.model, ent = State.person(id);
    const signals = ent && typeof Trust !== 'undefined' ? Trust.signals(id, 'es') : [];
    const verified = ent && typeof Verification !== 'undefined' ? Verification.labels(ent, 'es', { short: true }) : [];
    const where = ent && typeof Matching !== 'undefined' ? Matching.distanceLabelFor(ent) : '';
    const caps = m.caps.slice(0, 4).map(c => `<li><span class="world__kind" style="background:${W.KIND_COLOR[c.kind] || W.C.amarillo}"></span><div><strong>${esc(c.label)}</strong></div></li>`).join('');
    p.wake = W.state.time;
    setCard(`<p class="world__card-eyebrow">${esc([m.buildingLabel, where && where !== 'mismo edificio' ? where : ''].filter(Boolean).join(' · '))}</p>
      <h2>${esc(m.name)}</h2>
      ${m.kind === 'household' ? '<p class="world__signal">Todavía no forma parte de tu red. Una primera ayuda pequeña es como empieza.</p>' : signals.map(s => `<p class="world__signal">${esc(s)}</p>`).join('')}
      ${verified.length ? `<p class="world__verified">${verified.map(esc).join(' · ')}</p>` : ''}
      <ul class="world__list">${caps}</ul>`);
  }

  /* ------------------------------------------------------------------
     Entrada: puntero, teclado, formularios
     ------------------------------------------------------------------ */
  function pick(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(v, camera);
    const sprites = W.people.filter(p => p.act > 0.3).map(p => p.sprite);
    const hitP = raycaster.intersectObjects(sprites, false)[0];
    if (hitP) return { type: 'person', id: hitP.object.userData.person };
    if (W.state.sky < 0.5) {
      const hitB = raycaster.intersectObjects(W.pickables, false)[0];
      if (hitB && W.buildingById[hitB.object.userData.building].solid > 0.5) return { type: 'building', id: hitB.object.userData.building };
    }
    return null;
  }
  function bindPointer() {
    const el = renderer.domElement;
    on(el, 'pointerdown', ev => { pointer = { x: ev.clientX, y: ev.clientY, az: camT.az, el: camT.el, moved: false, id: ev.pointerId }; el.setPointerCapture(ev.pointerId); });
    on(el, 'pointermove', ev => {
      if (pointer && pointer.id === ev.pointerId) {
        const dx = ev.clientX - pointer.x, dy = ev.clientY - pointer.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) pointer.moved = true;
        if (pointer.moved) { camT.az = pointer.az + dx * 0.005; camT.el = clamp(pointer.el + dy * 0.004, 0.28, 1.25); cam.rate = 6; }
        return;
      }
      if (mobile) return;
      const hit = pick(ev), id = hit ? `${hit.type}:${hit.id}` : null;
      if (id !== hoverId) { hoverId = id; el.style.cursor = hit ? 'pointer' : 'grab'; }
    });
    on(el, 'pointerup', ev => {
      const p = pointer; pointer = null;
      if (!p || p.moved) return;
      const hit = pick(ev);
      if (!hit) { if (!els.card.hidden && current !== 'need') setCard(''); return; }
      if (hit.type === 'person') personCard(hit.id); else go('building', { building: hit.id });
    });
    on(el, 'pointercancel', () => { pointer = null; });
    on(el, 'wheel', ev => { ev.preventDefault(); userZoom = clamp(userZoom * (1 + ev.deltaY * 0.0012), 0.55, 1.5); }, { passive: false });
  }
  function handleClick(ev) {
    const t = ev.target.closest('[data-world]'); if (!t || !root.contains(t)) return;
    const a = t.dataset.world;
    if (a === 'go') go(t.dataset.state);
    else if (a === 'reveal') reveal();
    else if (a === 'skip') go('connections', { quick: true });
    else if (a === 'building') go('building', { building: t.dataset.id });
    else if (a === 'person') personCard(t.dataset.id);
    else if (a === 'circle') { const c = model.circles.find(x => x.id === t.dataset.id); if (c) showCircle(c); }
    else if (a === 'close-card') setCard('');
    else if (a === 'try') { const i = root.querySelector('#world-input'); i.value = t.dataset.text; need(t.dataset.text); }
    else if (a === 'photo') showPhoto(t.dataset.id);
    else if (a === 'confirm') confirmPhoto(t.dataset.answer);
    else if (a === 'ask') {
      if (story && typeof options.onAsk === 'function') options.onAsk(story.situation.text, story);
      else if (story && story.steps[0]) { /* prueba aislada: nadie responde de verdad, se simula el desenlace */
        const obj = story.steps.find(s => s.cap.kind === 'object' && !s.fromUser);
        if (obj) showPhoto(obj.person.id); else { setCard(''); complete(story.steps[0].person.id); }
      }
    }
  }
  function handleSubmit(ev) {
    const f = ev.target.closest('[data-world-form="need"]'); if (!f) return;
    ev.preventDefault();
    need(f.querySelector('textarea').value);
  }
  function handleKey(ev) {
    if (ev.key === 'Escape') { if (root.classList.contains('is-story')) go('connections', { quick: true }); else if (photo) hidePhoto(); else if (!els.card.hidden) setCard(''); else if (current !== 'community') go('community'); }
    if (ev.key === 'Enter' && !ev.shiftKey && ev.target.id === 'world-input') { ev.preventDefault(); need(ev.target.value); }
  }

  /* ------------------------------------------------------------------
     Ciclo de vida
     ------------------------------------------------------------------ */
  function resize() {
    const r = els.stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === width && h === height) return;
    width = w; height = h;
    mobile = width < 700;
    renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
    camera.aspect = width / height;
    /* el mundo se centra un poco más arriba: abajo vive el formulario */
    applyViewOffset();
    if (camT) { const p = repose(); if (p) { camT.dist = p.dist; } }
  }
  /* El mundo se centra en el espacio libre: abajo vive el muelle; a la derecha, la ficha. */
  function applyViewOffset() {
    if (shiftY < 0) shiftY = height * (mobile ? 0.08 : 0.07);
    camera.setViewOffset(width, height, Math.round(shiftX), Math.round(shiftY), width, height);
    camera.updateProjectionMatrix();
  }
  function stepViewShift(dt) {
    const open = !els.card.hidden;
    const wantX = !mobile && open && width > 900 ? Math.min(190, width * 0.13) : 0;
    const wantY = height * (mobile ? (open ? 0.23 : 0.08) : 0.07);
    if (Math.abs(wantX - shiftX) < 0.5 && Math.abs(wantY - shiftY) < 0.5) return;
    const k = reduced ? 1 : 1 - Math.exp(-3 * dt);
    shiftX += (wantX - shiftX) * k; shiftY += (wantY - shiftY) * k;
    applyViewOffset();
  }
  function repose() {
    if (current === 'community') return pose('community');
    if (current === 'building' && focus) return pose('building', { building: focus.model });
    if (current === 'connections' || current === 'circles') return pose('constellation');
    return null;
  }
  function stepPhoto() {
    if (!photo || els.photo.hidden) return;
    vProj.copy(photo.person.sprite.position).project(camera);
    const x = clamp((vProj.x * 0.5 + 0.5) * width, 150, width - 150), y = clamp((-vProj.y * 0.5 + 0.5) * height, 190, height - 200);
    els.photo.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
  function alive(t) {
    if (reduced || W.state.sky < 0.8 || t < nextAlive || current === 'need') return;
    nextAlive = t + 1.4 + Math.random() * 2.2;
    const pool = W.relationRibbons.filter(r => r.alpha * r.dim > 0.3 && r.progress > 0.95);
    if (!pool.length) return;
    const weights = pool.map(r => (r.stage === 'frequent' ? 3 : r.stage === 'growing' ? 1.5 : 0.6));
    let k = Math.random() * weights.reduce((a, b) => a + b, 0), r = pool[0];
    for (let i = 0; i < pool.length; i++) { k -= weights[i]; if (k <= 0) { r = pool[i]; break; } }
    W.pulse(r, { duration: 1.8, size: r.stage === 'frequent' ? 4.6 : 3.4, reverse: Math.random() < 0.5 });
  }
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!visible) { lastT = 0; return; }
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
    /* degradación: si el equipo no da, baja la resolución antes que los cuadros */
    if (lastT && now - lastT > 26) { if (++slow > 50 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); slow = 0; renderer.setPixelRatio(dpr); renderer.setSize(width, height, false); } } else slow = Math.max(0, slow - 1);
    lastT = now;
    stepViewShift(dt); stepCamera(dt); W.step(dt); alive(W.state.time); reapRibbons();
    camera.updateMatrixWorld();
    stepLabels(); stepPhoto();
    els.vignette.style.opacity = W.state.sky.toFixed(3);
    renderer.render(W.scene, camera);
  }

  function mount(hostEl, opts = {}) {
    dispose();
    host = hostEl; options = opts;
    reduced = typeof UI !== 'undefined' && UI.reducedMotion ? UI.reducedMotion() : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    host.innerHTML = template();
    root = host.querySelector('.world');
    if (opts.embedded) {
      /* dentro del MVP: el mundo ocupa todo lo que dejan la barra superior y la navegación */
      host.classList.add('app--world');
      const bar = document.querySelector('.topbar');
      root.style.setProperty('--world-top', `${bar ? bar.offsetHeight : 0}px`);
      if (opts.route) { const leave = () => { if (typeof Router === 'undefined' || Router.current().path !== opts.route) dispose(); }; window.addEventListener('hashchange', leave); listeners.push(() => window.removeEventListener('hashchange', leave)); }
    }
    els = {
      stage: root.querySelector('.world__stage'), canvas: root.querySelector('.world__canvas'), labels: root.querySelector('.world__labels'), title: root.querySelector('.world__title'),
      sub: root.querySelector('.world__sub'), line: root.querySelector('.world__line'), concepts: root.querySelector('.world__concepts'), card: root.querySelector('.world__card'),
      cta: root.querySelector('.world__cta'), skip: root.querySelector('.world__skip'), photo: root.querySelector('.world__photo'), vignette: root.querySelector('.world__vignette'), loading: root.querySelector('.world__loading')
    };
    const mounted = root;
    model = WorldData.build();
    if (!model.geo) { fail(new Error('sin plano')); return Promise.resolve(false); }
    return loadThree().then(() => {
      if (root !== mounted) return false;
      mobile = window.innerWidth < 700;
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2);
      renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: !mobile || dpr < 2, alpha: false, powerPreference: 'high-performance' });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      camera = new THREE.PerspectiveCamera(FOV, 1, 1, 3000);
      raycaster = new THREE.Raycaster();
      camUp = new THREE.Vector3(); vProj = new THREE.Vector3();
      W = WorldScene.create(THREE, model, { mobile, reduced });
      width = height = 0; resize();
      const start = pose('community');
      cam = Object.assign({ rate: 1.4 }, start, reduced ? {} : { dist: start.dist * 1.35, el: start.el + 0.18 });
      camT = Object.assign({}, start);
      bindPointer();
      on(window, 'resize', resize);
      on(document, 'click', handleClick);
      on(document, 'submit', handleSubmit, true);
      on(document, 'keydown', handleKey);
      on(document, 'visibilitychange', () => { visible = !document.hidden; });
      if ('ResizeObserver' in window) { const ro = new ResizeObserver(resize); ro.observe(els.stage); listeners.push(() => ro.disconnect()); }
      running = true; lastT = 0; raf = requestAnimationFrame(frame);
      els.loading.classList.add('is-gone');
      if (opts.situation || opts.q) { go('community'); later(() => need(opts.situation || opts.q), 600); }
      else if (opts.state === 'reveal') { go('community'); later(reveal, 900); }
      else go(opts.state || 'community', { quick: true, building: opts.building });
      return true;
    }).catch(err => { if (root === mounted) fail(err); return false; });
  }

  function fail(err) {
    if (typeof options.onFallback === 'function') { options.onFallback(err); return; }
    if (els.loading) els.loading.innerHTML = `Este dispositivo no puede dibujar el mundo en 3D. <a href="${esc(options.classicHref || '#/')}">Abrir la vista clásica</a>`;
  }

  function dispose() {
    running = false; cancelAnimationFrame(raf); clearTimers();
    listeners.forEach(off => off()); listeners = [];
    labels.forEach(l => l.el.remove()); labels = new Map();
    if (W) { W.dispose(); W = null; }
    if (renderer) { renderer.dispose(); renderer = null; }
    if (root && root.parentNode) root.parentNode.removeChild(root);
    if (host) host.classList.remove('app--world');
    root = null; model = null; story = null; photo = null; focus = null; camT = null; cam = null; revealed = false; hoverId = null;
  }

  /* Para pruebas sin pantalla (pestaña oculta, capturas): avanza la simulación a mano y dibuja un cuadro. */
  function advance(seconds = 1) {
    if (!W) return null;
    for (let t = 0; t < seconds; t += 1 / 60) { stepViewShift(1 / 60); stepCamera(1 / 60); W.step(1 / 60); reapRibbons(); }
    camera.updateMatrixWorld(); stepLabels(); stepPhoto();
    els.vignette.style.opacity = W.state.sky.toFixed(3);
    renderer.render(W.scene, camera);
    return els.canvas;
  }

  return { mount, dispose, go, reveal, need, complete, advance, state: () => current, debug: () => ({ W, cam, camT, model, story, dpr }) };
})();
