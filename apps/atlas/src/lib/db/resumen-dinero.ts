import type { Sb } from "./clientes";

export type ResumenMes = {
  /** Céntimos enteros. Solo facturas en estado emitida: ni borradores ni anuladas. */
  facturado: number;
  /** Céntimos enteros. */
  cobrado: number;
  /** Céntimos enteros. */
  pendiente: number;
  /** Céntimos enteros. Imputado a un cliente o proyecto concreto. */
  gastoDirecto: number;
  /** Céntimos enteros. Sin imputar. NO se reparte entre clientes (spec §6.3). */
  gastoEstructura: number;
};

/** Primer y último día del mes al que pertenece `mes`. */
function limites(mes: string): { desde: string; hasta: string } {
  const d = new Date(`${mes.slice(0, 7)}-01T00:00:00Z`);
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { desde: d.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) };
}

/**
 * Resume el mes en céntimos enteros, sin volver a euros.
 *
 * El brief original dividía entre 100 aquí y la pantalla multiplicaba otra
 * vez con `aCentimos()` para volver a mostrar. Ese viaje de ida y vuelta es
 * justo lo que `src/lib/dinero.ts` existe para evitar: esta función SUMA, que
 * es donde el error de coma flotante se acumula, así que el entero se queda
 * entero hasta que algo lo formatea para pantalla.
 */
export async function resumenDelMes(sb: Sb, mes: string): Promise<ResumenMes> {
  const { desde, hasta } = limites(mes);

  const { data: facturas, error: eF } = await sb
    .from("facturas")
    .select("total, cobrada_en")
    .gte("fecha_emision", desde)
    .lte("fecha_emision", hasta)
    // Exige 'emitida' y no solo excluye 'anulada': un borrador es algo que
    // todavia no se ha mandado a nadie, y contarlo como facturado convertiria
    // una intencion en un ingreso. Hoy es inalcanzable porque
    // registrarFacturaExterna fuerza 'emitida', pero el plan 2E dejara
    // facturas en borrador hasta asignarles numero.
    .eq("estado", "emitida");
  if (eF) throw eF;

  const { data: gastos, error: eG } = await sb
    .from("gastos")
    .select("total, cliente_id, proyecto_id")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (eG) throw eG;

  // `total` llega como `numeric(12,2)` de Postgres, es decir texto o número
  // con hasta dos decimales: se escala a céntimos aquí mismo, una sola vez, y
  // ya no se vuelve a tocar como float.
  const cent = (n: number) => Math.round(n * 100);
  let facturado = 0;
  let cobrado = 0;
  for (const f of facturas ?? []) {
    const t = cent(Number(f.total));
    facturado += t;
    if (f.cobrada_en !== null) cobrado += t;
  }

  let directo = 0;
  let estructura = 0;
  for (const g of gastos ?? []) {
    const t = cent(Number(g.total));
    if (g.cliente_id !== null || g.proyecto_id !== null) directo += t;
    else estructura += t;
  }

  return {
    facturado,
    cobrado,
    pendiente: facturado - cobrado,
    gastoDirecto: directo,
    gastoEstructura: estructura,
  };
}
