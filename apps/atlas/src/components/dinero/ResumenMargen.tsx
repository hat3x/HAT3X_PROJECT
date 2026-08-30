// src/components/dinero/ResumenMargen.tsx
import Link from "next/link";
import { formatear } from "@/lib/dinero";
import { formatearMinutos } from "@/lib/horas/tramos";
import type { FilaMargen } from "@/lib/rentabilidad/margen";

/**
 * El dinero del mes en la ficha (§8): lo que se quiere tener delante justo
 * antes de llamar. Solo se monta para el propietario: quien lo renderiza ya
 * lo ha comprobado, y RLS lo garantiza igualmente.
 */
export function ResumenMargen({ fila, mes, costeHoraCentimos }: { fila: FilaMargen; mes: string; costeHoraCentimos: number }) {
  const celda = (t: string, v: string, rojo = false) => (
    <div>
      <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>{t}</div>
      <div className="font-semibold tabular-nums" style={rojo ? { color: "var(--estado-caido)" } : undefined}>{v}</div>
    </div>
  );
  return (
    <section className="cristal p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>Este mes</h2>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {/* «(base)»: aquí todo va sin IVA, y la pantalla de Dinero enseña
            totales con IVA. Sin la etiqueta, las dos cifras del mismo mes
            parecen contradecirse. */}
        {celda("Facturado (base)", formatear(fila.facturadoCentimos))}
        {celda("Gastos (base)", formatear(fila.gastosCentimos))}
        {celda("Horas", `${formatearMinutos(fila.minutos)} · ${formatear(fila.horasCentimos)}`)}
        {celda("Margen", formatear(fila.margenCentimos), fila.margenCentimos < 0)}
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--texto-tenue)" }}>
        {costeHoraCentimos === 0 ? "Sin coste de la hora configurado: las horas cuentan cero. " : ""}
        <Link href={`/dinero/rentabilidad?mes=${mes}`} className="underline">Ver el mes entero →</Link>
      </p>
    </section>
  );
}
