# Entre Todos · Replanteamiento del MVP

Documento de análisis previo al refactor. Fecha: 17 de septiembre de 2026.

Tesis: el MVP actual es un buen prototipo de **"pide algo y te decimos quién lo tiene"**. Eso ya existe (Buy Nothing, OLIO, Nextdoor, grupos de WhatsApp). Lo que no existe es un sistema que reciba una **situación** y devuelva una **solución armada con la capacidad ociosa de la comunidad**. El refactor mueve el producto de *matching de recursos* a *resolución de situaciones*.

---

## 1. Diagnóstico del MVP actual

### Qué funciona (y se conserva)

| Pieza | Por qué funciona |
| --- | --- |
| Input en lenguaje natural en el Inicio | Ya es la puerta correcta. Solo hay que quitarle competencia. |
| Secuencia "Entendiendo… → Buscando cerca…" | Da sensación de comprensión sin hablar de IA. |
| Momento "Parece que vas a IKEA" | Es el único flujo que hoy entiende una **oportunidad**, no un pedido. Es la semilla del nuevo producto. |
| Señales de confianza sin estrellas | Alineado con el nuevo posicionamiento. |
| Privacidad (piso/torre, nunca departamento) | Correcto para comunidades cerradas. |
| Identidad visual cálida, sin estética "AI app" | Se mantiene íntegra. |
| Accesibilidad, responsive, localStorage, módulos vanilla | Base técnica sana. |

### Qué está mal posicionado

1. **La Home compite consigo misma.** Debajo del input hay tres tarjetas ("Necesito algo", "Necesito ayuda", "Tengo algo para compartir") y un bloque de impacto. Las tarjetas son categorías; obligan a pensar "¿esto es un objeto o una ayuda?" antes de escribir.
2. **El resultado es una lista de personas, no una solución.** "Encontré 3 personas" con un botón "Pedir prestado" en cada una es un buscador de directorio. Nunca combina personas ni infiere necesidades que el usuario no escribió.
3. **La tarjeta "Lo entendí así" expone categorías internas.** Filas como "Tipo de ayuda: Préstamo" son metadatos del sistema, no comprensión de la situación.
4. **Solo entiende lo que el usuario nombra.** "Carne asada para 12" hoy cae en el intérprete genérico y busca la palabra "carne". No deduce hielera, mesa, sillas, bocina.
5. **Una necesidad → una persona.** No hay noción de solución compuesta ni de estrategias alternativas.

### Qué se parece demasiado a productos existentes

| Parte del MVP | Se parece a | Por qué |
| --- | --- | --- |
| "Tengo algo para compartir" con radios Objeto / Comida / Tiempo / Conocimiento / Ayuda | Buy Nothing, OLIO | Es crear un listing. Publicar → aparece en un feed → alguien lo pide. |
| "Cerca de ti" con filtros por tipo y botón "Pedir" | OLIO, Facebook Marketplace | Feed de cosas publicadas recientemente. |
| Historia "Un taladro" | Cualquier app de préstamo | Búsqueda por palabra clave. |
| Historia "Compartir comida" | OLIO | Es literalmente el core de OLIO. |
| Bloque "Este mes, juntos: kg de comida compartida, objetos reutilizados" | OLIO | Vanity metrics de economía circular. |
| "Mis conexiones" con tabs Solicitudes / Ayudando / Completadas | Bandeja de un marketplace | Es un inbox transaccional. |
| `findMatches(keyword)` | Todo lo anterior | Matching por palabras clave entre pedido y listing. |

### Diagnóstico técnico

- `matching.js` es un clasificador de escenarios + puntuación por keywords. No hay etapa de "qué necesita realmente esta persona".
- El modelo de datos es `resident.offers[]` con keywords: son **anuncios**, no capacidades. No hay disponibilidad estructurada, ni rutinas, ni evidencia de comportamiento.
- Los servicios de Supabase (`needs`, `resources`, `requests`) codifican el modelo marketplace en el esquema. Migrar a ellos consolidaría el posicionamiento equivocado.

---

## 2. Nueva propuesta de valor

**Una frase**
Dinos qué necesitas resolver. Encontramos quién o qué cerca puede ayudarte.

