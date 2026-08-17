/**
 * Devuelve el día (YYYY-MM-DD) al que cuenta un instante, según la zona
 * horaria del usuario y su corte de día.
 *
 * Con corte a las 4, todo lo registrado entre las 00:00 y las 03:59 cuenta
 * como el día anterior.
 */
export function fechaLocal(
  instante: Date,
  zonaHoraria: string,
  corteHora: number,
): string {
  const desplazado = new Date(instante.getTime() - corteHora * 3_600_000)
  const formateador = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formateador.format(desplazado)
}
