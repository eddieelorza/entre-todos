# Entre Todos · Análisis del sistema y pitch de un minuto

Fecha: 17 de septiembre de 2026. Preparado para un Build Day de Claude y para el portafolio.
Las capturas y GIFs viven en [`portfolio/`](portfolio/README.md); las pruebas simuladas se corren con `node scripts/test-resolver.mjs`.

---

## 1. El pitch en 60 segundos

Guion de Eddie. Unas 170 palabras: entre 60 y 70 segundos hablado con calma. Entre corchetes, qué se muestra en pantalla.

> **[0–12 s · pantalla: `01-inicio.png` o los chips de "Prueba con:"]**
> Muchas veces, lo que necesitamos ya está cerca de nosotros.
> Un taladro. Un ride. Un vestido para una boda. Un disfraz para nuestros hijos. Alguien que reciba un paquete o que acompañe a un adulto mayor.
> El problema es que toda esa capacidad está invisible.
>
> **[12–20 s · `flujo-carne-asada.gif` arranca]**
> Por eso construí *Entre Todos*.
> En lugar de publicar en otro grupo o comprar algo que usarás una sola vez, simplemente dices qué necesitas resolver.
>
> **[20–35 s · el GIF llega a "7 de las 8 cosas" y a la autorización por persona]**
> Entre Todos conecta esa situación con las personas, recursos y círculos de confianza que tienes cerca.
>
> **[35–45 s · `mama-circulo-de-confianza.gif` o `06-resuelto-entre-todos.png`, la sugerencia "Ya se han ayudado 4 veces"]**
> Y la confianza se construye poco a poco.
> No usamos estrellas ni rankings: usamos interacciones reales que se convierten en relaciones.
>
> **[45–55 s · `constelacion.gif`]**
> Con nuestra *Community Constellation*, incluso puedes ver cómo tu comunidad se organiza alrededor de una necesidad y cómo aparece una solución.
>
> **[55–65 s · cierre, logo]**
> Porque la idea es muy sencilla:
> *La solución ya estaba ahí. Solo no podíamos verla.*
> *Entre Todos convierte pequeñas ayudas cotidianas en una verdadera red de apoyo.*

Si hay que recortar diez segundos, la línea que menos se pierde es "En lugar de publicar en otro grupo o comprar algo que usarás una sola vez". Si sobra tiempo, el dato que más vende es `tres-comunidades.gif`: la misma frase en tres lugares da soluciones distintas.

---

## 2. Qué es y qué no es

| Es | No es |
| --- | --- |
| Una interfaz entre una persona y la capacidad colectiva de su comunidad | Un marketplace de préstamos (Buy Nothing, OLIO) |
| Situación → solución armada con varias personas | Post → feed → comentarios |
| Inteligencia invisible: "Encontramos una forma de resolverlo" | Un chatbot o una app "AI-powered" |
| Confianza por comportamiento y frases humanas | Estrellas, puntos, rankings |
| Privacidad por diseño: nombre y edificio, nunca departamento ni teléfono | Un directorio de vecinos |

---

## 3. Arquitectura

HTML, CSS y JavaScript vanilla. Sin build, sin dependencias, sin backend, sin IA en runtime. Todo el estado vive en `localStorage` por comunidad.

```
index.html
 └─ js/data.js                 Registro de comunidades y modelo genérico
    js/communities/*.js        Una comunidad por archivo (jacarandas · los-pinos · gracia)
    js/location-*.js, matching Distancias aproximadas desde coordenadas ficticias
    js/state.js                Situaciones, conexiones, lo aprendido (localStorage)
    js/verification.js         Verificación simulada + adaptador para un proveedor real
    js/trust.js                Trust Graph, círculos, contextos, relevancia por perfil
    js/resolver.js             El pipeline Situación → Solución
    js/ui.js · views.js        Componentes y pantallas
    js/app.js                  Acciones, autorización multipersona, aceptación simulada, aprendizaje
    js/constellation.js        Community Constellation (Canvas 2D)
    js/map.js                  Mapa ilustrado
    js/visual-confirm.js       Confirmación con foto
    js/simple-mode.js          Modo sencillo (accesos grandes + voz)
```

### 3.1 El pipeline (`js/resolver.js`)

```
texto ─▶ understandSituation ─▶ discoverNeeds ─▶ discoverCapabilities ─▶ buildSolutions ─▶ rankSolutions ─▶ headline
              │                      │                    │                     │
         idioma, cuándo,      playbook base del     grafo de la comunidad:   una solución por
         escala, escenario,   escenario + lo que    tipo · etiquetas ·       estrategia, con
         perfil, sensible     la ESTRUCTURA de la   disponibilidad ·         cobertura, huecos,
                              comunidad inyecta     distancia · evidencia ·  personas y "porqués"
                              o suprime             confianza (Trust)
```

Cada etapa devuelve objetos planos. Es el punto de integración futuro: un modelo puede sustituir las dos primeras etapas devolviendo la misma forma sin tocar el resto.

