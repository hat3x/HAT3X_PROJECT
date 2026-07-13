# TPV — Runbook de despliegue a producción (sub-10)

Guía operativa para poner el módulo TPV en producción de forma **segura y
reversible**: migraciones Supabase **aditivas**, Edge Functions, capa web en
**Vercel**, **feature flag por salón** (rollout tipo canary) y **verificación
post-deploy** del aislamiento multi-tenant y de que **agenda / reservas /
ajustes no se ven afectados**.

> **Quién ejecuta:** el responsable de release de HAT3X (no un agente). Los pasos
> que despliegan a producción (`supabase db push`, `supabase functions deploy`,
> `vercel --prod`, `git push`) son acciones manuales controladas.

---

## 0. Naturaleza del cambio (por qué es seguro)

- **100% aditivo.** Todas las migraciones sólo hacen `CREATE` (y `ALTER … ADD
  COLUMN` **sobre tablas propias del TPV**, nunca sobre agenda/reservas/ajustes).
  Verificado: la única `ALTER TABLE … ADD COLUMN` está en `tpv_facturas`
  (0003), tabla creada por el propio TPV. Ver `db/README.md`.
- **Sin acoplar la agenda.** La integración con reservas (0005) sólo añade 2
  vistas `security_invoker` y 1 índice; **no** escribe en `reservas`.
- **Aislamiento por RLS** (0002/0003/0004/0006) en las 9 tablas `tpv_*`.
- **Arranque oculto.** Con el feature flag (0006, *default-deny*) ningún salón ve
  el TPV hasta que se activa explícitamente → el deploy no cambia nada para los
  usuarios hasta el rollout controlado.

---

## 1. Pre-requisitos

- [ ] CI en verde en la rama (ver `.github/workflows/tpv-ci.yml`): tests
      unitarios/integración/e2e (Deno) + migraciones + SQL (RLS, aditividad,
      integración, smoke) sobre Postgres 16.
- [ ] Acceso a los proyectos Supabase (`staging` y `prod`) y a Vercel.
- [ ] `supabase` CLI y `vercel` CLI autenticados.
- [ ] **Backup / snapshot** de la BD de producción tomado y verificado.
- [ ] Ventana de despliegue acordada (fuera de hora punta de los salones piloto).

### Variables de entorno

| Destino | Variable | Origen |
|---|---|---|
| Edge Functions | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Inyectadas por Supabase en runtime (sólo local para `functions serve`). |
| Web (Vercel) | `VITE_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Panel Vercel → Project → Settings → Environment Variables (Production). |
| Web (Vercel) | `VITE_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Íd. (clave **anónima**, nunca `service_role`). |

> Datos fiscales de facturación **no** son env vars: viven por salón en
> `tpv_config_facturacion` (ver `.env.example` y `README.md`).

---

## 2. Orden de las migraciones (aditivas)

Aplicar **en orden de timestamp**. Cada `.up.sql` va en una transacción propia.

| # | Migración | Aporta |
|---|---|---|
| 1 | `20260713000001_tpv_module`            | Tipos, 6 tablas base, índices, triggers, FKs. |
| 2 | `20260713000002_tpv_rls`               | `salon_miembros` + helpers + RLS de aislamiento. |
| 3 | `20260713000003_tpv_facturacion`       | `tpv_config_facturacion` + columnas snapshot en `tpv_facturas` + RLS. |
| 4 | `20260713000004_tpv_caja`              | `tpv_movimientos_caja` + RLS. |
| 5 | `20260713000005_tpv_reservas_integracion` | Índice "1 ticket vivo/reserva" + 2 vistas `security_invoker`. |
| 6 | `20260713000006_tpv_feature_flag`      | `tpv_salones_habilitados` + helper `tpv_salon_habilitado()` + RLS. |

```bash
# 2.a — STAGING primero (obligatorio). Copiar los .up.sql a supabase/migrations/
#       con su mismo timestamp y empujar:
supabase link --project-ref <STAGING_REF>
supabase db push

# 2.b — Verificar en staging (sección 5) antes de tocar producción.

# 2.c — PRODUCCIÓN (tras validar staging):
supabase link --project-ref <PROD_REF>
supabase db push        # aplica sólo las migraciones no aplicadas, en orden
```

> Alternativa con `psql` directo: aplicar los 6 `*.up.sql` en orden (ver
> `db/README.md`). Rollback: los `*.down.sql` en orden **inverso**.

---

## 3. Despliegue de las Edge Functions (Deno)

Reenvían el JWT del usuario (rol `authenticated`) → la RLS de aislamiento se
aplica de extremo a extremo. **Nunca** usan `service_role`.

```bash
for fn in \
  tpv-crear-ticket tpv-actualizar-lineas tpv-registrar-pago tpv-obtener-ticket \
  tpv-emitir-factura tpv-obtener-factura \
  tpv-crear-ticket-desde-reserva tpv-obtener-reserva-cobro \
  tpv-abrir-caja tpv-movimiento-caja tpv-cerrar-caja tpv-obtener-caja tpv-listar-cajas
do
  supabase functions deploy "$fn" --import-map tpv/functions/import_map.json
done
```

---

