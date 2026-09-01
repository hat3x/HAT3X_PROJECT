## Tarea 10: Borrado real de cuenta

Exigencia del RGPD por tratarse de datos de categoría especial (spec §13). Borrar el usuario de `auth.users` arrastra las tablas por `on delete cascade`, pero **no borra los objetos de Storage**: eso hay que hacerlo explícitamente.

**Ficheros:**
- Crear: `apps/kaizen/supabase/functions/borrar-cuenta/index.ts`
- Crear: `apps/kaizen/src/features/perfil/borrar-cuenta.tsx`
- Test: `apps/kaizen/pruebas/borrado.integracion.test.ts`

**Interfaces:**
- Produce: Edge Function `borrar-cuenta`, que autentica al llamante por su token y borra su propio usuario.

- [ ] **Paso 1: Escribir el test de integración que falla**

`pruebas/borrado.integracion.test.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL!
const ANON = process.env.SUPABASE_ANON_KEY!
const SERVICIO = process.env.SUPABASE_SERVICE_ROLE_KEY!

it('borrar la cuenta elimina al usuario y todos sus datos', async () => {
  const admin = createClient(URL, SERVICIO)
  const correo = `borrar-${Date.now()}@prueba.local`
  const { data } = await admin.auth.admin.createUser({
    email: correo, password: 'contrasena-de-prueba', email_confirm: true,
  })
  const id = data.user!.id

  const cliente = createClient(URL, ANON)
  const { data: acceso } = await cliente.auth.signInWithPassword({
    email: correo, password: 'contrasena-de-prueba',
  })
  await cliente.from('pesos').insert({
    id: crypto.randomUUID(), user_id: id, fecha_local: '2026-08-17', kg: 80,
  })

  const respuesta = await fetch(`${URL}/functions/v1/borrar-cuenta`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${acceso.session!.access_token}` },
  })
  expect(respuesta.status).toBe(200)

  const { data: usuario } = await admin.auth.admin.getUserById(id)
  expect(usuario.user).toBeNull()

  const { count } = await admin.from('pesos').select('*', { count: 'exact', head: true }).eq('user_id', id)
  expect(count).toBe(0)
})
```

- [ ] **Paso 2: Ejecutar y comprobar que falla**

```bash
npx supabase functions serve borrar-cuenta &
npm run test:integracion -- borrado
```
Esperado: FALLA porque la función no existe.

- [ ] **Paso 3: Implementar la Edge Function**

`supabase/functions/borrar-cuenta/index.ts`:

```ts
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
```

- [ ] **Paso 4: Ejecutar y comprobar que pasa**

Ejecutar: `npm run test:integracion -- borrado` → PASA

- [ ] **Paso 4bis: Los tres tests que faltan**

Los tres cubren caminos que hoy solo están respaldados por lectura de código, y uno de ellos es el más frecuente en producción.

**a) Borrar la cuenta de alguien que nunca subió una foto.** Es el caso común —las fotos son opcionales— y es el que rompería si `list` sobre una carpeta vacía devolviera error en vez de una lista vacía. En `borrado.integracion.test.ts`, un test igual al que ya existe pero **sin subir ningún fichero**: la cuenta tiene que borrarse igual, respuesta 200.

**b) Más de un lote de fotos.** Sube **101** ficheros pequeños a la carpeta del usuario y comprueba que tras borrar la cuenta **no queda ninguno**. Es el test que fija la paginación: con la versión de una sola llamada, el fichero 101 sobrevive y este test se pone rojo. Sin él, la corrección no está protegida.

**c) Las dos operaciones de escritura del bucket.** En `aislamiento.integracion.test.ts` ya se comprueba que B no puede **listar** ni **descargar** las fotos de A. Faltan las otras dos, que son las que ejercitan el `with check` de la política: que B no puede **subir** un fichero bajo la carpeta de A, y que B no puede **borrar** un fichero de A. Con solo las de lectura, romper el `with check` en un refactor dejaría la suite en verde.

- [ ] **Paso 5: Crear la pantalla en el perfil**

`src/features/perfil/borrar-cuenta.tsx` — a diferencia del borrado de un registro (que va sin confirmación y con «deshacer»), **este sí pide confirmación escribiendo la palabra BORRAR**, porque es irreversible y no tiene deshacer.

- [ ] **Paso 6: Comitear**

```bash
git add apps/kaizen/supabase/functions apps/kaizen/src/features/perfil apps/kaizen/pruebas
git commit -m "feat(kaizen): borrado real de cuenta con limpieza de Storage"
```

---

