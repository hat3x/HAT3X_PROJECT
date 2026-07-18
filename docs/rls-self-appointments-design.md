# salon-os — Decisión de diseño: acceso del cliente a SUS citas (RLS SELF)

> **Subtarea (sub-7).** Implementar de forma **mínima y segura** el acceso del cliente a
> SUS citas: una política RLS SELF acotada a `appointments` de SU customer (y SU salón),
> o una RPC de solo lectura. Nunca exponer citas de otros clientes ni de otros salones.
> **Documentar la decisión tomada** (este documento).
>
> **Entregable:** migración `supabase/migrations/20260719100000_rls_self_appointments.sql`
> + test de contrato `src/tests/integration/appointments-self-isolation.test.ts`.
>
> **Estado:** proyecto en desarrollo, sin datos de producción. Migración aditiva; no
> toca ni debilita ninguna política existente.

---

## 1. Decisión: política RLS SELF de SOLO LECTURA (no una RPC)

Se añade **una** política permisiva sobre `public.appointments`:

```sql
create policy "self_select_own_appointments"
  on public.appointments for select to authenticated
  using (customer_id in (select app.user_customer_ids()));
```

`app.user_customer_ids()` es el ancla SELF ya existente (parte C,
`20260717120000_rls_self_customer.sql`): `SECURITY DEFINER · STABLE · search_path='' ·
revoke anon/public · grant authenticated`, que devuelve las `customers.id` enlazadas a
la cuenta actual (`user_id = auth.uid()`). Es el **mismo** mecanismo que ya expone al
cliente su fidelización.

### Por qué RLS y no una RPC

| Criterio | Política RLS SELF (elegida) | RPC de listado `SECURITY DEFINER` |
|---|---|---|
| Superficie de código | **1 política** `for select` | función + validación de params + acotado manual |
| Aislamiento | **declarativo**, lo aplica el motor a cada fila | bypasa RLS ⇒ hay que **re-implementar** el acotado a mano |
| Consistencia | **copia exacta** del patrón de las 4 tablas de fidelización | divergencia del patrón asentado |
| Consumo desde la app | PostgREST-nativo: `from('appointments').select()` con filtros por fecha/estado/orden | inventar firma, paginación y orden en la RPC y versionarla |
| Riesgo | menor (menos que auditar) | mayor (una función con bypass de RLS que revisar) |

Conclusión: la política RLS es **estrictamente menos superficie y menos riesgo**, y
reutiliza infraestructura ya probada. La RPC solo se justificaría para **escritura**
(reservar/cancelar), que está fuera de alcance (ver §4).

---

## 2. Por qué basta con `customer_id` (aislamiento por salón garantizado)

El requisito dice "de SU customer **y** SU salón". El acotado por `customer_id` **ya
cubre ambos**, sin necesidad de un filtro extra por `salon_id`:

- `appointments.customer_id` es **NOT NULL** y su FK es **compuesta** (integridad
  multi-tenant de `20260712120000_tenant_integrity.sql`):

  ```sql
  appointments_customer_id_fkey (customer_id, salon_id)
    references public.customers (id, salon_id)
  ```

  ⇒ la cita y su ficha comparten **siempre** el mismo salón (lo garantiza la BD).

- `customers.id` es **PK global única** y cada id pertenece a **un solo salón**. Por
  tanto `customer_id in (mis fichas)` **jamás** casa una cita de otro cliente ni de otro
  salón: el `customer_id` lo determina todo.

- Añadir `and salon_id in (select app.user_salon_ids())` sería **incorrecto**: el
  cliente no es miembro de ningún salón, así que `user_salon_ids()` es vacío para él y
  anularía la política. El acotado del autoservicio es por **cuenta** (`customer_id`),
  no por pertenencia de staff.

- **Multi-salón:** una persona puede tener una ficha por salón (mismo `user_id`);
  `app.user_customer_ids()` devuelve **todas** sus fichas ⇒ ve sus citas en los N
  salones donde es cliente. Correcto por diseño.

---

## 3. Convivencia con las políticas de staff (nada se debilita)

Las políticas de miembros de `20260711100100_rls_policies.sql` quedan **intactas**:
`members_select_appointments` (SELECT por `user_salon_ids`), `members_insert_…`,
`members_update_…`, `managers_delete_…`. RLS combina las permisivas con **OR**: una fila
es visible si la satisface la de staff **o** la SELF. Para un cliente que no es staff de
ningún salón, la rama de staff es falsa y solo aplica la SELF ⇒ ve exclusivamente sus
citas.

