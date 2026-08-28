import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/datos/supabase'
import { useSesion } from '@/datos/sesion'
import { nuevoId } from '@/datos/mutacion'
import { CLAVE_MUTACION_GUARDAR_HABITO, CLAVE_MUTACION_MARCAR_HABITO } from '@/datos/claves-mutacion'
import { usarFechaDeHoy } from '@/features/dia/usar-fecha-de-hoy'

export type Habito = {
  id: string
  nombre: string
  icono: string | null
  activo: boolean
  orden: number
}

export type HabitoDeHoy = Habito & { hecho: boolean }

export function usarHabitos() {
  const { sesion } = useSesion()
  const id = sesion?.user.id
  const fecha = usarFechaDeHoy()
  const clienteConsultas = useQueryClient()

  const lista = useQuery({
    queryKey: ['habitos', id],
    enabled: !!id,
    queryFn: async (): Promise<Habito[]> => {
      const { data, error } = await supabase
        .from('habitos')
        .select('id, nombre, icono, activo, orden')
        .eq('activo', true)
        .order('orden', { ascending: true })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })

  const marcados = useQuery({
    queryKey: ['habitos-registro', id, fecha],
    enabled: !!id && !!fecha,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('habitos_registro')
        .select('habito_id, hecho')
        .eq('fecha_local', fecha)
      if (error) throw new Error(error.message)
      // Solo los que estan en `true`: desmarcar deja la fila con `hecho: false`
      // en vez de borrarla, para no perder el rastro de que ese dia se toco.
      return (data ?? []).filter((f) => f.hecho).map((f) => f.habito_id)
    },
  })

  // Crear y desactivar comparten clave pero NO operacion: crear es un upsert
  // que ignora duplicados —para poder reintentar sin duplicar— y desactivar es
  // un update. Con el upsert-ignora, desactivar no cambiaria nada: la fila ya
  // existe, asi que se saltaria en silencio. Escrito y corregido antes de que
  // llegara a ninguna pantalla.
  const escribirHabito = useMutation({
    mutationKey: CLAVE_MUTACION_GUARDAR_HABITO,
    mutationFn: async (variables: {
      id: string
      modo: 'crear' | 'desactivar'
      fila: Record<string, unknown>
    }) => {
      if (variables.modo === 'crear') {
        const { error } = await supabase
          .from('habitos')
          .upsert(variables.fila, { onConflict: 'id', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
        return
      }
      const { error } = await supabase
        .from('habitos')
        .update({ activo: false })
        .eq('id', variables.fila.id as string)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: ['habitos', id] }),
  })

  const marcar = useMutation({
    mutationKey: CLAVE_MUTACION_MARCAR_HABITO,
    mutationFn: async (variables: { id: string; fila: Record<string, unknown> }) => {
      // Por `(habito_id, fecha_local)`: marcar y desmarcar el mismo dia corrige
      // la fila. Con el conflicto por `id` fallaria por la clave unica en
      // cuanto se tocara dos veces.
      const { error } = await supabase
        .from('habitos_registro')
        .upsert(variables.fila, { onConflict: 'habito_id,fecha_local' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () =>
      clienteConsultas.invalidateQueries({ queryKey: ['habitos-registro', id, fecha] }),
  })

  const habitos = lista.data ?? []
  const hechos = marcados.data ?? []
  const deHoy: HabitoDeHoy[] = habitos.map((h) => ({ ...h, hecho: hechos.includes(h.id) }))

  return {
    habitos,
    deHoy,
    cuantos: habitos.length,
    cuantosHechos: deHoy.filter((h) => h.hecho).length,
    cargando: lista.isPending || !fecha,
    crear: (nombre: string, icono: string | null) => {
      if (!id) return Promise.resolve()
      return escribirHabito.mutateAsync({
        id,
        modo: 'crear',
        fila: { id: nuevoId(), user_id: id, nombre, icono, orden: habitos.length },
      })
    },
    // Se marca `activo: false` en vez de borrar: los registros pasados cuelgan
    // del habito con `on delete cascade`, asi que borrarlo se llevaria por
    // delante el historico de haberlo cumplido.
    desactivar: (idHabito: string) => {
      if (!id) return Promise.resolve()
      return escribirHabito.mutateAsync({ id, modo: 'desactivar', fila: { id: idHabito } })
    },
    alternar: (habito: HabitoDeHoy) => {
      if (!id || !fecha) return Promise.resolve()
      return marcar.mutateAsync({
        id,
        fila: {
          id: nuevoId(),
          user_id: id,
          habito_id: habito.id,
          fecha_local: fecha,
          hecho: !habito.hecho,
        },
      })
    },
    guardando: escribirHabito.isPending || marcar.isPending,
    errorAlGuardar:
      escribirHabito.isError || marcar.isError
        ? 'No hemos podido guardar el hábito. Inténtalo de nuevo.'
        : null,
  }
}
