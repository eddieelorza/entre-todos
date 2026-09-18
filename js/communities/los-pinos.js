/* ==========================================================================
   communities/los-pinos.js — Colonia Los Pinos (Guadalajara)

   Estructura social: casas de una y dos plantas, muchos adultos mayores que
   viven solos o con un hijo, pocos coches, mucho tiempo disponible de día.
   La capacidad oculta está en el tiempo, la cocina, la experiencia y unos
   pocos vecinos jóvenes con coche. Las necesidades recurrentes: compras,
   citas médicas, acompañamiento, mascotas y ayuda en casa.
   ========================================================================== */

DATA.register({
  id: 'los-pinos',
  name: 'Colonia Los Pinos',
  city: 'Guadalajara', country: 'México', languages: ['es'],
  members: 96,
  tagline: 'Casas de una planta, adultos mayores y pocos coches.',
  profile: {
    focus: ['Compras', 'Citas médicas', 'Acompañamiento', 'Mascotas', 'Ayuda en casa'],
    description: 'Mucha gente con tiempo de día y mucha experiencia, pero pocos coches y muchas escaleras que ya no se suben.'
  },
  stats: { resolved: 44, people: 39, noPurchase: 31 },

  user: {
    id: 'eddie', name: 'Eddie', initials: 'E', tone: 3,
    place: 'Casa 12', distance: 0, memberSince: 'febrero de 2026', verified: true,
    completed: 9, helped: 7, allReturned: true, routines: [],
    verification: { contact: 'verified', identity: 'verified', community: 'verified' },
    capabilities: [
      { id: 'eddie-coche', kind: 'route', label: 'Tiene coche y suele llevar a vecinos', tags: ['coche', 'llevar', 'transporte'], evidence: { count: 4, label: 'Llevó a vecinos a citas 4 veces' } },
      { id: 'eddie-celular', kind: 'knowledge', label: 'Ayuda con el celular y WhatsApp', tags: ['celular', 'whatsapp'], evidence: { count: 3, label: 'Ayudó con el celular 3 veces' } }
    ]
  },

  places: ['super', 'farmacia', 'clinica', 'mercado'],
  calendar: [
    { id: 'rosario', label: 'Convivio del rosario en la capilla', when: 'Sábado · 6 PM', tags: ['convivio'] }
  ],

  structure: {
    recurring: [
      { id: 'ride', triggers: ['gathering', 'appointment', 'errand'], label: 'Alguien con coche para traer a quienes ya no caminan mucho', labelEn: 'Someone with a car for those who no longer walk much',
        kinds: ['route', 'skill'], tags: ['coche', 'llevar', 'transporte'], priority: 'likely', why: 'Aquí casi nadie maneja', ask: '¿Podrías pasar por Doña Carmen y Don Ramiro con tu coche?' },
      { id: 'carry', triggers: ['gathering', 'package', 'household'], label: 'Manos jóvenes para subir y bajar cosas', labelEn: 'Young hands to carry things up and down',
        kinds: ['skill'], tags: ['cargar', 'mover', 'subir'], priority: 'likely', why: 'Escaleras y cosas pesadas', ask: '¿Me ayudarías a cargar y acomodar?' },
      { id: 'company', triggers: ['appointment'], label: 'Alguien que acompañe durante la cita', labelEn: 'Someone to stay during the appointment',
        kinds: ['time', 'skill'], tags: ['acompanar', 'acompañar', 'cita'], priority: 'likely', why: 'Para no esperar solo', ask: '¿Podrías acompañarla en la consulta?' },
      { id: 'pills', triggers: ['appointment'], label: 'Alguien que entienda de medicamentos y presión', labelEn: 'Someone who knows about medication and blood pressure',
        kinds: ['knowledge'], tags: ['medicamentos', 'presion', 'salud'], priority: 'optional', why: 'Por si hay dudas después', ask: '¿Me ayudarías a entender lo que le recetaron?' }
    ],
    suppress: { gathering: ['speaker', 'cooler', 'grill-tools', 'charcoal', 'meat'] }
  },

  people: [
    {
      id: 'carmen', name: 'Doña Carmen', initials: 'C', tone: 1,
      place: 'Casa 8', distance: 40, memberSince: 'marzo de 2025', verified: true, completed: 6, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está en casa todo el día', days: [0, 1, 2, 3, 4, 5, 6], from: 8, to: 21, source: 'routine' }],
      capabilities: [
        { id: 'carmen-cocina', kind: 'skill', label: 'Cocina para muchos; su mole es famoso en la colonia', tags: ['cocinar', 'preparar', 'mole', 'comida'], evidence: { count: 5, label: 'Ha cocinado para convivios 5 veces' } },
        { id: 'carmen-ollas', kind: 'object', label: 'Ollas grandes, cazuelas y vajilla para 20', tags: ['ollas', 'vajilla', 'platos', 'cazuela'], evidence: { count: 3, label: 'Las ha prestado 3 veces' } },
        { id: 'carmen-paquetes', kind: 'time', label: 'Recibir paquetes', tags: ['paquete', 'entrega', 'recibir'], needsAvailability: true, evidence: { count: 4, label: 'Ha recibido paquetes de vecinos 4 veces' } },
        { id: 'carmen-acompanar', kind: 'time', label: 'Acompaña a vecinas a citas', tags: ['acompanar', 'acompañar', 'cita'], needsAvailability: true, context: 'elder', evidence: { count: 2, label: 'Acompañó a 2 vecinas' } }
      ],
      open: [{ id: 'carmen-clinica', place: 'clinica', text: 'Tiene cita en el IMSS el jueves a las 9 y su hijo no puede llevarla.', title: 'Llevar a Doña Carmen al IMSS', tags: ['clinica', 'cita', 'llevar'] }]
    },
    {
      id: 'ramiro', name: 'Don Ramiro', initials: 'R', tone: 2,
      place: 'Casa 15', distance: 60, memberSince: 'enero de 2025', verified: true, completed: 8, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está en casa por las mañanas y tardes', days: [0, 1, 2, 3, 4, 5, 6], from: 8, to: 19, source: 'routine' }],
      capabilities: [
        { id: 'ramiro-reparar', kind: 'skill', label: 'Electricista jubilado: focos, contactos, apagadores', tags: ['reparar', 'arreglar', 'foco', 'electricidad', 'contacto', 'instalar'], evidence: { count: 9, label: 'Ha arreglado cosas en 9 casas' } },
        { id: 'ramiro-herramientas', kind: 'object', label: 'Herramientas de toda la vida', tags: ['herramientas', 'herramienta', 'desarmador', 'pinzas'], evidence: { count: 4, label: 'Las ha prestado 4 veces' } },
        { id: 'ramiro-plomero', kind: 'contact', label: 'Conoce al plomero de confianza de la colonia', tags: ['plomero', 'fuga', 'tuberia', 'agua'] }
      ],
      open: [{ id: 'ramiro-super', place: 'super', text: 'Ya no maneja y necesita el mandado de la semana.', title: 'Traer el mandado de Don Ramiro', tags: ['super', 'mandado'] }]
    },
    {
      id: 'lupita', name: 'Lupita', initials: 'L', tone: 5,
      place: 'Casa 3', distance: 90, memberSince: 'agosto de 2024', verified: true, completed: 13, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está disponible por las mañanas', days: [1, 2, 3, 4, 5], from: 8, to: 13, source: 'routine' }],
      capabilities: [
        { id: 'lupita-salud', kind: 'knowledge', label: 'Enfermera jubilada: presión, medicamentos, primeros auxilios', tags: ['medicamentos', 'presion', 'salud', 'enfermera', 'receta'], evidence: { count: 7, label: 'Ha orientado a 7 vecinos sobre su salud' } },
        { id: 'lupita-acompanar', kind: 'time', label: 'Acompaña a citas médicas', tags: ['acompanar', 'acompañar', 'cita', 'clinica'], needsAvailability: true, context: 'elder', evidence: { count: 5, label: 'Ha acompañado a citas 5 veces' } },
        { id: 'lupita-baumanometro', kind: 'object', label: 'Baumanómetro y glucómetro', tags: ['presion', 'glucosa', 'aparato'] }
      ],
      open: []
    },
    {
      id: 'tono', name: 'Toño', initials: 'T', tone: 3,
      place: 'Casa 20', distance: 110, memberSince: 'mayo de 2025', verified: true, completed: 11, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [
        { label: 'Va al súper los martes y sábados en coche', days: [2, 6], from: 9, to: 12, source: 'routine', route: 'super' },
        { label: 'Entra a trabajar a las 11: por las mañanas puede llevar a alguien', days: [1, 2, 3, 4, 5], from: 7, to: 11, source: 'routine' },
        { label: 'Está disponible los fines de semana', days: [0, 6], from: 9, to: 20, source: 'routine' },
        { label: 'Llega del trabajo después de las 7', days: [1, 2, 3, 4, 5], from: 19, to: 22, source: 'routine' }
      ],
      capabilities: [
        { id: 'tono-coche', kind: 'route', label: 'Tiene coche y lleva a vecinos a citas y compras', tags: ['coche', 'llevar', 'transporte', 'clinica'], needsAvailability: true, context: 'rides', evidence: { count: 6, label: 'Ha llevado a vecinos 6 veces' } },
        { id: 'tono-super', kind: 'route', label: 'Suele ir al súper martes y sábados', tags: ['super'], place: 'super' },
        { id: 'tono-cargar', kind: 'skill', label: 'Carga y acomoda lo que haga falta', tags: ['cargar', 'mover', 'subir', 'pesado'], evidence: { count: 3, label: 'Ayudó a cargar 3 veces' } }
      ],
      open: []
    },
    {
      id: 'rosa', name: 'Rosa', initials: 'Ro', tone: 4,
      place: 'Casa 6', distance: 50, memberSince: 'octubre de 2024', verified: true, completed: 9, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está en casa casi siempre', days: [0, 1, 2, 3, 4, 5, 6], from: 8, to: 21, source: 'routine' }],
      capabilities: [
        { id: 'rosa-mascotas', kind: 'skill', label: 'Cuida perros y gatos en su casa cuando alguien viaja', tags: ['perro', 'perrita', 'gato', 'mascota', 'cuidar', 'pasear'], context: 'pets', evidence: { count: 4, label: 'Ha cuidado mascotas de vecinos 4 veces' } },
        { id: 'rosa-transportadora', kind: 'object', label: 'Transportadora y correa de repuesto', tags: ['transportadora', 'correa', 'mascota'] },
        { id: 'rosa-paquetes', kind: 'time', label: 'Recibir paquetes', tags: ['paquete', 'entrega', 'recibir'], needsAvailability: true, evidence: { count: 2, label: 'Ha recibido paquetes 2 veces' } }
      ],
      open: [
        { id: 'rosa-ropero', place: null, text: 'Necesita mover un ropero y no puede sola.', title: 'Mover un ropero', tags: ['cargar', 'mover', 'ropero'] },
        { id: 'rosa-super', place: 'super', text: 'Se le acabó el alimento de los perros y el bulto pesa mucho.', title: 'Traer alimento para perros del súper', tags: ['super', 'alimento'] }
      ]
    },
    {
      id: 'martin', name: 'Martín', initials: 'Ma', tone: 2,
      place: 'Casa 11', distance: 30, memberSince: 'septiembre de 2025', verified: true, completed: 7, allReturned: true,
      verification: { contact: 'verified', identity: 'pending', community: 'verified' },
      routines: [{ label: 'Está disponible por las tardes y noches', days: [1, 2, 3, 4, 5], from: 16, to: 22, source: 'routine' }, { label: 'Está en casa los fines de semana', days: [0, 6], from: 10, to: 22, source: 'routine' }],
      capabilities: [
        { id: 'martin-celular', kind: 'knowledge', label: 'Celulares, WhatsApp, videollamadas y citas por internet', tags: ['celular', 'whatsapp', 'videollamada', 'internet', 'cita', 'app'], evidence: { count: 7, label: 'Ha ayudado a 7 vecinos con el celular' } },
        { id: 'martin-cargar', kind: 'skill', label: 'Sube y baja cosas pesadas', tags: ['cargar', 'mover', 'subir', 'pesado', 'ropero'], evidence: { count: 2, label: 'Ayudó a mover cosas 2 veces' } },
        { id: 'martin-escalera', kind: 'skill', label: 'Cambia focos y cosas en alto', tags: ['foco', 'alto', 'escalera', 'cambiar'] }
      ],
      open: []
    },
    {
      id: 'elena', name: 'Elena', initials: 'E', tone: 5,
      place: 'Casa 17', distance: 80, memberSince: 'abril de 2025', verified: true, completed: 5, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Está en casa por las tardes', days: [0, 1, 2, 3, 4, 5, 6], from: 14, to: 21, source: 'routine' }],
      capabilities: [
        { id: 'elena-sillas', kind: 'object', label: 'Diez sillas plegables del salón parroquial', tags: ['sillas', 'silla'], quantity: 10, evidence: { count: 6, label: 'Las ha prestado 6 veces' } },
        { id: 'elena-mesas', kind: 'object', label: 'Dos mesas largas del salón parroquial', tags: ['mesa', 'mesas'], evidence: { count: 4, label: 'Las ha prestado 4 veces' } },
        { id: 'elena-cocina', kind: 'skill', label: 'Ayuda a cocinar y a servir', tags: ['cocinar', 'preparar', 'servir', 'comida'], evidence: { count: 2, label: 'Ayudó en 2 convivios' } },
        { id: 'elena-manteles', kind: 'object', label: 'Manteles y termos grandes', tags: ['manteles', 'termo', 'cafe'] }
      ],
      open: []
    },
    {
      id: 'pedro', name: 'Don Pedro', initials: 'P', tone: 3,
      place: 'Casa 2', distance: 120, memberSince: 'junio de 2025', verified: true, completed: 3, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Va a la farmacia los lunes por la mañana', days: [1], from: 9, to: 11, source: 'routine', route: 'farmacia' }, { label: 'Está en casa por las tardes', days: [0, 1, 2, 3, 4, 5, 6], from: 15, to: 20, source: 'routine' }],
      capabilities: [
        { id: 'pedro-jardin', kind: 'skill', label: 'Jardinería y poda', tags: ['jardin', 'plantas', 'podar', 'arbol'] },
        { id: 'pedro-escalera', kind: 'object', label: 'Escalera de aluminio', tags: ['escalera'], evidence: { count: 3, label: 'La ha prestado 3 veces' } },
        { id: 'pedro-farmacia', kind: 'route', label: 'Suele ir a la farmacia los lunes', tags: ['farmacia'], place: 'farmacia' }
      ],
      open: [{ id: 'pedro-celular', place: null, text: 'Quiere aprender a hacer videollamadas con sus nietos.', title: 'Aprender a hacer videollamadas', tags: ['celular', 'videollamada'] }]
    },
    {
      id: 'gaby', name: 'Gaby', initials: 'G', tone: 1,
      place: 'Casa 9', distance: 45, memberSince: 'noviembre de 2024', verified: true, completed: 10, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Trabaja desde casa entre semana', days: [1, 2, 3, 4, 5], from: 9, to: 18, source: 'routine' }],
      capabilities: [
        { id: 'gaby-tramites', kind: 'knowledge', label: 'Trámites del IMSS, pensiones e INAPAM', tags: ['tramite', 'tramites', 'imss', 'pension', 'inapam', 'cita'], evidence: { count: 5, label: 'Ha ayudado con trámites 5 veces' } },
        { id: 'gaby-acompanar', kind: 'time', label: 'Acompaña a citas cuando trabaja desde casa', tags: ['acompanar', 'acompañar', 'cita'], needsAvailability: true, context: 'elder', evidence: { count: 3, label: 'Acompañó a citas 3 veces' } },
        { id: 'gaby-paquetes', kind: 'time', label: 'Recibir paquetes', tags: ['paquete', 'entrega', 'recibir'], needsAvailability: true }
      ],
      open: []
    },
    {
      id: 'chuy', name: 'Chuy', initials: 'Ch', tone: 2,
      place: 'Casa 22', distance: 140, memberSince: 'julio de 2024', verified: true, completed: 12, allReturned: true,
      verification: { contact: 'verified', identity: 'verified', community: 'verified' },
      routines: [{ label: 'Va al mercado de abastos los viernes con la camioneta', days: [5], from: 7, to: 11, source: 'routine', route: 'mercado' }, { label: 'Trabaja por su cuenta: está libre por las tardes', days: [1, 2, 3, 4], from: 15, to: 20, source: 'routine' }, { label: 'Está disponible los sábados', days: [6], from: 9, to: 19, source: 'routine' }],
      capabilities: [
        { id: 'chuy-camioneta', kind: 'route', label: 'Tiene camioneta; lleva gente y cosas grandes', tags: ['coche', 'camioneta', 'llevar', 'transporte', 'mudanza'], needsAvailability: true, evidence: { count: 8, label: 'Ha llevado vecinos y cosas 8 veces' } },
        { id: 'chuy-mercado', kind: 'route', label: 'Suele ir al mercado de abastos los viernes', tags: ['mercado'], place: 'mercado' },
        { id: 'chuy-cargar', kind: 'skill', label: 'Carga lo que sea', tags: ['cargar', 'mover', 'subir', 'pesado', 'ropero'], evidence: { count: 4, label: 'Ayudó a cargar 4 veces' } }
      ],
      open: []
    }
  ],

  /* ---- Círculos: en una colonia de adultos mayores los círculos son la calle, la capilla y las familias ---- */
  circles: [
    { id: 'calle', label: 'Tu calle', members: ['carmen', 'rosa', 'martin', 'gaby'] },
    { id: 'vecinos', label: 'Vecinos', members: ['carmen', 'ramiro', 'lupita', 'tono', 'rosa', 'martin', 'elena', 'pedro', 'gaby', 'chuy'] },
    { id: 'capilla', label: 'Grupo de la capilla', members: ['carmen', 'elena', 'pedro', 'lupita'] },
    { id: 'con-coche', label: 'Vecinos con coche', members: ['tono', 'chuy', 'gaby'] },
    { id: 'jovenes', label: 'Jóvenes de la colonia', members: ['martin', 'tono'] },
    { id: 'red-mama', label: 'Red de apoyo de tu mamá', private: true, sensitive: true, members: ['lupita', 'carmen', 'tono'] },
    { id: 'confianza', label: 'Tu círculo de confianza', private: true, sensitive: true, members: [] }
  ],

  /* ---- Trust Graph semilla: relaciones, no calificaciones ---- */
  trust: [
    { a: 'eddie', b: 'tono', interactions: 4, given: 2, received: 2, contexts: ['rides', 'objects'], daysAgo: 5 },
    { a: 'eddie', b: 'lupita', interactions: 2, given: 1, received: 1, contexts: ['elder', 'home'], daysAgo: 14 },
    { a: 'eddie', b: 'ramiro', interactions: 3, given: 2, received: 1, contexts: ['home', 'rides'], daysAgo: 4 },
    { a: 'eddie', b: 'carmen', interactions: 2, given: 1, received: 1, contexts: ['packages', 'elder'], daysAgo: 20 },
    { a: 'eddie', b: 'martin', interactions: 1, given: 0, received: 1, contexts: ['objects'], daysAgo: 30 },
    { a: 'carmen', b: 'lupita', interactions: 6, given: 2, received: 4, contexts: ['elder', 'home'], daysAgo: 3 },
    { a: 'carmen', b: 'elena', interactions: 4, given: 2, received: 2, contexts: ['objects', 'family'], daysAgo: 9 },
    { a: 'lupita', b: 'gaby', interactions: 3, given: 1, received: 2, contexts: ['elder'], daysAgo: 12 },
    { a: 'tono', b: 'chuy', interactions: 2, given: 1, received: 1, contexts: ['rides'], daysAgo: 18 },
    { a: 'rosa', b: 'martin', interactions: 3, given: 1, received: 2, contexts: ['home', 'pets'], daysAgo: 7 },
    { a: 'ramiro', b: 'pedro', interactions: 2, given: 1, received: 1, contexts: ['home', 'objects'], daysAgo: 22 }
  ],

  seedSituations: [
    { id: 'seed-pinos-ramiro', text: 'Llevé a Don Ramiro a su cita.', summary: 'Llevé a Don Ramiro a su cita', icon: '🚗', status: 'resolved', helping: true, people: ['ramiro'], daysAgo: 4 },
    { id: 'seed-pinos-foco', text: 'Se fundió el foco del patio.', summary: 'Cambiar el foco del patio', icon: '💡', status: 'resolved', people: ['ramiro'], daysAgo: 11, noPurchase: true }
  ],

  examples: [
    { label: 'Cita en el IMSS', text: 'Mi mamá tiene cita en el IMSS el jueves a las 9 y no puedo llevarla.' },
    { label: 'Voy al súper', text: 'Voy al súper mañana por la mañana.' },
    { label: 'El foco de la cocina', text: 'Se fundió el foco de la cocina y ya no me subo a la escalera.' },
    { label: 'Mi perrita sola', text: 'Me voy tres días y mi perrita se queda sola.' },
    { label: 'Comida para 10', text: 'Voy a hacer una comida para 10 personas el sábado por el cumpleaños de mi mamá.' }
  ],
  placeholders: [
    'Mi mamá tiene cita en el IMSS y no puedo llevarla.',
    'Voy al súper mañana.',
    'Se fundió el foco y ya no me subo a la escalera.',
    'Me voy tres días y mi perrita se queda sola.',
    'Voy a hacer una comida para 10 el sábado.'
  ]
});
