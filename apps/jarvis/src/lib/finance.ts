//
// JUBILADO. El dinero de HAT3X vive en Atlas desde el bloque 2A.
//
// Este módulo escribía en `hat3x_transactions`, que era una de las cuatro
// verdades sobre el dinero. Sus datos se volcaron con
// `apps/atlas/scripts/migrar/transacciones.ts`.
//
// No se borra el fichero para que quien lo importe reciba un error que explica
// dónde mirar, en vez de un «módulo no encontrado» que no explica nada.
//
// Lo que NO jubila este bloque: `company-brain.ts` sigue escribiendo en otras
// tres tablas propias (`hat3x_recurring_expenses`, `hat3x_project_costs`,
// `hat3x_project_revenue`), que duplican `gastos_recurrentes`, `gastos` y
// `facturas` de Atlas respectivamente. Migrarlas es un plan aparte.
//
const AVISO =
  "finance.ts está jubilado: el dinero vive en Atlas (bloque 2A). " +
  "Usa /dinero, o apps/atlas/src/lib/db/acciones-gastos.ts.";

export function recordTransaction(): never {
  throw new Error(AVISO);
}

export function queryFinances(): never {
  throw new Error(AVISO);
}
