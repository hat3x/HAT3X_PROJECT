import type { Tema } from '../tema'
import { temaDefecto } from './defecto'
import { temaClaro } from './claro'
import { temaPersonal } from './personal'

/**
 * Temas disponibles en ESTA compilación.
 *
 * El perfil `personal` de EAS añade aquí su propio tema desde un directorio
 * fuera del control de versiones. El perfil `tienda` nunca lo incluye.
 */
export const TEMAS: Record<string, Tema> = {
  defecto: temaDefecto,
  claro: temaClaro,
  // Solo existe cuando metro ha resuelto `./personal` al fichero de la piel,
  // que es lo que hace el perfil `personal` de EAS. En cualquier otra
  // compilacion esto es un objeto vacio.
  ...(temaPersonal ? { [temaPersonal.nombre]: temaPersonal } : {}),
}
