-- Almacén de datos del Buscador de ONGD (Supabase / PostgreSQL).
-- Esquema global: Entidad -> Localidad -> Provincia, con el enum Ambito.
-- Ejecutar completo en Supabase: SQL Editor -> New query -> pegar -> Run. Se puede ejecutar más de una vez.

do $$ begin
  create type ambito as enum (
    'MAYORES', 'DISCAPACIDAD', 'SALUD_MENTAL', 'INFANCIA_Y_JUVENTUD', 'MUJER', 'MIGRACION',
    'INCLUSION_SOCIAL', 'EDUCACION_Y_FORMACION', 'EMPLEO_E_INSERCION_LABORAL',
    'SALUD_Y_ATENCION_SOCIOSANITARIA', 'VOLUNTARIADO_Y_PARTICIPACION_COMUNITARIA',
    'CULTURA_Y_DESARROLLO_COMUNITARIO'
  );
exception when duplicate_object then null; end $$;

create table if not exists provincia (
  codigo text primary key,
  nombre text not null
);

create table if not exists localidad (
  codigo           text primary key,
  nombre           text not null,
  provincia_codigo text not null references provincia (codigo)
);

create table if not exists entidad (
  cod_entidad     text primary key,                    -- con prefijo de fuente: CAT:612, CV:1491, CAN:...
  nombre          text not null,
  ambito          ambito,
  direccion       text,                                 -- admite NULL: 8 centros de la Comunitat Valenciana no la traen
  codigo_postal   text,
  longitud        double precision check (longitud between -180 and 180),
  latitud         double precision check (latitud between -90 and 90),
  descripcion     text,
  contacto        text,
  url             text,
  localidad_codigo text not null references localidad (codigo),
  fuente          text not null check (fuente in ('CAT', 'CV', 'CAN'))
);
create index if not exists entidad_localidad_idx on entidad (localidad_codigo);
create index if not exists entidad_codigo_postal_idx on entidad (codigo_postal);
create index if not exists entidad_ambito_idx on entidad (ambito);

-- Una fila por fuente cargada: es el cerrojo que impide cargar dos veces sin borrar antes.
create table if not exists carga_fuente (
  fuente    text primary key check (fuente in ('CAT', 'CV', 'CAN')),
  cargada_en timestamptz not null default now(),
  cargados  integer not null default 0
);

-- Solo el servidor (service_role) accede. Para la API de búsqueda se añadirán políticas de lectura.
alter table provincia enable row level security;
alter table localidad enable row level security;
alter table entidad enable row level security;
alter table carga_fuente enable row level security;

-- Carga de una fuente completa en una sola transacción: o entra todo o no entra nada.
create or replace function cargar_fuente(p_fuente text, p_entidades jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_prov integer; n_loc integer; n_ent integer; n_conf integer;
begin
  if p_fuente is null or p_fuente not in ('CAT', 'CV', 'CAN') then
    raise exception 'FUENTE_DESCONOCIDA' using errcode = 'P0001';
  end if;
  if p_entidades is null or jsonb_typeof(p_entidades) <> 'array' then
    raise exception 'ENTIDADES_NO_ES_UNA_LISTA' using errcode = 'P0001';
  end if;

  begin
    insert into carga_fuente (fuente) values (p_fuente);
  exception when unique_violation then
    raise exception 'FUENTE_YA_CARGADA' using errcode = 'P0001';
  end;

  insert into provincia (codigo, nombre)
  select distinct on (e -> 'en_localidad' -> 'en_provincia' ->> 'codigo')
         e -> 'en_localidad' -> 'en_provincia' ->> 'codigo',
         e -> 'en_localidad' -> 'en_provincia' ->> 'nombre'
  from jsonb_array_elements(p_entidades) e
  on conflict (codigo) do nothing;
  get diagnostics n_prov = row_count;

  insert into localidad (codigo, nombre, provincia_codigo)
  select distinct on (e -> 'en_localidad' ->> 'codigo')
         e -> 'en_localidad' ->> 'codigo',
         e -> 'en_localidad' ->> 'nombre',
         e -> 'en_localidad' -> 'en_provincia' ->> 'codigo'
  from jsonb_array_elements(p_entidades) e
  on conflict (codigo) do nothing;
  get diagnostics n_loc = row_count;

  -- Localidades que ya existían con otro nombre (p. ej. códigos no INE de otra fuente): se avisa, no se pisan.
  select count(distinct l.codigo) into n_conf
  from jsonb_array_elements(p_entidades) e
  join localidad l on l.codigo = e -> 'en_localidad' ->> 'codigo'
  where lower(l.nombre) <> lower(e -> 'en_localidad' ->> 'nombre');

  insert into entidad (cod_entidad, nombre, ambito, direccion, codigo_postal, longitud, latitud,
                       descripcion, contacto, url, localidad_codigo, fuente)
  select e ->> 'cod_entidad', e ->> 'nombre', (e ->> 'ambito')::ambito, e ->> 'direccion',
         e ->> 'codigo_postal', (e ->> 'longitud')::double precision, (e ->> 'latitud')::double precision,
         e ->> 'descripcion', e ->> 'contacto', e ->> 'url', e -> 'en_localidad' ->> 'codigo', p_fuente
  from jsonb_array_elements(p_entidades) e;
  get diagnostics n_ent = row_count;

  update carga_fuente set cargados = n_ent where fuente = p_fuente;

  return jsonb_build_object('entidades', n_ent, 'localidades', n_loc, 'provincias', n_prov,
                            'localidades_con_nombre_distinto', n_conf);
end $$;

-- Borra todo el almacén y libera los cerrojos para poder cargar otros datos.
create or replace function borrar_almacen()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resultado jsonb;
begin
  select jsonb_build_object(
    'entidades', (select count(*) from entidad),
    'localidades', (select count(*) from localidad),
    'provincias', (select count(*) from provincia),
    'fuentes', (select count(*) from carga_fuente)) into resultado;
  truncate table entidad, localidad, provincia, carga_fuente;
  return resultado;
end $$;

create or replace function estado_almacen()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'fuentes', coalesce((select jsonb_agg(jsonb_build_object('fuente', fuente, 'cargada_en', cargada_en, 'cargados', cargados) order by fuente) from carga_fuente), '[]'::jsonb),
    'totales', jsonb_build_object(
      'entidades', (select count(*) from entidad),
      'localidades', (select count(*) from localidad),
      'provincias', (select count(*) from provincia)));
$$;

revoke all on function cargar_fuente(text, jsonb) from public, anon, authenticated;
revoke all on function borrar_almacen() from public, anon, authenticated;
revoke all on function estado_almacen() from public, anon, authenticated;
grant execute on function cargar_fuente(text, jsonb) to service_role;
grant execute on function borrar_almacen() to service_role;
grant execute on function estado_almacen() to service_role;
