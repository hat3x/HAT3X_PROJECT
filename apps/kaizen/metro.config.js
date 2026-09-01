// Configuracion de Metro: lo unico que hace es el cambiazo de la piel personal.
//
// Con `KAIZEN_SKIN=1`, cualquier import de `./personal` dentro de
// `src/design/temas/` se resuelve a `personal.skin.ts`, que vive fuera del
// control de versiones junto con su arte.
//
// Es lo que permite cumplir el §7.3 del spec —dos binarios, no un
// interruptor— sin duplicar codigo: el perfil `tienda` compila
// `personal.ts`, que devuelve `null`, y sin `KAIZEN_SKIN=1` la piel no se
// resuelve, asi que no puede colarse en el paquete publico.
//
// Sus ficheros SI estan en el repositorio (es la copia de seguridad del
// proyecto). La garantia es esta variable de entorno, no su ausencia.
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

if (process.env.KAIZEN_SKIN === '1') {
  const resolverPorDefecto = config.resolver.resolveRequest
  config.resolver.resolveRequest = (contexto, nombreModulo, plataforma) => {
    const resolver = resolverPorDefecto ?? contexto.resolveRequest
    if (nombreModulo === './personal') {
      return resolver(contexto, './personal.skin', plataforma)
    }
    return resolver(contexto, nombreModulo, plataforma)
  }
}

module.exports = config
