/* ==========================================================================
   matching.js — findMatches(): quién, cerca, puede cubrir una necesidad.

   Trabaja sobre el Community Resource Graph (DATA.people con capabilities y
   routines). Considera, en este orden:
     1. comunidad          solo personas de la misma comunidad
     2. tipo de capacidad  object · skill · knowledge · time · route · contact · food
     3. etiquetas          lo que la necesidad pide vs. lo que la capacidad resuelve
     4. disponibilidad     rutinas (días + horas) contra el "cuándo" de la necesidad
     5. ubicación          distancia aproximada (GPS o zona) y radio máximo

   La ubicación viene de LocationService. Aquí nunca se leen coordenadas para
   mostrarlas: solo se calculan metros y se formatean ("80 m", "mismo edificio").

   Es el punto donde `resolver.js` (discoverCapabilities) puede apoyarse: recibe
   una necesidad normalizada y devuelve candidatos con `because`.
   ========================================================================== */

const Matching = (() => {
  const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_MS = 24 * 60 * 60 * 1000;

  /* Radio por defecto; `setDefaultRadius(null)` lo desactiva ("buscar más lejos"). */
  let defaultRadius = (typeof DATA !== 'undefined' && DATA.matching && DATA.matching.radius) || 500;

  /* Compatibilidad con el léxico anterior (offers con kind en español). */
  const LEGACY_KINDS = { objeto: 'object', comida: 'food', tiempo: 'time', conocimiento: 'knowledge', ayuda: 'skill' };

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tagHit(capTag, needTag) {
    const a = normalize(capTag);
    const b = normalize(needTag);
    if (b.length < 3 || a.length < 3) return a === b;
    return a === b || a.includes(b) || b.includes(a);
  }

  /* ---- Comunidad ---- */
  function communityOf(person) {
    return person.communityId || person.community || (typeof DATA !== 'undefined' && DATA.community && DATA.community.id) || null;
  }

  function currentCommunity() {
    if (typeof State !== 'undefined' && typeof State.community === 'function') {
      const c = State.community();
      if (c) return c;
    }
    return (typeof DATA !== 'undefined' && DATA.community) || {};
  }

  /* Personas del grafo con la evidencia aprendida (State.graph) o la semilla. */
  function currentPeople() {
    if (typeof State !== 'undefined' && typeof State.graph === 'function') {
      const g = State.graph();
      if (g && Array.isArray(g.people)) return g.people;
    }
    if (typeof State !== 'undefined' && typeof State.people === 'function') return State.people() || [];
    if (typeof State !== 'undefined' && typeof State.residents === 'function') return State.residents() || [];
    if (typeof DATA !== 'undefined') return DATA.people || DATA.residents || [];
    return [];
  }

  /* ---- Capacidades (acepta capabilities nuevas u offers antiguas) ---- */
  function capabilitiesOf(person) {
    if (Array.isArray(person.capabilities)) return person.capabilities;
    if (Array.isArray(person.offers)) {
      return person.offers.map(o => ({
        id: o.id, kind: LEGACY_KINDS[o.kind] || o.kind, label: o.title, tags: o.keywords || [],
        needsAvailability: o.kind === 'tiempo', legacy: o
      }));
    }
    return [];
  }

  /* ---- Cuándo ----
     Acepta { date, from, to } o el `when` heredado { tags: ['manana','tarde'], range }.
     Devuelve { date: Date|null, from: number|null, to: number|null }. */
  function resolveWhen(when, now = new Date()) {
    if (!when) return { date: null, from: null, to: null };
    const out = { date: null, from: null, to: null };
    if (when.date instanceof Date) out.date = when.date;
    else if (typeof when.date === 'string' || typeof when.date === 'number') out.date = new Date(when.date);
    if (Number.isFinite(when.from)) out.from = when.from;
    if (Number.isFinite(when.to)) out.to = when.to;

    const tags = Array.isArray(when.tags) ? when.tags : [];
    if (!out.date) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (tags.includes('hoy')) out.date = today;
      else if (tags.includes('manana')) out.date = new Date(today.getTime() + DAY_MS);
      else if (tags.includes('finde')) {
        const dow = today.getDay();
        const add = dow === 6 || dow === 0 ? 0 : 6 - dow;
        out.date = new Date(today.getTime() + add * DAY_MS);
      }
    }
    if (out.from == null && when.range && Number.isFinite(when.range.h1)) {
      const pm = when.range.suffix === 'PM';
      out.from = when.range.h1 + (pm && when.range.h1 < 12 ? 12 : 0);
      out.to = when.range.h2 + (pm && when.range.h2 < 12 ? 12 : 0);
    }
    if (out.from == null) {
      if (tags.includes('tarde')) { out.from = 14; out.to = 19; }
      else if (tags.includes('am')) { out.from = 8; out.to = 12; }
      else if (tags.includes('noche')) { out.from = 19; out.to = 23; }
    }
    return out;
  }

  /* ---- Disponibilidad por rutinas ----
     Devuelve { ok, known, routine, label }. known=false cuando la necesidad no
     dice cuándo o la persona no tiene rutinas: no penaliza ni premia. */
  function isAvailable(person, when, lang = 'es') {
    const w = resolveWhen(when);
    const routines = Array.isArray(person.routines) ? person.routines : [];
    if (!w.date || !routines.length) return { ok: true, known: false, routine: null, label: '' };
    const dow = w.date.getDay();
    const hit = routines.find(r => {
      if (!Array.isArray(r.days) || !r.days.includes(dow)) return false;
      if (w.from == null || !Number.isFinite(r.from) || !Number.isFinite(r.to)) return true;
      const to = w.to == null ? w.from + 1 : w.to;
      return r.from < to && r.to > w.from;
    });
    if (!hit) return { ok: false, known: true, routine: null, label: '' };
    return { ok: true, known: true, routine: hit, label: availabilityPhrase(person, hit, w, lang) };
  }

  function dayRef(date, lang) {
    const today = new Date();
    const diff = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / DAY_MS);
    const name = (lang === 'en' ? DAYS_EN : DAYS_ES)[date.getDay()];
    if (lang === 'en') {
      if (diff === 0) return `Today is ${name}`;
      if (diff === 1) return `Tomorrow is ${name}`;
      return `${name}`;
    }
    if (diff === 0) return `Hoy es ${name}`;
    if (diff === 1) return `Mañana es ${name}`;
    return `El ${name}`;
  }

  function availabilityPhrase(person, routine, w, lang) {
    const label = routine.label ? routine.label.charAt(0).toLowerCase() + routine.label.slice(1) : '';
    if (!label) return '';
    if (lang === 'en') return `${dayRef(w.date, 'en')} and ${person.name} is usually around then.`;
    return `${dayRef(w.date, 'es')} y ${person.name} ${label}.`;
  }

  /* ---- Ubicación ---- */
  function distanceFor(person, opts = {}) {
    if (typeof LocationService === 'undefined') return Number.isFinite(person.distance) ? person.distance : null;
    const community = opts.community || currentCommunity();
    return LocationService.distanceTo(person, {
      origin: opts.origin,
      zones: community.zones || [],
      anchor: opts.anchor
    });
  }

  function distanceLabelFor(person, opts = {}) {
    const meters = distanceFor(person, opts);
    return typeof LocationService !== 'undefined' ? LocationService.formatDistance(meters, { lang: opts.lang }) : (meters == null ? 'cerca de ti' : `${meters} m`);
  }

  function distanceScore(meters, radius) {
    if (meters == null) return 1;           /* no sabemos: neutral */
    if (meters === 0) return 3;
    if (meters <= 100) return 2.5;
    if (meters <= 150) return 2;
    if (meters <= 250) return 1;
    if (radius == null || meters <= radius) return 0.5;
    return 0;
  }

  function setDefaultRadius(meters) {
    defaultRadius = meters == null ? null : Number(meters);
  }

  function getDefaultRadius() {
    return defaultRadius;
  }

  /* ---- findMatches ----
     need: {
       tags: string[]            (o `keywords` heredado)
       kinds?: string[]          tipos de capacidad que sirven (object, skill, …)
       when?: { date, from, to } (o el `when` heredado con tags)
       lang?: 'es' | 'en'
     }
     options: {
       people?, community?, radius? (m, null = sin límite), limit? (3),
       kinds?: string[]          filtro duro por tipo de capacidad
       requireAvailability?: boolean   excluye a quien no esté disponible
       onePerPerson?: boolean (true)
       origin?: { coords, zone }  desde dónde medimos (por defecto, el usuario)
     }
     Devuelve candidatos ordenados: { person, capability, score, distance,
     distanceLabel, availability, because[] }. */
  function findMatches(need, options = {}) {
    if (!need) return [];
    if (need.mode && need.mode !== 'need') return [];
    const lang = need.lang === 'en' ? 'en' : 'es';
    const tags = (need.tags || need.keywords || []).map(normalize).filter(Boolean);
    const weak = (need.weak || []).map(normalize).filter(Boolean);
    const wantKinds = new Set((need.kinds || []).map(k => LEGACY_KINDS[k] || k));
    const hardKinds = options.kinds ? new Set(options.kinds.map(k => LEGACY_KINDS[k] || k)) : null;
    const community = options.community || currentCommunity();
    const communityId = community.id || null;
    const radius = options.radius === undefined ? defaultRadius : options.radius;
    const limit = options.limit === undefined ? 3 : options.limit;
    const people = options.people || currentPeople();
    const userId = (typeof State !== 'undefined' && typeof State.user === 'function' && State.user() && State.user().id) || (typeof DATA !== 'undefined' && DATA.user && DATA.user.id) || null;

    const results = [];
    people.forEach(person => {
      if (!person || person.id === userId) return;
      /* 1. comunidad */
      if (communityId && communityOf(person) && communityOf(person) !== communityId) return;

      /* 5. ubicación (se calcula una vez por persona) */
      const distance = distanceFor(person, { community, origin: options.origin, anchor: options.anchor });
      if (radius != null && distance != null && distance > radius) return;

      capabilitiesOf(person).forEach(cap => {
        const kind = LEGACY_KINDS[cap.kind] || cap.kind;
        /* 2. tipo de capacidad */
        if (hardKinds && !hardKinds.has(kind)) return;

        /* 3. etiquetas */
        const capTags = cap.tags || [];
        const strong = tags.filter(t => capTags.some(ct => tagHit(ct, t)));
        if (!strong.length) return;
        const soft = weak.filter(t => capTags.some(ct => tagHit(ct, t)));

        /* 4. disponibilidad */
        const availability = isAvailable(person, need.when, lang);
        if (!availability.ok && (options.requireAvailability || cap.needsAvailability)) return;

        let score = 10 + Math.min(strong.length - 1, 3) * 2 + soft.length * 0.5;
        if (wantKinds.size) score += wantKinds.has(kind) ? 3 : -1;
        if (availability.known) score += availability.ok ? 5 : -4;
        else score += 2;
        score += distanceScore(distance, radius);
        const evidence = cap.evidence && Number.isFinite(cap.evidence.count) ? cap.evidence.count : 0;
        score += Math.min(evidence, 5) * 0.4;
        score += (person.completed || 0) / 10;

        const distanceLabel = typeof LocationService !== 'undefined'
          ? LocationService.formatDistance(distance, { lang })
          : (distance == null ? 'cerca de ti' : `${distance} m`);
        const because = [];
        if (availability.label) because.push(availability.label);
        if (cap.evidence && cap.evidence.label) because.push(cap.evidence.label + '.');
        because.push(lang === 'en' ? `${cap.label} · ${distanceLabel}` : `${cap.label} · ${distanceLabel}`);

        results.push({ person, capability: cap, kind, score, distance, distanceLabel, availability, because,
          /* compatibilidad con las tarjetas anteriores */
          resident: person, offer: cap.legacy || cap, reason: because[0] || cap.label,
          action: cap.legacy ? cap.legacy.action : null,
          actionLabel: cap.legacy && typeof DATA !== 'undefined' && DATA.actions ? DATA.actions[cap.legacy.action] : null });
      });
    });

    results.sort((a, b) => b.score - a.score || (a.distance ?? 1e9) - (b.distance ?? 1e9));
    let out = results;
    if (options.onePerPerson !== false) {
      const seen = new Set();
      out = results.filter(r => (seen.has(r.person.id) ? false : seen.add(r.person.id)));
    }
    return limit == null ? out : out.slice(0, limit);
  }

  /* Personas ordenadas por cercanía (para "Tu comunidad hoy" / "Cerca de ti"). */
  function nearestPeople(options = {}) {
    const community = options.community || currentCommunity();
    const radius = options.radius === undefined ? null : options.radius;
    return (options.people || currentPeople())
      .map(p => ({ person: p, distance: distanceFor(p, { community }), distanceLabel: distanceLabelFor(p, { community, lang: options.lang }) }))
      .filter(x => radius == null || x.distance == null || x.distance <= radius)
      .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
  }

  return {
    findMatches, nearestPeople, isAvailable, resolveWhen,
    distanceFor, distanceLabelFor, setDefaultRadius, getDefaultRadius, normalize
  };
})();
