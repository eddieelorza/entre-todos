-- ============================================================================
-- Entre Todos · policies.sql  (Row Level Security)
-- Reglas:
--   · Todo se limita a la comunidad del usuario (my_community_id()).
--   · Cada quien modifica solo lo suyo.
--   · Solicitudes: solo las ve y actualiza quien participa; el trigger
--     guard_request_transition decide qué cambio puede hacer cada rol.
--   · Nada para el rol anon: sin sesión no se lee nada.
-- ============================================================================

alter table public.communities enable row level security;
alter table public.profiles    enable row level security;
alter table public.resources   enable row level security;
alter table public.needs       enable row level security;
alter table public.requests    enable row level security;
alter table public.connections enable row level security;

-- communities ---------------------------------------------------------------
drop policy if exists "communities: leer la mía" on public.communities;
create policy "communities: leer la mía" on public.communities
  for select to authenticated
  using (id = public.my_community_id());

-- profiles ------------------------------------------------------------------
drop policy if exists "profiles: leer mi comunidad" on public.profiles;
create policy "profiles: leer mi comunidad" on public.profiles
  for select to authenticated
  using (community_id = public.my_community_id());

drop policy if exists "profiles: actualizar el mío" on public.profiles;
create policy "profiles: actualizar el mío" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and community_id = public.my_community_id());

-- El perfil lo crea el trigger handle_new_user (security definer). Se permite
-- el insert propio por si el trigger no está instalado.
drop policy if exists "profiles: crear el mío" on public.profiles;
create policy "profiles: crear el mío" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- resources -----------------------------------------------------------------
drop policy if exists "resources: leer mi comunidad" on public.resources;
create policy "resources: leer mi comunidad" on public.resources
  for select to authenticated
  using (community_id = public.my_community_id());

drop policy if exists "resources: crear los míos" on public.resources;
create policy "resources: crear los míos" on public.resources
  for insert to authenticated
  with check (owner_id = auth.uid() and community_id = public.my_community_id());

drop policy if exists "resources: actualizar los míos" on public.resources;
create policy "resources: actualizar los míos" on public.resources
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and community_id = public.my_community_id());

drop policy if exists "resources: borrar los míos" on public.resources;
create policy "resources: borrar los míos" on public.resources
  for delete to authenticated
  using (owner_id = auth.uid());

-- needs ---------------------------------------------------------------------
drop policy if exists "needs: leer mi comunidad" on public.needs;
create policy "needs: leer mi comunidad" on public.needs
  for select to authenticated
  using (community_id = public.my_community_id());

drop policy if exists "needs: crear las mías" on public.needs;
create policy "needs: crear las mías" on public.needs
  for insert to authenticated
  with check (user_id = auth.uid() and community_id = public.my_community_id());

drop policy if exists "needs: actualizar las mías" on public.needs;
create policy "needs: actualizar las mías" on public.needs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and community_id = public.my_community_id());

drop policy if exists "needs: borrar las mías" on public.needs;
create policy "needs: borrar las mías" on public.needs
  for delete to authenticated
  using (user_id = auth.uid());

-- requests ------------------------------------------------------------------
drop policy if exists "requests: leer donde participo" on public.requests;
create policy "requests: leer donde participo" on public.requests
  for select to authenticated
  using (requester_id = auth.uid() or helper_id = auth.uid());

-- Puedo pedir (soy requester) o ofrecerme (soy helper). Ambas partes deben
-- ser de mi comunidad. El trigger valida el estado inicial según el rol.
drop policy if exists "requests: crear donde participo" on public.requests;
create policy "requests: crear donde participo" on public.requests
  for insert to authenticated
  with check (
    (requests.requester_id = auth.uid() or requests.helper_id = auth.uid())
    and exists (select 1 from public.profiles p where p.id = requests.requester_id and p.community_id = public.my_community_id())
    and exists (select 1 from public.profiles p where p.id = requests.helper_id    and p.community_id = public.my_community_id())
  );

drop policy if exists "requests: actualizar donde participo" on public.requests;
create policy "requests: actualizar donde participo" on public.requests
  for update to authenticated
  using (requester_id = auth.uid() or helper_id = auth.uid())
  with check (requester_id = auth.uid() or helper_id = auth.uid());

-- connections ---------------------------------------------------------------
-- Lectura por comunidad: alimenta las métricas y la confianza entre vecinos.
drop policy if exists "connections: leer mi comunidad" on public.connections;
create policy "connections: leer mi comunidad" on public.connections
  for select to authenticated
  using (community_id = public.my_community_id());

-- Solo se crea a partir de una solicitud aceptada en la que participo.
drop policy if exists "connections: crear donde participo" on public.connections;
create policy "connections: crear donde participo" on public.connections
  for insert to authenticated
  with check (
    (connections.requester_id = auth.uid() or connections.helper_id = auth.uid())
    and connections.community_id = public.my_community_id()
    and exists (
      select 1 from public.requests r
      where r.id = connections.request_id
        and r.requester_id = connections.requester_id
        and r.helper_id = connections.helper_id
        and r.status = 'completed'
    )
  );
-- Sin update ni delete: el historial no se edita.
