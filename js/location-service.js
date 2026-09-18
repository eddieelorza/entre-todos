/* ==========================================================================
   location-service.js — Geolocalización progresiva.

   Reglas del módulo:
   · No pide permiso al cargar la app. Solo `getCurrentLocation()` dispara el
     prompt del navegador, y solo se llama desde una acción explícita.
   · Las coordenadas viven en memoria y en sessionStorage (se borran al
     cerrar la pestaña). Nunca se pintan en la interfaz: las vistas solo
     reciben distancias ya formateadas ("mismo edificio", "80 m", …).
   · Si el permiso se niega o no hay GPS, el usuario puede elegir su zona
     (torre / edificio) y el matching sigue funcionando con eso.
   · Es un módulo puro: no conoce State ni DATA. Recibe objetos con
     `location` {lat,lng} o con `offset` {x,y} (metros desde un ancla).

   Preparado para Supabase/PostGIS: `toStorable()` devuelve la ubicación
   redondeada (~110 m) lista para `profiles.approx_geo`. Ver
   supabase/location.sql.
   ========================================================================== */

const LocationService = (() => {
  const SESSION_KEY = 'entre-todos:location';   /* coords de la sesión (sessionStorage) */
  const PREFS_KEY = 'entre-todos:location-prefs'; /* zona elegida + si ya rechazó (localStorage) */
  const EARTH_RADIUS_M = 6371000;
  const SAME_BUILDING_M = 30;     /* por debajo de esto, "mismo edificio" */
  const DEFAULT_MAX_AGE = 5 * 60 * 1000;
  const DEFAULT_TIMEOUT = 8000;
  const STORE_DECIMALS = 3;       /* 3 decimales ≈ 110 m: suficiente para "cerca", nunca para "en qué puerta" */

  /* status: 'idle' | 'prompt' | 'granted' | 'denied' | 'unavailable' | 'unsupported' */
  const state = {
    status: 'idle',
    coords: null,      /* { lat, lng, accuracy, at } */
    zone: null,        /* id de zona elegido manualmente */
    declined: false,   /* el usuario ya dijo que no; no volvemos a insistir */
    anchor: null,      /* ancla para proyectar offsets (demo) */
    demoOrigin: null   /* desde dónde medir cuando no hay GPS ni zona (demo: el usuario simulado) */
  };
  const listeners = new Set();

  /* ---- Persistencia mínima ---- */
  function readJson(storage, key) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeJson(storage, key, value) {
    try {
      if (value == null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* Modo privado o cuota llena: seguimos solo en memoria */
    }
  }

  function restore() {
    const prefs = readJson(window.localStorage, PREFS_KEY);
    if (prefs) {
      state.zone = prefs.zone || null;
      state.declined = Boolean(prefs.declined);
    }
    const session = readJson(window.sessionStorage, SESSION_KEY);
    if (session && isCoords(session.coords)) {
      state.coords = session.coords;
      state.status = 'granted';
    }
  }

  function savePrefs() {
    writeJson(window.localStorage, PREFS_KEY, { zone: state.zone, declined: state.declined });
  }

  function saveSession() {
    writeJson(window.sessionStorage, SESSION_KEY, state.coords ? { coords: state.coords } : null);
  }

  function emit() {
    listeners.forEach(fn => {
      try { fn(snapshot()); } catch (err) { console.warn('[LocationService] listener falló', err); }
    });
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /* ---- Utilidades geográficas ---- */
  function isCoords(c) {
    return Boolean(c) && Number.isFinite(c.lat) && Number.isFinite(c.lng);
  }

  const toRad = deg => deg * Math.PI / 180;

  /* Haversine. Devuelve metros o null si falta algún punto. */
  function calculateDistance(a, b) {
    if (!isCoords(a) || !isCoords(b)) return null;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
  }

  /* Proyecta un offset en metros (x este, y norte) alrededor de un ancla. */
  function project(anchor, offset) {
    if (!isCoords(anchor) || !offset) return null;
    const dLat = (offset.y || 0) / EARTH_RADIUS_M;
    const dLng = (offset.x || 0) / (EARTH_RADIUS_M * Math.cos(toRad(anchor.lat)));
    return { lat: anchor.lat + dLat * 180 / Math.PI, lng: anchor.lng + dLng * 180 / Math.PI };
  }

  /* Resuelve la ubicación de cualquier cosa: coords directas, `offset` o `location`.
     Con ancla, el offset manda: así la comunidad demo se recentra donde esté el
     usuario cuando comparte su ubicación. Sin ancla (live), vale `location`. */
  function locate(target, anchor = state.anchor) {
    if (!target) return null;
    if (isCoords(target)) return { lat: target.lat, lng: target.lng };
    if (target.offset && isCoords(anchor)) return project(anchor, target.offset);
    if (isCoords(target.location)) return { lat: target.location.lat, lng: target.location.lng };
    return null;
  }

  /* ---- Formato: nunca coordenadas, solo distancia aproximada ---- */
  function formatDistance(meters, opts = {}) {
    const lang = opts.lang === 'en' ? 'en' : 'es';
    if (meters == null || !Number.isFinite(meters)) return lang === 'en' ? 'near you' : 'cerca de ti';
    if (meters < SAME_BUILDING_M || opts.sameBuilding) return lang === 'en' ? 'same building' : 'mismo edificio';
    if (meters < 1000) {
      const step = meters < 200 ? 10 : 50;
      return `${Math.max(step, Math.round(meters / step) * step)} m`;
    }
    const km = meters < 10000 ? (meters / 1000).toFixed(1).replace(/\.0$/, '') : Math.round(meters / 1000);
    return `${km} km`;
  }

  /* ---- Permiso ---- */
  function supported() {
    return Boolean(navigator.geolocation);
  }

  /* 'granted' | 'denied' | 'prompt' | 'unsupported'. No dispara ningún diálogo. */
  async function getLocationPermission() {
    if (!supported()) return 'unsupported';
    if (state.status === 'granted' && state.coords) return 'granted';
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const res = await navigator.permissions.query({ name: 'geolocation' });
        if (res.state === 'granted' || res.state === 'denied' || res.state === 'prompt') {
          if (res.state === 'denied') state.status = 'denied';
          return res.state;
        }
      } catch (err) {
        /* Safari < 16 no implementa permissions.query para geolocation */
      }
    }
    if (state.status === 'denied') return 'denied';
    return 'prompt';
  }

  function errorFor(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }

  /* Pide la ubicación. Solo llamar desde una acción del usuario. */
  function getCurrentLocation(opts = {}) {
    if (!supported()) {
      state.status = 'unsupported';
      emit();
      return Promise.reject(errorFor('unsupported', 'Este navegador no ofrece geolocalización.'));
    }
    const maxAge = opts.maxAge ?? DEFAULT_MAX_AGE;
    if (!opts.force && state.coords && Date.now() - state.coords.at < maxAge) {
      return Promise.resolve(Object.assign({}, state.coords));
    }
    state.status = 'prompt';
    emit();
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(pos => {
        state.coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0),
          at: Date.now()
        };
        state.status = 'granted';
        state.declined = false;
        saveSession();
        savePrefs();
        emit();
        resolve(Object.assign({}, state.coords));
      }, geoErr => {
        let code = 'unavailable';
        if (geoErr && geoErr.code === 1) code = 'denied';
        else if (geoErr && geoErr.code === 3) code = 'timeout';
        state.status = code === 'denied' ? 'denied' : 'unavailable';
        if (code === 'denied') {
          state.declined = true;
          savePrefs();
        }
        emit();
        reject(errorFor(code, geoErr && geoErr.message ? geoErr.message : 'No pudimos obtener tu ubicación.'));
      }, {
        enableHighAccuracy: Boolean(opts.highAccuracy),
        timeout: opts.timeout ?? DEFAULT_TIMEOUT,
        maximumAge: maxAge
      });
    });
  }

  /* ---- Fallback manual por zona ---- */
  function setZone(zoneId) {
    state.zone = zoneId || null;
    savePrefs();
    emit();
  }

  function getZone() {
    return state.zone;
  }

  /* Registra que el usuario prefirió no compartir ubicación (sin llamar al navegador). */
  function decline() {
    state.declined = true;
    if (state.status !== 'denied') state.status = 'idle';
    savePrefs();
    emit();
  }

  /* Olvida coords y zona. Útil para "Restablecer demo". */
  function clear() {
    state.coords = null;
    state.zone = null;
    state.declined = false;
    state.status = 'idle';
    saveSession();
    savePrefs();
    emit();
  }

  /* Ancla para proyectar offsets (demo). */
  function setAnchor(anchor) {
    state.anchor = isCoords(anchor) ? { lat: anchor.lat, lng: anchor.lng } : null;
  }

  /* Origen de demo: la persona simulada (con `offset`/`location`) desde la que
     se miden distancias cuando no hay GPS ni zona elegida. Así las distancias
     salen siempre de coordenadas y nunca de un número escrito a mano. */
  function setDemoOrigin(target) {
    state.demoOrigin = target || null;
  }

  /* ---- Resolución de distancias ----
     origin: { coords?, zone? }  → de dónde medimos (por defecto el usuario actual)
     target: { location? | offset?, zone? }
     zones:  lista [{ id, offset|location }] para el fallback por zona.
     Devuelve metros, 0 para "mismo edificio" o null si no hay forma de saberlo. */
  function distanceTo(target, opts = {}) {
    if (!target) return null;
    const origin = opts.origin || {};
    const zones = opts.zones || [];
    const anchor = opts.anchor || state.anchor;
    /* Sin GPS ni zona elegida, el origen es la persona simulada de la demo (su zona y sus coords). */
    const demo = !state.coords && !state.zone && origin.coords === undefined && origin.zone === undefined ? state.demoOrigin : null;
    const originZone = origin.zone !== undefined ? origin.zone : (state.zone || (demo && demo.zone) || null);
    const demoCoords = demo ? locate(demo, anchor) : null;
    const originCoords = origin.coords !== undefined ? origin.coords : (state.coords || demoCoords);
    const targetZone = target.zone || null;

    /* Misma zona declarada: mismo edificio, aunque el GPS diga otra cosa (interiores). */
    if (originZone && targetZone && originZone === targetZone) return 0;

    const targetPoint = locate(target, anchor);
    if (isCoords(originCoords) && targetPoint) {
      return calculateDistance(originCoords, targetPoint);
    }

    /* Fallback: zona elegida → medimos de zona a zona */
    if (originZone) {
      const from = zones.find(z => z.id === originZone);
      const fromPoint = locate(from, anchor);
      if (fromPoint && targetPoint) return calculateDistance(fromPoint, targetPoint);
      const toZone = zones.find(z => z.id === targetZone);
      const toPoint = locate(toZone, anchor);
      if (fromPoint && toPoint) return calculateDistance(fromPoint, toPoint);
    }

    /* Último recurso: distancia declarada en los datos (demo) */
    if (Number.isFinite(target.distance)) return target.distance;
    return null;
  }

  /* Zona más cercana a unas coords (para inferir "estás en Torre B"). */
  function nearestZone(coords, zones, opts = {}) {
    const anchor = opts.anchor || state.anchor;
    const within = opts.within ?? 80;
    let best = null;
    (zones || []).forEach(z => {
      const d = calculateDistance(coords, locate(z, anchor));
      if (d != null && d <= within && (!best || d < best.d)) best = { zone: z, d };
    });
    return best ? best.zone : null;
  }

  /* ---- Para persistir después (Supabase/PostGIS) ----
     Nunca guardamos la posición exacta: redondeamos a ~110 m y declaramos la precisión. */
  function toStorable() {
    if (!state.coords) return state.zone ? { lat: null, lng: null, precision_m: null, zone: state.zone } : null;
    const f = Math.pow(10, STORE_DECIMALS);
    return {
      lat: Math.round(state.coords.lat * f) / f,
      lng: Math.round(state.coords.lng * f) / f,
      precision_m: 110,
      zone: state.zone
    };
  }

  /* ---- Estado para las vistas (sin coordenadas) ---- */
  function snapshot() {
    return {
      status: state.status,
      hasCoords: Boolean(state.coords),
      accuracy: state.coords ? state.coords.accuracy : null,
      zone: state.zone,
      declined: state.declined,
      supported: supported(),
      /* 'gps' | 'zone' | 'none' */
      source: state.coords ? 'gps' : (state.zone ? 'zone' : 'none')
    };
  }

  /* Solo para capas de datos (State en demo, servicios en live). Las vistas no lo usan. */
  function coords() {
    return state.coords ? { lat: state.coords.lat, lng: state.coords.lng } : null;
  }

  restore();

  return {
    getCurrentLocation, getLocationPermission, calculateDistance, formatDistance,
    distanceTo, nearestZone, project, locate,
    setZone, getZone, decline, clear, setAnchor, setDemoOrigin, coords, toStorable, snapshot, onChange,
    SAME_BUILDING_M
  };
})();
