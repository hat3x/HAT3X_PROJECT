import type { Tema } from '../tema'

/**
 * Hueco de la piel personal. En el codigo publico vale `null` SIEMPRE.
 *
 * El spec (§7.3) es explicito: la piel personal no es un interruptor dentro de
 * la app publica. Si sus recursos estan en el paquete, estan distribuidos
 * aunque el tema este apagado, y un interruptor es algo que se puede acabar
 * encendiendo.
 *
 * El perfil `personal` de EAS pone `KAIZEN_SKIN=1`, y entonces `metro.config.js`
 * resuelve este modulo a `personal.skin.ts`, que esta fuera del control de
 * versiones junto con su arte. El perfil `tienda` compila este fichero tal cual
 * y no puede incluir la piel ni por accidente: sus ficheros no existen en el
 * repositorio.
 */
export const temaPersonal: Tema | null = null
