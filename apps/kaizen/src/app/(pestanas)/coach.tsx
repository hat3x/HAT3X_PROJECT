import { Texto } from '@/design/componentes/texto'
import { Pantalla } from '@/design/componentes/pantalla'
import { Vacio } from '@/design/componentes/vacio'
import { useTema } from '@/design/proveedor'

export default function Coach() {
  const t = useTema()
  return (
    <Pantalla style={{ justifyContent: 'flex-start', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Coach</Texto>
      <Vacio icono="message-circle" mensaje="Todavía no tengo datos suficientes sobre ti. Registra unos días y aquí empezaré a decirte cosas que valgan la pena." />
    </Pantalla>
  )
}
