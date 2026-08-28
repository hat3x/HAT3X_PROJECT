import type { ReactNode } from 'react'
import { ProveedorTema } from '@/design/proveedor'
import { usarPerfil } from './usar-perfil'

/**
 * Lee el tema del perfil. Antes de iniciar sesión no hay perfil, así que cae
 * al de por defecto — que es justo lo que debe verse en la pantalla de acceso.
 *
 * Vive en su propio fichero (no inline en `src/app/_layout.tsx`) para que
 * `tema-instantaneo.test.tsx` pueda importar la implementación real y no una
 * copia: una copia no detectaría una rotura en el original.
 */
export function ProveedorTemaDelPerfil({ children }: { children: ReactNode }) {
  const { perfil } = usarPerfil()
  return <ProveedorTema nombre={perfil?.tema ?? 'defecto'}>{children}</ProveedorTema>
}
