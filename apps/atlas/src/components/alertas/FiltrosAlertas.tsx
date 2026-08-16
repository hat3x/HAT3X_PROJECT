"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Campo } from "@/components/ui/Campo";

export type ProyectoFiltrable = { slug: string; nombre: string };

/**
 * Los filtros viven en la URL, no en estado de cliente. Un filtro que no se
 * puede pegar en un mensaje vale la mitad: «mira esto» tiene que ser un enlace.
 */
export function FiltrosAlertas({ proyectos }: { proyectos: ProyectoFiltrable[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function cambiar(clave: string, valor: string) {
    const nuevos = new URLSearchParams(params.toString());
    if (valor === "") nuevos.delete(clave);
    else nuevos.set(clave, valor);
    const cadena = nuevos.toString();
    router.push(cadena === "" ? "/alertas" : `/alertas?${cadena}`);
  }

  return (
    <div className="cristal flex flex-wrap items-end gap-3 p-3">
      <div className="min-w-[12rem] flex-1">
        <Campo etiqueta="Proyecto" id="filtro-proyecto">
          <select
            id="filtro-proyecto"
            className="entrada"
            value={params.get("proyecto") ?? ""}
            onChange={(e) => cambiar("proyecto", e.target.value)}
          >
            <option value="">Todos</option>
            {proyectos.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div className="w-40">
        <Campo etiqueta="Severidad" id="filtro-severidad">
          <select
            id="filtro-severidad"
            className="entrada"
            value={params.get("severidad") ?? ""}
            onChange={(e) => cambiar("severidad", e.target.value)}
          >
            <option value="">Todas</option>
            <option value="critica">Crítica</option>
            <option value="aviso">Aviso</option>
          </select>
        </Campo>
      </div>

      <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          checked={params.get("abiertas") === "1"}
          onChange={(e) => cambiar("abiertas", e.target.checked ? "1" : "")}
        />
        Solo las abiertas
      </label>

      {params.toString() !== "" && (
        <button
          type="button"
          onClick={() => router.push("/alertas")}
          className="ml-auto rounded-lg px-2.5 py-1.5 text-sm opacity-70 hover:opacity-100"
        >
          Quitar filtros
        </button>
      )}
    </div>
  );
}
