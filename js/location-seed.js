/* ==========================================================================
   location-seed.js — Capa geográfica simulada de la comunidad demo.

   Se carga después de data.js, communities/*.js y location-service.js.
   Añade a cada comunidad con semilla geográfica:

     community.anchor       punto ficticio de referencia (no es un domicilio real)
     community.buildings[]  torres, casas y lugares comunes con offset en metros,
                            pisos, huella y `amenities[]` (Place Capabilities:
                            recepción, área de paquetes, bicicletero, salón…);
                            lo que dibujan el mapa y el Community Twin
     community.streets[]    calles del residencial (polilíneas en metros)
     community.zones[]      zonas elegibles como fallback manual (torres y grupos de casas)
     community.households[] hogares simulados que no forman parte del grafo del
                            resolver: personas nuevas, neutrales, con recursos y
                            necesidades visibles solo en el mapa
     person.location        { lat, lng, zone, building, approximateDistance }
     person.offset          metros {x este, y norte} desde el ancla (constelación)
     person.distance        SIEMPRE derivada de las coordenadas, nunca escrita a mano

   Las coordenadas se obtienen proyectando el offset del edificio (más un
   pequeño jitter determinista de pocos metros) alrededor del ancla. La
   distancia entre dos personas es la haversine entre sus coordenadas; dos
   personas en el mismo edificio están a 0 ("mismo edificio").

   Privacidad: nada de esto identifica un domicilio real. Las vistas nunca
   muestran coordenadas ni número de casa/departamento: solo "Torre B",
   "Casas del norte", "120 m" o "mismo edificio".

   En demo, cuando el usuario comparte su ubicación, el ancla se mueve a donde
   está él (anchorFollowsUser) para que los vecinos de la demo sigan "cerca".
   En live, las posiciones aproximadas vendrán de Supabase/PostGIS.
   ========================================================================== */

