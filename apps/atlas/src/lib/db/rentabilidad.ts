// src/lib/db/rentabilidad.ts
//
// Trae lo que el margen necesita y lo convierte a céntimos. No decide nada:
// decide `calcularMargen`. No filtra por permisos: RLS deja fuera al
// colaborador en las cuatro tablas, y `leerAjustes` lanza si no ve la fila.
//
import type { Sb } from "./clientes";
import { listarFacturas } from "./facturas";
import { listarGastos } from "./gastos";
import { listarTramos } from "./fichajes";
import { nombresDeProyectos } from "./proyectos";
import { leerAjustes } from "./ajustes-economia";
import { cierreDe, type Cierre } from "./cierres";
import { limitesMesMadrid, mesVecino } from "@/lib/dinero";
import { minutosDe } from "@/lib/horas/tramos";
import { calcularMargen, type Rentabilidad, type FacturaMes, type GastoMes, type TramoMes, type FilaMargen } from "@/lib/rentabilidad/margen";

const cent = (n: number) => Math.round(n * 100);

export async function rentabilidadDelMes(
  sb: Sb,
  mes: string
): Promise<{ r: Rentabilidad; costeHoraCentimos: number; cerrado: Cierre | null }> {
  // Cortes del mes. Facturas y gastos son `date`: se cortan por día, con
  // `hastaDia` EXCLUSIVO (primer día del mes siguiente). Los tramos son
  // `timestamptz`: se cortan por instante en Madrid (`limitesMesMadrid`).
  // `resumen-dinero.ts` corta por día INCLUSIVO (último día del mes) y aquí
  // por día exclusivo, y no se unifican a propósito: aquel resume caja y solo
  // maneja `date`, así que el último día le basta; este combina `date` y
  // `timestamptz`, y el instante «primer día del mes siguiente a las 00:00»
  // es el único corte que significa lo mismo para los dos tipos.
  const desdeDia = `${mes}-01`;
  const hastaDia = `${mesVecino(mes, 1)}-01`;
  const rango = limitesMesMadrid(mes);

  const [ajustes, cerrado, facturas, gastos, tramos, proyectos] = await Promise.all([
    leerAjustes(sb),
    cierreDe(sb, mes),
    // `hasta` exclusivo en `listarFacturas`: el corte lo hace la base, no
    // el `limit(200)` — antes se traían las últimas 200 EN TOTAL y un mes
    // antiguo perdía facturas en silencio.
    listarFacturas(sb, { desde: desdeDia, hasta: hastaDia }),
    listarGastos(sb, { desde: desdeDia, hasta: hastaDia }),
    listarTramos(sb, rango),
    // `LineaFactura` solo trae `proyectoId` (no `proyectoNombre`): se resuelve
    // aquí una sola vez con un Map, en vez de tocar `facturas.ts` — el brief
    // pide no modificarlo, y una consulta por línea sería una N+1.
    nombresDeProyectos(sb),
  ]);
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.nombre]));

  // El rango ya lo puso la consulta; aquí solo queda el estado: un borrador
  // no se ha mandado a nadie y una anulada no es ingreso.
  const facturasMes: FacturaMes[] = facturas
    .filter((f) => f.estado === "emitida")
    .map((f) => ({
      clienteId: f.clienteId,
      clienteNombre: f.clienteNombre,
      baseCentimos: cent(f.base),
      lineas: f.lineas.map((l) => ({
        proyectoId: l.proyectoId,
        proyectoNombre: l.proyectoId ? (nombreProyecto.get(l.proyectoId) ?? null) : null,
        importeCentimos: cent(l.importe),
      })),
    }));

  // `listarGastos` con `hasta` INCLUSIVE (`lte`): trae también el día 1 del mes
  // siguiente, así que se recorta aquí con `<` para no contarlo dos veces.
  const gastosMes: GastoMes[] = gastos
    .filter((g) => g.fecha < hastaDia)
    .map((g) => ({ clienteId: g.clienteId, clienteNombre: g.clienteNombre, proyectoId: g.proyectoId, proyectoNombre: g.proyectoNombre, baseCentimos: cent(g.base) }));

  // Solo cerrados (§6.3). Un abierto está en curso y se contará al cerrarse.
  const tramosMes: TramoMes[] = tramos
    .filter((t) => t.fin !== null)
    .map((t) => ({ clienteId: t.clienteId, clienteNombre: t.clienteNombre, proyectoId: t.proyectoId, proyectoNombre: t.proyectoNombre, minutos: minutosDe(t, 0) }));

  const costeHoraCentimos = cerrado ? cerrado.costeHoraCentimos : ajustes.costeHoraCentimos;
  return { r: calcularMargen({ facturas: facturasMes, gastos: gastosMes, tramos: tramosMes, costeHoraCentimos }), costeHoraCentimos, cerrado };
}

/**
 * La fila de un cliente o de un proyecto en el mes, o ceros si no aparece —
 * la ficha del cliente/proyecto pide esto, no el mes entero: reutiliza
 * `rentabilidadDelMes` y busca por id, en vez de duplicar la consulta.
 */
export async function margenDe(
  sb: Sb,
  eje: { clienteId: string } | { proyectoId: string },
  mes: string
): Promise<FilaMargen & { costeHoraCentimos: number; cerrado: boolean }> {
  const { r, costeHoraCentimos, cerrado } = await rentabilidadDelMes(sb, mes);
  const filas = "clienteId" in eje ? r.porCliente : r.porProyecto;
  const id = "clienteId" in eje ? eje.clienteId : eje.proyectoId;
  // Sin factura, gasto ni tramo ese mes, el id no aparece en la lista: no es
  // un error, es que no hubo nada que contar, así que ceros y no una excepción.
  const f = filas.find((x) => x.id === id) ?? { id, nombre: "", facturadoCentimos: 0, gastosCentimos: 0, minutos: 0, horasCentimos: 0, margenCentimos: 0 };
  // `cerrado` aquí es solo si el mes está cerrado (booleano): la ficha no
  // necesita el objeto `Cierre` completo, solo saber si el coste está congelado.
  return { ...f, costeHoraCentimos, cerrado: cerrado !== null };
}
