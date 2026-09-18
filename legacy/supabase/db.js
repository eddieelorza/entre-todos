/* ==========================================================================
   db.js — Cliente Supabase y modo de la aplicación (demo | live).

   Único lugar que conoce el SDK. En modo demo no se descarga nada.
   El modo efectivo sale de: override en localStorage > APP_CONFIG.mode.
   Si el modo pedido es "live" pero faltan credenciales, cae a "demo".
   ========================================================================== */

const DB = (() => {
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  const OVERRIDE_KEY = 'entre-todos:mode';
  const cfg = window.APP_CONFIG || {};
  let client = null;

  function readOverride() {
    try { return localStorage.getItem(OVERRIDE_KEY); } catch (err) { return null; }
  }

  /* La anon key puede vivir en el navegador; la service_role jamás. */
  function keyIsSecret(key) {
    if (!key) return false;
    if (/^sb_secret_/i.test(key)) return true;
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.role === 'service_role';
    } catch (err) {
      return false;
    }
  }

  function configured() {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return false;
    if (keyIsSecret(cfg.supabaseAnonKey)) {
      console.error('[Entre Todos] APP_CONFIG.supabaseAnonKey es una clave secreta. Usa la anon key. Modo live desactivado.');
      return false;
    }
    return true;
  }

  function requestedMode() {
    return readOverride() || cfg.mode || 'demo';
  }

  function mode() {
    return requestedMode() === 'live' && configured() ? 'live' : 'demo';
  }

  function setMode(next) {
    try { localStorage.setItem(OVERRIDE_KEY, next); } catch (err) { /* sin storage: se queda el modo actual */ }
  }

  function loadSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar el SDK de Supabase'));
      document.head.appendChild(s);
    });
  }

  async function init() {
    if (mode() !== 'live') return null;
    await loadSdk();
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  /* Convierte la respuesta { data, error } del SDK en valor o excepción. */
  function unwrap(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  return {
    init, unwrap, mode, setMode, configured,
    isLive: () => mode() === 'live',
    client: () => client
  };
})();
