"use client";

import { useState } from "react";
import { guardarGasto } from "@/lib/db/acciones-gastos";
import { CATEGORIAS, type Categoria } from "@/lib/db/gastos";
import { aCentimos, hoyEnMadrid } from "@/lib/dinero";

/**
 * Los importes se convierten a céntimos AQUÍ, en el borde. A partir de este
 * punto ningún euro en coma flotante viaja hacia la base.
 */
export function FormGasto({
  clientes,
  plataformas,
}: {
  clientes: { id: string; nombre: string }[];
  plataformas: { id: string; nombre: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // `<form action={fn}>` con una función es un feature de React 19: en React
  // 18.3 (el que usa este proyecto) el tipo de `action` en @types/react solo
  // admite `string`, así que se lee el `FormData` a mano desde `onSubmit`.
  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capturado ANTES de cualquier `await`: React reutiliza y vacía el evento
    // sintético en cuanto el manejador cede el control, así que leer
    // `e.currentTarget` después del `await` de más abajo daría `null`, y
    // `.reset()` reventaría justo cuando el guardado ha ido bien.
    const formulario = e.currentTarget;
    const datos = new FormData(formulario);
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
    try {
      const r = await guardarGasto({
        // Madrid, no UTC: entre medianoche y las dos de la mañana un gasto sin
        // fecha se apuntaría con la fecha de ayer, y el día 1 eso lo saca del
        // mes que le tocaba (ver `hoyEnMadrid`).
        fecha: String(datos.get("fecha") ?? hoyEnMadrid()),
        concepto,
        plataformaId: String(datos.get("plataformaId") ?? "") || null,
        baseCentimos: base,
        ivaCentimos: iva,
        categoria: String(datos.get("categoria") ?? "otro") as Categoria,
        clienteId: clienteId === "" ? null : clienteId,
      });
      if (r.ok) formulario.reset();
      else setError(r.error);
    } catch {
      // `guardarGasto` está escrita para devolver `{ ok: false }` y no
      // lanzar, pero la llamada de red a la acción de servidor SÍ puede
      // rechazar (caída de red, fallo de serialización). Sin este `catch`,
      // el `finally` de abajo sería la única red de seguridad para no dejar
      // el botón deshabilitado para siempre, pero el usuario se quedaría sin
      // saber que nada se guardó.
      setError("No se pudo guardar. Comprueba la conexión e inténtalo otra vez.");
    } finally {
      // Sin este `finally`, un fallo de red en el `await` de arriba dejaría
      // `enviando` en `true` para siempre: el botón quedaría deshabilitado
      // hasta recargar la página, sin ninguna pista de por qué.
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="cristal space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block">Concepto</span>
          <input name="concepto" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Plataforma</span>
          <select name="plataformaId" className="w-full rounded-lg px-2 py-1.5">
            {/* Vacío el primero: un gasto suelto —un notario, un billete— no es
                de ninguna plataforma. Y lo que se pague dos veces, merece
                serlo. */}
            <option value="">— ninguna —</option>
            {plataformas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
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
            defaultValue={hoyEnMadrid()}
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