**Un párrafo**
Entre Todos es una capa entre una persona y la capacidad colectiva de su comunidad. No publicas anuncios ni buscas en categorías: describes una situación cotidiana con tus palabras ("voy a hacer una carne asada para 12", "se me rompió la bici y la necesito mañana") y Entre Todos entiende qué hace falta, descubre qué personas, objetos, conocimientos, tiempos y trayectos ya existen cerca, y te propone una solución armada, muchas veces con varias personas a la vez. También funciona al revés: si dices "voy a IKEA mañana", descubre a quién puedes ayudar con un trayecto que ya vas a hacer.

**Elevator pitch**
Cada comunidad tiene muchísima capacidad ociosa: sillas guardadas, alguien que sabe arreglar bicis, alguien que trabaja desde casa los jueves, alguien que va a Costco cada sábado. Hoy usarla exige saber exactamente qué pides, a quién y dónde. Entre Todos elimina esa fricción: tú describes la situación y el sistema arma la solución con lo que tu comunidad ya tiene. La inteligencia no es una función visible; es que la app entiende y resuelve. Y cada situación resuelta enseña al sistema algo nuevo sobre la comunidad, así que resolver la siguiente es más fácil. No es una red social ni un marketplace de vecinos: es una nueva interfaz entre una persona y su comunidad.

---

## 3. Jobs To Be Done

1. **Cuando tengo un imprevisto cotidiano con fecha** (paquete, bici rota, algo que llega mañana), quiero resolverlo sin averiguar a quién preguntar, para no perder tiempo ni comprar algo que alguien cerca ya tiene.
2. **Cuando organizo algo más grande que yo** (una reunión, una comida para 12), quiero saber qué me falta y quién lo tiene, para no comprar cosas que usaré una vez.
3. **Cuando estoy en un contexto que no entiendo** (soy extranjero, es mi primera Noche Mexicana), quiero orientación de alguien que lo vive, para no equivocarme ni sentirme fuera de lugar.
4. **Cuando ya voy a hacer un trayecto o tengo tiempo libre**, quiero que me digan a quién le sirve, para ayudar sin esfuerzo extra.
5. **Cuando alguien me pide algo**, quiero que la solicitud llegue con contexto y ya armada, para decir que sí en segundos.

---

## 4. El producto nuevo: cómo funciona

```
Situación                "Voy a hacer una carne asada para 12."
   ↓
Entender contexto        evento · comida · 12 personas · en casa · este fin de semana
   ↓
Detectar necesidades     hielera · mesa · sillas · bocina · pinzas · dónde comprar carne · manos para preparar · carbón
   ↓
Buscar capacidades       en el Community Resource Graph: objetos, habilidades, saberes, rutinas, trayectos, contactos
   ↓
Armar solución           Carlos (hielera) · Ana (mesa) · Mariana (4 sillas) · Jorge (bocina + carnicería) · Diego (pinzas) · Valeria (ayuda a preparar)
   ↓
Momento wow              "No necesitas comprar casi nada. Tu comunidad ya tiene 7 de las 8 cosas."
   ↓
Autorización             el usuario revisa los mensajes por persona y decide a quién pedir
   ↓
Conectar                 cada persona recibe una petición con contexto
   ↓
Resolver + aprender      la situación se cierra; el grafo registra qué capacidades se usaron
```

### Dónde aporta la IA de verdad

| Etapa | Aporta | No aporta |
| --- | --- | --- |
| Entender la situación | Sí: idioma, tiempo, escala, contexto implícito ("soy de China" implica orientación cultural). | |
| Detectar necesidades no dichas | Sí, es el corazón: "carne asada para 12" → hielera, sillas, bocina. | |
| Descubrir capacidades | Sí: inferir "Mariana está en casa el jueves" desde una rutina, no desde un anuncio. | |
| Armar y rankear soluciones | Sí: combinar personas, elegir estrategia, medir cobertura. | |
| Redactar la petición | Sí, con contexto, editable. | |
| Chat, feed, recomendaciones de contenido | | No. Nada de esto ayuda a resolver situaciones. |

### Qué necesita saber el sistema sobre una comunidad

