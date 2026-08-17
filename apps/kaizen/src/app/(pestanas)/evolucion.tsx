import { Texto } from '@/design/componentes/texto'
import { Pantalla } from '@/design/componentes/pantalla'
import { useTema } from '@/design/proveedor'

export default function Evolucion() {
  const t = useTema()
  return (
    <Pantalla style={{ justifyContent: 'center', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Evolución</Texto>
      <Texto variante="tenue" style={{ marginTop: t.espaciado[1] }}>
        Cuando lleves unas semanas registrando, aquí verás cómo has cambiado.
      </Texto>
    </Pantalla>
  )
}
