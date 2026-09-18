/* ==========================================================================
   location-seed.js — Capa geográfica de la comunidad demo.

   Se carga después de data.js y location-service.js. Añade a DATA lo que
   el matching por ubicación necesita, sin tocar el resto del grafo:

     DATA.community.anchor   punto de referencia (ficticio) del residencial
     DATA.community.zones    torres / edificios elegibles como fallback manual
     DATA.matching           radio máximo y límite de resultados
     person.zone             zona declarada de cada persona
     person.offset           metros {x este, y norte} desde el ancla

   Privacidad: estas posiciones son aproximadas por diseño y jamás se pintan.
   Las vistas solo ven distancias ya formateadas por LocationService.

   En demo, cuando el usuario comparte su ubicación, el ancla se mueve a donde
   está él (anchorFollowsUser) para que los vecinos de la demo sigan "cerca".
   En live, las posiciones aproximadas vendrán de Supabase/PostGIS y esta
   capa deja de aplicarse (ver supabase/location.sql).
   ========================================================================== */

(function seedLocation() {
  if (typeof DATA === 'undefined') return;

  const ZONES = [
    { id: 'central', label: 'Edificio central', offset: { x: 0, y: 0 } },
    { id: 'torre-a', label: 'Torre A', offset: { x: -90, y: 45 } },
    { id: 'torre-b', label: 'Torre B', offset: { x: 140, y: 75 } },
    { id: 'torre-c', label: 'Torre C', offset: { x: 180, y: -240 } }
  ];

  /* Posición aproximada por persona (coherente con su `distance` de la semilla). */
  const OFFSETS = {
    eddie: { zone: 'central', offset: { x: 0, y: 0 } },
    mariana: { zone: 'central', offset: { x: 0, y: 0 } },
    sofia: { zone: 'central', offset: { x: 0, y: 0 } },
    jorge: { zone: 'central', offset: { x: 0, y: 0 } },
    ana: { zone: 'torre-a', offset: { x: -60, y: 50 } },
    wei: { zone: 'torre-a', offset: { x: -80, y: 40 } },
    valeria: { zone: 'torre-a', offset: { x: -85, y: 30 } },
    fer: { zone: 'torre-a', offset: { x: -170, y: 60 } },
    carlos: { zone: 'torre-b', offset: { x: 100, y: 65 } },
    paola: { zone: 'torre-b', offset: { x: 130, y: 75 } },
    diego: { zone: 'torre-b', offset: { x: 180, y: 85 } },
    andrea: { zone: 'torre-c', offset: { x: 150, y: -200 } },
    luis: { zone: 'torre-c', offset: { x: 180, y: -240 } },
    rodrigo: { zone: 'torre-c', offset: { x: 210, y: -280 } }
  };

  const community = DATA.community || (DATA.community = {});
  /* Ancla ficticia. No corresponde a un domicilio real. */
  community.anchor = community.anchor || { lat: 19.3605, lng: -99.1740 };
  community.zones = community.zones || ZONES;
  community.anchorFollowsUser = community.anchorFollowsUser !== false;

  DATA.matching = Object.assign({ radius: 500, limit: 3 }, DATA.matching || {});

  function apply(person) {
    if (!person || !OFFSETS[person.id]) return;
    if (!person.zone) person.zone = OFFSETS[person.id].zone;
    if (!person.offset && !person.location) person.offset = OFFSETS[person.id].offset;
  }
  apply(DATA.user);
  (DATA.people || DATA.residents || []).forEach(apply);

  if (typeof LocationService !== 'undefined') {
    /* Si hay coords de esta sesión y estamos en demo, el ancla es el usuario. */
    const coords = community.anchorFollowsUser ? LocationService.coords() : null;
    LocationService.setAnchor(coords || community.anchor);
    if (typeof Matching !== 'undefined' && DATA.matching.radius != null) Matching.setDefaultRadius(DATA.matching.radius);
  }
})();
