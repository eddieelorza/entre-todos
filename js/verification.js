/* ==========================================================================
   verification.js — Identity & Community Verification (simulada en el MVP).

   Tres estados por persona, nunca mostrados como "niveles KYC":

     contact    email / teléfono confirmados
     identity   identidad verificada (en el futuro: proveedor externo)
     community  residente / miembro verificado por la comunidad

   Cada uno vale 'verified' | 'pending' | 'none'.

   Lo que ve el usuario son señales humanas:
     "Identidad verificada" · "Residente verificado" · "Miembro desde…" ·
     "12 interacciones completadas"

   Arquitectura para el futuro: `Verification.provider` es un adaptador con
   la forma { name, start(personId, kind), status(personId, kind) }. Un
   proveedor real (Stripe Identity, Veriff, Onfido, INE…) se conecta con
   `Verification.setProvider(...)` y el resto de la app no cambia: las vistas
   solo leen `of(person)` y `labels(person)`. Este MVP no guarda ningún
   documento; el adaptador demo solo devuelve estados y una referencia opaca.
   ========================================================================== */

const Verification = (() => {
  const STATES = ['none', 'pending', 'verified'];
  const KINDS = ['contact', 'identity', 'community'];

  /* Lo que exige cada tipo de interacción. `sensitive` = entrar a domicilio,
     acompañar a un adulto mayor, cuidar niños, información delicada. */
  const REQUIREMENTS = {
    default: ['contact'],
    objects: ['contact'],
    packages: ['contact', 'community'],
    pets: ['contact', 'community'],
    rides: ['contact', 'identity'],
    home: ['contact', 'identity', 'community'],
    elder: ['contact', 'identity', 'community'],
    children: ['contact', 'identity', 'community'],
    sensitive: ['contact', 'identity', 'community']
  };

  /* Compatibilidad: una persona con `verified: true` (semilla anterior) cuenta
     como contacto + comunidad verificados; identidad según su trayectoria. */
  function of(person) {
    const v = (person && person.verification) || {};
    const legacy = Boolean(person && person.verified);
    const completed = (person && person.completed) || 0;
    return {
      contact: v.contact || (legacy ? 'verified' : 'none'),
      identity: v.identity || (legacy && completed >= 5 ? 'verified' : (legacy ? 'pending' : 'none')),
      community: v.community || (legacy ? 'verified' : 'none'),
      since: (v.since || (person && person.memberSince)) || null,
      ref: v.ref || null   /* referencia opaca del proveedor; nunca un documento */
    };
  }

  function is(person, kind) {
    return of(person)[kind] === 'verified';
  }

  /* ¿Cumple lo que pide este contexto de interacción? */
  function meets(person, context) {
    const req = REQUIREMENTS[context] || REQUIREMENTS.default;
    const v = of(person);
    return req.every(k => v[k] === 'verified');
  }

  /* Cuántos de los tres estados están verificados (para ordenar, nunca para mostrar). */
  function score(person) {
    const v = of(person);
    return KINDS.reduce((s, k) => s + (v[k] === 'verified' ? 1 : v[k] === 'pending' ? 0.3 : 0), 0);
  }

  /* Señales humanas. Orden: identidad · comunidad · antigüedad · interacciones. */
  function labels(person, lang, opts = {}) {
    const en = lang === 'en';
    const v = of(person);
    const out = [];
    if (v.identity === 'verified') out.push(en ? 'Identity verified' : 'Identidad verificada');
    if (v.community === 'verified') out.push(en ? 'Verified resident' : 'Residente verificado');
    else if (v.contact === 'verified' && !opts.short) out.push(en ? 'Contact verified' : 'Contacto verificado');
    if (v.since && !opts.short) out.push(en ? `Member since ${v.since}` : `Miembro desde ${v.since}`);
    const n = opts.completed != null ? opts.completed : (person.completed || 0);
    if (n && !opts.short) out.push(en ? `${n} interactions completed` : `${n} ${n === 1 ? 'interacción completada' : 'interacciones completadas'}`);
    return out;
  }

  /* Qué le falta a alguien para un contexto sensible (para copy, no para bloquear a secas). */
  function missing(person, context, lang) {
    const en = lang === 'en';
    const req = REQUIREMENTS[context] || REQUIREMENTS.default;
    const v = of(person);
    const names = { contact: en ? 'contact' : 'contacto', identity: en ? 'identity' : 'identidad', community: en ? 'community membership' : 'residencia' };
    return req.filter(k => v[k] !== 'verified').map(k => names[k]);
  }

  /* ---- Adaptador de proveedor ----
     Demo: simula que la verificación queda pendiente y se resuelve sola.
     Un proveedor real implementa la misma forma y se inyecta con setProvider. */
  let provider = {
    name: 'demo',
    start(personId, kind) {
      return Promise.resolve({ personId, kind, status: 'pending', ref: `demo-${kind}-${Date.now().toString(36)}` });
    },
    status(personId, kind) {
      return Promise.resolve({ personId, kind, status: 'verified' });
    }
  };

  function setProvider(p) {
    if (p && typeof p.start === 'function' && typeof p.status === 'function') provider = p;
    return provider;
  }

  function getProvider() {
    return provider;
  }

  return { of, is, meets, score, labels, missing, setProvider, getProvider, REQUIREMENTS, STATES, KINDS };
})();
