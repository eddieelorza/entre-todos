/* ==========================================================================
   auth-service.js — Sesión con Supabase Auth (email + magic link).
   En modo demo no hay sesión: Auth.current() devuelve null.
   ========================================================================== */

const Auth = (() => {
  let user = null;

  async function init() {
    const sb = DB.client();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    user = data.session ? data.session.user : null;
    sb.auth.onAuthStateChange((event, session) => {
      const next = session ? session.user : null;
      const changed = (next && next.id) !== (user && user.id);
      user = next;
      /* Entró o salió en otra pestaña, o llegó el magic link: recargamos para reconstruir el estado. */
      if (changed && (event === 'SIGNED_IN' || event === 'SIGNED_OUT')) location.reload();
    });
    return user;
  }

  function current() {
    return user;
  }

  async function sendMagicLink(email) {
    const redirect = `${location.origin}${location.pathname}`;
    DB.unwrap(await DB.client().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect, shouldCreateUser: true }
    }));
  }

  async function signOut() {
    await DB.client().auth.signOut();
    user = null;
  }

  return { init, current, sendMagicLink, signOut };
})();
