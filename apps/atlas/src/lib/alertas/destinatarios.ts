//
// Quién recibe qué. Lógica pura, sin un solo import: la Edge Function `avisar`
// la reutiliza sobre Deno, igual que `agrupar.ts`.
//
// La consulta que rellena estas personas vive en `lib/db/personas.ts`: aquí no
// entra nada que hable con la base.
//

export type Persona = {
  id: string;
  esPropietario: boolean;
  /** Proyectos sobre los que tiene permiso, sea editor o lector. */
  proyectos: string[];
};

/**
 * Quién debe enterarse de lo que pasa en un proyecto. El propietario siempre:
 * es su negocio. Los demás, solo lo suyo — recibir alertas de proyectos que no
 * puedes ni abrir no es solo ruido: además filtra qué clientes hay.
 */
export function quienRecibe(proyectoId: string, personas: Persona[]): string[] {
  return personas
    .filter((p) => p.esPropietario || p.proyectos.includes(proyectoId))
    .map((p) => p.id);
}
