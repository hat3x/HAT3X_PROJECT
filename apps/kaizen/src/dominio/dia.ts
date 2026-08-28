/**
 * Devuelve el día (YYYY-MM-DD) al que cuenta un instante, según la zona
 * horaria del usuario y su corte de día.
 *
 * Con corte a las 4, todo lo registrado entre las 00:00 y las 03:59 cuenta
 * como el día anterior.
 *
 * Se razona sobre el reloj de pared local y se mueve la fecha de calendario.
 * La alternativa aparente —restar `corteHora` horas al instante absoluto y
 * formatear— es incorrecta: en los dos cambios de hora del año la ventana
 * desplazada cruza la transición y el desfase que se aplica al formatear ya
 * no es el que regía en el instante original, así que el día sale corrido.
 *
 * No valida `corteHora`; se espera 0-12, que es lo que impone la base de datos.
 */
export function fechaLocal(
  instante: Date,
  zonaHoraria: string,
  corteHora: number,
): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante)

  const valor = (tipo: Intl.DateTimeFormatPartTypes): number => {
    const parte = partes.find((p) => p.type === tipo)
    if (!parte) throw new Error(`El formateador no devolvió ${tipo}`)
    return Number(parte.value)
  }

  const fecha = new Date(Date.UTC(valor('year'), valor('month') - 1, valor('day')))
  if (valor('hour') < corteHora) {
    fecha.setUTCDate(fecha.getUTCDate() - 1)
  }
  return fecha.toISOString().slice(0, 10)
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * «Martes, 18 de agosto» a partir de «2026-08-18».
 *
 * Sustituye al «Día 24 · Fase Definición» de la maqueta, que era mentira: sin
 * alta guiada no hay fecha de inicio ni fase, y ponerlas inventadas es peor que
 * no ponerlas. La fecha sí es verdad, y sitúa el día igual de bien.
 *
 * Sin `Intl`, como el resto de formatos de la app: su soporte de locales en
 * Hermes es irregular entre plataformas.
 */
export function fechaLarga(fechaLocal: string): string {
  const [ano, mes, dia] = fechaLocal.split('-').map(Number)
  if (!ano || !mes || !dia) return fechaLocal
  // `Date.UTC` y no `new Date(cadena)`: interpretar la cadena depende de la
  // zona del dispositivo y puede devolver el día anterior.
  const nombreDia = DIAS_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()] ?? ''
  const conMayuscula = nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1)
  return `${conMayuscula}, ${dia} de ${MESES_LARGOS[mes - 1] ?? mes}`
}
