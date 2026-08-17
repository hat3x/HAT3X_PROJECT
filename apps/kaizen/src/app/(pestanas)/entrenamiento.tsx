import { Texto } from '@/design/componentes/texto'
import { Pantalla } from '@/design/componentes/pantalla'
import { useTema } from '@/design/proveedor'

export default function Entrenamiento() {
  const t = useTema()
  return (
    <Pantalla style={{ justifyContent: 'flex-start', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Entreno</Texto>
      <Texto variante="tenue" style={{ marginTop: t.espaciado[1] }}>
        Tus entrenamientos aparecerán aquí en cuanto registres el primero.
      </Texto>
    </Pantalla>
  )
}
