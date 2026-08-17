import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (peticion) => {
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
  // Si el listado o el borrado fallan, se aborta AQUÍ, antes de tocar
  // auth.users: borrar el usuario y dejar ficheros huérfanos sería peor que
  // no borrar nada, porque ya no quedaría dueño al que reclamárselos.
  const { data: ficheros, error: errorListado } = await admin.storage.from('fotos').list(id)
  if (errorListado) return new Response(errorListado.message, { status: 500 })

  if (ficheros?.length) {
    const { error: errorFicheros } = await admin.storage
      .from('fotos')
      .remove(ficheros.map((f) => `${id}/${f.name}`))
    if (errorFicheros) return new Response(errorFicheros.message, { status: 500 })
  }

  const { error: errorBorrado } = await admin.auth.admin.deleteUser(id)
  if (errorBorrado) return new Response(errorBorrado.message, { status: 500 })

  return new Response('ok', { status: 200 })
})
