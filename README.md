# Entre Todos · MVP

**Entre Todos convierte tus círculos en una red de apoyo para la vida cotidiana.**
No tienes que resolver todo solo: dinos qué necesitas resolver y encontramos quién o qué
cerca puede ayudarte. Cada pequeña ayuda se convierte en una relación de confianza.
Entre Todos no asume que ya tienes una comunidad; te ayuda a construir una.

Demo funcional con tres comunidades ficticias (**Residencial Jacarandas**, **Colonia Los Pinos**,
**Residència Internacional de Gràcia**). Usuario de la demo: **Eddie**.
El replanteamiento completo (diagnóstico, propuesta de valor, flujos, modelo conceptual y
qué no construir todavía) está en [`docs/REPLANTEAMIENTO.md`](docs/REPLANTEAMIENTO.md).

## Qué es (y qué no)

No es un marketplace de vecinos ni un feed. Es una capa entre una persona y la
capacidad colectiva de su comunidad:

```
Situación → Entender → Detectar necesidades → Buscar capacidades → Armar solución → Autorizar → Conectar → Resolver
```

El usuario solo escribe una situación ("voy a hacer una carne asada para 12").
No elige categorías. El sistema infiere qué hace falta, busca en el
**Community Resource Graph** (personas con capacidades, rutinas, evidencia y
situaciones abiertas) y propone una solución, muchas veces con varias personas.

## Community Simulation Layer

Cada comunidad es un modelo estructurado (`js/communities/<id>.js`): personas con
capacidades y evidencia, rutinas con días y horas, situaciones abiertas, lugares,
calendario y una **estructura social** (`structure.recurring` y `structure.suppress`)
que añade o quita necesidades según el lugar. El resolver es el mismo; el
comportamiento cambia con el modelo.

| Comunidad | Estructura | De qué va |
| --- | --- | --- |
| Residencial Jacarandas · CDMX | Familias en torres, trabajan fuera | Paquetes, herramientas, trayectos, reuniones, intercambio cultural |
| Colonia Los Pinos · Guadalajara | Adultos mayores, pocos coches | Compras, citas médicas, acompañamiento, mascotas, ayuda en casa |
| Residència Internacional de Gràcia · Barcelona | Estudiantes de doce países | Trámites, idiomas, comida de casa, mudanzas, aeropuerto |

Momento de demo: en Inicio, "Cambiar" comunidad y escribir la misma frase
("Voy a hacer una comida para 10 personas el sábado") en las tres. Las necesidades
detectadas y las personas que las resuelven cambian con la estructura social.

## Cómo ejecutar

Abre `index.html` directamente en el navegador. No hay dependencias ni build.

```bash
python3 -m http.server 8765
```

## Estructura

```
index.html          Shell: header, nav (Inicio · Situaciones · Comunidad · Perfil), <main>, dialog, toast
css/styles.css      Identidad visual, layout mobile-first, animaciones, reduced-motion
js/data.js          Registro de comunidades, catálogo de lugares y modelo genérico (documentado ahí)
js/communities/     Una comunidad por archivo: Jacarandas, Los Pinos, Gràcia
js/resolver.js      understandSituation · discoverNeeds · discoverCapabilities · buildSolutions · rankSolutions
js/state.js         Situaciones, conexiones y lo aprendido; persistencia en localStorage
js/ui.js            Componentes (necesidades, pasos, progreso, señales), diálogo, toast, "Entendiendo…"
js/router.js        Enrutador por hash
js/views.js         Pantallas: Inicio, Situación, Mis situaciones, Perfil
js/app.js           Arranque, acciones, autorización multi-persona, aceptación simulada, aprendizaje
js/constellation.js Community Constellation: la comunidad como constelación viva (Canvas 2D, #/constellation)
css/constellation.css Escenario, tooltip, cámara y teaser de la constelación
legacy/             Código retirado del runtime (intérprete por keywords, capa Supabase)
```

## Las historias de demo (3 minutos)

Los chips de "Prueba con:" en Inicio disparan cada una. Cada historia demuestra una capacidad distinta.

| Historia | Capacidad que demuestra | Momento |
| --- | --- | --- |
| **Recibir un paquete** | Disponibilidad inferida de rutinas, no de anuncios | "Mariana puede resolverlo desde tu mismo edificio" con la razón (rutina o disponibilidad confirmada) |
| **Noche Mexicana** (en inglés) | Solución compuesta con varias personas | "We found a solution using 3 people" + extra inesperado: Wei habla mandarín |
| **Carne asada para 12** | Detección de necesidades no dichas + cobertura | "Tu comunidad ya tiene 7 de las 8 cosas que necesitas" y lo que sí habría que comprar |
| **Bici rota** | Varias estrategias para un mismo problema | Repararla · una bici prestada · un taller de confianza |
| **Voy a IKEA** | Oportunidad, no necesidad | "Puedes ayudar a 2 vecinos con un viaje que ya vas a hacer"; el perfil aprende que sueles ir |
| **Acompañar a mi mamá** | Contexto sensible: manda la confianza y la verificación | Carlos (relación previa, coche) + Sofía ("Conectada a través de Mariana"). Alcance por defecto: mi círculo |
| **Disfraz de astronauta** | Círculo de familias + objetos + conocimiento | Laura, Ana y Carlos: "Podemos armarlo sin comprar uno nuevo" |
| **Vestido para una boda** | Círculo privado, solución con varias personas | Paulina, Mariana y Andrea: "Tu círculo puede armarte el look completo" |
| **Hoy necesito ride** | Trayecto compatible + proximidad + confianza | Carlos sale hacia el sur a las 8 |
| **Construir confianza** | Las relaciones crecen con el uso | Resolver el paquete con Mariana: "Ya se han ayudado 4 veces" y la sugerencia de círculo |

