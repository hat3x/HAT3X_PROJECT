"use client";

import { useState } from "react";
import { guardarFacturaExterna } from "@/lib/db/acciones-facturas";
import { aCentimos, hoyEnMadrid } from "@/lib/dinero";

type Linea = { concepto: string; importe: string; proyectoId: string };

const LINEA_VACIA: Linea = { concepto: "", importe: "", proyectoId: "" };

/**
 * Registra una factura que ya emitiste FUERA de Atlas. No la emite: eso llega
 * en el plan 2E, con su cadena de huellas y su firma.
 */
export function FormFacturaExterna({
  clientes,
  proyectos,
}: {
  clientes: { id: string; nombre: string }[];
  proyectos: { id: string; nombre: string }[];
}) {
  const [lineas, setLineas] = useState<Linea[]>([{ ...LINEA_VACIA }]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function cambiar(i: number, campo: keyof Linea, valor: string) {
    setLineas((ls) => ls.map((l, j) => (i === j ? { ...l, [campo]: valor } : l)));
  }

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

    // Líneas a medias: tienen importe o proyecto pero no concepto. Se avisa
    // en vez de descartarlas en silencio, porque el usuario sí escribió algo
    // ahí y el total dejaría de cuadrar con lo que tenía delante.
    const aMedias = lineas
      .map((l, i) => ({ l, numero: i + 1 }))
      .filter(
        ({ l }) => l.concepto.trim() === "" && (l.importe.trim() !== "" || l.proyectoId !== "")
      );
    if (aMedias.length > 0) {
      const numeros = aMedias.map(({ numero }) => numero).join(", ");
      return setError(`La línea ${numeros} tiene importe o proyecto pero le falta el concepto.`);
    }

    // Las líneas del todo vacías sí se ignoran: son las que quedan al pulsar
    // «Añadir línea» y no rellenar, y no tienen nada que guardar.
    const utiles = lineas.filter((l) => l.concepto.trim() !== "");
    if (utiles.length === 0) return setError("Una factura necesita al menos una línea.");

    const convertidas = [];
    for (const l of utiles) {
      const c = aCentimos(l.importe);
      if (c === null) return setError(`El importe de «${l.concepto}» no se entiende.`);
      convertidas.push({
        concepto: l.concepto.trim(),
        cantidad: 1,
        precioUnitarioCentimos: c,
        // El proyecto va en la LÍNEA: una factura puede cubrir dos proyectos,
        // como el presupuesto real de Biodental.
        proyectoId: l.proyectoId === "" ? null : l.proyectoId,
      });
    }

    const numero = Number(datos.get("numero"));
    if (!Number.isInteger(numero) || numero <= 0) {
      return setError("El número de factura tiene que ser un entero positivo.");
    }

    setEnviando(true);
    try {
      const r = await guardarFacturaExterna({
        clienteId: String(datos.get("clienteId") ?? ""),
        serie: String(datos.get("serie") ?? "").trim(),
        numero,
        fechaEmision: String(datos.get("fechaEmision") ?? ""),
        fechaVencimiento: String(datos.get("fechaVencimiento") ?? "") || null,
        ivaTipo: 21,
        lineas: convertidas,
      });
      if (r.ok) {
        // Limpia también el número: sin esto, la siguiente factura sale con
        // el mismo número y choca contra `unique(serie, numero)` con un error
        // que no explica que la causa es simplemente no haber limpiado el
        // formulario.
        formulario.reset();
        setLineas([{ ...LINEA_VACIA }]);
      } else {
        setError(r.error);
      }
    } catch {
      // Igual que en FormGasto: la llamada de red a la acción de servidor
      // puede rechazar (caída de red, fallo de serialización) aunque la
      // función esté escrita para devolver `{ ok: false }` y no lanzar. Sin
      // este `catch` el usuario se quedaría sin saber que nada se guardó.
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
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block">Cliente</span>
          <select name="clienteId" className="w-full rounded-lg px-2 py-1.5">
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Serie</span>
          <input name="serie" defaultValue="A" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Número</span>
          <input name="numero" inputMode="numeric" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Emitida</span>
          <input
            name="fechaEmision"
            type="date"
            defaultValue={hoyEnMadrid()}
            className="w-full rounded-lg px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Vence</span>
          <input name="fechaVencimiento" type="date" className="w-full rounded-lg px-2 py-1.5" />
        </label>
      </div>

      <div className="space-y-2">
        {lineas.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-3">
            <input
              aria-label={`Concepto de la línea ${i + 1}`}
              value={l.concepto}
              onChange={(e) => cambiar(i, "concepto", e.target.value)}
              placeholder="Concepto"
              className="rounded-lg px-2 py-1.5 text-sm"
            />
            <input
              aria-label={`Importe de la línea ${i + 1}`}
              value={l.importe}
              onChange={(e) => cambiar(i, "importe", e.target.value)}
              inputMode="decimal"
              placeholder="Importe"
              className="rounded-lg px-2 py-1.5 text-sm"
            />
            <select
              aria-label={`Proyecto de la línea ${i + 1}`}
              value={l.proyectoId}
              onChange={(e) => cambiar(i, "proyectoId", e.target.value)}
              className="rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">— sin proyecto —</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLineas((ls) => [...ls, { ...LINEA_VACIA }])}
          className="text-sm underline opacity-70 hover:opacity-100"
        >
          Añadir línea
        </button>
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
        Registrar factura
      </button>
    </form>
  );
}
