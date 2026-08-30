"use client";

import { useState } from "react";
import { borrarFichaje } from "@/lib/db/acciones-fichajes";

/**
 * Borrar un tramo propio desde la tabla de Horas. Existe porque `parar()`
 * cierra por tope un fichaje olvidado —16 h, marcado como añadido— y la
 * corrección honesta es borrar ese tramo y añadir el bueno con el formulario
 * de arriba. Sin esto, el aviso prometería una corrección que no hay.
 *
 * Confirmación con `confirm()`: es una fila que desaparece sin papelera, y
 * un diálogo del navegador basta para una acción tan poco frecuente. El
 * error se enseña al lado del botón, como en el resto de formularios.
 */
export function BotonBorrarTramo({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alPulsar() {
    if (!confirm("¿Borrar este tramo? No se puede deshacer.")) return;
    setError(null);
    setEnviando(true);
    try {
      const r = await borrarFichaje(id);
      if (!r.ok) setError(r.error);
    } catch {
      setError("No se pudo borrar. Comprueba la conexión.");
    } finally {
      // En el finally: si la promesa se rechaza, el botón no puede quedar muerto.
      setEnviando(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={alPulsar}
        disabled={enviando}
        className="rounded-lg px-2 py-1 text-xs opacity-70 hover:opacity-100 disabled:opacity-50"
        style={{ background: "var(--cristal-fondo-denso)" }}
      >
        Borrar
      </button>
      {error && (
        <span role="alert" className="text-xs" style={{ color: "var(--estado-caido)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
