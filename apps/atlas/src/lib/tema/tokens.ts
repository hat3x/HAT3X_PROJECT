export type Tema = "claro" | "oscuro";
export type Paleta = "zafiro" | "nebulosa" | "oceano" | "grafito" | "crepusculo";

export const PALETAS = [
  "zafiro", "nebulosa", "oceano", "grafito", "crepusculo",
] as const satisfies readonly Paleta[];

/**
 * Una paleta cálida compite visualmente con los colores de estado (ámbar y
 * rojo). El CSS la usa para subir el contraste de los distintivos de estado.
 */
export function esPaletaCalida(paleta: Paleta): boolean {
  return paleta === "crepusculo";
}

export function atributosTema(tema: Tema, paleta: Paleta) {
  return { "data-tema": tema, "data-paleta": paleta } as const;
}
