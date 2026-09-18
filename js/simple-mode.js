/* ==========================================================================
   simple-mode.js — Versión sencilla (pensada para personas mayores).

   Cuatro accesos grandes y entrada por voz cuando el navegador la ofrece.
   No es otro producto: cada botón arma una frase y la manda al mismo
   pipeline (App.submitSituation). La situación decide qué círculos importan:
   para acompañamiento, el resolver prioriza confianza, relación previa y
   verificación (Trust.PROFILES.care).

   Ruta: #/sencillo
   ========================================================================== */

const SimpleMode = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let recognition = null;
  let listeners = [];

  const OPTIONS = [
    { id: 'company', icon: '🤝', label: 'Necesito que me acompañen', hint: 'Al doctor, a un trámite, a donde sea',
      prompt: 'Mañana necesito ir al doctor y no tengo quién me acompañe.' },
    { id: 'thing', icon: '🛍️', label: 'Necesito algo', hint: 'De la farmacia, del súper, algo prestado',
      prompt: 'Necesito que alguien me compre algo en la farmacia hoy.' },
    { id: 'home', icon: '💡', label: 'Necesito ayuda en casa', hint: 'Un foco, algo pesado, algo que no alcanzo',
      prompt: 'Necesito ayuda para cambiar un foco.' },
    { id: 'support', icon: '💛', label: 'Quiero pedir apoyo', hint: 'Cuéntalo con tus palabras o con tu voz',
      prompt: '' }
  ];

  function speechAvailable() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function template() {
    const c = State.community();
    return `
      <section class="simple" aria-labelledby="simple-title">
        <a class="back" href="#/">← Volver a la versión normal</a>
        <p class="eyebrow">${esc(c.name)}</p>
        <h1 id="simple-title" class="simple__title">¿Qué necesitas hoy?</h1>
        <p class="simple__sub">Toca una opción. Buscamos primero entre las personas en las que ya confías.</p>
        <ul class="simple__grid">
          ${OPTIONS.map(o => `
            <li>
              <button class="simple__btn" type="button" data-simple="${esc(o.id)}">
                <span class="simple__icon" aria-hidden="true">${o.icon}</span>
                <span class="simple__label">${esc(o.label)}</span>
                <span class="simple__hint">${esc(o.hint)}</span>
              </button>
            </li>`).join('')}
        </ul>
        <form class="simple__form" data-form="simple" novalidate hidden>
          <label class="simple__form-label" for="simple-input">Cuéntanos con tus palabras</label>
          <textarea id="simple-input" rows="3" placeholder="Por ejemplo: mi hija trabaja y mañana tengo cita a las 10."></textarea>
          <div class="btn-row">
            ${speechAvailable() ? '<button class="btn btn--secondary simple__voice" type="button" data-simple="voice"><span aria-hidden="true">🎤</span> Hablar</button>' : ''}
            <button class="btn btn--primary simple__send" type="submit">Pedir apoyo</button>
          </div>
          <p class="simple__status muted" role="status" aria-live="polite"></p>
        </form>
        <p class="muted simple__foot">Nadie ve tu dirección ni tu teléfono. Solo tu nombre y tu edificio, y solo las personas a las que tú decidas pedirle.</p>
      </section>`;
  }

  function on(el, ev, fn) {
    el.addEventListener(ev, fn);
    listeners.push(() => el.removeEventListener(ev, fn));
  }

  function submit(text) {
    if (!text) return;
    stopVoice();
    if (typeof App !== 'undefined' && App.submitSituation) App.submitSituation(text);
  }

  function startVoice(root) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    const status = root.querySelector('.simple__status');
    const input = root.querySelector('#simple-input');
    try {
      recognition = new Ctor();
      recognition.lang = 'es-MX';
      recognition.interimResults = true;
      recognition.onresult = e => {
        const text = Array.from(e.results).map(r => r[0].transcript).join(' ');
        input.value = text;
        if (e.results[e.results.length - 1].isFinal) { status.textContent = 'Listo. Revisa y toca "Pedir apoyo".'; input.focus(); }
      };
      recognition.onerror = () => { status.textContent = 'No pudimos escucharte. Puedes escribirlo.'; };
      recognition.onend = () => { root.querySelector('.simple__voice')?.classList.remove('is-on'); };
      recognition.start();
      status.textContent = 'Te escuchamos…';
      root.querySelector('.simple__voice')?.classList.add('is-on');
    } catch (err) {
      status.textContent = 'No pudimos usar el micrófono aquí. Puedes escribirlo.';
    }
  }

  function stopVoice() {
    if (recognition) { try { recognition.stop(); } catch (e) { /* ya detenido */ } recognition = null; }
  }

  function mount(main) {
    dispose();
    main.innerHTML = template();
    const root = main.querySelector('.simple');
    const form = root.querySelector('.simple__form');
    const input = root.querySelector('#simple-input');

    on(root, 'click', e => {
      const el = e.target.closest('[data-simple]');
      if (!el) return;
      const id = el.dataset.simple;
      if (id === 'voice') { startVoice(root); return; }
      const opt = OPTIONS.find(o => o.id === id);
      if (!opt) return;
      if (opt.prompt) { submit(opt.prompt); return; }
      form.hidden = false;
      input.focus();
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    on(form, 'submit', e => { e.preventDefault(); submit(input.value.trim()); });
    on(document, 'keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && e.target === input) { e.preventDefault(); submit(input.value.trim()); }
    });
    const hashListener = () => { if (!location.hash.startsWith('#/sencillo')) dispose(); };
    window.addEventListener('hashchange', hashListener);
    listeners.push(() => window.removeEventListener('hashchange', hashListener));
  }

  function dispose() {
    stopVoice();
    listeners.forEach(off => off());
    listeners = [];
  }

  return { mount, dispose, OPTIONS };
})();
