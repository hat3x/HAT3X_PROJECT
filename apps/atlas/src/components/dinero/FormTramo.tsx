"use client";

import { useState } from "react";
import { anadirFichaje } from "@/lib/db/acciones-fichajes";

/**
 * Añadir un tramo que se olvidó fichar. Queda marcado como añadido, y la
 * pantalla lo enseña: la regla es fichar antes, y esto es la excepción, no el
 * camino.
 *
 * Las horas se teclean en la zona del dispositivo (`datetime-local` no lleva
 * zona) y se mandan en ISO con zona: `new Date(valor)` las interpreta en la
 * zona del navegador, que es la de quien las recuerda. Si quien rellena el
 * formulario está de viaje, la hora se interpreta en la zona del
 * dispositivo, no en la de Madrid — es una limitación aceptada, no un bug.
 */
export function FormTramo({
  proyectos,
  clientes,
}: {
  proyectos: { id: string; nombre: string }[];
  clientes: { id: string; nombre: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const datos = new FormData(formulario);
    setError(null);

    const inicio = new Date(String(datos.get("inicio") ?? ""));
    const fin = new Date(String(datos.get("fin") ?? ""));
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      return setError("Hace falta un inicio y un fin.");
    }
    const proyectoId = String(datos.get("proyectoId") ?? "");
    const clienteId = String(datos.get("clienteId") ?? "");
    const nota = String(datos.get("nota") ?? "").trim();

    setEnviando(true);
    try {
      const r = await anadirFichaje({
        proyectoId: proyectoId === "" ? null : proyectoId,
        clienteId: clienteId === "" ? null : clienteId,
        nota: nota === "" ? null : nota,
        inicio: inicio.toISOString(),
        fin: fin.toISOString(),
      });
      if (r.ok) formulario.reset();
      else setError(r.error);
    } catch {
      setError("No se pudo guardar. Comprueba la conexión e inténtalo otra vez.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="cristal space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block">Inicio</span>
          <input name="inicio" type="datetime-local" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Fin</span>
          <input name="fin" type="datetime-local" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Proyecto</span>
          <select name="proyectoId" className="w-full rounded-lg px-2 py-1.5">
            <option value="">— ninguno —</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Cliente</span>
          <select name="clienteId" className="w-full rounded-lg px-2 py-1.5">
            <option value="">— ninguno —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block">Nota</span>
          <input name="nota" className="w-full rounded-lg px-2 py-1.5" placeholder="Qué fue: llamada, visita, lectura…" />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        style={{ background: "var(--cristal-fondo-denso)" }}
      >
        Añadir tramo olvidado
      </button>
    </form>
  );
}
