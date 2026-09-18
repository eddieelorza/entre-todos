/* ==========================================================================
   ui.js — Componentes de interfaz, utilidades de texto, diálogo y toast
   ========================================================================== */

const UI = (() => {
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function reducedMotion() {
    return REDUCED.matches;
  }

  /* Distancia aproximada (GPS, zona elegida o semilla). Nunca coordenadas. */
  function locationLabel(p, lang) {
    if (typeof Matching !== 'undefined') {
      const label = Matching.distanceLabelFor(p, { lang });
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    return p.distance === 0 ? 'Mismo edificio' : `${p.distance} m`;
  }

  function placeLine(p, lang) {
    return [p.place, locationLabel(p, lang)].filter(Boolean).join(' · ');
  }

  function timeAgo(ts) {
    const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
    if (days <= 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    return `Hace ${days} días`;
  }

  function names(ids, lang) {
    const list = ids.map(id => (State.person(id) || {}).name).filter(Boolean);
    if (list.length <= 1) return list.join('');
    return `${list.slice(0, -1).join(', ')} ${lang === 'en' ? 'and' : 'y'} ${list[list.length - 1]}`;
  }

  /* ---- Componentes básicos ---- */
  function avatar(p, size = 'md') {
    return `<span class="avatar avatar--${size} tone-${p.tone || 3}" aria-hidden="true">${esc(p.initials)}</span>`;
  }

  /* Señales de confianza basadas en comportamiento. Nunca estrellas ni puntos. */
  /* Señales de confianza basadas en comportamiento. Nunca estrellas ni puntos.
     Primero la relación con esta persona (Trust), luego la verificación (Verification). */
  function trustLine(p, lang, extra, opts = {}) {
    const en = lang === 'en';
    const parts = [];
    if (extra === 'declared') parts.push(en ? 'Availability confirmed' : 'Disponibilidad confirmada');
    const rel = typeof Trust !== 'undefined' && p.id ? Trust.signals(p.id, lang, { context: opts.context, max: 1 }) : [];
    if (typeof Verification !== 'undefined') {
      const v = Verification.labels(p, lang, { short: true });
      parts.push(...v);
      if (!rel.length && p.completed) parts.push(en ? `${p.completed} interactions completed` : `${p.completed} interacciones completadas`);
    } else {
      if (p.verified) parts.push(en ? 'Verified resident' : 'Residente verificado');
      if (p.completed) parts.push(en ? `${p.completed} connections completed` : `${p.completed} conexiones completadas`);
    }
    if (p.allReturned && !rel.length) parts.push(en ? 'Everything returned' : 'Todo devuelto');
    const relHtml = rel.length ? `<p class="trust-line trust-line--rel"><span class="trust-line__heart" aria-hidden="true">◌</span> ${esc(rel[0])}</p>` : '';
    return `${relHtml}<p class="trust-line"><span class="check" aria-hidden="true">✓</span> ${esc(parts.join(' · '))}</p>`;
  }

  const STATUS = {
    asked: { label: 'Esperando respuesta', labelEn: 'Waiting', tone: 'wait' },
    accepted: { label: 'Dijo que sí', labelEn: 'Said yes', tone: 'ok' },
    done: { label: 'Listo', labelEn: 'Done', tone: 'done' }
  };

  function statusChip(status, lang) {
    const s = STATUS[status] || { label: status, tone: 'wait' };
    return `<span class="chip chip--${s.tone}">${esc(lang === 'en' ? (s.labelEn || s.label) : s.label)}</span>`;
  }

  /* ---- Situación: necesidades detectadas ---- */
  function needChip(needItem, opts) {
    const en = opts.lang === 'en';
    const label = en ? (needItem.labelEn || needItem.label) : needItem.label;
    const excluded = opts.excluded;
    if (opts.locked) {
      return `<li class="need ${excluded ? 'need--off' : ''}"><span class="need__label">${esc(label)}</span></li>`;
    }
    return `
      <li class="need ${excluded ? 'need--off' : ''}">
        <button class="need__toggle" type="button" data-action="toggle-need" data-situation="${esc(opts.situationId)}" data-need="${esc(needItem.id)}"
          aria-pressed="${!excluded}" title="${esc(needItem.why ? (en ? (needItem.whyEn || needItem.why) : needItem.why) : '')}">
          <span class="need__box" aria-hidden="true">${excluded ? '' : '✓'}</span>
          <span class="need__label">${esc(label)}</span>
        </button>
      </li>`;
  }

  /* ---- Situación: un paso de la solución (persona + necesidad + por qué) ---- */
  function stepCard(step, needItem, opts) {
    const p = State.person(step.personId);
    const en = opts.lang === 'en';
    const label = en ? (needItem.labelEn || needItem.label) : needItem.label;
    const alt = step.alternatives && step.alternatives.length
      ? `<p class="step__alt">${en ? 'If not' : 'Si no puede'}: ${esc(names(step.alternatives, opts.lang))}</p>` : '';
    return `
      <li class="step reveal" style="--i:${opts.index || 0}">
        ${avatar(p, 'lg')}
        <div class="step__body">
          <p class="step__need">${esc(label)}</p>
          <h3 class="step__name">${esc(p.name)} <span class="step__meta">· ${esc(placeLine(p, opts.lang))}</span></h3>
          <p class="step__because">${esc(step.because)}</p>
          ${trustLine(p, opts.lang, step.slotSource)}
          ${alt}
        </div>
      </li>`;
  }

  function gapItem(needItem, lang) {
    const en = lang === 'en';
    return `<li class="gap"><span aria-hidden="true">🛒</span> ${esc(en ? (needItem.labelEn || needItem.label) : needItem.label)}</li>`;
  }

  /* ---- Situación: progreso de las conexiones ---- */
  function connectionRow(conn, lang) {
    const p = State.person(conn.personId);
    return `
      <li class="conn">
        ${avatar(p, 'md')}
        <div class="conn__body">
          <p class="conn__name">${esc(p.name)}</p>
          <p class="conn__what">${esc(conn.title)}</p>
        </div>
        ${conn.status === 'asked' ? '<span class="pulse" aria-hidden="true"></span>' : ''}
        ${statusChip(conn.status, lang)}
      </li>`;
  }

  /* ---- Lista de situaciones ---- */
  function situationItem(s) {
    const u = s.understanding;
    const conns = State.connectionsFor(s.id);
    const people = s.people && s.people.length ? s.people : conns.map(c => c.personId);
    const who = people.length ? names(people.slice(0, 3), 'es') : '';
    let status;
    if (s.status === 'resolved') status = '<span class="chip chip--done">Resuelta</span>';
    else if (s.status === 'helping') status = '<span class="chip chip--ok">Estás ayudando</span>';
    else if (s.status === 'asked') {
      const yes = conns.filter(c => c.status !== 'asked').length;
      status = `<span class="chip chip--wait">${yes} de ${conns.length} ${yes === 1 ? 'dijo' : 'dijeron'} que sí</span>`;
    } else if (s.status === 'waiting') status = '<span class="chip chip--wait">Te avisaremos</span>';
    else status = '<span class="chip chip--wait">Sin pedir</span>';
    const helping = u.kind === 'helping' || u.kind === 'opportunity';
    return `
      <li class="sit">
        <a class="sit__link" href="#/s/${esc(s.id)}">
          <span class="sit__icon" aria-hidden="true">${esc(u.icon || '🤝')}</span>
          <span class="sit__body">
            <span class="sit__title">${esc(u.title || s.text)}</span>
            <span class="sit__meta">${who ? `${helping ? 'Ayudas a' : 'Con'} ${esc(who)} · ` : ''}${esc(s.when || timeAgo(s.createdAt))}</span>
          </span>
          ${status}
        </a>
      </li>`;
  }

  /* ---- Inicio: señales de "Tu comunidad hoy" ---- */
  function signalItem(sig) {
    const inner = `
      <span class="signal__icon" aria-hidden="true">${sig.icon}</span>
      <span class="signal__body">
        <span class="signal__text">${esc(sig.text)}</span>
        ${sig.sub ? `<span class="signal__sub">${esc(sig.sub)}</span>` : ''}
      </span>`;
    if (sig.prompt) {
      return `<li class="signal"><button class="signal__btn" type="button" data-action="prefill" data-text="${esc(sig.prompt)}">${inner}</button></li>`;
    }
    return `<li class="signal"><span class="signal__btn signal__btn--static">${inner}</span></li>`;
  }

  function emptyState(title, text, actionHtml = '') {
    return `
      <div class="empty">
        <svg class="empty__art" viewBox="0 0 96 64" aria-hidden="true">
          <circle cx="24" cy="30" r="9" fill="#586D53"/><path d="M8 62c0-12 7-20 16-20s16 8 16 20" fill="#586D53"/>
          <circle cx="72" cy="30" r="9" fill="#C55E3E"/><path d="M56 62c0-12 7-20 16-20s16 8 16 20" fill="#C55E3E"/>
          <path d="M40 16h16" stroke="#EFB94B" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 6"/>
        </svg>
        <h2 class="empty__title">${esc(title)}</h2>
        <p class="empty__text">${esc(text)}</p>
        ${actionHtml}
      </div>`;
  }

  function successCheck() {
    return `
      <svg class="success" viewBox="0 0 64 64" aria-hidden="true">
        <circle class="success__circle" cx="32" cy="32" r="28"/>
        <path class="success__check" d="M20 33l8 8 16-17"/>
      </svg>`;
  }

  /* ---- Toast ---- */
  let toastTimer = null;
  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2800);
  }

  /* ---- Diálogo ---- */
  function openDialog(html, opts = {}) {
    const dialog = document.getElementById('dialog');
    dialog.innerHTML = html;
    dialog.setAttribute('aria-labelledby', opts.labelledBy || 'dialog-title');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const focusTarget = dialog.querySelector('[data-autofocus]') || dialog.querySelector('button');
    if (focusTarget) focusTarget.focus();
    return dialog;
  }

  function closeDialog() {
    const dialog = document.getElementById('dialog');
    if (dialog.open) dialog.close();
    dialog.innerHTML = '';
  }

  /* ---- Secuencia "Entendiendo…" ---- */
  function playThinking(container, steps, onDone) {
    const stepTime = reducedMotion() ? 350 : 900;
    container.innerHTML = `
      <div class="thinking" role="status" aria-live="polite">
        <span class="thinking__dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <p class="thinking__text">${esc(steps[0])}</p>
      </div>`;
    const text = container.querySelector('.thinking__text');
    let i = 1;
    const timer = setInterval(() => {
      if (i < steps.length) {
        text.classList.remove('thinking__text--in');
        void text.offsetWidth;
        text.textContent = steps[i];
        text.classList.add('thinking__text--in');
        i += 1;
      } else {
        clearInterval(timer);
        onDone();
      }
    }, stepTime);
    return () => clearInterval(timer);
  }

  return {
    esc, reducedMotion, locationLabel, placeLine, timeAgo, names,
    avatar, trustLine, statusChip, needChip, stepCard, gapItem, connectionRow, situationItem, signalItem,
    emptyState, successCheck, toast, openDialog, closeDialog, playThinking
  };
})();
