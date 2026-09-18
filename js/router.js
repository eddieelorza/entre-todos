/* ==========================================================================
   router.js — Enrutador por hash. Cada ruta renderiza una vista en <main>.
   ========================================================================== */

const Router = (() => {
  const routes = [];
  let main = null;
  let firstRender = true;
  let guardFn = null;

  function add(pattern, handler) {
    routes.push({ pattern, handler });
  }

  function current() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, query = ''] = hash.split('?');
    const params = {};
    query.split('&').filter(Boolean).forEach(pair => {
      const [k, v = ''] = pair.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    });
    return { path, params };
  }

  function go(path) {
    if (location.hash === `#${path}`) {
      render();
    } else {
      location.hash = path;
    }
  }

  /* guard(path) devuelve una ruta a la que redirigir, o null para continuar. */
  function guard(fn) {
    guardFn = fn;
  }

  function render(opts) {
    const focus = !(opts && opts.focus === false);
    const { path, params } = current();
    const redirect = guardFn ? guardFn(path) : null;
    if (redirect && redirect !== path) {
      location.hash = redirect;
      return;
    }
    let handled = false;
    for (const route of routes) {
      const match = path.match(route.pattern);
      if (match) {
        route.handler(match.slice(1), params);
        handled = true;
        break;
      }
    }
    if (!handled) {
      location.hash = '/';
      return;
    }
    updateNav(path);
    window.scrollTo(0, 0);
    if (!firstRender && focus) {
      const heading = main.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
    firstRender = false;
  }

  function updateNav(path) {
    document.querySelectorAll('[data-nav]').forEach(link => {
      const base = link.getAttribute('data-nav');
      const active = base === '/' ? (path === '/' || path.startsWith('/s/')) : path.startsWith(base);
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function start(mainEl) {
    main = mainEl;
    window.addEventListener('hashchange', () => render());
    render();
  }

  function refresh() {
    render({ focus: false });
  }

  return { add, guard, go, render, refresh, current, start };
})();
