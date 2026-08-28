"use client";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { guardarApariencia } from "@/lib/db/acciones-apariencia";
import { esPaletaCalida, type Tema, type Paleta } from "@/lib/tema/tokens";

const NOMBRES: Record<Paleta, string> = {
  zafiro: "Zafiro",
  nebulosa: "Nebulosa",
  oceano: "Océano",
  grafito: "Grafito",
  crepusculo: "Crepúsculo",
};

// Muestras solo para la miniatura del selector. La fuente de la verdad son los
// tokens CSS de globals.css; esto es una vista previa, no el tema.
const MUESTRA: Record<Paleta, [string, string]> = {
  zafiro: ["#0071e3", "#00c7be"],
  nebulosa: ["#5e5ce6", "#bf5af2"],
  oceano: ["#0aa2c0", "#1d3f6e"],
  grafito: ["#3a4a63", "#788496"],
  crepusculo: ["#ff9f0a", "#ff375f"],
};

export function SelectorApariencia({
  temaActual,
  paletaActual,
}: {
  temaActual: Tema;
  paletaActual: Paleta;
}) {
  const [tema, setTema] = useState<Tema>(temaActual);
  const [paleta, setPaleta] = useState<Paleta>(paletaActual);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function aplicar(nuevoTema: Tema, nuevaPaleta: Paleta) {
    setTema(nuevoTema);
    setPaleta(nuevaPaleta);
    setError(null);

    // El color cambia YA, sin esperar al servidor. El layout raíz pondrá los
    // mismos atributos al revalidar; esto solo se adelanta al viaje de ida y
    // vuelta para que elegir una paleta se sienta instantáneo.
    document.documentElement.setAttribute("data-tema", nuevoTema);
    document.documentElement.setAttribute("data-paleta", nuevaPaleta);

    empezar(async () => {
      const r = await guardarApariencia(nuevoTema, nuevaPaleta);
      if (!r.ok) {
        setError(r.error);
        // Si no se ha guardado, no se deja la pantalla mintiendo.
        setTema(temaActual);
        setPaleta(paletaActual);
        document.documentElement.setAttribute("data-tema", temaActual);
        document.documentElement.setAttribute("data-paleta", paletaActual);
      }
    });
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend
          className="mb-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--texto-tenue)" }}
        >
          Tema
        </legend>
        <div className="flex gap-2">
          {(["claro", "oscuro"] as const).map((t) => (
            <label
              key={t}
              className="cristal cursor-pointer px-4 py-2 text-sm capitalize focus-within:ring-2"
              style={tema === t ? { background: "var(--cristal-fondo-denso)" } : undefined}
            >
              <input
                type="radio"
                name="tema"
                value={t}
                className="sr-only"
                checked={tema === t}
                onChange={() => aplicar(t, paleta)}
              />
              <span className={tema === t ? "font-semibold" : "opacity-60"}>{t}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend
          className="mb-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--texto-tenue)" }}
        >
          Paleta
        </legend>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(Object.keys(NOMBRES) as Paleta[]).map((p) => {
            const [a, b] = MUESTRA[p];
            const elegida = paleta === p;
            return (
              <label
                key={p}
                className="cristal cursor-pointer overflow-hidden transition-transform hover:scale-[1.02] focus-within:ring-2"
                style={
                  elegida
                    ? { outline: "2px solid var(--texto)", outlineOffset: "1px" }
                    : undefined
                }
              >
                <input
                  type="radio"
                  name="paleta"
                  value={p}
                  className="sr-only"
                  checked={elegida}
                  onChange={() => aplicar(tema, p)}
                />
                <div
                  className="relative h-12"
                  style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
                >
                  {elegida && (
                    <Check
                      size={18}
                      aria-hidden="true"
                      className="absolute right-2 top-2 text-white drop-shadow"
                    />
                  )}
                </div>
                <span
                  className={`block px-3 py-2 text-sm ${elegida ? "font-semibold" : "opacity-70"}`}
                >
                  {NOMBRES[p]}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {esPaletaCalida(paleta) && (
        <p className="cristal p-3 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Esta paleta es cálida y su fondo compite con los colores de alerta. Atlas{" "}
          <strong>compensa el contraste</strong> de los distintivos de estado
          automáticamente, pero si vas a dejar la pantalla puesta todo el día, una
          paleta fría hace que el rojo destaque más.
        </p>
      )}

      <p
        className="text-sm"
        style={{ color: "var(--texto-tenue)" }}
        aria-live="polite"
      >
        {pendiente ? "Guardando…" : " "}
      </p>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
