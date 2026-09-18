/* ==========================================================================
   config.example.js — Copia este archivo a js/config.js y ajusta los valores.

   mode:            "demo"  → localStorage + datos mock (sin backend)
                    "live"  → Supabase (requiere supabaseUrl y supabaseAnonKey)
   supabaseUrl:     https://<project-ref>.supabase.co
   supabaseAnonKey: la clave "anon" / "publishable" del proyecto.
                    NUNCA la service_role / secret key: db.js la rechaza.
   ========================================================================== */

window.APP_CONFIG = {
  mode: 'demo',
  supabaseUrl: '',
  supabaseAnonKey: ''
};
