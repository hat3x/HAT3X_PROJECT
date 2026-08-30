"use client";

import { useState } from "react";
import { guardarAjustesEconomia } from "@/lib/db/acciones-economia";
import { aCentimos } from "@/lib/dinero";
import type { AjustesEconomia } from "@/lib/db/ajustes-economia";

/**
 * El coste de la hora y los datos fiscales del emisor. El coste es un número
 * que fija el propietario (decisión 8), no un derivado: por eso es un campo y
 * no un cálculo. Los datos fiscales pueden quedar vacíos hasta que 2E los exija.
 */
export function FormEconomia({ actual }: { actual: AjustesEconomia }) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    setGuardado(false);
    const coste = aCentimos(String(datos.get("costeHora") ?? ""));
    if (coste === null) return setError("El coste de la hora no es un importe.");
    const texto = (n: string) => {
      const t = String(datos.get(n) ?? "").trim();
      return t === "" ? null : t;
    };
    setEnviando(true);
    try {
      const r = await guardarAjustesEconomia({
        razonSocial: texto("razonSocial"),
        cif: texto("cif"),
        direccion: texto("direccion"),
        costeHoraCentimos: coste,
      });
      if (r.ok) setGuardado(true);
      else setError(r.error);
    } catch {
      // Igual que en FormGasto: un fallo de red en el `await` de arriba no
      // debe dejar el botón deshabilitado para siempre ni al usuario sin
      // explicación de por qué nada se guardó.
      setError("No se pudo guardar. Comprueba la conexión e inténtalo otra vez.");
    } finally {
      // En un `finally` y no al final del `try`: así corre también cuando la
      // acción de servidor rechaza en vez de devolver `{ ok: false }`.
      setEnviando(false);
    }
  }

  const euros = (actual.costeHoraCentimos / 100).toFixed(2).replace(".", ",");

  return (
    <form onSubmit={alEnviar} className="cristal space-y-3 p-4">
      <label className="block text-sm">
        <span className="mb-1 block">Coste de la hora (€)</span>
        {/* Solo `aria-label`: el `<span>` de arriba y este atributo nombran el
            mismo campo con textos distintos, y `getByLabelText` encontraría
            dos coincidencias. El texto visible ya está en el `<span>`. */}
        <input
          name="costeHora"
          inputMode="decimal"
          defaultValue={euros}
          aria-label="Coste de la hora"
          className="w-full rounded-lg px-2 py-1.5 sm:w-48"
        />
      </label>
      <p className="text-xs" style={{ color: "var(--texto-tenue)" }}>
        Se aplica a los meses abiertos. Un mes cerrado conserva el coste con el que se cerró.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block">Razón social</span>
          <input name="razonSocial" defaultValue={actual.razonSocial ?? ""} className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">CIF</span>
          <input name="cif" defaultValue={actual.cif ?? ""} className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Dirección</span>
          <input name="direccion" defaultValue={actual.direccion ?? ""} className="w-full rounded-lg px-2 py-1.5" />
        </label>
      </div>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>{error}</p>}
      {guardado && <p role="status" className="text-sm">Guardado.</p>}
      <button type="submit" disabled={enviando} className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50" style={{ background: "var(--cristal-fondo-denso)" }}>
        Guardar
      </button>
    </form>
  );
}
