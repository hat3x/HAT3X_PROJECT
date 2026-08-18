import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/datos/supabase'
import { useSesion } from '@/datos/sesion'
import { nuevoId } from '@/datos/mutacion'
import { CLAVE_MUTACION_REGISTRAR_COMIDA } from '@/datos/claves-mutacion'
import { usarFechaDeHoy } from '@/features/dia/usar-fecha-de-hoy'
import { sumarMacros, numeroOPorDefecto, type Macros } from '@/dominio/nutricion'

export type ItemComido = Macros & {
  id: string
  nombre: string
  cantidad_g: number
  momento: string
}

/**
 * Objetivos mientras no exista el alta guiada que los calcula (bloque 2). No son
 * datos del usuario disfrazados: son los valores por defecto declarados, y los
 * sustituye la fila de `objetivos` en cuanto exista.
 */
export const OBJETIVOS_POR_DEFECTO = {
  kcal: 2300,
  proteina_g: 170,
  carbos_g: 220,
  grasas_g: 70,
}

export function usarNutricion() {
  const { sesion } = useSesion()
  const id = sesion?.user.id
  const fecha = usarFechaDeHoy()
  const clienteConsultas = useQueryClient()

  const consulta = useQuery({
    queryKey: ['comidas', id, fecha],
    enabled: !!id && !!fecha,
    queryFn: async (): Promise<ItemComido[]> => {
      // Se pregunta por los items y se sube a su comida para filtrar por fecha:
      // el día vive en `comidas` y los macros en `comida_items`, así que sin el
      // `!inner` la fecha no puede filtrar y llegaría el histórico entero.
      const { data, error } = await supabase
        .from('comida_items')
        .select('id, nombre, cantidad_g, kcal, proteina_g, carbos_g, grasas_g, comidas!inner(momento, fecha_local)')
        .eq('comidas.fecha_local', fecha)
      if (error) throw new Error(error.message)
      return (data ?? []).map((f) => {
        // PostgREST devuelve la relación como objeto o como lista de uno según
        // cómo deduzca la cardinalidad; se normaliza aquí en vez de confiar.
        const comida = Array.isArray(f.comidas) ? f.comidas[0] : f.comidas
        return {
          id: f.id,
          nombre: f.nombre,
          cantidad_g: Number(f.cantidad_g),
          momento: (comida as { momento: string } | undefined)?.momento ?? 'snack',
          // `numeric` en la base: se fuerza a número en vez de confiar en que
          // PostgREST lo mande como tal.
          kcal: Number(f.kcal),
          proteina_g: Number(f.proteina_g),
          carbos_g: Number(f.carbos_g),
          grasas_g: Number(f.grasas_g),
        }
      })
    },
  })

  const objetivos = useQuery({
    queryKey: ['objetivos', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('objetivos')
        .select('kcal, proteina_g, carbos_g, grasas_g')
        .order('vigente_desde', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return OBJETIVOS_POR_DEFECTO
      // Campo a campo y con red: `Number(undefined)` es `NaN`, y un `NaN` aqui
      // sale en la pantalla como «1.167 / NaN» y contagia la barra de progreso.
      // Las columnas son `not null` en la base, asi que esto no deberia pasar
      // nunca — pero «no deberia» no es motivo para que la pantalla se rompa si
      // pasa. Visto en una captura.
      return {
        kcal: numeroOPorDefecto(data.kcal, OBJETIVOS_POR_DEFECTO.kcal),
        proteina_g: numeroOPorDefecto(data.proteina_g, OBJETIVOS_POR_DEFECTO.proteina_g),
        carbos_g: numeroOPorDefecto(data.carbos_g, OBJETIVOS_POR_DEFECTO.carbos_g),
        grasas_g: numeroOPorDefecto(data.grasas_g, OBJETIVOS_POR_DEFECTO.grasas_g),
      }
    },
  })

  const mutacion = useMutation({
    mutationKey: CLAVE_MUTACION_REGISTRAR_COMIDA,
    mutationFn: async (variables: {
      id: string
      comida: Record<string, unknown>
      item: Record<string, unknown>
    }) => {
      await escribirComida(variables.comida, variables.item)
    },
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: ['comidas', id, fecha] }),
  })

  const items = consulta.data ?? []

  return {
    items,
    total: sumarMacros(items),
    objetivos: objetivos.data ?? OBJETIVOS_POR_DEFECTO,
    cargando: consulta.isPending || !fecha,
    registrar: (entrada: { momento: string; nombre: string; cantidad_g: number } & Macros) => {
      if (!id || !fecha) return Promise.resolve()
      const idComida = nuevoId()
      return mutacion.mutateAsync({
        id,
        comida: { id: idComida, user_id: id, fecha_local: fecha, momento: entrada.momento },
        item: {
          id: nuevoId(),
          user_id: id,
          comida_id: idComida,
          nombre: entrada.nombre,
          cantidad_g: entrada.cantidad_g,
          kcal: entrada.kcal,
          proteina_g: entrada.proteina_g,
          carbos_g: entrada.carbos_g,
          grasas_g: entrada.grasas_g,
          fuente: 'rapida',
        },
      })
    },
    guardando: mutacion.isPending,
    errorAlGuardar: mutacion.isError ? 'No hemos podido guardar la comida. Inténtalo de nuevo.' : null,
  }
}

/**
 * Escribe la comida y su primer renglón.
 *
 * Van dos inserciones y no una transacción porque PostgREST no las agrupa. Las
 * dos son idempotentes por `id`, así que reintentar no duplica. Si la segunda
 * no llega, queda una comida sin renglones: invisible, porque la consulta parte
 * de `comida_items`. Prefiero ese resto inocuo a una función en la base solo
 * para esto.
 */
export async function escribirComida(
  comida: Record<string, unknown>,
  item: Record<string, unknown>,
): Promise<void> {
  const conflicto = { onConflict: 'id', ignoreDuplicates: true } as const
  const { error: errorComida } = await supabase.from('comidas').upsert(comida, conflicto)
  if (errorComida) throw new Error(errorComida.message)
  const { error: errorItem } = await supabase.from('comida_items').upsert(item, conflicto)
  if (errorItem) throw new Error(errorItem.message)
}
