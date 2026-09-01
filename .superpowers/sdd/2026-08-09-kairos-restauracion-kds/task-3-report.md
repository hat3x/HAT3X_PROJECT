# Task 3 — Report: Queries + hooks del KDS (con Realtime)

## STATUS: DONE

**Commit:** `d037b8c` — `feat(restauracion): queries y hooks del KDS (lectura + Realtime)`
(rama `hat3x/HAT3X-038`, repo anidado `clients/projects/salon-os`)

## Ficheros creados (3, exactamente los del brief)

- `clients/projects/salon-os/src/lib/queries/kds.ts` — `kdsKeys` + `fetchKdsItems`
- `clients/projects/salon-os/src/hooks/use-kds.ts` — `useKdsItems` + `useKdsRealtime`
- `clients/projects/salon-os/src/tests/unit/kds-keys.test.ts` — test de `kdsKeys`

## TDD seguido

1. **Test primero** (`kds-keys.test.ts`, contenido exacto del brief). Ejecutado
   `npm test -- kds-keys` → **FAIL** esperado: `Failed to resolve import
   "@/lib/queries/kds"` (módulo no existe).
2. Creado `src/lib/queries/kds.ts`.
3. Creado `src/hooks/use-kds.ts`.
4. `npm test -- kds-keys` → **PASS** (1/1).
5. `npm run typecheck` → **exit 0**, sin salida (proyecto entero, `tsc --noEmit`).
6. Batería completa (`npm test`, sin filtro) → **145 test files, 1870 tests, todos PASS**
   (sin regresiones).
7. Commit con los 3 ficheros exactos (`git add <paths>` explícitos, **sin** `git add -A`).
   `.claude/` quedó untracked, tal y como exige la restricción.

## Cómo resolví el tipado de los joins embebidos

El brief avisaba de que los joins embebidos de supabase-js pueden dar problemas de
tipado y sugería declarar un tipo de fila auxiliar explícito o `as`. Antes de escribir
código miré cómo resuelve esto el propio repo (`src/lib/queries/insurers.ts`,
`fetchCustomerInsurances` / `fetchInsurerTariff`): usan `.select("*, insurer:insurer(name)")`
seguido de `.returns<TipoConJoin[]>()`, con un tipo explícito `Entidad & { insurer: {
name: string } | null }`. Ese es el patrón ya establecido en el repo, así que lo repliqué
en vez de usar el doble-cast `as unknown as` sugerido literalmente en el brief (que
también habría funcionado pero es menos idiomático aquí).

Concretamente:

1. Leí la definición real de la tabla `order_items` (y de `orders`, `products`,
   `stations`) en `src/types/database.ts` (generado desde Supabase) para no inventar
   tipos. Detalles relevantes que encontré y que **difieren ligeramente** del código de
   ejemplo del brief:
   - `status` en `order_items.Row` es `OrderItemStatus` (`"pendiente" | "enviado" |
     "preparando" | "listo" | "entregado" | "anulado"`), no `string` plano. Por eso
     tipé `ACTIVE_STATUSES: OrderItemStatus[] = ["enviado", "preparando", "listo"]` y
     lo pasé directo a `.in("status", ACTIVE_STATUSES)`, **sin** el cast
     `as unknown as string[]` que sugería el brief — con el tipo correcto no hace falta
     y evita perder la comprobación de que los tres literales existen en el enum.
   - `orders.order_number` es `number | null` (no `number` a secas: es un `bigint` con
     trigger de BD). El mapeo `row.orders?.order_number ?? 0` del brief sigue siendo
     válido tal cual (colapsa `null`/`undefined` a `0`), así que no hizo falta tocarlo.
   - `modifiers_snapshot` es de tipo `Json` (union recursivo de Supabase). Lo declaré
     así en el row type y mantuve el `Array.isArray(...)` + cast puntual
     `as Array<{ name?: string }>` del brief solo para ese campo (es el único punto
     donde un `as` está justificado: `Json` no tiene forma estructural conocida).

