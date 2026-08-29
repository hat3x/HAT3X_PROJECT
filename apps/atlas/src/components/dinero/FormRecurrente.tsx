"use client";

import { useState } from "react";
import { guardarRecurrente } from "@/lib/db/acciones-recurrentes";
import { CATEGORIAS, type Categoria } from "@/lib/db/gastos";
import { aCentimos } from "@/lib/dinero";

/**
 * Alta de un recibo fijo: lo que se paga igual todos los meses.
 *
 * Darlo de alta aquí es lo que evita teclear doce veces al año el mismo
 * recibo — que es como se acaba no tecleándolo, y con el total del mes
 * saliendo más bajo de lo real.
 */
export function FormRecurrente({
  clientes,
  plataformas,
}: {
  clientes: { id: string; nombre: string }[];
  plataformas: { id: string; nombre: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // `e.currentTarget` vale null después de un `await`, así que la referencia
    // se captura antes de cualquier espera.
    const formulario = e.currentTarget;
    const datos = new FormData(formulario);
    setError(null);

    const concepto = String(datos.get("concepto") ?? "").trim();
    if (concepto === "") return setError("El recibo necesita un concepto.");

    const base = aCentimos(String(datos.get("base") ?? ""));
    if (base === null) return setError("La base no es un importe.");

    // El IVA vacío es cero, no un error: hay recibos sin IVA.
    const ivaTexto = String(datos.get("iva") ?? "").trim();
    const iva = ivaTexto === "" ? 0 : aCentimos(ivaTexto);
    if (iva === null) return setError("El IVA no es un importe.");

    const dia = Number(datos.get("diaDelMes"));
    if (!Number.isInteger(dia) || dia < 1 || dia > 28) {
      return setError(
        "El día tiene que estar entre 1 y 28: los días 29, 30 y 31 no existen todos los meses."
      );
    }

    const clienteId = String(datos.get("clienteId") ?? "");
    const plataformaId = String(datos.get("plataformaId") ?? "");

    setEnviando(true);
    try {
      const r = await guardarRecurrente({
        concepto,
        plataformaId: plataformaId === "" ? null : plataformaId,
        baseCentimos: base,
        ivaCentimos: iva,
        categoria: String(datos.get("categoria") ?? "otro") as Categoria,
        clienteId: clienteId === "" ? null : clienteId,
        diaDelMes: dia,
      });
      if (r.ok) formulario.reset();
      else setError(r.error);
    } catch {
      // La llamada de red puede rechazar aunque la función no lance. Sin este
      // camino, el usuario vería el botón deshabilitado y ninguna explicación.
      setError("No se pudo guardar. Comprueba la conexión e inténtalo otra vez.");
    } finally {
      // En el `finally` y no al final del `try`: si la promesa se rechaza, el
      // `try` no llega a su última línea y el botón quedaría muerto.
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="cristal space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block">Concepto</span>
          <input name="concepto" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Plataforma</span>
          <select name="plataformaId" className="w-full rounded-lg px-2 py-1.5">
            <option value="">— ninguna —</option>
            {plataformas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Categoría</span>
          <select name="categoria" className="w-full rounded-lg px-2 py-1.5">
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Base</span>
          <input
            name="base"
            inputMode="decimal"
            className="w-full rounded-lg px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">IVA</span>
          <input
            name="iva"
            inputMode="decimal"
            className="w-full rounded-lg px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Día del mes</span>
          <input
            name="diaDelMes"
            type="number"
            min={1}
            max={28}
            defaultValue={1}
            className="w-full rounded-lg px-2 py-1.5"
          />
        </label>
        <label className="block text-sm sm:col-span-3">
          <span className="mb-1 block">Cliente</span>
          <select name="clienteId" className="w-full rounded-lg px-2 py-1.5">
            {/* Vacío por defecto: la mayoría de los recibos fijos son de
                estructura y no se reparten entre clientes. */}
            <option value="">— de estructura, sin imputar —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
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
        Guardar recibo fijo
      </button>
    </form>
  );
}
