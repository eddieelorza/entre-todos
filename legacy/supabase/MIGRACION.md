# Migración a persistencia real (Supabase) · Análisis y plan

Documento de la fase 1: qué existe hoy, cómo se mapea al modelo real y en qué
orden se migra. El código sigue siendo HTML + CSS + JS vanilla, sin build.

## 1. Arquitectura existente

| Módulo | Responsabilidad | Dependencias de datos |
| --- | --- | --- |
| `js/data.js` | Mock: comunidad, usuario, 12 vecinos con `offers`, `errands` (pendientes por lugar), conexiones semilla, léxicos, ejemplos | — |
| `js/state.js` | Estado mutable + persistencia en `localStorage` (`entre-todos:state`) | `DATA.seedConnections`, `DATA.user.baseStats`, `DATA.impact` |
| `js/matching.js` | `interpretNeed`, `findMatches`, `findTripOpportunities`, `buildMessage`, `interpretOffer` | `DATA.residents`, `DATA.errands`, `DATA.places`, `DATA.resourceLexicon` |
| `js/ui.js` | Componentes HTML, diálogo, toast, secuencia "Entendiendo…" | `UI.resident(id)` → `DATA.residents` |
| `js/views.js` | Pantallas + `Session` (estado efímero) | `State.*`, `DATA.residents`, `DATA.user`, `DATA.community` |
| `js/app.js` | Arranque, rutas, `data-action`, `data-form`, aceptación simulada | `State.*`, `DATA.errands`, `DATA.community` |
| `js/router.js` | Router por hash | — |

Toda la API de `State` es síncrona y las vistas la llaman directamente
(`State.getNeed`, `State.connectionsForNeed`, `State.shared()`…).

### Dónde se usa localStorage

Solo en `js/state.js`: `load()`, `save()`, `reset()`. Nada más toca el
almacenamiento. Esa es la única frontera a sustituir.

### Modelo de datos actual (en memoria)

```
need        { id, text, intent, createdAt, waiting }
shared      { id, title, kind, icon, type, keywords, availability, action, createdAt }   ← recursos de Eddie
connection  { id, kind: request|helping, status: sent|accepted|completed|returned,
              needId, residentId, offerId?, errandId?, title, icon, message?, when,
              completeLabel?, doneStatus?, seed?, createdAt, updatedAt }
resident    { id, name, initials, tone, place, distance, completed, offers[] }            ← mock
offer       { id, kind, icon, title, keywords, availTags, availability, reason, action, ask, askEn, nearby }
errand      { id, place, residentId, text, title }                                          ← mock
```

`kind` de recurso: `objeto | comida | tiempo | conocimiento | ayuda`.

## 2. Mapeo al modelo real

| Hoy | Supabase | Notas |
| --- | --- | --- |
| `DATA.community` | `communities` | Una sola: *Residencial Jacarandas* (`slug = residencial-jacarandas`) |
| `DATA.user`, `resident` | `profiles` | `display_name`, `approx_location` (Torre B / Piso 4), `approx_distance_m`, `helps_completed` (contador), `is_demo` |
| `offer`, `shared` | `resources` | `kind` → `type` (`objeto→object`, `comida→food`, `tiempo→time`, `conocimiento→knowledge`, `ayuda→help`). `reason` → `description`. `action`, `ask`, `availTags` se derivan del tipo/disponibilidad en JS |
| `need` | `needs` | `text` → `raw_input`; `intent` completo se guarda en `intent jsonb` (es el resultado de la interpretación, mañana vendrá de un modelo) |
| `errand` | `needs` con `type = ride` y `place` | Un pendiente "tráeme café de Costco" es una necesidad real de tipo *ride* |
| `connection` (activa) | `requests` | `sent→pending`, `accepted→accepted`, `completed/returned→completed`. `kind` se deriva de si soy `requester_id` o `helper_id` |
| `connection` (terminada) | `requests` + fila en `connections` | `connections` es la fuente de métricas |
| `intent.mode = trip` ("Voy a IKEA") | no se persiste | Es un momento efímero de la sesión; los pendientes que descubre sí vienen de `needs` |

Añadidos mínimos respecto al esquema propuesto, todos justificados:

