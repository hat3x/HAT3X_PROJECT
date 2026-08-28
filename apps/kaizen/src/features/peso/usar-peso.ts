import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/datos/supabase'
import { useSesion } from '@/datos/sesion'
import { nuevoId } from '@/datos/mutacion'
import { CLAVE_MUTACION_GUARDAR_PESO } from '@/datos/claves-mutacion'
import { usarFechaDeHoy } from '@/features/dia/usar-fecha-de-hoy'

export type Peso = { fecha_local: string; kg: number }

/** Cuántas pesadas trae el histórico. Suficiente para ver la tendencia de meses. */
const LIMITE_HISTORICO = 180

export function usarPeso() {
  const { sesion } = useSesion()
  const id = sesion?.user.id
  const fecha = usarFechaDeHoy()
  const clienteConsultas = useQueryClient()

  const historico = useQuery({
    queryKey: ['pesos', id],
    enabled: !!id,
    queryFn: async (): Promise<Peso[]> => {
      const { data, error } = await supabase
        .from('pesos')
        .select('fecha_local, kg')
        .order('fecha_local', { ascending: false })
        .limit(LIMITE_HISTORICO)
      if (error) throw new Error(error.message)
      // `kg` es `numeric` en la base. PostgREST lo devuelve como número cuando
      // cabe, pero no está garantizado para valores grandes: se fuerza aquí en
      // vez de confiar, porque un string colándose rompería cualquier resta.
      return (data ?? []).map((f) => ({ fecha_local: f.fecha_local, kg: Number(f.kg) }))
    },
  })

  const mutacion = useMutation({
    mutationKey: CLAVE_MUTACION_GUARDAR_PESO,
    mutationFn: async (variables: { id: string; fila: Record<string, unknown> }) => {
      // Por `user_id,fecha_local` y NO por `id`: la tabla tiene un único peso
      // por día, así que pesarse dos veces la misma mañana corrige el valor en
      // vez de fallar por clave duplicada. De paso, esto hace idempotente el
      // reintento sin depender del `id`.
      const { error } = await supabase
        .from('pesos')
        .upsert(variables.fila, { onConflict: 'user_id,fecha_local' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: ['pesos', id] }),
  })

  const lista = historico.data ?? []

  return {
    historico: lista,
    ultimo: lista[0] ?? null,
    // La tabla viene ordenada de más nuevo a más viejo, así que el primero es
    // el de hoy solo si su fecha lo es. Sin esta comprobación, el campo saldría
    // relleno con la pesada de la semana pasada como si fuera de esta mañana.
    deHoy: lista[0]?.fecha_local === fecha ? lista[0] : null,
    cargando: historico.isPending || !fecha,
    guardar: (kg: number) => {
      if (!id || !fecha) return Promise.resolve()
      return mutacion.mutateAsync({
        id,
        fila: { id: nuevoId(), user_id: id, fecha_local: fecha, kg },
      })
    },
    guardando: mutacion.isPending,
    errorAlGuardar: mutacion.isError ? 'No hemos podido guardar el peso. Inténtalo de nuevo.' : null,
  }
}
