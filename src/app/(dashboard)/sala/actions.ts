"use server";
import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { canTransition, clampPosition } from "@/lib/restauracion/tables";
import { canManageSettings, getActiveMembership, getActiveSalonId } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";
import {
  openTableSchema,
  saveTablePositionSchema,
  setTableStatusSchema,
  tableSchema,
  zoneSchema,
  type OpenTableInput,
  type SaveTablePositionInput,
  type SetTableStatusInput,
  type TableInput,
  type ZoneInput,
} from "@/lib/validations/table";
import type { DiningTable, DiningZone, Order } from "@/types/database";

/**
 * Server actions de sala (restauración, Task 5): apertura/estado/posición de
 * mesa y CRUD de zonas/mesas del plano.
 *
 * Dos niveles de gate, igual criterio que `carta/actions.ts` (gestión) vs
 * `mostrador/actions.ts` (operativa): `openTable`/`setTableStatus` son
 * OPERATIVAS (cualquier miembro del salón — tomar/soltar una mesa es trabajo
 * de sala del día a día, no configuración); `saveTablePosition` y el CRUD de
 * zonas/mesas son GESTIÓN (editar el layout o el catálogo de mesas exige
 * owner/manager, vía {@link assertManager}).
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Resuelve el salón activo SI el usuario tiene rol de gestión (owner/manager).
 * Devuelve `null` cuando no hay permiso (rol insuficiente) o no hay salón
 * asignado; en ambos casos la action responde con el mismo mensaje de
 * "sin permiso" — no se distingue el motivo al cliente. Idéntico a
 * `carta/actions.ts#assertManager`.
 */
async function assertManager(): Promise<string | null> {
  const membership = await getActiveMembership();
  if (!canManageSettings(membership?.role)) return null;
  return getActiveSalonId();
}

function firstIssue(error: import("zod").ZodError): string {
  return error.issues[0]?.message ?? "Datos inválidos";
}

const NO_PERMISSION = "No tienes permiso para gestionar la sala";
const NO_SALON = "No tienes un salón asignado";

// ─────────────────────────────────────────────────────────────────────────────
// openTable: abre una mesa libre y crea su cuenta (orders, channel='mesa').
//
// Orden EXACTO por seguridad de concurrencia (dos camareros tocando la misma
// mesa a la vez): (1) UPDATE CONDICIONADO `status='ocupada' WHERE ...
// status='libre'` — si otro ya la abrió, el UPDATE afecta 0 filas y esa ES la
// señal de conflicto, sin necesidad de un SELECT previo (misma técnica que
// `setOrderItemStatus`/`setTableStatus`). Solo si afecta 1 fila se sigue.
// (2) INSERT de `orders` con el `id` generado EN EL SERVIDOR (a diferencia de
// `createOrder`/mostrador, que lo acepta del cliente para offline-first: abrir
// mesa es una acción síncrona de sala, no necesita idempotencia offline) y
// `label` = nombre de la mesa (tomado del propio `.select()` del paso 1, sin
// una consulta aparte). (3) Si el INSERT falla, se COMPENSA revirtiendo la
// mesa a `libre` (rollback manual — igual patrón que `settleOrder`/
// `mostrador/actions.ts`: sin transacción multi-sentencia desde el cliente de
// Supabase, un fallo a mitad de flujo se deshace a mano) y se propaga el
// error; la mesa NO debe quedar `ocupada` sin una cuenta asociada.
// ─────────────────────────────────────────────────────────────────────────────

export async function openTable(input: OpenTableInput): Promise<ActionResult<Order>> {
  const parsed = openTableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: NO_SALON };
  const supabase = createClient();

  const { data, error } = await supabase
    .from("dining_tables")
    .update({ status: "ocupada" })
    .eq("id", parsed.data.tableId)
    .eq("salon_id", salonId)
    .eq("status", "libre")
    .select("*");
  if (error !== null) return { ok: false, error: error.message };
  const [table] = (data ?? []) as DiningTable[];
  if (table === undefined) return { ok: false, error: "La mesa no está libre" };

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      id: randomUUID(),
      salon_id: salonId,
      channel: "mesa",
      dining_table_id: parsed.data.tableId,
      covers: parsed.data.covers,
      label: table.name,
      status: "abierta",
    })
    .select("*")
    .single();
  if (orderError !== null) {
    // Compensación: la mesa no debe quedar `ocupada` sin cuenta. Se ignora el
    // resultado de esta segunda escritura (best-effort, igual que el
    // `rollback()` de `settleOrder`) — propagar el error ORIGINAL del insert
    // es más útil al llamador que uno secundario de la reversión.
    await supabase
      .from("dining_tables")
      .update({ status: "libre" })
      .eq("id", parsed.data.tableId)
      .eq("salon_id", salonId);
    return { ok: false, error: orderError.message };
  }
  revalidatePath("/sala");
  return { ok: true, data: order };
}

// ─────────────────────────────────────────────────────────────────────────────
// setTableStatus: transición de estado de UNA mesa (p.ej. `ocupada` →
// `cuenta_pedida` → `por_limpiar` → `libre`), operativa (cualquier miembro).
//
// `canTransition` (lib/restauracion/tables.ts, Task 3) se comprueba ANTES de
// tocar la base — un salto no permitido (p.ej. `libre` → `por_limpiar`) ni
// siquiera intenta el UPDATE. Igual que `openTable`, el UPDATE va CONDICIONADO
// por `status = from`: si otra pantalla ya movió la mesa, afecta 0 filas ⇒
// CONFLICTO (misma técnica que `setOrderItemStatus`, mostrador/actions.ts).
// ─────────────────────────────────────────────────────────────────────────────

