## Tarea 7: Contrato de temas y tema por defecto

**Ficheros:**
- Crear: `apps/kaizen/src/design/tema.ts`
- Crear: `apps/kaizen/src/design/temas/defecto.ts`
- Crear: `apps/kaizen/src/design/temas/indice.ts`
- Test: `apps/kaizen/src/design/temas/contrato.test.ts`

**Interfaces:**
- Produce: `interface Tema`, `temaDefecto: Tema`, `TEMAS: Record<string, Tema>`.

- [ ] **Paso 1: Escribir el test que falla**

`src/design/temas/contrato.test.ts`:

```ts
import { TEMAS } from './indice'

function rutas(objeto: unknown, prefijo = ''): string[] {
  if (objeto === null || typeof objeto !== 'object' || Array.isArray(objeto)) return [prefijo]
  return Object.entries(objeto).flatMap(([clave, valor]) =>
    rutas(valor, prefijo ? `${prefijo}.${clave}` : clave),
  )
}

function valorEn(objeto: unknown, ruta: string): unknown {
  let actual: unknown = objeto
  for (const parte of ruta.split('.')) {
    actual = (actual as Record<string, unknown>)[parte]
  }
  return actual
}

const nombres = Object.keys(TEMAS)

it('hay al menos un tema registrado', () => {
  expect(nombres.length).toBeGreaterThan(0)
})

it('ningún tema deja valores sin definir', () => {
  for (const nombre of nombres) {
    const sinDefinir = rutas(TEMAS[nombre]).filter((r) => valorEn(TEMAS[nombre], r) === undefined)
    expect({ tema: nombre, sinDefinir }).toEqual({ tema: nombre, sinDefinir: [] })
  }
})

it('todos los temas declaran exactamente las mismas claves', () => {
  const referencia = rutas(TEMAS[nombres[0]!]).sort()
  for (const nombre of nombres.slice(1)) {
    expect({ tema: nombre, claves: rutas(TEMAS[nombre]).sort() })
      .toEqual({ tema: nombre, claves: referencia })
  }
})
```

- [ ] **Paso 2: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- contrato.test`
Esperado: FALLA con «Cannot find module './indice'».

- [ ] **Paso 3: Escribir el contrato**

`src/design/tema.ts`:

```ts
import type { ImageSourcePropType } from 'react-native'

export type Recuadro = { arriba: number; izquierda: number; abajo: number; derecha: number }

export type Fondo =
  | { tipo: 'color'; valor: string }
  | { tipo: 'degradado'; desde: string; hasta: string }
  | { tipo: 'recurso'; fuente: ImageSourcePropType; recuadro: Recuadro | null }

export type RecetaBarra = 'continua' | 'segmentada'
export type RecetaAnillo = 'liso' | 'medidor'

export interface Tema {
  nombre: string
  esquema: 'claro' | 'oscuro'

  color: {
    acento: string
    sobreAcento: string
    texto: string
    textoTenue: string
    borde: string
    pista: string
    // Sin esto, la primera pantalla que muestre un error escribe un rojo a
    // mano y la regla del sistema de temas se rompe en su primer uso real.
    peligro: string
    sobrePeligro: string
    proteina: string
    carbos: string
    grasas: string
  }

  radio: { tarjeta: number; boton: number; pastilla: number }

  espaciado: readonly [number, number, number, number, number, number, number, number, number]

  tipografia: {
    familiaTitular: string | null
    familiaCuerpo: string | null
    pesoTitular: '600' | '700' | '800'
    pesoCuerpo: '400' | '500' | '600'
    ajusteLinea: number
    mayusculasEtiquetas: boolean
  }

  fondo: { pantalla: Fondo; velo: string }

  superficie: {
    tarjeta: Fondo
    barraInferior: Fondo
    // El botón necesita `Fondo`, no solo un color: un skin con arte de botón
    // ilustrado no cabe en `color.acento`, y sin esto la pantalla acabaría
    // decidiendo a pelo entre imagen y color plano.
    botonPrimario: Fondo
    botonSecundario: Fondo
    // La Tarea 10 construye el borrado de cuenta y necesita un botón
    // destructivo; sin este campo lo escribiría a mano igual que el error.
    botonPeligro: Fondo
    desenfoque: number
  }

  recetas: { barra: RecetaBarra; anillo: RecetaAnillo }

  decoracion: {
    cabecera: ImageSourcePropType | null
    tarjetaEntrenamiento: ImageSourcePropType | null
    tarjetaMision: ImageSourcePropType | null
  }
}
```

- [ ] **Paso 4: Escribir el tema por defecto y el registro**

`src/design/temas/defecto.ts`:

```ts
import type { Tema } from '../tema'

