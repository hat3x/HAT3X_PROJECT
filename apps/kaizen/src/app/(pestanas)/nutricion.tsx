import { Texto } from '@/design/componentes/texto'
import { Pantalla } from '@/design/componentes/pantalla'
import { Vacio } from '@/design/componentes/vacio'
import { useTema } from '@/design/proveedor'

export default function Nutricion() {
  const t = useTema()
  return (
    <Pantalla style={{ justifyContent: 'flex-start', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Nutrición</Texto>
      <Vacio icono="coffee" mensaje="Aquí verás tu histórico de comidas. Empieza registrando algo desde el botón +." />
    </Pantalla>
  )
}