- **Personas**: nombre, ubicación aproximada, antigüedad, verificación.
- **Capacidades** por persona, con tipo interno (objeto, habilidad, conocimiento, tiempo, trayecto, contacto, comida), etiquetas y **evidencia** ("ha recibido paquetes 3 veces", "todo lo que prestó fue devuelto").
- **Rutinas y disponibilidad**: días y horas ("trabaja desde casa martes y jueves", "va a Costco los sábados").
- **Situaciones abiertas de otros**: lo que hoy son "pendientes" (Ana necesita una lámpara de IKEA).
- **Historial de resoluciones**: qué se usó, quién ayudó, qué se devolvió. Es lo que hace que el grafo mejore solo.
- **Contexto local**: calendario de la comunidad (habrá Noche Mexicana el 15), lugares frecuentes.

### Utilidad recurrente

- La Home cambia cada día ("Tu comunidad hoy") porque el grafo tiene rutinas: hoy 3 personas están en casa, el sábado Fer va a Costco.
- Cada situación resuelta enriquece el grafo; el sistema resuelve más sin que nadie publique nada.
- Las oportunidades (trayectos) convierten actividades que ya haces en ayuda sin esfuerzo.
- El Perfil muestra "lo que tu comunidad sabe de ti", que crece con el uso.

---

## 5. Flujos: las cinco historias

Cada historia demuestra una capacidad distinta del sistema.

### 1 · Recibir paquete — *disponibilidad inferida*
Input: "Mañana llega mi paquete entre 2 y 5 y estaré en la oficina."
Entiende: alguien en tu edificio, mañana (jueves), entre 2 y 5 PM.
Busca: rutinas y disponibilidad, no anuncios.
Solución: **Mariana**. "Mañana es jueves y Mariana trabaja desde casa los jueves. Ya ha recibido paquetes de otros vecinos 3 veces."
CTA: **Preguntarle a Mariana**.
Wow: la explicación de por qué ella. Nadie publicó "puedo recibir paquetes".

### 2 · Noche Mexicana — *solución compuesta*
Input (en inglés): "I'm from China and I've been invited to a Mexican Independence Day party. I don't know what to wear or bring."
Entiende: orientación cultural + algo que ponerse + algo que llevar + alguien que lo explique. Idioma: inglés.
Solución con 3 personas: **Sofía** presta un rebozo y un sombrero; **Andrea** explica qué es apropiado llevar y por qué; **Fer** irá a la misma fiesta y pueden llegar juntos. Extra: **Wei** habla mandarín, por si prefiere preguntar en su idioma.
CTA: **Ask these 3 people**.
Wow: "We found a solution using 3 people from your community."

### 3 · Carne asada para 12 — *descubrimiento de necesidades + cobertura*
Input: "Voy a hacer una carne asada para 12 personas el sábado."
Entiende: reunión en casa, 12 personas, sábado.
Detecta 8 necesidades que el usuario no escribió.
Solución: 6 personas cubren 7; queda 1 gap (carbón).
CTA: **Pedir a estas 6 personas** (con la lista editable de a quién sí).
Wow: "No necesitas comprar casi nada. Tu comunidad ya tiene 7 de las 8 cosas que necesitas."

### 4 · Bicicleta rota — *múltiples estrategias*
Input: "Se me rompió la bici y mañana la necesito."
Entiende: urgencia (mañana), problema mecánico.
Solución con **tres estrategias**: (A) repararla hoy: Diego sabe y Carlos tiene herramientas; (B) una bici prestada mientras tanto: Luis; (C) un taller de confianza: Rodrigo conoce uno en la avenida.
CTA: elegir estrategia → pedir.
Wow: "Hay 3 formas de resolverlo. Ninguna implica comprar nada."

### 5 · Voy a IKEA — *oportunidad, no necesidad*
Input: "Voy a IKEA mañana."
Entiende: no es un problema; es una capacidad temporal (trayecto).
Busca: situaciones abiertas de otros que ese trayecto resuelve.
Solución: Ana necesita una lámpara; Carlos quiere devolver una caja.
CTA: **Ver si puedo ayudar** → **Avisar a Ana**.
Wow: "Puedes ayudar a 2 vecinos con un viaje que ya vas a hacer." Después, el Perfil aprende: "Sueles ir a IKEA".

---

