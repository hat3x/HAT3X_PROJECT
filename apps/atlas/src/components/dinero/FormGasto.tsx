"use client";

import { useState } from "react";
import { guardarGasto } from "@/lib/db/acciones-gastos";
import { CATEGORIAS, type Categoria } from "@/lib/db/gastos";
import { aCentimos } from "@/lib/dinero";

/**
 * Los importes se convierten a céntimos AQUÍ, en el borde. A partir de este
 * punto ningún euro en coma flotante viaja hacia la base.
 */
export function FormGasto({
  clientes,
}: {
  clientes: { id: string; nombre: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // `<form action={fn}>` con una función es un feature de React 19: en React
  // 18.3 (el que usa este proyecto) el tipo de `action` en @types/react solo
  // admite `string`, así que se lee el `FormData` a mano desde `onSubmit`.
  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);

    const concepto = String(datos.get("concepto") ?? "").trim();
    if (concepto === "") return setError("El gasto necesita un concepto.");

    const base = aCentimos(String(datos.get("base") ?? ""));
    if (base === null) return setError("La base no es un importe.");

    // El IVA vacío es cero, no un error: hay gastos sin IVA.
    const ivaTexto = String(datos.get("iva") ?? "").trim();
    const iva = ivaTexto === "" ? 0 : aCentimos(ivaTexto);
    if (iva === null) return setError("El IVA no es un importe.");

    const clienteId = String(datos.get("clienteId") ?? "");

    setEnviando(true);
    const r = await guardarGasto({
      fecha: String(datos.get("fecha") ?? new Date().toISOString().slice(0, 10)),
      concepto,
      proveedor: String(datos.get("proveedor") ?? "") || null,
      baseCentimos: base,
      ivaCentimos: iva,
      categoria: String(datos.get("categoria") ?? "otro") as Categoria,
      clienteId: clienteId === "" ? null : clienteId,
    });
    setEnviando(false);

    if (!r.ok) setError(r.error);
  }

  return (
    <form onSubmit={alEnviar} className="cristal space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block">Concepto</span>
          <input name="concepto" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Proveedor</span>
          <input name="proveedor" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Base</span>
          <input name="base" inputMode="decimal" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">IVA</span>
          <input name="iva" inputMode="decimal" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Fecha</span>
          <input
            name="fecha"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-lg px-2 py-1.5"
          />
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
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block">Cliente</span>
          <select name="clienteId" className="w-full rounded-lg px-2 py-1.5">
            {/* Vacío por defecto: la mayoría de los gastos son de estructura. */}
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
        Guardar gasto
      </button>
    </form>
  );
}
