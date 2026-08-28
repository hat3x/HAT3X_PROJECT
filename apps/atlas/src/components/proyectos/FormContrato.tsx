"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { guardarContrato } from "@/lib/db/acciones-proyecto";
import { Campo } from "@/components/ui/Campo";
import type { ClienteElegible } from "./FormServicio";

const ESTADOS = ["activo", "pausado", "finalizado"] as const;

/**
 * Hoy en AAAA-MM-DD y en hora *local*. Con `toISOString()` un alta creada a la
 * una de la madrugada en España se guardaría con la fecha del día anterior.
 */
function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function FormContrato({
  proyectoId,
  clientes,
}: {
  proyectoId: string;
  clientes: ClienteElegible[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [cuota, setCuota] = useState("");
  const [alta, setAlta] = useState("");
  const [baja, setBaja] = useState("");
  const [addons, setAddons] = useState("");
  const [estado, setEstado] = useState<string>("activo");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function abrir() {
    // La fecha se calcula al abrir, no al renderizar: en servidor daría un día
    // distinto al del navegador y React se quejaría de la discrepancia.
    setAlta(hoyISO());
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    setClienteId("");
    setCuota("");
    setAlta("");
    setBaja("");
    setAddons("");
    setEstado("activo");
    setError(null);
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (clienteId === "") {
      setError("Elige el cliente que contrata este proyecto.");
      return;
    }
    setError(null);
    empezar(async () => {
      const r = await guardarContrato({
        clienteId,
        proyectoId,
        // Vacío es «sin cargo», que no es lo mismo que cero.
        cuotaMensual: cuota.trim() === "" ? null : Number(cuota),
        addons: addons
          .split(",")
          .map((a) => a.trim())
          .filter((a) => a !== ""),
        alta,
        baja: baja === "" ? null : baja,
        estado,
      });
      if (!r.ok) setError(r.error);
      else cerrar();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="cristal-denso inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:opacity-80"
      >
        <Plus size={15} aria-hidden="true" />
        Añadir contrato
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="cristal-denso space-y-3 rounded-xl p-3">
      <Campo etiqueta="Cliente" id="contrato-cliente">
        <select
          id="contrato-cliente"
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          className="entrada"
        >
          <option value="">— Elige un cliente —</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Campo>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Cuota mensual (€)"
          id="contrato-cuota"
          ayuda="En blanco = sin cargo."
        >
          <input
            id="contrato-cuota"
            type="number"
            step="0.01"
            min="0"
            value={cuota}
            onChange={(e) => setCuota(e.target.value)}
            placeholder="290"
            className="entrada"
          />
        </Campo>

        <Campo etiqueta="Estado" id="contrato-estado">
          <select
            id="contrato-estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="entrada"
          >
            {ESTADOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Alta" id="contrato-alta">
          <input
            id="contrato-alta"
            type="date"
            value={alta}
            onChange={(e) => setAlta(e.target.value)}
            className="entrada"
          />
        </Campo>

        <Campo etiqueta="Baja" id="contrato-baja" ayuda="Solo si ya está cerrado.">
          <input
            id="contrato-baja"
            type="date"
            value={baja}
            onChange={(e) => setBaja(e.target.value)}
            className="entrada"
          />
        </Campo>
      </div>

      <Campo
        etiqueta="Add-ons"
        id="contrato-addons"
        ayuda="Separados por comas: recepcionista-ia, sms"
      >
        <input
          id="contrato-addons"
          value={addons}
          onChange={(e) => setAddons(e.target.value)}
          className="entrada"
        />
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
          className="cristal rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar contrato"}
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