export async function setTableStatus(input: SetTableStatusInput): Promise<ActionResult<DiningTable>> {
  const parsed = setTableStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  if (!canTransition(parsed.data.from, parsed.data.to)) {
    return { ok: false, error: "Transición no válida" };
  }
  const salonId = await getActiveSalonId();
  if (salonId === null) return { ok: false, error: NO_SALON };
  const supabase = createClient();

  const { data, error } = await supabase
    .from("dining_tables")
    .update({ status: parsed.data.to })
    .eq("id", parsed.data.tableId)
    .eq("salon_id", salonId)
    .eq("status", parsed.data.from)
    .select("*");
  if (error !== null) return { ok: false, error: error.message };
  const [updated] = (data ?? []) as DiningTable[];
  if (updated === undefined) return { ok: false, error: "CONFLICTO: el estado de la mesa ya cambió" };
  revalidatePath("/sala");
  return { ok: true, data: updated };
}

// ─────────────────────────────────────────────────────────────────────────────
// saveTablePosition: gestión (editar el layout del plano exige owner/manager).
// `clampPosition` (lib/restauracion/tables.ts) acota a [0,100] en servidor —
// no basta con que el editor visual del plano ya limite el arrastre en
// cliente, un payload manual fuera de rango no debe poder desplazar la mesa
// fuera del plano.
// ─────────────────────────────────────────────────────────────────────────────

export async function saveTablePosition(
  input: SaveTablePositionInput,
): Promise<ActionResult<DiningTable>> {
  const parsed = saveTablePositionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("dining_tables")
    .update({ pos_x: clampPosition(parsed.data.posX), pos_y: clampPosition(parsed.data.posY) })
    .eq("id", parsed.data.tableId)
    .eq("salon_id", salonId)
    .select("*")
    .single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/sala");
  return { ok: true, data };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zonas del plano de sala — gestión, mismo patrón EXACTO que
// `carta/actions.ts#createCategory/updateCategory/deleteCategory` (misma
// forma `{salon_id, name, sort_order}`).
// ─────────────────────────────────────────────────────────────────────────────

export async function createZone(input: ZoneInput): Promise<ActionResult<DiningZone>> {
  const parsed = zoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("dining_zones")
    .insert({ salon_id: salonId, name: parsed.data.name, sort_order: parsed.data.sortOrder })
    .select("*")
    .single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/sala");
  return { ok: true, data };
}

export async function updateZone(id: string, input: ZoneInput): Promise<ActionResult<DiningZone>> {
  const parsed = zoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("dining_zones")
    .update({ name: parsed.data.name, sort_order: parsed.data.sortOrder })
    .eq("id", id)
    .eq("salon_id", salonId)
    .select("*")
    .single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/sala");
  return { ok: true, data };
}

export async function deleteZone(id: string): Promise<ActionResult<null>> {
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { error } = await supabase.from("dining_zones").delete().eq("id", id).eq("salon_id", salonId);
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/sala");
  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mesas del plano de sala — gestión, mismo patrón que las zonas de arriba.
// El FK compuesto `dining_tables_zone_fkey` (zone_id, salon_id) ya garantiza
// en la base que no se puede crear/editar una mesa apuntando a una zona de
// otro salón — no hace falta una guarda de pertenencia aparte (paridad con el
// razonamiento de `carta/actions.ts` sobre sus propios FKs compuestos).
// ─────────────────────────────────────────────────────────────────────────────

export async function createTable(input: TableInput): Promise<ActionResult<DiningTable>> {
  const parsed = tableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("dining_tables")
    .insert({
      salon_id: salonId,
      zone_id: parsed.data.zoneId,
      name: parsed.data.name,
      capacity_min: parsed.data.capacityMin,
      capacity_max: parsed.data.capacityMax,
      shape: parsed.data.shape,
      sort_order: parsed.data.sortOrder,
    })
    .select("*")
    .single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/sala");
  return { ok: true, data };
}

export async function updateTable(id: string, input: TableInput): Promise<ActionResult<DiningTable>> {
  const parsed = tableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("dining_tables")
    .update({
      zone_id: parsed.data.zoneId,
      name: parsed.data.name,
      capacity_min: parsed.data.capacityMin,
      capacity_max: parsed.data.capacityMax,
      shape: parsed.data.shape,
      sort_order: parsed.data.sortOrder,
    })
    .eq("id", id)
    .eq("salon_id", salonId)
    .select("*")
    .single();
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/sala");
  return { ok: true, data };
}

export async function deleteTable(id: string): Promise<ActionResult<null>> {
  const salonId = await assertManager();
  if (salonId === null) return { ok: false, error: NO_PERMISSION };

  const supabase = createClient();
  const { error } = await supabase.from("dining_tables").delete().eq("id", id).eq("salon_id", salonId);
  if (error !== null) return { ok: false, error: error.message };
  revalidatePath("/sala");
  return { ok: true, data: null };
}
