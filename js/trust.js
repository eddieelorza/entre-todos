/* ==========================================================================
   trust.js — Circles of Trust + Trust Graph personal y emergente.

   Idea central: la confianza no existe desde el principio; se construye con
   interacciones pequeñas que salen bien. Entre Todos no asume que ya tienes
   comunidad: te ayuda a construirla.

   Modelo (datos JS, sin base de datos todavía):

     Relation  Person ↔ Person
       { a, b, interactions, given, received, contexts[], last, via? }
       · semilla en community.trust[] + lo aprendido en la sesión
         (conexiones `done` y situaciones resueltas de State)

     Circle
       explícito  { id, label, kind:'explicit', members[], sensitive?, private? }
                  (community.circles[] + lo que el usuario agrega en State)
       emergente  'frequent' (ya se han ayudado varias veces) y
                  'reachable' (conectados a través de alguien de confianza)

     Contexto de confianza  objects · packages · pets · rides · family ·
                            home · elder · children · sensitive
       Alguien puede ser de confianza para prestar objetos y no para entrar
       a casa. `contextsOf(person)` lo modela; `Verification` cubre el resto.

   Nada de esto se muestra como número. `signals()` devuelve frases humanas:
     "Ya se han ayudado 4 veces." · "Conectada a través de Mariana." ·
     "Forma parte de tu red frecuente." · "Ya existe una relación de confianza."

   Relevancia (interna, nunca visible):
     relevance = proximity + trust + availability + context_match
               + relationship_history + mutual_connections
   con pesos distintos por perfil de situación (PROFILES). `relevance()` la
   consume Resolver.discoverCapabilities como bono sobre su puntuación base.

   Es un módulo de lectura: no modifica State salvo `addToCircle`, que
   siempre parte de una decisión explícita del usuario.
   ========================================================================== */

