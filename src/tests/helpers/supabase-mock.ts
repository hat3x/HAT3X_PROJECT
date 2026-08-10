/**
 * Doble configurable de Supabase para tests de integración de Server Actions.
 *
 * Extraído de `tests/integration/tenant-isolation.test.ts` (Task 6 del plan de
 * restauración) para poder reutilizarlo en `restauracion-carta-actions.test.ts`
 * sin duplicar el builder. Comportamiento sin cambios respecto al original.
 *
 * `tables` fija el resultado de las lecturas por tabla; `onWrite` fabrica el
 * resultado de insert/update/delete. Cada `.from()` crea un builder propio con
 * su estado de escritura, de modo que una misma tabla puede leerse y escribirse
 * en el mismo flujo sin interferencias.
 */
export interface TableResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

export interface MockConfig {
  tables?: Record<string, TableResult>;
  onWrite?: (
    op: "insert" | "update" | "delete",
    table: string,
    payload: unknown,
  ) => TableResult;
  /**
   * Usuario de `supabase.auth.getUser()` (Task 6, `settleOrder`: necesita
   * `user.id` para `pos_sales.sold_by`, igual que `createSale`). Por defecto
   * resuelve a un usuario fijo — los tests que no ejercitan ninguna ruta con
   * `auth.getUser()` pueden ignorar esta opción sin más.
   */
  auth?: { user: { id: string } | null; error?: { message: string } | null };
}

export function makeSupabaseMock(config: MockConfig) {
  function builder(table: string) {
    let pending: { op: "insert" | "update" | "delete"; payload: unknown } | null =
      null;

    function readResult(): { data: unknown; error: unknown } {
      const t = config.tables?.[table] ?? { data: [], error: null };
      return { data: t.data ?? [], error: t.error ?? null };
    }

    function resolveList(): { data: unknown; error: unknown } {
      if (pending) {
        const r = config.onWrite?.(pending.op, table, pending.payload) ?? {};
        return { data: r.data ?? null, error: r.error ?? null };
      }
      return readResult();
    }

    function resolveSingle(): { data: unknown; error: unknown } {
      const { data, error } = resolveList();
      return {
        data: Array.isArray(data) ? (data[0] ?? null) : data,
        error,
      };
    }

    const b = {
      select: () => b,
      eq: () => b,
      in: () => b,
      // `is`/`neq` (Task 6, `settleOrder`: filtra `order_items` no anulados vía
      // `.is("void_of_item_id", null).neq("status","anulado")`) son, como el
      // resto de filtros de este doble, no-ops encadenables: el mock no filtra
      // de verdad — `tables[table].data` ya llega preparado por el test —, solo
      // necesitan EXISTIR para que la cadena de filtros no reviente.
      is: () => b,
      neq: () => b,
      order: () => b,
      limit: () => b,
      insert: (payload: unknown) => {
        pending = { op: "insert", payload };
        return b;
      },
      update: (payload: unknown) => {
        pending = { op: "update", payload };
        return b;
      },
      delete: () => {
        pending = { op: "delete", payload: null };
        return b;
      },
      maybeSingle: () => Promise.resolve(resolveSingle()),
      single: () => Promise.resolve(resolveSingle()),
      then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
        onFulfilled(resolveList()),
    };
    return b;
  }

  return {
    from: (table: string) => builder(table),
    // `auth.getUser()` (Task 6, `settleOrder`): ver `MockConfig.auth` arriba.
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: config.auth?.user ?? { id: "mock-user" } },
          error: config.auth?.error ?? null,
        }),
    },
  };
}
