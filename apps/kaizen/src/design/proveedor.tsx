import { createContext, useContext, type ReactNode } from 'react'
import type { Tema } from './tema'
import { TEMAS } from './temas/indice'

const Contexto = createContext<Tema>(TEMAS.defecto!)

export function ProveedorTema({ nombre, children }: { nombre: string; children: ReactNode }) {
  const tema = TEMAS[nombre] ?? TEMAS.defecto!
  return <Contexto.Provider value={tema}>{children}</Contexto.Provider>
}

export function useTema(): Tema {
  return useContext(Contexto)
}
