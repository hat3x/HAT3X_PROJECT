import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type Estado = { sesion: Session | null; cargando: boolean }

const Contexto = createContext<Estado>({ sesion: null, cargando: true })

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ sesion: null, cargando: true })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEstado({ sesion: data.session, cargando: false })
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      setEstado({ sesion, cargando: false })
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return <Contexto.Provider value={estado}>{children}</Contexto.Provider>
}

export function useSesion(): Estado {
  return useContext(Contexto)
}