Escenarios que entiende hoy: paquete, celebración mexicana, reunión/carne asada, bici, cita médica (perfil `care`, sensible), trámite, mascota, arreglo en casa, mudanza, disfraz (perfil `family`), prenda para un evento (perfil `garment`), ride, trayecto (oportunidad), oferta, y un genérico por palabras clave contra las etiquetas del grafo.

### 3.2 El modelo de comunidad (Community Simulation Layer)

```
Community
  profile        de qué va la vida aquí
  places         lugares que un trayecto puede resolver (IKEA, el súper, la clínica…)
  calendar       eventos locales que crean contexto
  structure
    recurring[]  necesidades que este lugar SUELE tener, disparadas por escenario o por '*'
    suppress     necesidades del playbook base que aquí no aplican
  people[]
    routines[]   cuándo está cada quien (días + horas + fuente: rutina | declarada)
    capabilities[] object · skill · knowledge · time · route · contact · food, con evidencia
    open[]       lo que esa persona necesita hoy (alimenta las oportunidades)
  circles[], trust[]   relaciones y círculos semilla
```

| Comunidad | Estructura social | Qué inyecta | Qué suprime |
| --- | --- | --- | --- |
| Residencial Jacarandas · CDMX | Familias en torres, trabajan fuera | Idioma del recién llegado | Nada |
| Colonia Los Pinos · Guadalajara | Adultos mayores, pocos coches | Coche para quien no camina, manos jóvenes, alguien que entienda de medicamentos | Bocina, hielera, asador, carnicería |
| Residència de Gràcia · Barcelona | Estudiantes de doce países | Ingredientes de tu país, ollas grandes, alguien local | Bocina, hielera, asador, carnicería |

### 3.3 Confianza (`js/trust.js`, `js/verification.js`)

```
relevance = proximity + trust + availability + context_match + relationship_history + mutual_connections
```

Los pesos cambian por perfil de situación: un taladro es proximidad y disponibilidad; un vestido es círculo y afinidad; acompañar a un adulto mayor es confianza, relación previa y verificación. Solo el perfil `care` bloquea candidatos (identidad y residencia verificadas, relación directa o indirecta). Fuera de ahí la confianza suma acotado, así nunca vence a un match exacto de capacidad. Nada se muestra como número: solo frases ("Ya se han ayudado 4 veces", "Conectada a través de Mariana").

### 3.4 Aprendizaje

Al resolver, el grafo registra evidencia por capacidad ("Lo ha prestado 3 veces; siempre regresó"), un trayecto tuyo se vuelve algo que tu comunidad sabe de ti ("Suele ir a IKEA") y, a las cuatro interacciones con alguien, la app sugiere agregarlo a tu círculo. Nunca lo hace sola.

---

## 4. Pruebas simuladas

`node scripts/test-resolver.mjs` carga los módulos vanilla en un contexto de Node sin navegador (como `index.html`) y corre el pipeline completo. Corrido el 17 de septiembre de 2026:

**17/17 historias · 54/54 comprobaciones.**

| Historia | Comunidad | Necesidades | Cobertura | Personas | Comprobaciones |
| --- | --- | --- | --- | --- | --- |
| Recibir un paquete | Jacarandas | 1 | 1/1 | Mariana | 5/5 ✅ |
| Noche Mexicana (inglés) | Jacarandas | 4 | 3/3 | Sofía, Andrea, Fer (+Wei) | 5/5 ✅ |
| Carne asada para 12 | Jacarandas | 8 | 7/8 | Carlos, Diego, Jorge, Ana, Mariana, Valeria | 6/6 ✅ |
| Bici rota | Jacarandas | 4 | 3 estrategias | Diego, Carlos | 4/4 ✅ |
| Voy a IKEA | Jacarandas | 0 | 2 oportunidades | Ana: Recoger una lámpara en IKEA · Carlos: Devolver una caja en IKEA | 3/3 ✅ |
| Acompañar a mi mamá | Jacarandas | 2 | 2/2 | Carlos, Sofía | 5/5 ✅ |
| Disfraz de astronauta | Jacarandas | 4 | 3/3 | Laura, Ana, Carlos (+Laura) | 4/4 ✅ |
| Vestido para una boda | Jacarandas | 4 | 3/3 | Paulina, Mariana, Andrea (+Valeria) | 3/3 ✅ |
| Hoy necesito ride | Jacarandas | 1 | 1/1 | Carlos | 2/2 ✅ |
| Comida para 10 · Jacarandas | Jacarandas | 4 | 4/4 | Ana, Mariana, Jorge, Valeria | 2/2 ✅ |
| Comida para 10 · Los Pinos | Los Pinos | 5 | 5/5 | Elena, Doña Carmen, Chuy | 3/3 ✅ |
| Comida para 10 · Gràcia | Gràcia | 6 | 5/5 | Lucía, Youssef, Hana (+Lucía) | 3/3 ✅ |
| Trámite del NIE · Gràcia | Gràcia | 3 | 2/2 | Camila (+Lucía) | 2/2 ✅ |
| Foco fundido · Los Pinos | Los Pinos | 4 | 3/3 | Don Ramiro, Don Pedro, Chuy (+Don Ramiro) | 2/2 ✅ |
| Frase fuera de guion | Jacarandas | 3 | 2/2 | Carlos, Ana (+Carlos) | 2/2 ✅ |
| Privacidad en el mensaje | Jacarandas | 1 | 1/1 | Mariana | 2/2 ✅ |
| Confianza no rompe el matching | Jacarandas | 4 | 3 estrategias | Diego, Carlos | 1/1 ✅ |

