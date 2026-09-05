-- =============================================================================
-- salon-os — Migración de DATOS: BACKFILL de entitlements (salon_features)
--
-- Arranca los add-ons ya EN USO para que el gate opt-in de
-- 20260718100000_salon_features (deny-by-default: sin fila ⇒ el módulo NO
-- aparece) NO haga desaparecer módulos que hoy funcionan. Es la "migración de
-- datos aparte" que aquella migración de ESQUEMA anticipa explícitamente
-- (§cabecera: "Un arranque masivo (p. ej. todos con 'loyalty', hoy nativo) iría
-- en una migración de datos aparte") y respeta la regla de la casa de NO mezclar
-- DDL con DML en el mismo archivo (schema vs data migration).
--
-- Da de alta 'loyalty', 'client_app', 'staff_app' y 'pos' (NO 'ai_receptionist':
-- add-on de pago aún sin contratar por nadie) para:
--
--   (A) el salón denueveanueve (slug 'denueveanueve'), INCONDICIONAL. Es el salón
--       insignia —origen del sistema (loyalty, app de cliente, app de staff,
--       recepcionista) portado a Salón OS—; contrata los cuatro. Nótese que el
--       seed (supabase/seed/denueveanueve.sql) lo crea SIN miembros, sin
--       user_id en profesionales, sin clientes y sin actividad de TPV/loyalty:
--       la detección por uso (B) NO lo encontraría, por eso su alta va por slug.
--
--   (B) todo salón que YA ESTUVIERA USANDO cada capacidad, detectado por la
--       PRESENCIA de datos de actividad REAL. Cada señal evita a propósito los
--       falsos positivos de la AUTOPROVISIÓN por trigger (métodos de pago del
--       TPV y cuenta/cupón de loyalty se crean solos y NO implican uso):
--
--         loyalty     → points_movements (libro mayor)  OR  rewards (hitos)  OR
--                       loyalty_accounts con actividad (points_balance>0 OR
--                       visits_total>0 OR last_visit_at not null)  OR
--                       welcome_coupons con status<>'ACTIVE' (canjeado/caducado).
--                       [la cuenta y el cupón se autoprovisionan por cliente vía
--                        app.bootstrap_customer_loyalty (cuenta a cero, cupón
--                        ACTIVE) ⇒ su mera existencia NO es uso; se exige rastro
--                        de movimientos/recompensas/saldo o un cupón ya no ACTIVE]
--         client_app  → customers.user_id not null (una ficha enlazada a una
--                       cuenta de auth: solo el registro en la PWA de cliente
--                       rellena user_id — no lo pone ningún trigger).
--         staff_app   → professionals.user_id not null  OR  salon_members con
--                       role='staff'. El público de la PWA de personal. El
--                       trigger app.register_salon_owner solo crea un miembro
--                       'owner' (y solo si hay auth.uid()); nunca 'staff' ni
--                       user_id de profesional ⇒ ambas señales son uso deliberado,
--                       no autoprovisión.
--         pos         → pos_sales OR pos_payments OR pos_sessions (venta/cobro/
--                       caja reales). Los pos_payment_methods se autoprovisionan
--                       por salón (app.register_salon_payment_methods) ⇒ NO cuentan.
--
-- IDEMPOTENTE y SEGURO:
--   · Un único INSERT ... ON CONFLICT (salon_id, feature) DO NOTHING: re-ejecutar
--     no duplica nada y —clave— NO resucita ni pisa filas ya provistas por HAT3X.
--     Si HAT3X puso enabled=false (suspensión por impago) o ajustó las notes, el
--     DO NOTHING lo RESPETA (no un DO UPDATE que lo reactivaría). El trabajo del
--     backfill es GARANTIZAR QUE EXISTA LA FILA (opt-in), no forzar enabled=true.
--   · Todo por SLUG/SELECT: si el salón no existe (BD limpia sin seed), su rama no
--     inserta nada y la migración NO falla. Robusto ante el orden migración↔seed
--     (en prod, `db push` corre sobre una BD donde denueveanueve YA existe; en
--     local, el seed de subcarpeta se aplica a mano — ver NOTAS).
--   · Solo DML dentro de una transacción; lee vía EXISTS correlado (índices por
--     salon_id ya presentes) e inserta en una tabla diminuta ⇒ sin locks de riesgo.
--   · Guardián final (defensa en profundidad, patrón de la casa): exige el esquema
--     de entitlements presente y —si denueveanueve existe— sus 4 add-ons dados de
--     alta; además emite el recuento por add-on (sin cifras silenciosas).
-- =============================================================================

begin;

-- ------------------------------------------------------------------------------
-- Alta idempotente: denueveanueve (incondicional) ∪ salones con uso previo.
--
-- UNION (no UNION ALL) deduplica los pares (salon_id, feature) antes del INSERT
-- —en prod denueveanueve casa además por varias ramas de actividad—; el ON
-- CONFLICT cubre las filas ya existentes. notes deja un rastro de origen del alta.
-- ------------------------------------------------------------------------------
with grants (salon_id, feature) as (

  -- (A) denueveanueve → los 4 add-ons, por slug e incondicional.
  select d.id, f.feature
  from public.salons d
  cross join (values
    ('loyalty'::public.salon_feature),
    ('client_app'::public.salon_feature),
    ('staff_app'::public.salon_feature),
    ('pos'::public.salon_feature)
  ) as f(feature)
  where d.slug = 'denueveanueve'

  union

  -- (B.loyalty) actividad real de fidelización (no la autoprovisión por cliente).
  select s.id, 'loyalty'::public.salon_feature
  from public.salons s
  where exists (select 1 from public.points_movements pm where pm.salon_id = s.id)
     or exists (select 1 from public.rewards r          where r.salon_id  = s.id)
     or exists (select 1 from public.loyalty_accounts la
                 where la.salon_id = s.id
                   and (la.points_balance > 0
                        or la.visits_total > 0
                        or la.last_visit_at is not null))
     -- cupón de bienvenida ya NO ACTIVE (canjeado/caducado): el bootstrap solo
     -- crea cupones ACTIVE ⇒ status<>'ACTIVE' es acción deliberada del staff
     -- (p. ej. canje directo por la UI sin pasar por staff_award_visit, que no
     -- deja points_movements). Cierra ese falso-negativo de loyalty.
     or exists (select 1 from public.welcome_coupons wc
                 where wc.salon_id = s.id and wc.status <> 'ACTIVE')

  union

  -- (B.client_app) al menos una ficha enlazada a una cuenta de auth (registro PWA).
  select s.id, 'client_app'::public.salon_feature
  from public.salons s
  where exists (select 1 from public.customers c
                 where c.salon_id = s.id and c.user_id is not null)

  union

  -- (B.staff_app) staff "de app": profesional con cuenta O miembro con rol staff.
  select s.id, 'staff_app'::public.salon_feature
  from public.salons s
  where exists (select 1 from public.professionals p
                 where p.salon_id = s.id and p.user_id is not null)
     or exists (select 1 from public.salon_members m
                 where m.salon_id = s.id and m.role = 'staff')

  union

  -- (B.pos) actividad real de TPV (no los métodos de pago autoprovisionados).
  select s.id, 'pos'::public.salon_feature
  from public.salons s
  where exists (select 1 from public.pos_sales    ps  where ps.salon_id  = s.id)
     or exists (select 1 from public.pos_payments pp  where pp.salon_id  = s.id)
     or exists (select 1 from public.pos_sessions pse where pse.salon_id = s.id)
)
insert into public.salon_features (salon_id, feature, enabled, notes)
select g.salon_id, g.feature, true,
       'Backfill entitlements (arranque productización 2026-07-18): denueveanueve + salones con uso previo.'
from grants g
on conflict (salon_id, feature) do nothing;

-- ------------------------------------------------------------------------------
-- Guardián de aserción (re-ejecutable en CI/entorno limpio).
--
-- (0) El esquema de entitlements existe (falla RUIDOSAMENTE si esta migración se
--     aplicara antes que 20260718100000_salon_features, en vez de un error críptico).
-- (a) Requisito de la tarea: si denueveanueve existe, tiene la FILA de sus 4
--     add-ons (verifica EXISTENCIA/opt-in, no el estado enabled: una suspensión
--     de HAT3X con enabled=false es válida y NO debe hacer fallar el guardián).
--     Tras el INSERT anterior, en la MISMA transacción, la aserción es estable.
-- (b) Observabilidad: recuento de salones por add-on (no dejar cifras en silencio).
-- ------------------------------------------------------------------------------
do $guard$
declare
  _dna          uuid;
  _missing      text;
  _n_loyalty    integer;
  _n_client_app integer;
  _n_staff_app  integer;
  _n_pos        integer;
begin
  -- (0) Precondición: enum + tabla de entitlements presentes.
  if to_regtype('public.salon_feature') is null
     or to_regclass('public.salon_features') is null then
    raise exception
      'GUARDIÁN BACKFILL ENTITLEMENTS: falta el enum/tabla de entitlements — ¿se aplicó 20260718100000_salon_features antes?'
      using errcode = 'raise_exception';
  end if;

  -- (a) denueveanueve, si existe, con los 4 add-ons obligatorios.
  select id into _dna from public.salons where slug = 'denueveanueve';
  if _dna is not null then
    select string_agg(f.feature::text, ', ') into _missing
    from (values
      ('loyalty'::public.salon_feature),
      ('client_app'::public.salon_feature),
      ('staff_app'::public.salon_feature),
      ('pos'::public.salon_feature)
    ) as f(feature)
    where not exists (
      select 1 from public.salon_features sf
      where sf.salon_id = _dna and sf.feature = f.feature
    );
    if _missing is not null then
      raise exception
        'GUARDIÁN BACKFILL ENTITLEMENTS: denueveanueve sin los add-ons obligatorios: %', _missing
        using errcode = 'raise_exception';
    end if;
  else
    raise notice
      'GUARDIÁN BACKFILL ENTITLEMENTS: denueveanueve no existe en esta BD (¿seed sin aplicar?) — alta por slug omitida, sin error.';
  end if;

  -- (b) Recuento por add-on tras el backfill.
  select count(*) into _n_loyalty    from public.salon_features where feature = 'loyalty';
  select count(*) into _n_client_app from public.salon_features where feature = 'client_app';
  select count(*) into _n_staff_app  from public.salon_features where feature = 'staff_app';
  select count(*) into _n_pos        from public.salon_features where feature = 'pos';

  raise notice
    'BACKFILL ENTITLEMENTS aplicado — salones por add-on: loyalty=%, client_app=%, staff_app=%, pos=%.',
    _n_loyalty, _n_client_app, _n_staff_app, _n_pos;
end;
$guard$;

commit;

-- =============================================================================
-- NOTAS PARA FUTUROS MANTENEDORES
--
-- • Semántica: este backfill solo GARANTIZA LA EXISTENCIA de la fila (opt-in). No
--   toca enabled ni notes de filas ya presentes (ON CONFLICT DO NOTHING). Para
--   suspender un add-on ya provisto, poner enabled=false (no borrar esta fila);
--   para conceder uno nuevo, usar el upsert de aprovisionamiento de HAT3X
--   (service_role, bypasa RLS) documentado en 20260718100000_salon_features:
--     insert into public.salon_features (salon_id, feature, enabled, notes)
--     values ('<uuid>', 'pos', true, 'plan TPV')
--     on conflict (salon_id, feature) do update
--       set enabled = excluded.enabled, notes = excluded.notes;
--
-- • Señales de "uso" (rama B): deliberadamente basadas en ACTIVIDAD real y NO en
--   filas autoprovisionadas por trigger (pos_payment_methods, loyalty_accounts/
--   welcome_coupons de cada cliente). Un salón sin rastro de uso queda SIN filas
--   —justo el opt-in que persigue el gate—: no se le regala ningún add-on. Si en
--   el futuro cambia una autoprovisión, revisar que la señal siga sin falsos
--   positivos.
--
-- • Límite CONOCIDO de staff_app (asumido, no un descuido): la señal es
--   professionals.user_id o un miembro role='staff'. NO se incluye 'owner'
--   porque app.register_salon_owner crea un miembro owner en CADA salón creado
--   por la web ⇒ incluirlo regalaría staff_app a todos y anularía el gate. Coste:
--   un salón "solo owner" que use la PWA de personal sin staff ni profesionales
--   con cuenta NO se autodetecta; HAT3X lo provisiona a mano (upsert de arriba).
--   denueveanueve no sufre este límite: recibe staff_app por slug (rama A).
--
-- • Orden migración ↔ seed (local): el seed vive en supabase/seed/denueveanueve.sql
--   (subcarpeta, NO el supabase/seed.sql que `db reset` aplicaría solo) y se corre
--   a mano. En PRODUCCIÓN, `db push` aplica esta migración sobre una BD donde
--   denueveanueve YA existe ⇒ recibe sus 4 add-ons. En LOCAL, si se crea el salón
--   por seed DESPUÉS de esta migración, dale sus entitlements re-lanzando este
--   mismo bloque de alta por slug (es idempotente) o el upsert de HAT3X.
--
-- • Rollback manual (forward-only; solo si hubiera que revertir ESTE backfill):
--     delete from public.salon_features
--     where notes like 'Backfill entitlements (arranque productización 2026-07-18)%';
--   (Borra solo las filas dadas de alta por este backfill; respeta las provistas
--    a mano por HAT3X, con otras notes.)
-- =============================================================================
