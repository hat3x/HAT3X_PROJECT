import Link from "next/link";
import { BellOff } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { listarIncidencias, duracionDe, estaSilenciada } from "@/lib/db/alertas";
import { listarProyectos } from "@/lib/db/proyectos";
import { FiltrosAlertas } from "@/components/alertas/FiltrosAlertas";
import { Distintivo } from "@/components/ui/Distintivo";

const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

export default async function PaginaAlertas({
  searchParams,
}: {
  searchParams: { proyecto?: string; severidad?: string; abiertas?: string };
}) {
  const sb = await clienteServidor();

  const [incidencias, proyectos] = await Promise.all([
    listarIncidencias(sb, {
      proyecto: searchParams.proyecto,
      severidad: searchParams.severidad,
      abiertas: searchParams.abiertas === "1",
    }),
    listarProyectos(sb),
  ]);

  const ahora = Date.now();
  const hayFiltros = Object.values(searchParams).some((v) => v);

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Todo lo que se ha roto y cuánto tardó en volver.
        </p>
      </header>

      <FiltrosAlertas
        proyectos={proyectos.map((p) => ({ slug: p.slug, nombre: p.nombre }))}
      />

      {incidencias.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">
            {hayFiltros ? "Nada con esos filtros." : "Ninguna incidencia. Buena señal."}
          </p>
          {!hayFiltros && (
            <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
              Aquí aparecerá cada caída, con su causa y cuánto duró.
            </p>
          )}
        </div>
      ) : (
        <div className="cristal cristal-denso overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-left text-xs uppercase tracking-wider"
                style={{
                  borderColor: "var(--cristal-borde)",
                  color: "var(--texto-tenue)",
                }}
              >
                <th scope="col" className="px-4 py-2 font-medium">
                  Severidad
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Proyecto
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Servicio
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Causa
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Cuándo
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Duración
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
              {incidencias.map((i) => {
                const silenciada = estaSilenciada(i.silenciadaHasta, ahora);
                return (
                  <tr key={i.id}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <Distintivo
                          estado={i.severidad === "critica" ? "caido" : "aviso"}
                          texto={i.severidad === "critica" ? "Crítica" : "Aviso"}
                        />
                        {silenciada && (
                          <BellOff
                            size={13}
                            aria-label="Silenciada"
                            style={{ color: "var(--texto-tenue)" }}
                          />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/proyectos/${i.proyectoSlug}`}
                        className="font-medium hover:underline"
                      >
                        {i.proyectoNombre}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{i.servicioNombre}</td>
                    <td
                      className="max-w-[20rem] truncate px-4 py-2.5"
                      style={{ color: "var(--texto-tenue)" }}
                      title={i.causa ?? undefined}
                    >
                      {i.causa ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                      {FECHA.format(new Date(i.abiertaEn))}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-2.5 tabular-nums"
                      style={{ color: i.cerradaEn ? undefined : "var(--estado-caido)" }}
                    >
                      {duracionDe(i.abiertaEn, i.cerradaEn, ahora)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
