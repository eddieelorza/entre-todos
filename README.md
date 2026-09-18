<p align="center">
  <img src="assets/entre-todos-assets/entre-todos-logo-full.webp" alt="Entre Todos" width="260">
</p>

<h1 align="center">Entre Todos</h1>

<p align="center">
  <strong>Dinos qué necesitas resolver. Encontramos quién o qué cerca puede ayudarte.</strong><br>
  <em>Entre Todos turns everyday interactions into a trusted support network.</em>
</p>

<p align="center">
  HTML · CSS · JavaScript vanilla · sin build · sin dependencias · sin backend · sin IA en runtime
</p>

---

## La idea en 30 segundos

Toda comunidad tiene muchísima capacidad ociosa: sillas guardadas, alguien que sabe arreglar bicis, alguien que trabaja desde casa los jueves, alguien que va a Costco cada sábado. Usarla hoy exige saber exactamente qué pides, a quién y dónde.

Entre Todos elimina esa fricción. Escribes una **situación** con tus palabras:

> "Voy a hacer una carne asada para 12 personas el sábado."

y el sistema entiende qué hace falta, descubre qué personas, objetos, conocimientos, tiempos y trayectos ya existen cerca, y te arma una **solución**, muchas veces con varias personas a la vez:

> **No necesitas comprar casi nada. Tu comunidad ya tiene 7 de las 8 cosas que necesitas.**
> Carlos presta la hielera · Ana la mesa · Mariana cuatro sillas · Jorge la bocina y conoce la carnicería · Diego las pinzas · Valeria ayuda a preparar. Solo te faltaría el carbón.

No es un marketplace de vecinos, ni un feed, ni un chatbot. Es una nueva interfaz entre una persona y la capacidad colectiva de su comunidad. Y cada pequeña ayuda que sale bien se convierte en una relación de confianza.

```
Situación → Entender → Detectar necesidades → Buscar capacidades → Armar solución → Autorizar → Conectar → Resolver
```

y no:

```
Post → Feed → Comentarios
```

## Pruébalo

No hay nada que instalar. Clona el repositorio y abre `index.html` en el navegador, o levanta un servidor estático:

```bash
node scripts/serve.mjs
```

y visita `http://localhost:8765`. También funciona publicado tal cual en GitHub Pages.

Todo el estado vive en `localStorage`. En Perfil hay un botón para reiniciar la demo.

## La demo de 3 minutos

En Inicio, los chips de **"Prueba con:"** disparan cada historia. Cada una demuestra una capacidad distinta del sistema.

| Historia | Qué demuestra | El momento |
| --- | --- | --- |
| **Recibir un paquete** | Disponibilidad inferida de rutinas, no de anuncios | "Mariana puede resolverlo desde tu mismo edificio", con la razón: trabaja desde casa ese día o confirmó que estará |
| **Noche Mexicana** (en inglés) | Solución compuesta con varias personas | "We found a solution using 3 people from your community", y un extra inesperado: Wei habla mandarín |
| **Carne asada para 12** | Necesidades que no escribiste + cobertura honesta | "Tu comunidad ya tiene 7 de las 8 cosas", y lo que sí tendrías que comprar |
| **Bici rota** | Varias estrategias para un mismo problema | Repararla hoy · una bici prestada mientras tanto · un taller de confianza |
| **Voy a IKEA** | Una oportunidad, no una necesidad | "Puedes ayudar a 2 vecinos con un viaje que ya vas a hacer"; tu perfil aprende que sueles ir |
| **Acompañar a mi mamá** | Contexto sensible: manda la confianza y la verificación | Carlos (relación previa, coche) y Sofía ("Conectada a través de Mariana") |
| **Disfraz de astronauta** | Círculo de familias + objetos + conocimiento | "Podemos armarlo sin comprar uno nuevo" |
| **Vestido para una boda** | Círculo privado, solución multipersona | "Tu círculo puede armarte el look completo" |
| **Hoy necesito ride** | Trayecto compatible + proximidad + confianza | Carlos sale hacia el sur a las 8 |

