// COPIA de src/lib/horas/abiertos.ts — NO editar aquí.
// Si cambias el original, vuelve a copiarlo.
// El test copias.test.ts falla si divergen.
//
// Qué fichaje lleva abierto demasiado tiempo. Sin base, sin red, sin reloj:
// el instante entra por parámetro.
//
// ESTE FICHERO SE COPIA BYTE A BYTE a `supabase/functions/avisar/fichajes.ts`.
// Por eso no importa nada ni usa `Intl`: Deno no resuelve el alias `@/` y la
// copia la vigila `src/tests/vigia/copias.test.ts`.
//

/**
 * A partir de aquí se avisa. Una jornada larga son diez horas; más, un olvido.
 *
 * La salida rápida de `atlas_disparar_fichajes()` usa el mismo número en SQL
 * (`interval '10 hours'`, en la migración ya aplicada `20260830110000_aviso_fichaje.sql`);
 * si cambia uno, cambia el otro: si el SQL corta más tarde que este número, se
 * avisa más tarde de lo que promete la pantalla; si corta antes, la Edge
 * Function recibe invocaciones vacías que no encuentran nada que avisar.
 */
export const AVISO_HORAS = 10;

/**
 * A partir de aquí ya no se cuenta. Un fichaje abierto desde el lunes no son
 * 26 horas de trabajo: son un olvido, y contarlas inflaría el coste del
 * cliente. El tramo sigue abierto —hay que cerrarlo y corregir el fin— pero
 * los minutos que se suman se paran aquí.
 */
export const TOPE_HORAS = 16;

export type Abierto = {
  id: string;
  usuarioId: string;
  /** ISO con zona. */
  inicio: string;
  proyectoNombre: string | null;
  clienteNombre: string | null;
};

export type AvisoAbierto = {
  fichajeId: string;
  usuarioId: string;
  /** Horas enteras, hacia abajo. */
  horas: number;
  titulo: string;
  cuerpo: string;
};

export function abiertosDemasiado(
  abiertos: Abierto[],
  ahoraMs: number,
  limiteHoras: number = AVISO_HORAS
): AvisoAbierto[] {
  const avisos: AvisoAbierto[] = [];
  for (const a of abiertos) {
    const horas = Math.floor((ahoraMs - Date.parse(a.inicio)) / 3_600_000);
    if (horas < limiteHoras) continue;
    const donde =
      a.proyectoNombre || a.clienteNombre
        ? "en " + [a.proyectoNombre, a.clienteNombre].filter(Boolean).join(" · ")
        : "sin asignar";
    avisos.push({
      fichajeId: a.id,
      usuarioId: a.usuarioId,
      horas,
      titulo: `Llevas ${horas} horas fichado ${donde}`,
      // Se dice qué hacer, no solo qué pasa: el aviso sirve para corregir.
      cuerpo: "Si ya no estás trabajando, ciérralo y corrige la hora de fin desde Horas.",
    });
  }
  return avisos;
}
