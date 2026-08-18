import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/datos/supabase'
import { useSesion } from '@/datos/sesion'
import { nuevoId } from '@/datos/mutacion'
import { CLAVE_MUTACION_ANADIR_AGUA } from '@/datos/claves-mutacion'
import { usarFechaDeHoy } from '@/features/dia/usar-fecha-de-hoy'

/**
 * Objetivo de agua mientras no exista el alta guiada que lo calcula (bloque 2).
 * No es un dato inventado que se muestre como si fuera del usuario: es el valor
 * por defecto declarado, y lo sustituye el de `objetivos` en cuanto haya fila.
 */
export const OBJETIVO_AGUA_POR_DEFECTO_ML = 2500

export function clavePorDia(fecha: string | null, id: string | undefined) {
  return ['agua', id, fecha] as const
}

export function usarAgua() {
  const { sesion } = useSesion()
  const id = sesion?.user.id
  const fecha = usarFechaDeHoy()
  const clienteConsultas = useQueryClient()

  const consulta = useQuery({
    queryKey: clavePorDia(fecha, id),
    // Sin fecha no se puede preguntar por «hoy» sin arriesgarse a preguntar
    // por el día equivocado. Ver `usarFechaDeHoy`.
    enabled: !!id && !!fecha,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('registros_agua')
        .select('ml')
        .eq('fecha_local', fecha)
      if (error) throw new Error(error.message)
      // La suma se hace aquí y no en la base: son un puñado de filas al día, y
      // pedirlas sueltas deja la caché con lo necesario para deshacer un
      // registro más adelante sin volver a consultar.
      return (data ?? []).reduce((total, fila) => total + fila.ml, 0)
    },
  })

  const objetivo = useQuery({
    queryKey: ['objetivo-agua', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('objetivos')
        .select('agua_ml')
        .order('vigente_desde', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data?.agua_ml ?? OBJETIVO_AGUA_POR_DEFECTO_ML
    },
  })

  const mutacion = useMutation({
    // Misma clave que el default de `crearClienteConsultas`: sin ella, lo que
    // se registre sin conexión se persiste sin forma de recuperar su función
    // al rehidratar y se pierde en silencio (ver AGENTS.md).
    mutationKey: CLAVE_MUTACION_ANADIR_AGUA,
    mutationFn: async (variables: { id: string; fila: Record<string, unknown> }) => {
      const { error } = await supabase.from('registros_agua').upsert(variables.fila, {
        onConflict: 'id',
        ignoreDuplicates: true,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: clavePorDia(fecha, id) }),
  })

  return {
    ml: consulta.data ?? 0,
    objetivoMl: objetivo.data ?? OBJETIVO_AGUA_POR_DEFECTO_ML,
    cargando: consulta.isPending || !fecha,
    // El `id` de la fila se genera AQUÍ, en el dispositivo, no en la base: es
    // lo que permite reintentar sin duplicar cuando la primera petición sí
    // llegó pero su respuesta no. Y el `user_id` viaja en las variables para
    // que el mutationFn de respaldo pueda comprobar, al reanudar tras reabrir
    // la app, que la sesión activa sigue siendo la que encoló el registro.
    anadir: (ml: number) => {
      if (!id || !fecha) return
      mutacion.mutate({
        id,
        fila: { id: nuevoId(), user_id: id, fecha_local: fecha, ml },
      })
    },
    guardando: mutacion.isPending,
    errorAlGuardar: mutacion.isError ? 'No hemos podido guardar el agua. Inténtalo de nuevo.' : null,
  }
}
