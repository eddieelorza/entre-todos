# legacy/

Código retirado del runtime en el replanteamiento de septiembre de 2026
(ver `docs/REPLANTEAMIENTO.md`). Nada de esto se carga en `index.html`.

- `matching.js` — el intérprete por palabras clave (`interpretNeed`, `findMatches`,
  `interpretOffer`). Reemplazado por `js/resolver.js`. El `js/matching.js` actual es
  un módulo nuevo (matching por comunidad, capacidad, disponibilidad y ubicación;
  ver `docs/UBICACION.md`), no una copia de este.
- `supabase/` — cliente, servicios y plan de migración a Supabase. El esquema
  (`needs`, `resources`, `requests`) codifica el modelo marketplace que dejamos
  atrás; se retomará cuando el modelo Situation → Solution esté validado.
