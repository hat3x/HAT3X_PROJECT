// src/components/dinero/BotonCierreMes.tsx
"use client";

import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { cerrarMesAccion, reabrirMesAccion } from "@/lib/db/acciones-economia";

/**
 * Cerrar un mes congela el coste de la hora con el que se calculó. Reabrirlo
 * vuelve al coste actual. Son dos botones y no un conmutador para que cada
 * acción diga lo que hace.
 */
export function BotonCierreMes({ mes, cerrado }: { mes: string; cerrado: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function ejecutar(accion: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    setEnviando(true);
    try {
      const r = await accion();
      if (!r.ok) setError(r.error);
    } catch {
      setError("No se pudo guardar. Comprueba la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {cerrado ? (
        <button type="button" disabled={enviando} onClick={() => ejecutar(() => reabrirMesAccion(mes))} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50" style={{ background: "var(--cristal-fondo-denso)" }}>
          <LockOpen size={14} aria-hidden="true" /> Reabrir el mes
        </button>
      ) : (
        <button type="button" disabled={enviando} onClick={() => ejecutar(() => cerrarMesAccion(mes))} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50" style={{ background: "var(--cristal-fondo-denso)" }}>
          <Lock size={14} aria-hidden="true" /> Cerrar el mes
        </button>
      )}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>{error}</p>}
    </div>
  );
}
