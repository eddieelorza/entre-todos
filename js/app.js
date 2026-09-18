/* ==========================================================================
   app.js — Arranque, rutas, acciones (data-action) y formularios (data-form)
   ========================================================================== */

const App = (() => {
  const ACCEPT_DELAY = 2600;   /* ms que tarda una persona en "decir que sí" */
  const ACCEPT_STAGGER = 1100; /* ms entre respuestas cuando son varias */
  const timers = new Map();
  let placeholderTimer = null;

  /* ---- Aceptación simulada (sobrevive un refresh) ---- */
  function scheduleAccept(connId, delay) {
    clearTimeout(timers.get(connId));
    timers.set(connId, setTimeout(() => {
      const conn = State.getConnection(connId);
      if (!conn || conn.status !== 'asked') return;
      State.updateConnection(connId, { status: 'accepted' });
      if (typeof VisualConfirm !== 'undefined') VisualConfirm.onAccepted(connId);
      const p = State.person(conn.personId);
      const path = Router.current().path;
      if (path.startsWith('/s/') || path.startsWith('/situations') || path === '/') Router.refresh();
      else UI.toast(`${p ? p.name : 'Alguien'} dijo que sí 🎉`);
    }, delay));
  }

  function resumeTimers() {
    State.connections().filter(c => c.status === 'asked').forEach((c, i) => {
      const remaining = Math.max(400, ACCEPT_DELAY + i * ACCEPT_STAGGER - (Date.now() - c.createdAt));
      scheduleAccept(c.id, remaining);
    });
  }

  /* ---- Placeholder rotativo del input principal ---- */
  function startPlaceholders() {
    stopPlaceholders();
    const input = document.getElementById('situation-input');
    if (!input || UI.reducedMotion()) return;
    let i = 0;
    placeholderTimer = setInterval(() => {
      const el = document.getElementById('situation-input');
      if (!el) return stopPlaceholders();
      if (el.value || document.activeElement === el) return;
      i = (i + 1) % State.community().placeholders.length;
      el.classList.remove('is-swapping');
      void el.offsetWidth;
      el.placeholder = State.community().placeholders[i];
      el.classList.add('is-swapping');
    }, 3200);
  }

  function stopPlaceholders() {
    clearInterval(placeholderTimer);
    placeholderTimer = null;
  }

  /* ---- Aprendizaje: qué registra el grafo al resolver ---- */
  function learnFrom(situation, conns) {
    const notes = [];
    conns.forEach(c => {
      (c.capabilityIds || []).forEach(id => {
        State.learnEvidence(id);
        const cap = State.capability(c.personId, id);
        const p = State.person(c.personId);
        if (cap && cap.evidence) notes.push(`${p.name}: ${cap.evidence.label.charAt(0).toLowerCase() + cap.evidence.label.slice(1)}.`);
      });
    });
    const u = situation.understanding;
    if (u.kind === 'opportunity' && u.place) {
      const cap = State.learnUserCapability({
        id: `eddie-route-${u.place}`, kind: 'route', label: `Suele ir a ${u.placeLabel}`, tags: [u.place], place: u.place,
        evidence: { count: 1, label: `Ayudó con un viaje a ${u.placeLabel} 1 vez`, learned: true }
      });
      notes.push(`Tú: ${cap.label.charAt(0).toLowerCase() + cap.label.slice(1)}. La próxima vez que alguien necesite algo de ahí, te avisamos.`);
    }
    if (u.kind === 'offer' && u.tags.length) {
      const cap = State.learnUserCapability({
        id: `eddie-offer-${u.tags[0]}`, kind: 'food', label: `Suele tener ${u.tags.slice(0, 2).join(' ')} para compartir`, tags: u.tags,
        evidence: { count: 1, label: 'Compartió con un vecino 1 vez', learned: true }
      });
      notes.push(`Tú: ${cap.label.charAt(0).toLowerCase() + cap.label.slice(1)}.`);
    }
    return notes;
  }

  function maybeResolveOpportunity(situationId) {
    const s = State.getSituation(situationId);
    if (!s) return;
    const conns = State.connectionsFor(s.id);
    if (conns.length && conns.every(c => c.status === 'done')) {
      const learned = learnFrom(s, conns);
      State.updateSituation(s.id, { status: 'resolved', resolvedAt: Date.now(), people: conns.map(c => c.personId), noPurchase: true, learned });
    }
  }

  /* La constelación se remonta con Router.refresh() y perdería la historia en curso; ahí no refrescamos. */
  function refreshUnlessConstellation() {
    if (typeof Constellation !== 'undefined' && Router.current().path === Constellation.ROUTE) return;
    Router.refresh();
  }

  /* ---- Acciones (data-action) ---- */
  const Actions = {
    example(ds) {
      const input = document.getElementById('situation-input');
      if (input) input.value = ds.text;
      Forms.situation(null, ds.text);
    },

    prefill(ds) {
      const input = document.getElementById('situation-input');
      if (!input) return;
      input.value = ds.text;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    },

    'toggle-need'(ds) {
      const s = State.getSituation(ds.situation);
      if (!s) return;
      const excluded = new Set(s.excluded || []);
      if (excluded.has(ds.need)) excluded.delete(ds.need); else excluded.add(ds.need);
      State.updateSituation(s.id, { excluded: Array.from(excluded) });
      Router.refresh();
      const btn = document.querySelector(`[data-action="toggle-need"][data-need="${ds.need}"]`);
      if (btn) btn.focus();
    },

    'choose-strategy'(ds) {
      State.updateSituation(ds.situation, { strategy: ds.strategy || null });
      Router.refresh();
    },

    /* Autorización: el usuario revisa un mensaje por persona antes de pedir. */
    ask(ds) {
      const s = State.getSituation(ds.situation);
      if (!s) return;
      const u = s.understanding;
      const en = u.lang === 'en';
      const { needs, solutions } = Resolver.resolve(s, State.graph());
      const sol = solutions.find(x => x.key === ds.strategy) || solutions[0];
      if (!sol) return;
      const byId = Object.fromEntries(needs.map(n => [n.id, n]));
      /* Una persona puede cubrir varias necesidades: recibe un solo mensaje con todo. */
      const grouped = [];
      sol.steps.concat(sol.extras).forEach(st => {
        const n = byId[st.needId];
        let it = grouped.find(g => g.personId === st.personId);
        if (!it) {
          it = { personId: st.personId, capabilityIds: [], needIds: [], needs: [], titles: [], optional: true };
          grouped.push(it);
        }
        it.capabilityIds.push(st.capabilityId);
        it.needIds.push(n.id);
        it.needs.push(n);
        it.titles.push(en ? (n.labelEn || n.label) : n.label);
        it.optional = it.optional && Boolean(st.optional);
      });
      const items = grouped.map(it => Object.assign(it, {
        title: it.titles.join(' · '),
        message: Resolver.buildMessage(u, it.needs, State.person(it.personId))
      }));
      Session.pendingAsk = { situationId: s.id, strategy: sol.key, items, noPurchase: !sol.gaps.length };

      /* Alcance: el usuario elige a quién puede llegar esta situación. Lo sensible parte del círculo de confianza. */
      const sensitive = Boolean(u.sensitive) || needs.some(n => n.sensitive);
      const scopes = [
        { id: 'circle', es: 'Mi círculo de confianza', en: 'My trusted circle' },
        { id: 'private', es: 'Un grupo privado', en: 'A private group' },
        { id: 'nearby', es: 'Vecinos cercanos', en: 'Nearby neighbors' },
        { id: 'community', es: 'Toda la comunidad', en: 'The whole community' }
      ];
      const defaultScope = s.scope || (sensitive ? 'circle' : (u.profile === 'garment' ? 'private' : 'nearby'));
      const scopeHtml = `
        <fieldset class="scope">
          <legend class="scope__legend">${en ? 'Who can see this?' : '¿Quién puede ver esto?'}</legend>
          <div class="scope__opts">${scopes.map(sc => `<label class="scope__opt"><input type="radio" name="scope" value="${sc.id}" ${sc.id === defaultScope ? 'checked' : ''}><span>${en ? sc.en : sc.es}</span></label>`).join('')}</div>
          ${sensitive ? `<p class="muted small">${en ? 'For something like this we only suggested people with verified identity and residence, and a previous relationship.' : 'Para algo así solo sugerimos personas con identidad y residencia verificadas, y con relación previa.'}</p>` : ''}
        </fieldset>`;

      const rows = items.map((it, i) => {
        const p = State.person(it.personId);
        return `
          <li class="ask">
            <label class="ask__head">
              <input type="checkbox" name="include" value="${i}" ${it.optional ? '' : 'checked'}>
              ${UI.avatar(p, 'sm')}
              <span class="ask__who"><strong>${UI.esc(p.name)}</strong> · ${UI.esc(it.title)}</span>
            </label>
            <label class="sr-only" for="msg-${i}">${en ? 'Message for' : 'Mensaje para'} ${UI.esc(p.name)}</label>
            <textarea id="msg-${i}" name="msg-${i}" rows="2">${UI.esc(it.message)}</textarea>
          </li>`;
      }).join('');

      const many = items.length > 1;
      UI.openDialog(`
        <form class="dialog__form" data-form="send-ask">
          <h2 id="dialog-title" class="dialog__title">${en ? (many ? 'Review before asking' : `Ask ${State.person(items[0].personId).name}?`) : (many ? 'Revisa antes de pedir' : `¿Le preguntamos a ${State.person(items[0].personId).name}?`)}</h2>
          <p class="dialog__meta">${en ? 'Each person gets their own message. Edit anything you like.' : 'Cada persona recibe su propio mensaje. Cambia lo que quieras.'}</p>
          <ul class="asks">${rows}</ul>
          ${scopeHtml}
          <p class="muted small">${en ? 'Only your name and building are shared. Never your apartment number, phone or exact address.' : 'Solo compartimos tu nombre y edificio. Nunca tu número de departamento, teléfono ni dirección exacta.'}</p>
          <div class="btn-row btn-row--end">
            <button class="btn btn--ghost" type="button" data-action="close-dialog">${en ? 'Cancel' : 'Cancelar'}</button>
            <button class="btn btn--primary" type="submit" data-autofocus>${en ? (many ? 'Send to everyone selected' : 'Send') : (many ? 'Pedir a quienes marqué' : 'Enviar')}</button>
          </div>
        </form>`);
    },

    'close-dialog'() {
      Session.pendingAsk = null;
      if (typeof VisualConfirm !== 'undefined') VisualConfirm.close();
      else UI.closeDialog();
    },

    resolve(ds) {
      const s = State.getSituation(ds.situation);
      if (!s) return;
      const conns = State.connectionsFor(s.id);
      conns.forEach(c => State.updateConnection(c.id, { status: 'done' }));
      const learned = learnFrom(s, conns);
      State.updateSituation(s.id, {
        status: 'resolved', resolvedAt: Date.now(), learned,
        people: conns.length ? conns.map(c => c.personId) : (s.people || []),
        noPurchase: s.noPurchase !== undefined ? s.noPurchase : true
      });
      Router.refresh();
      UI.toast('Resuelto entre todos.');
      /* Del pequeño favor a la red de apoyo: tras suficientes ayudas, sugerimos (nunca agregamos solos). */
      if (typeof Trust !== 'undefined') {
        const sug = Trust.suggestion();
        if (sug) setTimeout(() => UI.openDialog(`
          <div class="dialog__form">
            <h2 id="dialog-title" class="dialog__title">${UI.esc(sug.text)}</h2>
            <p class="dialog__meta">Tu círculo de confianza es privado. Sirve para lo sensible: acompañar a alguien, entrar a casa, cuidar niños.</p>
            <div class="btn-row btn-row--end">
              <button class="btn btn--ghost" type="button" data-action="dismiss-suggest" data-person="${UI.esc(sug.personId)}">Ahora no</button>
              <button class="btn btn--primary" type="button" data-action="add-circle" data-person="${UI.esc(sug.personId)}" data-circle="${UI.esc(sug.circleId)}" data-autofocus>Sí, agregar</button>
            </div>
          </div>`), 900);
      }
    },

    'add-circle'(ds) {
      const p = State.person(ds.person);
      if (!p) return;
      Trust.addToCircle(ds.circle || Trust.TRUST_CIRCLE, p.id);
      UI.closeDialog();
      refreshUnlessConstellation();
      UI.toast(`${p.name} ya forma parte de tu círculo de confianza.`);
    },

    'dismiss-suggest'(ds) {
      State.dismissSuggestion(ds.person);
      UI.closeDialog();
      refreshUnlessConstellation();
    },

    reveal(ds) {
      Session.revealed.add(ds.situation);
      Router.refresh();
    },

    help(ds) {
      const s = State.getSituation(ds.situation);
      const open = State.open(ds.person, ds.open);
      const p = State.person(ds.person);
      if (!s || !open || !p || State.connectionForOpen(open.id)) return;
      State.addConnection({
        situationId: s.id, personId: p.id, openId: open.id, kind: 'helping', status: 'accepted',
        title: open.title, message: Resolver.helpMessage(open, p)
      });
      if (s.status !== 'helping') State.updateSituation(s.id, { status: 'helping' });
      Router.refresh();
      UI.toast(`Le avisamos a ${p.name}. Ya aparece en Mis situaciones.`);
    },

    helped(ds) {
      const conn = State.getConnection(ds.conn);
      if (!conn) return;
      State.updateConnection(conn.id, { status: 'done' });
      maybeResolveOpportunity(conn.situationId);
      Router.refresh();
    },

    'notify-me'(ds) {
      State.updateSituation(ds.situation, { status: 'waiting' });
      Router.refresh();
      UI.toast('Te avisaremos cuando aparezca alguien cerca.');
    },

    /* Community Simulation Layer: el mismo producto, otra estructura social. */
    'switch-community'() {
      const current = State.community();
      const rows = State.communities().map(c => `
        <li class="community ${c.id === current.id ? 'community--current' : ''}">
          <div class="community__body">
            <h3 class="community__name">${UI.esc(c.name)} <span class="community__city">· ${UI.esc(c.city)}</span></h3>
            <p class="community__tagline">${UI.esc(c.tagline)}</p>
            <ul class="focus">${c.profile.focus.map(f => `<li class="focus__item">${UI.esc(f)}</li>`).join('')}</ul>
          </div>
          ${c.id === current.id
            ? '<span class="chip chip--ok">Estás aquí</span>'
            : `<button class="btn btn--secondary btn--sm" type="button" data-action="choose-community" data-id="${UI.esc(c.id)}">Entrar</button>`}
        </li>`).join('');
      UI.openDialog(`
        <div class="dialog__form">
          <h2 id="dialog-title" class="dialog__title">¿En qué comunidad estás?</h2>
          <p class="dialog__meta">Entre Todos entiende la estructura social de cada lugar: qué suele hacer falta y qué capacidad hay escondida.</p>
          <ul class="communities">${rows}</ul>
          <div class="btn-row btn-row--end">
            <button class="btn btn--ghost" type="button" data-action="close-dialog">Cerrar</button>
          </div>
        </div>`);
    },

    'choose-community'(ds) {
      const c = State.setCommunity(ds.id);
      timers.forEach(t => clearTimeout(t));
      timers.clear();
      if (typeof VisualConfirm !== 'undefined') VisualConfirm.clearTimers();
      Session.revealed.clear();
      Session.pendingAsk = null;
      UI.closeDialog();
      resumeTimers();
      if (typeof VisualConfirm !== 'undefined') VisualConfirm.resume();
      Router.go('/');
      Router.refresh();
      UI.toast(`Ahora estás en ${c.name}.`);
    },

    'reset-demo'() {
      if (!window.confirm(`¿Volver a empezar la demo en ${State.community().name}? Se borrarán tus situaciones y lo aprendido aquí.`)) return;
      State.reset();
      timers.forEach(t => clearTimeout(t));
      timers.clear();
      if (typeof VisualConfirm !== 'undefined') VisualConfirm.clearTimers();
      Session.revealed.clear();
      Session.pendingAsk = null;
      Router.go('/');
      UI.toast('Listo, la demo volvió a empezar.');
    }
  };

  /* ---- Formularios (data-form) ---- */
  const Forms = {
    situation(form, forcedText) {
      const input = document.getElementById('situation-input');
      const text = (forcedText !== undefined ? forcedText : (input ? input.value : '')).trim();
      if (!text) {
        if (input) {
          input.focus();
          input.classList.remove('shake');
          void input.offsetWidth;
          input.classList.add('shake');
        }
        return;
      }
      const understanding = Resolver.understandSituation(text);
      const needs = Resolver.discoverNeeds(understanding);
      const s = State.addSituation(text, understanding, needs);
      /* Una oferta o un trayecto sin nadie que lo necesite aún también enseña algo al grafo. */
      if (understanding.kind !== 'need' && !Resolver.resolve(s, State.graph()).opportunities.length) {
        State.updateSituation(s.id, { status: 'waiting', learned: learnFrom(s, []) });
      }
      Session.reveal = s.id;
      Router.go(`/s/${s.id}`);
    },

    'send-ask'(form) {
      const p = Session.pendingAsk;
      if (!p) return;
      const s = State.getSituation(p.situationId);
      const included = Array.from(form.querySelectorAll('input[name="include"]:checked')).map(i => parseInt(i.value, 10));
      if (!included.length) {
        UI.toast('Marca al menos a una persona.');
        return;
      }
      included.forEach((idx, order) => {
        const it = p.items[idx];
        const message = (form.elements[`msg-${idx}`].value || it.message).trim();
        const conn = State.addConnection({
          situationId: s.id, personId: it.personId, capabilityIds: it.capabilityIds, needIds: it.needIds,
          kind: 'request', title: it.title, message
        });
        scheduleAccept(conn.id, ACCEPT_DELAY + order * ACCEPT_STAGGER);
      });
      const scopeEl = form.querySelector('input[name="scope"]:checked');
      State.updateSituation(s.id, { status: 'asked', strategy: p.strategy, noPurchase: p.noPurchase, scope: scopeEl ? scopeEl.value : (s.scope || 'nearby') });
      Session.pendingAsk = null;
      UI.closeDialog();
      Router.refresh();
    }
  };

  /* ---- Eventos delegados ---- */
  function bindEvents() {
    document.addEventListener('click', event => {
      const el = event.target.closest('[data-action]');
      if (!el) return;
      const handler = Actions[el.dataset.action] || (typeof VisualConfirm !== 'undefined' ? VisualConfirm.actions[el.dataset.action] : null);
      if (!handler) return;
      event.preventDefault();
      handler(el.dataset, el);
    });

    document.addEventListener('submit', event => {
      const form = event.target.closest('[data-form]');
      if (!form) return;
      event.preventDefault();
      const handler = Forms[form.dataset.form] || (typeof VisualConfirm !== 'undefined' ? VisualConfirm.forms[form.dataset.form] : null);
      if (handler) handler(form);
    });

    /* Enter envía en el campo principal; Shift+Enter hace salto de línea */
    document.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && event.target.id === 'situation-input') {
        event.preventDefault();
        Forms.situation();
      }
      /* En los textareas de Visual Confirm (caption, pregunta) Enter también envía. */
      if (event.key === 'Enter' && !event.shiftKey && event.target.tagName === 'TEXTAREA' && event.target.closest('[data-form^="vc-"]')) {
        event.preventDefault();
        event.target.closest('form').requestSubmit();
      }
    });

    const dialog = document.getElementById('dialog');
    dialog.addEventListener('click', event => {
      if (event.target === dialog) Actions['close-dialog']();
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      Actions['close-dialog']();
    });

    window.addEventListener('hashchange', () => {
      if (Router.current().path !== '/') stopPlaceholders();
    });
  }

  /* ---- Rutas ---- */
  function bindRoutes() {
    Router.add(/^\/$/, () => { Views.home(); startPlaceholders(); });
    Router.add(/^\/s\/([^/]+)$/, ([id]) => Views.situation(id));
    Router.add(/^\/situations$/, () => Views.situations());
    Router.add(/^\/me$/, () => Views.profile());
    Router.add(/^\/constellation$/, (_, params) => Constellation.mount(document.getElementById('app'), params));
    if (typeof CommunityMap !== 'undefined') Router.add(/^\/map$/, (_, params) => CommunityMap.mount(document.getElementById('app'), params));
    if (typeof SimpleMode !== 'undefined') Router.add(/^\/sencillo$/, () => SimpleMode.mount(document.getElementById('app')));
  }

  function init() {
    State.load();
    resumeTimers();
    if (typeof VisualConfirm !== 'undefined') VisualConfirm.resume();
    bindRoutes();
    bindEvents();
    Router.start(document.getElementById('app'));
  }

  /* La constelación puede convertir una situación efímera en una real (mismo flujo que el Inicio). */
  function submitSituation(text) { Forms.situation(null, text); }

  return { init, submitSituation };
})();

document.addEventListener('DOMContentLoaded', App.init);
