/* ==========================================================================
   communities/gracia.js — Residència Internacional de Gràcia (Barcelona)

   Estructura social: un edificio de estudiantes e investigadores de doce
   países, con rotación alta. Casi nadie tiene coche ni familia cerca; casi
   todos saben algo que alguien más necesita: un idioma, un trámite que ya
   pasaron, una receta de casa, una bici, un viaje al aeropuerto. La
   capacidad oculta está en la experiencia de los que llegaron antes.
   ========================================================================== */

DATA.register({
  id: 'gracia',
  name: 'Residència Internacional de Gràcia',
  city: 'Barcelona', country: 'España', languages: ['es', 'en', 'ca'],
  members: 64,
  tagline: 'Estudiantes e investigadores de doce países; rotación cada semestre.',
  profile: {
    focus: ['Trámites', 'Idiomas', 'Comida de casa', 'Mudanzas y muebles', 'Viajes al aeropuerto'],
    description: 'Nadie tiene coche ni familia cerca, pero todos ya pasaron por el trámite que a ti te toca ahora.'
  },
  stats: { resolved: 27, people: 41, noPurchase: 19 },

  user: {
    id: 'eddie', name: 'Eddie', initials: 'E', tone: 3,
    place: 'Piso 3', distance: 0, memberSince: 'septiembre de 2026', verified: true,
    completed: 2, helped: 1, allReturned: true, routines: [],
    verification: { contact: 'verified', identity: 'verified', community: 'pending' },
    capabilities: [
      { id: 'eddie-mex', kind: 'skill', label: 'Cocina mexicana: tacos y salsas', tags: ['cocinar', 'mexican-food', 'tacos'], evidence: { count: 1, label: 'Cocinó para una cena del edificio 1 vez' } },
      { id: 'eddie-espanol', kind: 'knowledge', label: 'Español nativo', tags: ['espanol', 'spanish', 'idioma'], evidence: { count: 1, label: 'Practicó español con un vecino 1 vez' } }
    ]
  },

  places: ['aeropuerto', 'ikea', 'mercado', 'super', 'extranjeria', 'decathlon'],
  calendar: [
    { id: 'castanyada', label: 'Castanyada del barrio', when: '31 de octubre', tags: ['castanyada', 'local-party'] }
  ],

  structure: {
    recurring: [
      { id: 'ingredients', triggers: ['gathering'], originAware: true, label: 'Ingredientes de tu país que aquí cuestan encontrar', labelEn: 'Ingredients from home that are hard to find here',
        kinds: ['food', 'contact'], tags: ['especias', 'ingredientes', 'spices', 'asian-market'], priority: 'likely', why: 'Alguien ya sabe dónde', whyEn: 'Someone already knows where', ask: '¿Me compartirías especias o me dirías dónde conseguirlas?', askEn: 'Could you share some spices or tell me where to get them?' },
      { id: 'bigpot', triggers: ['gathering'], label: 'Ollas y platos para más de 6', labelEn: 'Pots and plates for more than 6',
        kinds: ['object'], tags: ['olla', 'ollas', 'arrocera', 'platos', 'vajilla'], priority: 'likely', why: 'En una residencia nadie tiene', whyEn: 'Nobody has them in a residence', ask: '¿Me prestarías tu olla grande?', askEn: 'Could I borrow your big pot?' },
      { id: 'local', triggers: ['gathering', 'paperwork'], label: 'Alguien de aquí que explique cómo funciona', labelEn: 'A local who can explain how things work here',
        kinds: ['knowledge'], tags: ['costumbres', 'catalan', 'local'], priority: 'optional', why: 'Opcional', whyEn: 'Optional', ask: '¿Me explicarías cómo se hace aquí?', askEn: 'Could you explain how it is done here?' },
      { id: 'language', triggers: ['paperwork', 'appointment', 'bike', 'moving'], when: 'foreign', label: 'Alguien que hable tu idioma', labelEn: 'Someone who speaks your language',
        kinds: ['knowledge'], tags: ['hindi', 'mandarin', 'chinese', 'japanese', 'japones', 'arabic', 'arabe', 'korean', 'coreano', 'english', 'ingles', 'french', 'frances'], priority: 'optional', why: 'Opcional', whyEn: 'Optional', ask: '¿Podríamos hablar un momento?', askEn: 'Could we talk for a moment?' },
      { id: 'cart', triggers: ['moving'], label: 'Un carrito o algo con ruedas', labelEn: 'A cart or something with wheels',
        kinds: ['object'], tags: ['carrito', 'cart', 'ruedas'], priority: 'likely', why: 'Sin coche, todo va rodando', whyEn: 'Without a car, everything rolls', ask: '¿Me prestarías tu carrito?', askEn: 'Could I borrow your cart?' }
    ],
    suppress: { gathering: ['speaker', 'cooler', 'grill-tools', 'charcoal', 'meat'] }
  },

  people: [
    {
      id: 'aiko', name: 'Aiko', initials: 'Ai', tone: 1,
      place: 'Piso 2', distance: 0, memberSince: 'septiembre de 2023', verified: true, completed: 11, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está disponible por las noches', days: [0, 1, 2, 3, 4, 5, 6], from: 19, to: 23, source: 'routine' }],
      capabilities: [
        { id: 'aiko-tramites', kind: 'knowledge', label: 'Empadronamiento, TIE y transporte; lleva 3 años aquí', labelEn: 'Registration (empadronamiento), TIE card and transport; 3 years here', tags: ['tramite', 'tramites', 'empadronamiento', 'tie', 'nie', 'paperwork', 'transporte'], evidence: { count: 6, label: 'Ha guiado a 6 recién llegados', labelEn: 'Has guided 6 newcomers' } },
        { id: 'aiko-japones', kind: 'knowledge', label: 'Japonés', labelEn: 'Japanese', tags: ['japones', 'japanese', 'japan'] },
        { id: 'aiko-costura', kind: 'object', label: 'Kit de costura', labelEn: 'Sewing kit', tags: ['costura', 'coser', 'sewing'] }
      ],
      open: []
    },
    {
      id: 'youssef', name: 'Youssef', initials: 'Y', tone: 2,
      place: 'Piso 4', distance: 0, memberSince: 'febrero de 2025', verified: true, completed: 8, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Va al mercado los sábados por la mañana', days: [6], from: 9, to: 12, source: 'routine', route: 'mercado' }, { label: 'Está disponible por las tardes', days: [1, 2, 3, 4, 5], from: 17, to: 22, source: 'routine' }],
      capabilities: [
        { id: 'youssef-cocina', kind: 'skill', label: 'Cocina para muchos; tajine y cuscús', labelEn: 'Cooks for many; tagine and couscous', tags: ['cocinar', 'preparar', 'comida', 'cook'], evidence: { count: 4, label: 'Cocinó para cenas del edificio 4 veces', labelEn: 'Cooked for building dinners 4 times' } },
        { id: 'youssef-especias', kind: 'food', label: 'Especias de Marruecos y té a la menta', labelEn: 'Moroccan spices and mint tea', tags: ['especias', 'spices', 'te', 'ingredientes'], evidence: { count: 3, label: 'Las ha compartido 3 veces', labelEn: 'Has shared them 3 times' } },
        { id: 'youssef-mercado', kind: 'route', label: 'Suele ir al mercado los sábados', labelEn: 'Usually goes to the market on Saturdays', tags: ['mercado'], place: 'mercado' },
        { id: 'youssef-idiomas', kind: 'knowledge', label: 'Árabe y francés', labelEn: 'Arabic and French', tags: ['arabe', 'arabic', 'frances', 'french'] }
      ],
      open: [{ id: 'youssef-nevera', place: null, text: 'Tiene que bajar una nevera pequeña al sótano y no puede solo.', title: 'Bajar una nevera al sótano', tags: ['cargar', 'mover', 'nevera'] }]
    },
    {
      id: 'priya', name: 'Priya', initials: 'Pr', tone: 5,
      place: 'Piso 3', distance: 0, memberSince: 'septiembre de 2025', verified: true, completed: 5, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está disponible por las noches', days: [1, 2, 3, 4, 5], from: 19, to: 23, source: 'routine' }, { label: 'Está en casa los domingos', days: [0], from: 10, to: 22, source: 'routine' }],
      capabilities: [
        { id: 'priya-laptop', kind: 'skill', label: 'Repara laptops y configura wifi', labelEn: 'Fixes laptops and sets up wifi', tags: ['laptop', 'computadora', 'wifi', 'reparar', 'computer'], evidence: { count: 5, label: 'Ha arreglado 5 laptops', labelEn: 'Has fixed 5 laptops' } },
        { id: 'priya-especias', kind: 'food', label: 'Especias indias y sabe dónde comprarlas', labelEn: 'Indian spices and knows where to buy them', tags: ['especias', 'spices', 'ingredientes', 'asian-market', 'curry'], evidence: { count: 2, label: 'Las ha compartido 2 veces', labelEn: 'Has shared them 2 times' } },
        { id: 'priya-olla', kind: 'object', label: 'Olla a presión grande', labelEn: 'Large pressure cooker', tags: ['olla', 'ollas', 'pressure cooker'] },
        { id: 'priya-hindi', kind: 'knowledge', label: 'Hindi', labelEn: 'Hindi', tags: ['hindi', 'india', 'indian'] }
      ],
      open: [{ id: 'priya-diwali', place: null, text: 'Quiere celebrar Diwali en el edificio y busca sillas y a quien le guste cocinar.', title: 'Preparar Diwali en el edificio', tags: ['sillas', 'cocinar', 'diwali'] }]
    },
    {
      id: 'lukas', name: 'Lukas', initials: 'Lk', tone: 3,
      place: 'Piso 1', distance: 0, memberSince: 'enero de 2025', verified: true, completed: 9, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Va a IKEA Badalona el domingo', days: [0], from: 11, to: 15, source: 'routine', route: 'ikea' }, { label: 'Está disponible por las tardes', days: [1, 2, 3, 4, 5, 6], from: 16, to: 21, source: 'routine' }],
      capabilities: [
        { id: 'lukas-bici', kind: 'skill', label: 'Repara bicis: cadenas, frenos, pinchazos', labelEn: 'Repairs bikes: chains, brakes, punctures', tags: ['reparar-bici', 'bici', 'bicicleta', 'bike', 'cadena', 'chain', 'frenos'], evidence: { count: 6, label: 'Ha arreglado 6 bicis del edificio', labelEn: 'Has fixed 6 bikes in the building' } },
        { id: 'lukas-herramientas', kind: 'object', label: 'Herramientas, taladro y bomba de bici', labelEn: 'Tools, drill and bike pump', tags: ['herramientas', 'herramienta', 'taladro', 'tools', 'drill', 'bomba', 'llaves'], evidence: { count: 7, label: 'Las ha prestado 7 veces', labelEn: 'Has lent them 7 times' } },
        { id: 'lukas-ikea', kind: 'route', label: 'Suele ir a IKEA los domingos', labelEn: 'Usually goes to IKEA on Sundays', tags: ['ikea'], place: 'ikea' },
        { id: 'lukas-aleman', kind: 'knowledge', label: 'Alemán', labelEn: 'German', tags: ['aleman', 'german', 'deutsch'] }
      ],
      open: [{ id: 'lukas-decathlon', place: 'decathlon', text: 'Necesita cambiar una talla y no le da tiempo entre semana.', title: 'Cambiar una talla en Decathlon', tags: ['decathlon', 'cambio'] }]
    },
    {
      id: 'camila', name: 'Camila', initials: 'Ca', tone: 1,
      place: 'Piso 5', distance: 0, memberSince: 'octubre de 2024', verified: true, completed: 14, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Trabaja desde casa entre semana', days: [1, 2, 3, 4, 5], from: 9, to: 18, source: 'routine' }],
      capabilities: [
        { id: 'camila-nie', kind: 'knowledge', label: 'NIE, cita previa en Extranjería y qué papeles llevar; ya lo pasó dos veces', labelEn: 'NIE, appointment at Extranjería and which papers to bring; went through it twice', tags: ['nie', 'tie', 'tramite', 'tramites', 'extranjeria', 'cita previa', 'paperwork', 'visa', 'residencia'], evidence: { count: 8, label: 'Ha ayudado a 8 vecinos con su NIE', labelEn: 'Has helped 8 neighbors with their NIE' } },
        { id: 'camila-acompanar', kind: 'time', label: 'Acompaña a citas en Extranjería', labelEn: 'Accompanies people to Extranjería appointments', tags: ['acompanar', 'acompañar', 'cita', 'extranjeria'], needsAvailability: true, context: 'sensitive', evidence: { count: 3, label: 'Acompañó a 3 vecinos', labelEn: 'Accompanied 3 neighbors' } },
        { id: 'camila-latam', kind: 'knowledge', label: 'Comunidad latina en Barcelona', labelEn: 'Latin American community in Barcelona', tags: ['latino', 'colombia', 'espanol', 'spanish'] },
        { id: 'camila-paquetes', kind: 'time', label: 'Recibir paquetes', labelEn: 'Receive packages', tags: ['paquete', 'entrega', 'recibir', 'package', 'parcel'], needsAvailability: true, evidence: { count: 4, label: 'Ha recibido paquetes 4 veces', labelEn: 'Has received packages 4 times' } }
      ],
      open: []
    },
    {
      id: 'mei', name: 'Mei', initials: 'Me', tone: 4,
      place: 'Piso 2', distance: 0, memberSince: 'febrero de 2026', verified: true, completed: 1, allReturned: true,
      verification: { contact: 'verified', identity: 'pending', community: 'verified' },
      routines: [{ label: 'Está disponible por las tardes', days: [1, 2, 3, 4, 5], from: 15, to: 20, source: 'routine' }],
      capabilities: [
        { id: 'mei-mandarin', kind: 'knowledge', label: 'Mandarín; sabe dónde está el supermercado asiático', labelEn: 'Mandarin; knows where the Asian supermarket is', tags: ['mandarin', 'chinese', 'china', 'taiwan', 'asian-market', 'ingredientes'], evidence: { count: 1, label: 'Ayudó a un vecino 1 vez', labelEn: 'Helped a neighbor once' } },
        { id: 'mei-foto', kind: 'skill', label: 'Fotografía', labelEn: 'Photography', tags: ['foto', 'fotografia', 'photo'] }
      ],
      open: [
        { id: 'mei-espanol', place: null, text: 'Llegó hace poco y busca con quién practicar español.', title: 'Practicar español', tags: ['espanol', 'spanish', 'practicar'] },
        { id: 'mei-aeropuerto', place: 'aeropuerto', text: 'Vuela el viernes a las 7 AM y a esa hora no hay metro.', title: 'Llegar al aeropuerto el viernes temprano', tags: ['aeropuerto', 'airport'] }
      ]
    },
    {
      id: 'sam', name: 'Sam', initials: 'Sa', tone: 2,
      place: 'Piso 4', distance: 0, memberSince: 'junio de 2024', verified: true, completed: 12, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Va al aeropuerto los viernes por la mañana (trabaja ahí)', days: [5], from: 5, to: 8, source: 'routine', route: 'aeropuerto' }, { label: 'Está en casa los fines de semana', days: [0, 6], from: 10, to: 22, source: 'routine' }],
      capabilities: [
        { id: 'sam-coche', kind: 'route', label: 'Coche compartido; lleva gente al aeropuerto', labelEn: 'Shared car; drives people to the airport', tags: ['coche', 'car', 'llevar', 'transporte', 'aeropuerto', 'airport'], context: 'rides', evidence: { count: 9, label: 'Ha llevado a 9 vecinos al aeropuerto', labelEn: 'Has driven 9 neighbors to the airport' } },
        { id: 'sam-aeropuerto', kind: 'route', label: 'Suele ir al aeropuerto los viernes', labelEn: 'Usually goes to the airport on Fridays', tags: ['aeropuerto', 'airport'], place: 'aeropuerto' },
        { id: 'sam-ingles', kind: 'knowledge', label: 'Inglés nativo; corrige textos', labelEn: 'Native English; proofreads texts', tags: ['ingles', 'english', 'proofread'] }
      ],
      open: []
    },
    {
      id: 'lucia', name: 'Lucía', initials: 'Lu', tone: 5,
      place: 'Piso 1', distance: 0, memberSince: 'marzo de 2024', verified: true, completed: 16, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está disponible por las tardes', days: [0, 1, 2, 3, 4, 5, 6], from: 16, to: 22, source: 'routine' }],
      capabilities: [
        { id: 'lucia-local', kind: 'knowledge', label: 'Es de Barcelona: costumbres, catalán, cómo funciona el barrio', labelEn: 'From Barcelona: customs, Catalan, how the neighborhood works', tags: ['costumbres', 'catalan', 'local', 'barrio', 'castanyada'], evidence: { count: 10, label: 'Ha orientado a 10 recién llegados', labelEn: 'Has guided 10 newcomers' } },
        { id: 'lucia-mesa', kind: 'object', label: 'Mesa plegable del comedor común', labelEn: 'Folding table from the common room', tags: ['mesa', 'mesas', 'table'], evidence: { count: 5, label: 'La ha prestado 5 veces', labelEn: 'Has lent it 5 times' } },
        { id: 'lucia-sillas', kind: 'object', label: 'Ocho sillas del comedor común', labelEn: 'Eight chairs from the common room', tags: ['sillas', 'silla', 'chairs'], evidence: { count: 4, label: 'Las ha prestado 4 veces', labelEn: 'Has lent them 4 times' } },
        { id: 'lucia-taller', kind: 'contact', label: 'Conoce un taller de bicis en Gràcia que arregla el mismo día', labelEn: 'Knows a bike shop in Gràcia that repairs same day', tags: ['taller-bici', 'taller', 'bici', 'bike shop'], evidence: { count: 2, label: 'Lo ha recomendado 2 veces', labelEn: 'Has recommended it twice' } },
        { id: 'lucia-cenas', kind: 'skill', label: 'Organiza las cenas del edificio', labelEn: 'Organizes the building dinners', tags: ['organizar', 'cena', 'fiesta', 'evento'] }
      ],
      open: []
    },
    {
      id: 'omar', name: 'Omar', initials: 'Om', tone: 3,
      place: 'Piso 5', distance: 0, memberSince: 'noviembre de 2024', verified: true, completed: 7, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está disponible por las tardes y fines de semana', days: [0, 1, 2, 3, 4, 5, 6], from: 15, to: 22, source: 'routine' }],
      capabilities: [
        { id: 'omar-cargar', kind: 'skill', label: 'Mudanzas y cosas pesadas; ha ayudado a medio edificio', labelEn: 'Moves and heavy things; has helped half the building', tags: ['cargar', 'mover', 'mudanza', 'pesado', 'nevera', 'carry', 'move', 'subir'], evidence: { count: 9, label: 'Ha ayudado en 9 mudanzas', labelEn: 'Has helped with 9 moves' } },
        { id: 'omar-carrito', kind: 'object', label: 'Carrito plegable de transporte', labelEn: 'Folding transport cart', tags: ['carrito', 'cart', 'ruedas'], evidence: { count: 4, label: 'Lo ha prestado 4 veces', labelEn: 'Has lent it 4 times' } },
        { id: 'omar-arabe', kind: 'knowledge', label: 'Árabe e inglés', labelEn: 'Arabic and English', tags: ['arabe', 'arabic', 'ingles', 'english'] }
      ],
      open: []
    },
    {
      id: 'hana', name: 'Hana', initials: 'Ha', tone: 4,
      place: 'Piso 3', distance: 0, memberSince: 'septiembre de 2025', verified: true, completed: 4, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'pending' },
      routines: [{ label: 'Está disponible por las mañanas', days: [1, 2, 3, 4, 5, 6], from: 8, to: 12, source: 'routine' }],
      capabilities: [
        { id: 'hana-arrocera', kind: 'object', label: 'Arrocera grande y platos para 12', labelEn: 'Large rice cooker and plates for 12', tags: ['arrocera', 'olla', 'ollas', 'platos', 'vajilla', 'rice cooker'], evidence: { count: 3, label: 'Los ha prestado 3 veces', labelEn: 'Has lent them 3 times' } },
        { id: 'hana-kimchi', kind: 'food', label: 'Kimchi casero para compartir', labelEn: 'Homemade kimchi to share', tags: ['kimchi', 'ingredientes', 'comida'] },
        { id: 'hana-coreano', kind: 'knowledge', label: 'Coreano', labelEn: 'Korean', tags: ['coreano', 'korean', 'korea'] }
      ],
      open: [{ id: 'hana-aeropuerto', place: 'aeropuerto', text: 'Su hermana llega el viernes por la mañana con dos maletas.', title: 'Recoger a la hermana de Hana en el aeropuerto', tags: ['aeropuerto', 'airport', 'recoger'] }]
    }
  ],

  /* ---- Círculos: en una residencia internacional los círculos son el piso, el idioma y las cenas ---- */
  circles: [
    { id: 'piso', label: 'Tu piso', members: ['priya', 'hana'] },
    { id: 'residencia', label: 'La residencia', members: ['aiko', 'youssef', 'priya', 'lukas', 'camila', 'mei', 'sam', 'lucia', 'omar', 'hana'] },
    { id: 'hispanohablantes', label: 'Hispanohablantes', members: ['camila', 'lucia'] },
    { id: 'cenas', label: 'Cenas del edificio', members: ['youssef', 'lucia', 'priya', 'hana'] },
    { id: 'veteranos', label: 'Los que llegaron antes', members: ['aiko', 'camila', 'lucia', 'sam'] },
    { id: 'confianza', label: 'Tu círculo de confianza', private: true, sensitive: true, members: [] }
  ],

  /* ---- Trust Graph semilla: relaciones, no calificaciones. Eddie acaba de llegar: red pequeña ---- */
  trust: [
    { a: 'eddie', b: 'camila', interactions: 2, given: 0, received: 2, contexts: ['sensitive', 'objects'], daysAgo: 12 },
    { a: 'eddie', b: 'mei', interactions: 1, given: 1, received: 0, contexts: ['objects'], daysAgo: 2 },
    { a: 'eddie', b: 'lucia', interactions: 1, given: 1, received: 0, contexts: ['objects'], daysAgo: 6 },
    { a: 'camila', b: 'lucia', interactions: 5, given: 2, received: 3, contexts: ['objects', 'sensitive'], daysAgo: 4 },
    { a: 'camila', b: 'aiko', interactions: 3, given: 1, received: 2, contexts: ['sensitive'], daysAgo: 15 },
    { a: 'youssef', b: 'omar', interactions: 4, given: 2, received: 2, contexts: ['objects', 'home'], daysAgo: 8 },
    { a: 'youssef', b: 'priya', interactions: 3, given: 2, received: 1, contexts: ['objects'], daysAgo: 10 },
    { a: 'lukas', b: 'sam', interactions: 2, given: 1, received: 1, contexts: ['rides', 'objects'], daysAgo: 20 },
    { a: 'priya', b: 'hana', interactions: 3, given: 1, received: 2, contexts: ['objects', 'home'], daysAgo: 5 },
    { a: 'lucia', b: 'mei', interactions: 2, given: 2, received: 0, contexts: ['sensitive'], daysAgo: 3 }
  ],

  seedSituations: [
    { id: 'seed-gracia-nie', text: 'Necesitaba ayuda con la cita del NIE.', summary: 'Cita del NIE', icon: '📄', status: 'resolved', people: ['camila'], daysAgo: 12, noPurchase: true },
    { id: 'seed-gracia-mei', text: 'Mei me pidió practicar español.', summary: 'Practicar español con Mei', icon: '🗣️', status: 'helping', helping: true, people: ['mei'], daysAgo: 0, when: 'Jueves · 7 PM' }
  ],

  examples: [
    { label: 'Getting my NIE', text: "I just arrived and need to get my NIE appointment. I don't know where to start." },
    { label: 'Voy al aeropuerto', text: 'Voy al aeropuerto el viernes a las 6 de la mañana.' },
    { label: 'Diwali dinner for 8', text: "I'm from India and want to cook a Diwali dinner for 8 people on Saturday." },
    { label: 'Cadena de la bici', text: 'Se me rompió la cadena de la bici y mañana la necesito.' },
    { label: 'Bajar una nevera', text: 'Me mudo de piso el domingo y no puedo con la nevera y la estantería yo solo.' }
  ],
  placeholders: [
    'I just arrived and need to get my NIE.',
    'Voy al aeropuerto el viernes temprano.',
    'Quiero cocinar comida de mi país para 8.',
    'Se me rompió la cadena de la bici.',
    'Me mudo el domingo y no puedo con la nevera.'
  ]
});
