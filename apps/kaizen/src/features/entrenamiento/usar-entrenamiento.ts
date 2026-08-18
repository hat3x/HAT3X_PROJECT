import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/datos/supabase'
import { useSesion } from '@/datos/sesion'
import { nuevoId } from '@/datos/mutacion'
import { CLAVE_MUTACION_REGISTRAR_ENTRENAMIENTO } from '@/datos/claves-mutacion'
import { usarFechaDeHoy } from '@/features/dia/usar-fecha-de-hoy'

export type Entrenamiento = {
  id: string
  fecha_local: string
  tipo: string
  duracion_min: number | null
}

/** Cuántas sesiones trae el histórico de la pestaña. */
const LIMITE_HISTORICO = 120

export function usarEntrenamiento() {
  const { sesion } = useSesion()
  const id = sesion?.user.id
  const fecha = usarFechaDeHoy()
  const clienteConsultas = useQueryClient()

  const historico = useQuery({
    queryKey: ['entrenamientos', id],
    enabled: !!id,
    queryFn: async (): Promise<Entrenamiento[]> => {
      const { data, error } = await supabase
        .from('entrenamientos')
        .select('id, fecha_local, tipo, duracion_min')
        .order('fecha_local', { ascending: false })
        .order('registrado_en', { ascending: false })
        .limit(LIMITE_HISTORICO)
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })

  const mutacion = useMutation({
    mutationKey: CLAVE_MUTACION_REGISTRAR_ENTRENAMIENTO,
    mutationFn: async (variables: { id: string; fila: Record<string, unknown> }) => {
      // Por `id` como el agua, y no por (usuario, fecha) como el peso: aquí sí
      // se puede entrenar dos veces el mismo día, y las dos sesiones cuentan.
      const { error } = await supabase
        .from('entrenamientos')
        .upsert(variables.fila, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: ['entrenamientos', id] }),
  })

  const lista = historico.data ?? []

  return {
    historico: lista,
    // Todas las de hoy, no solo la primera: quien hace pesas por la mañana y
    // corre por la tarde ha entrenado dos veces, y el Home tiene que decirlo.
    deHoy: lista.filter((e) => e.fecha_local === fecha),
    cargando: historico.isPending || !fecha,
    registrar: (tipo: string, duracionMin: number | null) => {
      if (!id || !fecha) return Promise.resolve()
      return mutacion.mutateAsync({
        id,
        fila: {
          id: nuevoId(),
          user_id: id,
          fecha_local: fecha,
          tipo,
          duracion_min: duracionMin,
        },
      })
    },
    guardando: mutacion.isPending,
    errorAlGuardar: mutacion.isError
      ? 'No hemos podido guardar el entrenamiento. Inténtalo de nuevo.'
      : null,
  }
}