- `profiles.approx_distance_m`, `profiles.is_demo`, `profiles.helps_completed`
- `resources.icon`, `resources.keywords text[]`
- `needs.intent jsonb`, `needs.place`, `needs.waiting`

## 3. Principio de diseño de la migración

`State` sigue siendo **síncrono y en memoria**. Las vistas no cambian su
forma de leer datos. Lo que cambia:

1. `State.load()` pasa a ser `async`: en modo *live* descarga un snapshot de la
   comunidad (una vez por sesión) y lo convierte a las formas de arriba.
2. Cada mutación (`addNeed`, `addConnection`, `updateConnection`, `addShared`…)
   actualiza la memoria de inmediato y **persiste en segundo plano** (write-through)
   a través de la capa de servicios. Si falla, se muestra un toast y se registra
   un warning.
3. Los ids se generan en el cliente (UUID v4) para que la UI no tenga que
   esperar a la base.
4. `DATA.residents`, `DATA.errands`, `DATA.user`, `DATA.community` se sustituyen
   por `State.residents()`, `State.errands()`, `State.user()`, `State.community()`.
   En demo devuelven exactamente los mocks de `data.js`.

```
Views / App / Matching / UI
        ↓  (API síncrona, sin cambios)
      State  ── demo ──▶ localStorage + DATA
        │
        └─── live ──▶ services/*  ──▶ db.js (Supabase SDK) ──▶ PostgreSQL
```

El interruptor demo/live vive en **un solo lugar** (`State.load`). Los servicios
solo conocen Supabase; nunca tienen ramas de demo. La lógica de negocio
(interpretación, matching, estadísticas derivadas) no se duplica.

## 4. Capa de servicios

```
js/db.js                          cliente Supabase, modo (demo|live), carga perezosa del SDK
js/services/auth-service.js       magic link, sesión, cierre de sesión
js/services/community-service.js  loadSnapshot(), updateProfile(), directorio de vecinos
js/services/resources-service.js  listCommunity(), create(), archive(), mapeos row↔offer
js/services/needs-service.js      listForSession(), create(), update(), mapeos row↔need/errand
js/services/requests-service.js   listMine(), create(), accept(), decline(), mapeo row↔connection
js/services/connections-service.js complete() (request→completed + fila en connections), getCommunityStats()
```

Fuera de `js/services/` y `js/db.js` nadie conoce nombres de tablas.

## 5. Orden de migración (incremental)

1. **Configuración**: `config.example.js`, `config.js` (ignorado), `APP_MODE`.
2. **Cliente**: `db.js` con carga del SDK solo en modo live y bloqueo de `service_role`.
3. **Esquema SQL**: `communities`, `profiles`, `resources`, `needs`, `requests`, `connections` + triggers.
4. **Servicios de lectura**: snapshot de comunidad (profiles, resources, needs, requests, stats).
5. **State async + directorio**: sustituir `DATA.*` por `State.*` en matching/ui/views/app.
6. **Escrituras**: needs → resources → requests → connections (write-through).
7. **Auth**: vista de login con magic link; guardia de rutas; modo demo sin registro.
8. **RLS**: políticas por comunidad y por participante; trigger de transiciones de estado.
9. **Seed**: Residencial Jacarandas con los 12 vecinos, recursos, pendientes y conexiones.
10. **Adaptador demo/live desde la UI**: selector en Perfil, override en localStorage.

Después de cada etapa: abrir la app, revisar consola, recorrer historias A–E.

## 6. Qué NO cambia

- Vistas, router, CSS y flujo de demo (aceptación simulada a los ~3 s).
- `interpretNeed`, `findMatches`, `buildMessage`, `interpretOffer`: mismas firmas,
  solo cambia de dónde salen los vecinos.
- `localStorage` sigue siendo la persistencia del modo demo.

## 7. Limitaciones conocidas de esta fase

- Sin realtime: para ver una solicitud nueva, el vecino recarga la página.
- Los vecinos semilla (`is_demo = true`) aceptan solos, igual que en la demo.
  Con vecinos reales, la solicitud queda en "Esperando respuesta" hasta que
  el otro la acepte desde *Mis conexiones → Ayudando*.
- Un viaje ("Voy a IKEA") no se guarda; los pendientes que muestra sí son reales.
- `needed_at` queda en `null`; la interpretación de "cuándo" vive en `intent.when`.
