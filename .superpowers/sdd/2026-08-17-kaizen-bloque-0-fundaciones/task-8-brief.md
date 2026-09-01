## Tarea 8: Proveedor de tema y componentes base

**Ficheros:**
- Crear: `apps/kaizen/src/design/proveedor.tsx`
- Crear: `apps/kaizen/src/design/componentes/{superficie,texto,boton,anillo,barra}.tsx`
- Test: `apps/kaizen/src/design/componentes/componentes.test.tsx`

**Interfaces:**
- Consume: `Tema`, `TEMAS` de la Tarea 7.
- Produce: `ProveedorTema`, `useTema(): Tema`, `Superficie`, `Texto`, `Boton`, `Anillo`, `Barra`.

- [ ] **Paso 1: Instalar dependencias**

```bash
npx expo install expo-blur react-native-svg expo-linear-gradient
```

- [ ] **Paso 2: Escribir los tests que fallan**

`src/design/componentes/componentes.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native'
import { ProveedorTema } from '../proveedor'
import { Texto } from './texto'
import { Boton } from './boton'
import { Barra } from './barra'

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
    conReceta({ barra: 'segmentada' }, <Barra progreso={0.5} color="#4ECB9C" />)
    expect(screen.getAllByTestId('segmento-lleno')).toHaveLength(5)
    expect(screen.getAllByTestId('segmento-vacio')).toHaveLength(5)
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
```

Los imports que necesita el fichero de test: `ContextoTema` de `../proveedor`, `Anillo` de `./anillo`, `temaDefecto` de `../temas/defecto`, el tipo `Tema` de `../tema`, `Line` de `react-native-svg`, `StyleSheet` de `react-native`, y `render` de la librería de testing.

- [ ] **Paso 3: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- componentes.test`
Esperado: FALLA con «Cannot find module '../proveedor'».

- [ ] **Paso 4: Implementar el proveedor**

`src/design/proveedor.tsx`:

```tsx
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
```

- [ ] **Paso 5: Implementar `Texto`**

`src/design/componentes/texto.tsx`:

```tsx
import { Text, type TextProps } from 'react-native'
import { useTema } from '../proveedor'

type Variante = 'heroe' | 'titulo' | 'cuerpo' | 'etiqueta' | 'tenue'

const TAMANOS: Record<Variante, number> = {
  heroe: 50, titulo: 19, cuerpo: 15, etiqueta: 10, tenue: 12,
}

export function Texto({ variante = 'cuerpo', style, children, ...resto }:
  TextProps & { variante?: Variante }) {
  const t = useTema()
  const esEtiqueta = variante === 'etiqueta'
  const esTitular = variante === 'heroe' || variante === 'titulo'
  const contenido = esEtiqueta && t.tipografia.mayusculasEtiquetas && typeof children === 'string'
    ? children.toUpperCase()
    : children

  return (
    <Text
      {...resto}
      style={[{
        color: esEtiqueta || variante === 'tenue' ? t.color.textoTenue : t.color.texto,
        fontSize: TAMANOS[variante],
        lineHeight: TAMANOS[variante] * 1.35 * t.tipografia.ajusteLinea,
        fontWeight: esTitular ? t.tipografia.pesoTitular : t.tipografia.pesoCuerpo,
        fontFamily: (esTitular ? t.tipografia.familiaTitular : t.tipografia.familiaCuerpo) ?? undefined,
        letterSpacing: esEtiqueta ? 1.3 : 0,
      }, style]}
    >
      {contenido}
    </Text>
  )
}
```

- [ ] **Paso 6: Implementar `Barra`**

`src/design/componentes/barra.tsx`:

```tsx
import { View } from 'react-native'
import { useTema } from '../proveedor'

