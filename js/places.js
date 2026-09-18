/* ==========================================================================
   places.js — Place Capabilities.

   La comunidad no es solo gente: el lugar también puede ayudar. Cada edificio
   (community.buildings[].amenities) declara lo que puede hacer por sí mismo:
   una recepción 24 h recibe paquetes, un bicicletero guarda una bici
   prestada, un salón común da espacio para reunirse, un elevador de carga
   sube algo pesado. El resolver las combina con las capacidades de personas
   y objetos:

     Person capabilities + Object capabilities + Place capabilities

   Modelo:
     Amenity { id, type, level, side?, hours?, note?, why }
       type  → CATALOG[type] { icon, label, tags[], related[] }
       tags     lo que el lugar resuelve por sí mismo (cubre la necesidad)
       related  contextos donde ayuda sin resolver (complementa a una persona)
       level    0..n piso · 'all' (elevadores) · 'roof' · 'outside' · -1 (sótano)

   API:
     Places.catalog(type)              icono/etiqueta/tags de un tipo
     Places.all()                      amenities de la comunidad activa, con su edificio
     Places.forBuilding(id)            amenities de un edificio
     Places.buildingOf(id)             edificio por id
     Places.match(need, opts)          candidatos [{ building, amenity, covers, helps, score, distance, because }]
     Places.distanceLabel(building)    "tu edificio" · "Torre A · 80 m"
   Módulo de lectura: no modifica State ni DATA.
   ========================================================================== */