export const temaDefecto: Tema = {
  nombre: 'defecto',
  esquema: 'oscuro',
  color: {
    acento: '#4ECB9C',
    sobreAcento: '#04120C',
    texto: '#F4F5F2',
    textoTenue: '#98A09A',
    borde: 'rgba(255,255,255,0.10)',
    pista: 'rgba(255,255,255,0.10)',
    peligro: '#E2574C',
    sobrePeligro: '#2A0A07',
    proteina: '#E8A87C',
    carbos: '#7EA8D9',
    grasas: '#D9B26F',
  },
  radio: { tarjeta: 22, boton: 13, pastilla: 20 },
  espaciado: [4, 8, 12, 16, 20, 24, 32, 40, 48],
  tipografia: {
    familiaTitular: null,
    familiaCuerpo: null,
    pesoTitular: '600',
    pesoCuerpo: '500',
    ajusteLinea: 1,
    mayusculasEtiquetas: true,
  },
  fondo: {
    pantalla: { tipo: 'color', valor: '#060807' },
    velo: 'rgba(0,0,0,0)',
  },
  superficie: {
    tarjeta: { tipo: 'degradado', desde: 'rgba(255,255,255,0.085)', hasta: 'rgba(255,255,255,0.038)' },
    barraInferior: { tipo: 'degradado', desde: 'rgba(255,255,255,0.085)', hasta: 'rgba(255,255,255,0.038)' },
    botonPrimario: { tipo: 'color', valor: '#4ECB9C' },
    botonSecundario: { tipo: 'color', valor: 'rgba(255,255,255,0.10)' },
    botonPeligro: { tipo: 'color', valor: '#E2574C' },
    desenfoque: 22,
  },
  recetas: { barra: 'continua', anillo: 'liso' },
  decoracion: { cabecera: null, tarjetaEntrenamiento: null, tarjetaMision: null },
}
```

- [ ] **Paso 5: Escribir el tema claro**

No es decoración: **un sistema de temas con un solo tema no está probado.** El test de claves idénticas es vacío mientras haya uno solo, y el primer skin descubriría los agujeros en producción. Este segundo tema es el que valida el contrato.

`src/design/temas/claro.ts`:

```ts
import type { Tema } from '../tema'

export const temaClaro: Tema = {
  nombre: 'claro',
  esquema: 'claro',
  color: {
    acento: '#1E9E73',
    sobreAcento: '#FFFFFF',
    texto: '#141715',
    textoTenue: '#6B726C',
    borde: 'rgba(0,0,0,0.10)',
    pista: 'rgba(0,0,0,0.08)',
    peligro: '#C0392B',
    sobrePeligro: '#FFFFFF',
    proteina: '#C97A45',
    carbos: '#4A7FBF',
    grasas: '#B08A3C',
  },
  radio: { tarjeta: 22, boton: 13, pastilla: 20 },
  espaciado: [4, 8, 12, 16, 20, 24, 32, 40, 48],
  tipografia: {
    familiaTitular: null,
    familiaCuerpo: null,
    pesoTitular: '600',
    pesoCuerpo: '500',
    ajusteLinea: 1,
    mayusculasEtiquetas: true,
  },
  fondo: {
    pantalla: { tipo: 'color', valor: '#FAF9F7' },
    velo: 'rgba(255,255,255,0)',
  },
  superficie: {
    tarjeta: { tipo: 'degradado', desde: 'rgba(255,255,255,0.92)', hasta: 'rgba(255,255,255,0.75)' },
    barraInferior: { tipo: 'degradado', desde: 'rgba(255,255,255,0.92)', hasta: 'rgba(255,255,255,0.75)' },
    botonPrimario: { tipo: 'color', valor: '#1E9E73' },
    botonSecundario: { tipo: 'color', valor: 'rgba(0,0,0,0.06)' },
    botonPeligro: { tipo: 'color', valor: '#C0392B' },
    desenfoque: 22,
  },
  recetas: { barra: 'continua', anillo: 'liso' },
  decoracion: { cabecera: null, tarjetaEntrenamiento: null, tarjetaMision: null },
}
```

`src/design/temas/indice.ts`:

```ts
import type { Tema } from '../tema'
import { temaDefecto } from './defecto'
import { temaClaro } from './claro'

/**
 * Temas disponibles en ESTA compilación.
 *
 * El perfil `personal` de EAS añade aquí su propio tema desde un directorio
 * fuera del control de versiones. El perfil `tienda` nunca lo incluye.
 */
export const TEMAS: Record<string, Tema> = {
  defecto: temaDefecto,
  claro: temaClaro,
}
```

- [ ] **Paso 6: Ejecutar y comprobar que pasa**

Ejecutar: `npm test -- contrato.test` → PASA con los dos temas registrados.

- [ ] **Paso 7: Comitear**

```bash
git add apps/kaizen/src/design
git commit -m "feat(kaizen): contrato de temas tipado con tema oscuro y claro"
```

---

