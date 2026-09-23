# Entre Todos · El mundo: de tres vistas a un espacio que se transforma

Fecha: 18 de septiembre de 2026. Estado: prueba aislada funcionando (`world.html`) e integrada como ruta `#/world`. El MVP HTML no cambió y sigue siendo el fallback y la capa de accesibilidad.

> Entre Todos no es una app que miras: es una comunidad que exploras.
> Regla de diseño: **no cambiar de pantalla cuando podamos transformar el espacio.**

---

## 1. Qué había y qué se reutiliza

El MVP ya tenía tres formas de ver la comunidad, cada una con su propio motor y unidas por `ViewHandoff` (posiciones en pantalla que pasan de una ruta a otra):

| Vista | Motor | Qué cuenta |
| --- | --- | --- |
| `js/map.js` | Canvas 2D isométrico | dónde están los edificios |
| `js/twin.js` | Three.js, **un** edificio | lo que el lugar puede hacer (Place Capabilities) |
| `js/constellation.js` | Canvas 2D con paralaje | cómo se organiza la gente alrededor de una necesidad |

El corte entre rutas era el límite: cada transición destruía un canvas y montaba otro. El mundo nuevo es **una sola escena y una sola cámara** donde esas tres vistas son estados del mismo espacio.

Nada de la lógica se reescribió. El mundo solo **lee**:

| Dato | Fuente (sin cambios) | En el mundo |
| --- | --- | --- |
| torres, casas, calles, amenidades | `location-seed.js` → `community.buildings/streets`, `Places.forBuilding` | geometría procedural + marcadores de capacidades del lugar |
| personas, capacidades, hogares nuevos | `State.graph()`, `community.households` | nodos (mismo tono + iniciales que el mapa y la constelación) |
| relaciones, fuerza, confianza indirecta, círculos | `Trust.relations / strengthOf / strength / via / circles / activeCircles` | lazos, distancia social, aros de círculo |
| frases humanas y verificación | `Trust.signals`, `Verification.labels` | ficha HTML de cada persona (nunca un número) |
| situación → solución | `Resolver.understandSituation / discoverNeeds / resolve / headline` | gravedad, convergencia y ficha de solución |
| pedir ayuda de verdad | `App.submitSituation` (vía `onAsk`) | el botón de la ficha entra al flujo real `#/s/<id>` |

## 2. Cada transformación es un concepto del producto

| En el espacio | Significa | Dónde vive |
| --- | --- | --- |
| geografía (posición sobre el plano) | proximidad | `WorldData` → `person.phys` |
| edificio que se vuelve cristal | capacidades del lugar | `building.solidT = 0.4` + amenidades |
| persona (nodo con sus puntos orbitando) | capacidad humana | `capList` |
| listón entre dos nodos | relación | `relationRibbons` |
| punteado fino · línea · listón ancho y dorado | se ayudaron una vez · empiezan a conocerse · se ayudan seguido | `STYLE.new / growing / frequent` |
| **distancia entre nodos** | **confianza** (nunca un score) | `layoutSocial()` |
| los demás se apartan y atenúan | la necesidad crea gravedad | `World.need()` |
| personas y recursos llegan a la necesidad | solución | `WorldData.plan()` |
| edificio fantasma + amenidad que viaja | el lugar forma parte de la solución | `story.places` (`placeSteps` del resolver) |
| aro que abraza a un grupo | círculo que esta situación ilumina | `addCircleRing` |
| pulso que viaja y vuelve | ayuda completada | `World.complete()` |
| los dos nodos quedan más cerca | la confianza creció | `WorldData.closer()` |

## 3. Arquitectura

```
js/world/world-data.js    modelo espacial puro (sin DOM ni Three; corre en Node)
js/world/world-scene.js   lo que se dibuja: geometría procedural, sprites, listones, pulsos
js/world/world.js         el director: estados, cámara, capa HTML, entrada, ciclo de vida
css/world.css             la capa HTML (día / atardecer)
world.html                prueba aislada: mismos datos, sin router ni vistas
scripts/test-world.mjs    20 comprobaciones del modelo espacial, sin navegador
```

**Todo tiene un valor actual y un objetivo.** La escena no anima "de A a B": cada pieza (posición de una persona, solidez de un edificio, cielo, progreso de un listón, pose de cámara) se acerca a su objetivo con un resorte críticamente amortiguado. El director solo cambia objetivos, así cualquier transición se puede interrumpir a la mitad —tocar "Mi edificio" mientras emerge la constelación— sin saltos.

**Estados espaciales** (reemplazan conceptualmente Home / Cerca / Conexiones / Perfil):

| Estado | Cielo | Arquitectura | Personas | Cámara |
| --- | --- | --- | --- | --- |
| Mi comunidad | día | sólida | sobre su techo | vista general |
| Mi edificio | día | el edificio en cristal; lo que estorba, fantasma | en su piso (nunca un departamento) | dolly al edificio |
| Mis círculos | atardecer | disuelta | constelación; el círculo se junta | cenital suave |
| Mis conexiones | atardecer | disuelta | constelación; solo tu red | cenital suave |
| Yo | atardecer | disuelta | tú y lo que tu comunidad sabe de ti | cerca |
| Necesidad | atardecer | disuelta (+ lugares fantasma) | convergen / se apartan | encuadra la gravedad |

