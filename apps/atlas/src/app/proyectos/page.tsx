import { clienteServidor } from "@/lib/supabase/servidor";
import { listarProyectos } from "@/lib/db/proyectos";
import { TarjetaProyecto } from "@/components/proyectos/TarjetaProyecto";

export default async function PaginaProyectos() {
  const sb = await clienteServidor();
  const proyectos = await listarProyectos(sb);

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
        <span className="text-sm" style={{ color: "var(--texto-tenue)" }}>
          {proyectos.length === 1 ? "1 proyecto" : `${proyectos.length} proyectos`}
        </span>
      </header>

      {proyectos.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Todavía no hay ningún proyecto.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Aquí van las apps y sistemas que construyes: Kairos, la app de 100
            Montaditos, las recepcionistas de voz…
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {proyectos.map((p) => (
            <TarjetaProyecto key={p.id} proyecto={p} />
          ))}
        </div>
      )}
    </section>
  );
}
