-- =============================================================================
-- salon-os — Emparejamiento del agente de captura (A1a)
--
-- Guarda dónde escucha el agente de este salón y el secreto que comparten panel
-- y agente. Va en `salons.settings`, bajo la clave `imaging_agent`.
--
-- ── POR QUÉ AHÍ Y NO EN UNA TABLA APARTE ────────────────────────────────────
-- El token protege al agente de OTRAS WEBS abiertas en el mismo ordenador, no
-- del personal de la clínica: quien puede leerlo es exactamente quien está
-- autorizado a hacer radiografías. Y `salons` no se filtra:
--   · su RLS solo deja leer a los miembros del propio salón,
--   · la RPC pública `get_salon_branding` devuelve nombre, slug, logo y colores
--     — nunca `settings`,
--   · y la reserva pública lee `settings` con el cliente admin en el servidor,
--     del que solo salen valores derivados (intervalo, antelación, recurso
--     único), jamás el objeto entero.
-- Una tabla propia con RLS más estrecha no protegería de nadie más, y añadiría
-- una tabla al esquema para nada.
--
-- ── POR QUÉ UNA RPC Y NO UN UPDATE DIRECTO ──────────────────────────────────
-- Dos motivos, y los dos son de seguridad:
--
--   1. **No pisar lo que ya hay.** `settings` guarda además `single_resource`,
--      `slot_interval_minutes` y `min_lead_minutes`. Un update desde el cliente
--      obligaría a leer-modificar-escribir, y dos personas guardando a la vez
--      dejarían a un salón sin su `single_resource` — que en Biodental es lo que
--      impide dos pacientes en el mismo hueco. Aquí se fusiona con `||`, que es
--      atómico.
--   2. **Acotar QUÉ se puede escribir.** La RPC solo toca la clave
--      `imaging_agent`. Dar permiso de UPDATE sobre `settings` sería darlo sobre
--      todas las claves, las de hoy y las de mañana.
--
-- La política `owners_update_salon` limita el UPDATE al owner; configurar un
-- equipo es administrar la clínica, así que aquí se admite también manager, con
-- comprobación explícita de rol. De ahí el SECURITY DEFINER.
--
-- Aditiva: no crea tablas ni cambia filas existentes.
-- =============================================================================

begin;

create or replace function public.set_salon_imaging_agent(
  p_salon_id uuid,
  p_port     integer,
  p_token    text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_salon_role(p_salon_id, array['owner','manager']::public.member_role[]) then
    raise exception 'sin permiso para configurar el agente de este salon';
  end if;

  if p_port is null or p_port < 1 or p_port > 65535 then
    raise exception 'puerto fuera de rango';
  end if;

  -- Mismo umbral que `PAIRING_TOKEN_MIN_LENGTH` en src/lib/imaging/protocol.ts.
  -- Un secreto corto no es un secreto, y esta es la última línea de defensa por
  -- si alguien llama a la RPC sin pasar por el formulario.
  if p_token is null or length(p_token) < 32 or p_token !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'token de emparejamiento no valido';
  end if;

  update public.salons
     set settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object(
                         'imaging_agent',
                         jsonb_build_object('port', p_port, 'pairing_token', p_token)
                       )
   where id = p_salon_id;
end $$;

comment on function public.set_salon_imaging_agent(uuid, integer, text) is
  'Guarda puerto y token del agente de captura en salons.settings->imaging_agent, FUSIONANDO para no pisar el resto de ajustes. Exige rol owner/manager del salón.';

-- Como el resto de RPC del proyecto: fuera del alcance de anon.
revoke execute on function public.set_salon_imaging_agent(uuid, integer, text) from anon, public;
grant  execute on function public.set_salon_imaging_agent(uuid, integer, text) to authenticated;

commit;