Qué comprueban, agrupado:

- **Comprensión.** Idioma (inglés/español), cuándo ("mañana entre 2 y 5" → viernes 14–17 h), escala (12 personas), origen ("I'm from China" → mandarín), escenario y perfil.
- **Necesidades no dichas.** "Carne asada para 12" produce 8 necesidades; el sistema cubre 7 y dice con honestidad que el carbón sí se compra.
- **Solución compuesta y estrategias.** Seis personas distintas en una solución; tres estrategias para la bici, ninguna implica comprar.
- **Oportunidades.** "Voy a IKEA mañana" no tiene necesidades: encuentra a dos vecinos que esperan algo de ahí.
- **Confianza y verificación.** En una cita médica de un familiar, todas las personas propuestas tienen identidad y residencia verificadas. En la bici, el mecánico gana por capacidad aunque el usuario tenga relación previa con otro vecino.
- **Estructura social.** La misma frase en tres comunidades produce conjuntos de necesidades distintos: Los Pinos y Gràcia suprimen la bocina e inyectan lo propio del lugar.
- **Privacidad.** El mensaje sugerido lleva contexto y petición, y nunca departamento, teléfono ni dirección.
- **Robustez.** Una frase fuera de guion cae en un escenario conocido o en el genérico, nunca en vacío.

Una nota honesta: el "porqué" del paquete depende del día. Si mañana es martes o jueves manda la rutina de home office de Mariana; si no, la disponibilidad que ella confirmó. La prueba acepta ambas fuentes y rechaza un anuncio.

También existe `node scripts/test-location.mjs` para distancias y permisos de ubicación.

---

## 5. Qué muestra cada captura

| Archivo | Momento | Qué demuestra |
| --- | --- | --- |
| `flujo-carne-asada.gif` | Chip → solución → autorización → respuestas → resuelto → sugerencia de círculo | El flujo completo en 30 s |
| `tres-comunidades.gif` | La misma frase en Jacarandas, Los Pinos y Gràcia | Community Simulation Layer |
| `paquete.gif` | "Mariana puede resolverlo desde tu mismo edificio" | Disponibilidad inferida de rutinas |
| `bici-estrategias.gif` | Tres formas de resolverlo, elegir una | Estrategias alternativas |
| `ikea-oportunidad.gif` | "Puedes ayudar a 2 vecinos con un viaje que ya vas a hacer" | Oportunidad, no necesidad |
| `mama-circulo-de-confianza.gif` | "Gente en la que ya confías" y alcance "Mi círculo" | Contexto sensible: confianza sobre proximidad |
| `constelacion.gif` | La comunidad se organiza alrededor de la necesidad | Community Constellation |
| `02-situacion-carne-asada.png` | Página completa de la solución | Necesidades editables, porqués, huecos honestos |
| `03-autorizacion-por-persona.png` | Un mensaje editable por persona + quién puede ver esto | Autorización antes de conectar |
| `06-resuelto-entre-todos.png` | "Tu comunidad aprendió algo" + sugerencia de círculo | Aprendizaje y red de apoyo |
| `07a/07b/07c-comida-*.png` | Misma frase, tres soluciones | Estructura social |
| `16-constelacion.png`, `17-mapa.png` | Vistas de comunidad en escritorio | Dos formas de ver la misma capacidad |
| `18-modo-sencillo.png` | Cuatro accesos grandes y voz | Accesibilidad para personas mayores |

---

## 6. Estado, límites y siguiente paso

- **Es un MVP de demostración.** Comunidades y personas ficticias; nadie responde de verdad (aceptación simulada a los pocos segundos). La inteligencia son reglas; frases fuera de los escenarios caen en un intérprete genérico.
- **Sin backend ni autenticación.** El esquema Supabase y el intérprete anterior están en `legacy/` y `supabase/` como referencia.
- **Siguiente paso técnico obvio.** Sustituir `understandSituation` y `discoverNeeds` por una llamada a Claude que devuelva la misma forma de datos. El resto del pipeline, la UI y las pruebas no cambian. El script de pruebas sirve entonces como evaluación de regresión del modelo.
- **Siguiente paso de producto.** El lado del que ayuda (recibir peticiones reales) y el canal de coordinación.

---

## 7. Cómo reproducir

```bash
node scripts/serve.mjs            # http://localhost:8765
node scripts/test-resolver.mjs    # pruebas simuladas (--md para tabla Markdown, --json para detalle)
```

Las capturas se generaron con Playwright contra el servidor local a 390×844 (móvil, 2×) y 1200×800 (escritorio); los GIFs a 4–6 cuadros por segundo.