const Trust = (() => {
  const DAY = 24 * 60 * 60 * 1000;
  const FREQUENT_AT = 3;     /* interacciones para "red frecuente" */
  const SUGGEST_AT = 4;      /* interacciones para sugerir el círculo de confianza */
  const TRUST_CIRCLE = 'confianza';

  /* Qué contextos de confianza abre cada tipo de capacidad / necesidad. */
  const KIND_CONTEXT = { object: 'objects', time: 'packages', skill: 'objects', route: 'rides', knowledge: 'objects', contact: 'objects', food: 'objects', context: 'objects' };
  const SENSITIVE = new Set(['home', 'elder', 'children', 'sensitive']);

  /* Pesos por perfil de situación. El peso de cada factor cambia con la situación:
     un taladro es proximidad + disponibilidad; un vestido es círculo + afinidad;
     un adulto mayor es confianza + relación previa + conexiones mutuas. */
  const PROFILES = {
    default: { proximity: 1, availability: 1, trust: 1, context: 1, history: 1, mutual: 0.5, circle: 0.6 },
    object:  { proximity: 2, availability: 2, trust: 0.6, context: 0.8, history: 0.6, mutual: 0.3, circle: 0.3 },
    family:  { proximity: 1, availability: 1, trust: 1, context: 1.6, history: 1, mutual: 0.8, circle: 1.4 },
    garment: { proximity: 0.4, availability: 0.8, trust: 1.6, context: 2.2, history: 1.2, mutual: 1, circle: 2 },
    ride:    { proximity: 1.5, availability: 1.6, trust: 1.5, context: 2, history: 1, mutual: 0.8, circle: 0.6 },
    care:    { proximity: 0.6, availability: 1.8, trust: 3, context: 1.5, history: 2, mutual: 1.5, circle: 2 }
  };

  /* Qué círculos "se iluminan" según el perfil (además de los que el usuario elija). */
  const PROFILE_CIRCLES = {
    object: ['edificio', 'vecinos'],
    family: ['familias', 'vecinos'],
    garment: ['amigas', 'mujeres', 'privado'],
    ride: ['edificio', 'trabajo', 'vecinos'],
    care: [TRUST_CIRCLE, 'red-apoyo', 'voluntarios', 'mayores'],
    default: ['vecinos']
  };

  /* ---- Acceso a datos ---- */
  function community() { return (typeof State !== 'undefined' && State.community()) || {}; }
  function userId() { return (State.user() || {}).id; }
  function seedRelations() { return community().trust || []; }
  function seedCircles() { return community().circles || []; }

  function pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

  function contextOfCapability(cap) {
    if (!cap) return 'objects';
    if (cap.context) return cap.context;
    const tags = cap.tags || [];
    if (tags.some(t => /perro|gato|mascota|pet|dog/.test(t))) return 'pets';
    if (tags.some(t => /acompan|cita|clinica/.test(t))) return 'elder';
    if (tags.some(t => /nino|ninos|hijos|bebe|cuidar-ninos/.test(t))) return 'children';
    if (tags.some(t => /^(foco|instalar|colgar|escalera|electricidad)$/.test(t))) return 'home';
    return KIND_CONTEXT[cap.kind] || 'objects';
  }

  /* Relaciones aprendidas en la sesión: conexiones hechas y situaciones resueltas (no semilla). */
  function learnedRelations() {
    const me = userId();
    const map = new Map();
    const bump = (personId, ctx, when, given) => {
      if (!personId || personId === me) return;
      const key = pairKey(me, personId);
      const r = map.get(key) || { a: me, b: personId, interactions: 0, given: 0, received: 0, contexts: [], last: 0 };
      r.interactions += 1;
      if (given) r.given += 1; else r.received += 1;
      if (ctx && !r.contexts.includes(ctx)) r.contexts.push(ctx);
      r.last = Math.max(r.last, when || 0);
      map.set(key, r);
    };
    State.connections().filter(c => c.status === 'done').forEach(c => {
      const cap = (c.capabilityIds || []).map(id => State.capability(c.personId, id)).find(Boolean);
      bump(c.personId, contextOfCapability(cap), c.updatedAt, c.kind === 'helping');
    });
    State.situations().filter(s => s.status === 'resolved' && !s.seed && !State.connectionsFor(s.id).length).forEach(s => {
      (s.people || []).forEach(p => bump(p, 'objects', s.resolvedAt, s.understanding.kind !== 'need'));
    });
    return Array.from(map.values());
  }

  /* Todas las relaciones (semilla + aprendidas) indexadas por par. */
  function relations() {
    const map = new Map();
    seedRelations().forEach(r => {
      map.set(pairKey(r.a, r.b), Object.assign({ given: 0, received: 0, contexts: [], last: null }, r, {
        last: r.last != null ? r.last : (r.daysAgo != null ? Date.now() - r.daysAgo * DAY : null)
      }));
    });
    learnedRelations().forEach(l => {
      const key = pairKey(l.a, l.b);
      const base = map.get(key);
      if (!base) { map.set(key, l); return; }
      map.set(key, Object.assign({}, base, {
        interactions: base.interactions + l.interactions,
        given: base.given + l.given, received: base.received + l.received,
        contexts: Array.from(new Set(base.contexts.concat(l.contexts))),
        last: Math.max(base.last || 0, l.last || 0) || base.last
      }));
    });
    return map;
  }

  function relation(a, b) {
    return relations().get(pairKey(a, b)) || null;
  }

  function relationWith(personId) {
    return relation(userId(), personId);
  }

  /* Fuerza 0..1 de una relación: interacciones + variedad de contextos + recencia. */
  function strengthOf(r) {
    if (!r) return 0;
    const n = Math.min(1, r.interactions / 6) * 0.7;
    const ctx = Math.min(1, (r.contexts || []).length / 3) * 0.2;
    const days = r.last ? (Date.now() - r.last) / DAY : 90;
    const recency = days <= 30 ? 0.1 : days <= 90 ? 0.05 : 0;
    return Math.min(1, n + ctx + recency);
  }

  function strength(personId) {
    return strengthOf(relationWith(personId));
  }

  /* Confianza indirecta: alguien de mi red frecuente que ya se ha ayudado con esta persona. */
  function via(personId) {
    const me = userId();
    if (relationWith(personId)) return null;
    const rels = relations();
    let best = null;
    rels.forEach(r => {
      const other = r.a === personId ? r.b : r.b === personId ? r.a : null;
      if (!other || other === me) return;
      const mine = rels.get(pairKey(me, other));
      if (!mine || mine.interactions < 2) return;
      const score = strengthOf(mine) * strengthOf(r);
      if (!best || score > best.score) best = { personId: other, score, theirs: r, mine };
    });
    return best;
  }

  /* Conexiones mutuas (personas con las que ambos se han ayudado). */
  function mutual(personId) {
    const me = userId();
    const rels = relations();
    const mine = new Set();
    rels.forEach(r => { if (r.a === me) mine.add(r.b); else if (r.b === me) mine.add(r.a); });
    const out = [];
    rels.forEach(r => {
      const other = r.a === personId ? r.b : r.b === personId ? r.a : null;
      if (other && other !== me && mine.has(other)) out.push(other);
    });
    return out;
  }

  /* ---- Círculos ---- */
  function circles() {
    const learned = (typeof State.circleMembers === 'function') ? State.circleMembers() : {};
    const list = seedCircles().map(c => Object.assign({ kind: 'explicit', members: [] }, c, {
      members: Array.from(new Set((c.members || []).concat(learned[c.id] || [])))
    }));
    if (!list.some(c => c.id === TRUST_CIRCLE)) {
      list.push({ id: TRUST_CIRCLE, label: 'Tu círculo de confianza', kind: 'explicit', sensitive: true, private: true, members: learned[TRUST_CIRCLE] || [] });
    }
    return list;
  }

  function circle(id) { return circles().find(c => c.id === id) || null; }

  function inCircle(personId, circleId) {
    const c = circle(circleId);
    return Boolean(c && c.members.includes(personId));
  }

  function circlesOf(personId) {
    return circles().filter(c => c.members.includes(personId));
  }

  /* Círculo emergente: red frecuente (ya se han ayudado varias veces). */
  function frequent() {
    const me = userId();
    const out = [];
    relations().forEach(r => {
      const other = r.a === me ? r.b : r.b === me ? r.a : null;
      if (other && r.interactions >= FREQUENT_AT) out.push(other);
    });
    return out;
  }

  function isFrequent(personId) {
    const r = relationWith(personId);
    return Boolean(r && r.interactions >= FREQUENT_AT);
  }

  /* Personas alcanzables por confianza indirecta (sin relación directa aún). */
  function reachable() {
    return State.graph().people.map(p => p.id).filter(id => !relationWith(id) && via(id));
  }

  /* Qué círculos activa una situación (perfil + círculos del usuario, filtrando los que existen). */
  function activeCircles(u, needs) {
    const profile = profileOf(u, needs);
    const ids = PROFILE_CIRCLES[profile] || PROFILE_CIRCLES.default;
    const all = circles();
    const explicit = ids.map(id => all.find(c => c.id === id)).filter(Boolean);
    const emergent = [];
    if (frequent().length) emergent.push({ id: 'frequent', label: 'Tu red frecuente', kind: 'emergent', members: frequent() });
    if (profile === 'care' && reachable().length) emergent.push({ id: 'reachable', label: 'Conexiones a través de alguien de confianza', kind: 'emergent', members: reachable() });
    return { profile, explicit, emergent };
  }

  function profileOf(u, needs) {
    if (u && u.profile && PROFILES[u.profile]) return u.profile;
    if (Array.isArray(needs) && needs.some(n => n.sensitive)) return 'care';
    return 'default';
  }

  /* ---- Contextos de confianza por persona ---- */
  function contextsOf(personId) {
    const p = State.person(personId);
    const r = relationWith(personId);
    const explicit = new Set((p && p.trustedFor) || []);
    (r ? r.contexts : []).forEach(c => explicit.add(c));
    if (inCircle(personId, TRUST_CIRCLE)) ['objects', 'packages', 'pets', 'rides', 'home', 'elder', 'children'].forEach(c => explicit.add(c));
    if (inCircle(personId, 'red-apoyo')) ['elder', 'rides'].forEach(c => explicit.add(c));
    return Array.from(explicit);
  }

  function trustedFor(personId, context) {
    return contextsOf(personId).includes(context);
  }

  /* ---- Señales humanas ---- */
  const CONTEXT_WORDS = {
    es: { objects: 'algo prestado', packages: 'un paquete', pets: 'tu mascota', rides: 'un trayecto', family: 'algo de la familia', home: 'un arreglo en casa', elder: 'un acompañamiento', children: 'los niños' },
    en: { objects: 'something you borrowed', packages: 'a package', pets: 'your pet', rides: 'a ride', family: 'a family thing', home: 'a home repair', elder: 'accompanying someone', children: 'the kids' }
  };

  function ago(ts, lang) {
    if (!ts) return '';
    const days = Math.round((Date.now() - ts) / DAY);
    const en = lang === 'en';
    if (days <= 1) return en ? 'yesterday' : 'ayer';
    if (days < 14) return en ? 'a few days ago' : 'hace unos días';
    if (days < 45) return en ? 'last month' : 'el mes pasado';
    return en ? 'a while ago' : 'hace un tiempo';
  }

  /* Frases para una persona. `opts.context` afina la frase; `opts.max` limita. */
  function signals(personId, lang, opts = {}) {
    const en = lang === 'en';
    const p = State.person(personId);
    if (!p) return [];
    const r = relationWith(personId);
    const out = [];
    const fem = p.gender === 'f' || /a$/.test(p.name.split(' ').pop()) && !/^(Luis|Jesús|Tomás)$/.test(p.name);
    if (inCircle(personId, TRUST_CIRCLE)) out.push(en ? 'You already trust each other.' : 'Ya existe una relación de confianza.');
    if (r && r.interactions >= 2) out.push(en ? `You've helped each other ${r.interactions} times.` : `Ya se han ayudado ${r.interactions} veces.`);
    else if (r && r.interactions === 1) {
      const ctx = r.contexts[0] || 'objects';
      const what = (CONTEXT_WORDS[en ? 'en' : 'es'][ctx]) || CONTEXT_WORDS.es.objects;
      out.push(r.given
        ? (en ? `You helped ${p.name} with ${what} ${ago(r.last, lang)}.` : `Ayudaste a ${p.name} con ${what} ${ago(r.last, lang)}.`)
        : (en ? `Helped you with ${what} ${ago(r.last, lang)}.` : `Te ayudó con ${what} ${ago(r.last, lang)}.`));
    }
    if (isFrequent(personId)) out.push(en ? 'Part of your frequent network.' : 'Forma parte de tu red frecuente.');
    if (r && r.contexts.includes('objects') && r.interactions >= 2 && opts.context === 'objects') out.push(en ? 'You have shared things before.' : 'Han compartido objetos anteriormente.');
    if (!r) {
      const v = via(personId);
      if (v) {
        const who = State.person(v.personId);
        out.push(en ? `Connected through ${who.name}.` : `${fem ? 'Conectada' : 'Conectado'} a través de ${who.name}.`);
      }
    }
    const shared = circlesOf(personId).filter(c => c.id !== TRUST_CIRCLE && !c.private);
    if (shared.length && opts.circles !== false && out.length < 2) {
      out.push(en ? `In your "${shared[0].label}" circle.` : `En tu círculo "${shared[0].label}".`);
    }
    return out.slice(0, opts.max || 2);
  }

  /* ---- Relevancia (interna) ----
     Devuelve { bonus, signal, blocked } para un candidato. `base` es un
     objeto con lo que ya midió el resolver: { distance, available, known }. */
  function relevance(person, cap, need, u, base = {}) {
    const profile = profileOf(u, need ? [need] : []);
    const w = PROFILES[profile] || PROFILES.default;
    const context = (need && need.context) || contextOfCapability(cap);
    /* Solo la necesidad decide si algo es sensible (acompañar, domicilio, niños). El contexto
       inferido de una capacidad nunca bloquea: fuera del perfil care la confianza solo reordena. */
    const sensitive = Boolean(need && need.sensitive) || (profile === 'care' && SENSITIVE.has(context));
    const r = relationWith(person.id);
    const s = strengthOf(r);
    const v = r ? null : via(person.id);
    const mut = mutual(person.id).length;
    const active = activeCircles(u, need ? [need] : []);
    const inActive = active.explicit.some(c => c.members.includes(person.id));

    /* Contextos sensibles: identidad y comunidad verificadas; sin relación ni conexión indirecta, no aparece. */
    if (sensitive) {
      const ok = typeof Verification === 'undefined' || Verification.meets(person, context);
      if (!ok) return { bonus: -100, signal: '', blocked: true, reason: 'verification' };
      if (!r && !v && !inActive) return { bonus: -100, signal: '', blocked: true, reason: 'relation' };
    }

    let bonus = 0;
    bonus += w.trust * s * 4;
    bonus += w.history * (r ? Math.min(r.interactions, 4) * 0.5 : 0);
    bonus += w.mutual * Math.min(mut, 3) * 0.6;
    bonus += w.circle * (inActive ? 2 : 0);
    bonus += w.context * (trustedFor(person.id, context) ? 1.5 : 0);
    if (v) bonus += w.mutual * v.score * 3;
    if (typeof Verification !== 'undefined') bonus += (sensitive ? 1.2 : 0.3) * Verification.score(person);
    /* Proximidad y disponibilidad ya están en la puntuación base; aquí solo se reponderan. */
    if (Number.isFinite(base.distance)) bonus += (w.proximity - 1) * (base.distance === 0 ? 2 : base.distance <= 150 ? 1 : 0);
    if (base.available) bonus += (w.availability - 1) * 2;

    /* Fuera de care/garment la confianza solo desempata: nunca debe vencer a un match exacto de capacidad. */
    const ceiling = profile === 'care' ? 14 : profile === 'garment' ? 7 : profile === 'ride' || profile === 'family' ? 4 : 2.5;
    bonus = Math.min(bonus, ceiling);

    const signal = signals(person.id, u && u.lang, { context, max: 1 })[0] || '';
    return { bonus, signal, blocked: false, profile, context, strength: s };
  }

  /* ---- Del pequeño favor a la red de apoyo ---- */
  function suggestion() {
    const dismissed = (typeof State.dismissedSuggestions === 'function') ? State.dismissedSuggestions() : [];
    const me = userId();
    let best = null;
    relations().forEach(r => {
      const other = r.a === me ? r.b : r.b === me ? r.a : null;
      if (!other || r.interactions < SUGGEST_AT) return;
      if (inCircle(other, TRUST_CIRCLE) || dismissed.includes(other)) return;
      if (!best || r.interactions > best.relation.interactions) best = { personId: other, relation: r };
    });
    if (!best) return null;
    const p = State.person(best.personId);
    return {
      personId: best.personId,
      text: `Ya se han ayudado ${best.relation.interactions} veces. ¿Quieres agregar a ${p.name} a tu círculo de confianza?`,
      circleId: TRUST_CIRCLE
    };
  }

  /* Etapa de una relación, para la narrativa y la constelación. */
  function stage(personId) {
    const r = relationWith(personId);
    if (inCircle(personId, TRUST_CIRCLE)) return 'circle';
    if (!r) return via(personId) ? 'reachable' : 'unknown';
    if (r.interactions >= FREQUENT_AT) return 'frequent';
    if (r.interactions === 2) return 'familiar';
    return 'first';
  }

  /* Solo por decisión explícita del usuario. Nunca automático. */
  function addToCircle(circleId, personId) {
    if (typeof State.addToCircle !== 'function') return false;
    State.addToCircle(circleId, personId);
    return true;
  }

  return {
    PROFILES, TRUST_CIRCLE, FREQUENT_AT, SUGGEST_AT,
    relation, relationWith, relations, strength, strengthOf, via, mutual,
    circles, circle, circlesOf, inCircle, frequent, isFrequent, reachable, activeCircles, profileOf,
    contextsOf, trustedFor, contextOfCapability,
    signals, relevance, suggestion, stage, addToCircle
  };
})();
