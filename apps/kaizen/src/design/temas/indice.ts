import type { Tema } from '../tema'
import { temaDefecto } from './defecto'
import { temaClaro } from './claro'

/**
 * Temas disponibles en ESTA compilación.
 *
 * El perfil `personal` de EAS añade aquí su propio tema desde un directorio
 * fuera del control de versiones. El perfil `tienda` nunca lo incluye.
 */
export const TEMAS: Record<string, Tema> = {
  defecto: temaDefecto,
  claro: temaClaro,
}
