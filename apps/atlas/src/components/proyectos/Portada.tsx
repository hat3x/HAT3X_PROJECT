import { cn } from "@/lib/utils";

const AURORAS = "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))";

/**
 * Cada proyecto tiene su imagen. Si no la tiene, su gradiente. Si tampoco,
 * las auroras de la paleta activa. Nunca un hueco gris: la rejilla de proyectos
 * es lo primero que se ve al entrar y un hueco la estropea entera.
 */
export function Portada({
  portadaUrl,
  gradiente,
  nombre,
  className,
}: {
  portadaUrl: string | null;
  gradiente: string | null;
  nombre: string;
  className?: string;
}) {
  if (portadaUrl) {
    // Portadas subidas por el propietario: sin optimizador, para no atarnos a
    // configurar dominios remotos en next.config.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={portadaUrl}
        alt={nombre}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn("h-full w-full", className)}
      style={{ background: gradiente ?? AURORAS }}
    />
  );
}
