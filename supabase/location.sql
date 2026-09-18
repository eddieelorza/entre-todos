-- ============================================================================
-- Entre Todos · location.sql
-- Ubicación aproximada con PostGIS. Ejecutar después de schema.sql.
-- Idempotente: se puede volver a ejecutar.
--
-- Principios:
--   · Solo guardamos una posición APROXIMADA (redondeada a ~110 m por el
--     cliente, LocationService.toStorable()) y la zona declarada.
--   · Ningún otro usuario puede leer coordenadas: la columna approx_geo no es
--     legible por `authenticated`. Lo único que sale es una distancia en
--     metros, ya redondeada, a través de nearby_profiles().
--   · Sin ubicación no pasa nada: la zona (torre/edificio) sirve de fallback.
-- ============================================================================

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- communities: ancla y zonas
-- ---------------------------------------------------------------------------
alter table public.communities
  add column if not exists anchor_geo geography(point, 4326),
  add column if not exists zones jsonb not null default '[]'::jsonb;
-- zones: [{ "id": "torre-a", "label": "Torre A", "offset": { "x": -90, "y": 45 } }]

-- ---------------------------------------------------------------------------
-- profiles: posición aproximada + zona
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists zone                text,
  add column if not exists approx_geo          geography(point, 4326),
  add column if not exists location_precision_m integer,
  add column if not exists location_updated_at timestamptz;

create index if not exists profiles_approx_geo_idx on public.profiles using gist (approx_geo);

-- Nadie lee coordenadas ajenas directamente. Se conceden columna por columna.
revoke select on public.profiles from authenticated;
grant select (id, community_id, display_name, avatar_url, approx_location, approx_distance_m,
              verified_resident, is_demo, helps_completed, created_at, zone)
  on public.profiles to authenticated;
-- La propia fila puede actualizar su ubicación (RLS de update ya limita a auth.uid()).
grant update (zone, approx_geo, location_precision_m, location_updated_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Guardar la ubicación aproximada del usuario actual.
-- El cliente ya la redondeó; aquí volvemos a redondear por si acaso (3 decimales
-- ≈ 110 m) para que nunca entre una posición exacta.
-- ---------------------------------------------------------------------------
create or replace function public.set_my_location(p_lat double precision, p_lng double precision, p_zone text default null, p_precision_m integer default 110)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set approx_geo = case
                        when p_lat is null or p_lng is null then null
                        else st_setsrid(st_makepoint(round(p_lng::numeric, 3), round(p_lat::numeric, 3)), 4326)::geography
                      end,
         zone = coalesce(p_zone, zone),
         location_precision_m = case when p_lat is null then null else greatest(coalesce(p_precision_m, 110), 110) end,
         location_updated_at = now()
   where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Vecinos cercanos: devuelve distancia redondeada, nunca la geografía.
-- Si el usuario no tiene approx_geo pero sí zona, se usa el ancla de su zona.
-- Si no hay nada, distance_m es null y el cliente muestra "cerca de ti".
-- ---------------------------------------------------------------------------
create or replace function public.zone_point(p_community uuid, p_zone text)
returns geography
language sql
stable
security definer
set search_path = public
as $$
  select case
           when c.anchor_geo is null or z.value is null then null
           else st_project(
                  c.anchor_geo,
                  sqrt(power((z.value->'offset'->>'x')::float, 2) + power((z.value->'offset'->>'y')::float, 2)),
                  atan2((z.value->'offset'->>'x')::float, (z.value->'offset'->>'y')::float)
                )::geography
         end
    from public.communities c
    left join lateral jsonb_array_elements(c.zones) z on z.value->>'id' = p_zone
   where c.id = p_community
   limit 1;
$$;

create or replace function public.nearby_profiles(p_radius_m integer default null)
returns table (
  id uuid,
  display_name text,
  approx_location text,
  zone text,
  same_building boolean,
  distance_m integer
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id, p.community_id, p.zone,
           coalesce(p.approx_geo, public.zone_point(p.community_id, p.zone)) as geo
      from public.profiles p
     where p.id = auth.uid()
  ),
  others as (
    select p.id, p.display_name, p.approx_location, p.zone, p.approx_distance_m,
           coalesce(p.approx_geo, public.zone_point(p.community_id, p.zone)) as geo
      from public.profiles p, me
     where p.community_id = me.community_id
       and p.id <> me.id
  )
  select o.id, o.display_name, o.approx_location, o.zone,
         (me.zone is not null and o.zone = me.zone) as same_building,
         case
           when me.zone is not null and o.zone = me.zone then 0
           when me.geo is not null and o.geo is not null then (round(st_distance(me.geo, o.geo) / 10.0) * 10)::integer
           else null
         end as distance_m
    from others o, me
   where p_radius_m is null
      or me.geo is null or o.geo is null
      or (me.zone is not null and o.zone = me.zone)
      or st_dwithin(me.geo, o.geo, p_radius_m)
   order by distance_m nulls last;
$$;

grant execute on function public.set_my_location(double precision, double precision, text, integer) to authenticated;
grant execute on function public.nearby_profiles(integer) to authenticated;
grant execute on function public.zone_point(uuid, text) to authenticated;
