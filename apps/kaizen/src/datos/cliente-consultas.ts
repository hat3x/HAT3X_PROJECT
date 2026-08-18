import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { QueryClient, onlineManager } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { supabase } from './supabase'
import {
  CLAVE_MUTACION_GUARDAR_PERFIL,
  CLAVE_MUTACION_ANADIR_AGUA,
  CLAVE_MUTACION_GUARDAR_PESO,
  CLAVE_MUTACION_REGISTRAR_ENTRENAMIENTO,
  CLAVE_MUTACION_REGISTRAR_COMIDA,
  CLAVE_MUTACION_GUARDAR_OBJETIVOS,
  CLAVE_MUTACION_GUARDAR_HABITO,
  CLAVE_MUTACION_MARCAR_HABITO,
} from './claves-mutacion'

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((estado) => setOnline(!!estado.isConnected)),
)

export function crearClienteConsultas(): QueryClient {
  const clienteConsultas = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, gcTime: 1000 * 60 * 60 * 24, retry: 2 },
      mutations: { retry: 3, networkMode: 'offlineFirst' },
    },
  })

  // Debe registrarse aquí, de forma síncrona al crear el cliente, y ANTES de
  // que `PersistQueryClientProvider` rehidrate el estado persistido (ver
  // `src/app/_layout.tsx`). Si se registrara dentro de un componente que se
  // monta después, la rehidratación podría llegar antes y la mutación
  // reconstruida se quedaría sin función igualmente. Este mutationFn no
  // puede apoyarse en el `id` de sesión de ningún hook —se ejecuta sin que
  // ningún componente esté montado, potencialmente tras reabrir la app—, así
  // que resuelve su propia sesión antes de escribir.
  clienteConsultas.setMutationDefaults(CLAVE_MUTACION_GUARDAR_PERFIL, {
    mutationFn: async ({ id, cambios }: { id: string; cambios: Record<string, unknown> }) => {
      // `id` es el dueño que encoló el cambio (viaja en las variables
      // persistidas, ver `usar-perfil.ts`) — NO la sesión activa ahora
      // mismo. Sin esta comprobación: el usuario A encola un cambio sin
      // conexión, su sesión caduca (esa salida no pasa por
      // `purgarCacheLocal`, que solo corre en cerrar-sesión y borrar-cuenta),
      // entra B en el mismo dispositivo, y al recuperar red esto escribiría
      // los campos de A sobre la fila de B con el token de B — RLS no lo
      // frena porque, desde el punto de vista de B, es una escritura propia
      // y legítima.
      const { data } = await supabase.auth.getSession()
      const idActual = data.session?.user.id
      if (!idActual) throw new Error('No hay sesión activa para reanudar este cambio de ajustes.')
      if (idActual !== id) {
        // `resumePausedMutations()` traga este rechazo con un `.catch(noop)`
        // interno (ver `mutationCache.js` de la propia librería instalada):
        // nada en pantalla va a mostrar este mensaje hoy. El estado de la
        // mutación sí queda en "error" para quien la inspeccione, y el
        // `console.error` es la única señal que sobrevive a ese catch —
        // aborta de forma visible, no como un fallo silencioso más.
        console.error(
          '[kaizen] Cambio de ajustes descartado al reanudar: la sesión activa ya no es la que lo encoló.',
        )
        throw new Error('La sesión ha cambiado desde que se encoló este cambio de ajustes.')
      }
      const { error } = await supabase.from('perfiles').update(cambios).eq('id', id)
      if (error) throw new Error(error.message)
    },
  })

  // Mismo razonamiento que arriba, y misma comprobación de dueño: un vaso de
  // agua registrado sin conexión se reproduce cuando vuelve la red, quizá tras
  // reabrir la app y quizá con otra persona dentro. Escribirlo entonces con el
  // token de quien esté ahora le metería agua ajena en su día, y RLS no lo
  // frena porque desde su punto de vista es una escritura propia.
  //
  // El `upsert` con `ignoreDuplicates` es lo que hace seguro reintentar: si la
  // petición original llegó y solo se perdió su respuesta, la fila ya existe
  // con ese mismo `id` generado en el dispositivo y no se duplica.
  clienteConsultas.setMutationDefaults(CLAVE_MUTACION_ANADIR_AGUA, {
    mutationFn: async ({ id, fila }: { id: string; fila: Record<string, unknown> }) => {
      const { data } = await supabase.auth.getSession()
      const idActual = data.session?.user.id
      if (!idActual) throw new Error('No hay sesion activa para reanudar este registro de agua.')
      if (idActual !== id) {
        console.error(
          '[kaizen] Registro de agua descartado al reanudar: la sesion activa ya no es la que lo encolo.',
        )
        throw new Error('La sesion ha cambiado desde que se encolo este registro de agua.')
      }
      const { error } = await supabase
        .from('registros_agua')
        .upsert(fila, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    },
  })

  // Igual que el agua, con una diferencia: el conflicto se resuelve por
  // `user_id,fecha_local` porque la tabla solo admite un peso por dia. Eso hace
  // que reanudar sea seguro sin depender del `id`, y que pesarse dos veces la
  // misma manana corrija el valor en vez de fallar.
  clienteConsultas.setMutationDefaults(CLAVE_MUTACION_GUARDAR_PESO, {
    mutationFn: async ({ id, fila }: { id: string; fila: Record<string, unknown> }) => {
      const { data } = await supabase.auth.getSession()
      const idActual = data.session?.user.id
      if (!idActual) throw new Error('No hay sesion activa para reanudar este peso.')
      if (idActual !== id) {
        console.error(
          '[kaizen] Peso descartado al reanudar: la sesion activa ya no es la que lo encolo.',
        )
        throw new Error('La sesion ha cambiado desde que se encolo este peso.')
      }
      const { error } = await supabase
        .from('pesos')
        .upsert(fila, { onConflict: 'user_id,fecha_local' })
      if (error) throw new Error(error.message)
    },
  })

  // Por `id` y con `ignoreDuplicates`, como el agua: se puede entrenar dos
  // veces el mismo dia y las dos sesiones cuentan, asi que el conflicto no
  // puede ir por (usuario, fecha) como el peso.
  clienteConsultas.setMutationDefaults(CLAVE_MUTACION_REGISTRAR_ENTRENAMIENTO, {
    mutationFn: async ({ id, fila }: { id: string; fila: Record<string, unknown> }) => {
      const { data } = await supabase.auth.getSession()
      const idActual = data.session?.user.id
      if (!idActual) throw new Error('No hay sesion activa para reanudar este entrenamiento.')
      if (idActual !== id) {
        console.error(
          '[kaizen] Entrenamiento descartado al reanudar: la sesion activa ya no es la que lo encolo.',
        )
        throw new Error('La sesion ha cambiado desde que se encolo este entrenamiento.')
      }
      const { error } = await supabase
        .from('entrenamientos')
        .upsert(fila, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    },
  })

  // La comida escribe DOS filas —la comida y su renglon— y las dos son
  // idempotentes por `id`, asi que reanudar no duplica. La comprobacion de
  // dueno es la misma de siempre.
  clienteConsultas.setMutationDefaults(CLAVE_MUTACION_REGISTRAR_COMIDA, {
    mutationFn: async ({ id, comida, item }: {
      id: string
      comida: Record<string, unknown>
      item: Record<string, unknown>
    }) => {
      const { data } = await supabase.auth.getSession()
      const idActual = data.session?.user.id
      if (!idActual) throw new Error('No hay sesion activa para reanudar esta comida.')
      if (idActual !== id) {
        console.error(
          '[kaizen] Comida descartada al reanudar: la sesion activa ya no es la que la encolo.',
        )
        throw new Error('La sesion ha cambiado desde que se encolo esta comida.')
      }
      const conflicto = { onConflict: 'id', ignoreDuplicates: true } as const
      const { error: errorComida } = await supabase.from('comidas').upsert(comida, conflicto)
      if (errorComida) throw new Error(errorComida.message)
      const { error: errorItem } = await supabase.from('comida_items').upsert(item, conflicto)
      if (errorItem) throw new Error(errorItem.message)
    },
  })

  // Los objetivos, con el conflicto por `(user_id, vigente_desde)`: recalcular
  // dos veces el mismo dia corrige la fila en vez de dejar dos vigentes.
  clienteConsultas.setMutationDefaults(CLAVE_MUTACION_GUARDAR_OBJETIVOS, {
    mutationFn: async ({ id, fila }: { id: string; fila: Record<string, unknown> }) => {
      const { data } = await supabase.auth.getSession()
      const idActual = data.session?.user.id
      if (!idActual) throw new Error('No hay sesion activa para reanudar estos objetivos.')
      if (idActual !== id) {
        console.error(
          '[kaizen] Objetivos descartados al reanudar: la sesion activa ya no es la que los encolo.',
        )
        throw new Error('La sesion ha cambiado desde que se encolaron estos objetivos.')
      }
      const { error } = await supabase
        .from('objetivos')
        .upsert(fila, { onConflict: 'user_id,vigente_desde' })
      if (error) throw new Error(error.message)
    },
  })

  // Los habitos: crear es un upsert que ignora duplicados y desactivar es un
  // update. Comparten clave porque son la misma intencion —«guardar el
  // habito»— pero no la misma escritura, y confundirlas hace que desactivar no
  // haga nada.
  clienteConsultas.setMutationDefaults(CLAVE_MUTACION_GUARDAR_HABITO, {
    mutationFn: async ({ id, modo, fila }: {
      id: string
      modo: 'crear' | 'desactivar'
      fila: Record<string, unknown>
    }) => {
      const { data } = await supabase.auth.getSession()
      const idActual = data.session?.user.id
      if (!idActual) throw new Error('No hay sesion activa para reanudar este habito.')
      if (idActual !== id) {
        console.error(
          '[kaizen] Habito descartado al reanudar: la sesion activa ya no es la que lo encolo.',
        )
        throw new Error('La sesion ha cambiado desde que se encolo este habito.')
      }
      if (modo === 'crear') {
        const { error } = await supabase
          .from('habitos')
          .upsert(fila, { onConflict: 'id', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
        return
      }
      const { error } = await supabase
        .from('habitos')
        .update({ activo: false })
        .eq('id', fila.id as string)
      if (error) throw new Error(error.message)
    },
  })

  // Marcar y desmarcar: el conflicto va por `(habito_id, fecha_local)` porque
  // solo hay un registro por habito y dia.
  clienteConsultas.setMutationDefaults(CLAVE_MUTACION_MARCAR_HABITO, {
    mutationFn: async ({ id, fila }: { id: string; fila: Record<string, unknown> }) => {
      const { data } = await supabase.auth.getSession()
      const idActual = data.session?.user.id
      if (!idActual) throw new Error('No hay sesion activa para reanudar esta marca.')
      if (idActual !== id) {
        console.error(
          '[kaizen] Marca de habito descartada al reanudar: la sesion activa ya no es la que la encolo.',
        )
        throw new Error('La sesion ha cambiado desde que se encolo esta marca.')
      }
      const { error } = await supabase
        .from('habitos_registro')
        .upsert(fila, { onConflict: 'habito_id,fecha_local' })
      if (error) throw new Error(error.message)
    },
  })

  return clienteConsultas
}

export const persistidor = createAsyncStoragePersister({ storage: AsyncStorage })

/**
 * Purga la caché local de React Query: el estado en memoria (`clear`) y la
 * copia en disco que escribe el persistidor (`removeClient`). Sin las dos
 * llamadas, el JSON del perfil anterior —nombre, unidades, zona horaria,
 * tema— sigue siendo legible en el dispositivo hasta que se reinstale la
 * app. Se llama en los dos caminos que terminan una sesión: cerrar sesión
 * desde Ajustes y el `signOut()` que sigue al borrado de cuenta.
 */
export async function purgarCacheLocal(clienteConsultas: QueryClient): Promise<void> {
  clienteConsultas.clear()
  await persistidor.removeClient()
}
