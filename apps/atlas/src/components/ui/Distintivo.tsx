import { cn } from "@/lib/utils";

export type EstadoVisual = "ok" | "aviso" | "caido" | "desconocido";

const TOKEN: Record<EstadoVisual, string> = {
  ok: "var(--estado-ok)",
  aviso: "var(--estado-aviso)",
  caido: "var(--estado-caido)",
  desconocido: "var(--estado-desconocido)",
};

/**
 * El estado NUNCA se comunica solo con color: el texto va siempre, y el
 * `aria-label` lo repite para lectores de pantalla. Las variables
 * --estado-*-alfa suben en las paletas cálidas, donde el fondo compite.
 */
export function Distintivo({
  estado,
  texto,
  className,
}: {
  estado: EstadoVisual;
  texto: string;
  className?: string;
}) {
  const color = TOKEN[estado];
  return (
    <span
      role="status"
      aria-label={`Estado: ${texto}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "text-xs font-semibold whitespace-nowrap border",
        className
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} calc(var(--estado-fondo-alfa) * 100%), transparent)`,
        borderColor: `color-mix(in srgb, ${color} calc(var(--estado-borde-alfa) * 100%), transparent)`,
      }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "currentColor" }}
      />
      {texto}
    </span>
  );
}