## 6. Information architecture

### Pantallas necesarias

| Pantalla | Ruta | Contenido |
| --- | --- | --- |
| **Inicio** | `#/` | "¿Qué necesitas resolver hoy?" + input grande con ejemplos rotativos + CTA "Encontrar una solución". Debajo, "Tu comunidad hoy": 3 o 4 señales derivadas del grafo (no un feed). Si hay situaciones en curso, un acceso breve. |
| **Situación** | `#/s/:id` | El flujo completo: lo que entendimos → lo que probablemente necesitas (editable) → la solución (una o varias estrategias) → autorización → progreso → resuelto. |
| **Mis situaciones** | `#/situations` | En curso y resueltas. Incluye las veces que estás ayudando a alguien. Sin tabs. |
| **Perfil** | `#/me` | Lo que tu comunidad sabe de ti (capacidades aprendidas), señales de confianza, tu participación. |

### Pantallas que se eliminan

- **Tengo algo para compartir** (`/share`): es crear un listing. Las capacidades entran al grafo por situaciones y por lo que ocurre, no por formularios.
- **Cerca de ti** (`/nearby`): es un feed. Se transforma en la sección "Tu comunidad hoy" del Inicio, que muestra capacidad disponible (personas en casa, trayectos, vecinos que buscan algo), no cosas publicadas.
- **Mis conexiones con tabs**: se reemplaza por Mis situaciones.
- **Tarjetas "¿Cómo te ayudamos?"** e **impacto en el Inicio**: compiten con el input.

La navegación pasa de 4 a 3 entradas: Inicio · Situaciones · Perfil.

---

## 7. Modelo conceptual: Situation → Solution

```
Community
  └── Person ─┬── Capability (kind interno: object | skill | knowledge | time | route | contact | food)
              │       ├── tags[]           qué resuelve
              │       ├── evidence          "ha recibido paquetes 3 veces"
              │       └── availability      cuándo aplica
              ├── Routine / Availability   días + horas + fuente (rutina | declarada | aprendida)
              └── OpenSituation            lo que esa persona necesita hoy (Ana: lámpara de IKEA)

Situation (del usuario)
  ├── text, lang
  ├── understanding   { kind: need | opportunity, summary, when, scale, place, tags }
  ├── needs[]         Need { label, why, kinds[], tags[], priority: core | likely | optional, strategy }
  ├── solutions[]     Solution { strategy, steps[], coverage, gaps[], people[] }
  │                     Step { need, person, capability, because, ask }
  └── connections[]   Connection { person, need, capability, status: asked | accepted | done }

Pipeline (js/resolver.js)
  understandSituation(text)                 → understanding
  discoverNeeds(understanding)              → needs[]
  discoverCapabilities(community, needs)    → candidatos por necesidad, con "because"
  buildSolutions(needs, candidates)         → una solución por estrategia
  rankSolutions(solutions)                  → ordenadas por cobertura, personas, evidencia
  discoverOpportunities(understanding)      → para kind = opportunity
```

`Situation`, `Need`, `Solution` y `Connection` se persisten en localStorage. `Person`, `Capability`, `Availability` viven en el grafo semilla (`data.js`) más una capa de aprendizaje (`State.learned`) que registra evidencia nueva al resolver.

---

## 8. Momentos de delight (uno por flujo)

| Flujo | Momento |
| --- | --- |
| Paquete | "Mañana es jueves y Mariana trabaja desde casa los jueves." La razón es una rutina, no un anuncio. |
| Noche Mexicana | "We found a solution using 3 people from your community." Y el extra inesperado: alguien habla mandarín. |
| Carne asada | "Tu comunidad ya tiene 7 de las 8 cosas que necesitas." Con la lista de lo que sí tendrías que comprar. |
| Bicicleta | Tres estrategias distintas para el mismo problema, ninguna implica comprar. |
| IKEA | "Puedes ayudar a 2 vecinos con un viaje que ya vas a hacer." Y después: tu perfil aprendió que sueles ir a IKEA. |

---

## 9. Qué cambia en el MVP actual (lista concreta)