También: "Tengo tamales de más" (oferta → el grafo aprende una capacidad tuya) y algo
sin solución ("Necesito un piano de cola") para ver el estado vacío.

## Qué hace el sistema

- **Entiende** idioma, cuándo (día concreto + ventana de horas), escala y contexto.
- **Infiere necesidades** que el usuario no escribió; se pueden quitar y la solución se rearma.
- **Busca capacidades** por tipo interno (objeto, habilidad, conocimiento, tiempo, trayecto, contacto)
  y por disponibilidad real: una rutina "trabaja desde casa los jueves" cuenta si mañana es jueves.
- **Arma soluciones** por estrategia, mide cobertura, señala huecos y consolida personas.
- **Pide autorización** con un mensaje editable por persona antes de conectar.
- **Aprende**: cada situación resuelta suma evidencia a las capacidades usadas; un trayecto
  u oferta tuya se convierte en algo que tu comunidad sabe de ti (Perfil).
- **Tu comunidad hoy** (Inicio): señales derivadas del grafo, no un feed de publicaciones.

## Community Constellation

Ruta **Comunidad** (`#/constellation`). Es la misma historia del producto contada en imagen:
*la solución ya estaba ahí, solo no la veías*. No es un mapa ni un dashboard ni un grafo técnico.

- Cada persona es un nodo; lo que sabe, tiene o suele hacer gira a su alrededor. La cercanía entre
  nodos conserva "quién está cerca de quién" sin dibujar un plano.
- Cuando cuentas una situación (input propio, chips de ejemplo, o desde una situación guardada con
  `#/constellation?s=<id>`), **la necesidad crea gravedad**: las necesidades florecen alrededor del
  centro, las capacidades compatibles son atraídas hacia ellas, las personas se acercan desde su lado,
  el resto se atenúa y aparecen conexiones animadas. Al final: "7 de 8 necesidades ya existen dentro
  de tu comunidad" y el cierre "La solución ya estaba ahí. Solo no la veías."
- Usa el mismo pipeline (`Resolver.resolve`) y el mismo grafo (`State.graph`), sin tocarlos. Una situación
  escrita ahí es efímera hasta que el usuario pulsa **Resolverlo con ellos**, que entra al flujo normal.
- **Comunidad viva**: la constelación respira y muestra pequeños pulsos entre personas que se han ayudado
  (conexiones reales de la sesión y evidencia del grafo).
- **Sonido** (opcional, campana arriba a la derecha): una nota suave por conexión; un acorde cuando la
  solución es de varias personas. Se recuerda en `localStorage`.
- **Cámara** (icono de cámara): el usuario captura un objeto, lo toca en la foto, lo nombra y entra volando
  a la constelación como una capacidad suya (`State.learnUserCapability`); aparece también en Perfil.
  La foto se recorta a 128 px y se guarda solo en el dispositivo. Sin cámara, se puede elegir una foto.
- Canvas 2D con profundidad por paralaje (puntero o inclinación del móvil), halos cacheados como sprites,
  pausa cuando no está visible y `prefers-reduced-motion` (sin respiración ni escalonado).

## Confianza y privacidad

Sin estrellas, puntos ni rankings. Señales por comportamiento: identidad verificada,
residente verificado, miembro desde, interacciones completadas, todo devuelto.
Nunca se muestra el número de departamento, teléfono ni dirección; solo piso/torre y distancia aproximada.

### Círculos de confianza y Trust Graph

Entre Todos no conecta solo por cercanía: cada situación combina proximidad + confianza +
relevancia + disponibilidad, y la situación decide qué círculos importan (una hielera busca cerca;
un vestido busca en tus amigas; acompañar a tu mamá busca en tu círculo de confianza). La confianza
se construye con favores pequeños que salen bien ("Ya se han ayudado 4 veces", "Conectada a través
de Mariana") y nunca se muestra como número. Detalle, modelo y demo en
[`docs/CIRCULOS-Y-CONFIANZA.md`](docs/CIRCULOS-Y-CONFIANZA.md).

- `js/trust.js` relaciones, círculos explícitos y emergentes, contextos, relevancia por perfil.
- `js/verification.js` estados simulados `contact · identity · community` y adaptador para un proveedor externo.
- `js/simple-mode.js` versión sencilla (`#/sencillo`) con accesos grandes y voz, pensada para personas mayores.
- Historias nuevas en Jacarandas: acompañar a mi mamá · disfraz de astronauta · vestido para una boda · hoy necesito ride.

## Métrica principal

**Situaciones resueltas.** Secundarias visibles en Perfil: veces que ayudaste, personas con
las que resolviste, y en la comunidad: situaciones resueltas, personas que participaron,
resueltas sin comprar nada.

## Limitaciones

- La "inteligencia" son reglas en JavaScript (`js/resolver.js`). Frases fuera de los cinco
  escenarios caen en el intérprete genérico por palabras clave contra las etiquetas del grafo.
- Nadie responde de verdad: toda petición se acepta sola a los pocos segundos.
- Tres comunidades de demo, un solo usuario, sin backend. El estado vive en localStorage, separado por comunidad.

## Dónde entra una API real

`Resolver.understandSituation(text)` y `Resolver.discoverNeeds(understanding)` devuelven
objetos planos. Un modelo puede sustituirlas devolviendo la misma forma;
`discoverCapabilities`, `buildSolutions` y las vistas no cambian.