**Solo se AÑADE `for select`.** El cliente no gana INSERT/UPDATE/DELETE (deny-by-default).

---

## 4. Fuera de alcance (documentado a propósito)

- **Escritura del cliente (reservar/cancelar desde la app):** cuando se aborde, irá por
  una **RPC `SECURITY DEFINER`** que valide pertenencia por
  `auth.uid()`/`user_customer_ids()` y las reglas de negocio (horarios, solape,
  antelación de cancelación), **nunca** abriendo una política SELF de escritura sobre
  `appointments`. Si se añadiera tal política, deberá seguir acotada por
  `app.user_customer_ids()` en `qual` **y** `with_check`, o el guardián (§5, check d)
  abortará (correcto).
- **Ocultar columnas al cliente en la lectura:** `SELECT` expone toda la fila, incluidas
  `notes` y `cancelled_reason` (posibles observaciones internas del staff). No es fuga
  cross-tenant (son citas de SU ficha). Si se quisiera ocultar (RLS no filtra columnas),
  hágase en la capa de app (seleccionar solo las columnas necesarias) o con vista/RPC.
  Mismo criterio que la nota de columnas de `rls_self_customer`.
- **`visits`** (histórico) no entra en esta subtarea, centrada en **citas**.

---

## 5. Guardián de aserción (defensa en profundidad)

La migración cierra con un bloque `do $guard$` —hermano de los de `rls_self_customer §4`
y `rls_self_guard`— que **aborta ruidosamente** si una migración futura rompe el
aislamiento de las citas. Verifica sobre el catálogo de `public.appointments`:

- **(0)** el ancla `app.user_customer_ids()` existe, sigue `SECURITY DEFINER` y **no**
  es ejecutable por `anon`.
- **(a)** RLS habilitada.
- **(b)** barrera de STAFF intacta (SELECT por `user_salon_ids`).
- **(c)** política SELF de SELECT acotada por `user_customer_ids`.
- **(d)** **sin escritura SELF**: 0 políticas que citen `user_customer_ids` con `cmd`
  distinto de `SELECT`.
- **(e)** ninguna política abierta a `anon`/`public`.

> `appointments` **no** está en el barrido genérico `_all_tables` de la parte D
> (customers + 4 fidelización), por eso trae su propio guardián inline. Si algún día se
> unifican, conservar los invariantes (a)–(e) para las citas.

---

## 6. Verificación

- **Contrato RLS a nivel de fuente** — `appointments-self-isolation.test.ts` (6 casos):
  política SELF presente y acotada por `user_customer_ids`; solo `to authenticated`;
  barrera de staff intacta; **ninguna** migración concede escritura SELF de citas;
  guardián veta escritura SELF y exposición a anon/public; FK compuesta
  `(customer_id, salon_id)` presente (fundamento del aislamiento por salón).
- **Garantía en deploy** — el guardián de la migración aborta el despliegue si el
  aislamiento se degrada.

---

## 7. Checklist de seguridad aplicada (OWASP / RLS)

- [x] **Broken Access Control (A01):** acceso acotado a la propia cuenta; cross-tenant
      y cross-customer imposibles por `customer_id` + FK compuesta.
- [x] **Least privilege:** solo `SELECT`; sin escritura; `to authenticated` (nunca
      anon/public); ancla `SECURITY DEFINER` revocada a anon.
- [x] **Deny-by-default:** RLS habilitada; el cliente no gana ninguna escritura nueva.
- [x] **Defense in depth:** política + guardián de catálogo + test de contrato en CI.
- [x] **Sin inyección:** política declarativa; sin SQL dinámico; sin parámetros de
      usuario en el predicado (el `auth.uid()` viene del JWT, no de un input).
- [x] **Aditiva:** ninguna política/función/trigger existente modificada ni debilitada.

---

*Fuentes: `20260711100000_initial_schema.sql`, `20260711100100_rls_policies.sql`,
`20260712120000_tenant_integrity.sql`, `20260717120000_rls_self_customer.sql`,
`20260717130000_rls_self_guard.sql`, `docs/convenciones-rls-rpc-audit.md`.*
