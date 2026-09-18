/* ==========================================================================
   visual-confirm.js — Visual Confirm: una foto para confirmar antes de coordinar.

   La cámara en Entre Todos NO reconoce objetos ni analiza nada. Sirve para
   una cosa: cuando dos personas ya se están considerando para una ayuda o un
   intercambio, cualquiera de las dos toma (o elige) una foto del objeto y la
   otra confirma que es lo que necesita antes de ponerse de acuerdo.

     Situación → solución/persona → solicitud → alguien comparte una foto
     → la otra persona la revisa → aceptar / preguntar / rechazar → coordinar entrega

   Las fotos viven dentro de la conexión (State.addPhoto / updatePhoto), se
   reducen a 720 px y solo se guardan en este dispositivo (localStorage).
   La otra persona es simulada, igual que la aceptación en app.js: manda una
   foto de demo, revisa la tuya y acuerda la entrega a los pocos segundos.

   API:
     block(conn, lang)          bloque inline para una conexión (pantalla de situación)
     open({ conn })             diálogo: tomar foto · elegir de galería · preview · enviar
     onAccepted(connId)         la otra persona dijo que sí → puede mandar su foto
     resume()                   reanuda simulaciones tras un refresh
     pendingReview(situationId) nº de fotos por revisar (chips de listas)
     actions / forms            handlers data-action="vc-*" y data-form="vc-*"
   ========================================================================== */

