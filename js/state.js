/* ==========================================================================
   state.js — Estado de la aplicación + persistencia en localStorage.

   La comunidad activa se elige en `entre-todos:community`. Cada comunidad
   tiene su propio estado (`entre-todos:state:<id>`):

   data = {
     version,
     situations[]   Situation { id, text, understanding, needs[], excluded[], strategy, status, createdAt, resolvedAt, seed? }
     connections[]  Connection { id, situationId, personId, capabilityIds[]?, needIds[]?, openId?, kind: request|helping,
                                 status: asked|accepted|done, message, title, createdAt, updatedAt }
     learned        { evidence: { capabilityId: n }, userCapabilities: [] }   ← lo que el grafo aprende en la sesión
   }

   El grafo de la comunidad (community.people) es de solo lectura; `graph()`
   lo devuelve con la evidencia aprendida ya sumada.
   ========================================================================== */

const State = (() => {
  const COMMUNITY_KEY = 'entre-todos:community';
  const DAY = 24 * 60 * 60 * 1000;
  let current = null;
  let data = null;

  const key = () => `entre-todos:state:${current.id}`;

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function seed() {
    const now = Date.now();
    return {
      version: DATA.seedVersion,
      situations: (current.seedSituations || []).map(s => ({
        id: s.id, text: s.text, seed: true,
        understanding: { kind: s.helping ? 'helping' : 'need', icon: s.icon, title: s.summary, summary: s.summary, lang: 'es' },
        needs: [], excluded: [], strategy: null,
        status: s.status, people: s.people, when: s.when || '', noPurchase: Boolean(s.noPurchase),
        createdAt: now - s.daysAgo * DAY, resolvedAt: s.status === 'resolved' ? now - s.daysAgo * DAY : null
      })),
      connections: [],
      learned: { evidence: {}, userCapabilities: [] }
    };
  }

  function readCommunityId() {
    try { return localStorage.getItem(COMMUNITY_KEY); } catch (err) { return null; }
  }

  function load() {
    current = DATA.community(readCommunityId());
    data = null;
    try {
      const raw = localStorage.getItem(key());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === DATA.seedVersion) data = parsed;
      }
    } catch (err) {
      /* localStorage bloqueado o datos corruptos: empezamos de cero */
    }
    if (!data) {
      data = seed();
      save();
    }
    return data;
  }

  function save() {
    try {
      localStorage.setItem(key(), JSON.stringify(data));
    } catch (err) {
      /* Modo privado o cuota llena: la sesión sigue en memoria */
    }
  }

  function reset() {
    data = seed();
    save();
  }

  /* ---- Comunidad activa ---- */
  const community = () => current;
  const communities = () => DATA.communities.slice();

  function setCommunity(id) {
    if (!DATA.communities.some(c => c.id === id)) return current;
    try { localStorage.setItem(COMMUNITY_KEY, id); } catch (err) { /* se queda en memoria */ }
    load();
    return current;
  }

  /* Lugares que esta comunidad reconoce, resueltos desde el catálogo. */
  function places() {
    return (current.places || []).map(p => (typeof p === 'string' ? DATA.placesCatalog[p] : p)).filter(Boolean);
  }

  /* ---- Grafo de la comunidad (con lo aprendido) ---- */
  function graph() {
    const ev = data.learned.evidence;
    const people = current.people.map(p => Object.assign({}, p, {
      capabilities: p.capabilities.map(c => {
        const extra = ev[c.id] || 0;
        if (!extra) return c;
        const base = c.evidence || { count: 0, label: '' };
        const count = base.count + extra;
        return Object.assign({}, c, { evidence: { count, label: evidenceLabel(c, count), learned: true } });
      })
    }));
    return { community: current, people, user: user() };
  }

  function evidenceLabel(c, count) {
    const times = count === 1 ? '1 vez' : `${count} veces`;
    if (c.kind === 'time') return `Ha ayudado con esto ${times}`;
    if (c.kind === 'object') return `Lo ha prestado ${times}; siempre regresó`;
    return `Ha ayudado con esto ${times}`;
  }

  function person(id) {
    if (id === current.user.id) return user();
    return graph().people.find(p => p.id === id) || null;
  }

  function capability(personId, capabilityId) {
    const p = person(personId);
    return p ? p.capabilities.find(c => c.id === capabilityId) || null : null;
  }

  function open(personId, openId) {
    const p = current.people.find(x => x.id === personId);
    return p ? p.open.find(o => o.id === openId) || null : null;
  }

  function user() {
    return Object.assign({}, current.user, {
      capabilities: current.user.capabilities.concat(data.learned.userCapabilities)
    });
  }

  function learnEvidence(capabilityId) {
    data.learned.evidence[capabilityId] = (data.learned.evidence[capabilityId] || 0) + 1;
    save();
  }

  /* ---- Círculos de confianza (siempre por decisión explícita del usuario) ---- */
  function circleMembers() {
    if (!data.learned.circles) data.learned.circles = {};
    return data.learned.circles;
  }

  function addToCircle(circleId, personId) {
    const c = circleMembers();
    c[circleId] = c[circleId] || [];
    if (!c[circleId].includes(personId)) c[circleId].push(personId);
    save();
    return c[circleId];
  }

  function dismissedSuggestions() {
    if (!data.learned.dismissed) data.learned.dismissed = [];
    return data.learned.dismissed;
  }

  function dismissSuggestion(personId) {
    const d = dismissedSuggestions();
    if (!d.includes(personId)) d.push(personId);
    save();
  }

  function learnUserCapability(capabilityItem) {
    const existing = data.learned.userCapabilities.find(c => c.id === capabilityItem.id);
    if (existing) {
      existing.evidence.count += 1;
      existing.evidence.label = `${existing.evidence.label.replace(/\s\d+ ve(z|ces)$/, '')} ${existing.evidence.count} veces`;
      save();
      return existing;
    }
    data.learned.userCapabilities.push(capabilityItem);
    save();
    return capabilityItem;
  }

  /* ---- Situaciones ---- */
  function addSituation(text, understanding, needs) {
    const s = { id: uid('s'), text, understanding, needs, excluded: [], strategy: null, status: 'open', createdAt: Date.now(), resolvedAt: null };
    data.situations.unshift(s);
    save();
    return s;
  }

  function getSituation(id) {
    return data.situations.find(s => s.id === id) || null;
  }

  function updateSituation(id, patch) {
    const s = getSituation(id);
    if (s) {
      Object.assign(s, patch);
      save();
    }
    return s;
  }

  function situations() {
    return data.situations.slice();
  }

  /* ---- Conexiones ---- */
  function addConnection(conn) {
    const now = Date.now();
    const full = Object.assign({ id: uid('c'), status: 'asked', createdAt: now, updatedAt: now }, conn);
    data.connections.unshift(full);
    save();
    return full;
  }

  function getConnection(id) {
    return data.connections.find(c => c.id === id) || null;
  }

  function updateConnection(id, patch) {
    const c = getConnection(id);
    if (c) {
      Object.assign(c, patch, { updatedAt: Date.now() });
      save();
    }
    return c;
  }

  function connectionsFor(situationId) {
    return data.connections.filter(c => c.situationId === situationId);
  }

  function connectionForOpen(openId) {
    return data.connections.find(c => c.openId === openId) || null;
  }

  function connections() {
    return data.connections.slice();
  }

  /* ---- Métricas: la principal es situaciones resueltas ---- */
  function stats() {
    const resolved = data.situations.filter(s => s.status === 'resolved');
    const session = resolved.filter(s => !s.seed);
    const helped = session.filter(s => s.understanding.kind === 'helping' || s.understanding.kind === 'opportunity').length;
    const involved = new Set();
    resolved.forEach(s => (s.people || []).forEach(p => involved.add(p)));
    data.connections.filter(c => c.status === 'done').forEach(c => involved.add(c.personId));
    return {
      resolved: current.user.completed + session.length,
      helped: current.user.helped + helped,
      people: involved.size,
      noPurchase: resolved.filter(s => s.noPurchase).length,
      inProgress: data.situations.filter(s => s.status === 'asked' || s.status === 'helping').length
    };
  }

  function communityStats() {
    const base = current.stats;
    const session = data.situations.filter(s => s.status === 'resolved' && !s.seed);
    const people = new Set();
    session.forEach(s => (s.people || []).forEach(p => people.add(p)));
    return {
      resolved: base.resolved + session.length,
      people: base.people + people.size,
      noPurchase: base.noPurchase + session.filter(s => s.noPurchase).length
    };
  }

  return {
    load, save, reset,
    community, communities, setCommunity, places,
    graph, person, capability, open, user, learnEvidence, learnUserCapability,
    circleMembers, addToCircle, dismissedSuggestions, dismissSuggestion,
    addSituation, getSituation, updateSituation, situations,
    addConnection, getConnection, updateConnection, connectionsFor, connectionForOpen, connections,
    stats, communityStats
  };
})();