## 4. Despliegue de la capa web (Vercel)

La carpeta `tpv/web/` son **componentes de dominio** (React/TanStack Query) que
consume la app principal del cliente. Se despliegan como parte del build de esa
app; el TPV no es un proyecto Vercel independiente.

```bash
# Preview primero (rama), validación humana, y luego producción:
vercel                 # deploy de preview
# … validación en la URL de preview …
vercel --prod          # promoción a producción
```

- Gate de UI recomendado (sin redeploy para activar salones): antes de renderizar
  el punto de entrada del TPV, consultar el flag por salón. Ejemplo mínimo:

```ts
// ¿mostrar el TPV a este salón? (feature flag 0006)
const { data } = await supabase
  .from('tpv_salones_habilitados')
  .select('habilitado')
  .eq('salon_id', salonId)
  .maybeSingle();
const tpvVisible = data?.habilitado === true;   // sin fila ⇒ oculto
```

> Rollback web instantáneo: `vercel rollback` (promociona el deploy anterior).

---

## 5. Verificación POST-DEPLOY (obligatoria)

Ejecutar **en staging y, tras el deploy, en producción**. Orden:

```bash
# 5.1 Smoke de objetos + RLS + aditividad (read-only, seguro en prod):
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/post_deploy_smoke.sql
#   ⇒ 'RESULTADO GLOBAL: SMOKE POST-DEPLOY TPV OK'

# 5.2 Aislamiento multi-tenant cruzado (siembra + ROLLBACK, no deja rastro).
#     Ejecutar en STAGING (necesita superusuario/owner). En prod sólo 5.1 y 5.4.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/rls_tpv_isolation_test.sql
#   ⇒ 'RESULTADO GLOBAL: TODOS LOS TESTS DE AISLAMIENTO RLS PASARON'

# 5.3 Regresión de aditividad (agenda/reservas/ajustes intactas):
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/tpv_aditividad_regresion_test.sql

# 5.4 Comprobación funcional en prod: activar UN salón piloto (canary) y
#     cobrar un ticket de prueba de importe pequeño; verificar factura y arqueo.
```

### Checklist de aceptación (marcar antes de ampliar el rollout)

- [ ] `post_deploy_smoke.sql` → OK en producción.
- [ ] Aislamiento RLS → PASS en staging (ningún salón ve datos de otro).
- [ ] Aditividad → PASS: sin columnas/políticas `tpv_` en agenda/reservas/ajustes.
- [ ] **Agenda/reservas funcionan igual** que antes del deploy (crear/ver reserva,
      abrir la agenda) — verificación manual del flujo existente.
- [ ] **Ajustes** del salón cargan sin errores.
- [ ] Salón piloto: abrir caja → cobrar (efectivo/tarjeta/mixto) → emitir factura
      → arqueo/cierre, todo correcto.
- [ ] Un usuario del salón piloto **no** ve el TPV de otro salón.

---

## 6. Rollout por salón (canary → progresivo)

El feature flag (0006) permite activar salón por salón **sin redeploy**.

```sql
-- Activar el TPV en un salón:
INSERT INTO public.tpv_salones_habilitados (salon_id, notas)
VALUES ('<SALON_ID>', 'canary sub-10')
ON CONFLICT (salon_id) DO UPDATE SET habilitado = true, activado_at = now();

-- (opcional) sembrar métodos de pago por defecto del salón (ver db/README.md §Semilla).

-- Estado del rollout:
SELECT salon_id, habilitado, activado_at
  FROM public.tpv_salones_habilitados ORDER BY activado_at;
```

Plan sugerido: **1 salón piloto** (24-48 h en observación) → **grupo pequeño** →
**resto**. Entre cada ola, re-ejecutar 5.1 y confirmar métricas sin errores.

---

## 7. Rollback

| Alcance | Acción | Reversible |
|---|---|---|
| Apagar TPV en un salón | `UPDATE tpv_salones_habilitados SET habilitado=false WHERE salon_id=…` | Sí, inmediato, sin deploy. |
| Apagar TPV en todos | `UPDATE tpv_salones_habilitados SET habilitado=false` | Sí, inmediato. |
| Web con fallo | `vercel rollback` | Sí, instantáneo. |
| Edge Function con fallo | `supabase functions deploy <fn>` de la versión anterior | Sí. |
| Esquema (último recurso) | `*.down.sql` en orden **inverso** (0006→0001) | Sí; los datos TPV se pierden (tablas nuevas). No afecta a agenda/reservas. |

> **Primera palanca siempre el flag** (kill-switch por salón): no toca datos ni
> requiere deploy. El `down.sql` de esquema es el último recurso.

---

## 8. Firma de release

- [ ] Backup pre-deploy verificado.
- [ ] Migraciones aplicadas en orden (staging → prod).
- [ ] Edge Functions desplegadas (13).
- [ ] Web en producción (Vercel).
- [ ] Verificación §5 completa (smoke OK, aislamiento OK, aditividad OK).
- [ ] Rollout iniciado sólo en salón(es) piloto.
- [ ] `memoria/clientes.md` actualizado con la fecha de puesta en producción.

Responsable: ____________________   Fecha/hora: ____________________