const VisualConfirm = (() => {
  const INCOMING_DELAY = 3600;  /* ms tras "dijo que sí" para que la otra persona mande su foto */
  const REQUEST_DELAY = 1600;   /* ms tras "pedirle una foto" */
  const REVIEW_DELAY = 3200;    /* ms que tarda en revisar la tuya */
  const ANSWER_DELAY = 2600;    /* ms que tarda en contestar una pregunta */
  const AGREE_DELAY = 2200;     /* ms que tarda en aceptar la entrega */
  const MAX_SIDE = 720;
  const timers = new Map();
  let stream = null;
  let draft = null;             /* { connId, image } mientras el diálogo está abierto */

  const { esc } = UI;

  /* ------------------------------------------------------------------
     Textos
     ------------------------------------------------------------------ */
  const T = {
    es: {
      title: 'Confirma con una foto',
      metaTo: n => `Para que ${n} vea exactamente de qué hablas antes de ponerse de acuerdo.`,
      takePhoto: 'Tomar una foto', takeSub: 'Con la cámara de este dispositivo',
      pickPhoto: 'Elegir de la galería', pickSub: 'Una foto que ya tengas',
      opening: 'Abriendo la cámara…', capture: 'Capturar', cancel: 'Cancelar', retake: 'Otra foto',
      noCamera: 'No pudimos abrir la cámara aquí.', useNative: 'Tomar la foto con el teléfono',
      captionLabel: '¿Qué quieres preguntar o decir?',
      captionRequest: what => (what ? `Busco algo así (${what}). ¿Se parece a lo que tienes?` : 'Te mando una foto para que veas de qué hablo. ¿Te sirve?'),
      captionHelping: what => (what ? `Tengo ${what}, ¿te sirve?` : 'Es esto, ¿te sirve?'),
      sendTo: n => `Enviar a ${n}`,
      sent: n => `Foto enviada a ${n}. Te avisamos cuando la revise.`,
      privacy: 'La foto solo la ve la persona a la que se la mandas. No se publica, no se analiza y no sale de este dispositivo en la demo.',
      you: 'Tú', reviewing: n => `${n} está revisando tu foto…`,
      promptRequest: n => `¿Es lo que necesitas? Confírmalo con una foto antes de coordinar con ${n}.`,
      promptHelping: n => `Mándale una foto de lo que tienes para que ${n} confirme que le sirve.`,
      sendPhoto: 'Mandar una foto', askPhoto: n => `Pedirle una foto a ${n}`, alsoTheirs: n => `${n} también puede mandarte una.`,
      requested: n => `Le pedimos una foto a ${n}.`,
      incoming: n => `${n} te mandó una foto para confirmar.`,
      review: '¿Es lo que necesitas?',
      accept: 'Sí, me sirve', ask: 'Preguntar', reject: 'No es lo que busco',
      youAsked: 'Preguntaste', waitingAnswer: n => `Esperando respuesta de ${n}…`, answered: n => `${n} respondió`,
      questionTitle: n => `Pregúntale a ${n}`, questionPh: 'p. ej. ¿Es de 48 litros? ¿Tiene ruedas?', send: 'Enviar',
      accepted: 'Confirmado con foto', acceptedSub: n => `Le avisamos a ${n}. Ya pueden coordinar la entrega.`,
      rejected: n => `Le dijiste a ${n} que no era lo que buscas. Puedes mandarle una foto de lo que necesitas o pedir a otra persona.`,
      rejectedTheirs: n => `${n} dice que no es lo que necesita.`,
      deliveryTitle: 'Coordinar la entrega', deliveryWhere: n => `${n} sugiere:`, propose: 'Proponer',
      proposed: (w, pl) => `Propusiste ${w.toLowerCase()} · ${pl}. Esperando confirmación…`,
      agreed: 'Entrega acordada', agreedLine: (w, pl) => `${w} · ${pl}`,
      agreedToast: (n, w) => `${n} confirmó: ${w.toLowerCase()}.`,
      whens: ['Hoy en la tarde', 'Mañana temprano', 'El fin de semana'],
      placeOf: p => (p.place ? `en ${p.place}` : 'en la entrada'),
      replyAccept: '¡Sí, es justo eso! ¿Cuándo te lo paso?',
      replyAcceptHelping: '¡Sí! Es exactamente lo que necesito. Gracias.',
      replyAnswer: 'Sí, sin problema. Si quieres pásate a verlo antes de llevártelo.',
      replyAgree: 'Va, ahí nos vemos.',
      incomingCaption: what => `Tengo ${what}, ¿te sirve?`,
      demoTag: 'Foto de demo', view: 'Ver grande', close: 'Cerrar'
    },
    en: {
      title: 'Confirm with a photo',
      metaTo: n => `So ${n} sees exactly what you mean before you agree on details.`,
      takePhoto: 'Take a photo', takeSub: 'With this device\'s camera',
      pickPhoto: 'Choose from gallery', pickSub: 'A photo you already have',
      opening: 'Opening the camera…', capture: 'Capture', cancel: 'Cancel', retake: 'Another photo',
      noCamera: 'We couldn\'t open the camera here.', useNative: 'Take the photo with your phone',
      captionLabel: 'What do you want to ask or say?',
      captionRequest: what => (what ? `I'm looking for something like this (${what}). Is yours similar?` : 'Here\'s a photo so you can see what I mean. Does it work?'),
      captionHelping: what => (what ? `I have ${what}, does it work for you?` : 'This is it, does it work for you?'),
      sendTo: n => `Send to ${n}`,
      sent: n => `Photo sent to ${n}. We'll let you know when they review it.`,
      privacy: 'Only the person you send it to sees the photo. It isn\'t published or analyzed, and in the demo it never leaves this device.',
      you: 'You', reviewing: n => `${n} is reviewing your photo…`,
      promptRequest: n => `Is it what you need? Confirm with a photo before coordinating with ${n}.`,
      promptHelping: n => `Send a photo of what you have so ${n} can confirm it works.`,
      sendPhoto: 'Send a photo', askPhoto: n => `Ask ${n} for a photo`, alsoTheirs: n => `${n} can also send you one.`,
      requested: n => `We asked ${n} for a photo.`,
      incoming: n => `${n} sent you a photo to confirm.`,
      review: 'Is this what you need?',
      accept: 'Yes, that works', ask: 'Ask', reject: 'Not what I\'m looking for',
      youAsked: 'You asked', waitingAnswer: n => `Waiting for ${n}…`, answered: n => `${n} replied`,
      questionTitle: n => `Ask ${n}`, questionPh: 'e.g. Is it 48 liters? Does it have wheels?', send: 'Send',
      accepted: 'Confirmed with a photo', acceptedSub: n => `We let ${n} know. You can now coordinate the handoff.`,
      rejected: n => `You told ${n} it isn't what you need. You can send a photo of what you're looking for or ask someone else.`,
      rejectedTheirs: n => `${n} says it isn't what they need.`,
      deliveryTitle: 'Coordinate the handoff', deliveryWhere: n => `${n} suggests:`, propose: 'Propose',
      proposed: (w, pl) => `You proposed ${w.toLowerCase()} · ${pl}. Waiting for confirmation…`,
      agreed: 'Handoff agreed', agreedLine: (w, pl) => `${w} · ${pl}`,
      agreedToast: (n, w) => `${n} confirmed: ${w.toLowerCase()}.`,
      whens: ['This afternoon', 'Tomorrow morning', 'This weekend'],
      placeOf: p => (p.place ? `at ${p.place}` : 'at the entrance'),
      replyAccept: 'Yes, that\'s exactly it! When should I hand it over?',
      replyAcceptHelping: 'Yes! That\'s exactly what I need. Thank you.',
      replyAnswer: 'Yes, no problem. Come see it before you take it if you like.',
      replyAgree: 'Deal, see you there.',
      incomingCaption: what => `I have ${what}, does it work for you?`,
      demoTag: 'Demo photo', view: 'View', close: 'Close'
    }
  };
  const t = lang => T[lang] || T.es;

  const ICONS = [
    ['hielera', '🧊'], ['silla', '🪑'], ['mesa', '🪑'], ['taladro', '🔧'], ['herramienta', '🧰'], ['llaves', '🧰'],
    ['bocina', '🔊'], ['carbon', '🔥'], ['escalera', '🪜'], ['casco', '🪖'], ['astronauta', '🚀'], ['disfraz', '🎭'],
    ['vestido', '👗'], ['ropa', '👗'], ['bolsa', '👜'], ['clutch', '👜'], ['aretes', '💍'], ['accesorios', '💍'], ['chal', '🧣'],
    ['camisa', '👕'], ['bici', '🚲'], ['decoracion', '🎉'], ['papel picado', '🎉'], ['sombrero', '🎩'], ['rebozo', '🧣'],
    ['carton', '📦'], ['materiales', '🎨'], ['maleta', '🧳'], ['olla', '🍲'], ['cafetera', '☕'], ['libro', '📚']
  ];

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  function langOf(conn) {
    const s = State.getSituation(conn.situationId);
    return (s && s.understanding && s.understanding.lang) || 'es';
  }

  function caps(conn) {
    return (conn.capabilityIds || []).map(id => State.capability(conn.personId, id)).filter(Boolean);
  }

  function objectCap(conn) {
    return caps(conn).find(c => c.kind === 'object') || null;
  }

  /* Lo que se confirma, en minúsculas y con artículo neutro: "la hielera grande (48 L)" → "esta hielera grande" */
  function whatOf(conn, lang) {
    const cap = objectCap(conn);
    if (!cap) return '';
    const raw = (lang === 'en' && cap.labelEn) || cap.label;
    const short = String(raw || '').split(/[:(·,]/)[0].trim();
    const lower = short.charAt(0).toLowerCase() + short.slice(1);
    if (lang === 'en') return `this ${lower}`;
    const noun = lower.split(' ').find(w => !/^(un|una|unos|unas|dos|tres|cuatro|cinco|seis|varias|varios)$/.test(w)) || lower;
    const dem = /os$|es$/.test(noun) ? 'estos' : /as$/.test(noun) ? 'estas' : /a$/.test(noun) ? 'esta' : 'este';
    return `${dem} ${lower}`;
  }

  function iconFor(conn) {
    const cap = objectCap(conn);
    const hay = Resolver.normalize(`${(cap && cap.tags || []).join(' ')} ${cap ? cap.label : conn.title}`);
    const hit = ICONS.find(([k]) => hay.includes(k));
    return hit ? hit[1] : '📦';
  }

  function isHelping(conn) { return conn.kind === 'helping'; }
  function acceptedPhoto(conn) { return (conn.photos || []).find(p => p.status === 'accepted') || null; }
  function pendingMine(conn) { return (conn.photos || []).find(p => p.from === 'me' && p.status === 'sent') || null; }
  function pendingTheirs(conn) { return (conn.photos || []).find(p => p.from !== 'me' && (p.status === 'sent' || p.status === 'question')) || null; }

  function refresh() {
    const path = Router.current().path;
    if (path.startsWith('/s/') || path.startsWith('/situations') || path === '/') Router.refresh();
    return path.startsWith('/s/');
  }

  function schedule(key, delay, fn) {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); fn(); }, delay));
  }

  /* ------------------------------------------------------------------
     Imagen: reducir a MAX_SIDE y guardar como JPEG
     ------------------------------------------------------------------ */
  function shrink(source, w, h) {
    const sw = w || source.naturalWidth || source.videoWidth || source.width;
    const sh = h || source.naturalHeight || source.videoHeight || source.height;
    const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  }

  /* Foto simulada de la otra persona: una tarjeta cálida con el objeto. Nunca se hace pasar por una foto real. */
  function simulatedImage(conn, lang) {
    const cap = objectCap(conn);
    const label = cap ? ((lang === 'en' && cap.labelEn) || cap.label) : conn.title;
    const c = document.createElement('canvas');
    c.width = 640; c.height = 480;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 480);
    g.addColorStop(0, '#F7F1E6'); g.addColorStop(1, '#E4D5BF');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = 'rgba(169, 130, 94, .28)'; ctx.fillRect(0, 352, 640, 128);
    ctx.fillStyle = 'rgba(43, 34, 27, .10)';
    ctx.beginPath(); ctx.ellipse(320, 344, 150, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.font = '190px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2B221B';
    ctx.fillText(iconFor(conn), 320, 236);
    ctx.font = '600 26px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#2B221B';
    ctx.fillText(String(label).slice(0, 44), 320, 412);
    ctx.font = '600 14px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#8C7D70'; ctx.textAlign = 'right';
    ctx.fillText(t(lang).demoTag, 622, 460);
    return c.toDataURL('image/jpeg', 0.8);
  }

  /* ------------------------------------------------------------------
     La otra persona (simulada)
     ------------------------------------------------------------------ */
  function sendIncoming(connId) {
    const conn = State.getConnection(connId);
    if (!conn || conn.status !== 'accepted' || (conn.photos || []).length) return;
    const lang = langOf(conn);
    const p = State.person(conn.personId);
    State.addPhoto(conn.id, { from: conn.personId, image: simulatedImage(conn, lang), caption: t(lang).incomingCaption(whatOf(conn, lang)), simulated: true });
    if (!refresh()) UI.toast(t(lang).incoming(p.name));
  }

  function reviewMine(connId, photoId) {
    const conn = State.getConnection(connId);
    const ph = conn && (conn.photos || []).find(x => x.id === photoId);
    if (!ph || ph.status !== 'sent') return;
    const lang = langOf(conn);
    State.updatePhoto(conn.id, ph.id, { status: 'accepted', reply: isHelping(conn) ? t(lang).replyAcceptHelping : t(lang).replyAccept });
    if (!refresh()) UI.toast(`${State.person(conn.personId).name}: ${ph.reply}`);
  }

  function answerQuestion(connId, photoId) {
    const conn = State.getConnection(connId);
    const ph = conn && (conn.photos || []).find(x => x.id === photoId);
    if (!ph || ph.status !== 'question') return;
    const lang = langOf(conn);
    State.updatePhoto(conn.id, ph.id, { status: 'sent', reply: t(lang).replyAnswer });
    if (!refresh()) UI.toast(`${State.person(conn.personId).name}: ${ph.reply}`);
  }

  function agreeDelivery(connId) {
    const conn = State.getConnection(connId);
    if (!conn || !conn.delivery || conn.delivery.status !== 'proposed') return;
    const lang = langOf(conn);
    State.updateConnection(conn.id, { delivery: Object.assign({}, conn.delivery, { status: 'agreed', reply: t(lang).replyAgree }) });
    if (!refresh()) UI.toast(t(lang).agreedToast(State.person(conn.personId).name, conn.delivery.when));
  }

  /* Al decir que sí, quien tiene el objeto suele mandar una foto sin que se la pidan. */
  function onAccepted(connId) {
    const conn = State.getConnection(connId);
    if (!conn || isHelping(conn) || !objectCap(conn)) return;
    schedule(`in:${connId}`, INCOMING_DELAY, () => sendIncoming(connId));
  }

  function resume() {
    State.connections().forEach(conn => {
      if (conn.status !== 'accepted') return;
      const age = Date.now() - conn.updatedAt;
      (conn.photos || []).forEach(ph => {
        if (ph.from === 'me' && ph.status === 'sent') schedule(`rev:${ph.id}`, Math.max(500, REVIEW_DELAY - age), () => reviewMine(conn.id, ph.id));
        if (ph.from !== 'me' && ph.status === 'question') schedule(`ans:${ph.id}`, Math.max(500, ANSWER_DELAY - age), () => answerQuestion(conn.id, ph.id));
      });
      if (conn.delivery && conn.delivery.status === 'proposed') schedule(`del:${conn.id}`, Math.max(500, AGREE_DELAY - age), () => agreeDelivery(conn.id));
      if (!(conn.photos || []).length && !isHelping(conn) && objectCap(conn)) schedule(`in:${conn.id}`, Math.max(500, INCOMING_DELAY - age), () => sendIncoming(conn.id));
    });
  }

  function pendingReview(situationId) {
    return State.connectionsFor(situationId).filter(c => c.status === 'accepted' && pendingTheirs(c) && pendingTheirs(c).status === 'sent').length;
  }

  /* ------------------------------------------------------------------
     Diálogo: tomar · elegir · preview · enviar
     ------------------------------------------------------------------ */
  function stop() {
    if (stream) { stream.getTracks().forEach(tr => tr.stop()); stream = null; }
  }

  function shell(conn, inner) {
    const lang = langOf(conn);
    const p = State.person(conn.personId);
    return `
      <div class="dialog__form vc-dialog">
        <h2 id="dialog-title" class="dialog__title">${esc(t(lang).title)}</h2>
        <p class="dialog__meta">${esc(t(lang).metaTo(p.name))}</p>
        <p class="vc-to">${UI.avatar(p, 'sm')} <span><strong>${esc(p.name)}</strong> · ${esc(conn.title)}</span></p>
        ${inner}
        <p class="muted small vc-privacy">${esc(t(lang).privacy)}</p>
      </div>`;
  }

  function open(opts) {
    const conn = State.getConnection(opts.conn);
    if (!conn) return;
    draft = { connId: conn.id, image: null };
    renderPick();
  }

  function renderPick() {
    const conn = State.getConnection(draft.connId);
    const lang = langOf(conn);
    const dialog = UI.openDialog(shell(conn, `
      <div class="vc-sources">
        <button class="vc-source" type="button" data-action="vc-source" data-source="camera" data-autofocus>
          <span class="vc-source__icon" aria-hidden="true">📷</span>
          <span class="vc-source__label">${esc(t(lang).takePhoto)}</span>
          <span class="vc-source__sub">${esc(t(lang).takeSub)}</span>
        </button>
        <label class="vc-source">
          <input type="file" accept="image/*" data-vc-file hidden>
          <span class="vc-source__icon" aria-hidden="true">🖼️</span>
          <span class="vc-source__label">${esc(t(lang).pickPhoto)}</span>
          <span class="vc-source__sub">${esc(t(lang).pickSub)}</span>
        </label>
      </div>
      <div class="btn-row btn-row--end">
        <button class="btn btn--ghost" type="button" data-action="vc-close">${esc(t(lang).cancel)}</button>
      </div>`));
    bindFile(dialog);
  }

  function bindFile(dialog) {
    dialog.querySelectorAll('[data-vc-file]').forEach(input => input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(img.src); draft.image = shrink(img); renderPreview(); };
      img.src = URL.createObjectURL(file);
    }));
  }

  async function renderCamera() {
    const conn = State.getConnection(draft.connId);
    const lang = langOf(conn);
    const dialog = UI.openDialog(shell(conn, `<p class="vc-status">${esc(t(lang).opening)}</p>`));
    const canUse = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    try {
      if (!canUse) throw new Error('no-media');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    } catch (err) {
      return renderNoCamera(dialog, conn, lang);
    }
    if (!dialog.open || !draft) return stop();
    dialog.innerHTML = shell(conn, `
      <div class="vc-view"><video class="vc-view__media" autoplay playsinline muted></video></div>
      <div class="btn-row btn-row--end">
        <button class="btn btn--ghost" type="button" data-action="vc-retake">${esc(t(lang).cancel)}</button>
        <button class="btn btn--primary" type="button" data-action="vc-capture" data-autofocus>${esc(t(lang).capture)}</button>
      </div>`);
    dialog.querySelector('video').srcObject = stream;
  }

  /* Sin getUserMedia (o permiso negado): el input con capture abre la cámara nativa del teléfono. */
  function renderNoCamera(dialog, conn, lang) {
    dialog.innerHTML = shell(conn, `
      <p class="vc-status">${esc(t(lang).noCamera)}</p>
      <div class="vc-sources">
        <label class="vc-source">
          <input type="file" accept="image/*" capture="environment" data-vc-file hidden>
          <span class="vc-source__icon" aria-hidden="true">📷</span>
          <span class="vc-source__label">${esc(t(lang).useNative)}</span>
        </label>
        <label class="vc-source">
          <input type="file" accept="image/*" data-vc-file hidden>
          <span class="vc-source__icon" aria-hidden="true">🖼️</span>
          <span class="vc-source__label">${esc(t(lang).pickPhoto)}</span>
        </label>
      </div>
      <div class="btn-row btn-row--end"><button class="btn btn--ghost" type="button" data-action="vc-close">${esc(t(lang).cancel)}</button></div>`);
    bindFile(dialog);
  }

  function capture() {
    const video = document.getElementById('dialog').querySelector('video');
    if (!video || !video.videoWidth || !draft) return;
    draft.image = shrink(video, video.videoWidth, video.videoHeight);
    stop();
    renderPreview();
  }

  function renderPreview() {
    const conn = State.getConnection(draft.connId);
    const lang = langOf(conn);
    const p = State.person(conn.personId);
    const suggested = isHelping(conn) ? t(lang).captionHelping(whatOf(conn, lang)) : t(lang).captionRequest(whatOf(conn, lang));
    UI.openDialog(shell(conn, `
      <form data-form="vc-send">
        <div class="vc-view vc-view--preview"><img class="vc-view__media" src="${draft.image}" alt=""></div>
        <label class="vc-label" for="vc-caption">${esc(t(lang).captionLabel)}</label>
        <textarea id="vc-caption" name="caption" rows="2" maxlength="200">${esc(suggested)}</textarea>
        <div class="btn-row btn-row--end">
          <button class="btn btn--ghost" type="button" data-action="vc-retake">${esc(t(lang).retake)}</button>
          <button class="btn btn--primary" type="submit" data-autofocus>${esc(t(lang).sendTo(p.name))}</button>
        </div>
      </form>`));
  }

  function send(form) {
    if (!draft || !draft.image) return;
    const conn = State.getConnection(draft.connId);
    if (!conn) return close();
    const lang = langOf(conn);
    const caption = (form.elements.caption.value || '').trim();
    const ph = State.addPhoto(conn.id, { from: 'me', image: draft.image, caption });
    clearTimeout(timers.get(`in:${conn.id}`)); /* si ya mandaste la tuya, no hace falta que llegue otra */
    schedule(`rev:${ph.id}`, REVIEW_DELAY, () => reviewMine(conn.id, ph.id));
    close();
    Router.refresh();
    UI.toast(t(lang).sent(State.person(conn.personId).name));
  }

  function close() {
    stop();
    draft = null;
    UI.closeDialog();
  }

  /* ------------------------------------------------------------------
     Revisar: aceptar · preguntar · rechazar
     ------------------------------------------------------------------ */
  function accept(connId, photoId) {
    const conn = State.getConnection(connId);
    if (!conn) return;
    State.updatePhoto(connId, photoId, { status: 'accepted' });
    UI.closeDialog();
    Router.refresh();
    UI.toast(t(langOf(conn)).acceptedSub(State.person(conn.personId).name));
  }

  function reject(connId, photoId) {
    State.updatePhoto(connId, photoId, { status: 'rejected' });
    UI.closeDialog();
    Router.refresh();
  }

  function askDialog(connId, photoId) {
    const conn = State.getConnection(connId);
    if (!conn) return;
    const lang = langOf(conn);
    const p = State.person(conn.personId);
    UI.openDialog(`
      <form class="dialog__form" data-form="vc-question" data-conn="${esc(connId)}" data-photo="${esc(photoId)}">
        <h2 id="dialog-title" class="dialog__title">${esc(t(lang).questionTitle(p.name))}</h2>
        <label class="sr-only" for="vc-question">${esc(t(lang).questionTitle(p.name))}</label>
        <textarea id="vc-question" name="question" rows="2" maxlength="200" placeholder="${esc(t(lang).questionPh)}" data-autofocus></textarea>
        <div class="btn-row btn-row--end">
          <button class="btn btn--ghost" type="button" data-action="vc-close">${esc(t(lang).cancel)}</button>
          <button class="btn btn--primary" type="submit">${esc(t(lang).send)}</button>
        </div>
      </form>`);
  }

  function question(form) {
    const q = (form.elements.question.value || '').trim();
    if (!q) return;
    const connId = form.dataset.conn, photoId = form.dataset.photo;
    State.updatePhoto(connId, photoId, { status: 'question', question: q, reply: '' });
    schedule(`ans:${photoId}`, ANSWER_DELAY, () => answerQuestion(connId, photoId));
    UI.closeDialog();
    Router.refresh();
  }

  function lightbox(connId, photoId) {
    const conn = State.getConnection(connId);
    const ph = conn && (conn.photos || []).find(x => x.id === photoId);
    if (!ph) return;
    const lang = langOf(conn);
    const reviewable = ph.from !== 'me' && ph.status === 'sent';
    UI.openDialog(`
      <div class="dialog__form vc-dialog">
        <h2 id="dialog-title" class="sr-only">${esc(t(lang).view)}</h2>
        <div class="vc-view vc-view--preview"><img class="vc-view__media" src="${ph.image}" alt=""></div>
        <p class="vc-caption"><strong>${esc(ph.from === 'me' ? t(lang).you : State.person(conn.personId).name)}:</strong> ${esc(ph.caption)}</p>
        ${reviewable ? reviewActions(conn, ph, lang) : ''}
        <div class="btn-row btn-row--end"><button class="btn btn--ghost" type="button" data-action="vc-close" ${reviewable ? '' : 'data-autofocus'}>${esc(t(lang).close)}</button></div>
      </div>`);
  }

  function reviewActions(conn, ph, lang) {
    const a = `data-conn="${esc(conn.id)}" data-photo="${esc(ph.id)}"`;
    return `
      <div class="vc-review">
        <p class="vc-review__q">${esc(t(lang).review)}</p>
        <div class="btn-row btn-row--tight">
          <button class="btn btn--primary btn--sm" type="button" data-action="vc-accept" ${a} data-autofocus>${esc(t(lang).accept)}</button>
          <button class="btn btn--secondary btn--sm" type="button" data-action="vc-ask" ${a}>${esc(t(lang).ask)}</button>
          <button class="btn btn--ghost btn--sm" type="button" data-action="vc-reject" ${a}>${esc(t(lang).reject)}</button>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------
     Bloque inline dentro de una conexión
     ------------------------------------------------------------------ */
  function photoCard(conn, ph, lang) {
    const p = State.person(conn.personId);
    const mine = ph.from === 'me';
    const who = mine ? t(lang).you : p.name;
    let status = '';
    if (mine && ph.status === 'sent') status = `<p class="vc-photo__status vc-photo__status--wait"><span class="pulse pulse--sm" aria-hidden="true"></span> ${esc(t(lang).reviewing(p.name))}</p>`;
    else if (mine && ph.status === 'accepted') status = `<p class="vc-photo__status vc-photo__status--ok"><strong>${esc(p.name)}:</strong> ${esc(ph.reply || '')}</p>`;
    else if (mine && ph.status === 'rejected') status = `<p class="vc-photo__status">${esc(t(lang).rejectedTheirs(p.name))}</p>`;
    else if (!mine && ph.status === 'question') status = `<p class="vc-photo__status"><strong>${esc(t(lang).youAsked)}:</strong> ${esc(ph.question)}</p><p class="vc-photo__status vc-photo__status--wait"><span class="pulse pulse--sm" aria-hidden="true"></span> ${esc(t(lang).waitingAnswer(p.name))}</p>`;
    else if (!mine && ph.status === 'sent' && ph.question) status = `<p class="vc-photo__status"><strong>${esc(t(lang).youAsked)}:</strong> ${esc(ph.question)}</p><p class="vc-photo__status vc-photo__status--ok"><strong>${esc(t(lang).answered(p.name))}:</strong> ${esc(ph.reply || '')}</p>`;
    else if (!mine && ph.status === 'accepted') status = `<p class="vc-photo__status vc-photo__status--ok"><span class="check" aria-hidden="true">✓</span> ${esc(t(lang).accepted)}</p>`;
    else if (!mine && ph.status === 'rejected') status = `<p class="vc-photo__status">${esc(t(lang).rejected(p.name))}</p>`;
    return `
      <figure class="vc-photo ${mine ? 'vc-photo--mine' : 'vc-photo--theirs'} ${ph.status === 'rejected' ? 'vc-photo--rejected' : ''}">
        <button class="vc-photo__thumb" type="button" data-action="vc-view" data-conn="${esc(conn.id)}" data-photo="${esc(ph.id)}" aria-label="${esc(t(lang).view)}">
          <img src="${ph.image}" alt="">
        </button>
        <figcaption class="vc-photo__body">
          <p class="vc-photo__caption"><strong>${esc(who)}:</strong> ${esc(ph.caption)}</p>
          ${status}
          ${!mine && ph.status === 'sent' ? reviewActions(conn, ph, lang) : ''}
        </figcaption>
      </figure>`;
  }

  function deliveryBlock(conn, lang) {
    const p = State.person(conn.personId);
    const d = conn.delivery;
    const place = t(lang).placeOf(p);
    if (d && d.status === 'agreed') {
      return `
        <div class="vc-delivery vc-delivery--agreed">
          <p class="vc-delivery__title"><span class="check" aria-hidden="true">✓</span> ${esc(t(lang).agreed)}</p>
          <p class="vc-delivery__line">${esc(t(lang).agreedLine(d.when, d.place))}</p>
          <p class="vc-delivery__reply"><strong>${esc(p.name)}:</strong> ${esc(d.reply || '')}</p>
        </div>`;
    }
    if (d && d.status === 'proposed') {
      return `<div class="vc-delivery"><p class="vc-delivery__line vc-photo__status--wait"><span class="pulse pulse--sm" aria-hidden="true"></span> ${esc(t(lang).proposed(d.when, d.place))}</p></div>`;
    }
    return `
      <form class="vc-delivery" data-form="vc-delivery" data-conn="${esc(conn.id)}">
        <p class="vc-delivery__title">${esc(t(lang).deliveryTitle)}</p>
        <p class="muted small">${esc(t(lang).deliveryWhere(p.name))} ${esc(place)}</p>
        <div class="vc-whens">
          ${t(lang).whens.map((w, i) => `<label class="scope__opt"><input type="radio" name="when" value="${esc(w)}" ${i === 0 ? 'checked' : ''}><span>${esc(w)}</span></label>`).join('')}
        </div>
        <input type="hidden" name="place" value="${esc(place)}">
        <button class="btn btn--primary btn--sm" type="submit">${esc(t(lang).propose)}</button>
      </form>`;
  }

  function block(conn, lang) {
    lang = lang || langOf(conn);
    if (conn.status !== 'accepted' && conn.status !== 'done') return '';
    const p = State.person(conn.personId);
    const photos = (conn.photos || []).slice().sort((a, b) => a.createdAt - b.createdAt);
    if (conn.status === 'done') {
      const ok = acceptedPhoto(conn);
      return ok ? `<div class="vc vc--done"><span class="check" aria-hidden="true">✓</span> ${esc(t(lang).accepted)}</div>` : '';
    }
    const list = photos.map(ph => photoCard(conn, ph, lang)).join('');
    let tail = '';
    if (acceptedPhoto(conn)) {
      tail = deliveryBlock(conn, lang);
    } else if (!pendingMine(conn) && !pendingTheirs(conn)) {
      const helping = isHelping(conn);
      tail = `
        <div class="vc-prompt">
          <p class="vc-prompt__text">${esc(helping ? t(lang).promptHelping(p.name) : t(lang).promptRequest(p.name))}</p>
          <div class="btn-row btn-row--tight">
            <button class="btn btn--secondary btn--sm" type="button" data-action="vc-open" data-conn="${esc(conn.id)}"><span aria-hidden="true">📷</span> ${esc(t(lang).sendPhoto)}</button>
            ${!helping && objectCap(conn) && !photos.length ? `<button class="btn btn--ghost btn--sm" type="button" data-action="vc-request" data-conn="${esc(conn.id)}">${esc(t(lang).askPhoto(p.name))}</button>` : ''}
          </div>
          ${!helping && !photos.length ? `<p class="muted small">${esc(t(lang).alsoTheirs(p.name))}</p>` : ''}
        </div>`;
    }
    return `<div class="vc">${list}${tail}</div>`;
  }

  /* ------------------------------------------------------------------
     Handlers (App delega data-action="vc-*" y data-form="vc-*" aquí)
     ------------------------------------------------------------------ */
  const actions = {
    'vc-open'(ds) { open({ conn: ds.conn }); },
    'vc-source'(ds) { if (ds.source === 'camera') renderCamera(); },
    'vc-capture'() { capture(); },
    'vc-retake'() { stop(); if (draft) { draft.image = null; renderPick(); } },
    'vc-close'() { close(); },
    'vc-view'(ds) { lightbox(ds.conn, ds.photo); },
    'vc-accept'(ds) { accept(ds.conn, ds.photo); },
    'vc-ask'(ds) { askDialog(ds.conn, ds.photo); },
    'vc-reject'(ds) { reject(ds.conn, ds.photo); },
    'vc-request'(ds) {
      const conn = State.getConnection(ds.conn);
      if (!conn) return;
      schedule(`in:${conn.id}`, REQUEST_DELAY, () => sendIncoming(conn.id));
      UI.toast(t(langOf(conn)).requested(State.person(conn.personId).name));
    }
  };

  const forms = {
    'vc-send'(form) { send(form); },
    'vc-question'(form) { question(form); },
    'vc-delivery'(form) {
      const connId = form.dataset.conn;
      const when = form.querySelector('input[name="when"]:checked');
      if (!when) return;
      State.updateConnection(connId, { delivery: { when: when.value, place: form.elements.place.value, status: 'proposed' } });
      schedule(`del:${connId}`, AGREE_DELAY, () => agreeDelivery(connId));
      Router.refresh();
    }
  };

  function clearTimers() {
    timers.forEach(tm => clearTimeout(tm));
    timers.clear();
  }

  return { block, open, close, onAccepted, resume, pendingReview, clearTimers, actions, forms };
})();
