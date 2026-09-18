# Círculos de confianza, Trust Graph y verificación

Fecha: 17 de septiembre de 2026. Complementa [REPLANTEAMIENTO.md](REPLANTEAMIENTO.md); no lo reemplaza.

**Posicionamiento.** De *compartir cosas con vecinos* a: **Entre Todos convierte tus círculos en una red de apoyo para la vida cotidiana.** No tienes que resolver todo solo. Idea secundaria: lo que necesitas puede estar más cerca de lo que imaginas. La app conecta cosas + tiempo + cuidado + conocimiento + compañía + experiencias + comunidad.

Narrativa que todo debe reforzar:

- The solution was already there. You just couldn't see it.
- Small acts become trusted relationships.
- Entre Todos doesn't assume you already have a community. It helps you build one.
- **Entre Todos turns everyday interactions into a trusted support network.**

## 1. Qué cambió y dónde vive

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Verificación simulada | `js/verification.js` | Estados `contact · identity · community` por persona. Señales humanas ("Identidad verificada", "Residente verificado", "Miembro desde…"). Requisitos por contexto. Adaptador de proveedor externo. |
| Trust Graph + círculos | `js/trust.js` | Relaciones persona↔persona (semilla + aprendidas), fuerza, confianza indirecta ("Conectada a través de Mariana"), círculos explícitos y emergentes, contextos de confianza, señales humanas, modelo de relevancia por perfil, sugerencia de círculo. |
| Modelo de datos mock | `js/communities/jacarandas.js` | `verification` por persona, `circles[]`, `trust[]`, `trustedFor` y `context` en capacidades. Personas nuevas: Laura (familias), Paulina (amigas). |
| Matching | `js/resolver.js` | Escenarios `costume`, `garment`, `ride`; `appointment` pasa a perfil `care` (sensible). `discoverCapabilities` suma `Trust.relevance()` y bloquea candidatos no aptos para contextos sensibles. Titulares nuevos ("Tu círculo puede armarte el look completo"). |
| Copy y UI | `js/ui.js`, `js/views.js`, `js/app.js` | `trustLine` muestra primero la relación y luego la verificación. Perfil → sección **Tu red**. Diálogo de pedir → alcance (mi círculo · grupo privado · vecinos cercanos · comunidad). Al resolver, sugerencia opcional de círculo. |
| Versión sencilla | `js/simple-mode.js` (`#/sencillo`) | Cuatro accesos grandes + voz cuando el navegador la ofrece. Manda la frase al mismo pipeline. |
| Persistencia | `js/state.js` | `learned.circles` y `learned.dismissed`. Nada más. Las relaciones aprendidas se derivan de conexiones `done` y situaciones resueltas: no hay tabla nueva. |

Nada de esto consume una API de IA en runtime. Claude es solo la herramienta con la que se construye.

## 2. Modelo conceptual

```
Person ↔ Person   Relation { a, b, interactions, given, received, contexts[], last }
                  · semilla: community.trust[]
                  · aprendida: State.connections (status done) + situaciones resueltas de la sesión
                  · fuerza 0..1 = interacciones + variedad de contextos + recencia (interna; nunca visible)

Circle            explícito  { id, label, members[], private?, sensitive? }   community.circles[] + State.learned.circles
                  emergente  frequent  (≥ 3 interacciones)   ·   reachable (sin relación directa, pero alguien de tu red frecuente ya se ayudó con esa persona)

Contexto          objects · packages · pets · rides · family · home · elder · children · sensitive
                  Alguien puede ser de confianza para objetos y paquetes y no para entrar a casa.
                  Fuentes: person.trustedFor[], contextos de la relación, pertenencia a círculos sensibles.

Verificación      { contact, identity, community } ∈ { none, pending, verified } + since + ref (opaca)
                  Requisitos por contexto (Verification.REQUIREMENTS): elder / home / children exigen identidad + comunidad.
```

### Etapas de una relación (`Trust.stage`)

```
unknown → reachable (conectada a través de alguien) → first (1) → familiar (2) → frequent (≥3) → circle (el usuario la agregó)
```

A las 4 interacciones aparece la sugerencia: *"Ya se han ayudado 4 veces. ¿Quieres agregar a Mariana a tu círculo de confianza?"* Siempre opcional. Nunca se agrega a nadie a un círculo sensible sin decisión explícita.

## 3. Relevancia (interna)

```
relevance = proximity + trust + availability + context_match + relationship_history + mutual_connections
```

Los pesos cambian con el perfil de la situación (`Trust.PROFILES`):

| Perfil | Qué manda | Escenarios |
| --- | --- | --- |
| `object` | proximidad, disponibilidad | herramientas, hielera |
| `family` | círculo de familias, contexto | disfraz |
| `garment` | círculo (amigas, mujeres, privado), afinidad, confianza | vestido de noche |
| `ride` | trayecto compatible, proximidad, confianza | ride |
| `care` | confianza, relación previa, disponibilidad, conexiones mutuas, verificación | acompañar a un adulto mayor, entrar a casa, cuidado infantil |

