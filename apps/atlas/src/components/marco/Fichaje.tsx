"use client";

import { useEffect, useState } from "react";
import { Play, Square } from "lucide-react";
import { empezarFichaje, pararFichaje } from "@/lib/db/acciones-fichajes";
import { formatearMinutos } from "@/lib/horas/tramos";

export type EnCurso = { id: string; etiqueta: string; inicio: string };

/**
 * El fichaje, siempre a la vista. Va en el marco y no en una pantalla porque
 * la regla —«ficha antes de empezar»— solo se cumple si cumplirla cuesta menos
 * que olvidarla: un botón a un clic desde cualquier sitio, también en el móvil.
 *
 * Recibe el estado ya resuelto en servidor. Este componente no consulta la
 * base: un componente cliente no puede decidir quién eres.
 */
export function Fichaje({
  enCurso,
  proyectos,
  clientes,
}: {
  enCurso: EnCurso | null;
  proyectos: { id: string; nombre: string }[];
  clientes: { id: string; nombre: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Nace en `null` y no en `Date.now()`: el servidor renderiza en un
  // instante y el cliente hidrata en otro, y si esos dos instantes caen a
  // ambos lados de un cambio de minuto el texto del cronómetro no coincide
  // — error de hidratación. Mientras es `null` no se pinta el cronómetro,
  // solo la etiqueta; en el primer efecto tras montar se fija el valor real,
  // ya solo en el cliente.
  const [ahora, setAhora] = useState<number | null>(null);

  // El cronómetro se refresca cada medio minuto: basta para leerlo y no
  // vuelve a pintar el marco entero cada segundo. La dependencia es
  // `enCurso?.inicio` (una cadena) y no `enCurso` (un objeto nuevo en cada
  // render del layout): con el objeto, el efecto se reiniciaría de más.
  useEffect(() => {
    if (!enCurso) return;
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [enCurso?.inicio]);

  async function ejecutar(accion: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    setEnviando(true);
    try {
      const r = await accion();
      if (!r.ok) setError(r.error);
    } catch {
      setError("No se pudo guardar. Comprueba la conexión.");
    } finally {
      // En el finally: si la promesa se rechaza, el botón no puede quedar muerto.
      setEnviando(false);
    }
  }

  if (enCurso) {
    // `ahora` es `null` hasta que el efecto corre en el cliente (ver el
    // comentario del `useState` de arriba): mientras tanto no hay minutos
    // fiables que pintar, solo la etiqueta de qué está en curso.
    const minutos =
      ahora === null ? null : Math.round((ahora - Date.parse(enCurso.inicio)) / 60_000);
    return (
      <div className="cristal space-y-2 p-3" aria-live="polite">
        <div className="text-[11px] uppercase tracking-wider opacity-60">Fichado en</div>
        <div className="truncate text-sm font-medium">{enCurso.etiqueta}</div>
        {minutos !== null && (
          <div className="text-sm tabular-nums opacity-80">{formatearMinutos(Math.max(0, minutos))}</div>
        )}
        {error && (
          <p role="alert" className="text-xs" style={{ color: "var(--estado-caido)" }}>
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={enviando}
          onClick={() => ejecutar(pararFichaje)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--cristal-fondo-denso)" }}
        >
          <Square size={14} aria-hidden="true" />
          Parar
        </button>
      </div>
    );
  }

  return (
    <form
      className="cristal space-y-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        const proyectoId = String(datos.get("proyectoId") ?? "");
        const clienteId = String(datos.get("clienteId") ?? "");
        void ejecutar(() =>
          empezarFichaje({
            proyectoId: proyectoId === "" ? null : proyectoId,
            clienteId: clienteId === "" ? null : clienteId,
            nota: null,
          })
        );
      }}
    >
      <div className="text-[11px] uppercase tracking-wider opacity-60">Fichar</div>
      {/*
        Solo `aria-label`, sin `<label>` envolvente ni `sr-only` dentro: con
        las dos cosas el mismo `<select>` tendría dos nombres accesibles y
        `getByLabelText(/proyecto/i)` podría fallar por duplicado.
      */}
      <select name="proyectoId" aria-label="Proyecto" className="w-full rounded-lg px-2 py-1 text-xs">
        <option value="">— proyecto —</option>
        {proyectos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <select name="clienteId" aria-label="Cliente" className="w-full rounded-lg px-2 py-1 text-xs">
        <option value="">— cliente —</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium disabled:opacity-50"
        style={{ background: "var(--cristal-fondo-denso)" }}
      >
        <Play size={14} aria-hidden="true" />
        Empezar
      </button>
    </form>
  );
}