Después, el momento que más sorprende:

1. Toca **Cambiar** junto al nombre de la comunidad y entra a **Colonia Los Pinos**.
2. Escribe la misma frase: *"Voy a hacer una comida para 10 personas el sábado."*
3. Repite en **Residència Internacional de Gràcia**.

El mismo producto descubre necesidades y personas distintas según la estructura social del lugar. Sin una sola regla escrita por comunidad.

## Cómo funciona

```
understandSituation(text)              idioma · cuándo (día + ventana de horas) · escala · contexto · origen
        ↓
discoverNeeds(understanding)           necesidades dichas y no dichas; la estructura de la comunidad añade o quita
        ↓
discoverCapabilities(graph, needs)     capacidades por tipo y etiquetas, disponibilidad real, confianza, evidencia
        ↓
buildSolutions(needs, candidates)      una solución por estrategia; cobertura, huecos, personas consolidadas
        ↓
rankSolutions(solutions)               cobertura → orden del playbook
        ↓
headline · buildMessage                el titular del momento wow y un mensaje editable por persona
```

Todo son reglas en `js/resolver.js`. Las dos primeras etapas devuelven objetos planos: un modelo de lenguaje puede sustituirlas mañana devolviendo la misma forma, y nada más cambia.

### El Community Resource Graph

La capacidad oculta de una comunidad no está en lo que la gente publica, sino en lo que la gente **es, tiene, sabe y hace por rutina**. Cada persona del grafo tiene:

- **capacidades** con tipo interno (objeto, habilidad, conocimiento, tiempo, trayecto, contacto, comida, contexto), etiquetas y **evidencia** ("ha recibido paquetes 3 veces");
- **rutinas** con días y horas ("trabaja desde casa martes y jueves", "va a Costco los sábados");
- **situaciones abiertas** (Ana necesita una lámpara de IKEA), que alimentan las oportunidades;
- **relaciones** con otras personas, círculos y verificación simulada.

El grafo aprende: cada situación resuelta suma evidencia, y un trayecto u oferta tuya pasa a ser algo que tu comunidad sabe de ti.

## Community Simulation Layer

Cada comunidad es un modelo estructurado en `js/communities/<id>.js`: personas, lugares, calendario y una **estructura social** (`structure.recurring` y `structure.suppress`) que inyecta o suprime necesidades según el lugar.

| Comunidad | Quiénes | Capacidad oculta | Necesidades recurrentes |
| --- | --- | --- | --- |
| **Residencial Jacarandas** · CDMX | Familias en torres; trabajan fuera de día | Objetos guardados, rutinas de home office, trayectos a tiendas | Paquetes, herramientas, reuniones, intercambio cultural |
| **Colonia Los Pinos** · Guadalajara | Adultos mayores; pocos coches | Tiempo, cocina, experiencia de oficio, unos pocos jóvenes con coche | Compras, citas médicas, acompañamiento, mascotas, arreglos en casa |
| **Residència Internacional de Gràcia** · Barcelona | Estudiantes de doce países; rotación alta | Quien ya pasó por el trámite, idiomas, comida de casa, un coche compartido | Trámites, idiomas, ingredientes de casa, mudanzas, aeropuerto |

## Las capas

- **Círculos de confianza y Trust Graph.** Relaciones persona ↔ persona, círculos explícitos y emergentes, contextos (alguien puede ser de confianza para paquetes y no para entrar a casa) y verificación simulada. Las situaciones sensibles priorizan confianza sobre proximidad. Nada se muestra como número: solo frases ("Ya se han ayudado 4 veces"). Ver [`docs/CIRCULOS-Y-CONFIANZA.md`](docs/CIRCULOS-Y-CONFIANZA.md).
- **Community Constellation** (`#/constellation`). La comunidad como una constelación viva en Canvas 2D: cada persona es un nodo y, cuando cuentas una situación, la necesidad crea gravedad. "La solución ya estaba ahí. Solo no la veías."
- **Mapa de mi comunidad** (`#/map`). Mapa ilustrado propio, sin tiles ni lugares reales, con posiciones aproximadas por diseño. Ver [`docs/UBICACION.md`](docs/UBICACION.md).
- **Visual Confirm.** Una foto para confirmar que el objeto es el correcto antes de coordinar la entrega. La cámara no reconoce nada; solo conecta a dos personas.
- **Modo sencillo** (`#/sencillo`). Accesos grandes y voz, pensado para personas mayores. Manda la frase al mismo pipeline.

