import Link from "next/link";
import { Portada } from "@/components/proyectos/Portada";
import { Distintivo } from "@/components/ui/Distintivo";
import { TEXTO_ESTADO, COLOR_ESTADO } from "@/components/ui/estados";
import { formatearUptime } from "@/lib/uptime/calcular";
import { ordenarPorGravedad, type FilaResumen, type Contadores } from "@/lib/db/resumen";

const EUROS = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function Contador({
  valor,
  etiqueta,
  color,
}: {
  valor: string | number;
  etiqueta: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
        {valor}
      </span>
      <span className="text-xs" style={{ color: "var(--texto-tenue)" }}>
        {etiqueta}
      </span>
    </div>
  );
}

export function SalaDeControl({
  filas,
  contadores,
  verImportes,
}: {
  filas: FilaResumen[];
  contadores: Contadores;
  verImportes: boolean;
}) {
  const ordenadas = ordenarPorGravedad(filas);

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Resumen global"
        className="cristal flex flex-wrap gap-x-10 gap-y-4 p-4"
      >
        <Contador valor={contadores.proyectos} etiqueta="proyectos" />
        <Contador valor={contadores.ok} etiqueta="operativos" color="var(--estado-ok)" />
        <Contador
          valor={contadores.degradados}
          etiqueta="degradados"
          color="var(--estado-aviso)"
        />
        <Contador
          valor={contadores.caidos}
          etiqueta="caídos"
          color="var(--estado-caido)"
        />
        <Contador
          valor={formatearUptime(contadores.uptimeMedio)}
          etiqueta="uptime medio"
        />
      </div>

      {ordenadas.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Todavía no hay ningún proyecto que vigilar.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Da de alta uno y añádele servicios para que Atlas empiece a mirarlos.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ordenadas.map((f) => (
            <Link
              key={f.proyecto.id}
              href={`/proyectos/${f.proyecto.slug}`}
              className="cristal overflow-hidden transition-transform hover:scale-[1.01]"
            >
              <div className="h-20">
                <Portada
                  portadaUrl={f.proyecto.portadaUrl}
                  gradiente={f.proyecto.gradiente}
                  nombre={f.proyecto.nombre}
                />
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 truncate font-semibold">{f.proyecto.nombre}</h3>
                  <Distintivo
                    estado={COLOR_ESTADO[f.estado]}
                    texto={TEXTO_ESTADO[f.estado]}
                  />
                </div>

                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                  style={{ color: "var(--texto-tenue)" }}
                >
                  <span className="tabular-nums" title="Servicios operativos">
                    {f.serviciosOk}/{f.serviciosTotal}
                  </span>
                  <span className="tabular-nums" title="Uptime de 30 días">
                    {formatearUptime(f.uptime30d)}
                  </span>
                  {verImportes && f.cuota !== null && (
                    <span className="ml-auto font-semibold tabular-nums">
                      {EUROS.format(f.cuota)}
                    </span>
                  )}
                </div>

                {f.peorError && (
                  <p
                    className="truncate text-xs"
                    style={{ color: "var(--estado-caido)" }}
                    title={f.peorError}
                  >
                    {f.peorError}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