export function Barra({ progreso, color, alto = 7 }:
  { progreso: number; color: string; alto?: number }) {
  const t = useTema()
  const recortado = Math.min(1, Math.max(0, progreso))

  // `accessible` no es opcional: sin él, React Native recorre los hijos en vez
  // de tratar la vista como una unidad, y ni VoiceOver ni TalkBack llegan a
  // anunciar el rol ni el valor. Las otras dos props quedarían inertes.
  const accesibilidad = {
    accessible: true,
    accessibilityRole: 'progressbar' as const,
    accessibilityValue: { min: 0, max: 100, now: Math.round(recortado * 100) },
  }

  if (t.recetas.barra === 'segmentada') {
    const total = 10
    const llenos = Math.round(recortado * total)
    // El contenedor ocupa el ancho completo y son los segmentos los que se
    // encienden o se apagan. Encoger el contenedor al progreso comprimiría
    // los diez dentro de esa fracción y dejaría el resto de la barra vacío.
    return (
      <View testID="barra-segmentos" {...accesibilidad} style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} testID={i < llenos ? 'segmento-lleno' : 'segmento-vacio'}
                style={{
                  flex: 1, height: alto, borderRadius: 2,
                  backgroundColor: i < llenos ? color : t.color.pista,
                }} />
        ))}
      </View>
    )
  }

  return (
    <View {...accesibilidad}
          style={{ height: alto, borderRadius: alto, backgroundColor: t.color.pista, overflow: 'hidden' }}>
      <View testID="barra-relleno"
            style={{ width: `${recortado * 100}%`, height: '100%', borderRadius: alto, backgroundColor: color }} />
    </View>
  )
}
```

- [ ] **Paso 7: Implementar `Boton`**

`src/design/componentes/boton.tsx`:

```tsx
import { Pressable } from 'react-native'
import { useTema } from '../proveedor'
import { Superficie } from './superficie'
import { Texto } from './texto'

/**
 * El fondo sale de `superficie.botonPrimario`/`botonSecundario`, no de un
 * color: así un tema puede darle arte ilustrado al botón sin que esta
 * pantalla ni ninguna otra tengan que enterarse.
 */
type Tono = 'primario' | 'secundario' | 'peligro'