## Principios de diseño

- **El usuario nunca elige categorías.** Solo cuenta una situación. Las categorías existen por dentro.
- **La inteligencia es invisible.** Sin chat, sin sparkles, sin "AI-powered". Solo "Encontramos una forma de resolverlo".
- **Confianza por comportamiento.** Residente verificado, conexiones completadas, todo devuelto, disponibilidad confirmada. Nunca estrellas, puntos ni rankings.
- **Privacidad por diseño.** Nunca el número de departamento, teléfono, dirección ni ubicación exacta.
- **Autorización antes de conectar.** Cada persona recibe su propio mensaje, editable, y tú decides a quién pedir y con qué alcance.
- **Honestidad.** Si falta algo, se dice: "Esto sí tendrías que conseguirlo".

## Estructura del repositorio

```
index.html            Shell: header, nav, <main>, dialog, toast
css/                  Identidad visual (crema, terracota, verde), mobile-first, reduced-motion
js/data.js            Registro de comunidades, catálogo de lugares y el modelo genérico documentado
js/communities/       Una comunidad por archivo: jacarandas · los-pinos · gracia
js/resolver.js        El pipeline: de una situación a una solución
js/state.js           Situaciones, conexiones, lo aprendido; localStorage por comunidad
js/trust.js           Trust Graph, círculos, contextos, relevancia por perfil
js/verification.js    Verificación simulada y adaptador para un proveedor real
js/ui.js · views.js   Componentes y pantallas: Inicio · Situación · Mis situaciones · Perfil
js/app.js             Acciones, autorización multi-persona, aceptación simulada, aprendizaje
js/constellation.js   Community Constellation (Canvas 2D)
js/map.js             Mapa ilustrado
js/location-*.js      Distancias aproximadas desde coordenadas ficticias
js/visual-confirm.js  Confirmación con foto
js/simple-mode.js     Modo sencillo
docs/                 Replanteamiento, círculos y confianza, ubicación
legacy/               Código retirado del runtime (intérprete por keywords, capa Supabase)
```

## Métrica principal

**Situaciones resueltas.** No matches. Una situación puede necesitar una persona, tres recursos, un conocimiento o una combinación. Secundarias: personas involucradas por solución, situaciones resueltas sin comprar nada, capacidades nuevas descubiertas, usuarios que ayudan y que vuelven.

## Estado y limitaciones

Es un MVP de demostración. Las tres comunidades y sus personas son ficticias. Nadie responde de verdad: cada petición se acepta sola a los pocos segundos. La "inteligencia" son reglas; frases fuera de los escenarios conocidos caen en un intérprete genérico por palabras clave contra las etiquetas del grafo. No hay backend ni autenticación.

## Documentos

- [`docs/REPLANTEAMIENTO.md`](docs/REPLANTEAMIENTO.md): diagnóstico del MVP anterior, propuesta de valor, jobs to be done, flujos, modelo conceptual, qué no construir todavía y la Community Simulation Layer.
- [`docs/CIRCULOS-Y-CONFIANZA.md`](docs/CIRCULOS-Y-CONFIANZA.md): Trust Graph, círculos, verificación y las reglas de relevancia.
- [`docs/UBICACION.md`](docs/UBICACION.md): distancias aproximadas y privacidad de ubicación.

---

<p align="center">Hecho entre todos, para Residencial Jacarandas y para cualquier comunidad que quiera ver la capacidad que ya tiene.</p>
