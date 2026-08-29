// src/lib/db/cobro.ts
import type { Sb } from "./clientes";
import type { PeriodoSinFacturar, FacturaSinCobrar } from "@/lib/cobro/pendientes";

//
// Lo que alimenta la decisión de `lib/cobro/pendientes.ts`.
//
// **No filtra por permisos**: de eso se encarga RLS, y hay un test que lo
// comprueba con un colaborador real en vez de suponerlo.
//

/** Céntimos desde el `numeric(12,2)` que devuelve Postgres. */
function aCentimos(n: unknown): number {
  return Math.round(Number(n) * 100);
}

export async function leerCobro(
  sb: Sb,
  hoy: string
): Promise<{ periodos: PeriodoSinFacturar[]; facturas: FacturaSinCobrar[] }> {
  // El mes en curso se excluye: todavía se puede facturar, y perseguirlo el
  // día 3 sería avisar de algo que aún no ha llegado a ser un descuido.
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;

  // La lectura de `contratos` está revocada para `authenticated` (ver
  // `20260815100300_rls.sql`): toda la app —también el propietario— lee del
  // contrato a través de `contratos_visibles`. Embeber la tabla en vez de la
  // vista aquí haría fallar la consulta con «permission denied for table
  // contratos» incluso para el dueño.
  const { data: perFilas, error: eP } = await sb
    .from("periodos_contrato")
    .select(
      `contrato_id, periodo, importe_esperado,
       contratos_visibles!inner(clientes!inner(nombre))`
    )
    .is("factura_id", null)
    .lt("periodo", mesEnCurso)
    .order("periodo");
  if (eP) throw eP;

  const { data: facFilas, error: eF } = await sb
    .from("facturas")
    .select("id, serie, numero, total, fecha_vencimiento, clientes!inner(nombre)")
    .is("cobrada_en", null)
    .eq("estado", "emitida")
    .order("fecha_vencimiento");
  if (eF) throw eF;

  // PostgREST devuelve cada relación como objeto o como array según la
  // cardinalidad que infiera. Se normaliza en un solo sitio.
  const uno = <T,>(u: unknown): T => (Array.isArray(u) ? u[0] : u) as T;

  return {
    periodos: (perFilas ?? []).map((p) => {
      const contrato = uno<{ clientes: unknown }>(p.contratos_visibles);
      const cliente = uno<{ nombre: string }>(contrato.clientes);
      return {
        contratoId: p.contrato_id,
        clienteNombre: cliente.nombre,
        periodo: p.periodo,
        importeEsperadoCentimos: aCentimos(p.importe_esperado),
      };
    }),
    facturas: (facFilas ?? []).map((f) => ({
      id: f.id,
      serie: f.serie,
      numero: f.numero,
      clienteNombre: uno<{ nombre: string }>(f.clientes).nombre,
      totalCentimos: aCentimos(f.total),
      fechaVencimiento: f.fecha_vencimiento,
    })),
  };
}
