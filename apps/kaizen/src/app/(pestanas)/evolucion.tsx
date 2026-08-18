import { Texto } from '@/design/componentes/texto'
import { Pantalla } from '@/design/componentes/pantalla'
import { Vacio } from '@/design/componentes/vacio'
import { useTema } from '@/design/proveedor'

export default function Evolucion() {
  const t = useTema()
  return (
    <Pantalla style={{ justifyContent: 'flex-start', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Evolución</Texto>
      <Vacio icono="trending-up" mensaje="Cuando lleves unas semanas registrando, aquí verás cómo has cambiado." />
    </Pantalla>
  )
}
