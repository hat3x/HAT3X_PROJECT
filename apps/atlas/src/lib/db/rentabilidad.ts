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
import { calcularMargen, type Rentabilidad, type FacturaMes, type GastoMes, type TramoMes } from "@/lib/rentabilidad/margen";

const cent = (n: number) => Math.round(n * 100);

export async function rentabilidadDelMes(
  sb: Sb,
  mes: string
): Promise<{ r: Rentabilidad; costeHoraCentimos: number; cerrado: Cierre | null }> {
  const desdeDia = `${mes}-01`;
  const hastaDia = `${mesVecino(mes, 1)}-01`; // primer día del mes siguiente
  const rango = limitesMesMadrid(mes);

  const [ajustes, cerrado, facturas, gastos, tramos, proyectos] = await Promise.all([
    leerAjustes(sb),
    cierreDe(sb, mes),
    listarFacturas(sb, {}),
    listarGastos(sb, { desde: desdeDia, hasta: hastaDia }),
    listarTramos(sb, rango),
    // `LineaFactura` solo trae `proyectoId` (no `proyectoNombre`): se resuelve
    // aquí una sola vez con un Map, en vez de tocar `facturas.ts` — el brief
    // pide no modificarlo, y una consulta por línea sería una N+1.
    nombresDeProyectos(sb),
  ]);
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.nombre]));

  // `listarFacturas` no filtra por fecha: trae las últimas 200 EN TOTAL (no
  // 200 del mes), así que un mes antiguo puede perder facturas en silencio en
  // cuanto el negocio pase de 200 facturas totales. Aquí solo se filtra por
  // mes de emisión y estado sobre lo que llegó; ampliar `listarFacturas` con
  // un filtro de fecha (para no depender del límite de 200) es de
  // `facturas.ts`, no de aquí.
  const facturasMes: FacturaMes[] = facturas
    .filter((f) => f.estado === "emitida" && f.fechaEmision >= desdeDia && f.fechaEmision < hastaDia)
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
