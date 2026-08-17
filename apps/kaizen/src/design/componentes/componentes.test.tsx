import { render, screen, fireEvent } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { Line } from 'react-native-svg'
import { ProveedorTema, ContextoTema } from '../proveedor'
import type { Tema } from '../tema'
import { temaDefecto } from '../temas/defecto'
import { Texto } from './texto'
import { Boton } from './boton'
import { Barra } from './barra'
import { Anillo } from './anillo'
import { Pantalla } from './pantalla'

function envolver(nodo: React.ReactNode) {
  return render(<ProveedorTema nombre="defecto">{nodo}</ProveedorTema>)
}

it('el texto toma el color del tema', () => {
  envolver(<Texto>Hola</Texto>)
  expect(screen.getByText('Hola')).toHaveStyle({ color: '#F4F5F2' })
})

it('la etiqueta usa el color tenue y va en mayúsculas', () => {
  envolver(<Texto variante="etiqueta">Agua</Texto>)
  expect(screen.getByText('AGUA')).toHaveStyle({ color: '#98A09A' })
})

it('el botón dispara su acción', () => {
  const alPulsar = jest.fn()
  envolver(<Boton titulo="Registrar" alPulsar={alPulsar} />)
  fireEvent.press(screen.getByText('Registrar'))
  expect(alPulsar).toHaveBeenCalledTimes(1)
})

it('la barra recorta el progreso al 100 por ciento', () => {
  envolver(<Barra progreso={1.8} color="#4ECB9C" />)
  expect(screen.getByTestId('barra-relleno')).toHaveStyle({ width: '100%' })
})

it('la barra no acepta progresos negativos', () => {
  envolver(<Barra progreso={-0.5} color="#4ECB9C" />)
  expect(screen.getByTestId('barra-relleno')).toHaveStyle({ width: '0%' })
})

it('la barra refleja un progreso intermedio', () => {
  envolver(<Barra progreso={0.5} color="#4ECB9C" />)
  expect(screen.getByTestId('barra-relleno')).toHaveStyle({ width: '50%' })
})

it('el anillo se dibuja y anuncia su progreso', () => {
  envolver(<Anillo progreso={0.82}><Texto>82</Texto></Anillo>)
  expect(screen.getByText('82')).toBeTruthy()
  expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(82)
})

it('la pantalla pinta el fondo del tema y no el del sistema', () => {
  envolver(<Pantalla><Texto>Contenido</Texto></Pantalla>)
  const fondo = temaDefecto.fondo.pantalla
  const esperado = fondo.tipo === 'color' ? fondo.valor : ''
  expect(JSON.stringify(screen.toJSON())).toContain(esperado)
})

it('un tema desconocido cae al tema por defecto en vez de romper', () => {
  render(<ProveedorTema nombre="no-existe"><Texto>Hola</Texto></ProveedorTema>)
  expect(screen.getByText('Hola')).toHaveStyle({ color: '#F4F5F2' })
})

// Las recetas alternativas no las activa ningún tema registrado, así que se
// inyecta un tema a mano. Sin estos tests, la mitad del sistema de recetas
// —justo la mitad que usará la piel personal— viajaría sin probar.
describe('recetas que ningún tema registrado activa', () => {
  function conReceta(recetas: Partial<Tema['recetas']>, nodo: React.ReactNode) {
    const tema: Tema = { ...temaDefecto, recetas: { ...temaDefecto.recetas, ...recetas } }
    return render(<ContextoTema.Provider value={tema}>{nodo}</ContextoTema.Provider>)
  }

  it('la barra segmentada enciende los segmentos, no encoge la barra', () => {
    const { toJSON } = conReceta({ barra: 'segmentada' }, <Barra progreso={0.5} color="#4ECB9C" />)
    // Los diez siguen ahí: cinco encendidos y cinco apagados, ocupando el
    // ancho completo. Si el contenedor encogiera, los apagados desaparecerían.
    expect(screen.getAllByTestId('segmento-lleno')).toHaveLength(5)
    expect(screen.getAllByTestId('segmento-vacio')).toHaveLength(5)
    // El recuento por sí solo no basta: un envoltorio intermedio que encoja
    // el ancho seguiría conteniendo los diez segmentos sin que el test lo
    // note. Comprobar sobre el árbol host serializado que los diez cuelgan
    // directamente del contenedor de ancho completo (sin ningún nodo
    // adicional entre medias) es lo que de verdad detecta el encogido.
    const arbol = toJSON()
    if (arbol === null || Array.isArray(arbol)) throw new Error('se esperaba un único nodo raíz')
    expect(arbol.children).toHaveLength(10)
  })

  // Contar segmentos NO basta: los diez siguen existiendo aunque estén
  // comprimidos. La invariante que de verdad hay que fijar es que el
  // contenedor no lleve ancho, porque basta añadírselo —sin reintroducir
  // ningún envoltorio— para reproducir el bug con los contadores en verde.
  it('el contenedor de segmentos nunca lleva ancho propio', () => {
    conReceta({ barra: 'segmentada' }, <Barra progreso={0.5} color="#4ECB9C" />)
    const contenedor = screen.getByTestId('barra-segmentos')
    expect(StyleSheet.flatten(contenedor.props.style).width).toBeUndefined()
  })

  it('la barra anuncia su progreso a un lector de pantalla', () => {
    conReceta({ barra: 'segmentada' }, <Barra progreso={0.4} color="#4ECB9C" />)
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(40)
  })

  it('el anillo medidor dibuja sus marcas de escala', () => {
    const { UNSAFE_root } = conReceta({ anillo: 'medidor' }, <Anillo progreso={0.5} />)
    expect(UNSAFE_root.findAllByType(Line)).toHaveLength(4)
  })
})
