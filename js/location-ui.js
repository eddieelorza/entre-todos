/* ==========================================================================
   location-ui.js — Banner de ubicación progresiva y sus acciones.

   Uso desde una vista:
     ${LocationUI.banner({ lang })}            encima de una lista de personas
     ${LocationUI.radiusNote({ lang, empty })} cuando el radio dejó la lista vacía

   El módulo escucha sus propios clics (data-location-action) y cambios del
   <select name="location-zone">, así que no depende de app.js. Tras cada
   cambio llama a Router.refresh() y emite `entre-todos:location`.

   Nunca pide la ubicación al cargar: el prompt del navegador solo se dispara
   desde el botón "Usar mi ubicación". Nunca muestra coordenadas.
   ========================================================================== */

const LocationUI = (() => {
  const STYLES = 'css/location.css';
  let busy = false;

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function t(lang, es, en) {
    return lang === 'en' ? en : es;
  }

  function ensureStyles() {
    if (document.querySelector(`link[href$="${STYLES}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLES;
    document.head.appendChild(link);
  }

  function zones() {
    const c = (typeof State !== 'undefined' && typeof State.community === 'function' && State.community()) || (typeof DATA !== 'undefined' && DATA.community) || {};
    return c.zones || [];
  }

  function zoneLabel(id) {
    const z = zones().find(x => x.id === id);
    return z ? z.label : '';
  }

  function isDemo() {
    return !(typeof State !== 'undefined' && typeof State.isLive === 'function' && State.isLive());
  }

  function zoneSelect(lang, selected) {
    const list = zones();
    if (!list.length) return '';
    const opts = [`<option value="" ${selected ? '' : 'selected'}>${esc(t(lang, 'Elegir mi zona…', 'Choose my area…'))}</option>`]
      .concat(list.map(z => `<option value="${esc(z.id)}" ${z.id === selected ? 'selected' : ''}>${esc(z.label)}</option>`));
    return `<label class="locbar__zone"><span class="sr-only">${esc(t(lang, 'Tu zona', 'Your area'))}</span><select name="location-zone">${opts.join('')}</select></label>`;
  }

  function useButton(lang, snap) {
    if (!snap.supported || snap.status === 'denied') return '';
    const label = busy ? t(lang, 'Buscando…', 'Locating…') : t(lang, 'Usar mi ubicación', 'Use my location');
    return `<button class="btn btn--secondary btn--sm" type="button" data-location-action="use" ${busy ? 'disabled' : ''}>${esc(label)}</button>`;
  }

  /* ---- Banner ---- */
  function banner(opts = {}) {
    if (typeof LocationService === 'undefined') return '';
    ensureStyles();
    const lang = opts.lang === 'en' ? 'en' : 'es';
    const snap = LocationService.snapshot();
    const pin = '<svg class="locbar__pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s-7-5.5-7-12a7 7 0 0 1 14 0c0 6.5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>';
    let text = '';
    let controls = '';
    let tone = 'idle';

    if (snap.source === 'gps') {
      tone = 'on';
      text = t(lang, 'Ordenado por tu ubicación aproximada.', 'Sorted by your approximate location.');
      controls = `${zoneSelect(lang, snap.zone)}<button class="link-btn locbar__link" type="button" data-location-action="forget">${esc(t(lang, 'Dejar de usar', 'Stop using'))}</button>`;
    } else if (snap.source === 'zone') {
      tone = 'on';
      text = t(lang, `Buscando desde ${zoneLabel(snap.zone)}.`, `Searching from ${zoneLabel(snap.zone)}.`);
      controls = `${zoneSelect(lang, snap.zone)}${useButton(lang, snap)}`;
    } else if (snap.status === 'denied') {
      tone = 'off';
      text = t(lang, 'No tenemos acceso a tu ubicación. Elige tu zona para acercar los resultados.', "We can't access your location. Pick your area to bring results closer.");
      controls = zoneSelect(lang, snap.zone);
    } else if (snap.status === 'unavailable') {
      tone = 'off';
      text = t(lang, 'No pudimos ubicarte ahora. Puedes elegir tu zona o intentarlo de nuevo.', "We couldn't locate you right now. Choose your area or try again.");
      controls = `${zoneSelect(lang, snap.zone)}${useButton(lang, snap)}`;
    } else if (!snap.supported) {
      tone = 'off';
      text = t(lang, 'Elige tu zona para acercar los resultados.', 'Pick your area to bring results closer.');
      controls = zoneSelect(lang, snap.zone);
    } else {
      text = t(lang, '¿Buscar más cerca? Usamos tu ubicación solo para ordenar por distancia.', 'Search closer? We use your location only to sort by distance.');
      controls = `${useButton(lang, snap)}${zoneSelect(lang, snap.zone)}`;
      if (!snap.declined) controls += `<button class="link-btn locbar__link" type="button" data-location-action="skip">${esc(t(lang, 'Ahora no', 'Not now'))}</button>`;
    }

    return `
      <div class="locbar locbar--${tone} ${opts.compact ? 'locbar--compact' : ''}" role="group" aria-label="${esc(t(lang, 'Ubicación', 'Location'))}">
        ${pin}
        <p class="locbar__text">${esc(text)} <span class="locbar__privacy">${esc(t(lang, 'Nadie ve dónde estás; solo distancias aproximadas.', 'No one sees where you are, only approximate distances.'))}</span></p>
        <div class="locbar__controls">${controls}</div>
      </div>`;
  }

  /* Nota de radio: "Dentro de 500 m · Buscar más lejos" / "Sin límite · Volver a 500 m". */
  function radiusNote(opts = {}) {
    if (typeof Matching === 'undefined') return '';
    const lang = opts.lang === 'en' ? 'en' : 'es';
    const radius = Matching.getDefaultRadius();
    const base = (typeof DATA !== 'undefined' && DATA.matching && DATA.matching.radius) || 500;
    if (radius == null) {
      return `<p class="locnote muted small">${esc(t(lang, 'Sin límite de distancia.', 'No distance limit.'))} <button class="link-btn" type="button" data-location-action="narrow">${esc(t(lang, `Volver a ${base} m`, `Back to ${base} m`))}</button></p>`;
    }
    const lead = opts.empty
      ? t(lang, `Nadie dentro de ${radius} m por ahora.`, `No one within ${radius} m right now.`)
      : t(lang, `Dentro de ${radius} m.`, `Within ${radius} m.`);
    return `<p class="locnote muted small">${esc(lead)} <button class="link-btn" type="button" data-location-action="widen">${esc(t(lang, 'Buscar más lejos', 'Search farther'))}</button></p>`;
  }

  /* ---- Acciones ---- */
  function toast(msg) {
    if (typeof UI !== 'undefined' && typeof UI.toast === 'function') UI.toast(msg);
  }

  function refresh() {
    if (typeof Router !== 'undefined' && typeof Router.refresh === 'function') Router.refresh();
    document.dispatchEvent(new CustomEvent('entre-todos:location', { detail: LocationService.snapshot() }));
  }

  function resetAnchor() {
    const c = (typeof DATA !== 'undefined' && DATA.community) || {};
    if (c.anchorFollowsUser && c.anchor) LocationService.setAnchor(c.anchor);
  }

  async function useLocation(lang) {
    if (busy) return;
    busy = true;
    refresh();
    try {
      const coords = await LocationService.getCurrentLocation({ force: true });
      const c = (typeof DATA !== 'undefined' && DATA.community) || {};
      /* Demo: la comunidad ficticia se centra en el usuario para que los vecinos queden cerca. */
      if (isDemo() && c.anchorFollowsUser) LocationService.setAnchor(coords);
      if (!LocationService.getZone()) {
        const z = LocationService.nearestZone(coords, c.zones || []);
        if (z) LocationService.setZone(z.id);
      }
      toast(t(lang, 'Listo. Ordenamos por distancia aproximada.', 'Done. Sorted by approximate distance.'));
    } catch (err) {
      if (err && err.code === 'denied') toast(t(lang, 'Sin problema. Puedes elegir tu zona.', 'No problem. You can pick your area.'));
      else toast(t(lang, 'No pudimos ubicarte. Puedes elegir tu zona.', "We couldn't locate you. You can pick your area."));
    } finally {
      busy = false;
      refresh();
    }
  }

  function langOf(el) {
    const scope = el.closest('[lang]');
    return scope && scope.getAttribute('lang') === 'en' ? 'en' : 'es';
  }

  function bind() {
    document.addEventListener('click', event => {
      const el = event.target.closest('[data-location-action]');
      if (!el) return;
      event.preventDefault();
      const lang = langOf(el);
      const action = el.dataset.locationAction;
      if (action === 'use') useLocation(lang);
      else if (action === 'skip') { LocationService.decline(); refresh(); }
      else if (action === 'forget') { LocationService.clear(); resetAnchor(); refresh(); }
      else if (action === 'widen') { Matching.setDefaultRadius(null); refresh(); }
      else if (action === 'narrow') { Matching.setDefaultRadius((typeof DATA !== 'undefined' && DATA.matching && DATA.matching.radius) || 500); refresh(); }
    });

    document.addEventListener('change', event => {
      if (event.target.name !== 'location-zone') return;
      LocationService.setZone(event.target.value || null);
      refresh();
      const sel = document.querySelector('select[name="location-zone"]');
      if (sel) sel.focus();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  return { banner, radiusNote, useLocation };
})();