**Eliminar**
1. Vista `/share` y todo el flujo de compartir (kinds, léxico de recursos, `interpretOffer`).
2. Vista `/nearby` y sus filtros; `resourceCard`; `State.shared`.
3. Tarjetas "¿Cómo te ayudamos?" y el bloque de impacto del Inicio.
4. Tabs de "Mis conexiones".
5. Historias "Un taladro" y "Compartir comida" (se reemplazan por Carne asada y Bicicleta).
6. Métricas tipo OLIO ("kg de comida", "objetos reutilizados").
7. Capa Supabase (`db.js`, `config*.js`, `services/`, `MIGRACION.md`): codifica el modelo marketplace. Se mueve a `legacy/` sin borrar.
8. `matching.js`.

**Transformar**
9. `data.js` → Community Resource Graph: personas con capacidades tipadas, evidencia, rutinas con días y horas, situaciones abiertas de otros, calendario local.
10. `matching.js` → `resolver.js` con el pipeline `understandSituation → discoverNeeds → discoverCapabilities → buildSolutions → rankSolutions`.
11. Vista de necesidad → vista de **Situación** con necesidades inferidas editables, solución compuesta, estrategias, cobertura y autorización por persona.
12. Diálogo de solicitud → autorización multi-persona con un mensaje editable por persona.
13. "Mis conexiones" → "Mis situaciones".
14. Perfil → "Lo que tu comunidad sabe de ti" + señales de confianza basadas en comportamiento.
15. Copy: de "Encontré 3 personas" a "Encontramos una forma de resolverlo".
16. Métrica principal: Situaciones resueltas (con personas involucradas y "sin comprar nada").

**Mantener**
17. Input en lenguaje natural (ahora único protagonista, con ejemplos rotativos).
18. Secuencia "Entendiendo…".
19. Aceptación simulada que sobrevive un refresh.
20. Flujo de oportunidad (IKEA), elevado a caso de primera clase.
21. HTML, CSS, JS vanilla, identidad visual, responsive, accesibilidad, localStorage, router por hash, `State`, `UI`, `Session`.

---

## 10. Qué NO construir todavía

- Formulario para declarar capacidades ("tengo un taladro"). El grafo crece con situaciones y resoluciones; un formulario nos regresa al listing.
- Chat entre vecinos. La conexión termina en "ya se pusieron de acuerdo"; el canal real queda fuera.
- Integración con una API de IA real. El pipeline ya tiene la forma correcta; se conecta después.
- Múltiples comunidades, onboarding, autenticación.
- Notificaciones push, calendario, mapas.
- Lado del que ayuda (recibir peticiones reales). Solo existe la aceptación simulada.
- Feed, comentarios, reacciones, rankings, puntos.
- Métricas de impacto ecológico o económico.
- Persistencia remota. Se reintroduce cuando el modelo Situation/Capability esté validado con usuarios.

---

## 11. Community Simulation Layer

Añadido el mismo día, a petición: Entre Todos debe demostrar que entiende un
sistema social y lo convierte en producto, no solo que genera código.

### La pregunta

¿Cómo puede Entre Todos modelar la **capacidad oculta** de una comunidad y
convertirla en soluciones concretas?

Respuesta corta: la capacidad oculta no está en lo que la gente publica, sino en
lo que la gente **es, tiene, sabe y hace por rutina**. Si el sistema tiene un
modelo estructurado de eso, puede responder a una situación sin que nadie
haya anunciado nada. Y si el modelo describe la **estructura social** del
lugar, el mismo producto descubre necesidades distintas en lugares distintos.

### El modelo genérico

```
Community
  profile        de qué va la vida aquí (focus[]) y por qué (description)
  places         lugares que un trayecto puede "resolver" (súper, IMSS, aeropuerto…)
  calendar       eventos locales que crean contexto (Noche Mexicana, castanyada)
  structure
    recurring[]  necesidades que este lugar SUELE tener; se inyectan cuando una
                 situación las dispara (triggers por escenario, o '*')
    suppress     necesidades del playbook base que aquí no aplican
  people[]
    routines[]   cuándo está cada quien (días + horas + fuente: rutina | declarada)
    capabilities[] qué tiene / sabe / hace, con tipo interno y EVIDENCIA
    open[]       lo que esa persona necesita hoy (alimenta las oportunidades)
```