(function seedLocation() {
  if (typeof DATA === 'undefined') return;

  /* ---- Residencial Jacarandas: plano ficticio (metros desde el ancla) ----
     Torres de 4 a 6 pisos alrededor de un jardín central; dos hileras de casas
     al norte y al sur; caseta de entrada al oeste. Radio total ≈ 400 m. */
  const JACARANDAS = {
    anchor: { lat: 19.3605, lng: -99.1740 },
    buildings: [
      { id: 'central', label: 'Torre Central', kind: 'tower', zone: 'central', offset: { x: 0, y: 0 }, floors: 6, w: 34, d: 22,
        amenities: [
          { id: 'central-lobby', type: 'lobby', level: 0, why: 'Espacio amplio en la entrada; sirve para esperar a alguien o dejar algo un momento.' },
          { id: 'central-elevators', type: 'elevators', level: 'all', note: 'Dos elevadores; uno es de carga', why: 'El elevador de carga sube muebles y cajas; la llave se pide en la caseta.' },
          { id: 'central-roof', type: 'roof', level: 'roof', note: 'Con asador comunitario', why: 'Terraza con asador y mesas para reuniones de hasta 20 personas.' },
          { id: 'central-meeting', type: 'meeting', level: 'outside', side: 'front', why: 'La entrada de la torre es el punto de encuentro habitual para entregas.' }
        ] },
      { id: 'torre-a', label: 'Torre A', kind: 'tower', zone: 'torre-a', offset: { x: -74, y: 44 }, floors: 5, w: 30, d: 20,
        amenities: [
          { id: 'a-reception', type: 'reception', level: 0, hours: '24 h', why: 'Hay alguien siempre: reciben paquetes y guardan llaves si nadie está.' },
          { id: 'a-packages', type: 'packages', level: 0, why: 'Anaqueles cerrados detrás de recepción; el paquete se guarda hasta que pases por él.' },
          { id: 'a-bikes', type: 'bikes', level: 'outside', side: 'left', why: 'Bicicletero techado con candado; sirve para dejar una bici prestada o la tuya mientras la arreglan.' }
        ] },
      { id: 'torre-b', label: 'Torre B', kind: 'tower', zone: 'torre-b', offset: { x: 104, y: 58 }, floors: 5, w: 30, d: 20,
        amenities: [
          { id: 'b-hall', type: 'hall', level: 1, note: 'Para 30 personas', why: 'Salón común con mesas y sillas para 30; se aparta con la administración sin costo.' },
          { id: 'b-parking', type: 'parking', level: -1, note: 'Con lugares de visita', why: 'Lugares de visita junto al acceso: sirve para cargar y descargar sin bloquear la calle.' },
          { id: 'b-kids', type: 'kids', level: 'outside', side: 'right', why: 'Juegos y sombra; las familias suelen estar ahí por las tardes.' }
        ] },
      { id: 'torre-c', label: 'Torre C', kind: 'tower', zone: 'torre-c', offset: { x: 150, y: -196 }, floors: 6, w: 32, d: 22,
        amenities: [
          { id: 'c-gym', type: 'gym', level: 1, hours: '6 a 22 h', why: 'Gimnasio pequeño con caminadoras y pesas; abierto a todo el residencial.' },
          { id: 'c-pets', type: 'pets', level: 'outside', side: 'back', why: 'Área cercada para pasear mascotas sin salir del residencial.' },
          { id: 'c-elevators', type: 'elevators', level: 'all', why: 'Elevador amplio; cabe un refrigerador de pie.' }
        ] },
      { id: 'torre-d', label: 'Torre D', kind: 'tower', zone: 'torre-d', offset: { x: -170, y: 62 }, floors: 4, w: 28, d: 20,
        amenities: [
          { id: 'd-bikes', type: 'bikes', level: 'outside', side: 'right', why: 'Bicicletero abierto junto a la entrada.' },
          { id: 'd-parking', type: 'parking', level: -1, why: 'Estacionamiento con dos lugares de visita.' },
          { id: 'd-meeting', type: 'meeting', level: 'outside', side: 'front', why: 'Banca junto a la entrada: punto de encuentro de la torre.' }
        ] },

      /* Casas del norte (hilera sobre la calle norte) */
      { id: 'casa-n1', label: 'Casas del norte', kind: 'house', zone: 'casas-norte', offset: { x: -210, y: 190 }, floors: 2, w: 12, d: 10 },
      { id: 'casa-n2', label: 'Casas del norte', kind: 'house', zone: 'casas-norte', offset: { x: -150, y: 200 }, floors: 2, w: 12, d: 10 },
      { id: 'casa-n3', label: 'Casas del norte', kind: 'house', zone: 'casas-norte', offset: { x: -90, y: 208 }, floors: 1, w: 12, d: 10 },
      { id: 'casa-n4', label: 'Casas del norte', kind: 'house', zone: 'casas-norte', offset: { x: -30, y: 214 }, floors: 2, w: 12, d: 10 },
      { id: 'casa-n5', label: 'Casas del norte', kind: 'house', zone: 'casas-norte', offset: { x: 34, y: 216 }, floors: 2, w: 12, d: 10 },
      { id: 'casa-n6', label: 'Casas del norte', kind: 'house', zone: 'casas-norte', offset: { x: 98, y: 212 }, floors: 1, w: 12, d: 10 },
      { id: 'casa-n7', label: 'Casas del norte', kind: 'house', zone: 'casas-norte', offset: { x: 162, y: 204 }, floors: 2, w: 12, d: 10 },
      { id: 'casa-n8', label: 'Casas del norte', kind: 'house', zone: 'casas-norte', offset: { x: 226, y: 192 }, floors: 2, w: 12, d: 10 },
      { id: 'casa-n9', label: 'Casas del norte', kind: 'house', zone: 'casas-norte', offset: { x: 296, y: 164 }, floors: 2, w: 12, d: 10 },

      /* Casas del sur (hilera sobre la calle sur, junto a la cancha) */
      { id: 'casa-s1', label: 'Casas del sur', kind: 'house', zone: 'casas-sur', offset: { x: -190, y: -150 }, floors: 1, w: 12, d: 10 },
      { id: 'casa-s2', label: 'Casas del sur', kind: 'house', zone: 'casas-sur', offset: { x: -130, y: -170 }, floors: 2, w: 12, d: 10 },
      { id: 'casa-s3', label: 'Casas del sur', kind: 'house', zone: 'casas-sur', offset: { x: -70, y: -186 }, floors: 2, w: 12, d: 10 },
      { id: 'casa-s4', label: 'Casas del sur', kind: 'house', zone: 'casas-sur', offset: { x: -10, y: -196 }, floors: 1, w: 12, d: 10 },
      { id: 'casa-s5', label: 'Casas del sur', kind: 'house', zone: 'casas-sur', offset: { x: 50, y: -200 }, floors: 2, w: 12, d: 10 },
      { id: 'casa-s6', label: 'Casas del sur', kind: 'house', zone: 'casas-sur', offset: { x: 200, y: -226 }, floors: 2, w: 12, d: 10 },
      { id: 'casa-s7', label: 'Casas del sur', kind: 'house', zone: 'casas-sur', offset: { x: 244, y: -258 }, floors: 1, w: 12, d: 10 },
      { id: 'casa-s8', label: 'Casas del sur', kind: 'house', zone: 'casas-sur', offset: { x: 290, y: -292 }, floors: 2, w: 12, d: 10 },

      /* Lugares comunes (no residenciales) */
      { id: 'jardin', label: 'Jardín central', kind: 'park', offset: { x: 30, y: -60 }, w: 90, d: 60,
        amenities: [
          { id: 'jardin-meeting', type: 'meeting', level: 'outside', side: 'front', why: 'El kiosco del jardín: donde todos saben llegar.' },
          { id: 'jardin-kids', type: 'kids', level: 'outside', side: 'right', why: 'Juegos infantiles al centro del residencial.' }
        ] },
      { id: 'salon', label: 'Salón de usos múltiples', kind: 'hall', offset: { x: -70, y: -90 }, floors: 1, w: 26, d: 16,
        amenities: [
          { id: 'salon-hall', type: 'hall', level: 0, note: 'Para 60 personas', why: 'El salón grande del residencial: mesas, sillas, cocina pequeña y bocinas. Se aparta con la administración.' }
        ] },
      { id: 'cancha', label: 'Cancha', kind: 'court', offset: { x: 200, y: -40 }, w: 40, d: 24,
        amenities: [
          { id: 'cancha-meeting', type: 'meeting', level: 'outside', side: 'front', why: 'Cancha de usos múltiples; sirve para juntar a mucha gente al aire libre.' }
        ] },
      { id: 'caseta', label: 'Caseta de entrada', kind: 'gate', offset: { x: -290, y: 0 }, floors: 1, w: 8, d: 8 }
    ],
    streets: [
      /* Calle principal (oeste → este), calle norte y calle sur */
      [{ x: -320, y: 0 }, { x: -100, y: 0 }, { x: 60, y: 10 }, { x: 250, y: 20 }, { x: 340, y: 40 }],
      [{ x: -240, y: 160 }, { x: -60, y: 180 }, { x: 120, y: 178 }, { x: 260, y: 160 }, { x: 330, y: 130 }],
      [{ x: -220, y: -120 }, { x: -60, y: -150 }, { x: 100, y: -166 }, { x: 240, y: -200 }, { x: 320, y: -250 }],
      /* Conectores */
      [{ x: -240, y: 160 }, { x: -230, y: 0 }, { x: -220, y: -120 }],
      [{ x: 330, y: 130 }, { x: 340, y: 40 }, { x: 320, y: -250 }]
    ],
    /* Zonas elegibles en "Elegir mi zona" (fallback sin GPS). */
    zones: [
      { id: 'central', label: 'Torre Central' },
      { id: 'torre-a', label: 'Torre A' },
      { id: 'torre-b', label: 'Torre B' },
      { id: 'torre-c', label: 'Torre C' },
      { id: 'torre-d', label: 'Torre D' },
      { id: 'casas-norte', label: 'Casas del norte' },
      { id: 'casas-sur', label: 'Casas del sur' }
    ],
    /* Dónde vive cada persona del grafo. */
    placement: {
      eddie: 'central', mariana: 'central', sofia: 'central', jorge: 'central', paulina: 'central',
      ana: 'torre-a', wei: 'torre-a', valeria: 'torre-a',
      fer: 'torre-d',
      carlos: 'torre-b', paola: 'torre-b', laura: 'torre-b',
      andrea: 'torre-c',
      diego: 'casa-n9',
      luis: 'casa-s6',
      rodrigo: 'casa-s7'
    },
    /* Hogares simulados: vecinos que todavía no forman parte de tu red. Son
       neutrales (sin relación, sin señales) y solo viven en el mapa. */
    households: [
      { id: 'h-tere', name: 'Tere', initials: 'T', tone: 4, building: 'casa-n1',
        resources: [{ kind: 'object', label: 'Sillas y mesa de jardín', tags: ['sillas', 'silla', 'mesa'] }, { kind: 'skill', label: 'Repostería', tags: ['pastel', 'postre', 'hornear'] }],
        open: [{ id: 'tere-paquete', title: 'Que alguien reciba un paquete el martes', tags: ['paquete'] }] },
      { id: 'h-memo', name: 'Memo', initials: 'Me', tone: 2, building: 'casa-n2',
        resources: [{ kind: 'object', label: 'Escalera larga de aluminio', tags: ['escalera'] }, { kind: 'skill', label: 'Plomería básica', tags: ['plomeria', 'fuga', 'reparar'] }] },
      { id: 'h-lupita', name: 'Lupita', initials: 'Lu', tone: 1, building: 'casa-n3',
        resources: [{ kind: 'food', label: 'Tamales los domingos', tags: ['tamales', 'comida'] }, { kind: 'time', label: 'Recibir paquetes', tags: ['paquete', 'recibir'] }] },
      { id: 'h-beto', name: 'Beto', initials: 'B', tone: 3, building: 'casa-n4',
        resources: [{ kind: 'object', label: 'Bicicleta de montaña', tags: ['bici', 'bicicleta', 'bike'] }, { kind: 'object', label: 'Bomba de aire y parches', tags: ['bici', 'ponchadura', 'bomba'] }],
        open: [{ id: 'beto-escalera', title: 'Una escalera prestada el sábado', tags: ['escalera'] }] },
      { id: 'h-karla', name: 'Karla', initials: 'K', tone: 5, building: 'casa-n5',
        resources: [{ kind: 'skill', label: 'Costura y arreglos', tags: ['costura', 'coser', 'ropa'] }, { kind: 'object', label: 'Vestidos de fiesta talla S y M', tags: ['vestido', 'dress', 'talla-m', 'boda'] }] },
      { id: 'h-raul', name: 'Raúl', initials: 'R', tone: 2, building: 'casa-n6',
        resources: [{ kind: 'object', label: 'Asador grande de carbón', tags: ['asador', 'parrilla', 'carbon'] }, { kind: 'route', label: 'Va a Costco los viernes', tags: ['costco'] }] },
      { id: 'h-nayeli', name: 'Nayeli', initials: 'N', tone: 1, building: 'casa-n7',
        resources: [{ kind: 'object', label: 'Carriola y cuna de viaje', tags: ['carriola', 'bebe', 'cuna'] }, { kind: 'time', label: 'Cuida niños por las tardes', tags: ['ninos', 'cuidar'] }] },
      { id: 'h-tono', name: 'Toño', initials: 'To', tone: 4, building: 'casa-n8',
        resources: [{ kind: 'object', label: 'Herramientas eléctricas', tags: ['herramientas', 'herramienta', 'taladro'] }, { kind: 'skill', label: 'Reparaciones en casa', tags: ['reparar', 'arreglar', 'instalar'] }] },
      { id: 'h-ines', name: 'Inés', initials: 'I', tone: 5, building: 'casa-s1',
        resources: [{ kind: 'knowledge', label: 'Habla francés e inglés', tags: ['ingles', 'english', 'frances', 'idioma'] }, { kind: 'knowledge', label: 'Conoce trámites locales', tags: ['tramite', 'tramites'] }] },
      { id: 'h-pepe', name: 'Pepe', initials: 'Pe', tone: 3, building: 'casa-s2',
        resources: [{ kind: 'object', label: 'Hielera y mesas plegables', tags: ['hielera', 'mesa', 'mesas'] }, { kind: 'object', label: 'Bocina para fiestas', tags: ['bocina', 'musica'] }],
        open: [{ id: 'pepe-ride', title: 'Ride al centro el domingo', tags: ['ride', 'coche'] }] },
      { id: 'h-rosa', name: 'Rosa', initials: 'Ro', tone: 1, building: 'casa-s3',
        resources: [{ kind: 'object', label: 'Bicicleta plegable', tags: ['bici', 'bicicleta'] }, { kind: 'skill', label: 'Riega plantas cuando viajas', tags: ['plantas', 'regar'] }] },
      { id: 'h-manu', name: 'Manu', initials: 'Ma', tone: 2, building: 'casa-s4',
        resources: [{ kind: 'object', label: 'Casco y luces de bici', tags: ['bici', 'casco', 'luces'] }, { kind: 'contact', label: 'Conoce un taller mecánico de confianza', tags: ['taller', 'coche', 'mecanico'] }] },
      { id: 'h-sandra', name: 'Sandra', initials: 'Sa', tone: 5, building: 'casa-s5',
        resources: [{ kind: 'skill', label: 'Maquillaje para eventos', tags: ['maquillaje', 'makeup'] }, { kind: 'object', label: 'Bolsas y accesorios de fiesta', tags: ['bolsa', 'accesorios', 'clutch'] }] },
      { id: 'h-omar', name: 'Omar', initials: 'O', tone: 3, building: 'torre-d',
        resources: [{ kind: 'skill', label: 'Carpintería', tags: ['madera', 'carpinteria', 'mueble'] }, { kind: 'object', label: 'Extensiones y reflectores', tags: ['luces', 'extension', 'fiesta'] }] },
      { id: 'h-gaby', name: 'Gaby', initials: 'G', tone: 4, building: 'torre-c',
        resources: [{ kind: 'time', label: 'Acompaña a citas médicas', tags: ['acompanar', 'cita', 'clinica'] }, { kind: 'food', label: 'Siempre tiene ingredientes básicos', tags: ['ingredientes', 'huevo', 'leche'] }],
        open: [{ id: 'gaby-plantas', title: 'Alguien que sepa de plantas de interior', tags: ['plantas'] }] },
      { id: 'h-julian', name: 'Julián', initials: 'J', tone: 2, building: 'casa-s8',
        resources: [{ kind: 'object', label: 'Proyector y pantalla', tags: ['proyector', 'pantalla', 'pelicula'] }, { kind: 'knowledge', label: 'Computadoras y wifi', tags: ['computadora', 'wifi', 'internet'] }] }
    ]
  };

  const SEEDS = { jacarandas: JACARANDAS };

  /* Jitter determinista de pocos metros por id: separa a quienes viven en el
     mismo edificio sin inventar una posición "exacta". */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }
  function jitter(id, radius) {
    const a = hash(id) * Math.PI * 2;
    const r = (0.35 + hash(id + '#r') * 0.65) * radius;
    return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) };
  }

  function applySeed(community, seed) {
    if (!community || community.geoSeeded) return;
    community.geoSeeded = true;
    community.anchor = community.anchor || seed.anchor;
    community.anchorFollowsUser = community.anchorFollowsUser !== false;
    community.buildings = seed.buildings;
    community.streets = seed.streets;
    community.zones = seed.zones.map(z => {
      /* Cada zona tiene un punto: la torre, o el centro de la hilera de casas. */
      const members = seed.buildings.filter(b => b.zone === z.id);
      const cx = members.reduce((s, b) => s + b.offset.x, 0) / (members.length || 1);
      const cy = members.reduce((s, b) => s + b.offset.y, 0) / (members.length || 1);
      return Object.assign({}, z, { offset: { x: Math.round(cx), y: Math.round(cy) } });
    });
    DATA.matching = Object.assign({ radius: 500, limit: 3 }, DATA.matching || {});

    const byId = Object.fromEntries(seed.buildings.map(b => [b.id, b]));
    const hasLS = typeof LocationService !== 'undefined';

    function place(entity, buildingId) {
      const b = byId[buildingId];
      if (!b) return;
      const j = jitter(entity.id, b.kind === 'tower' ? 7 : 4);
      entity.building = b.id;
      entity.zone = b.id;
      entity.offset = { x: b.offset.x + j.x, y: b.offset.y + j.y };
      const point = hasLS ? LocationService.project(community.anchor, entity.offset) : null;
      entity.location = {
        lat: point ? point.lat : null, lng: point ? point.lng : null,
        zone: b.zone, building: b.id, buildingLabel: b.label, approximateDistance: null
      };
    }

    place(community.user, seed.placement[community.user.id]);
    (community.people || []).forEach(p => place(p, seed.placement[p.id]));
    community.households = (seed.households || []).map(h => {
      const hh = Object.assign({ kind: 'household', isNew: true, capabilities: h.resources, open: [] }, h);
      place(hh, h.building);
      return hh;
    });

    /* Distancias: SIEMPRE desde coordenadas (haversine). Mismo edificio = 0. */
    const me = community.user;
    function measure(entity) {
      if (!entity.location) return;
      let d = null;
      if (entity.building && entity.building === me.building) d = 0;
      else if (hasLS) d = LocationService.calculateDistance(me.location, entity.location);
      entity.location.approximateDistance = d;
      entity.distance = d;
    }
    measure(me);
    (community.people || []).forEach(measure);
    community.households.forEach(measure);

    if (hasLS) {
      /* Si hay coords de esta sesión y estamos en demo, el ancla es el usuario. */
      const coords = community.anchorFollowsUser ? LocationService.coords() : null;
      LocationService.setAnchor(coords || community.anchor);
      LocationService.setDemoOrigin(me);
      if (typeof Matching !== 'undefined' && DATA.matching.radius != null) Matching.setDefaultRadius(DATA.matching.radius);
    }
  }

  DATA.communities.forEach(c => { if (SEEDS[c.id]) applySeed(c, SEEDS[c.id]); });
  /* Comunidades registradas después de este archivo también reciben su semilla. */
  const register = DATA.register.bind(DATA);
  DATA.register = function (c) { register(c); if (SEEDS[c.id]) applySeed(c, SEEDS[c.id]); };
  DATA.geo = { seeds: SEEDS, apply: applySeed };
})();
