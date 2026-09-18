/* ==========================================================================
   resolver.js — De una situación a una solución.

   Pipeline (cada etapa devuelve objetos planos que la vista consume):

     understandSituation(text)                 → understanding
     discoverNeeds(understanding)              → needs[]
     discoverCapabilities(graph, needs, u)     → candidates { needId: [{ person, capability, score, because }] }
     buildSolutions(needs, candidates, u)      → solutions[] (una por estrategia)
     rankSolutions(solutions)                  → solutions[] ordenadas
     discoverOpportunities(graph, u)           → open[] (situaciones de otros que tu trayecto u oferta resuelve)

   PUNTO DE INTEGRACIÓN FUTURO: hoy todo son reglas en JavaScript. Un modelo
   puede sustituir understandSituation + discoverNeeds devolviendo la misma
   forma; discoverCapabilities y buildSolutions no necesitan cambiar.
   ========================================================================== */

const Resolver = (() => {
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* ---- Utilidades de texto ---- */
  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hasAny(text, words) {
    return words.some(w => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(text));
  }

  function detectLang(t) {
    const en = (t.match(/\b(i|i'm|im|i've|need|the|and|to|my|something|please|can|anyone|going|tomorrow|have|but|don't|dont|what|wear|bring|party|from)\b/g) || []).length;
    const es = (t.match(/\b(necesito|alguien|tengo|puedo|quiero|voy|manana|hoy|pero|para|que|una|un|el|la|de|se|me|mi)\b/g) || []).length;
    return en > es ? 'en' : 'es';
  }

  const STOP = new Set(('a al algo alguien alguna alguno ante como con de del desde donde el ella ellos en entre es esta este esto estoy hay la las le lo los me mi mis muy nada ni no nos o para pero por que quien se ser si sin sobre su sus te tengo tiene tu un una uno unos unas y ya necesito quiero puede puedo podria busco hola gracias favor voy estare manana hoy i im ive need the and to my something please can anyone but dont do you for is it of on with going tomorrow today have has be am are').split(' '));

  function keywords(t) {
    return t.replace(/[^a-z0-9 ]/g, ' ').split(' ')
      .filter(w => w.length > 3 && !STOP.has(w))
      .map(w => w.replace(/(es|s)$/, m => (w.length > 5 ? '' : m)))
      .filter((w, i, arr) => arr.indexOf(w) === i)
      .slice(0, 8);
  }

  function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /* De dónde viene la persona → qué idioma o ingredientes de casa buscar. */
  const ORIGINS = [
    [/\b(china|chinese|chino|shanghai|beijing)\b/, ['mandarin', 'chinese', 'china']],
    [/\b(taiwan|taiwanese)\b/, ['mandarin', 'chinese', 'taiwan']],
    [/\b(india|indian|diwali|hindi)\b/, ['hindi', 'india', 'indian', 'curry']],
    [/\b(japan|japanese|japon|japones)\b/, ['japones', 'japanese', 'japan']],
    [/\b(korea|korean|corea|coreano|coreana)\b/, ['coreano', 'korean', 'korea', 'kimchi']],
    [/\b(morocco|moroccan|marruecos|marroqui|egypt|egipto|lebanon|syria|arabic|arabe)\b/, ['arabe', 'arabic', 'especias']],
    [/\b(germany|german|alemania|aleman|alemana)\b/, ['aleman', 'german']],
    [/\b(france|french|francia|frances|francesa)\b/, ['frances', 'french']],
    [/\b(usa|american|england|british|uk|canada|australia|estados unidos|ingles)\b/, ['ingles', 'english']],
    [/\b(colombia|argentina|peru|chile|venezuela|mexico|mexican|latino|latina)\b/, ['espanol', 'spanish', 'latino']]
  ];
  function detectOrigin(t) {
    const hit = ORIGINS.find(([re]) => re.test(t));
    return hit ? hit[1] : null;
  }

  function hour12(h) {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const n = h % 12 === 0 ? 12 : h % 12;
    return `${n} ${suffix}`;
  }

  /* ---- Cuándo: día concreto + ventana de horas ---- */
  function parseWhen(t, lang) {
    const today = new Date();
    let offset = null;
    let from = null;
    let to = null;

    if (/\b(manana|tomorrow)\b/.test(t.replace(/por la manana|de la manana|in the morning|manana temprano|las mananas/g, ''))) offset = 1;
    if (/\b(hoy|today|tonight|ahorita|esta tarde|esta noche)\b/.test(t)) offset = 0;
    let dayIdx = DAYS.findIndex(d => new RegExp(`\\b${normalize(d)}\\b`).test(t));
    if (dayIdx < 0) dayIdx = DAYS_EN.findIndex(d => new RegExp(`\\b${d.toLowerCase()}\\b`).test(t));
    if (dayIdx >= 0) offset = (dayIdx - today.getDay() + 7) % 7 || 7;
    if (/\b(fin de semana|weekend)\b/.test(t) && offset === null) offset = (6 - today.getDay() + 7) % 7 || 7;

    const range = t.match(/(?:entre|between|de|from)\s*(?:las?\s*)?(\d{1,2})(?::(\d{2}))?\s*(?:y|a|-|–|to|hasta|and)\s*(?:las?\s*)?(\d{1,2})(?::(\d{2}))?\s*(pm|am)?/);
    if (range) {
      let h1 = parseInt(range[1], 10);
      let h2 = parseInt(range[3], 10);
      const pm = range[5] === 'pm' || (!range[5] && h1 <= 7) || /tarde|afternoon/.test(t);
      if (h1 <= 12 && h2 <= 12 && h1 < h2) {
        if (pm && h1 < 12) { h1 += 12; h2 += 12; }
        from = h1; to = h2;
      }
    } else {
      const at = t.match(/\b(?:a las?|at)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|de la manana|de la tarde|de la noche)?/);
      const after = t.match(/(?:despues de las?|after)\s*(\d{1,2})\s*(pm|am)?/);
      if (at) {
        let h = parseInt(at[1], 10);
        const mod = at[3] || '';
        const pm = /pm|tarde|noche/.test(mod) || (!mod && (h <= 6 || /\b(tarde|noche|evening|night)\b/.test(t)));
        if (pm && h < 12) h += 12;
        from = h; to = Math.min(23, h + 2);
      } else if (after) {
        let h = parseInt(after[1], 10);
        if ((after[2] === 'pm' || h <= 7) && h < 12) h += 12;
        from = h; to = 23;
      } else if (/por la tarde|in the afternoon|esta tarde/.test(t)) { from = 14; to = 19; }
      else if (/por la manana|in the morning|temprano/.test(t)) { from = 8; to = 12; }
      else if (/\b(noche|tonight|evening|night)\b/.test(t)) { from = 19; to = 23; }
    }

    const date = new Date(today);
    if (offset !== null) date.setDate(today.getDate() + offset);
    const day = offset === null ? null : date.getDay();
    const en = lang === 'en';
    let dayLabel = null;
    if (offset === 0) dayLabel = en ? 'today' : 'hoy';
    else if (offset === 1) dayLabel = en ? 'tomorrow' : 'mañana';
    else if (offset !== null) dayLabel = en ? `on ${DAYS_EN[day]}` : `el ${DAYS[day]}`;

    let timeLabel = null;
    const at = /\b(?:a las?|at)\s*\d{1,2}/.test(t);
    if (at && from !== null) timeLabel = en ? `at ${hour12(from)}` : `a las ${hour12(from)}`;
    else if (from !== null && to !== null && to !== 23) timeLabel = en ? `between ${hour12(from)} and ${hour12(to)}` : `entre ${hour12(from)} y ${hour12(to)}`;
    else if (from !== null) timeLabel = en ? `after ${hour12(from)}` : `después de las ${hour12(from)}`;

    return {
      offset, day, from, to,
      dayName: day === null ? null : (en ? DAYS_EN[day] : DAYS[day]),
      label: [dayLabel, timeLabel].filter(Boolean).join(' ') || null,
      short: dayLabel ? cap(dayLabel) : null
    };
  }

  /* ---- Etapa 1: entender la situación ---- */
  const scenarios = [
    {
      key: 'trip',
      test: t => /\b(voy|ire|paso|pasare|going|heading|estare en|voy a ir)\b/.test(t) && State.places().some(p => hasAny(t, p.match)) && !/\b(necesito|need|busco)\b/.test(t),
      build: (t, u) => {
        const place = State.places().find(p => hasAny(t, p.match));
        return Object.assign(u, {
          kind: 'opportunity', place: place.id, placeLabel: place.label, icon: '🛒',
          title: `Viaje a ${place.label}`,
          summary: `Vas a ${place.label}${u.when.label ? ' ' + u.when.label : ''}. No es un problema: es un trayecto que ya vas a hacer y que puede servirle a alguien cerca.`,
          context: `Voy a ${place.label}${u.when.label ? ' ' + u.when.label : ''}.`
        });
      }
    },
    {
      key: 'offer',
      test: t => (/^(tengo|i have|me sobra|me sobran)\b/.test(t) || /\b(compartir|regalar|donar|sobra|sobran|share|give away)\b/.test(t)) && !/\b(necesito|need|busco|alguien|podria|no se|no tengo)\b/.test(t),
      build: (t, u) => {
        const kws = keywords(t);
        return Object.assign(u, {
          kind: 'offer', icon: '🤲', tags: kws,
          title: kws.length ? cap(kws.slice(0, 2).join(' ')) : 'Algo para compartir',
          summary: `Tienes ${kws.slice(0, 2).join(' ') || 'algo'} de más. Eso es una capacidad: buscamos si alguien cerca lo necesita hoy.`,
          context: t
        });
      }
    },
    {
      /* Familias con hijos: resolver una situación familiar sin comprar (traje + casco + materiales + alguien que ya lo hizo). */
      key: 'costume',
      test: t => /\b(disfraz|disfraces|costume)\b/.test(t),
      build: (t, u) => {
        const en = u.lang === 'en';
        const what = (t.match(/\b(astronauta|astronaut|dinosaurio|princesa|superheroe|pirata|vaquero|catrina|calavera|bruja|mariachi)\b/) || [])[1] || '';
        const kids = /\b(hijos|hija|hijo|nino|nina|ninos|kids|son|daughter)\b/.test(t);
        return Object.assign(u, {
          icon: '🚀', profile: 'family', costume: what, kids,
          title: en ? `A ${what || 'costume'} costume` : `Disfraz de ${what || 'niños'}`,
          summary: en
            ? `Your kids need a ${what || ''} costume ${u.when.label || 'soon'}. Around here someone already has one, someone made one last year, and someone has the materials.`
            : `${kids ? 'Tus hijos necesitan' : 'Necesitas'} un disfraz${what ? ' de ' + what : ''} ${u.when.label || 'pronto'}. Cerca hay quien ya tiene uno, quien lo hizo el año pasado y quien tiene con qué improvisarlo.`,
          context: en ? `My kids need a ${what || ''} costume ${u.when.label || 'soon'}.` : `Mis hijos necesitan un disfraz${what ? ' de ' + what : ''} ${u.when.label || 'pronto'}.`
        });
      }
    },
    {
      /* Closet compartido: una ocasión especial se resuelve entre varias personas de un círculo, no en un marketplace. */
      key: 'garment',
      test: t => /\b(vestido|traje de gala|boda|gala|smoking|esmoquin|dress|wedding|outfit)\b/.test(t) && !/\b(mexican|mexicana|disfraz)\b/.test(t),
      build: (t, u) => {
        const en = u.lang === 'en';
        const size = (t.match(/\btalla\s*([a-z0-9]{1,3})\b/) || t.match(/\bsize\s*([a-z0-9]{1,3})\b/) || [])[1] || '';
        const event = /\b(boda|wedding)\b/.test(t) ? (en ? 'a wedding' : 'una boda') : (en ? 'an evening event' : 'un evento de noche');
        return Object.assign(u, {
          icon: '👗', profile: 'garment', size: size.toUpperCase(), event,
          title: en ? `Something to wear to ${event}` : `Qué ponerte para ${event}`,
          summary: en
            ? `You have ${event} ${u.when.label || 'soon'} and need a full look${size ? ` (size ${size.toUpperCase()})` : ''}. Your circle can probably put it together between a few people.`
            : `Tienes ${event} ${u.when.label || 'pronto'} y necesitas un look completo${size ? ` (talla ${size.toUpperCase()})` : ''}. Tu círculo probablemente puede armarlo entre varias personas.`,
          context: en ? `I have ${event} ${u.when.label || 'soon'} and need something to wear${size ? ` (size ${size.toUpperCase()})` : ''}.` : `Tengo ${event} ${u.when.label || 'pronto'} y necesito qué ponerme${size ? ` (talla ${size.toUpperCase()})` : ''}.`
        });
      }
    },
    {
      /* Ride: trayecto compatible + proximidad + confianza. */
      key: 'ride',
      test: t => /\b(ride|raite|aventon|lift)\b/.test(t) || /\b(alguien|quien)\b.*\b(me lleve|me pueda llevar|llevarme)\b/.test(t),
      build: (t, u) => {
        const en = u.lang === 'en';
        const to = (t.match(/\b(?:a|al|hacia|to)\s+(?:la |el |los |las )?([a-z]{4,}(?:\s[a-z]{3,})?)\b/) || [])[1] || '';
        return Object.assign(u, {
          icon: '🚗', profile: 'ride', to,
          title: en ? 'A ride' : 'Un ride',
          summary: en
            ? `You need a ride ${u.when.label || 'today'}${to ? ` to ${to}` : ''}. Someone nearby you already trust is probably heading that way.`
            : `Necesitas que alguien te lleve ${u.when.label || 'hoy'}${to ? ` a ${to}` : ''}. Probablemente alguien cerca, y de confianza, ya va hacia allá.`,
          context: en ? `I need a ride ${u.when.label || 'today'}${to ? ` to ${to}` : ''}.` : `Necesito ride ${u.when.label || 'hoy'}${to ? ` a ${to}` : ''}.`
        });
      }
    },
    {
      key: 'package',
      test: t => /\b(paquete|paqueteria|envio|entrega|package|parcel|delivery|repartidor|amazon|mercado libre)\b/.test(t),
      build: (t, u) => {
        const en = u.lang === 'en';
        const w = u.when;
        const window = w.label || (en ? 'soon' : 'pronto');
        return Object.assign(u, {
          icon: '📦', title: en ? 'Receive a package' : 'Recibir un paquete',
          summary: en
            ? `You need someone in your building ${window} to receive a package.`
            : `Necesitas a alguien disponible en tu edificio ${window} para recibir un paquete.`,
          context: en
            ? `A package arrives ${window} and I'll be at work.`
            : `${cap(window)} llega un paquete y estaré fuera.`
        });
      }
    },
    {
      key: 'mexican',
      test: t => /\b(mexican|mexicana|mexicano|noche mexicana|independencia|independence|grito|charro|fiesta patria)\b/.test(t),
      build: (t, u) => {
        const en = u.lang === 'en';
        return Object.assign(u, {
          icon: '🇲🇽',
          title: en ? 'A Mexican celebration' : 'Una celebración mexicana',
          summary: en
            ? "You've been invited to a Mexican celebration and want to know what to wear, what to bring and how it works."
            : 'Te invitaron a una celebración mexicana y quieres saber qué ponerte, qué llevar y cómo funciona.',
          context: en
            ? "I've been invited to a Mexican Independence Day party and I'm not sure what to wear or bring."
            : 'Me invitaron a una Noche Mexicana y no sé qué ponerme ni qué llevar.'
        });
      }
    },
    {
      key: 'space',
      test: t => /\b(espacio|lugar|salon|sala|donde)\b.*\b(reunir|reunirnos|juntarnos|juntar|junta|reunion|taller|clase|evento|festejar|celebrar|ensayar)\b/.test(t)
        || /\b(reunirnos|juntarnos|junta vecinal|junta de vecinos)\b/.test(t) && !/\b\d{1,2}\b.*\b(comida|cena|carne asada)\b/.test(t),
      build: (t, u) => {
        const en = u.lang === 'en';
        const n = parseInt((t.match(/\b(\d{1,2})\b/) || [])[1], 10) || 0;
        return Object.assign(u, {
          icon: '🏛️', scale: n || 1, profile: 'object',
          title: en ? 'A place to meet' : 'Un espacio para reunirse',
          summary: en
            ? `You need a place to get together${n ? ` with about ${n} people` : ''}${u.when.label ? ' ' + u.when.label : ''}. The place itself can help: the residence has common rooms.`
            : `Necesitas un lugar para reunirte${n ? ` con unas ${n} personas` : ''}${u.when.label ? ' ' + u.when.label : ''}. El lugar mismo puede ayudar: el residencial tiene espacios comunes.`,
          context: en
            ? `I need a place to meet${n ? ` with about ${n} people` : ''}${u.when.label ? ' ' + u.when.label : ''}.`
            : `Necesito un espacio para reunirnos${n ? ` unas ${n} personas` : ''}${u.when.label ? ' ' + u.when.label : ''}.`
        });
      }
    },
    {
      key: 'gathering',
      test: t => /\b(carne asada|asado|parrillada|bbq|barbecue)\b/.test(t) || (/\b(fiesta|reunion|cumpleanos|cena|comida|posada|dinner|party|cook|cocinar)\b/.test(t) && /\b\d{1,2}\b/.test(t)),
      build: (t, u) => {
        const n = parseInt((t.match(/\b(\d{1,2})\b/) || [])[1], 10) || 8;
        const bbq = /\b(carne asada|asado|parrillada|bbq|barbecue)\b/.test(t);
        const en = u.lang === 'en';
        const w = u.when.label ? ' ' + u.when.label : '';
        return Object.assign(u, {
          icon: bbq ? '🔥' : '🎉', scale: n, bbq,
          title: en ? `Dinner for ${n}` : (bbq ? `Carne asada para ${n}` : `Comida para ${n}`),
          summary: en
            ? `You are hosting ${n} people${w}. For something like this you need things almost nobody has, but almost everybody has put away.`
            : `Vas a recibir a ${n} personas en casa${w}. Para algo así suelen hacer falta cosas que casi nadie tiene, pero que casi todos tienen guardadas.`,
          context: en
            ? `I'm cooking for ${n} people${w}.`
            : `Voy a hacer una ${bbq ? 'carne asada' : 'comida'} para ${n} personas${w}.`
        });
      }
    },
    {
      key: 'appointment',
      test: t => /\b(cita|doctor|doctora|medico|medica|consulta|imss|issste|hospital|clinica|appointment|extranjeria|comisaria)\b/.test(t) && !/\b(nie|tie|empadron|visa|permiso)\b/.test(t),
      build: (t, u) => {
        const en = u.lang === 'en';
        const other = /\b(mi mama|mi papa|mi abuela|mi abuelo|mi madre|mi padre|my mom|my dad|my mother|my father)\b/.test(t);
        const alone = /\b(no tengo quien|no tengo quién|sola|solo|nadie|alone|no one)\b/.test(t);
        return Object.assign(u, {
          icon: '🏥', other, alone, profile: 'care', sensitive: true,
          title: en ? 'A medical appointment' : (other ? 'Cita médica de un familiar' : 'Cita médica'),
          summary: en
            ? `There is an appointment ${u.when.label || 'soon'} and getting there and not waiting alone are the hard parts.`
            : `Hay una cita ${u.when.label || 'pronto'}. Lo difícil no es la consulta: es llegar y no esperar ${other ? 'sola' : 'solo'}. Para esto buscamos primero entre personas de confianza.`,
          context: en
            ? `There is a medical appointment ${u.when.label || 'soon'} and I can't take care of it myself.`
            : `${other ? 'Mi mamá tiene' : 'Tengo'} cita médica ${u.when.label || 'pronto'} y no puedo resolverlo solo.`
        });
      }
    },
    {
      key: 'paperwork',
      test: t => /\b(nie|tie|tramite|tramites|empadronamiento|empadronar|visa|permiso de residencia|curp|pasaporte|paperwork|residence permit|registration)\b/.test(t),
      build: (t, u) => {
        const en = u.lang === 'en';
        const what = (t.match(/\b(nie|tie|empadronamiento|visa|curp|pasaporte|residence permit)\b/) || [])[1];
        const label = what ? what.toUpperCase().replace('RESIDENCE PERMIT', 'residence permit').replace('EMPADRONAMIENTO', 'empadronamiento') : (en ? 'the paperwork' : 'el trámite');
        return Object.assign(u, {
          icon: '📄',
          title: en ? `Getting my ${label}` : `Sacar ${label}`,
          summary: en
            ? `You need to get your ${label}. Someone here already went through exactly this, and that is worth more than any website.`
            : `Necesitas sacar ${label}. Alguien aquí ya pasó por exactamente esto, y eso vale más que cualquier página web.`,
          context: en ? `I need to get my ${label} and don't know where to start.` : `Necesito sacar ${label} y no sé por dónde empezar.`
        });
      }
    },
    {
      key: 'pet',
      test: t => /\b(perro|perra|perrito|perrita|gato|gata|mascota|dog|cat|pet)\b/.test(t),
      build: (t, u) => {
        const days = (t.match(/\b(\d+|dos|tres|cuatro|cinco)\s+dias?\b/) || [])[1];
        const away = /\b(viaje|viajo|me voy|fuera|out of town|away|trip)\b/.test(t);
        return Object.assign(u, {
          icon: '🐕', away,
          title: away ? 'Mascota sola unos días' : 'Ayuda con mi mascota',
          summary: away
            ? `Te vas ${days ? days + ' días' : 'unos días'} y tu mascota se queda. Alguien cerca con tiempo y cariño lo resuelve mejor que una pensión.`
            : 'Necesitas una mano con tu mascota. Aquí hay gente con tiempo que disfruta hacerlo.',
          context: away ? `Me voy ${days ? days + ' días' : 'unos días'} y mi mascota se queda sola.` : 'Necesito una mano con mi mascota.'
        });
      }
    },
    {
      key: 'household',
      test: t => /\b(foco|bombilla|fuga|tuberia|llave del agua|contacto|apagador|enchufe|no alcanzo|se descompuso|repisa|clavo|colgar|escalera)\b/.test(t),
      build: (t, u) => Object.assign(u, {
        icon: '💡',
        title: 'Un arreglo en casa',
        summary: 'Es un arreglo pequeño, pero requiere subirse, saber o tener la herramienta. Aquí hay quien sabe y quien tiene.',
        context: 'Tengo un arreglo pequeño en casa que no puedo hacer sola.'
      })
    },
    {
      key: 'moving',
      test: t => /\b(mudanza|me mudo|mudarme|nevera|refrigerador|estanteria|ropero|sofa|colchon|lavadora|moving|move out|fridge|bookshelf)\b/.test(t) || /\b(cargar|subir|bajar)\b.*\b(pesado|solo|sola)\b/.test(t),
      build: (t, u) => {
        const en = u.lang === 'en';
        const things = (t.match(/\b(nevera|refrigerador|estanteria|ropero|sofa|colchon|lavadora|fridge|bookshelf|sofa)\b/g) || []);
        return Object.assign(u, {
          icon: '📦', things,
          title: en ? 'Moving heavy things' : 'Mover cosas pesadas',
          summary: en
            ? `You have to move ${things.length ? things.join(' and ') : 'heavy things'} ${u.when.label || 'soon'}. Nobody does that alone; here there are hands and wheels.`
            : `Tienes que mover ${things.length ? things.join(' y ') : 'cosas pesadas'} ${u.when.label || 'pronto'}. Eso nadie lo hace solo; aquí hay manos y ruedas.`,
          context: en
            ? `I have to move ${things.length ? things.join(' and ') : 'heavy things'} ${u.when.label || 'soon'} and can't do it alone.`
            : `Tengo que mover ${things.length ? things.join(' y ') : 'cosas pesadas'} ${u.when.label || 'pronto'} y no puedo solo.`
        });
      }
    },
    {
      key: 'bike',
      test: t => /\b(bici|bicicleta|bike|bicycle)\b/.test(t),
      build: (t, u) => Object.assign(u, {
        icon: '🚲', title: 'Bici descompuesta',
        summary: `Tu bici no funciona y la necesitas ${u.when.label || 'pronto'}. Hay más de una forma de resolverlo.`,
        context: `Se me descompuso la bici y la necesito ${u.when.label || 'pronto'}.`
      })
    },
    {
      key: 'generic',
      test: () => true,
      build: (t, u) => {
        const kws = keywords(t);
        return Object.assign(u, {
          icon: '🤝', tags: kws,
          title: kws.length ? cap(kws.slice(0, 2).join(' ')) : 'Una situación',
          summary: kws.length
            ? `Buscamos quién cerca sabe, tiene o puede ayudar con ${kws.slice(0, 3).join(', ')}.`
            : 'Buscamos quién cerca puede ayudarte con esto.',
          context: t
        });
      }
    }
  ];

  function understandSituation(text) {
    const t = normalize(text);
    const lang = detectLang(t);
    const originTags = detectOrigin(t);
    const base = { text, lang, kind: 'need', scenario: 'generic', when: parseWhen(t, lang), scale: 1, tags: [], icon: '🤝', title: '', summary: '', context: '', originTags, foreign: Boolean(originTags) };
    const s = scenarios.find(sc => sc.test(t));
    base.scenario = s.key;
    return s.build(t, base);
  }

  /* ---- Etapa 2: detectar necesidades (dichas y no dichas) ---- */
  function need(id, es, en, opts) {
    return Object.assign({ id, label: es, labelEn: en, kinds: [], tags: [], priority: 'likely', strategy: 'main', ask: '', askEn: '' }, opts);
  }

  function discoverNeeds(u) {
    const base = baseNeeds(u);
    return applyCommunityStructure(u, base);
  }

  /* La estructura social de cada comunidad añade o quita necesidades. */
  function applyCommunityStructure(u, needs) {
    const structure = (State.community() && State.community().structure) || { recurring: [], suppress: {} };
    const suppressed = new Set((structure.suppress && structure.suppress[u.scenario]) || []);
    const result = needs.filter(n => !suppressed.has(n.id));
    (structure.recurring || []).forEach(r => {
      const fires = r.triggers.includes('*') ? u.kind === 'need' : r.triggers.includes(u.scenario);
      if (!fires) return;
      if (r.when === 'foreign' && !u.originTags) return;
      if (result.some(n => n.id === r.id)) return;
      const tags = r.when === 'foreign' ? u.originTags : (r.originAware && u.originTags ? r.tags.concat(u.originTags) : r.tags);
      result.push(need(r.id, r.label, r.labelEn || r.label, {
        kinds: r.kinds, tags, priority: r.priority || 'likely', strategy: r.strategy || 'main',
        why: r.why || '', whyEn: r.whyEn || r.why || '', ask: r.ask || '', askEn: r.askEn || r.ask || '', recurring: true
      }));
    });
    return result;
  }

  function baseNeeds(u) {
    switch (u.scenario) {
      case 'package': {
        const window = u.when.label || 'pronto';
        return [
          need('receive', `Alguien en tu edificio ${window}`, `Someone in your building ${window}`, {
            kinds: ['time'], tags: ['paquete'], priority: 'core', when: u.when,
            why: 'Para recibir el paquete por ti', whyEn: 'To receive the package for you',
            ask: '¿Podrías recibirlo por mí?', askEn: 'Could you receive it for me?'
          })
        ];
      }
      case 'mexican': {
        const needs = [
          need('outfit', 'Algo mexicano que ponerte', 'Something Mexican to wear', {
            kinds: ['object'], tags: ['mexican-outfit'], priority: 'core',
            why: 'Nadie espera que lo compres', whyEn: 'Nobody expects you to buy it',
            ask: '¿Me prestarías algo para la fiesta?', askEn: 'Could I borrow something for the party?'
          }),
          need('guidance', 'Alguien que te explique qué es apropiado', 'Someone to explain what is appropriate', {
            kinds: ['knowledge'], tags: ['mexican-culture', 'que-llevar'], priority: 'core',
            why: 'Qué llevar, cómo se celebra, qué esperar', whyEn: 'What to bring, how it is celebrated, what to expect',
            ask: '¿Me explicarías qué sería apropiado llevar y qué esperar?', askEn: 'Could you explain what would be appropriate to bring and what to expect?'
          }),
          need('company', 'Alguien que vaya a la misma fiesta', 'Someone going to the same party', {
            kinds: ['context'], tags: ['mexican-party'], priority: 'likely',
            why: 'Llegar acompañado cambia todo', whyEn: 'Arriving with someone changes everything',
            ask: '¿Podríamos llegar juntos?', askEn: 'Could we go together?'
          })
        ];
        return needs;
      }
      case 'gathering': {
        const n = u.scale;
        const needs = [];
        if (u.bbq) {
          needs.push(need('cooler', 'Una hielera grande', 'A large cooler', { kinds: ['object'], tags: ['hielera'], priority: 'core', why: `Bebidas para ${n}`, ask: '¿Me prestarías tu hielera?' }));
          needs.push(need('grill-tools', 'Pinzas y utensilios de asador', 'Grill tools', { kinds: ['object'], tags: ['asador-tools', 'pinzas'], priority: 'core', why: 'Casi nadie las tiene a la mano', ask: '¿Me prestarías tus pinzas y utensilios de asador?' }));
          needs.push(need('meat', 'Dónde comprar buena carne para asar', 'Where to buy good meat', { kinds: ['contact', 'knowledge'], tags: ['carniceria', 'carne'], priority: 'core', why: 'Y qué cortes pedir', ask: '¿Me recomendarías dónde comprar la carne y qué cortes pedir?' }));
          needs.push(need('charcoal', 'Carbón', 'Charcoal', { kinds: ['object'], tags: ['carbon'], priority: 'core', why: 'Se acaba siempre', ask: '¿Te sobra carbón?' }));
        }
        if (n >= 8) needs.push(need('table', 'Una mesa extra', 'An extra table', { kinds: ['object'], tags: ['mesa', 'table'], priority: 'likely', why: `Para ${n} no alcanza una`, whyEn: `One is not enough for ${n}`, ask: '¿Me prestarías tu mesa plegable?', askEn: 'Could I borrow your folding table?' }));
        if (n >= 6) needs.push(need('chairs', `Sillas extra (unas ${Math.max(2, n - 4)})`, `Extra chairs (about ${Math.max(2, n - 4)})`, { kinds: ['object'], tags: ['sillas', 'chairs'], priority: 'likely', why: 'Siempre faltan', whyEn: 'There are never enough', ask: '¿Me prestarías tus sillas plegables?', askEn: 'Could I borrow your folding chairs?' }));
        needs.push(need('speaker', 'Una bocina', 'A speaker', { kinds: ['object'], tags: ['bocina'], priority: 'likely', why: 'Música', ask: '¿Me prestarías tu bocina?' }));
        needs.push(need('prep', u.bbq ? 'Manos para preparar salsas y guarniciones' : 'Manos para cocinar y servir', 'Hands to help cook and serve', { kinds: ['skill'], tags: ['cocinar', 'preparar', 'cook'], priority: 'likely', why: `Para ${n} es mucho para una persona`, whyEn: `${n} is a lot for one person`, ask: '¿Me ayudarías un rato a cocinar?', askEn: 'Could you help me cook for a bit?' }));
        return needs;
      }
      case 'space':
        return [
          need('space', 'Un espacio común donde caber todos', 'A common space that fits everyone', { kinds: ['place'], tags: ['salon', 'espacio', 'reunion', 'reunirnos', 'roof'], priority: 'core', why: 'El residencial ya tiene lugares comunes', whyEn: 'The residence already has common spaces', ask: '' }),
          need('chairs', 'Sillas extra por si faltan', 'Extra chairs just in case', { kinds: ['object'], tags: ['sillas', 'silla', 'chairs'], priority: 'optional', why: 'Casi siempre faltan', whyEn: 'There are never enough', ask: '¿Me prestarías tus sillas plegables?', askEn: 'Could I borrow your folding chairs?' }),
          need('speaker', 'Una bocina', 'A speaker', { kinds: ['object'], tags: ['bocina', 'speaker'], priority: 'optional', why: 'Opcional', whyEn: 'Optional', ask: '¿Me prestarías tu bocina?', askEn: 'Could I borrow your speaker?' })
        ];
      case 'bike':
        return [
          need('mechanic', 'Alguien que sepa repararla', 'Someone who can repair it', { kinds: ['skill'], tags: ['reparar-bici'], priority: 'core', strategy: 'repair', why: 'Ponchaduras, cadena, frenos', ask: '¿Podrías echarle un ojo a mi bici hoy?' }),
          need('tools', 'Herramientas', 'Tools', { kinds: ['object'], tags: ['herramientas', 'llaves'], priority: 'likely', strategy: 'repair', why: 'Por si hacen falta', ask: '¿Me prestarías tus herramientas un rato?' }),
          need('loaner', 'Una bici prestada mientras tanto', 'A bike to borrow meanwhile', { kinds: ['object'], tags: ['bici', 'bicicleta'], priority: 'core', strategy: 'lend', why: 'Para mañana', ask: '¿Me prestarías tu bici mañana?' }),
          need('shop', 'Un taller de confianza', 'A trusted repair shop', { kinds: ['contact'], tags: ['taller-bici'], priority: 'core', strategy: 'shop', why: 'Que arregle el mismo día', ask: '¿Me pasarías el dato del taller que conoces?' })
        ];
      case 'appointment':
        return [
          need('ride', 'Alguien con coche que pueda llevar y traer', 'Someone with a car to drive there and back', { kinds: ['route', 'skill'], tags: ['coche', 'llevar', 'transporte', 'clinica', 'car'], priority: 'core', when: u.when, why: 'Ida y vuelta', whyEn: 'There and back', ask: '¿Podrías llevarnos y traernos en tu coche?', askEn: 'Could you drive us there and back?' }),
          need('company', 'Alguien de confianza que acompañe durante la cita', 'Someone trusted to stay during the appointment', { kinds: ['time', 'skill'], tags: ['acompanar', 'acompañar', 'cita'], priority: u.other || u.alone ? 'core' : 'likely', when: u.when, context: 'elder', sensitive: true, why: 'Para no esperar sola', whyEn: 'So nobody waits alone', ask: u.other ? '¿Podrías acompañarla en la consulta?' : '¿Podrías acompañarme en la consulta?', askEn: 'Could you stay during the appointment?' })
        ].map(n => Object.assign(n, { context: n.context || 'rides', sensitive: true }));
      case 'costume':
        return [
          need('suit', `El traje${u.costume ? ' de ' + u.costume : ''}`, `The ${u.costume || ''} suit`, { kinds: ['object'], tags: ['disfraz', u.costume || 'disfraz', 'costume'], priority: 'core', context: 'family', why: 'Alguien ya tiene uno guardado', whyEn: 'Someone already has one put away', ask: '¿Nos prestarías el disfraz para mañana?', askEn: 'Could we borrow the costume for tomorrow?' }),
          need('helmet', 'El casco o el accesorio clave', 'The helmet or key accessory', { kinds: ['object'], tags: ['casco', 'helmet', 'accesorio-disfraz'], priority: 'likely', context: 'family', why: 'Es lo que hace el disfraz', whyEn: 'It is what makes the costume', ask: '¿Nos prestarías el casco?', askEn: 'Could we borrow the helmet?' }),
          need('materials', 'Materiales para improvisar lo que falte', 'Materials to improvise the rest', { kinds: ['object'], tags: ['carton', 'cinta', 'pintura', 'materiales', 'aluminio'], priority: 'likely', context: 'family', why: 'Cartón, cinta plateada, pintura', whyEn: 'Cardboard, silver tape, paint', ask: '¿Te sobra cartón y cinta plateada?', askEn: 'Do you have spare cardboard and silver tape?' }),
          need('knowhow', 'Alguien que ya lo hizo', 'Someone who already made one', { kinds: ['knowledge', 'skill'], tags: ['disfraz', 'manualidades', 'costura', 'costume'], priority: 'optional', context: 'family', why: 'Un tip vale más que una compra', whyEn: 'A tip beats a purchase', ask: '¿Nos darías un par de tips de cómo lo armaste?', askEn: 'Could you give us a couple of tips on how you made it?' })
        ];
      case 'garment':
        return [
          need('dress', `Un vestido largo${u.size ? ' talla ' + u.size : ''}`, `A long dress${u.size ? ' size ' + u.size : ''}`, { kinds: ['object'], tags: ['vestido', 'dress', u.size ? `talla-${u.size.toLowerCase()}` : 'vestido'], priority: 'core', context: 'objects', why: 'De alguien de tu círculo', whyEn: 'From someone in your circle', ask: '¿Me prestarías tu vestido para el sábado?', askEn: 'Could I borrow your dress for Saturday?' }),
          need('bag', 'Una bolsa de noche', 'An evening bag', { kinds: ['object'], tags: ['bolsa', 'clutch', 'bag'], priority: 'likely', context: 'objects', why: 'Para completar el look', whyEn: 'To complete the look', ask: '¿Me prestarías tu bolsa de noche?', askEn: 'Could I borrow your evening bag?' }),
          need('accessories', 'Accesorios', 'Accessories', { kinds: ['object'], tags: ['accesorios', 'aretes', 'collar', 'joyeria', 'accessories'], priority: 'likely', context: 'objects', why: 'Aretes, collar', whyEn: 'Earrings, necklace', ask: '¿Me prestarías unos accesorios?', askEn: 'Could I borrow some accessories?' }),
          need('shoes', 'Zapatos', 'Shoes', { kinds: ['object'], tags: ['zapatos', 'tacones', 'shoes', 'heels'], priority: 'optional', context: 'objects', why: 'Opcional', whyEn: 'Optional', ask: '¿Tendrías unos tacones de mi número?', askEn: 'Would you have heels in my size?' })
        ];
      case 'ride':
        return [
          need('ride', `Alguien que vaya hacia allá${u.when.label ? ' ' + u.when.label : ''}`, `Someone heading that way${u.when.label ? ' ' + u.when.label : ''}`, { kinds: ['route'], tags: ['coche', 'ride', 'llevar', 'transporte', 'car'].concat(u.to ? [u.to] : []), priority: 'core', when: u.when, context: 'rides', why: 'Trayecto compatible y de confianza', whyEn: 'A compatible trip with someone you trust', ask: '¿Me darías ride si vas para allá?', askEn: 'Could you give me a ride if you are heading that way?' })
        ];
      case 'paperwork':
        return [
          need('guide', 'Alguien que ya hizo este trámite y sepa qué llevar', 'Someone who already did this and knows what to bring', { kinds: ['knowledge'], tags: ['tramite', 'tramites', 'nie', 'tie', 'empadronamiento', 'extranjeria', 'paperwork', 'visa'], priority: 'core', why: 'Qué papeles, dónde, cuánto tarda', whyEn: 'Which papers, where, how long', ask: '¿Me explicarías cómo lo hiciste y qué llevar?', askEn: 'Could you walk me through how you did it and what to bring?' }),
          need('company', 'Alguien que te acompañe a la cita', 'Someone to go with you to the appointment', { kinds: ['time'], tags: ['acompanar', 'acompañar', 'cita', 'extranjeria'], priority: 'likely', why: 'La primera vez impone', whyEn: 'The first time is intimidating', ask: '¿Me acompañarías a la cita?', askEn: 'Would you come with me to the appointment?' })
        ];
      case 'pet':
        return [
          need('sitter', u.away ? 'Alguien que cuide a tu mascota en su casa' : 'Alguien que pasee o cuide a tu mascota', u.away ? 'Someone to look after your pet at their place' : 'Someone to walk or look after your pet', { kinds: ['skill'], tags: ['mascota', 'perro', 'gato', 'cuidar', 'pasear', 'pet', 'dog'], priority: 'core', why: 'Con tiempo y cariño', whyEn: 'With time and care', ask: '¿Podrías cuidarla mientras no estoy?', askEn: 'Could you look after them while I am away?' }),
          need('gear', 'Transportadora o correa de repuesto', 'Carrier or spare leash', { kinds: ['object'], tags: ['transportadora', 'correa'], priority: 'optional', why: 'Opcional', whyEn: 'Optional', ask: '¿Me prestarías la transportadora?', askEn: 'Could I borrow the carrier?' })
        ];
      case 'household':
        return [
          need('fixer', 'Alguien que sepa hacer el arreglo', 'Someone who knows how to fix it', { kinds: ['skill'], tags: ['reparar', 'arreglar', 'foco', 'electricidad', 'instalar', 'colgar', 'cambiar'], priority: 'core', why: 'Y que se pueda subir', whyEn: 'And who can climb', ask: '¿Podrías pasar a echarle un ojo?', askEn: 'Could you come take a look?' }),
          need('ladder', 'Una escalera', 'A ladder', { kinds: ['object'], tags: ['escalera', 'ladder'], priority: 'likely', why: 'Para llegar', whyEn: 'To reach', ask: '¿Me prestarías tu escalera?', askEn: 'Could I borrow your ladder?' }),
          need('tools', 'Herramientas', 'Tools', { kinds: ['object'], tags: ['herramientas', 'herramienta', 'tools'], priority: 'optional', why: 'Por si hacen falta', whyEn: 'Just in case', ask: '¿Me prestarías tus herramientas?', askEn: 'Could I borrow your tools?' })
        ];
      case 'moving':
        return [
          need('hands', 'Manos para cargar', 'Hands to carry', { kinds: ['skill'], tags: ['cargar', 'mover', 'mudanza', 'pesado', 'subir', 'carry', 'move'], priority: 'core', when: u.when, why: 'Mínimo dos personas', whyEn: 'At least two people', ask: '¿Me ayudarías a cargar?', askEn: 'Could you help me carry?' }),
          need('vehicle', 'Un coche o camioneta', 'A car or van', { kinds: ['route', 'object'], tags: ['coche', 'camioneta', 'car', 'transporte', 'mudanza'], priority: 'likely', why: 'Si hay que cruzar la ciudad', whyEn: 'If it has to cross town', ask: '¿Podrías ayudarme con tu coche?', askEn: 'Could you help with your car?' }),
          need('tools', 'Herramientas para desarmar', 'Tools to take things apart', { kinds: ['object'], tags: ['herramientas', 'herramienta', 'taladro', 'tools', 'drill'], priority: 'optional', why: 'Opcional', whyEn: 'Optional', ask: '¿Me prestarías tus herramientas?', askEn: 'Could I borrow your tools?' })
        ];
      case 'generic':
        return u.tags.length ? [
          need('generic', `Alguien que sepa, tenga o pueda ayudar con ${u.tags.slice(0, 3).join(', ')}`, `Someone who can help with ${u.tags.slice(0, 3).join(', ')}`, {
            kinds: ['object', 'skill', 'knowledge', 'contact', 'food', 'time'], tags: u.tags, priority: 'core',
            why: '', ask: '¿Crees que podrías ayudarme?', askEn: 'Do you think you could help me?'
          })
        ] : [];
      default:
        return [];
    }
  }

  /* ---- Etapa 3: buscar capacidades en el grafo ---- */
  const STRATEGIES = {
    main: { label: 'Una solución combinada', labelEn: 'A combined solution' },
    repair: { label: 'Repararla hoy', labelEn: 'Repair it today', summary: 'Alguien que sabe y herramientas a la mano.' },
    lend: { label: 'Una bici prestada mientras tanto', labelEn: 'Borrow a bike meanwhile', summary: 'Resuelves mañana y reparas con calma.' },
    shop: { label: 'Un taller de confianza', labelEn: 'A trusted shop', summary: 'Recomendado por un vecino; arreglan el mismo día.' }
  };

  /* Coincidencia exacta vale 1; una raíz compartida ("bici" ~ "bicicleta") vale 0.5. */
  function tagHit(capTags, needTags) {
    return needTags.reduce((sum, nt) => {
      if (capTags.includes(nt)) return sum + 1;
      const stem = capTags.some(ct => Math.min(ct.length, nt.length) >= 4 && (ct.startsWith(nt) || nt.startsWith(ct)));
      return sum + (stem ? 0.5 : 0);
    }, 0);
  }

  /* Distancia aproximada vía Matching/LocationService (GPS, zona o semilla). */
  function distanceOf(person) {
    return typeof Matching !== 'undefined' ? Matching.distanceFor(person) : person.distance;
  }

  /* Radio máximo activo (Matching.setDefaultRadius(null) lo quita). Distancia desconocida no excluye. */
  function withinRadius(d) {
    const r = typeof Matching !== 'undefined' ? Matching.getDefaultRadius() : null;
    return r == null || d == null || d <= r;
  }

  function distanceBonus(d) {
    if (d == null) return 1;
    if (d === 0) return 3;
    if (d <= 100) return 2.5;
    if (d <= 150) return 2;
    if (d <= 250) return 1;
    return 0.5;
  }

  /* Devuelve la franja que cubre la ventana pedida, o null. */
  function availabilityFor(person, when) {
    if (!when || when.day === null) {
      return person.routines[0] || null;
    }
    const from = when.from === null ? 12 : when.from;
    const to = when.to === null ? from + 1 : when.to;
    const slots = person.routines.filter(r => r.days.includes(when.day) && r.from <= from && r.to >= to);
    if (!slots.length) return null;
    /* Preferimos una rutina (más sorprendente) sobre una disponibilidad declarada. */
    return slots.find(s => s.source === 'routine') || slots[0];
  }

  function because(person, capability, needItem, slot, lang) {
    const en = lang === 'en';
    const parts = [];
    if (needItem.kinds.includes('time') && slot) {
      const w = needItem.when;
      const slotLower = ((en && slot.labelEn) || slot.label).charAt(0).toLowerCase() + ((en && slot.labelEn) || slot.label).slice(1);
      if (slot.source === 'routine' && w && w.dayName && (w.offset === 0 || w.offset === 1)) {
        parts.push(en
          ? `${cap(w.short)} is ${w.dayName} and ${person.name} ${slotLower}.`
          : `${cap(w.short)} es ${w.dayName} y ${person.name} ${slotLower}.`);
      } else if (slot.source === 'routine' && w && w.dayName) {
        parts.push(`${cap(w.short)}, ${person.name} ${slotLower}.`);
      } else {
        parts.push(`${person.name} ${slotLower}.`);
      }
    } else {
      parts.push(`${(en && capability.labelEn) || capability.label}.`);
      if (slot && slot.source === 'routine') {
        const w = needItem.when;
        const slotLower = slot.label.charAt(0).toLowerCase() + slot.label.slice(1);
        if (w && w.dayName && (w.offset === 0 || w.offset === 1)) parts.push(en ? `${cap(w.short)} is ${w.dayName} and ${person.name} ${slotLower}.` : `${cap(w.short)} es ${w.dayName} y ${person.name} ${slotLower}.`);
        else if (w && w.dayName) parts.push(`${cap(w.short)}, ${person.name} ${slotLower}.`);
      }
    }
    if (capability.evidence && capability.evidence.count) parts.push(`${(en && capability.evidence.labelEn) || capability.evidence.label}.`);
    return parts.join(' ');
  }

  function discoverCapabilities(graph, needs, u) {
    const candidates = {};
    needs.forEach(n => {
      const list = [];
      graph.people.forEach(person => {
        const distance = distanceOf(person);
        if (!withinRadius(distance)) return;
        person.capabilities.forEach(capability => {
          if (!n.kinds.includes(capability.kind)) return;
          const hits = tagHit(capability.tags, n.tags);
          if (!hits) return;
          let slot = null;
          if (capability.needsAvailability || n.kinds.includes('time')) {
            slot = availabilityFor(person, n.when || u.when);
            if (!slot) return;
          }
          const evidence = capability.evidence ? capability.evidence.count : 0;
          let score = 10 + hits * 2 + evidence * 0.8 + distanceBonus(distance) + (person.completed || 0) / 10;
          if (slot && slot.source === 'routine') score += 1;
          /* Confianza + círculos + verificación: reponderan según la situación (Trust.PROFILES). */
          let why = because(person, capability, n, slot, u.lang);
          let trust = null;
          if (typeof Trust !== 'undefined') {
            trust = Trust.relevance(person, capability, n, u, { distance, available: Boolean(slot) });
            if (trust.blocked) return;
            score += trust.bonus;
          }
          /* La señal humana de confianza ("Ya se han ayudado 3 veces") viaja aparte: la tarjeta la muestra como línea propia. */
          list.push({ personId: person.id, capabilityId: capability.id, score, slotSource: slot ? slot.source : null, distance, because: why, trust: trust ? { strength: trust.strength, context: trust.context, signal: trust.signal } : null });
        });
      });
      list.sort((a, b) => b.score - a.score);
      candidates[n.id] = list;
    });
    return candidates;
  }

  /* ---- Etapa 3b: Place Capabilities ----
     El lugar también puede ayudar. Por necesidad, candidatos de lugar
     (recepción 24 h, área de paquetes, bicicletero, salón común, elevador…).
     `covers`: el lugar resuelve la necesidad por sí mismo; si no, complementa. */
  function discoverPlaces(needs, u) {
    const out = {};
    if (typeof Places === 'undefined') return out;
    needs.forEach(n => {
      const list = Places.match(n, { lang: u.lang });
      out[n.id] = list.filter(c => c.covers || c.helps).slice(0, 3);
    });
    return out;
  }

  /* ---- Etapa 4: armar soluciones ---- */
  const PRIORITY = { core: 0, likely: 1, optional: 2 };

  function buildSolutions(needs, candidates, u, places = {}) {
    const groups = {};
    const order = {};
    needs.forEach((n, i) => {
      if (!groups[n.strategy]) { groups[n.strategy] = []; order[n.strategy] = i; }
      groups[n.strategy].push(n);
    });

    return Object.entries(groups).map(([key, groupNeeds]) => {
      const usedCapabilities = new Set();
      const people = [];
      const extraPeople = [];
      const steps = [];
      const gaps = [];
      const extras = [];
      groupNeeds.slice().sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority]).forEach(n => {
        const options = (candidates[n.id] || []).filter(c => !usedCapabilities.has(c.capabilityId));
        if (!options.length) {
          if (n.priority !== 'optional') gaps.push(n.id);
          return;
        }
        /* Consolidar: si una persona ya está en la solución, preferirla ante empate razonable. */
        const best = options.map(c => Object.assign({}, c, { adj: c.score + (people.includes(c.personId) ? 1.5 : 0) }))
          .sort((a, b) => b.adj - a.adj)[0];
        usedCapabilities.add(best.capabilityId);
        const optional = n.priority === 'optional';
        const bucket = optional ? extraPeople : people;
        if (!bucket.includes(best.personId)) bucket.push(best.personId);
        const alternatives = options.filter(c => c.personId !== best.personId).slice(0, 2).map(c => c.personId);
        const step = { needId: n.id, personId: best.personId, capabilityId: best.capabilityId, because: best.because, slotSource: best.slotSource, alternatives, optional };
        if (optional) extras.push(step); else steps.push(step);
      });
      /* Place Capabilities: un lugar cubre lo que ninguna persona cubrió (salón común, área de
         paquetes) o complementa a la persona (bicicletero, elevador de carga, punto de encuentro). */
      const placeSteps = [];
      const seenAmenity = new Set();
      groupNeeds.forEach(n => {
        const best = (places[n.id] || []).find(c => !seenAmenity.has(c.amenityId));
        if (!best) return;
        const byPerson = steps.concat(extras).some(st => st.needId === n.id);
        const covers = !byPerson && best.covers;
        if (!covers && !(best.covers || best.helps)) return;
        if (placeSteps.length >= 3 && !covers) return;
        seenAmenity.add(best.amenityId);
        const gapIdx = gaps.indexOf(n.id);
        if (covers && gapIdx >= 0) gaps.splice(gapIdx, 1);
        placeSteps.push({ needId: n.id, placeId: best.placeId, amenityId: best.amenityId, type: best.type, icon: best.icon, label: best.label,
          buildingLabel: best.buildingLabel, because: best.because, covers, optional: n.priority === 'optional' });
      });
      const countable = groupNeeds.filter(n => n.priority !== 'optional');
      const strategy = STRATEGIES[key] || STRATEGIES.main;
      const placeCovered = placeSteps.filter(p => p.covers && !p.optional).length;
      return {
        key, order: order[key],
        label: u.lang === 'en' ? strategy.labelEn : strategy.label,
        summary: strategy.summary || '',
        steps, extras, gaps, people, extraPeople, placeSteps,
        coverage: { covered: steps.length + placeCovered, total: countable.length },
        score: steps.reduce((s, st) => s + (candidates[st.needId].find(c => c.capabilityId === st.capabilityId) || { score: 0 }).score, 0)
      };
    });
  }

  /* ---- Etapa 5: ordenar ---- */
  function rankSolutions(solutions) {
    return solutions.slice().sort((a, b) => {
      const ra = a.coverage.total ? a.coverage.covered / a.coverage.total : 0;
      const rb = b.coverage.total ? b.coverage.covered / b.coverage.total : 0;
      if (rb !== ra) return rb - ra;
      return a.order - b.order;
    }).filter(s => s.steps.length || s.extras.length || (s.placeSteps || []).some(p => p.covers));
  }

  /* ---- Oportunidades: situaciones abiertas de otros que tu situación resuelve ---- */
  function discoverOpportunities(graph, u) {
    const list = [];
    graph.people.forEach(person => {
      person.open.forEach(o => {
        let fit = 0;
        if (u.kind === 'opportunity' && o.place === u.place) fit = 10;
        else if (u.kind === 'offer') fit = tagHit(o.tags || [], u.tags) * 5;
        if (fit) list.push({ openId: o.id, personId: person.id, title: o.title, text: o.text, fit: fit + distanceBonus(distanceOf(person)) });
      });
    });
    return list.sort((a, b) => b.fit - a.fit);
  }

  /* ---- Orquestación ---- */
  function resolve(situation, graph) {
    const u = situation.understanding;
    if (u.kind !== 'need') {
      return { needs: [], solutions: [], opportunities: discoverOpportunities(graph, u) };
    }
    const excluded = new Set(situation.excluded || []);
    const needs = situation.needs.filter(n => !excluded.has(n.id));
    const candidates = discoverCapabilities(graph, needs, u);
    const places = discoverPlaces(needs, u);
    const solutions = rankSolutions(buildSolutions(needs, candidates, u, places));
    return { needs, solutions, opportunities: [], places };
  }

  /* El titular del momento "yo no sabía que alguien cerca podía resolver esto". */
  function headline(solutions, u, personOf) {
    const en = u.lang === 'en';
    if (!solutions.length) return en ? "We couldn't find a way yet." : 'Todavía no encontramos cómo resolverlo.';
    if (solutions.length > 1) {
      const anyGap = solutions.some(s => s.gaps.length);
      return en
        ? `There are ${solutions.length} ways to solve this.${anyGap ? '' : ' None of them involves buying anything.'}`
        : `Hay ${solutions.length} formas de resolverlo.${anyGap ? '' : ' Ninguna implica comprar nada.'}`;
    }
    const s = solutions[0];
    const { covered, total } = s.coverage;
    const placeCover = (s.placeSteps || []).find(p => p.covers && !p.optional);
    if (!s.people.length && placeCover) {
      return en
        ? `The place itself can solve this: ${placeCover.label} in ${placeCover.buildingLabel}.`
        : `El lugar mismo puede resolverlo: ${placeCover.label.toLowerCase()} en ${placeCover.buildingLabel}.`;
    }
    if (u.scenario === 'garment' && s.people.length > 1) {
      return covered === total
        ? (en ? 'Your circle can put together the whole look.' : 'Tu círculo puede armarte el look completo.')
        : (en ? 'Your circle can solve almost everything you need.' : 'Tu círculo puede resolver casi todo lo que necesitas.');
    }
    if (u.scenario === 'costume' && s.people.length > 1) {
      return en ? `We can put it together without buying a new one, with ${s.people.length} families nearby.` : `Podemos armarlo sin comprar uno nuevo, entre ${s.people.length} familias cerca.`;
    }
    if (u.profile === 'care' && s.people.length) {
      const names = s.people.map(id => (personOf ? personOf(id) : null)).filter(Boolean).map(p => p.name);
      const list = en ? names.join(' and ') : names.join(' y ');
      return en ? `${list} can take care of this. People you already trust.` : `${list} ${names.length > 1 ? 'pueden' : 'puede'} resolverlo. Gente en la que ya confías.`;
    }
    if (total >= 4) {
      if (en) {
        return covered === total
          ? `You don't need to buy anything. Your community already has all ${total} things you need.`
          : `You barely need to buy anything. Your community already has ${covered} of the ${total} things you need.`;
      }
      return covered === total
        ? `No necesitas comprar nada. Tu comunidad ya tiene las ${total} cosas que necesitas.`
        : `No necesitas comprar casi nada. Tu comunidad ya tiene ${covered} de las ${total} cosas que necesitas.`;
    }
    if (s.people.length > 1) {
      return en
        ? `We found a solution using ${s.people.length} people from your community.`
        : `Encontramos una solución con ${s.people.length} personas de tu comunidad.`;
    }
    const p = personOf ? personOf(s.people[0]) : null;
    if (!p) return en ? 'There is someone nearby who can solve this.' : 'Hay alguien cerca que puede resolverlo.';
    const same = p.distance === 0;
    return en
      ? `${p.name} can solve this${same ? ' from your own building' : ''}.`
      : `${p.name} puede resolverlo${same ? ' desde tu mismo edificio' : ''}.`;
  }

  /* ---- Mensaje sugerido por persona ---- */
  function buildMessage(u, needItems, person) {
    const en = u.lang === 'en';
    const list = Array.isArray(needItems) ? needItems : [needItems];
    const hello = en ? `Hi ${person.name} 👋` : `Hola ${person.name} 👋`;
    const asks = list.map(n => (en ? (n.askEn || n.ask) : n.ask)).filter(Boolean).join(' ');
    return `${hello} ${u.context} ${asks}`.replace(/\s+/g, ' ').trim();
  }

  function helpMessage(open, person) {
    return `Hola ${person.name} 👋 Vi que ${open.text.charAt(0).toLowerCase() + open.text.slice(1).replace(/\.$/, '')}. Voy para allá y puedo ayudarte.`;
  }

  function toPlace(label) {
    return label.startsWith('el ') ? `al ${label.slice(3)}` : `a ${label}`;
  }

  /* ---- Señales para "Tu comunidad hoy" ---- */
  function communityToday(graph) {
    const now = new Date();
    const day = now.getDay();
    const signals = [];

    const homeThisAfternoon = graph.people.filter(p => p.routines.some(r => r.days.includes(day) && r.from <= 15 && r.to >= 18));
    if (homeThisAfternoon.length) {
      const rest = homeThisAfternoon.length - 3;
      signals.push({ icon: '🏠', text: `${homeThisAfternoon.length} ${homeThisAfternoon.length === 1 ? 'persona estará' : 'personas estarán'} en casa esta tarde.`, sub: homeThisAfternoon.slice(0, 3).map(p => p.name).join(', ') + (rest > 0 ? ` y ${rest} más` : '') });
    }

    graph.people.forEach(p => p.routines.filter(r => r.route).forEach(r => {
      const place = State.places().find(pl => pl.id === r.route);
      const offset = (r.days[0] - day + 7) % 7;
      const when = offset === 0 ? 'hoy' : offset === 1 ? 'mañana' : `el ${DAYS[r.days[0]]}`;
      const waiting = graph.people.flatMap(q => q.open).filter(o => o.place === r.route).length;
      signals.push({ icon: '🚗', text: `${p.name} va ${toPlace(place ? place.label : r.route)} ${when}.`, sub: waiting ? `${waiting} ${waiting === 1 ? 'vecino espera' : 'vecinos esperan'} algo de ahí.` : '' });
    }));

    const byPlace = {};
    graph.people.forEach(p => p.open.forEach(o => { if (o.place) (byPlace[o.place] = byPlace[o.place] || []).push(p.name); }));
    const top = Object.entries(byPlace).sort((a, b) => b[1].length - a[1].length)[0];
    if (top) {
      const place = State.places().find(pl => pl.id === top[0]);
      signals.push({ icon: '🛍️', text: `${top[1].join(' y ')} ${top[1].length === 1 ? 'tiene' : 'tienen'} pendientes en ${place.label}.`, sub: '¿Vas a ir? Cuéntanos arriba.', prompt: `Voy ${toPlace(place.label)} mañana.` });
    }

    const personal = graph.people.flatMap(p => p.open.filter(o => !o.place).map(o => ({ p, o })));
    personal.slice(0, 2).forEach(({ p, o }) => signals.push({ icon: '👋', text: `${p.name} ${o.text.charAt(0).toLowerCase() + o.text.slice(1)}`, sub: '' }));

    return signals.slice(0, 5);
  }

  return {
    understandSituation, discoverNeeds, discoverCapabilities, discoverPlaces, buildSolutions, rankSolutions, discoverOpportunities,
    resolve, headline, buildMessage, helpMessage, communityToday, normalize, DAYS
  };
})();
