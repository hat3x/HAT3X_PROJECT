import { createContext, useContext, type ReactNode } from 'react'
import type { Tema } from './tema'
import { TEMAS } from './temas/indice'

/**
 * Se exporta para que los tests puedan inyectar un tema construido a mano y
 * ejercitar recetas que ningún tema registrado activa (barra segmentada,
 * anillo medidor). Sin esto, esas ramas no tendrían forma de probarse.
 */
export const ContextoTema = createContext<Tema>(TEMAS.defecto!)

export function ProveedorTema({ nombre, children }: { nombre: string; children: ReactNode }) {
  const tema = TEMAS[nombre] ?? TEMAS.defecto!
  return <ContextoTema.Provider value={tema}>{children}</ContextoTema.Provider>
}

export function useTema(): Tema {
  return useContext(ContextoTema)
}
