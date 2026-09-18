-- ============================================================================
-- Entre Todos · seed.sql
-- Reproduce Residencial Jacarandas con los 12 vecinos de la demo, sus recursos,
-- los pendientes por lugar (necesidades tipo ride) y un historial de ayudas.
-- Idempotente: los ids son fijos y cada insert hace on conflict do nothing.
--
-- Los vecinos son perfiles con is_demo = true: no tienen usuario en auth.users
-- y aceptan solicitudes automáticamente (flujo de demo), ver
-- guard_request_transition en schema.sql.
-- ============================================================================

-- Comunidad --------------------------------------------------------------------
insert into public.communities (id, name, slug) values
  ('a0000000-0000-4000-8000-000000000001', 'Residencial Jacarandas', 'residencial-jacarandas')
on conflict (slug) do nothing;

-- Vecinos ----------------------------------------------------------------------
-- helps_completed inicial = cifra de la demo menos las conexiones sembradas abajo
-- (el trigger connections_bump_helps suma el resto).
insert into public.profiles (id, community_id, display_name, approx_location, approx_distance_m, verified_resident, is_demo, helps_completed, created_at) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Mariana', 'Piso 4',  0,   true, true, 6,  now() - interval '210 days'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Carlos',  'Torre B', 120, true, true, 9,  now() - interval '300 days'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Ana',     'Torre A', 80,  true, true, 4,  now() - interval '150 days'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Sofía',   'Piso 2',  0,   true, true, 8,  now() - interval '240 days'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Andrea',  'Torre C', 250, true, true, 12, now() - interval '400 days'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Luis',    'Torre C', 300, true, true, 4,  now() - interval '120 days'),
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'Diego',   'Torre B', 200, true, true, 2,  now() - interval '60 days'),
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'Fer',     'Torre A', 180, true, true, 6,  now() - interval '180 days'),
  ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'Valeria', 'Torre A', 90,  true, true, 9,  now() - interval '330 days'),
  ('b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'Jorge',   'Piso 1',  0,   true, true, 3,  now() - interval '90 days'),
  ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', 'Paola',   'Torre B', 150, true, true, 1,  now() - interval '45 days'),
  ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', 'Rodrigo', 'Torre C', 350, true, true, 9,  now() - interval '270 days')
on conflict (id) do nothing;

-- Recursos ---------------------------------------------------------------------
insert into public.resources (id, owner_id, community_id, type, title, description, icon, keywords, availability) values
  -- Mariana
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'time', 'Puedo recibir paquetes', 'Disponible mañana por la tarde.', '📦',
   '{paquete,paqueteria,envio,entrega,recibir,package,parcel,delivery}', 'Mañana por la tarde'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'food', 'Limones para compartir', 'Tiene limones de su árbol para compartir.', '🍋',
   '{limon,limones,fruta,lime,lemon}', 'Hoy y mañana'),
  -- Carlos
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'time', 'Puedo recibir paquetes', 'Disponible después de las 3 PM.', '📦',
   '{paquete,paqueteria,envio,entrega,recibir,package,parcel,delivery}', 'Después de las 3 PM'),
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'object', 'Taladro disponible', 'Tiene un taladro que puede prestarte.', '🪛',
   '{taladro,drill,perforar,colgar,repisa,herramienta,tool}', 'Esta semana'),
  -- Ana
  ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'time', 'Puedo recibir paquetes', 'Disponible todo el día.', '📦',
   '{paquete,paqueteria,envio,entrega,recibir,package,parcel,delivery}', 'Todo el día'),
  ('c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'object', 'Escalera disponible', 'Tiene una escalera de 6 peldaños.', '🪜',
   '{escalera,ladder,alto,techo,foco}', 'Cuando la necesites'),
  -- Sofía
  ('c0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'time', 'Puedo recibir paquetes esta tarde', 'Está en casa esta tarde.', '📦',
   '{paquete,paqueteria,envio,entrega,recibir,package,parcel,delivery}', 'Hoy por la tarde'),
  ('c0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'object', 'Sombrero para fiestas mexicanas', 'Tiene un sombrero que puede prestarte.', '🎩',
   '{sombrero,mexican,mexicano,mexicana,charro,"noche mexicana",wear,ropa,vestir,outfit}', 'Este mes'),
  -- Andrea
  ('c0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'knowledge', 'Ayudo a extranjeros con dudas sobre México', 'Puede ayudarte a entender qué sería apropiado usar en una Noche Mexicana.', '🇲🇽',
   '{mexico,mexican,mexicano,mexicana,cultura,extranjero,foreigner,tradicion,"noche mexicana",independencia,independence,costumbre,"que usar"}', 'Por mensaje o en persona'),
  ('c0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'knowledge', 'Práctica de inglés y español', 'Puede practicar idiomas contigo.', '🗣️',
   '{ingles,english,espanol,spanish,idioma,practicar,conversacion}', 'Fines de semana'),
  -- Luis
  ('c0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'help', 'Puedo ayudar con mascotas', 'Le encantan los animales y tiene tiempo entre semana.', '🐕',
   '{perro,gato,mascota,pasear,dog,cat,pet,cuidar,walk}', 'Entre semana'),
  -- Diego
  ('c0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'object', 'Caja de herramientas básica', 'Tiene martillo, desarmadores y pinzas.', '🧰',
   '{herramienta,martillo,desarmador,pinzas,llave,tool,reparar}', 'Fines de semana'),
  ('c0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'help', 'Arreglo bicis sencillas', 'Sabe arreglar ponchaduras y cadenas.', '🚲',
   '{bici,bicicleta,bike,llanta,cadena,ponchada}', 'Fines de semana'),
  -- Fer
  ('c0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'object', 'Camisa bordada disponible', 'Tiene una camisa bordada disponible.', '👕',
   '{camisa,bordada,bordado,ropa,vestir,wear,outfit,mexican,mexicano,mexicana,"noche mexicana",traje}', 'Este mes'),
  -- Valeria
  ('c0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'food', 'Tamales de rajas para compartir', 'Hizo tamales de más y quiere compartirlos.', '🫔',
   '{tamal,tamales,comida,cena,food,dinner,antojo}', 'Hoy'),
  ('c0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'food', 'Ingredientes de emergencia', 'Siempre tiene algo en la despensa para sacarte del apuro.', '🥚',
   '{huevo,huevos,leche,azucar,cebolla,tortillas,ingrediente,sal,aceite,eggs,milk}', 'Trabaja desde casa'),
  -- Jorge
  ('c0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'help', 'Ayudo a mover cosas pesadas', 'Puede ayudarte a cargar y mover.', '💪',
   '{mover,cargar,mudanza,subir,bajar,sofa,mueble,pesado,move,carry,heavy}', 'Sábados'),
  ('c0000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'object', 'Bocina portátil para reuniones', 'Tiene una bocina que presta para reuniones.', '🔊',
   '{bocina,musica,speaker,evento,reunion}', 'Fines de semana'),
  -- Paola
  ('c0000000-0000-4000-8000-000000000019', 'b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', 'help', 'Riego plantas cuando viajas', 'Puede pasar a regar tus plantas.', '🌱',
   '{planta,plantas,regar,riego,viaje,vacaciones,plants,water}', 'Mañanas'),
  -- Rodrigo
  ('c0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', 'knowledge', 'Ayudo con computadoras y wifi', 'Resuelve problemas de tecnología en minutos.', '💻',
   '{computadora,laptop,wifi,internet,impresora,celular,computer,printer}', 'Noches')