Reglas que evitan que la confianza rompa el matching:

- El gate (no aparecer) solo existe cuando la **necesidad** es sensible (`need.sensitive`, perfil `care`): identidad y comunidad verificadas, y relación directa, indirecta o círculo activo. El contexto inferido de una capacidad nunca bloquea.
- Fuera de `care` la confianza solo suma y está acotada (`care` 14 · `garment` 7 · `ride`/`family` 4 · resto 2.5 puntos), así nunca vence a un match exacto de capacidad: Diego sigue siendo el mecánico aunque Eddie tenga relación previa con Carlos; en Gràcia, donde Eddie es recién llegado y casi no tiene relaciones, Lukas y Youssef siguen apareciendo.

Ningún número se muestra: la vista recibe frases (`Trust.signals`).

## 4. Señales humanas (lo único visible)

- "Ya se han ayudado 4 veces."
- "Te ayudó con un paquete el mes pasado." / "Ayudaste a Valeria con un paquete hace unos días."
- "Conectada a través de Mariana."
- "Forma parte de tu red frecuente."
- "Han compartido objetos anteriormente."
- "Ya existe una relación de confianza."
- "Identidad verificada · Residente verificado · Miembro desde junio de 2024"

Nunca: estrellas, 4.8/5, ranking, puntos, leaderboards, "trust score", niveles de KYC.

## 5. Privacidad y alcance

- Nunca se revela dirección exacta, departamento, teléfono, ubicación exacta ni información familiar sensible.
- Cada situación tiene un `scope` que elige el usuario al pedir: `circle` · `private` · `nearby` · `community`. Lo sensible parte de `circle`; un vestido parte de `private`.
- La constelación y las vistas solo consumen frases y etiquetas; la fuerza numérica no sale de `trust.js`.

## 6. Historias demo nuevas (Jacarandas)

| Historia | Frase | Qué demuestra |
| --- | --- | --- |
| Acompañar a mi mamá | "Mi mamá necesita ir al doctor mañana a las 10 y no tengo quién la acompañe." | Perfil `care`: Carlos (relación previa, coche) + Sofía (mañanas libres, "Conectada a través de Mariana"). Alcance por defecto: mi círculo. |
| Disfraz de astronauta | "Mis hijos necesitan disfraz de astronauta para mañana." | Familias + objetos + conocimiento: Laura (traje), Ana (casco), Carlos (materiales). "Podemos armarlo sin comprar uno nuevo." |
| Vestido para una boda | "Necesito un vestido largo talla M para una boda este sábado." | Círculo de amigas, solución multipersona: Paulina (vestido), Mariana (bolsa), Andrea (accesorios). "Tu círculo puede armarte el look completo." |
| Hoy necesito ride | "Hoy necesito ride al sur a las 8." | Trayecto compatible + proximidad + confianza: Carlos. |
| Construcción de confianza | Resolver el paquete con Mariana | Pasa de 3 a 4 interacciones → "Ya se han ayudado 4 veces." + sugerencia de círculo. La constelación debe acercar el nodo. |

## 7. Conectar un proveedor real de verificación (futuro)

```js
Verification.setProvider({
  name: 'stripe-identity',
  start(personId, kind)  { /* abre el flujo del proveedor; devuelve { status: 'pending', ref } */ },
  status(personId, kind) { /* consulta; devuelve { status: 'verified' | 'pending' | 'none' } */ }
});
```

Las vistas no cambian: siguen leyendo `Verification.of(person)` y `Verification.labels(person)`. Este MVP no almacena documentos; `ref` es una referencia opaca del proveedor. En Supabase bastará una tabla `verifications (person_id, kind, status, provider, ref, verified_at)` sin datos del documento.

## 8. Qué NO se construyó (a propósito)

- Reputación compleja, scoring visible, permisos sofisticados por contexto (solo el gate de `care`).
- Backend nuevo, social feed, chat completo, moderación.
- Formularios para declarar círculos: los explícitos vienen de la semilla y del gesto "agregar a mi círculo"; los emergentes se calculan.

## 9. Pendientes para otras piezas

- **Community Constellation** (sesión "Community Constellation 3D"): dibujar relaciones con `Trust.relations()` y `Trust.strengthOf`, acercar nodos según `Trust.stage`, iluminar `Trust.activeCircles(u, needs)` cuando hay situación, mostrar `Trust.signals` en el tooltip. Ver la API en `js/trust.js`.
- **Copy general y README** (sesión "Entre Todos MVP repositioning"): nuevo posicionamiento en Inicio y en el README; historias nuevas en la tabla de demo.
- Los Pinos y Gràcia aún no tienen `circles[]` ni `trust[]`: `Trust` funciona con listas vacías (solo aprende de la sesión).