Todo lo que el resolver hace es genérico: entiende la situación, saca las
necesidades base del escenario, deja que la **estructura de la comunidad**
las modifique, y busca capacidades en el grafo. No hay una sola regla que diga
"en Los Pinos hacer X". Lo que cambia es el modelo.

### Tres comunidades, tres estructuras sociales

| | Residencial Jacarandas · CDMX | Colonia Los Pinos · Guadalajara | Residència Internacional de Gràcia · Barcelona |
| --- | --- | --- | --- |
| Quiénes | Familias y profesionistas en torres; trabajan fuera de día | Adultos mayores en casas de una planta; pocos coches | Estudiantes e investigadores de doce países; rotación alta |
| Capacidad oculta | Objetos guardados, rutinas de home office, trayectos a tiendas | Tiempo, cocina, experiencia de oficio, unos pocos jóvenes con coche | Quien ya pasó por el trámite, idiomas, comida de casa, un coche compartido |
| Necesidades recurrentes | Paquetes, herramientas, reuniones, intercambio cultural | Compras, citas médicas, acompañamiento, mascotas, arreglos en casa | Trámites, idiomas, ingredientes de casa, mudanzas, aeropuerto |
| Qué inyecta la estructura | Idioma del recién llegado | Coche para quien no camina, manos para subir cosas, alguien que entienda de medicamentos | Ingredientes de tu país, ollas grandes, alguien local, carrito con ruedas |
| Qué suprime | Nada | Bocina, hielera, asador, carnicería | Bocina, hielera, asador, carnicería |

### El momento de demo

La misma frase, **"Voy a hacer una comida para 10 personas el sábado"**, en las tres:

- **Jacarandas** → mesa (Ana), sillas (Mariana), bocina (Jorge), manos para cocinar (Valeria). "Tu comunidad ya tiene las 4 cosas que necesitas."
- **Los Pinos** → mesas y sillas del salón parroquial (Elena), Doña Carmen cocina (su mole), Chuy con la camioneta para traer a quienes no caminan y para cargar. Sin bocina: aquí no hace falta.
- **Gràcia** → mesa y sillas del comedor común (Lucía), Youssef cocina, especias de casa, arrocera y platos para 12 (Hana), y alguien local que explique cómo se celebra aquí. Si dices que eres de India, las especias las pone Priya.

Y en cada comunidad la Home cambia sola: "Tu comunidad hoy" sale del grafo
(quién está en casa, quién va a dónde, quién espera algo de un lugar), los
ejemplos y el placeholder son los de ese lugar, y el Perfil describe la
estructura social de la comunidad activa.

### Qué NO hicimos

- No hay reglas por comunidad en el código. Solo datos estructurados.
- No hay IA en runtime. Los escenarios nuevos (cita médica, trámite, mascota,
  arreglo en casa, mudanza) son playbooks del mismo tipo que los cinco originales.
- No hay onboarding ni multi-tenant real: el cambio de comunidad es un
  selector de demo que carga otro grafo y otro estado local.

---

## 12. De resolver situaciones a construir una red de apoyo

Complemento posterior, detallado en [CIRCULOS-Y-CONFIANZA.md](CIRCULOS-Y-CONFIANZA.md).

La propuesta de valor sube un nivel: **Entre Todos convierte tus círculos en una red de
apoyo para la vida cotidiana.** Resolver situaciones sigue siendo el mecanismo; la red de
confianza es lo que queda después.

- The solution was already there. You just couldn't see it.
- Small acts become trusted relationships.
- Entre Todos doesn't assume you already have a community. It helps you build one.
- Entre Todos turns everyday interactions into a trusted support network.

Qué cambia en el modelo: aparece la relación persona ↔ persona (Trust Graph), los círculos
explícitos y emergentes, el contexto de confianza (alguien puede serlo para paquetes y no
para entrar a casa) y la verificación simulada. Las situaciones sensibles (acompañar a un
adulto mayor, entrar a casa, cuidado infantil) priorizan confianza y verificación sobre
proximidad. Nada de esto se muestra como número: solo frases humanas.

Qué no cambia: la Home sigue teniendo el input como único protagonista, no hay estrellas,
puntuaciones ni rankings, y la inteligencia sigue siendo invisible.
