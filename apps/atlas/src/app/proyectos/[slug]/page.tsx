import { notFound } from "next/navigation";
import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { obtenerProyecto } from "@/lib/db/proyectos";
import { listarClientes } from "@/lib/db/clientes";
import { Portada } from "@/components/proyectos/Portada";
import { Distintivo } from "@/components/ui/Distintivo";
import { FormServicio } from "@/components/proyectos/FormServicio";
import { FormContrato } from "@/components/proyectos/FormContrato";

const EUROS = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

const ESTADO_TEXTO: Record<string, string> = {
  produccion: "En producción",
  mantenimiento: "Mantenimiento",
  desarrollo: "En desarrollo",
  pausado: "Pausado",
  retirado: "Retirado",
};

export default async function FichaProyecto({
  params,
}: {
  params: { slug: string };
}) {
  const sb = await clienteServidor();
  const [perfil, proyecto, clientes] = await Promise.all([
    obtenerPerfil(sb),
    obtenerProyecto(sb, params.slug),
    listarClientes(sb),
  ]);
  if (!proyecto) notFound();
  const verImportes = perfil?.esPropietario ?? false;
  // A los formularios solo viaja lo que necesitan para poblar un desplegable.
  const elegibles = clientes.map((c) => ({ id: c.id, nombre: c.nombre }));
  const enProduccion =
    proyecto.estado === "produccion" || proyecto.estado === "mantenimiento";

  return (
    <article className="space-y-4">
      <header className="cristal overflow-hidden">
        <div className="h-32">
          <Portada
            portadaUrl={proyecto.portadaUrl}
            gradiente={proyecto.gradiente}
            nombre={proyecto.nombre}
          />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{proyecto.nombre}</h1>
            {proyecto.descripcion && (
              <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
                {proyecto.descripcion}
              </p>
            )}
            {proyecto.stack.length > 0 && (
              <p className="mt-1 text-xs" style={{ color: "var(--texto-tenue)" }}>
                {proyecto.stack.join(" · ")}
              </p>
            )}
          </div>
          <Distintivo
            estado={enProduccion ? "ok" : "desconocido"}
            texto={ESTADO_TEXTO[proyecto.estado] ?? proyecto.estado}
          />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <section className="cristal p-4">
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--texto-tenue)" }}
          >
            Servicios ({proyecto.servicios.length})
          </h2>
          {proyecto.servicios.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
              Ningún servicio dado de alta todavía. Sin servicios no hay nada que
              vigilar.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
              {proyecto.servicios.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-3 py-2.5 text-sm"
                >
                  {/* El estado real llega con el motor de vigilancia (plan 1B).
                      Hasta entonces no se inventa un «operativo» que nadie ha
                      comprobado. */}
                  <Distintivo estado="desconocido" texto="Sin datos" />
                  <span className="font-medium">{s.nombre}</span>
                  <span style={{ color: "var(--texto-tenue)" }}>{s.tipo}</span>
                  {s.clienteNombre && (
                    <span className="cristal-denso ml-auto rounded-full px-2 py-0.5 text-[11px]">
                      {s.clienteNombre}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <FormServicio
              proyectoId={proyecto.id}
              slugProyecto={proyecto.slug}
              clientes={elegibles}
            />
          </div>
        </section>

        <aside className="space-y-4">
          <section className="cristal p-4">
            <h2
              className="mb-3 text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--texto-tenue)" }}
            >
              Quién lo tiene contratado
            </h2>
            {proyecto.contratos.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
                Nadie todavía.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {proyecto.contratos.map((ct) => (
                  <li key={ct.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{ct.clienteNombre}</span>
                    {verImportes && ct.cuotaMensual !== null && (
                      <span className="shrink-0 font-semibold tabular-nums">
                        {EUROS.format(ct.cuotaMensual)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {/* Un contrato lleva dinero: solo el propietario. La acción lo
                rechaza igualmente, pero no se enseña lo que no se puede usar. */}
            {verImportes && (
              <div className="mt-3">
                <FormContrato proyectoId={proyecto.id} clientes={elegibles} />
              </div>
            )}
          </section>

          {(proyecto.enlaces.length > 0 || proyecto.repoUrl) && (
            <section className="cristal p-4">
              <h2
                className="mb-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--texto-tenue)" }}
              >
                Ir a
              </h2>
              <div className="flex flex-wrap gap-2">
                {proyecto.repoUrl && (
                  <Link
                    href={proyecto.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="cristal-denso rounded-lg px-2.5 py-1 text-xs"
                  >
                    Repositorio
                  </Link>
                )}
                {proyecto.enlaces.map((e) => (
                  <Link
                    key={e.id}
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="cristal-denso rounded-lg px-2.5 py-1 text-xs"
                  >
                    {e.etiqueta}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}
