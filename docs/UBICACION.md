# Ubicación progresiva

La ubicación se usa **solo** para acercar el matching: ordenar y filtrar por
distancia a personas y capacidades de la comunidad. Nunca es requisito, nunca
se muestra y nunca se pide al cargar la app.

## Módulos

| Archivo | Qué hace |
| --- | --- |
| `js/location-service.js` | API pura de geolocalización: `getCurrentLocation()`, `getLocationPermission()`, `calculateDistance()`, `formatDistance()`, `distanceTo()`, zona manual, `toStorable()`. No conoce `State` ni `DATA`. |
| `js/location-seed.js` | Capa geográfica simulada de la comunidad demo: ancla ficticia, `buildings[]` (torres, casas, lugares comunes), `streets[]`, `zones[]`, `households[]` y, por persona, `location { lat, lng, zone, building, approximateDistance }` + `offset`. `person.distance` se deriva de las coordenadas. Se carga después de `communities/*.js`. |
| `js/map.js` | **Mapa de mi comunidad** (`#/map`): plano isométrico ilustrado en Canvas 2D. Lee `community.buildings/streets/households` y el grafo; usa `Matching.distanceLabelFor` para las etiquetas. Ver README. |
| `js/matching.js` | `Matching.findMatches(need, options)`: comunidad → tipo de capacidad → etiquetas → disponibilidad (rutinas) → distancia y radio. Devuelve candidatos con `because[]` y `distanceLabel`. |
| `js/location-ui.js` | `LocationUI.banner({ lang })` y `LocationUI.radiusNote()`. Escucha sus propias acciones (`data-location-action`) y refresca la vista. |
| `css/location.css` | Estilos del banner. `LocationUI` lo enlaza solo si `index.html` no lo hace. |
| `supabase/location.sql` | PostGIS: columnas aproximadas, `set_my_location()`, `nearby_profiles()`. |
| `scripts/test-location.mjs` | Pruebas en Node (`node scripts/test-location.mjs`). |

Orden de carga en `index.html`:

```html
<script src="js/data.js"></script>
<script src="js/location-service.js"></script>
<script src="js/matching.js"></script>
<script src="js/location-seed.js"></script>
<script src="js/location-ui.js"></script>
```

## Flujo para la persona

1. Entra y usa la app sin que nadie le pida nada.
2. Cuando ve una lista de personas (solución de una situación, "Tu comunidad
   hoy"), aparece un banner discreto: *"¿Buscar más cerca?"* con
   **Usar mi ubicación**, un selector **Elegir mi zona** y **Ahora no**.
3. Si acepta, el navegador pregunta. Con permiso, la lista se reordena y las
   tarjetas muestran "mismo edificio", "80 m", "250 m".
4. Si rechaza, el banner cambia a *"No tenemos acceso a tu ubicación. Elige tu
   zona"*. La zona basta para estimar distancias entre torres.
5. Si no hace nada, todo funciona con la distancia declarada de la semilla y el
   texto "cerca de ti".

## Qué considera `findMatches`

```js
Matching.findMatches(
  { tags: ['paquete', 'recibir'], kinds: ['time'], when: { date, from: 14, to: 17 }, lang: 'es' },
  { radius: 500, limit: 3, kinds: ['time', 'skill'], requireAvailability: false }
);
```

1. **Comunidad**: solo personas con la misma `communityId` (o sin ella, en demo).
2. **Tipo de capacidad**: `options.kinds` filtra; `need.kinds` solo prefiere.
3. **Etiquetas**: `need.tags` contra `capability.tags`.
4. **Disponibilidad**: rutinas (`days`, `from`, `to`) contra `need.when`.
   Las capacidades con `needsAvailability` (recibir paquetes) se excluyen si la
   persona no está; el resto solo pierde puntos.
5. **Ubicación y radio**: `LocationService.distanceTo(person)`. Fuera del radio
   se excluye; distancia desconocida no penaliza. `Matching.setDefaultRadius(null)`
   quita el límite ("Buscar más lejos").

También acepta el `when` heredado (`{ tags: ['manana', 'tarde'] }`) y las
`offers` antiguas, así que sirve como `discoverCapabilities` del resolver.

## Privacidad

- Las coordenadas viven en memoria y en `sessionStorage`; se van al cerrar la
  pestaña. En `localStorage` solo queda la zona elegida y si la persona ya
  dijo que no.
- Ninguna vista recibe coordenadas. `LocationService.snapshot()` no las incluye;
  `coords()` existe solo para la capa de datos.
- Lo que se guardará en Supabase es `toStorable()`: 3 decimales (~110 m) y la
  precisión declarada. `set_my_location()` vuelve a redondear en el servidor.
- `nearby_profiles()` devuelve distancia en metros redondeada a 10 m y nunca la
  columna `approx_geo`, que no es legible por `authenticated`.

## Modo demo

Cada persona vive en un edificio ficticio (`placement` en `location-seed.js`).
Su `offset` en metros es el del edificio más unos metros de jitter determinista,
y sus coordenadas son ese offset proyectado alrededor de un ancla ficticia. La
distancia entre dos personas es la haversine entre coordenadas; dos personas en
el mismo edificio están a 0 ("mismo edificio"). Nada se escribe a mano.

Sin GPS ni zona elegida, `LocationService.setDemoOrigin(user)` hace que todo se
mida desde el usuario simulado. Al conceder ubicación, el ancla se mueve a donde
está la persona (`community.anchorFollowsUser`) y `locate()` prefiere el offset
sobre `location`, así "Carlos · 120 m" sigue teniendo sentido en cualquier
ciudad. En live, `anchorFollowsUser` es `false`, no hay offsets y las posiciones
vienen de PostGIS.

Los `households[]` son hogares extra (vecinos nuevos con recursos y necesidades)
que solo existen en el mapa: no entran al grafo del resolver ni al matching.

## Pendiente para live

- Servicio `location-service` de Supabase que llame a `set_my_location()` con
  `LocationService.toStorable()` cuando la persona conceda permiso.
- Leer `nearby_profiles(radius)` y pasar `distance_m` a `Matching` como
  `person.distance` (el fallback ya lo respeta).
- Sin Google Maps, Mapbox ni Leaflet: el mapa de la comunidad es una ilustración propia del residencial ficticio; en live seguiría siendo un plano aproximado por edificio, nunca un mapa real con domicilios.
