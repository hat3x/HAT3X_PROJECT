-- =============================================================================
-- Seed: alta de "De Nueve a Nueve" como salón real en Salón OS
--
-- Datos extraídos del proyecto de la recepcionista de voz (denueveanueve-voz):
--   - 2 sedes: Collado Villalba (10 empleados) y Alpedrete (3)
--   - Catálogo completo con duración en 3 fases (aplicación / exposición / post)
--   - Horario 09:00–21:00 (el nombre del salón: "de nueve a nueve"), Lun–Sáb
--
-- Idempotente: si el salón ya existe (slug denueveanueve) no hace nada.
-- Precios a 0 (en denueveanueve los precios se consultan en salón, no por la app).
-- =============================================================================

do $$
declare
  v_salon      uuid;
  v_collado    uuid;
  v_alpedrete  uuid;
begin
  if exists (select 1 from public.salons where slug = 'denueveanueve') then
    raise notice 'El salón denueveanueve ya existe — seed omitido.';
    return;
  end if;

  -- ── Salón (tenant) ──────────────────────────────────────────────────────
  insert into public.salons (name, slug, timezone)
    values ('De Nueve a Nueve', 'denueveanueve', 'Europe/Madrid')
    returning id into v_salon;

  -- ── Sedes ───────────────────────────────────────────────────────────────
  insert into public.locations (salon_id, name, slug)
    values (v_salon, 'Collado Villalba', 'collado-villalba')
    returning id into v_collado;

  insert into public.locations (salon_id, name, slug)
    values (v_salon, 'Alpedrete', 'alpedrete')
    returning id into v_alpedrete;

  -- ── Profesionales por sede ──────────────────────────────────────────────
  insert into public.professionals (salon_id, location_id, full_name) values
    (v_salon, v_collado, 'Fernando'),
    (v_salon, v_collado, 'Almudena'),
    (v_salon, v_collado, 'Johanna'),
    (v_salon, v_collado, 'Isabel'),
    (v_salon, v_collado, 'Tania'),
    (v_salon, v_collado, 'Macarena'),
    (v_salon, v_collado, 'Alí'),
    (v_salon, v_collado, 'María'),
    (v_salon, v_collado, 'María R.'),   -- 2ª María de Collado (calendarios distintos en el sistema de voz)
    (v_salon, v_collado, 'Marian'),
    (v_salon, v_alpedrete, 'Ana'),
    (v_salon, v_alpedrete, 'Cristina'),
    (v_salon, v_alpedrete, 'María A.');  -- María de Alpedrete

  -- ── Catálogo de servicios (con las 3 fases) ─────────────────────────────
  -- application_min = tiempo ocupado; exposure_min = profesional LIBRE; post = ocupado
  insert into public.services
    (salon_id, name, category, application_min, exposure_min, post_exposure_min, price_cents) values
    -- Corte
    (v_salon, 'Corte Señora',                'Corte',       45,  0,  0, 0),
    (v_salon, 'Corte Caballero',             'Corte',       30,  0,  0, 0),
    (v_salon, 'Corte flequillo',             'Corte',       10,  0,  0, 0),
    (v_salon, 'Corte niño/a (≤3 años)',      'Corte',       20,  0,  0, 0),
    -- Color
    (v_salon, 'Aplicación tinte raíz',       'Color',       30, 25,  5, 0),
    (v_salon, 'Baño de color orgánico',      'Color',       20, 35,  5, 0),
    (v_salon, 'Mechas completas',            'Color',       45, 35, 10, 0),
    (v_salon, 'Mechas tendencia',            'Color',       40, 40, 10, 0),
    (v_salon, 'Medias mechas',               'Color',       35, 35, 10, 0),
    (v_salon, 'Aplicación barros',           'Color',       40, 60, 10, 0),
    -- Tratamientos
    (v_salon, 'Lavado + Secado',             'Tratamiento', 20,  0,  0, 0),
    (v_salon, 'Tratamiento ligero intensivo','Tratamiento', 10,  5,  5, 0),
    (v_salon, 'Tratamiento premium',         'Tratamiento', 15, 10,  5, 0),
    (v_salon, 'Tratamiento slow repair',     'Tratamiento', 20, 20,  5, 0),
    (v_salon, 'Tratamiento détox cuero cabelludo','Tratamiento', 15, 10, 5, 0),
    (v_salon, 'Tratamiento détox mechas',    'Tratamiento', 15, 10,  5, 0),
    (v_salon, 'Tratamiento anticaída',       'Tratamiento', 10,  0,  5, 0),
    (v_salon, 'Tratamiento Keratina',        'Tratamiento', 40, 40, 10, 0),
    (v_salon, 'Tratamiento Antifrizz',       'Tratamiento', 60, 80, 20, 0),
    -- Alisados y permanentes
    (v_salon, 'Alisado',                     'Alisado',     60, 80, 20, 0),
    (v_salon, 'Desrizado frontal',           'Alisado',     20,  5,  5, 0),
    (v_salon, 'Permanente',                  'Alisado',     40, 40, 10, 0),
    -- Estilismo
    (v_salon, 'Peinado',                     'Estilismo',   30,  0,  0, 0),
    (v_salon, 'Difusor',                     'Estilismo',   15,  0,  0, 0),
    (v_salon, 'Quitar humedad',              'Estilismo',    5,  0,  0, 0);

  -- ── Horarios: Lun–Sáb 09:00–21:00 para todos ────────────────────────────
  -- (weekday 1=Lun … 6=Sáb; 0=Dom cerrado). Jose puede ajustar por profesional.
  insert into public.professional_schedules (salon_id, professional_id, weekday, start_time, end_time)
    select p.salon_id, p.id, wd, time '09:00', time '21:00'
    from public.professionals p
    cross join generate_series(1, 6) as wd
    where p.salon_id = v_salon;

  raise notice 'Salón De Nueve a Nueve dado de alta: 2 sedes, 13 profesionales, 25 servicios, horarios Lun-Sáb.';
end $$;
