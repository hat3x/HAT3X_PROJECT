"use client";
import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { asignarPermiso, retirarPermiso } from "@/lib/db/acciones-usuarios";
import { Campo } from "@/components/ui/Campo";
import type { Rol } from "@/lib/db/usuarios";

export type PermisoVisible = {
  proyectoId: string;
  proyectoNombre: string;
  rol: Rol;
};

export function PermisosUsuario({
  usuarioId,
  permisos,
  proyectos,
}: {
  usuarioId: string;
  permisos: PermisoVisible[];
  proyectos: { id: string; nombre: string }[];
}) {
  const [proyectoId, setProyectoId] = useState("");
  const [rol, setRol] = useState<Rol>("editor");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  // Los que ya tiene no se ofrecen: volver a elegirlos solo serviría para
  // reasignarle el mismo rol. Para cambiarlo, se quita y se vuelve a dar.
  const yaTiene = new Set(permisos.map((p) => p.proyectoId));
  const disponibles = proyectos.filter((p) => !yaTiene.has(p.id));

  function dar(e: React.FormEvent) {
    e.preventDefault();
    if (proyectoId === "") {
      setError("Elige a qué proyecto le das acceso.");
      return;
    }
    setError(null);
    empezar(async () => {
      const r = await asignarPermiso(usuarioId, proyectoId, rol);
      if (!r.ok) setError(r.error);
      else setProyectoId("");
    });
  }

  function quitar(id: string) {
    setError(null);
    empezar(async () => {
      const r = await retirarPermiso(usuarioId, id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="mt-3 space-y-3">
      <ul className="flex flex-wrap gap-2">
        {permisos.length === 0 ? (
          <li className="text-sm" style={{ color: "var(--texto-tenue)" }}>
            Sin acceso a ningún proyecto.
          </li>
        ) : (
          permisos.map((q) => (
            <li
              key={q.proyectoId}
              className="flex items-center gap-1.5 rounded-full py-0.5 pl-2.5 pr-1 text-xs"
              style={{ background: "var(--cristal-fondo)" }}
            >
              {q.proyectoNombre} · {q.rol}
              <button
                type="button"
                onClick={() => quitar(q.proyectoId)}
                disabled={pendiente}
                aria-label={`Quitar acceso a ${q.proyectoNombre}`}
                className="rounded-full p-0.5 opacity-60 hover:opacity-100 disabled:opacity-30"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))
        )}
      </ul>

      <form onSubmit={dar} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <Campo etiqueta="Proyecto" id={`permiso-proyecto-${usuarioId}`}>
            <select
              id={`permiso-proyecto-${usuarioId}`}
              value={proyectoId}
              onChange={(e) => setProyectoId(e.target.value)}
              className="entrada"
            >
              <option value="">— Elige un proyecto —</option>
              {disponibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="w-32">
          <Campo etiqueta="Rol" id={`permiso-rol-${usuarioId}`}>
            <select
              id={`permiso-rol-${usuarioId}`}
              value={rol}
              onChange={(e) => setRol(e.target.value as Rol)}
              className="entrada"
            >
              <option value="editor">editor</option>
              <option value="lector">lector</option>
            </select>
          </Campo>
        </div>

        <button
          type="submit"
          disabled={pendiente}
          className="cristal rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Dar acceso"}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
