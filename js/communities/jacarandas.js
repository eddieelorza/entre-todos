/* ==========================================================================
   communities/jacarandas.js — Residencial Jacarandas (Ciudad de México)

   Estructura social: familias y profesionistas en torres; mucha gente fuera
   en horario laboral y mucho objeto guardado. La capacidad oculta está en
   paquetes, herramientas, trayectos a tiendas, reuniones y el intercambio
   cultural con vecinos recién llegados.
   ========================================================================== */

DATA.register({
  id: 'jacarandas',
  name: 'Residencial Jacarandas',
  city: 'Ciudad de México', country: 'México', languages: ['es', 'en'],
  members: 180,
  tagline: 'Torres de departamentos, familias y gente que trabaja fuera.',
  profile: {
    focus: ['Paquetes', 'Herramientas', 'Trayectos', 'Reuniones', 'Intercambio cultural'],
    description: 'Casi todos trabajan fuera de día y guardan cosas que usan una vez al año. Hay vecinos de otros países.'
  },
  stats: { resolved: 31, people: 58, noPurchase: 22 },

  user: {
    id: 'eddie', name: 'Eddie', initials: 'E', tone: 3,
    place: 'Piso 3', distance: 0, memberSince: 'abril de 2026', verified: true,
    completed: 12, helped: 8, allReturned: true, routines: [],
    verification: { contact: 'verified', identity: 'verified', community: 'verified' },
    capabilities: [
      { id: 'eddie-plantas', kind: 'knowledge', label: 'Sabe de plantas de interior', tags: ['plantas'], evidence: { count: 2, label: 'Ayudó con plantas 2 veces' } },
      { id: 'eddie-cargar', kind: 'skill', label: 'Ayuda a cargar cosas', tags: ['cargar', 'mover'], evidence: { count: 3, label: 'Ayudó a mover cosas 3 veces' } }
    ]
  },

  places: ['ikea', 'costco', 'homedepot', 'super', 'farmacia'],
  calendar: [
    { id: 'noche-mexicana', label: 'Noche Mexicana del residencial', when: '15 de septiembre · 8 PM', tags: ['mexican-party'] }
  ],

  structure: {
    recurring: [
      { id: 'language', triggers: ['*'], when: 'foreign', label: 'Alguien que hable tu idioma, por si prefieres preguntar así', labelEn: 'Someone who speaks your language, in case you prefer to ask that way',
        kinds: ['knowledge'], tags: ['mandarin', 'chinese', 'china', 'ingles', 'english'], priority: 'optional', why: 'Opcional', whyEn: 'Optional',
        ask: '¿Podríamos platicar un rato?', askEn: 'Could we chat for a bit?' }
    ],
    suppress: {}
  },

  people: [
    {
      id: 'mariana', name: 'Mariana', initials: 'M', tone: 1,
      place: 'Piso 4', distance: 0, memberSince: 'enero de 2025', verified: true, completed: 8, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [
        { label: 'Trabaja desde casa martes y jueves', days: [2, 4], from: 9, to: 18, source: 'routine' },
        { label: 'Confirmó que está en casa por las tardes esta semana', days: [1, 2, 3, 4, 5], from: 14, to: 20, source: 'declared' }
      ],
      capabilities: [
        { id: 'mariana-paquetes', kind: 'time', label: 'Recibir paquetes', tags: ['paquete', 'entrega', 'recibir'], needsAvailability: true, evidence: { count: 3, label: 'Ha recibido paquetes de vecinos 3 veces' } },
        { id: 'mariana-sillas', kind: 'object', label: 'Cuatro sillas plegables', tags: ['sillas', 'silla'], quantity: 4, evidence: { count: 2, label: 'Las ha prestado 2 veces; siempre regresaron' } },
        { id: 'mariana-reposteria', kind: 'skill', label: 'Repostería', tags: ['pastel', 'postre', 'hornear'] },
        { id: 'mariana-bolsa', kind: 'object', label: 'Bolsa de noche y clutch dorado', tags: ['bolsa', 'clutch', 'bag'], evidence: { count: 2, label: 'La ha prestado 2 veces' } },
        { id: 'mariana-acompanar', kind: 'time', label: 'Acompaña a citas médicas; su mamá vive con ella', tags: ['acompanar', 'acompañar', 'cita', 'clinica'], needsAvailability: true, context: 'elder', evidence: { count: 2, label: 'Ha acompañado a vecinas 2 veces' } }
      ],
      open: [{ id: 'mariana-super', place: 'super', text: 'Se quedó sin leche y está con la bebé.', title: 'Traer leche del súper', tags: ['leche', 'super'] }]
    },
    {
      id: 'carlos', name: 'Carlos', initials: 'C', tone: 2,
      place: 'Torre B', distance: 120, memberSince: 'agosto de 2024', verified: true, completed: 12, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [
        { label: 'Llega a casa después de las 3 PM entre semana', days: [1, 2, 3, 4, 5], from: 15, to: 23, source: 'routine' },
        { label: 'Está en casa los fines de semana', days: [0, 6], from: 9, to: 22, source: 'routine' }
      ],
      capabilities: [
        { id: 'carlos-hielera', kind: 'object', label: 'Hielera grande (48 L)', tags: ['hielera', 'hielo', 'bebidas'], evidence: { count: 4, label: 'La ha prestado 4 veces' } },
        { id: 'carlos-herramientas', kind: 'object', label: 'Herramientas: llaves, desarmadores, taladro', tags: ['herramientas', 'herramienta', 'taladro', 'llaves', 'desarmador'], evidence: { count: 6, label: 'Ha prestado herramientas 6 veces' } },
        { id: 'carlos-reparar', kind: 'skill', label: 'Reparaciones pequeñas en casa', tags: ['reparar', 'arreglar', 'colgar', 'instalar', 'foco'] },
        { id: 'carlos-paquetes', kind: 'time', label: 'Recibir paquetes', tags: ['paquete', 'entrega', 'recibir'], needsAvailability: true, evidence: { count: 1, label: 'Ha recibido paquetes 1 vez' } },
        { id: 'carlos-materiales', kind: 'object', label: 'Cartón, cinta plateada y pintura en aerosol', tags: ['carton', 'cinta', 'pintura', 'materiales', 'aluminio'], evidence: { count: 1, label: 'Ayudó con materiales para una piñata 1 vez' } },
        { id: 'carlos-coche', kind: 'route', label: 'Sale en coche hacia el sur entre semana a las 8', tags: ['coche', 'ride', 'llevar', 'transporte', 'clinica', 'car', 'sur'], context: 'rides', evidence: { count: 3, label: 'Ha dado ride a vecinos 3 veces' } }
      ],
      open: [{ id: 'carlos-ikea', place: 'ikea', text: 'Quiere devolver una caja pequeña y no tiene coche esta semana.', title: 'Devolver una caja en IKEA', tags: ['ikea', 'devolver'] }]
    },
    {
      id: 'ana', name: 'Ana', initials: 'A', tone: 4,
      place: 'Torre A', distance: 80, memberSince: 'marzo de 2024', verified: true, completed: 5, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está en casa casi todo el día', days: [0, 1, 2, 3, 4, 5, 6], from: 9, to: 20, source: 'routine' }],
      capabilities: [
        { id: 'ana-mesa', kind: 'object', label: 'Mesa plegable para 8', tags: ['mesa', 'mesas'], evidence: { count: 3, label: 'La ha prestado 3 veces' } },
        { id: 'ana-escalera', kind: 'object', label: 'Escalera de 6 peldaños', tags: ['escalera'] },
        { id: 'ana-paquetes', kind: 'time', label: 'Recibir paquetes', tags: ['paquete', 'entrega', 'recibir'], needsAvailability: true, evidence: { count: 2, label: 'Ha recibido paquetes 2 veces' } },
        { id: 'ana-plantas', kind: 'knowledge', label: 'Cuidado de plantas', tags: ['plantas', 'jardin'] },
        { id: 'ana-casco', kind: 'object', label: 'Casco blanco de astronauta que hizo para su hijo', tags: ['casco', 'helmet', 'astronauta', 'accesorio-disfraz'], evidence: { count: 1, label: 'Lo prestó para un festival 1 vez' } }
      ],
      open: [{ id: 'ana-ikea', place: 'ikea', text: 'Necesita recoger una lámpara que ya pagó en línea.', title: 'Recoger una lámpara en IKEA', tags: ['ikea', 'recoger'] }]
    },
    {
      id: 'sofia', name: 'Sofía', initials: 'S', tone: 5,
      place: 'Piso 2', distance: 0, memberSince: 'junio de 2024', verified: true, completed: 9, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [
        { label: 'Está en casa los fines de semana', days: [0, 6], from: 10, to: 22, source: 'routine' },
        { label: 'Suele estar por las noches', days: [1, 2, 3, 4, 5], from: 19, to: 23, source: 'routine' },
        { label: 'Tiene las mañanas libres entre semana', days: [1, 2, 3, 4, 5], from: 8, to: 13, source: 'routine' }
      ],
      capabilities: [
        { id: 'sofia-atuendo', kind: 'object', label: 'Rebozo, sombrero y accesorios para fiestas mexicanas', labelEn: 'Rebozo, sombrero and accessories for Mexican parties', tags: ['mexican-outfit', 'sombrero', 'rebozo', 'ropa'], evidence: { count: 5, label: 'Los ha prestado 5 veces; siempre regresaron', labelEn: 'Has lent them 5 times; always returned' } },
        { id: 'sofia-decoracion', kind: 'object', label: 'Papel picado y decoración para fiestas', tags: ['decoracion', 'papel picado', 'fiesta'] },
        { id: 'sofia-fiestas', kind: 'skill', label: 'Organiza fiestas del residencial', tags: ['fiesta', 'organizar', 'evento'] },
        { id: 'sofia-paquetes', kind: 'time', label: 'Recibir paquetes', tags: ['paquete', 'entrega', 'recibir'], needsAvailability: true },
        { id: 'sofia-acompanar', kind: 'time', label: 'Acompaña a vecinas mayores a citas', tags: ['acompanar', 'acompañar', 'cita', 'clinica'], needsAvailability: true, context: 'elder', evidence: { count: 3, label: 'Ha acompañado a 3 vecinas' } }
      ],
      open: []
    },
    {
      id: 'andrea', name: 'Andrea', initials: 'An', tone: 1,
      place: 'Torre C', distance: 250, memberSince: 'febrero de 2024', verified: true, completed: 14, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está disponible por las tardes', days: [1, 2, 3, 4, 5, 6], from: 16, to: 21, source: 'routine' }],
      capabilities: [
        { id: 'andrea-cultura', kind: 'knowledge', label: 'Costumbres y tradiciones mexicanas; vivió 6 años fuera y sabe explicarlas', labelEn: 'Mexican customs and traditions; lived abroad 6 years and knows how to explain them', tags: ['mexican-culture', 'costumbres', 'tradicion', 'que-llevar', 'fiesta mexicana'], evidence: { count: 4, label: 'Ha orientado a 4 vecinos recién llegados', labelEn: 'Has guided 4 newly arrived neighbors' } },
        { id: 'andrea-ingles', kind: 'knowledge', label: 'Habla inglés', labelEn: 'Speaks English', tags: ['ingles', 'english', 'idioma'] },
        { id: 'andrea-tramites', kind: 'knowledge', label: 'Conoce trámites locales', tags: ['tramite', 'tramites', 'curp', 'ine', 'banco'] },
        { id: 'andrea-accesorios', kind: 'object', label: 'Aretes largos, collar y chal para eventos', tags: ['accesorios', 'aretes', 'collar', 'joyeria', 'chal', 'accessories'], evidence: { count: 3, label: 'Los ha prestado 3 veces; siempre regresaron' } }
      ],
      open: []
    },
    {
      id: 'wei', name: 'Wei', initials: 'W', tone: 2,
      place: 'Torre A', distance: 90, memberSince: 'noviembre de 2025', verified: true, completed: 2, allReturned: true,
      verification: { contact: 'verified', identity: 'pending', community: 'verified' },
      routines: [{ label: 'Está disponible por las noches', days: [1, 2, 3, 4, 5], from: 19, to: 22, source: 'routine' }],
      capabilities: [
        { id: 'wei-mandarin', kind: 'knowledge', label: 'Habla mandarín y español; llegó de Shanghái hace dos años', labelEn: 'Speaks Mandarin and Spanish; arrived from Shanghai two years ago', tags: ['mandarin', 'chino', 'chinese', 'china', 'adaptarse'], evidence: { count: 1, label: 'Ayudó a un vecino recién llegado', labelEn: 'Helped a newly arrived neighbor' } },
        { id: 'wei-te', kind: 'food', label: 'Té chino para compartir', tags: ['te', 'tea'] }
      ],
      open: [{ id: 'wei-costumbres', place: null, text: 'Es nueva en México y quiere entender costumbres locales.', title: 'Orientación sobre costumbres locales', tags: ['mexican-culture', 'orientacion'] }]
    },
    {
      id: 'fer', name: 'Fer', initials: 'F', tone: 4,
      place: 'Torre D', distance: 180, memberSince: 'mayo de 2025', verified: true, completed: 7, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [
        { label: 'Va a Costco los sábados por la mañana', days: [6], from: 10, to: 13, source: 'routine', route: 'costco' },
        { label: 'Está disponible por las noches', days: [0, 1, 2, 3, 4, 5, 6], from: 19, to: 23, source: 'routine' }
      ],
      capabilities: [
        { id: 'fer-evento', kind: 'context', label: 'Irá a la Noche Mexicana del residencial', labelEn: 'Is going to the residence\'s Noche Mexicana', tags: ['mexican-party', 'noche mexicana'], event: 'noche-mexicana' },
        { id: 'fer-camisa', kind: 'object', label: 'Camisa bordada', labelEn: 'Embroidered shirt', tags: ['mexican-outfit', 'camisa', 'bordada'], evidence: { count: 1, label: 'La ha prestado 1 vez' } },
        { id: 'fer-costco', kind: 'route', label: 'Suele ir a Costco los sábados', tags: ['costco'], place: 'costco' },
        { id: 'fer-costura', kind: 'skill', label: 'Costura y arreglos de ropa', tags: ['costura', 'coser', 'ropa'] },
        { id: 'fer-coche', kind: 'route', label: 'Va en coche al centro los fines de semana', tags: ['coche', 'ride', 'llevar', 'transporte', 'car', 'centro'], context: 'rides' }
      ],
      open: []
    },
    {
      id: 'luis', name: 'Luis', initials: 'L', tone: 2,
      place: 'Casas del sur', distance: 300, memberSince: 'septiembre de 2024', verified: true, completed: 6, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está disponible entre semana', days: [1, 2, 3, 4, 5], from: 10, to: 20, source: 'routine' }],
      capabilities: [
        { id: 'luis-bici', kind: 'object', label: 'Bicicleta urbana que casi no usa', tags: ['bici', 'bicicleta', 'bike'], evidence: { count: 2, label: 'La ha prestado 2 veces; siempre regresó' } },
        { id: 'luis-mascotas', kind: 'skill', label: 'Cuida y pasea mascotas', tags: ['perro', 'gato', 'mascota', 'pasear', 'cuidar'] }
      ],
      open: []
    },
    {
      id: 'diego', name: 'Diego', initials: 'D', tone: 3,
      place: 'Casas del norte', distance: 340, memberSince: 'julio de 2025', verified: true, completed: 3, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'pending' },
      routines: [
        { label: 'Está disponible por las noches entre semana', days: [1, 2, 3, 4, 5], from: 18, to: 22, source: 'routine' },
        { label: 'Está en casa los fines de semana', days: [0, 6], from: 9, to: 21, source: 'routine' }
      ],
      capabilities: [
        { id: 'diego-bici-reparar', kind: 'skill', label: 'Repara bicis: ponchaduras, cadenas, frenos', tags: ['reparar-bici', 'bici', 'bicicleta', 'ponchadura', 'cadena', 'frenos'], evidence: { count: 3, label: 'Ha arreglado bicis de vecinos 3 veces' } },
        { id: 'diego-herramientas', kind: 'object', label: 'Caja de herramientas y llaves de bici', tags: ['herramientas', 'herramienta', 'llaves', 'pinzas'] },
        { id: 'diego-asador', kind: 'object', label: 'Pinzas, espátula y parrilla de repuesto para asador', tags: ['asador-tools', 'pinzas', 'asador', 'parrilla'], evidence: { count: 2, label: 'Las ha prestado 2 veces' } },
        { id: 'diego-carpinteria', kind: 'skill', label: 'Carpintería básica', tags: ['madera', 'carpinteria', 'mueble'] }
      ],
      open: [{ id: 'diego-homedepot', place: 'homedepot', text: 'Necesita una bolsa de taquetes para terminar una repisa.', title: 'Traer taquetes de Home Depot', tags: ['home depot', 'taquetes'] }]
    },
    {
      id: 'jorge', name: 'Jorge', initials: 'J', tone: 2,
      place: 'Piso 1', distance: 0, memberSince: 'octubre de 2024', verified: true, completed: 4, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [
        { label: 'Está disponible los sábados', days: [6], from: 9, to: 20, source: 'routine' },
        { label: 'Suele estar por las noches', days: [1, 2, 3, 4, 5], from: 20, to: 23, source: 'routine' }
      ],
      capabilities: [
        { id: 'jorge-bocina', kind: 'object', label: 'Bocina portátil grande', tags: ['bocina', 'musica', 'speaker'], evidence: { count: 3, label: 'La ha prestado 3 veces' } },
        { id: 'jorge-carniceria', kind: 'contact', label: 'Conoce la carnicería La Nueva y qué cortes pedir para asar', tags: ['carniceria', 'carne', 'cortes', 'arrachera'], evidence: { count: 2, label: 'Ha recomendado dónde comprar 2 veces' } },
        { id: 'jorge-cargar', kind: 'skill', label: 'Ayuda a mover cosas pesadas', tags: ['mover', 'cargar', 'mudanza', 'pesado'] }
      ],
      open: [{ id: 'jorge-costco', place: 'costco', text: 'Quiere pilas AA pero no tiene membresía.', title: 'Traer pilas de Costco', tags: ['costco', 'pilas'] }]
    },
    {
      id: 'valeria', name: 'Valeria', initials: 'V', tone: 5,
      place: 'Torre A', distance: 90, memberSince: 'abril de 2024', verified: true, completed: 11, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Trabaja desde casa entre semana', days: [1, 2, 3, 4, 5], from: 9, to: 19, source: 'routine' }],
      capabilities: [
        { id: 'valeria-cocinar', kind: 'skill', label: 'Cocina para muchos; le gusta ayudar a preparar', tags: ['cocinar', 'preparar', 'salsas', 'guacamole', 'comida'], evidence: { count: 3, label: 'Ha ayudado a preparar comida para reuniones 3 veces' } },
        { id: 'valeria-recetas', kind: 'knowledge', label: 'Recetas y platillos mexicanos', tags: ['receta', 'mexican-food', 'que-llevar', 'platillo'] },
        { id: 'valeria-despensa', kind: 'food', label: 'Siempre tiene ingredientes básicos', tags: ['huevo', 'leche', 'azucar', 'tortillas', 'ingrediente', 'ingredientes'] },
        { id: 'valeria-paquetes', kind: 'time', label: 'Recibir paquetes', tags: ['paquete', 'entrega', 'recibir'], needsAvailability: true, evidence: { count: 1, label: 'Ha recibido paquetes 1 vez' } },
        { id: 'valeria-tacones', kind: 'object', label: 'Tacones y sandalias de fiesta del 24', tags: ['zapatos', 'tacones', 'shoes', 'heels'] }
      ],
      open: [{ id: 'valeria-costco', place: 'costco', text: 'Necesita un paquete grande de café.', title: 'Traer café de Costco', tags: ['costco', 'cafe'] }]
    },
    {
      id: 'rodrigo', name: 'Rodrigo', initials: 'R', tone: 3,
      place: 'Casas del sur', distance: 350, memberSince: 'diciembre de 2024', verified: true, completed: 10, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está disponible por las noches', days: [0, 1, 2, 3, 4, 5, 6], from: 19, to: 23, source: 'routine' }],
      capabilities: [
        { id: 'rodrigo-taller', kind: 'contact', label: 'Conoce un taller de bicis de confianza en la avenida; arreglan el mismo día', tags: ['taller-bici', 'taller', 'bici', 'bicicleta'], evidence: { count: 2, label: 'Lo ha recomendado 2 veces' } },
        { id: 'rodrigo-tech', kind: 'knowledge', label: 'Computadoras, wifi e impresoras', tags: ['computadora', 'laptop', 'wifi', 'internet', 'impresora'] }
      ],
      open: [{ id: 'rodrigo-farmacia', place: 'farmacia', text: 'Necesita unas vendas y no puede salir.', title: 'Traer vendas de la farmacia', tags: ['farmacia', 'vendas'] }]
    },
    {
      id: 'paola', name: 'Paola', initials: 'P', tone: 1,
      place: 'Torre B', distance: 150, memberSince: 'enero de 2026', verified: true, completed: 2, allReturned: true,
      verification: { contact: 'verified', identity: 'none', community: 'verified' },
      routines: [{ label: 'Está disponible por las mañanas', days: [1, 2, 3, 4, 5, 6], from: 8, to: 12, source: 'routine' }],
      capabilities: [
        { id: 'paola-plantas', kind: 'skill', label: 'Riega plantas cuando viajas', tags: ['plantas', 'regar', 'viaje'] },
        { id: 'paola-carriola', kind: 'object', label: 'Carriola ligera', tags: ['carriola', 'bebe'] }
      ],
      open: []
    },
    {
      id: 'laura', name: 'Laura', initials: 'La', tone: 4,
      place: 'Torre B', distance: 140, memberSince: 'septiembre de 2024', verified: true, completed: 9, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'En casa por las tardes con sus hijos', days: [1, 2, 3, 4, 5], from: 15, to: 21, source: 'routine' }, { label: 'En casa los fines de semana', days: [0, 6], from: 9, to: 21, source: 'routine' }],
      capabilities: [
        { id: 'laura-astronauta', kind: 'object', label: 'Disfraz de astronauta (talla 6-8) que hizo el año pasado', tags: ['disfraz', 'astronauta', 'costume', 'ninos'], evidence: { count: 2, label: 'Lo ha prestado 2 veces' } },
        { id: 'laura-manualidades', kind: 'knowledge', label: 'Arma disfraces con cartón y papel aluminio', tags: ['disfraz', 'manualidades', 'costume', 'carton'], evidence: { count: 3, label: 'Ha ayudado con disfraces escolares 3 veces' } },
        { id: 'laura-paquetes', kind: 'time', label: 'Recibir paquetes', tags: ['paquete', 'entrega', 'recibir'], needsAvailability: true }
      ],
      open: [{ id: 'laura-carriola', place: null, text: 'Busca una carriola ligera para su sobrina, que viene un mes.', title: 'Una carriola prestada por un mes', tags: ['carriola', 'bebe'] }]
    },
    {
      id: 'paulina', name: 'Paulina', initials: 'Pa', tone: 5,
      place: 'Piso 5', distance: 0, memberSince: 'mayo de 2024', verified: true, completed: 7, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Disponible por las noches', days: [1, 2, 3, 4, 5], from: 19, to: 23, source: 'routine' }, { label: 'En casa los sábados por la mañana', days: [6], from: 9, to: 13, source: 'routine' }],
      capabilities: [
        { id: 'paulina-vestido', kind: 'object', label: 'Vestido largo verde, talla M', tags: ['vestido', 'dress', 'talla-m', 'boda'], evidence: { count: 1, label: 'Lo prestó para una boda 1 vez' } },
        { id: 'paulina-maquillaje', kind: 'skill', label: 'Maquillaje y peinado para eventos', tags: ['maquillaje', 'peinado', 'makeup'] }
      ],
      open: []
    }
  ],

  /* ---- Círculos explícitos: grupos que la persona conoce conscientemente.
     Los emergentes (red frecuente, conexiones indirectas) los calcula Trust. ---- */
  circles: [
    { id: 'edificio', label: 'Tu edificio', members: ['mariana', 'sofia', 'jorge', 'paulina'] },
    { id: 'vecinos', label: 'Vecinos', members: ['mariana', 'carlos', 'ana', 'sofia', 'andrea', 'wei', 'fer', 'luis', 'diego', 'jorge', 'valeria', 'rodrigo', 'paola', 'laura', 'paulina'] },
    { id: 'familias', label: 'Familias con hijos', members: ['laura', 'ana', 'carlos', 'paola'] },
    { id: 'amigas', label: 'Amigas', members: ['mariana', 'andrea', 'paulina'] },
    { id: 'mujeres', label: 'Mujeres de la comunidad', members: ['mariana', 'ana', 'sofia', 'andrea', 'valeria', 'paola', 'laura', 'paulina', 'wei'] },
    { id: 'mascotas', label: 'Mascotas', members: ['luis', 'paola'] },
    { id: 'voluntarios', label: 'Voluntarios del residencial', members: ['sofia', 'carlos'] },
    { id: 'red-apoyo', label: 'Red de apoyo de tu mamá', private: true, sensitive: true, members: ['mariana', 'carlos'] },
    { id: 'confianza', label: 'Tu círculo de confianza', private: true, sensitive: true, members: [] }
  ],

  /* ---- Trust Graph semilla: relaciones entre personas (no ratings).
     { a, b, interactions, given (a ayudó a b), received, contexts[], daysAgo } ---- */
  trust: [
    { a: 'eddie', b: 'mariana', interactions: 3, given: 1, received: 2, contexts: ['packages', 'objects'], daysAgo: 12 },
    { a: 'eddie', b: 'carlos', interactions: 2, given: 0, received: 2, contexts: ['objects', 'home'], daysAgo: 6 },
    { a: 'eddie', b: 'valeria', interactions: 1, given: 1, received: 0, contexts: ['packages'], daysAgo: 9 },
    { a: 'eddie', b: 'luis', interactions: 1, given: 1, received: 0, contexts: ['pets'], daysAgo: 20 },
    { a: 'mariana', b: 'sofia', interactions: 5, given: 3, received: 2, contexts: ['packages', 'elder', 'objects'], daysAgo: 4 },
    { a: 'mariana', b: 'andrea', interactions: 3, given: 1, received: 2, contexts: ['objects'], daysAgo: 15 },
    { a: 'mariana', b: 'paulina', interactions: 2, given: 1, received: 1, contexts: ['objects'], daysAgo: 30 },
    { a: 'carlos', b: 'diego', interactions: 2, given: 1, received: 1, contexts: ['objects'], daysAgo: 8 },
    { a: 'carlos', b: 'laura', interactions: 2, given: 2, received: 0, contexts: ['family'], daysAgo: 25 },
    { a: 'laura', b: 'ana', interactions: 3, given: 1, received: 2, contexts: ['family', 'objects'], daysAgo: 10 }
  ],

  seedSituations: [
    { id: 'seed-taladro', text: 'Necesito colgar unas repisas este fin de semana.', summary: 'Colgar unas repisas', icon: '🪛', status: 'resolved', people: ['carlos'], daysAgo: 6, noPurchase: true },
    { id: 'seed-tofu', text: 'Luis me pidió cuidar a Tofu 20 minutos.', summary: 'Cuidar a Tofu 20 minutos', icon: '🐕', status: 'helping', helping: true, people: ['luis'], daysAgo: 0, when: 'Hoy · 6 PM' },
    { id: 'seed-valeria', text: 'Recibí un paquete de Valeria.', summary: 'Recibí un paquete de Valeria', icon: '📦', status: 'resolved', helping: true, people: ['valeria'], daysAgo: 9 }
  ],

  examples: [
    { label: 'Recibir un paquete', text: 'Mañana llega mi paquete entre 2 y 5 y estaré en la oficina.' },
    { label: 'Noche Mexicana', text: "I'm from China and I've been invited to a Mexican Independence Day party. I don't know what to wear or bring." },
    { label: 'Carne asada para 12', text: 'Voy a hacer una carne asada para 12 personas el sábado.' },
    { label: 'Bici rota', text: 'Se me rompió la bici y mañana la necesito.' },
    { label: 'Voy a IKEA', text: 'Voy a IKEA mañana.' },
    { label: 'Acompañar a mi mamá', text: 'Mi mamá necesita ir al doctor mañana a las 10 y no tengo quién la acompañe.' },
    { label: 'Disfraz de astronauta', text: 'Mis hijos necesitan disfraz de astronauta para mañana.' },
    { label: 'Vestido para una boda', text: 'Necesito un vestido largo talla M para una boda este sábado.' },
    { label: 'Hoy necesito ride', text: 'Hoy necesito ride al sur a las 8.' }
  ],
  placeholders: [
    'Mañana llega mi paquete pero estaré trabajando.',
    'Me invitaron a una fiesta mexicana y no sé qué llevar.',
    'Voy a hacer una carne asada para 12.',
    'Se me rompió la bicicleta.',
    'Voy a IKEA mañana.'
  ]
});
