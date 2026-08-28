import Link from "next/link";
import { TEXTO_ESTADO, TOKEN_ESTADO } from "@/components/ui/estados";
import { ordenarPorGravedad, type FilaResumen } from "@/lib/db/resumen";

/**
 * El plano de la oficina: cada sala es un proyecto y las luces de dentro son sus
 * servicios. Una sala se tiñe entera cuando algo se rompe.
 *
 * No lleva importes a propósito: un plano no es sitio para cuotas, así que el
 * dato ni se le pasa.
 *
 * Los agentes de la Oficina Virtual moviéndose entre salas llegan en el bloque 6,
 * cuando esto se conecte con `bus_events`.
 */
export function VistaOficina({ filas }: { filas: FilaResumen[] }) {
  const ordenadas = ordenarPorGravedad(filas);

  if (ordenadas.length === 0) {
    return (
      <div className="cristal p-8 text-center">
        <p className="font-medium">La oficina está vacía.</p>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Cada sala es un proyecto. Da de alta el primero.
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      style={{ gridAutoRows: "minmax(7rem, auto)" }}
    >
      {ordenadas.map((f) => {
        const color = TOKEN_ESTADO[f.estado];
        return (
          <Link
            key={f.proyecto.id}
            href={`/proyectos/${f.proyecto.slug}`}
            className="cristal relative flex flex-col justify-between overflow-hidden p-3 transition-transform hover:scale-[1.01]"
            style={{
              // El color del estado tiñe la sala entera, sin tapar el texto.
              background: `color-mix(in srgb, ${color} 14%, var(--cristal-fondo))`,
              borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate font-semibold">{f.proyecto.nombre}</span>
              {/* El color no basta: el estado se dice también con palabras. */}
              <span
                className="shrink-0 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color }}
              >
                {TEXTO_ESTADO[f.estado]}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-1.5">
              {Array.from({ length: f.serviciosTotal }, (_, i) => (
                <span
                  key={i}
                  role="presentation"
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: i < f.serviciosOk ? "var(--estado-ok)" : color,
                    boxShadow: `0 0 6px ${
                      i < f.serviciosOk ? "var(--estado-ok)" : color
                    }`,
                  }}
                />
              ))}
              {f.serviciosTotal === 0 && (
                <span className="text-xs" style={{ color: "var(--texto-tenue)" }}>
                  sin servicios
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