**WebGL vs HTML.** WebGL: mundo, edificios, personas, recursos, lazos, partículas, cámara. HTML/CSS: título y estado (`aria-live`), navegación espacial (botones reales), etiquetas ancladas al mundo (los edificios y las personas son `<button>`: se llega con Tab y Enter), input de la necesidad, fichas, foto y "¿Te sirve?". No hay texto ni formularios dentro de WebGL.

## 4. El momento principal: Community Twin → Community Constellation

`World.reveal()` — 17 s, con "Saltar" y Escape:

1. **Casas.** El residencial de día; la cámara se aproxima.
2. Una ola sale de tu edificio: todo se vuelve **cristal**, luego se disuelve. Cae la tarde (crema → dorado → noche cálida).
3. **Personas.** Se quedan exactamente donde estaban; se encienden.
4. **Relaciones.** Los lazos se dibujan todavía sobre la geografía.
5. **Confianza.** Las posiciones físicas se reorganizan en sociales, primero tu red, al final los vecinos nuevos. Tú no te mueves: eres el centro.
6. **Comunidad.** *"Tu comunidad tiene más de lo que puedes ver."*

La primera vez que se pulsa "Mis conexiones" desde el día se reproduce esta secuencia; después es un cambio directo.

## 5. Rendimiento y degradación

- Geometría 100 % procedural: cajas, conos de 4 lados, listones, sprites de canvas. Cero modelos y cero texturas externas.
- Árboles con `InstancedMesh`; capacidades y polvo como `Points`. Medido en la prueba (1280×800, DPR 2): simulación + envío de un cuadro ≈ 0.6 ms de día y ≈ 0.3 ms al atardecer en CPU, contra un presupuesto de 16.6 ms. El tiempo de GPU en un teléfono real está por medirse.
- Sin sombras reales (manchas suaves), `MeshLambertMaterial`, DPR ≤ 2 (≤ 1.75 en móvil).
- **Degradación automática**: si los cuadros superan 26 ms de forma sostenida, baja la resolución antes que los fps.
- Inicialización diferida: Three.js se importa al entrar a la ruta; los pisos de un edificio se construyen al entrar en él; los nodos de una situación se crean cuando florecen.
- Pausa cuando la pestaña no es visible.
- `prefers-reduced-motion`: sin vuelos ni ola; cada estado aparece resuelto (verificado: la secuencia salta directo a la constelación con la frase).
- Sin WebGL, sin Three.js o sin plano (Los Pinos, Gràcia): `onFallback` lleva a `#/map` o `#/constellation`. Verificado.
- Historias densas (carne asada: 8 necesidades, 6 personas, 2 lugares): en el espacio hablan las personas; el detalle vive en la ficha HTML.

Pendiente recomendado para la demo: **vendorizar Three.js** en `assets/vendor/` (hoy se carga de jsdelivr, igual que `twin.js`). Sin red, el mundo cae al fallback.

## 6. Integración progresiva

Hecho (ediciones aditivas, nada se quitó):

- `index.html`: `css/world.css` + los tres módulos.
- `js/app.js`: ruta `#/world` (`?state=`, `?b=`, `?q=`, `?s=`), `onAsk → submitSituation`, `onFallback → #/map`.
- `js/views.js`: entrada en el Inicio ("Tu comunidad tiene más de lo que puedes ver"), solo si la comunidad tiene plano.

Siguiente, en orden de riesgo creciente:

1. Enlaces "Ver cómo se organiza tu comunidad" de la pantalla de situación → `#/world?s=<id>`.
2. Cerrar el ciclo con estado real: al resolver una conexión (`State.updateConnection … done`), abrir el mundo con `World.complete(personId)`; `Trust.relations()` ya aprende de las conexiones `done`, así que el lazo y la cercanía persisten solos.
3. Visual Confirm real: hoy la foto del mundo es de demo; conectar `State.addPhoto / updatePhoto` para que la foto que emerge sea la de la conexión.
4. Hacer de `#/world` el destino de la pestaña "Comunidad" y dejar mapa / edificio / constelación como "Vista clásica".
5. Retirar `ViewHandoff` y los tres canvases cuando el mundo cubra los tres casos (incluidas comunidades sin plano: constelación sin fase geográfica).

## 7. Cómo probar

```bash
node scripts/serve.mjs 8769       # http://localhost:8769/world.html  ·  /index.html#/world
node scripts/test-world.mjs       # 20/20: distancia = confianza, gravedad, lugar en la solución, cercanía tras ayudar
```

`world.html?state=reveal` reproduce el momento principal; `?q=<situación>` entra directo a una necesidad; `?state=building&b=torre-a` a un edificio. `World.advance(segundos)` avanza la simulación a mano (capturas, pestaña oculta).

Guion sugerido de demo (90 s): Mi comunidad → tocar Torre A (recepción 24 h, paquetes, bicicletero) → "Ver a las personas sin paredes" → escribir *"Necesito un vestido para una boda este sábado."* → "Ver una foto antes" → "Sí, me sirve" → Paulina queda más cerca.
