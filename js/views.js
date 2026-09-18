/* ==========================================================================
   views.js — Pantallas: Inicio · Situación · Mis situaciones · Perfil
   ========================================================================== */

/* Estado efímero de la sesión (no se persiste) */
const Session = {
  reveal: null,
  revealed: new Set(),
  pendingAsk: null
};

const Views = (() => {
  const { esc } = UI;
  const main = () => document.getElementById('app');

  /* Textos de la pantalla de situación en los dos idiomas que entiende la demo. */
  const T = {
    es: {
      back: 'Inicio', your: 'Tu situación', understood: 'Lo que entendimos', needs: 'Probablemente necesitas',
      needsHint: 'Quita lo que no haga falta y ajustamos la solución.', gaps: 'Esto sí tendrías que conseguirlo',
      extras: 'Además', otherWays: 'Ver otras formas', seeOption: 'Ver esta opción', people: 'personas', person: 'persona',
      askOne: n => `Preguntarle a ${n}`, askMany: n => `Pedir a estas ${n} personas`,
      asked: n => `Le preguntamos a ${n === 1 ? '1 persona' : `${n} personas`}.`, yes: (y, n) => `${y} de ${n} ya ${y === 1 ? 'dijo' : 'dijeron'} que sí.`,
      allYes: 'Todos dijeron que sí. Ya pueden ponerse de acuerdo en los detalles.', markResolved: 'Marcar como resuelta',
      confirmHint: 'Antes de coordinar, confirmen con una foto que es justo lo que hace falta. Cualquiera de los dos puede mandarla.',
      resolved: 'Resuelto entre todos.', resolvedWith: n => `Lo resolviste con ${n}.`, noPurchase: 'Sin comprar nada.',
      learned: 'Tu comunidad aprendió algo', mine: 'Mis situaciones', home: 'Volver al inicio',
      none: 'Todavía no encontramos cómo resolverlo con tu comunidad', noneText: 'Puede que la capacidad exista y aún no la conozcamos. Te avisamos en cuanto aparezca.',
      notify: 'Avísame cuando aparezca alguien', notified: 'Te avisaremos cuando aparezca alguien.',
      privacy: 'Solo compartimos tu nombre y edificio. Nunca tu número de departamento.',
      coverage: (c, t) => `${c} de ${t} cubiertas`,
      place: 'El lugar también ayuda', seeBuilding: 'Ver el edificio', seeSpace: 'Ver el espacio en 3D', placeCovers: 'Lo resuelve el lugar', placeHelps: 'Complementa'
    },
    en: {
      back: 'Home', your: 'Your situation', understood: 'What we understood', needs: 'You probably need',
      needsHint: 'Remove anything you don\'t need and we adjust the solution.', gaps: 'This you would still have to get',
      extras: 'Also', otherWays: 'See other ways', seeOption: 'See this option', people: 'people', person: 'person',
      askOne: n => `Ask ${n}`, askMany: n => `Ask these ${n} people`,
      asked: n => `We asked ${n === 1 ? '1 person' : `${n} people`}.`, yes: (y, n) => `${y} of ${n} already said yes.`,
      allYes: 'Everyone said yes. You can now agree on the details.', markResolved: 'Mark as resolved',
      confirmHint: 'Before coordinating, confirm with a photo that it is exactly what is needed. Either of you can send one.',
      resolved: 'Solved together.', resolvedWith: n => `You solved it with ${n}.`, noPurchase: 'Without buying anything.',
      learned: 'Your community learned something', mine: 'My situations', home: 'Back home',
      none: "We couldn't find a way with your community yet", noneText: 'The capability may exist and we just don\'t know it yet. We\'ll let you know.',
      notify: 'Let me know when someone can', notified: 'We\'ll let you know when someone can.',
      privacy: 'Only your name and building are shared. Never your apartment number.',
      coverage: (c, t) => `${c} of ${t} covered`,
      place: 'The place itself helps', seeBuilding: 'See the building', seeSpace: 'See the space in 3D', placeCovers: 'The place covers it', placeHelps: 'Complements'
    }
  };

  /* ------------------------------------------------------------------
     Inicio
     ------------------------------------------------------------------ */
  function home() {
    const c = State.community();
    const chips = c.examples.map(ex =>
      `<button class="chip-btn" type="button" data-action="example" data-text="${esc(ex.text)}">${esc(ex.label)}</button>`
    ).join('');

    const active = State.situations().filter(s => ['asked', 'helping', 'waiting'].includes(s.status)).slice(0, 2);
    const signals = Resolver.communityToday(State.graph());

    main().innerHTML = `
      <section class="hero">
        <button class="community-switch" type="button" data-action="switch-community" aria-label="Cambiar de comunidad">
          <span class="eyebrow">${esc(c.name)} · ${c.members} vecinos</span>
          <span class="community-switch__cta">Cambiar</span>
        </button>
        <h1 class="hero__title">No tienes que resolver todo solo.</h1>
        <p class="hero__sub">Cuéntanos qué necesitas resolver hoy. Lo que necesitas puede estar más cerca de lo que imaginas.</p>
        <form class="need-form" data-form="situation" novalidate>
          <label class="sr-only" for="situation-input">Cuéntanos tu situación</label>
          <textarea id="situation-input" name="situation" rows="3" placeholder="${esc(c.placeholders[0])}" autocomplete="off"></textarea>
          <div class="need-form__foot">
            <p class="need-form__hint">Cosas, tiempo, cuidado, conocimiento o compañía. También si solo vas a algún lado.</p>
            <button class="btn btn--primary" type="submit">Encontrar una solución</button>
          </div>
        </form>
        <div class="examples">
          <span class="examples__label">Prueba con:</span>
          <div class="examples__list">${chips}</div>
        </div>
      </section>

      ${active.length ? `
      <section class="today" aria-labelledby="active-title">
        <div class="today__head">
          <h2 id="active-title" class="section__title">En curso</h2>
          <a class="today__link" href="#/situations">Ver todas</a>
        </div>
        <ul class="sits">${active.map(UI.situationItem).join('')}</ul>
      </section>` : ''}

      <section class="today" aria-labelledby="today-title">
        <h2 id="today-title" class="section__title">Tu comunidad hoy</h2>
        <ul class="signals">${signals.map(UI.signalItem).join('')}</ul>
      </section>

      <a class="constellation-teaser" href="#/constellation">
        <svg class="constellation-teaser__art" viewBox="0 0 56 44" aria-hidden="true">
          <circle cx="10" cy="30" r="4" fill="#D96F4F"/><circle cx="28" cy="10" r="4.5" fill="#EFB94B"/><circle cx="46" cy="24" r="4" fill="#9DB58F"/><circle cx="30" cy="36" r="3" fill="#F7F1E6"/>
          <path d="M13.5 27.5 25 13.5M32 12.5l10.5 9M13 31.5l14 3.5M33 34l10-7.5" stroke="#EFB94B" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
        </svg>
        <span><span class="constellation-teaser__title">La solución ya estaba ahí.</span><br><span class="constellation-teaser__sub">Mira tu comunidad como una constelación y cómo se organiza alrededor de lo que necesitas.</span></span>
        <span class="constellation-teaser__go" aria-hidden="true">→</span>
      </a>`;
  }

  /* ------------------------------------------------------------------
     Situación
     ------------------------------------------------------------------ */
  function situation(id) {
    const s = State.getSituation(id);
    if (!s) {
      main().innerHTML = `
        <a class="back" href="#/">← Inicio</a>
        <h1 class="sr-only">Situación no encontrada</h1>
        ${UI.emptyState('No encontramos esta situación', 'Puede que ya no exista. Cuéntanos de nuevo qué necesitas resolver.', '<a class="btn btn--primary" href="#/">Volver al inicio</a>')}`;
      return;
    }
    const u = s.understanding;
    const t = T[u.lang] || T.es;

    main().innerHTML = `
      <a class="back" href="#/">← ${t.back}</a>
      <p class="eyebrow">${esc(t.your)}</p>
      <h1 class="page__title page__title--quote">“${esc(s.text)}”</h1>
      <div id="stage"></div>`;

    const stage = document.getElementById('stage');
    const draw = () => { stage.innerHTML = renderStage(s); };

    if (Session.reveal === id) {
      Session.reveal = null;
      const en = u.lang === 'en';
      let steps;
      if (u.kind === 'opportunity') steps = ['Entendiendo…', `Parece que vas a ${u.placeLabel}…`, 'Revisando si alguien necesita algo de ahí…'];
      else if (u.kind === 'offer') steps = ['Entendiendo…', 'Viendo si alguien cerca lo necesita…'];
      else if (en) steps = ['Understanding your situation…', 'Thinking about what you might need…', 'Looking at your community…', 'Putting a solution together…'];
      else steps = ['Entendiendo la situación…', 'Viendo qué podría hacer falta…', 'Buscando en tu comunidad…', 'Armando una solución…'];
      UI.playThinking(stage, steps, draw);
    } else {
      draw();
    }
  }

  function renderStage(s) {
    const u = s.understanding;
    if (u.kind === 'helping') return helpingStage(s);
    if (u.kind === 'opportunity' || u.kind === 'offer') return opportunityStage(s);
    return needStage(s);
  }

  function understoodCard(s, t) {
    return `
      <section class="card understood" aria-labelledby="understood-title">
        <h2 id="understood-title" class="card__label">${esc(t.understood)}</h2>
        <p class="understood__text">${esc(s.understanding.summary)}</p>
      </section>`;
  }

  /* ---- Necesidad → solución → autorización → progreso → resuelto ---- */
  function needStage(s) {
    const u = s.understanding;
    const t = T[u.lang] || T.es;
    const conns = State.connectionsFor(s.id);

    if (s.status === 'resolved') return understoodCard(s, t) + resolvedPanel(s, conns, t);
    if (conns.length) return understoodCard(s, t) + progressPanel(s, conns, t);

    const { needs, solutions } = Resolver.resolve(s, State.graph());
    const excluded = new Set(s.excluded || []);
    const needList = s.needs.length > 1 ? `
      <section class="needs" aria-labelledby="needs-title">
        <h2 id="needs-title" class="section__title">${esc(t.needs)}</h2>
        <ul class="needs__list">${s.needs.map(n => UI.needChip(n, { lang: u.lang, excluded: excluded.has(n.id), situationId: s.id })).join('')}</ul>
        <p class="muted small">${esc(t.needsHint)}</p>
      </section>` : '';

    if (!solutions.length) {
      const action = s.status === 'waiting'
        ? `<p class="empty__ok"><span class="check" aria-hidden="true">✓</span> ${esc(t.notified)}</p>`
        : `<button class="btn btn--primary" type="button" data-action="notify-me" data-situation="${esc(s.id)}">${esc(t.notify)}</button>`;
      const loc = typeof LocationUI !== 'undefined' ? LocationUI.banner({ lang: u.lang, compact: true }) + LocationUI.radiusNote({ lang: u.lang, empty: true }) : '';
      return understoodCard(s, t) + needList + loc + UI.emptyState(t.none, t.noneText, action);
    }

    const headline = Resolver.headline(solutions, u, State.person);
    let body;
    if (solutions.length > 1 && !s.strategy) {
      body = `
        <div class="strategies">
          ${solutions.map((sol, i) => strategyCard(s, sol, needs, t, i)).join('')}
        </div>`;
    } else {
      const sol = solutions.length > 1 ? (solutions.find(x => x.key === s.strategy) || solutions[0]) : solutions[0];
      body = solutionDetail(s, sol, needs, t, solutions.length > 1);
    }

    /* Banner de ubicación; si el radio está sin límite, ofrecemos volver al radio normal. */
    const loc = typeof LocationUI !== 'undefined'
      ? LocationUI.banner({ lang: u.lang, compact: true }) + (Matching.getDefaultRadius() == null ? LocationUI.radiusNote({ lang: u.lang }) : '')
      : '';
    /* Orden fijo: entendimos → necesidades → titular → solución → constelación → ubicación.
       La ubicación va al final: solo afina el orden por distancia y no debe competir con el momento wow. */
    return `
      ${understoodCard(s, t)}
      ${needList}
      <section class="solution" aria-labelledby="solution-title">
        <h2 id="solution-title" class="wow">${esc(headline)}</h2>
        ${body}
        <a class="constellation-link" href="#/constellation?s=${esc(s.id)}">${u.lang === 'en' ? 'See how your community organizes around this' : 'Ver cómo tu comunidad se organiza alrededor de esto'}</a><a class="map-link" href="#/map?s=${esc(s.id)}">${u.lang === 'en' ? 'See it on the map' : 'Verlo en el mapa'}</a>
      </section>
      ${loc}`;
  }

  function strategyCard(s, sol, needs, t, i) {
    const who = UI.names(sol.people, s.understanding.lang);
    return `
      <article class="strategy reveal" style="--i:${i}">
        <h3 class="strategy__title">${esc(sol.label)}</h3>
        ${sol.summary ? `<p class="strategy__sub">${esc(sol.summary)}</p>` : ''}
        <p class="strategy__who">${sol.people.map(id => UI.avatar(State.person(id), 'xs')).join('')} ${esc(who)}</p>
        <button class="btn btn--secondary btn--sm" type="button" data-action="choose-strategy" data-situation="${esc(s.id)}" data-strategy="${esc(sol.key)}">${esc(t.seeOption)}</button>
      </article>`;
  }

  function solutionDetail(s, sol, needs, t, multi) {
    const byId = Object.fromEntries(needs.map(n => [n.id, n]));
    const steps = sol.steps.map((st, i) => UI.stepCard(st, byId[st.needId], { lang: s.understanding.lang, index: i })).join('');
    const extras = sol.extras.length ? `
      <h3 class="section__sub">${esc(t.extras)}</h3>
      <ul class="steps">${sol.extras.map((st, i) => UI.stepCard(st, byId[st.needId], { lang: s.understanding.lang, index: sol.steps.length + i })).join('')}</ul>` : '';
    const gaps = sol.gaps.length ? `
      <h3 class="section__sub">${esc(t.gaps)}</h3>
      <ul class="gaps">${sol.gaps.map(id => UI.gapItem(byId[id], s.understanding.lang)).join('')}</ul>` : '';
    const n = sol.people.length;
    const placeSteps = sol.placeSteps || [];
    /* Place Capabilities: el lugar también ayuda (cubre lo que nadie cubrió o complementa a la persona). */
    const places = placeSteps.length ? `
      <h3 class="section__sub">${esc(t.place)}</h3>
      <ul class="places">${placeSteps.map((p, i) => placeCard(p, byId[p.needId], s, t, i)).join('')}</ul>` : '';
    const firstPlace = placeSteps.find(p => p.covers) || placeSteps[0];
    const cta = n === 0
      ? `<a class="btn btn--primary" href="#/twin?b=${esc(firstPlace ? firstPlace.placeId : '')}&s=${esc(s.id)}">${esc(t.seeSpace)}</a>`
      : `<button class="btn btn--primary" type="button" data-action="ask" data-situation="${esc(s.id)}" data-strategy="${esc(sol.key)}">${esc(n === 1 ? t.askOne(State.person(sol.people[0]).name) : t.askMany(n))}</button>`;
    return `
      ${multi ? `<p class="solution__strategy"><strong>${esc(sol.label)}</strong> · <button class="linkish" type="button" data-action="choose-strategy" data-situation="${esc(s.id)}" data-strategy="">${esc(t.otherWays)}</button></p>` : ''}
      <ul class="steps">${steps}</ul>
      ${extras}
      ${places}
      ${gaps}
      <div class="solution__cta">
        ${cta}
        <p class="muted small">${esc(t.privacy)}</p>
      </div>`;
  }

  function placeCard(p, needItem, s, t, i) {
    const en = s.understanding.lang === 'en';
    const label = needItem ? (en ? (needItem.labelEn || needItem.label) : needItem.label) : '';
    return `
      <li class="place reveal ${p.covers ? 'place--covers' : ''}" style="--i:${i}">
        <span class="place__icon" aria-hidden="true">${p.icon}</span>
        <div class="step__body">
          <p class="step__need">${esc(label)} <span class="chip ${p.covers ? 'chip--ok' : 'chip--done'}">${esc(p.covers ? t.placeCovers : t.placeHelps)}</span></p>
          <h3 class="step__name">${esc(p.label)} <span class="step__meta">· ${esc(p.buildingLabel)}</span></h3>
          <p class="step__because">${esc(p.because)}</p>
          <a class="place__link" href="#/twin?b=${esc(p.placeId)}&s=${esc(s.id)}">${esc(t.seeBuilding)} →</a>
        </div>
      </li>`;
  }

  function progressPanel(s, conns, t) {
    const yes = conns.filter(c => c.status !== 'asked').length;
    const all = yes === conns.length;
    const lang = s.understanding.lang;
    const vc = c => (typeof VisualConfirm !== 'undefined' ? VisualConfirm.block(c, lang) : '');
    return `
      <section class="progress" aria-live="polite">
        <h2 class="wow">${esc(all ? t.allYes : (yes ? t.yes(yes, conns.length) : t.asked(conns.length)))}</h2>
        ${yes ? `<p class="muted small progress__hint">${esc(t.confirmHint)}</p>` : ''}
        <ul class="conns">${conns.map(c => UI.connectionRow(c, lang, vc(c))).join('')}</ul>
        ${all ? `<button class="btn btn--primary" type="button" data-action="resolve" data-situation="${esc(s.id)}">${esc(t.markResolved)}</button>` : ''}
      </section>`;
  }

  function resolvedPanel(s, conns, t) {
    const people = conns.map(c => c.personId);
    const learned = (s.learned || []).map(l => `<li><span class="check" aria-hidden="true">✓</span> ${esc(l)}</li>`).join('');
    return `
      <section class="status status--done" aria-live="polite">
        ${UI.successCheck()}
        <div class="status__body">
          <h2 class="status__title">${esc(t.resolved)}</h2>
          <p class="status__text">${esc(people.length ? t.resolvedWith(UI.names(people, s.understanding.lang)) : '')} ${s.noPurchase ? esc(t.noPurchase) : ''}</p>
          ${learned ? `<h3 class="section__sub">${esc(t.learned)}</h3><ul class="learned">${learned}</ul>` : ''}
          <div class="btn-row">
            <a class="btn btn--secondary" href="#/situations">${esc(t.mine)}</a>
            <a class="btn btn--ghost" href="#/">${esc(t.home)}</a>
          </div>
        </div>
      </section>`;
  }

  /* ---- Oportunidad: "puedes ayudar aprovechando algo que ya vas a hacer" ---- */
  function opportunityStage(s) {
    const u = s.understanding;
    const t = T.es;
    const { opportunities } = Resolver.resolve(s, State.graph());
    const revealed = Session.revealed.has(s.id) || opportunities.some(o => State.connectionForOpen(o.openId)) || s.status === 'resolved';

    if (s.status === 'resolved') {
      const conns = State.connectionsFor(s.id);
      return understoodCard(s, t) + resolvedPanel(s, conns, t);
    }

    if (!opportunities.length) {
      return `
        ${understoodCard(s, t)}
        <section class="card opportunity">
          <h2 class="wow">Por ahora nadie cerca necesita esto.</h2>
          <p class="muted">Lo recordamos: ${u.kind === 'opportunity' ? `la próxima vez que alguien necesite algo de ${esc(u.placeLabel)}, te avisamos.` : 'si alguien lo necesita pronto, te avisamos.'}</p>
          ${(s.learned || []).length ? `<h3 class="section__sub">${esc(t.learned)}</h3><ul class="learned">${s.learned.map(l => `<li><span class="check" aria-hidden="true">✓</span> ${esc(l)}</li>`).join('')}</ul>` : ''}
          <a class="btn btn--secondary" href="#/">Volver al inicio</a>
        </section>`;
    }

    const n = opportunities.length;
    const headline = u.kind === 'opportunity'
      ? `Puedes ayudar a ${n} ${n === 1 ? 'vecino' : 'vecinos'} con un viaje que ya vas a hacer.`
      : `${n} ${n === 1 ? 'persona cerca necesita' : 'personas cerca necesitan'} justo esto.`;

    const list = opportunities.map((o, i) => {
      const p = State.person(o.personId);
      const conn = State.connectionForOpen(o.openId);
      let cta;
      if (!conn) cta = `<button class="btn btn--primary btn--sm" type="button" data-action="help" data-situation="${esc(s.id)}" data-open="${esc(o.openId)}" data-person="${esc(p.id)}">Avisar a ${esc(p.name)}</button>`;
      else if (conn.status === 'done') cta = '<span class="chip chip--done">Listo ✓</span>';
      else cta = `<div class="btn-row btn-row--tight"><span class="chip chip--ok">Le avisamos ✓</span><button class="btn btn--secondary btn--sm" type="button" data-action="helped" data-conn="${esc(conn.id)}">Ya se lo entregué</button></div>${typeof VisualConfirm !== 'undefined' ? VisualConfirm.block(conn, 'es') : ''}`;
      return `
        <li class="step reveal" style="--i:${i}">
          ${UI.avatar(p, 'lg')}
          <div class="step__body">
            <p class="step__need">${esc(o.title)}</p>
            <h3 class="step__name">${esc(p.name)} <span class="step__meta">· ${esc(UI.placeLine(p))}</span></h3>
            <p class="step__because">${esc(o.text)}</p>
            <div class="step__cta">${cta}</div>
          </div>
        </li>`;
    }).join('');

    return `
      ${understoodCard(s, t)}
      <section class="solution opportunity" aria-labelledby="opp-title">
        <h2 id="opp-title" class="wow">${esc(headline)}</h2>
        ${revealed
          ? `<ul class="steps">${list}</ul><p class="muted small">Cuando avisas, la otra persona recibe tu mensaje y ustedes acuerdan los detalles.</p>`
          : `<button class="btn btn--primary" type="button" data-action="reveal" data-situation="${esc(s.id)}">Ver si puedo ayudar</button>`}
      </section>`;
  }

  /* ---- Situaciones semilla donde el usuario ayuda a alguien ---- */
  function helpingStage(s) {
    const t = T.es;
    const who = UI.names(s.people || [], 'es');
    if (s.status === 'resolved') return resolvedPanel(s, [], t);
    return `
      <section class="card">
        <h2 class="wow">Estás ayudando a ${esc(who)}.</h2>
        <p class="muted">${esc(s.when || '')}</p>
        <button class="btn btn--primary" type="button" data-action="resolve" data-situation="${esc(s.id)}">Ya ayudé</button>
      </section>`;
  }

  /* ------------------------------------------------------------------
     Mis situaciones
     ------------------------------------------------------------------ */
  function situations() {
    const all = State.situations().sort((a, b) => b.createdAt - a.createdAt);
    const active = all.filter(s => s.status !== 'resolved');
    const done = all.filter(s => s.status === 'resolved').sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0));

    main().innerHTML = `
      <h1 class="page__title">Mis situaciones</h1>
      <p class="page__sub">Lo que estás resolviendo, en lo que estás ayudando y lo que ya se resolvió.</p>
      <h2 class="section__title">En curso</h2>
      ${active.length ? `<ul class="sits">${active.map(UI.situationItem).join('')}</ul>` : UI.emptyState('Nada en curso', 'Cuando cuentes una situación, aparecerá aquí.', '<a class="btn btn--primary" href="#/">Contar una situación</a>')}
      <h2 class="section__title">Resueltas</h2>
      ${done.length ? `<ul class="sits">${done.map(UI.situationItem).join('')}</ul>` : '<p class="muted">Aún no hay situaciones resueltas.</p>'}`;
  }

  /* ------------------------------------------------------------------
     Perfil
     ------------------------------------------------------------------ */
  function profile() {
    const u = State.user();
    const st = State.stats();
    const cs = State.communityStats();
    const caps = u.capabilities.map(c => `
      <li class="known">
        <span class="known__label">${esc(c.label)}</span>
        ${c.evidence ? `<span class="known__evidence">${esc(c.evidence.label)}${c.evidence.learned ? ' · aprendido hace poco' : ''}</span>` : ''}
      </li>`).join('');
    const trust = (typeof Verification !== 'undefined'
      ? Verification.labels(u, 'es', { completed: st.resolved }).concat(['Todo lo que pediste prestado fue devuelto'])
      : ['Residente verificado', `${st.resolved} conexiones completadas`, 'Todo lo que pediste prestado fue devuelto', `Miembro desde ${u.memberSince}`]
    ).map(x => `<li><span class="check" aria-hidden="true">✓</span> ${esc(x)}</li>`).join('');
    const network = typeof Trust !== 'undefined' ? networkSection() : '';

    main().innerHTML = `
      <section class="profile">
        ${UI.avatar(u, 'xl')}
        <h1 class="page__title">${esc(u.name)}</h1>
        <p class="page__sub">${esc(State.community().name)} · ${esc(u.place)}</p>
      </section>
      <ul class="stats" aria-label="Tu participación">
        <li><strong>${st.resolved}</strong><span>situaciones resueltas</span></li>
        <li><strong>${st.helped}</strong><span>veces ayudaste</span></li>
        <li><strong>${st.people}</strong><span>personas con las que resolviste</span></li>
      </ul>
      <section class="card" aria-labelledby="known-title">
        <h2 id="known-title" class="card__title">Lo que tu comunidad sabe de ti</h2>
        <p class="muted small">Esto no lo publicaste: se aprende de las situaciones que resuelves. Así alguien cerca puede encontrarte sin que tengas que anunciarte.</p>
        <ul class="knowns">${caps || '<li class="muted">Todavía nada. Resuelve o ayuda en una situación y aparecerá aquí.</li>'}</ul>
      </section>
      ${network}
      <section class="card" aria-labelledby="trust-title">
        <h2 id="trust-title" class="card__title">Señales de confianza</h2>
        <ul class="trust">${trust}</ul>
        <p class="muted small">Sin estrellas ni puntos. Lo que otros ven de ti es lo que ya pasó: identidad y residencia verificadas, y las veces que se han ayudado.</p>
      </section>
      <section class="card" aria-labelledby="community-title">
        <h2 id="community-title" class="card__title">Cómo es ${esc(State.community().name)}</h2>
        <p class="muted small">${esc(State.community().profile.description)}</p>
        <ul class="focus">${State.community().profile.focus.map(f => `<li class="focus__item">${esc(f)}</li>`).join('')}</ul>
        <button class="btn btn--ghost btn--sm" type="button" data-action="switch-community">Cambiar de comunidad</button>
      </section>
      <section class="impact" aria-labelledby="impact-title">
        <h2 id="impact-title" class="impact__title">Este mes en ${esc(State.community().name)}</h2>
        <ul class="impact__grid">
          <li class="impact__item"><strong>${cs.resolved}</strong><span>situaciones resueltas</span></li>
          <li class="impact__item"><strong>${cs.people}</strong><span>personas participaron</span></li>
          <li class="impact__item"><strong>${cs.noPurchase}</strong><span>resueltas sin comprar nada</span></li>
        </ul>
      </section>
      <div class="profile__foot">
        <button class="btn btn--ghost btn--sm" type="button" data-action="reset-demo">Restablecer datos de demo</button>
      </div>`;
  }

  /* ---- Tu red: círculos explícitos + emergentes, y la sugerencia de confianza ---- */
  function networkSection() {
    const sug = Trust.suggestion();
    const frequent = Trust.frequent();
    const reachable = Trust.reachable();
    const circles = Trust.circles().filter(c => c.members.length || c.id === Trust.TRUST_CIRCLE);
    const chip = id => { const p = State.person(id); return p ? `<li class="net__person">${UI.avatar(p, 'xs')} ${esc(p.name)}</li>` : ''; };
    const stageLine = id => {
      const st = Trust.stage(id);
      const p = State.person(id);
      const sig = Trust.signals(id, 'es', { max: 1 })[0] || '';
      return `<li class="net__row net__row--${st}">${UI.avatar(p, 'sm')}<span class="net__body"><strong>${esc(p.name)}</strong><span class="net__sig">${esc(sig)}</span></span></li>`;
    };
    const related = State.graph().people.map(p => p.id).filter(id => Trust.relationWith(id)).sort((a, b) => Trust.strength(b) - Trust.strength(a));
    return `
      <section class="card net" aria-labelledby="net-title">
        <h2 id="net-title" class="card__title">Tu red</h2>
        <p class="muted small">Entre Todos no empieza con una red social: te ayuda a construirla. Cada favor pequeño que sale bien acerca a alguien.</p>
        ${sug ? `
        <div class="net__suggest" role="status">
          <p>${esc(sug.text)}</p>
          <div class="btn-row btn-row--tight">
            <button class="btn btn--primary btn--sm" type="button" data-action="add-circle" data-person="${esc(sug.personId)}" data-circle="${esc(sug.circleId)}">Sí, agregar</button>
            <button class="btn btn--ghost btn--sm" type="button" data-action="dismiss-suggest" data-person="${esc(sug.personId)}">Ahora no</button>
          </div>
        </div>` : ''}
        ${related.length ? `<h3 class="section__sub">Con quienes ya te has ayudado</h3><ul class="net__list">${related.map(stageLine).join('')}</ul>` : '<p class="muted small">Todavía no te has ayudado con nadie. Resuelve algo pequeño, como recibir un paquete, y aquí empezará tu red.</p>'}
        ${reachable.length ? `<h3 class="section__sub">A quienes podrías llegar a través de alguien de confianza</h3><ul class="net__people">${reachable.map(chip).join('')}</ul>` : ''}
        <h3 class="section__sub">Tus círculos</h3>
        <ul class="circles">
          ${frequent.length ? `<li class="circle circle--emergent"><span class="circle__name">Tu red frecuente</span><ul class="net__people">${frequent.map(chip).join('')}</ul><span class="circle__meta">Se formó sola, con el tiempo.</span></li>` : ''}
          ${circles.map(c => `<li class="circle ${c.sensitive ? 'circle--sensitive' : ''}"><span class="circle__name">${esc(c.label)}${c.private ? ' <span class="chip chip--done">Privado</span>' : ''}</span>${c.members.length ? `<ul class="net__people">${c.members.slice(0, 6).map(chip).join('')}${c.members.length > 6 ? `<li class="net__more">y ${c.members.length - 6} más</li>` : ''}</ul>` : '<span class="circle__meta">Aún nadie. Se agrega solo cuando tú lo decides.</span>'}</li>`).join('')}
        </ul>
        <p class="muted small">La situación decide qué círculos importan: una hielera busca cerca; un vestido busca en tus amigas; acompañar a tu mamá busca en tu círculo de confianza.</p>
        <a class="btn btn--ghost btn--sm" href="#/sencillo">Ver la versión sencilla</a>
      </section>`;
  }

  return { home, situation, situations, profile, networkSection };
})();
