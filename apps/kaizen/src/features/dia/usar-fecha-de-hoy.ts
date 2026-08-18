import { fechaLocal } from '@/dominio/dia'
import { usarPerfil } from '@/features/perfil/usar-perfil'

/**
 * Qué día es «hoy» para esta persona, en formato `AAAA-MM-DD`.
 *
 * No es `new Date()`: el día de la app empieza a la hora de corte que cada uno
 * elige en Ajustes (por defecto las 4 de la mañana), y en su zona horaria, no
 * en la del servidor. Quien cena a la una de la madrugada quiere que esa cena
 * cuente en el día que acaba de vivir, no en el que empieza.
 *
 * Devuelve `null` mientras el perfil no ha llegado: sin zona horaria ni hora de
 * corte no hay forma de saber en qué día estamos, y suponerlo escribiría el
 * registro en el día equivocado. Quien lo consuma debe esperar.
 */
export function usarFechaDeHoy(): string | null {
  const { perfil } = usarPerfil()
  if (!perfil) return null
  return fechaLocal(new Date(), perfil.zona_horaria, perfil.corte_dia)
}
