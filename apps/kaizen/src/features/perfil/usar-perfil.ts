import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/datos/supabase'
import { useSesion } from '@/datos/sesion'
import { CLAVE_MUTACION_GUARDAR_PERFIL } from '@/datos/claves-mutacion'

export type Perfil = {
  id: string
  nombre: string
  unidades: string
  zona_horaria: string
  corte_dia: number
  hora_silencio: number
  tema: string
}

export function usarPerfil() {
  const { sesion } = useSesion()
  const id = sesion?.user.id
  const clienteConsultas = useQueryClient()

  const consulta = useQuery({
    queryKey: ['perfil', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('perfiles').select('*').single()
      if (error) throw new Error(error.message)
      return data as Perfil
    },
  })

  const mutacion = useMutation({
    // Misma clave que el default registrado en `crearClienteConsultas`: sin
    // ella, una mutación pausada en modo avión se persiste sin forma de
    // recuperar su función al rehidratar (ver AGENTS.md).
    mutationKey: CLAVE_MUTACION_GUARDAR_PERFIL,
    mutationFn: async (cambios: Partial<Perfil>) => {
      const { error } = await supabase.from('perfiles').update(cambios).eq('id', id!)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: ['perfil', id] }),
  })

  return {
    perfil: consulta.data ?? null,
    guardar: (cambios: Partial<Perfil>) => mutacion.mutateAsync(cambios),
    // Sin estos dos, un fallo al guardar es indistinguible de un éxito: la
    // pantalla no tiene de dónde leerlo y el usuario cree que se guardó.
    guardando: mutacion.isPending,
    errorAlGuardar: mutacion.isError
      ? 'No hemos podido guardar el cambio. Inténtalo de nuevo.'
      : null,
  }
}
