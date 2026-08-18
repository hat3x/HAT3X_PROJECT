import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/datos/supabase'
import { useSesion } from '@/datos/sesion'
import { nuevoId } from '@/datos/mutacion'
import { CLAVE_MUTACION_GUARDAR_OBJETIVOS } from '@/datos/claves-mutacion'
import { usarFechaDeHoy } from '@/features/dia/usar-fecha-de-hoy'
import type { Propuesta, Objetivo } from '@/dominio/objetivos'

export function usarObjetivos() {
  const { sesion } = useSesion()
  const id = sesion?.user.id
  const fecha = usarFechaDeHoy()
  const clienteConsultas = useQueryClient()

  const consulta = useQuery({
    queryKey: ['objetivos', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('objetivos')
        .select('vigente_desde, kcal, origen')
        .order('vigente_desde', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })

  const mutacion = useMutation({
    mutationKey: CLAVE_MUTACION_GUARDAR_OBJETIVOS,
    mutationFn: async (variables: { id: string; fila: Record<string, unknown> }) => {
      // Por `(user_id, vigente_desde)`: recalcular dos veces el mismo dia
      // corrige la fila en vez de dejar dos vigentes a la vez, que es lo que
      // haria el conflicto por `id` con la clave unica de la tabla.
      const { error } = await supabase
        .from('objetivos')
        .upsert(variables.fila, { onConflict: 'user_id,vigente_desde' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      // Se invalidan las tres consultas que leen objetivos: la de esta pantalla,
      // la de nutricion y la de agua. Sin esto el Home sigue con los genericos
      // hasta que caduque la cache.
      clienteConsultas.invalidateQueries({ queryKey: ['objetivos'] })
      clienteConsultas.invalidateQueries({ queryKey: ['objetivo-agua'] })
    },
  })

  return {
    // `null` mientras carga, para poder distinguirlo de «no hay ninguno».
    hayObjetivos: consulta.isPending ? null : consulta.data !== null && consulta.data !== undefined,
    guardar: (propuesta: Propuesta, objetivo: Objetivo, origen: 'auto' | 'manual') => {
      if (!id || !fecha) return Promise.resolve()
      return mutacion.mutateAsync({
        id,
        fila: {
          id: nuevoId(),
          user_id: id,
          // Vigente desde hoy: el histórico anterior no se reescribe, que es lo
          // que permitirá mas adelante ver con que objetivos se vivio cada mes.
          vigente_desde: fecha,
          kcal: propuesta.kcal,
          proteina_g: propuesta.proteinaG,
          carbos_g: propuesta.carbosG,
          grasas_g: propuesta.grasasG,
          agua_ml: propuesta.aguaMl,
          objetivo,
          origen,
        },
      })
    },
    guardando: mutacion.isPending,
    errorAlGuardar: mutacion.isError
      ? 'No hemos podido guardar tus objetivos. Inténtalo de nuevo.'
      : null,
  }
}
