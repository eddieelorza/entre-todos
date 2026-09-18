-- ============================================================================
-- Entre Todos · schema.sql
-- Esquema mínimo para el MVP. Ejecutar en el SQL Editor de Supabase, en orden:
--   1. schema.sql   2. policies.sql   3. seed.sql
-- Idempotente: se puede volver a ejecutar.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.resource_type as enum ('object', 'food', 'time', 'knowledge', 'ride', 'help');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.resource_status as enum ('active', 'paused', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.need_status as enum ('open', 'matched', 'requested', 'accepted', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'completed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- communities
-- ---------------------------------------------------------------------------
create table if not exists public.communities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles · id = auth.users.id para usuarios reales.
-- Sin FK dura a auth.users para poder sembrar vecinos de demo (is_demo = true)
-- que nunca inician sesión. El trigger handle_new_user crea la fila real.
-- Privacidad: approx_location es "Torre B" / "Piso 4"; nunca el departamento.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key,
  community_id       uuid not null references public.communities(id),
  display_name       text not null,
  avatar_url         text,
  approx_location    text,
  approx_distance_m  integer not null default 0 check (approx_distance_m >= 0),
  verified_resident  boolean not null default false,
  is_demo            boolean not null default false,
  helps_completed    integer not null default 0,
  created_at         timestamptz not null default now()
);
create index if not exists profiles_community_idx on public.profiles (community_id);

-- ---------------------------------------------------------------------------
-- resources · lo que alguien puede ofrecer
-- ---------------------------------------------------------------------------
create table if not exists public.resources (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  community_id  uuid not null references public.communities(id),
  type          public.resource_type not null,
  title         text not null,
  description   text,
  icon          text,
  keywords      text[] not null default '{}',
  availability  text,
  status        public.resource_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists resources_community_status_idx on public.resources (community_id, status);
create index if not exists resources_owner_idx on public.resources (owner_id);

-- ---------------------------------------------------------------------------
-- needs · lo que alguien necesita.
-- intent: resultado de la interpretación (hoy reglas JS, mañana un modelo).
-- place: solo para type = 'ride' ("tráeme café de Costco").
-- ---------------------------------------------------------------------------
create table if not exists public.needs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  community_id  uuid not null references public.communities(id),
  type          public.resource_type not null default 'help',
  title         text not null,
  description   text,
  raw_input     text,
  intent        jsonb not null default '{}'::jsonb,
  place         text,
  needed_at     timestamptz,
  waiting       boolean not null default false,
  status        public.need_status not null default 'open',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists needs_community_status_idx on public.needs (community_id, status);
create index if not exists needs_user_idx on public.needs (user_id);
create index if not exists needs_ride_idx on public.needs (community_id, place) where type = 'ride';

-- ---------------------------------------------------------------------------
-- requests · una persona pide ayuda a otra (o se ofrece a ayudar: helper crea
-- la fila ya aceptada, caso "Voy a IKEA").
-- ---------------------------------------------------------------------------
create table if not exists public.requests (
  id            uuid primary key default gen_random_uuid(),
  need_id       uuid not null references public.needs(id) on delete cascade,
  requester_id  uuid not null references public.profiles(id),
  helper_id     uuid not null references public.profiles(id),
  resource_id   uuid references public.resources(id) on delete set null,
  message       text,
  status        public.request_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (requester_id <> helper_id)
);
create index if not exists requests_requester_idx on public.requests (requester_id);
create index if not exists requests_helper_idx on public.requests (helper_id);
create index if not exists requests_need_idx on public.requests (need_id);

-- ---------------------------------------------------------------------------
-- connections · registro final de cada ayuda. Fuente de métricas.
-- ---------------------------------------------------------------------------
create table if not exists public.connections (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities(id),
  need_id       uuid references public.needs(id) on delete set null,
  request_id    uuid unique references public.requests(id) on delete set null,
  requester_id  uuid not null references public.profiles(id),
  helper_id     uuid not null references public.profiles(id),
  type          public.resource_type not null,
  completed_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists connections_community_idx on public.connections (community_id, completed_at desc);
create index if not exists connections_helper_idx on public.connections (helper_id);
create index if not exists connections_requester_idx on public.connections (requester_id);

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------

-- Comunidad del usuario autenticado. security definer para no recursar en RLS.
create or replace function public.my_community_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select community_id from public.profiles where id = auth.uid();
$$;
revoke all on function public.my_community_id() from public;
grant execute on function public.my_community_id() to authenticated;

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at before update on public.resources
  for each row execute function public.set_updated_at();

drop trigger if exists needs_set_updated_at on public.needs;
create trigger needs_set_updated_at before update on public.needs
  for each row execute function public.set_updated_at();

drop trigger if exists requests_set_updated_at on public.requests;
create trigger requests_set_updated_at before update on public.requests
  for each row execute function public.set_updated_at();

-- Perfil automático al registrarse. Comunidad única por ahora.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  select id into cid from public.communities where slug = 'residencial-jacarandas';
  if cid is null then
    insert into public.communities (name, slug) values ('Residencial Jacarandas', 'residencial-jacarandas')
    returning id into cid;
  end if;
  insert into public.profiles (id, community_id, display_name)
  values (
    new.id,
    cid,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), initcap(split_part(new.email, '@', 1)))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Transiciones de estado de requests según el rol del usuario.
--   pending  → accepted | declined : helper (o requester si el helper es de demo)
--   pending  → cancelled           : requester
--   accepted → completed           : requester o helper
-- Con auth.uid() nulo (SQL Editor / seed) no se valida.
create or replace function public.guard_request_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  helper_is_demo boolean;
begin
  if uid is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'pending' and new.requester_id = uid then return new; end if;
    if new.status = 'accepted' and new.helper_id = uid then return new; end if;
    raise exception 'Solicitud inválida para este usuario';
  end if;

  if new.status = old.status then
    return new;
  end if;

  select is_demo into helper_is_demo from public.profiles where id = new.helper_id;

  if old.status = 'pending' and new.status in ('accepted', 'declined') then
    if uid = new.helper_id or (uid = new.requester_id and coalesce(helper_is_demo, false)) then
      return new;
    end if;
  elsif old.status = 'pending' and new.status = 'cancelled' then
    if uid = new.requester_id then return new; end if;
  elsif old.status = 'accepted' and new.status = 'completed' then
    if uid in (new.requester_id, new.helper_id) then return new; end if;
  end if;

  raise exception 'Transición % → % no permitida', old.status, new.status;
end $$;

drop trigger if exists requests_guard_transition on public.requests;
create trigger requests_guard_transition before insert or update on public.requests
  for each row execute function public.guard_request_transition();

-- Estado de la necesidad en función de sus solicitudes.
create or replace function public.sync_need_status()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  active_count integer;
begin
  if new.status = 'pending' then
    update public.needs set status = 'requested' where id = new.need_id and status in ('open', 'matched');
  elsif new.status = 'accepted' then
    update public.needs set status = 'accepted' where id = new.need_id and status <> 'completed';
  elsif new.status = 'completed' then
    update public.needs set status = 'completed' where id = new.need_id;
  elsif new.status in ('declined', 'cancelled') then
    select count(*) into active_count from public.requests
      where need_id = new.need_id and status in ('pending', 'accepted');
    if active_count = 0 then
      update public.needs set status = 'open' where id = new.need_id and status in ('requested', 'accepted');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists requests_sync_need_status on public.requests;
create trigger requests_sync_need_status after insert or update of status on public.requests
  for each row execute function public.sync_need_status();

-- Contador desnormalizado de ayudas completadas por vecino.
create or replace function public.bump_helps_completed()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.profiles set helps_completed = helps_completed + 1 where id = new.helper_id;
  return new;
end $$;

drop trigger if exists connections_bump_helps on public.connections;
create trigger connections_bump_helps after insert on public.connections
  for each row execute function public.bump_helps_completed();

-- Métricas de la comunidad del usuario. Una sola llamada: rpc('community_stats').
create or replace function public.community_stats()
returns json
language sql stable security invoker
set search_path = public
as $$
  with c as (
    select * from public.connections where community_id = public.my_community_id()
  ),
  people as (
    select helper_id as pid from c union select requester_id from c
  )
  select json_build_object(
    'completed',         (select count(*) from c),
    'reused',            (select count(*) from c where type = 'object'),
    'food',              (select count(*) from c where type = 'food'),
    'trips',             (select count(*) from c where type = 'ride'),
    'active_helpers',    (select count(distinct helper_id) from c),
    'active_requesters', (select count(distinct requester_id) from c),
    'people',            (select count(*) from people),
    'members',           (select count(*) from public.profiles where community_id = public.my_community_id())
  );
$$;
grant execute on function public.community_stats() to authenticated;
