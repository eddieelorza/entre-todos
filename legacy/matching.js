/* ==========================================================================
   matching.js — Interpretación de necesidades y búsqueda de coincidencias.

   PUNTO DE INTEGRACIÓN FUTURO:
   `interpretNeed(text)` y `interpretOffer(text, kind)` devuelven un objeto
   "intent" normalizado. Hoy se construye con reglas; mañana puede venir de
   una API de IA con exactamente la misma forma. `findMatches(intent)` no
   necesita cambiar.

   Los vecinos y pendientes salen de State.residents() / State.errands():
   mock en modo demo, Supabase en modo live. Este módulo no distingue.
   ========================================================================== */

const Matching = (() => {
  const COMMUNITY = () => State.community().name;

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hasAny(text, words) {
    return words.some(w => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(text));
  }

  function detectLang(text) {
    const en = (text.match(/\b(i|i'm|im|i've|need|the|and|to|my|something|please|can|anyone|going|tomorrow|have|but|don't)\b/g) || []).length;
    const es = (text.match(/\b(necesito|alguien|tengo|puedo|quiero|voy|manana|hoy|pero|para|que|una|un|el|la|de)\b/g) || []).length;
    return en > es ? 'en' : 'es';
  }

  /* ---- Cuándo ---- */
  function parseWhen(t) {
    const tags = [];
    let day = null;
    let time = null;
    let short = null;
    let range = null;

    if (/(^|\s)(manana|tomorrow)(\s|$|[.,])/.test(t) && !/por la manana|in the morning/.test(t.replace(/manana por la manana/, 'x por la manana'))) {
      day = 'Mañana'; tags.push('manana');
    } else if (/(^|\s)manana(\s|$|[.,])/.test(t)) {
      day = 'Mañana'; tags.push('manana');
    }
    if (/\b(hoy|today|tonight|esta tarde|esta noche|ahorita)\b/.test(t)) { day = 'Hoy'; tags.push('hoy'); }
    if (/\b(fin de semana|weekend|sabado|domingo|saturday|sunday)\b/.test(t)) { day = 'Este fin de semana'; tags.push('finde'); }

    const found = t.match(/(?:entre|between|de|from)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:y|a|-|–|to|hasta)\s*(?:las\s*)?(\d{1,2})(?::(\d{2}))?\s*(pm|am)?/);
    if (found) {
      const h1 = parseInt(found[1], 10);
      const h2 = parseInt(found[3], 10);
      const pm = found[5] === 'pm' || (!found[5] && h1 <= 7) || /tarde|afternoon/.test(t);
      if (h1 <= 12 && h2 <= 12 && h1 < h2) {
        const suffix = pm ? 'PM' : 'AM';
        range = { h1, h2, suffix };
        time = `${h1}:${found[2] || '00'}–${h2}:${found[4] || '00'} ${suffix}`;
        short = `${h1}–${h2} ${suffix}`;
        tags.push(pm ? 'tarde' : 'am');
      }
    } else {
      const after = t.match(/(?:despues de las?|after)\s*(\d{1,2})\s*(pm|am)?/);
      if (after) {
        const h = parseInt(after[1], 10);
        const pm = after[2] === 'pm' || h <= 7;
        time = `Después de las ${h} ${pm ? 'PM' : 'AM'}`;
        short = time;
        tags.push(pm ? 'tarde' : 'am');
      } else if (/por la tarde|in the afternoon|esta tarde/.test(t)) {
        time = 'Por la tarde'; short = 'Tarde'; tags.push('tarde');
      } else if (/por la manana|in the morning|temprano/.test(t)) {
        time = 'Por la mañana'; short = 'Mañana temprano'; tags.push('am');
      } else if (/noche|tonight|evening/.test(t)) {
        time = 'Por la noche'; short = 'Noche'; tags.push('noche');
      }
    }

    const label = [day, time].filter(Boolean).join(' · ');
    const shortLabel = [day, short].filter(Boolean).join(' · ');
    return { label: label || null, short: shortLabel || null, day, time, range, tags };
  }

  /* ---- Palabras clave genéricas ---- */
  const STOP = new Set(('a al algo alguien alguna alguno ante como con de del desde donde el ella ellos en entre es esta este esto estoy hay la las le lo los me mi mis muy nada ni no nos o para pero por que quien se ser si sin sobre su sus te tengo tiene tu un una uno unos unas y ya necesito quiero puede puedo podria busco hola gracias favor voy estare i im ive need the and to my something please can anyone but dont do you for is it of on with going tomorrow today have has be am are').split(' '));

  function extractKeywords(t) {
    return t.replace(/[^a-z0-9 ]/g, ' ').split(' ')
      .filter(w => w.length > 3 && !STOP.has(w))
      .map(w => w.replace(/(es|s)$/, m => (w.length > 5 ? '' : m)))
      .filter((w, i, arr) => arr.indexOf(w) === i)
      .slice(0, 8);
  }

  /* ---- Base de un intent ---- */
  function baseIntent(text, extra) {
    const t = normalize(text);
    const when = parseWhen(t);
    const lang = detectLang(t);
    return Object.assign({
      mode: 'need',
      scenario: 'generic',
      lang,
      title: 'Una pequeña ayuda',
      needLabel: 'Una pequeña ayuda',
      helpType: 'Un favor',
      when,
      keywords: [],
      weak: [],
      context: '',
      completeLabel: 'Marcar como resuelto',
      doneStatus: 'completed',
      icon: '🤝',
      rows: null,
      raw: text
    }, extra);
  }

  /* ---- Reglas de interpretación (en orden de prioridad) ---- */
  const TOOLS = [
    ['taladro', 'Taladro', '🪛'], ['drill', 'Taladro', '🪛'], ['escalera', 'Escalera', '🪜'], ['ladder', 'Escalera', '🪜'],
    ['martillo', 'Martillo', '🔨'], ['desarmador', 'Desarmador', '🔧'], ['pinzas', 'Pinzas', '🔧'], ['bocina', 'Bocina', '🔊'],
    ['bici', 'Bicicleta', '🚲'], ['extension', 'Extensión eléctrica', '🔌'], ['herramienta', 'Herramientas', '🧰']
  ];

  const rules = [
    /* Ofrecer algo → flujo "Tengo algo para compartir" */
    {
      test: t => (/\b(compartir|regalar|donar|sobra|sobran|prestar|share|lend|give away)\b/.test(t) || /^(tengo|i have)\b/.test(t))
        && !/\b(necesito|need|busco|alguien|podria)\b/.test(t),
      build: (t, text) => baseIntent(text, { mode: 'offer', scenario: 'offer' })
    },
    /* Voy a un lugar → momento de delight */
    {
      test: t => /\b(voy|ire|paso|pasare|going|heading|estare|estoy yendo)\b/.test(t) && DATA.places.some(p => hasAny(t, p.match)),
      build: (t, text) => {
        const place = DATA.places.find(p => hasAny(t, p.match));
        return baseIntent(text, {
          mode: 'trip', scenario: 'trip', place: place.id, placeLabel: place.label,
          title: `Viaje a ${place.label}`, icon: '🛒'
        });
      }
    },
    /* Recibir un paquete */
    {
      test: t => /\b(paquete|paqueteria|envio|entrega|package|parcel|delivery|repartidor|amazon|mercado libre)\b/.test(t),
      build: (t, text) => {
        const base = baseIntent(text);
        const es = base.lang === 'es';
        const w = base.when;
        const rangeEs = w.range ? ` entre ${w.range.h1} y ${w.range.h2} ${w.range.suffix}` : (w.time ? ` ${w.time.toLowerCase()}` : '');
        const rangeEn = w.range ? ` between ${w.range.h1} and ${w.range.h2} ${w.range.suffix}` : '';
        const dayEs = w.day || 'Pronto';
        const dayEn = w.day === 'Mañana' ? 'tomorrow' : (w.day === 'Hoy' ? 'today' : 'soon');
        return Object.assign(base, {
          scenario: 'package',
          title: 'Recibir paquete', icon: '📦',
          needLabel: es ? 'Recibir un paquete' : 'Receive a package',
          helpType: es ? 'Disponibilidad' : 'Availability',
          keywords: ['paquete', 'recibir', 'entrega'],
          completeLabel: es ? 'Paquete recibido' : 'Package received',
          context: es
            ? `${dayEs} espero un paquete${rangeEs}, pero estaré trabajando.`
            : `I'm expecting a package ${dayEn}${rangeEn}, but I'll be at work.`
        });
      }
    },
    /* Ropa o contexto para una celebración mexicana */
    {
      test: t => /\b(mexican|mexicana|mexicano|noche mexicana|independencia|independence|grito|charro|sombrero|traje tipico)\b/.test(t),
      build: (t, text) => {
        const base = baseIntent(text);
        const en = base.lang === 'en';
        return Object.assign(base, {
          scenario: 'mexican',
          title: en ? 'Outfit for a Mexican night' : 'Algo para una Noche Mexicana', icon: '🇲🇽',
          needLabel: en ? 'Something to wear for a Mexican celebration' : 'Algo para ponerme en una celebración mexicana',
          helpType: en ? 'Clothing · accessories · cultural advice' : 'Ropa · accesorios · consejo cultural',
          keywords: ['sombrero', 'ropa', 'vestir', 'wear', 'camisa', 'traje', 'bordad', 'mexican', 'cultura', 'extranjero', 'outfit'],
          weak: ['fiesta', 'noche mexicana', 'independencia', 'independence'],
          completeLabel: en ? 'All set for the party' : 'Ya tengo todo para la fiesta',
          doneStatus: 'returned',
          context: en
            ? "I've been invited to a Mexican Independence Day party and I'm not sure what to wear."
            : 'Me invitaron a una Noche Mexicana y no sé qué ponerme.',
          rows: [
            { label: en ? 'Need' : 'Necesidad', value: en ? 'Something to wear for a Mexican celebration' : 'Algo para ponerme en una celebración mexicana' },
            { label: en ? 'Context' : 'Contexto', value: en ? 'Mexican cultural event' : 'Evento cultural mexicano' },
            { label: en ? 'Where' : 'Dónde', value: COMMUNITY() },
            { label: en ? 'Possible resources' : 'Puede resolverse con', value: en ? 'Clothing · accessories · cultural advice' : 'Ropa · accesorios · consejo cultural' }
          ]
        });
      }
    },
    /* Herramientas y objetos prestados */
    {
      test: t => TOOLS.some(([w]) => hasAny(t, [w])),
      build: (t, text) => {
        const tool = TOOLS.find(([w]) => hasAny(t, [w]));
        const base = baseIntent(text);
        return Object.assign(base, {
          scenario: 'borrow',
          title: tool[1], icon: tool[2],
          needLabel: `${tool[1]} prestado`,
          helpType: 'Préstamo',
          keywords: [tool[0], 'herramienta'].concat(extractKeywords(t)),
          completeLabel: 'Ya lo devolví',
          doneStatus: 'returned',
          context: `Necesito ${tool[1].toLowerCase() === 'herramientas' ? 'unas herramientas' : `un ${tool[1].toLowerCase()}`}${base.when.label ? ' ' + base.when.label.toLowerCase().replace(' · ', ', ') : ''}.`
        });
      }
    },
    /* Mascotas */
    {
      test: t => /\b(perro|gato|mascota|pasear|dog|cat|pet)\b/.test(t),
      build: (t, text) => Object.assign(baseIntent(text), {
        scenario: 'pets', title: 'Ayuda con mi mascota', icon: '🐕',
        needLabel: 'Alguien que cuide o pasee a mi mascota', helpType: 'Un favor',
        keywords: ['mascota', 'perro', 'gato', 'cuidar'], completeLabel: 'Ya me ayudó',
        context: 'Necesito una mano con mi mascota.'
      })
    },
    /* Mover o cargar */
    {
      test: t => /\b(mover|cargar|mudanza|subir|bajar|sofa|mueble|pesado|move|carry|heavy)\b/.test(t),
      build: (t, text) => Object.assign(baseIntent(text), {
        scenario: 'move', title: 'Mover algo pesado', icon: '💪',
        needLabel: 'Ayuda para mover algo', helpType: 'Un favor',
        keywords: ['mover', 'cargar', 'pesado'], completeLabel: 'Ya lo movimos',
        context: 'Necesito ayuda para mover algo pesado.'
      })
    },
    /* Comida e ingredientes */
    {
      test: t => /\b(comida|cena|limon|limones|huevo|huevos|leche|azucar|cebolla|tortillas|ingrediente|tamal|tamales|food|dinner|eggs|milk)\b/.test(t),
      build: (t, text) => {
        const kws = extractKeywords(t);
        return Object.assign(baseIntent(text), {
          scenario: 'food', title: cap(kws[0] || 'Algo de comer'), icon: '🍋',
          needLabel: `Algo de comer: ${kws.slice(0, 3).join(', ') || 'lo que haya'}`, helpType: 'Comida',
          keywords: kws.concat(['comida', 'ingrediente']), completeLabel: 'Ya lo recibí',
          context: `Me hace falta ${kws[0] || 'algo de comer'} y no quiero salir.`
        });
      }
    },
    /* Fallback genérico */
    {
      test: () => true,
      build: (t, text) => {
        const kws = extractKeywords(t);
        return Object.assign(baseIntent(text), {
          scenario: 'generic', title: kws.length ? cap(kws.slice(0, 2).join(' ')) : 'Una pequeña ayuda', icon: '🤝',
          needLabel: kws.length ? cap(kws.slice(0, 3).join(', ')) : 'Una pequeña ayuda',
          keywords: kws, completeLabel: 'Marcar como resuelto',
          context: `Necesito ayuda con ${kws.slice(0, 2).join(' y ') || 'algo pequeño'}.`
        });
      }
    }
  ];

  function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /* ---- API pública ---- */
  function interpretNeed(text) {
    const t = normalize(text);
    const rule = rules.find(r => r.test(t));
    const intent = rule.build(t, text);
    if (!intent.rows && intent.mode === 'need') {
      const en = intent.lang === 'en';
      intent.rows = [
        { label: en ? 'Need' : 'Necesidad', value: intent.needLabel },
        { label: en ? 'When' : 'Cuándo', value: intent.when.label || (en ? 'Not specified' : 'Por definir') },
        { label: en ? 'Where' : 'Dónde', value: COMMUNITY() },
        { label: en ? 'Type of help' : 'Tipo de ayuda', value: intent.helpType }
      ];
    }
    return intent;
  }

  function keywordHit(offerKeyword, needKeyword) {
    if (needKeyword.length < 3) return false;
    return offerKeyword.includes(needKeyword) || needKeyword.includes(offerKeyword);
  }

  function distanceBonus(d) {
    if (d === 0) return 3;
    if (d <= 100) return 2.5;
    if (d <= 150) return 2;
    if (d <= 250) return 1;
    return 0.5;
  }

  function findMatches(intent, limit = 3) {
    if (intent.mode !== 'need') return [];
    const results = [];
    State.residents().forEach(resident => {
      resident.offers.forEach(offer => {
        const strong = intent.keywords.filter(k => offer.keywords.some(ok => keywordHit(ok, k)));
        if (!strong.length) return;
        const weak = intent.weak.filter(k => offer.keywords.some(ok => keywordHit(ok, k)));
        let score = 10 + Math.min(strong.length - 1, 3) * 2 + weak.length * 0.5;

        const needTags = intent.when.tags;
        if (offer.availTags.includes('any')) score += 5;
        else if (needTags.length && needTags.some(tag => offer.availTags.includes(tag))) score += 5;
        else if (needTags.length) score -= 3;
        else score += 2;

        score += distanceBonus(resident.distance);
        score += resident.completed / 10;

        results.push({ resident, offer, score, reason: offer.reason, action: offer.action, actionLabel: DATA.actions[offer.action] });
      });
    });
    results.sort((a, b) => b.score - a.score);
    /* Una sola tarjeta por persona */
    const seen = new Set();
    return results.filter(r => (seen.has(r.resident.id) ? false : seen.add(r.resident.id))).slice(0, limit);
  }

  function findTripOpportunities(intent) {
    return State.errands()
      .filter(e => e.place === intent.place)
      .map(e => Object.assign({}, e, { resident: State.resident(e.residentId) }))
      .filter(e => e.resident);
  }

  function buildMessage(intent, match) {
    const name = match.resident.name;
    const en = intent.lang === 'en';
    const ask = en ? (match.offer.askEn || match.offer.ask) : match.offer.ask;
    const hello = en ? `Hi ${name} 👋` : `Hola ${name} 👋`;
    return `${hello} ${intent.context} ${ask}`.replace(/\s+/g, ' ').trim();
  }

  /* ---- Ofrecer algo ---- */
  function interpretOffer(text, kind) {
    const t = normalize(text);
    const hit = DATA.resourceLexicon.find(entry => hasAny(t, entry.match));
    let finalKind = kind || (hit ? hit.kind : 'objeto');
    let title;
    if (hit) {
      title = hit.title;
    } else {
      const words = t.replace(/^(tengo|i have|puedo|ofrezco|quiero compartir)\s+(un|una|unos|unas|a|an|some)?\s*/, '')
        .replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean).slice(0, 4).join(' ');
      title = cap(words || 'Algo para compartir');
    }
    const icon = hit ? hit.icon : DATA.kinds[finalKind].icon;
    const keywords = extractKeywords(t).concat(hit ? hit.match : []);
    let availability = 'Por confirmar';
    if (/hoy|esta tarde|ahorita/.test(t)) availability = 'Hoy';
    else if (/fin de semana|sabado|domingo/.test(t)) availability = 'Fines de semana';
    else if (/esta semana|semana/.test(t)) availability = 'Esta semana';
    return { title, kind: finalKind, type: DATA.kinds[finalKind].type, icon, keywords, availability, raw: text };
  }

  return { interpretNeed, findMatches, findTripOpportunities, buildMessage, interpretOffer, normalize };
})();
