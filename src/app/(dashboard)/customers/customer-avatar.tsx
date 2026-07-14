import { cn } from "@/lib/utils";

/**
 * Deriva iniciales (1–2 letras) de un nombre completo. Presentacional puro:
 * no lee datos externos, solo transforma la cadena recibida.
 */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

interface CustomerAvatarProps {
  name: string;
  /** `sm` para tablas, `lg` para la cabecera de la ficha. */
  size?: "sm" | "lg";
  className?: string;
}

/**
 * Avatar de iniciales con tinte de marca. Refuerza el reconocimiento visual
 * del cliente en el listado y en la ficha sin depender de imágenes.
 */
export function CustomerAvatar({
  name,
  size = "sm",
  className,
}: CustomerAvatarProps): React.ReactElement {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full",
        "bg-accent font-semibold text-accent-foreground ring-1 ring-inset ring-primary/10",
        size === "sm" ? "h-9 w-9 text-xs" : "h-14 w-14 text-lg",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
