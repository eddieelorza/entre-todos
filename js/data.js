/* ==========================================================================
   data.js — Community Simulation Layer: registro y modelo genérico.

   Entre Todos no tiene "vecinos con anuncios". Tiene un modelo estructurado
   de cada comunidad, y se comporta distinto según su estructura social.

   Community {
     id, name, city, country, languages[], members, tagline,
     profile   { focus[]: de qué va la vida en este lugar, description }
     user      quién es el usuario de la demo aquí
     places[]  lugares que el sistema reconoce en un trayecto ("voy al súper")
     calendar[] eventos locales que crean contexto
     structure {
       recurring[]  necesidades que este lugar suele tener; se inyectan en
                    discoverNeeds cuando la situación las dispara
                    { id, triggers: ['gathering' | 'package' | … | '*'], when: 'foreign'?,
                      label, labelEn, why, kinds[], tags[], priority, ask, askEn }
       suppress     { scenario: [needId] } necesidades del playbook base que aquí no aplican
     }
     people[]  Person { id, name, place, distance, memberSince, verified, completed, allReturned,
                        routines[] { label, days[], from, to, source: routine|declared, route? }
                        capabilities[] { id, kind, label, tags[], evidence?, needsAvailability?, place? }
                        open[] { id, place?, title, text, tags[] }  ← lo que esa persona necesita hoy }
     seedSituations[], examples[], placeholders[], stats
   }

   kind interno de una capacidad (nunca se muestra como categoría):
     object · skill · knowledge · time · route · contact · food · context

   Cada comunidad vive en js/communities/<id>.js y se registra aquí.
   ========================================================================== */

const DATA = {
  seedVersion: 5,
  defaultCommunity: 'jacarandas',
  communities: [],

  /* Catálogo de lugares reutilizable entre comunidades. */
  placesCatalog: {
    ikea: { id: 'ikea', label: 'IKEA', match: ['ikea'] },
    costco: { id: 'costco', label: 'Costco', match: ['costco'] },
    homedepot: { id: 'homedepot', label: 'Home Depot', match: ['home depot', 'homedepot'] },
    super: { id: 'super', label: 'el súper', match: ['super', 'supermercado', 'walmart', 'soriana', 'chedraui', 'la comer', 'mercadona', 'lidl', 'carrefour', 'bonpreu'] },
    mercado: { id: 'mercado', label: 'el mercado', match: ['mercado', 'tianguis', 'abastos', 'mercat', 'mercabarna', 'boqueria'] },
    farmacia: { id: 'farmacia', label: 'la farmacia', match: ['farmacia', 'pharmacy'] },
    clinica: { id: 'clinica', label: 'la clínica', match: ['imss', 'clinica', 'hospital', 'issste', 'consultorio', 'cap'] },
    aeropuerto: { id: 'aeropuerto', label: 'el aeropuerto', match: ['aeropuerto', 'airport', 'el prat'] },
    extranjeria: { id: 'extranjeria', label: 'Extranjería', match: ['extranjeria', 'oficina de extranjeria', 'comisaria', 'immigration office'] },
    decathlon: { id: 'decathlon', label: 'Decathlon', match: ['decathlon'] }
  },

  register(community) {
    this.communities.push(community);
  },

  community(id) {
    return this.communities.find(c => c.id === id) || this.communities.find(c => c.id === this.defaultCommunity) || this.communities[0];
  }
};
