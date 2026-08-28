"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { guardarServicio } from "@/lib/db/acciones-proyecto";
import { Campo } from "@/components/ui/Campo";

const TIPOS = [
  "web", "api", "webhook", "workflow", "agente-voz",
  "telefonia", "base-datos", "cron", "dominio", "otro",
] as const;

export type ClienteElegible = { id: string; nombre: string };

export function FormServicio({
  proyectoId,
  slugProyecto,
  clientes,
}: {
  proyectoId: string;
  slugProyecto: string;
  clientes: ClienteElegible[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<string>("web");
  const [proveedor, setProveedor] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function cerrar() {
    setAbierto(false);
    setNombre("");
    setTipo("web");
    setProveedor("");
    setClienteId("");
    setError(null);
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    empezar(async () => {
      const r = await guardarServicio(
        {
          proyectoId,
          // Cadena vacía significa «del proyecto», no «cliente sin nombre».
          clienteId: clienteId === "" ? null : clienteId,
          nombre,
          tipo,
          proveedor: proveedor.trim() === "" ? null : proveedor.trim(),
        },
        slugProyecto
      );
      // Si falla se deja abierto y con lo escrito: perder lo tecleado por un
      // error del servidor es la peor manera de fallar.
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
        Añadir servicio
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="cristal-denso space-y-3 rounded-xl p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre" id="servicio-nombre">
          <input
            id="servicio-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Agente Retell"
            className="entrada"
          />
        </Campo>

        <Campo etiqueta="Tipo" id="servicio-tipo">
          <select
            id="servicio-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="entrada"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Proveedor" id="servicio-proveedor">
          <input
            id="servicio-proveedor"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            placeholder="retell, n8n, vercel…"
            className="entrada"
          />
        </Campo>

        <Campo
          etiqueta="Cliente"
          id="servicio-cliente"
          ayuda="En blanco si el servicio es del proyecto y no de un cliente concreto."
        >
          <select
            id="servicio-cliente"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="entrada"
          >
            <option value="">— Del proyecto —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="cristal rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar servicio"}
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
