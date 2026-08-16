import Link from "next/link";
import { Distintivo } from "@/components/ui/Distintivo";
import { TEXTO_ESTADO, COLOR_ESTADO } from "@/components/ui/estados";
import { formatearUptime } from "@/lib/uptime/calcular";
import { ordenarPorGravedad, type FilaResumen } from "@/lib/db/resumen";

const EUROS = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/**
 * La misma información que la sala de control, pero densa y de un vistazo. Sobre
 * `cristal-denso` porque el cristal translúcido es enemigo de la letra pequeña.
 */
export function VistaLista({
  filas,
  verImportes,
}: {
  filas: FilaResumen[];
  verImportes: boolean;
}) {
  const ordenadas = ordenarPorGravedad(filas);

  return (
    <div className="cristal cristal-denso overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr
            className="border-b text-left text-xs uppercase tracking-wider"
            style={{ borderColor: "var(--cristal-borde)", color: "var(--texto-tenue)" }}
          >
            <th scope="col" className="px-4 py-2 font-medium">
              Estado
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Proyecto
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Servicios
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Uptime 30 d
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Incidencia
            </th>
            {verImportes && (
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Cuota
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
          {ordenadas.map((f) => (
            <tr key={f.proyecto.id}>
              <td className="px-4 py-2.5">
                <Distintivo
                  estado={COLOR_ESTADO[f.estado]}
                  texto={TEXTO_ESTADO[f.estado]}
                />
              </td>
              <td className="px-4 py-2.5">
                <Link
                  href={`/proyectos/${f.proyecto.slug}`}
                  className="font-medium hover:underline"
                >
                  {f.proyecto.nombre}
                </Link>
              </td>
              <td className="px-4 py-2.5 tabular-nums">
                {f.serviciosOk}/{f.serviciosTotal}
              </td>
              <td className="px-4 py-2.5 tabular-nums">{formatearUptime(f.uptime30d)}</td>
              <td
                className="max-w-[18rem] truncate px-4 py-2.5"
                style={{
                  color: f.peorError ? "var(--estado-caido)" : "var(--texto-tenue)",
                }}
                title={f.peorError ?? undefined}
              >
                {f.peorError ?? "—"}
              </td>
              {verImportes && (
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                  {f.cuota === null ? "—" : EUROS.format(f.cuota)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
