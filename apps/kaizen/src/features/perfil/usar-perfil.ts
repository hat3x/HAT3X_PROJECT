import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/datos/supabase'
import { useSesion } from '@/datos/sesion'

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
    mutationFn: async (cambios: Partial<Perfil>) => {
      const { error } = await supabase.from('perfiles').update(cambios).eq('id', id!)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: ['perfil', id] }),
  })

  return {
    perfil: consulta.data ?? null,
    guardar: (cambios: Partial<Perfil>) => mutacion.mutateAsync(cambios),
  }
}
