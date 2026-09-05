# Auditoría RLS — TPV, facturación y productos (multi-tenant)

> Sub-tarea **sub-5** · Vertical webs-apps · Rol: Security Engineer
> Fecha: 2026-07-14 · Rama: `hat3x/HAT3X-016`
> Alcance: `products`, `pos_sales` (tpv_ventas), `pos_sale_lines` (tpv_lineas),
> `pos_payments` (tpv_pagos), `pos_payment_methods` (tpv_metodos_pago),
> `pos_sessions` (tpv_sesiones_caja), `pos_invoices` (tpv_facturas).

## Veredicto

**Cobertura completa. El aislamiento multi-tenant está garantizado.** Las siete
tablas tienen RLS activado (deny-by-default), aislamiento por `salon_id` a nivel
de política y de integridad referencial (FKs compuestas), y `pos_invoices` añade
inmutabilidad a nivel de motor. **Una venta o factura de un salón no es visible ni
modificable desde otro salón.** No hay flujo anónimo sobre estas tablas.

Las políticas ya se crearon **en línea** en las migraciones de origen
(`fiscal_base`, `pos_base`, `verifactu_invoices`) al estilo de `rls_policies`
(migración 2/3). Esta sub-tarea añade una migración **guardián** que reafirma la
RLS y **aborta** si una migración futura degradase el aislamiento
(`20260714110000_rls_multitenant_guard.sql`).

## Modelo de aislamiento

El tenant es el **salón**. La pertenencia se resuelve vía `public.salon_members`
a través de dos funciones helper `SECURITY DEFINER` / `STABLE` en el esquema `app`
(evitan recursión RLS sobre `salon_members` y se evalúan una vez por consulta):

| Función | Uso en políticas |
|---|---|
| `app.user_salon_ids()` | operativa: `salon_id in (select app.user_salon_ids())` |
| `app.has_salon_role(salon_id, roles[])` | config/borrado: `has_salon_role(salon_id, array['owner','manager'])` |

Ambas revocan `execute` a `anon`/`public` y solo lo conceden a `authenticated`.

### Dos capas de aislamiento por `salon_id`

1. **RLS** — cada política filtra/valida por `salon_id` (fila del propio tenant).
2. **FKs compuestas `(fk_id, salon_id) → tabla(id, salon_id)`** — la base de datos
   impide que una fila referencie entidades de otro tenant aunque se conozcan UUIDs
   ajenos. Un `pos_sale_lines` con `salon_id = A` **no puede** apuntar a un
   `sale_id` del salón B: no existe fila `pos_sales(id=B, salon_id=A)`. La RLS por
   sí sola no cubre esto; las FKs compuestas sí. Aplica a todas las FKs del módulo
   (`session_id`, `appointment_id`, `customer_id`, `professional_id`, `sale_id`,
   `payment_method_id`).

## Matriz de políticas verificada

| Tabla | RLS | SELECT | INSERT | UPDATE | DELETE | Migración |
|---|---|---|---|---|---|---|
| `products` | ✅ | miembro | owner/manager | owner/manager | owner/manager | `..170000_fiscal_base` |
| `pos_payment_methods` | ✅ | miembro | owner/manager | owner/manager | owner/manager | `..180000_pos_base` |
| `pos_sessions` | ✅ | miembro | miembro | miembro | owner/manager | `..180000_pos_base` |
| `pos_sales` | ✅ | miembro | miembro | miembro | owner/manager | `..180000_pos_base` |
| `pos_sale_lines` | ✅ | miembro | miembro | miembro | miembro | `..180000_pos_base` |
| `pos_payments` | ✅ | miembro | miembro | —¹ | owner/manager | `..180000_pos_base` |
| `pos_invoices` | ✅ | miembro | miembro | **—²** | **—²** | `..100000_verifactu_invoices` |

