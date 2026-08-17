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
