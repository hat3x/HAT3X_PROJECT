"use client";
import { useState, useTransition } from "react";
import { LayoutGrid, Rows3, Building2 } from "lucide-react";
import { guardarVista } from "@/lib/db/acciones-resumen";
import type { VistaResumen } from "@/lib/db/perfil";

const VISTAS = [
  { id: "control", etiqueta: "Sala de control", Icono: LayoutGrid },
  { id: "lista", etiqueta: "Lista", Icono: Rows3 },
  { id: "oficina", etiqueta: "Oficina", Icono: Building2 },
] as const;

/**
 * No cambia de página: cambia de representación. Por eso es estado de cliente y
 * no una ruta distinta — los mismos datos, contados de otra manera.
 */
export function Conmutador({ actual }: { actual: VistaResumen }) {
  const [vista, setVista] = useState<VistaResumen>(actual);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function cambiar(nueva: VistaResumen) {
    setVista(nueva);
    setError(null);
    empezar(async () => {
      const r = await guardarVista(nueva);
      if (!r.ok) {
        setError(r.error);
        setVista(actual); // no se deja la pantalla mintiendo
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <fieldset className="cristal flex gap-0.5 p-0.5">
        <legend className="sr-only">Cómo ver el resumen</legend>
        {VISTAS.map(({ id, etiqueta, Icono }) => (
          <label
            key={id}
            title={etiqueta}
            className="cursor-pointer rounded-lg px-2.5 py-1.5 text-sm transition-colors focus-within:ring-2"
            style={vista === id ? { background: "var(--cristal-fondo-denso)" } : undefined}
          >
            <input
              type="radio"
              name="vista-resumen"
              value={id}
              className="sr-only"
              checked={vista === id}
              disabled={pendiente}
              onChange={() => cambiar(id)}
            />
            <span
              className={`flex items-center gap-1.5 ${
                vista === id ? "font-semibold" : "opacity-60"
              }`}
            >
              <Icono size={15} aria-hidden="true" />
              <span className="hidden sm:inline">{etiqueta}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
