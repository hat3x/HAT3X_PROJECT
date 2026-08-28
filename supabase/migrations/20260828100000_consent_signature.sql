-- =============================================================================
-- salon-os — Firma manuscrita del consentimiento informado (A2)
--
-- Hasta ahora firmar un consentimiento era escribir el nombre del paciente en
-- `signed_by_patient` (text). Eso es una ANOTACIÓN, no una firma: no prueba que
-- esa persona estuviera delante, ni QUÉ texto tenía delante. Y el consentimiento
-- informado es justo el documento que se discute cuando algo sale mal.
--
-- Esta migración añade las piezas que convierten la anotación en prueba:
--   · signature_path  — el TRAZO archivado (SVG en el bucket privado
--                       `patient-media`, `{salon_id}/{customer_id}/consent-{id}.svg`).
--   · signature_hash  — el SELLO: SHA-256 del contenido exacto que se firmó
--                       (título + cuerpo + versión de plantilla, serializados con
--                       prefijo de longitud en `src/lib/dental/consent-seal.ts`).
--                       Si alguien edita la plantilla después, el sello deja de
--                       cuadrar y el consentimiento aparece marcado, en vez de
--                       quedarse colgando de un texto que el paciente no leyó.
--   · signed_ip / signed_device — desde dónde se firmó, para el registro.
--
-- ── POR QUÉ LA RESTRICCIÓN CLAVE VA `NOT VALID` ─────────────────────────────
-- En producción ya hay 62 consentimientos en estado `signed` firmados con el
-- modelo viejo (solo nombre). No se pueden arreglar retroactivamente: nadie
-- puede volver atrás a recoger un trazo que nunca se capturó, y rellenarlos con
-- cualquier cosa sería fabricar una prueba. Así que:
--   · `consents_signed_requires_signature` se añade NOT VALID: obliga de aquí en
--     adelante y deja en paz lo ya escrito.
--   · Esas 62 filas quedan distinguibles por `signature_path is null`. La UI las
--     muestra como "firmado sin trazo (anterior a la firma manuscrita)" — que es
--     la verdad, y es más útil que aparentar que son equivalentes.
-- NO ejecutar `validate constraint` sobre ella: fallaría, y ese fallo sería el
-- comportamiento correcto.
--
-- Aditiva: todas las columnas nacen NULL, ninguna fila existente cambia.
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. Columnas de firma
-- ------------------------------------------------------------------------------
alter table public.consents
  add column if not exists signature_path text,
  add column if not exists signature_hash text,
  add column if not exists signed_ip      inet,
  add column if not exists signed_device  text;

comment on column public.consents.signature_path is
  'Ruta del trazo firmado (SVG) en el bucket privado patient-media. NULL en los consentimientos anteriores a la firma manuscrita.';

comment on column public.consents.signature_hash is
  'SHA-256 (hex) del contenido firmado: title + body + template_version serializados con prefijo de longitud. Recalcularlo y compararlo detecta si la plantilla se editó después de firmar.';

comment on column public.consents.signed_ip is
  'IP desde la que se firmó, para el registro.';

comment on column public.consents.signed_device is
  'Dispositivo desde el que se firmó (user agent), para el registro.';

-- ------------------------------------------------------------------------------
-- 2. Integridad de la firma
-- ------------------------------------------------------------------------------

-- El sello es un digest SHA-256 hex: cualquier otra cosa es un error de
-- programación, y aquí se corta en vez de guardarse.
alter table public.consents
  add constraint consents_signature_hash_format
  check (signature_hash is null or signature_hash ~ '^[a-f0-9]{64}$');

-- Trazo y sello son las dos mitades de lo mismo: un trazo sin sello no dice qué
-- se firmó, y un sello sin trazo no dice quién firmó. O están los dos, o ninguno.
alter table public.consents
  add constraint consents_signature_pair
  check ((signature_path is null) = (signature_hash is null));

-- De aquí en adelante, `signed` exige firma real. NOT VALID por las 62 filas
-- históricas (ver cabecera). No validar nunca esta restricción.
alter table public.consents
  add constraint consents_signed_requires_signature
  check (status <> 'signed' or signature_path is not null)
  not valid;

-- ------------------------------------------------------------------------------
-- 3. Inmutabilidad: la firma tampoco se retoca después
-- ------------------------------------------------------------------------------
-- Extiende el guard de `20260801110000_consents_images.sql`. La lista de
-- columnas protegidas crece con las de firma: si `signature_hash` se pudiera
-- reescribir, el sello dejaría de probar nada — bastaría con recalcularlo tras
-- editar el texto para que todo volviera a cuadrar.
create or replace function public.consents_guard_signed()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE') then
    if old.status <> 'pending' then
      raise exception 'un consentimiento firmado o revocado no se puede borrar';
    end if;
    return old;
  end if;
  -- UPDATE
  if old.status = 'revoked' then
    raise exception 'un consentimiento revocado es inmutable';
  end if;
  if old.status = 'signed' then
    -- Solo se permite la transición a revoked; el resto de columnas de contenido
    -- deben permanecer intactas.
    if new.status not in ('signed','revoked') then
      raise exception 'un consentimiento firmado solo puede pasar a revocado';
    end if;
    if new.type is distinct from old.type
       or new.body is distinct from old.body
       or new.template_version is distinct from old.template_version
       or new.title is distinct from old.title
       or new.document_uri is distinct from old.document_uri
       or new.signed_at is distinct from old.signed_at
       or new.signed_by_patient is distinct from old.signed_by_patient
       or new.signature_path is distinct from old.signature_path
       or new.signature_hash is distinct from old.signature_hash
       or new.signed_ip is distinct from old.signed_ip
       or new.signed_device is distinct from old.signed_device then
      raise exception 'un consentimiento firmado es inmutable (solo se puede revocar)';
    end if;
  end if;
  return new;
end $$;

-- Localiza rápido los consentimientos del modelo viejo, que la UI marca aparte.
create index if not exists consents_sin_trazo_idx
  on public.consents (salon_id, status)
  where signature_path is null;

commit;
