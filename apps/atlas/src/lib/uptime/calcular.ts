//
// Uptime. La cifra que más se mira y la más fácil de romper sin darse cuenta.
//

export type Muestra = { ok: boolean };
export type Agregado = { total: number; ok: number };

/**
 * Une el detalle reciente con los agregados antiguos. La clave está en que
 * ambos aportan al MISMO par de contadores: así la cifra no salta cuando la
 * tarea de retención consolida el detalle en agregados. Si el uptime de 30 días
 * cambiara al purgar, nadie volvería a fiarse del número.
 *
 * Devuelve null cuando no hay ninguna muestra: un servicio recién dado de alta
 * no está al 0 % ni al 100 %, es que no se sabe.
 */
export function calcularUptime(detalle: Muestra[], agregados: Agregado[]): number | null {
  let total = detalle.length;
  let correctos = detalle.filter((m) => m.ok).length;

  for (const a of agregados) {
    total += a.total;
    correctos += a.ok;
  }

  if (total === 0) return null;
  return Math.round((correctos / total) * 1000) / 10;
}

export function formatearUptime(porcentaje: number | null): string {
  if (porcentaje === null) return "sin datos";
  const texto = Number.isInteger(porcentaje)
    ? String(porcentaje)
    : porcentaje.toFixed(1).replace(".", ",");
  return `${texto} %`;
}
