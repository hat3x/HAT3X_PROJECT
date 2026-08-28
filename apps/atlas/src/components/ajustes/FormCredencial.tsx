"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { guardarCredencial } from "@/lib/db/acciones-credenciales";
import { Campo } from "@/components/ui/Campo";

export type ProyectoElegible = { id: string; nombre: string };

export function FormCredencial({ proyectos }: { proyectos: ProyectoElegible[] }) {
  const [abierto, setAbierto] = useState(false);
  const [proveedor, setProveedor] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [secreto, setSecreto] = useState("");
  const [proyectoId, setProyectoId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function cerrar() {
    setAbierto(false);
    setProveedor("");
    setEtiqueta("");
    // El secreto se borra del estado en cuanto deja de hacer falta: cuanto
    // menos tiempo viva en la memoria del navegador, mejor.
    setSecreto("");
    setProyectoId("");
    setError(null);
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    empezar(async () => {
      const r = await guardarCredencial({
        proveedor,
        etiqueta,
        secreto,
        // Vacío significa credencial global, no atada a ningún proyecto.
        proyectoId: proyectoId === "" ? null : proyectoId,
      });
      if (!r.ok) setError(r.error);
      else cerrar();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="cristal-denso inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:opacity-80"
      >
        <Plus size={15} aria-hidden="true" />
        Añadir clave
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="cristal space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Proveedor" id="cred-proveedor">
          <input
            id="cred-proveedor"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            placeholder="retell, n8n, twilio, vercel…"
            className="entrada"
          />
        </Campo>

        <Campo
          etiqueta="Etiqueta"
          id="cred-etiqueta"
          ayuda="Para distinguirla de las demás del mismo proveedor."
        >
          <input
            id="cred-etiqueta"
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            placeholder="API key producción"
            className="entrada"
          />
        </Campo>
      </div>

      <Campo
        etiqueta="Secreto"
        id="cred-secreto"
        ayuda="Entra una vez y no se vuelve a mostrar. Si lo pierdes, se rota."
      >
        <input
          id="cred-secreto"
          type="password"
          autoComplete="off"
          value={secreto}
          onChange={(e) => setSecreto(e.target.value)}
          className="entrada"
        />
      </Campo>

      <Campo
        etiqueta="Proyecto"
        id="cred-proyecto"
        ayuda="En blanco si la clave vale para todo y no para un proyecto concreto."
      >
        <select
          id="cred-proyecto"
          value={proyectoId}
          onChange={(e) => setProyectoId(e.target.value)}
          className="entrada"
        >
          <option value="">— Global —</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </Campo>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="cristal-denso rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar clave"}
        </button>
        <button
          type="button"
          onClick={cerrar}
          className="rounded-lg px-3 py-1.5 text-sm opacity-70 hover:opacity-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
