import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (peticion) => {
  if (peticion.method !== 'POST') {
    return new Response('Método no permitido', { status: 405 })
  }

  const cabecera = peticion.headers.get('Authorization')
  if (!cabecera) return new Response('Falta autorización', { status: 401 })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // El id de a quién se borra sale SIEMPRE del token verificado por Auth, no
  // de nada que venga en la petición: así nadie puede borrar la cuenta de
  // otra persona aunque manipule el cuerpo o la URL.
  const { data, error } = await admin.auth.getUser(cabecera.replace('Bearer ', ''))
  if (error || !data.user) return new Response('Sesión no válida', { status: 401 })

  const id = data.user.id

  // Los objetos de Storage no se borran en cascada: hay que quitarlos a mano.
  const falloFotos = await borrarFotos(admin, id)
  if (falloFotos) {
    // No se borra el usuario si quedan ficheros: sin dueño en `auth.users`,
    // esas fotos corporales quedarían huérfanas y nadie podría reclamarlas.
    return new Response(`No se han podido borrar las fotos: ${falloFotos}`, { status: 500 })
  }

  const { error: errorBorrado } = await admin.auth.admin.deleteUser(id)
  if (errorBorrado) return new Response(errorBorrado.message, { status: 500 })

  return new Response('ok', { status: 200 })
})

/** `list` devuelve como mucho 100 objetos por llamada. */
const LOTE = 100
/** Tope de seguridad: 100 vueltas son 10.000 ficheros. Evita girar sin fin. */
const VUELTAS_MAX = 100

/**
 * Borra en lotes hasta vaciar la carpeta del usuario. Devuelve el mensaje del
 * fallo, o `null` si terminó limpio.
 *
 * Sin el bucle, alguien con más de 100 fotos —normal tras unos meses de uso
 * diario— vería «cuenta borrada» y dejaría las demás huérfanas para siempre.
 */
async function borrarFotos(
  admin: ReturnType<typeof createClient>,
  id: string,
): Promise<string | null> {
  for (let vuelta = 0; vuelta < VUELTAS_MAX; vuelta++) {
    const { data: ficheros, error } = await admin.storage
      .from('fotos').list(id, { limit: LOTE })
    if (error) return error.message
    if (!ficheros || ficheros.length === 0) return null

    const { error: errorBorrado } = await admin.storage
      .from('fotos').remove(ficheros.map((f) => `${id}/${f.name}`))
    if (errorBorrado) return errorBorrado.message

    // Menos de un lote entero significa que ya no queda nada detrás.
    if (ficheros.length < LOTE) return null
  }
  return `Quedan ficheros tras ${VUELTAS_MAX} lotes; se aborta sin borrar la cuenta.`
}