2. Declaré una interfaz `KdsItemRow` que solo lista las columnas **realmente pedidas**
   en el `.select()` (no extendí `OrderItem` completo, que tiene columnas no
   seleccionadas como `salon_id`, `unit_price_cents`, etc. — eso habría sido un tipo
   engañoso). Los tres joins se tipan como objeto singular-o-null porque las FKs son
   *many-to-one* (`order_items.order_id → orders.id`, etc.), consistente con cómo
   Supabase devuelve joins embebidos por FK simple.

3. Encadené `.returns<KdsItemRow[]>()` al final de la query (mismo punto donde
   `insurers.ts` lo hace) y mapeé cada fila a `KdsItem` exactamente como describía el
   brief (mismos nombres de campo, mismos fallbacks `?? null` / `?? "Producto"` / `?? 0`).

Resultado: `npm run typecheck` a 0 sin ningún `any` explícito ni implícito en el fichero
nuevo (solo dos `as` puntuales, ambos justificados: el cast de `Json` a
`Array<{name?:string}>` tras `Array.isArray`, y ninguno más).

## Cómo copié el hook Realtime

Leí `src/hooks/use-day-panel-realtime.ts` completo antes de escribir `useKdsRealtime` y
lo repliqué literalmente, campo a campo, cambiando únicamente:

| | `useDayPanelRealtime` (origen) | `useKdsRealtime` (nuevo) |
|---|---|---|
| Nombre de canal | `day-panel-appointments-${salonId}` | `kds-order-items-${salonId}` |
| `table` en el filtro | `"appointments"` | `"order_items"` |
| Invalidación | `appointmentKeys.all(salonId)` | `kdsKeys.all(salonId)` |

Todo lo demás es idéntico: `useRef` para blindar StrictMode (evita suscribir dos
canales en doble-invoke de efectos en dev), `useState<RealtimeStatus>("connecting")`,
suscripción `postgres_changes` con `event: "*"`, `schema: "public"`, `filter:
"salon_id=eq.${salonId}"`, callback `.subscribe((s) => ...)` que mapea `"SUBSCRIBED"` →
`"connected"` y `"CHANNEL_ERROR" | "TIMED_OUT"` → `"error"`, y cleanup con
`void supabase.removeChannel(channel)` + reset de la ref. También reutilicé el mismo
patrón de tipo para la ref del canal:
`useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null)`.

`useKdsItems` es un wrapper directo de `useQuery` (sintaxis de objeto, como el resto del
repo en `use-insurers.ts`): `queryKey: kdsKeys.items(salonId)`, `queryFn: () =>
fetchKdsItems(salonId)` — sin opciones extra (`enabled`, `staleTime`, etc.) porque el
brief no las pedía y no hay un caso claro de deshabilitar la query con `salonId` (a
diferencia de, p. ej., `customerId`/`insurerId` opcionales en otros hooks).

## Preocupaciones / notas para la siguiente task

- No integré `useKdsItems`/`useKdsRealtime` en ninguna vista: esta task era solo la capa
  de datos. La UI del KDS (probablemente la siguiente task del plan) deberá combinar
  `useKdsItems` + `useKdsRealtime` + `groupKdsItemsByOrder`/`elapsedMinutes` de
  `src/lib/restauracion/kds.ts` (Task 2).
- `orderNumber: row.orders?.order_number ?? 0` — si algún día `order_number` puede ser
  legítimamente `0` (no debería, es un correlativo `bigint` empezando en 1 vía trigger),
  ese fallback quedaría ambiguo con un pedido real. No es un problema real ahora mismo,
  solo lo dejo anotado porque viene tal cual del brief.
- No pude ejecutar `next lint` sobre los ficheros nuevos: el proyecto no tiene ESLint
  configurado todavía (`npx next lint` lanzó el asistente interactivo de primera
  configuración). No estaba en los requisitos del brief (solo test + typecheck), así
  que no lo bloqueé, pero lo señalo por si el repo espera lint verde en CI.
