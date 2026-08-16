//
// Decide cuántas notificaciones salen de un puñado de incidencias. Es lo que
// separa una herramienta útil de una que acabas silenciando.
//
// Lógica pura: sin red, sin base de datos, sin reloj. No importa NADA, porque la
// Edge Function `avisar` la reutiliza sobre Deno.
//

export type SucesoAviso = {
  incidenciaId: string;
  proyectoId: string;
  proyectoNombre: string;
  servicioNombre: string;
  tipo: "apertura" | "recuperacion";
  /** ISO 8601 */
  abiertaEn: string;
  causa: string | null;
};

export type Aviso = {
  proyectoId: string;
  proyectoNombre: string;
  tipo: "apertura" | "recuperacion";
  incidenciaIds: string[];
  titulo: string;
  cuerpo: string;
};

function redactar(grupo: SucesoAviso[]): { titulo: string; cuerpo: string } {
  const primero = grupo[0]!;
  const participio = primero.tipo === "apertura" ? "caído" : "recuperado";

  if (grupo.length === 1) {
    return {
      titulo: `${primero.proyectoNombre}: ${primero.servicioNombre} ${participio}`,
      cuerpo:
        primero.tipo === "apertura"
          ? (primero.causa ?? "Sin detalle del error")
          : "Vuelve a responder",
    };
  }

  const plural = primero.tipo === "apertura" ? "caídos" : "recuperados";
  return {
    titulo: `${primero.proyectoNombre}: ${grupo.length} servicios ${plural}`,
    cuerpo: grupo.map((s) => s.servicioNombre).join(", "),
  };
}

/**
 * Agrupa por proyecto y tipo, dentro de una ventana temporal.
 *
 * Aperturas y recuperaciones nunca se mezclan: son noticias opuestas y juntarlas
 * daría un mensaje incomprensible.
 *
 * La ventana se mide desde el PRIMERO del grupo, no desde el anterior. Si se
 * midiera en cadena, una caída lenta y progresiva iría absorbiendo sucesos sin
 * fin y acabaría en un solo aviso enorme que llega tardísimo.
 */
export function agrupar(sucesos: SucesoAviso[], ventanaMs: number): Aviso[] {
  // Se ordena por instante para que el resultado no dependa del orden en que
  // los devolvió la consulta.
  const ordenados = [...sucesos].sort((a, b) => a.abiertaEn.localeCompare(b.abiertaEn));

  const grupos: SucesoAviso[][] = [];

  for (const s of ordenados) {
    const grupo = grupos.find((g) => {
      const cabeza = g[0]!;
      return (
        cabeza.proyectoId === s.proyectoId &&
        cabeza.tipo === s.tipo &&
        new Date(s.abiertaEn).getTime() - new Date(cabeza.abiertaEn).getTime() <=
          ventanaMs
      );
    });
    if (grupo) grupo.push(s);
    else grupos.push([s]);
  }

  return grupos.map((g) => {
    const cabeza = g[0]!;
    return {
      proyectoId: cabeza.proyectoId,
      proyectoNombre: cabeza.proyectoNombre,
      tipo: cabeza.tipo,
      incidenciaIds: g.map((s) => s.incidenciaId),
      ...redactar(g),
    };
  });
}