- «miembro» = `salon_id in (select app.user_salon_ids())` en `USING`/`WITH CHECK`.
- «owner/manager» = `app.has_salon_role(salon_id, array['owner','manager'])`.

### Notas de diseño (no son huecos de cobertura)

1. **`pos_payments`** — registro casi inmutable (como `visits`): INSERT/DELETE, sin
   UPDATE. Corregir un pago = borrarlo (owner/manager) y reinsertarlo. Con
   deny-by-default, la ausencia de política UPDATE bloquea cualquier UPDATE.
2. **`pos_invoices`** — inmutabilidad fiscal **absoluta** (Veri*factu, RD 1007/2023).
   No hay política de UPDATE ni DELETE, y el trigger `trg_pos_invoices_immutable`
   (`BEFORE UPDATE OR DELETE`, `SECURITY DEFINER`) aborta la mutación **a nivel de
   motor** — bloquea incluso a `service_role` y a funciones elevadas, que la RLS no
   detiene. Ni siquiera `owner` puede borrar. Corolario: el `ON DELETE CASCADE` de un
   salón con facturas queda bloqueado (retención legal); el proyecto usa soft-delete
   de salones (`update salons set active = false`), que es el comportamiento deseado.

### Reparto operativo vs. configuración

- **Operativa del cajero** (cualquier `member`, incl. `staff`): abrir/cerrar caja,
  crear y editar el ticket y sus líneas, cobrar (INSERT de pagos), emitir factura.
  Esto es intencionado: el TPV lo maneja el personal de mostrador.
- **Configuración y borrados sensibles** (`owner`/`manager`): catálogo de productos,
  catálogo de métodos de pago, y los DELETE de sesión/venta/pago. Alinea con el
  patrón `services`/`professionals` del panel.

## Análisis adversarial (resumen de los vectores probados)

| Vector de ataque | Resultado | Barrera |
|---|---|---|
| Leer venta/factura de otro salón (`SELECT`) | **Bloqueado** | `salon_id` ajeno no está en `user_salon_ids()` |
| Modificar/anular venta de otro salón | **Bloqueado** | `USING`/`WITH CHECK` por pertenencia |
| Modificar/borrar factura (cualquiera) | **Bloqueado** | sin policy + trigger de inmutabilidad |
| Insertar línea/pago en mi salón apuntando a venta ajena | **Bloqueado** | FK compuesta `(sale_id, salon_id)` |
| Encadenar factura (`previous_hash`) con la de otro salón | **Bloqueado** | FK `(salon_id, previous_hash)→(salon_id, current_hash)` |
| Acceso sin autenticar (`anon`) | **Bloqueado** | ninguna policy `to anon`; deny-by-default |
| Bypass por `FORCE`/propietario de tabla | No aplica | `authenticated` no es owner; no se usa `FORCE` (rompería los triggers de autoprovisión `SECURITY DEFINER`) |

## No se rompe agenda/reservas/ajustes/login

- El panel (dashboard) usa el cliente **autenticado** de servidor → RLS aplica →
  aislamiento por salón garantizado.
- La reserva pública y el cron usan **`createAdminClient()`** (service role) → RLS
  no aplica → estas políticas no pueden romper el flujo de reservas. La reserva
  pública, además, **no toca el módulo TPV**.
- El guardián `20260714110000` solo reafirma `enable row level security`
  (idempotente) y lee catálogos (`pg_class`, `pg_policies`): no altera datos ni
  políticas de agenda/reservas/ajustes/login.

## Recomendación operativa

Al construir las server actions del TPV y facturación, **usar el cliente autenticado
de servidor** (`src/lib/supabase/server.ts`), nunca el admin, para que estas
políticas surtan efecto. Reservar `createAdminClient()` para la reserva pública/cron.
La emisión de factura debe asignar el siguiente `sequential_number` por
`(salon_id, series)` de forma atómica (la unicidad la garantiza
`pos_invoices_series_number_key`; la app evita huecos).
