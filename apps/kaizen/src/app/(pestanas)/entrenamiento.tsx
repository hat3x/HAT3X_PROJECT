import { Texto } from '@/design/componentes/texto'
import { Pantalla } from '@/design/componentes/pantalla'
import { Vacio } from '@/design/componentes/vacio'
import { useTema } from '@/design/proveedor'

export default function Entrenamiento() {
  const t = useTema()
  return (
    <Pantalla style={{ justifyContent: 'flex-start', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Entreno</Texto>
      <Vacio icono="activity" mensaje="Tus entrenamientos aparecerán aquí en cuanto registres el primero." />
    </Pantalla>
  )
}