on conflict (id) do nothing;

-- Pendientes por lugar (alimentan "Parece que vas a IKEA") ---------------------
-- Son necesidades reales de tipo ride con un lugar. Cuando alguien avisa que va,
-- se ofrece como helper y la solicitud nace ya aceptada.
insert into public.needs (id, user_id, community_id, type, title, description, raw_input, intent, place, status) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'ride', 'Recoger una lámpara en IKEA', 'Necesita recoger una lámpara.', 'Necesito que alguien recoja una lámpara que pedí en IKEA.', '{"icon":"🛒"}', 'ikea', 'open'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'ride', 'Devolver una caja en IKEA', 'Quiere devolver una caja pequeña.', 'Tengo que devolver una caja pequeña en IKEA.', '{"icon":"🛒"}', 'ikea', 'open'),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'ride', 'Traer café de Costco', 'Necesita un paquete de café.', 'Si alguien va a Costco, necesito un paquete de café.', '{"icon":"🛒"}', 'costco', 'open'),
  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'ride', 'Traer pilas de Costco', 'Quiere pilas AA pero no tiene membresía.', 'Quiero pilas AA de Costco pero no tengo membresía.', '{"icon":"🛒"}', 'costco', 'open'),
  ('d0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'ride', 'Traer taquetes de Home Depot', 'Necesita una bolsa de taquetes.', 'Necesito una bolsa de taquetes de Home Depot.', '{"icon":"🛒"}', 'homedepot', 'open'),
  ('d0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'ride', 'Traer leche del súper', 'Se quedó sin leche y está con la bebé.', 'Me quedé sin leche y estoy con la bebé, ¿alguien va al súper?', '{"icon":"🛒"}', 'super', 'open'),
  ('d0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', 'ride', 'Traer vendas de la farmacia', 'Necesita unas vendas y no puede salir.', 'Necesito unas vendas de la farmacia y no puedo salir.', '{"icon":"🛒"}', 'farmacia', 'open')
on conflict (id) do nothing;

-- Historial de ayudas entre vecinos (métricas de impacto) ----------------------
insert into public.connections (id, community_id, requester_id, helper_id, type, completed_at) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'object',    now() - interval '3 days'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'food',      now() - interval '1 day'),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000006', 'help',      now() - interval '2 days'),
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000009', 'food',      now() - interval '4 days'),
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000005', 'knowledge', now() - interval '6 days'),
  ('e0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000012', 'knowledge', now() - interval '7 days'),
  ('e0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000010', 'help',      now() - interval '8 days'),
  ('e0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000007', 'object',    now() - interval '9 days'),
  ('e0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000004', 'time',      now() - interval '10 days'),
  ('e0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000008', 'object',    now() - interval '12 days'),
  ('e0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000011', 'help',      now() - interval '13 days'),
  ('e0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000002', 'object',    now() - interval '15 days'),
  ('e0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000003', 'object',    now() - interval '16 days'),
  ('e0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'time',      now() - interval '18 days'),
  ('e0000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000006', 'ride',      now() - interval '20 days'),
  ('e0000000-0000-4000-8000-000000000016', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'ride',      now() - interval '22 days'),
  ('e0000000-0000-4000-8000-000000000017', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000009', 'food',      now() - interval '25 days'),
  ('e0000000-0000-4000-8000-000000000018', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000005', 'knowledge', now() - interval '27 days')
on conflict (id) do nothing;