export function Boton({ titulo, alPulsar, tono = 'primario', deshabilitado = false }:
  { titulo: string; alPulsar: () => void; tono?: Tono; deshabilitado?: boolean }) {
  const t = useTema()
  const fondos: Record<Tono, typeof t.superficie.botonPrimario> = {
    primario: t.superficie.botonPrimario,
    secundario: t.superficie.botonSecundario,
    peligro: t.superficie.botonPeligro,
  }
  const colores: Record<Tono, string> = {
    primario: t.color.sobreAcento,
    secundario: t.color.texto,
    peligro: t.color.sobrePeligro,
  }

  return (
    <Pressable
      onPress={alPulsar}
      accessibilityRole="button"
      disabled={deshabilitado}
      accessibilityState={{ disabled: deshabilitado }}
      style={{ opacity: deshabilitado ? 0.5 : 1 }}
    >
      <Superficie
        fondo={fondos[tono]}
        radio={t.radio.boton}
        style={{
          paddingVertical: t.espaciado[1],
          paddingHorizontal: t.espaciado[2],
          alignItems: 'center',
        }}
      >
        <Texto style={{ color: colores[tono], fontWeight: t.tipografia.pesoTitular }}>
          {titulo}
        </Texto>
      </Superficie>
    </Pressable>
  )
}
```

- [ ] **Paso 8: Implementar `Superficie`**

Es la pieza que permite que un tema pinte una tarjeta con color plano y otro con arte estirable, sin que la pantalla se entere.

`src/design/componentes/superficie.tsx`:

```tsx
import { View, ImageBackground, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import type { Fondo } from '../tema'
import { useTema } from '../proveedor'

export function Superficie({ fondo, radio, style, children }: {
  fondo: Fondo
  radio: number
  style?: ViewStyle
  children?: ReactNode
}) {
  const t = useTema()

  // El borde SOLO se dibuja sobre color y degradado. Cuando el fondo es arte,
  // el marco lo pone la propia imagen: añadirle encima un borde algorítmico
  // que el tema no puede apagar arruinaría cualquier skin ilustrado.
  const base: ViewStyle = { borderRadius: radio, overflow: 'hidden', ...style }
  const conBorde: ViewStyle = { ...base, borderWidth: 1, borderColor: t.color.borde }

  if (fondo.tipo === 'color') {
    return <View style={[conBorde, { backgroundColor: fondo.valor }]}>{children}</View>
  }

  if (fondo.tipo === 'recurso') {
    const r = fondo.recuadro
    return (
      <ImageBackground
        source={fondo.fuente}
        capInsets={r ? { top: r.arriba, left: r.izquierda, bottom: r.abajo, right: r.derecha } : undefined}
        resizeMode="stretch"
        style={base}
        imageStyle={{ borderRadius: radio }}
      >
        {children}
      </ImageBackground>
    )
  }

  return (
    <BlurView
      intensity={t.superficie.desenfoque}
      tint={t.esquema === 'oscuro' ? 'dark' : 'light'}
      style={conBorde}
    >
      {/* Degradado de verdad: pintar solo `desde` haría que el tema declarase
          dos colores y la pantalla mostrase uno. */}
      <LinearGradient colors={[fondo.desde, fondo.hasta]} style={{ flex: 1 }}>
        {children}
      </LinearGradient>
    </BlurView>
  )
}
```

- [ ] **Paso 9: Implementar `Anillo`**

`src/design/componentes/anillo.tsx`:

```tsx
import Svg, { Circle, Line } from 'react-native-svg'
import { View } from 'react-native'
import type { ReactNode } from 'react'
import { useTema } from '../proveedor'

export function Anillo({ progreso, tamano = 168, grosor = 12, children }: {
  progreso: number
  tamano?: number
  grosor?: number
  children?: ReactNode
}) {
  const t = useTema()
  const recortado = Math.min(1, Math.max(0, progreso))
  const centro = tamano / 2
  const radio = centro - grosor / 2 - 6
  const vuelta = 2 * Math.PI * radio

  return (
    <View
      style={{ width: tamano, height: tamano }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(recortado * 100) }}
    >
      <Svg width={tamano} height={tamano}>
        <Circle cx={centro} cy={centro} r={radio} fill="none"
                stroke={t.color.pista} strokeWidth={grosor} />
        <Circle cx={centro} cy={centro} r={radio} fill="none"
                stroke={t.color.acento} strokeWidth={grosor} strokeLinecap="round"
                strokeDasharray={`${vuelta * recortado} ${vuelta}`}
                transform={`rotate(-90 ${centro} ${centro})`} />
        {t.recetas.anillo === 'medidor' &&
          [0, 0.25, 0.5, 0.75].map((fraccion) => {
            const angulo = (fraccion * 2 - 0.5) * Math.PI
            return (
              <Line key={fraccion}
                    x1={centro + Math.cos(angulo) * (radio + grosor / 2 + 1)}
                    y1={centro + Math.sin(angulo) * (radio + grosor / 2 + 1)}
                    x2={centro + Math.cos(angulo) * (radio + grosor / 2 + 5)}
                    y2={centro + Math.sin(angulo) * (radio + grosor / 2 + 5)}
                    stroke={t.color.textoTenue} strokeWidth={2} />
            )
          })}
      </Svg>
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  )
}
```

- [ ] **Paso 10: Implementar `Pantalla`**

Sin esta pieza, `fondo.pantalla` es un campo que ambos temas rellenan y que **nadie usa**: el interruptor claro/oscuro no cambiaría el fondo de ninguna pantalla, y la app se vería sobre el blanco por defecto de React Native incluso con el tema oscuro activo.

`src/design/componentes/pantalla.tsx`:

```tsx
import { View, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { useTema } from '../proveedor'
import { Superficie } from './superficie'

/**
 * Raíz de toda pantalla. Pinta el fondo del tema y su velo, para que ninguna
 * pantalla tenga que saber de qué color es el suyo.
 */
export function Pantalla({ style, children }: { style?: ViewStyle; children?: ReactNode }) {
  const t = useTema()
  return (
    <Superficie fondo={t.fondo.pantalla} radio={0} style={{ flex: 1 }}>
      <View style={[{ flex: 1, backgroundColor: t.fondo.velo }, style]}>{children}</View>
    </Superficie>
  )
}
```

Y su test, en `componentes.test.tsx`:

```tsx
it('la pantalla pinta el fondo del tema y no el del sistema', () => {
  envolver(<Pantalla><Texto>Contenido</Texto></Pantalla>)
  const fondo = temaDefecto.fondo.pantalla
  const esperado = fondo.tipo === 'color' ? fondo.valor : ''
  expect(JSON.stringify(screen.toJSON())).toContain(esperado)
})
```

- [ ] **Paso 11: Ejecutar y comprobar que pasan**

Ejecutar: `npm test -- componentes.test` → PASA
Ejecutar: `npx tsc --noEmit` → sin errores

- [ ] **Paso 12: Comitear**

```bash
git add apps/kaizen/src/design
git commit -m "feat(kaizen): proveedor de tema y componentes base"
```

---