const Places = (() => {
  const CATALOG = {
    lobby:     { icon: '🏛️', label: 'Lobby', labelEn: 'Lobby', tags: ['lobby', 'esperar', 'entrada'], related: ['paquete', 'entrega', 'ride', 'visita'] },
    reception: { icon: '🛎️', label: 'Recepción', labelEn: 'Reception', tags: ['recepcion', 'paquete', 'paquetes', 'entrega', 'recibir', 'llaves', 'package'], related: ['visita', 'ride'] },
    packages:  { icon: '📦', label: 'Área de paquetes', labelEn: 'Package room', tags: ['paquete', 'paquetes', 'entrega', 'recibir', 'envio', 'package', 'parcel'], related: [] },
    elevators: { icon: '🛗', label: 'Elevadores', labelEn: 'Elevators', tags: ['elevador', 'elevadores', 'elevator'], related: ['cargar', 'mover', 'mudanza', 'pesado', 'subir', 'bajar', 'mueble', 'carry', 'move', 'escalera'] },
    parking:   { icon: '🅿️', label: 'Estacionamiento', labelEn: 'Parking', tags: ['estacionamiento', 'estacionar', 'cochera', 'parking'], related: ['coche', 'camioneta', 'mudanza', 'transporte', 'car', 'ride'] },
    bikes:     { icon: '🚲', label: 'Bicicletero', labelEn: 'Bike rack', tags: ['bicicletero', 'estacionar-bici'], related: ['bici', 'bicicleta', 'bike', 'reparar-bici'] },
    gym:       { icon: '🏋️', label: 'Gimnasio', labelEn: 'Gym', tags: ['gimnasio', 'ejercicio', 'entrenar', 'pesas', 'gym'], related: [] },
    roof:      { icon: '🌿', label: 'Roof garden', labelEn: 'Roof garden', tags: ['roof', 'terraza', 'azotea', 'espacio', 'reunion', 'reunirnos', 'fiesta', 'asador', 'parrilla'], related: ['asador-tools', 'hielera', 'sillas', 'mesa'] },
    hall:      { icon: '🪑', label: 'Salón común', labelEn: 'Common room', tags: ['salon', 'espacio', 'lugar', 'reunion', 'reunirnos', 'juntarnos', 'junta', 'fiesta', 'evento', 'taller', 'clase', 'mesas', 'sillas', 'mesa', 'silla', 'table', 'chairs'], related: ['bocina', 'cocinar', 'preparar'] },
    kids:      { icon: '🧸', label: 'Área infantil', labelEn: 'Playground', tags: ['infantil', 'juegos', 'ninos', 'kids', 'playground'], related: ['disfraz', 'cumpleanos', 'costume', 'bebe', 'carriola'] },
    pets:      { icon: '🐕', label: 'Área de mascotas', labelEn: 'Pet area', tags: ['area-mascotas', 'pasear'], related: ['mascota', 'perro', 'gato', 'pet', 'dog', 'cuidar'] },
    meeting:   { icon: '📍', label: 'Punto de encuentro', labelEn: 'Meeting point', tags: ['punto-de-encuentro', 'encuentro', 'quedar'], related: ['ride', 'coche', 'llevar', 'transporte', 'car', 'paquete', 'entrega'] }
  };

  function normalize(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  /* Coincidencia exacta vale 1; raíz compartida de 4+ letras vale 0.5 (como en el resolver). */
  function tagHit(placeTags, needTags) {
    const pt = (placeTags || []).map(normalize);
    return (needTags || []).map(normalize).reduce((sum, nt) => {
      if (pt.includes(nt)) return sum + 1;
      const stem = pt.some(ct => Math.min(ct.length, nt.length) >= 4 && (ct.startsWith(nt) || nt.startsWith(ct)));
      return sum + (stem ? 0.5 : 0);
    }, 0);
  }

  function community() {
    if (typeof State !== 'undefined' && typeof State.community === 'function') return State.community() || {};
    if (typeof DATA !== 'undefined' && typeof DATA.community === 'function') return DATA.community() || {};
    return {};
  }

  function catalog(type) { return CATALOG[type] || { icon: '📍', label: type, labelEn: type, tags: [], related: [] }; }

  function decorate(amenity, building) {
    const cat = catalog(amenity.type);
    return Object.assign({}, cat, amenity, {
      building,
      label: amenity.label || cat.label,
      labelEn: amenity.labelEn || cat.labelEn,
      tags: cat.tags.concat(amenity.tags || []),
      related: cat.related.concat(amenity.related || [])
    });
  }

  function buildings() { return community().buildings || []; }
  function buildingOf(id) { return buildings().find(b => b.id === id) || null; }

  function all() {
    const out = [];
    buildings().forEach(b => (b.amenities || []).forEach(a => out.push(decorate(a, b))));
    return out;
  }

  function forBuilding(id) {
    const b = buildingOf(id);
    return b ? (b.amenities || []).map(a => decorate(a, b)) : [];
  }

  /* Distancia aproximada del usuario a un edificio (0 = su edificio). */
  function distanceTo(building) {
    if (!building) return null;
    const me = (typeof State !== 'undefined' && State.user && State.user()) || community().user || {};
    if (me.building && me.building === building.id) return 0;
    if (typeof Matching !== 'undefined') return Matching.distanceFor({ offset: building.offset, zone: building.id });
    return null;
  }

  function distanceLabel(building, lang) {
    const en = lang === 'en';
    const d = distanceTo(building);
    if (d === 0) return en ? 'your building' : 'tu edificio';
    const label = typeof LocationService !== 'undefined' ? LocationService.formatDistance(d, { lang }) : (d == null ? (en ? 'near you' : 'cerca de ti') : `${d} m`);
    return `${building.label} · ${label}`;
  }

  function because(amenity, need, lang) {
    const en = lang === 'en';
    const name = en ? amenity.labelEn : amenity.label;
    const hours = amenity.hours ? ` (${amenity.hours})` : '';
    const where = distanceLabel(amenity.building, lang);
    const head = en ? `${name}${hours} in ${where}.` : `${name}${hours} en ${where}.`;
    return `${head} ${amenity.why || ''}`.trim();
  }

  /* Candidatos de lugar para una necesidad. `covers`: el lugar la resuelve solo; `helps`: complementa. */
  function match(need, opts = {}) {
    if (!need) return [];
    const lang = opts.lang || need.lang || 'es';
    const tags = need.tags || [];
    const wantsPlace = Array.isArray(need.kinds) && need.kinds.includes('place');
    const out = [];
    all().forEach(a => {
      const cover = tagHit(a.tags, tags);
      const help = tagHit(a.related, tags);
      if (!cover && !help) return;
      const distance = distanceTo(a.building);
      const near = distance == null ? 1 : distance === 0 ? 3 : distance <= 100 ? 2 : distance <= 250 ? 1 : 0.4;
      const score = cover * 4 + help * 2 + near + (wantsPlace && cover ? 4 : 0);
      out.push({
        placeId: a.building.id, amenityId: a.id, type: a.type, icon: a.icon,
        label: lang === 'en' ? a.labelEn : a.label, buildingLabel: a.building.label,
        covers: cover > 0, helps: help > 0, score, distance, because: because(a, need, lang), amenity: a
      });
    });
    return out.sort((x, y) => y.score - x.score || (x.distance ?? 1e9) - (y.distance ?? 1e9));
  }

  return { CATALOG, catalog, all, forBuilding, buildingOf, buildings, match, distanceTo, distanceLabel, because, tagHit };
})();
