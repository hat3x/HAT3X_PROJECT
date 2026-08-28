import { leerKg, fechaCorta, variacion, enKg } from './peso'

describe('leer el peso que se escribe', () => {
  it('acepta la coma, que es lo que da el teclado en español', () => {
    expect(leerKg('78,4')).toBe(78.4)
  })

  it('acepta también el punto', () => {
    expect(leerKg('78.4')).toBe(78.4)
  })

  it('ignora los espacios de alrededor', () => {
    expect(leerKg('  80 ')).toBe(80)
  })

  it('rechaza lo que no es un número', () => {
    expect(leerKg('ochenta')).toBeNull()
    expect(leerKg('')).toBeNull()
  })

  // El dedo gordo: un 7 de más convierte 78 en 780. Sin límites, eso entra en
  // el histórico y deforma la gráfica de meses.
  it('rechaza lo imposible por arriba y por abajo', () => {
    expect(leerKg('780')).toBeNull()
    expect(leerKg('3')).toBeNull()
  })
})

describe('variación respecto a la pesada anterior', () => {
  it('marca la subida con signo más', () => {
    expect(variacion(79.2, 78.4)).toBe('+0,8')
  })

  it('marca la bajada con signo menos', () => {
    expect(variacion(77.6, 78.4)).toBe('−0,8')
  })

  // Sin esto, -0,04 kg saldría como «−0,0»: anunciar una bajada que no existe.
  it('una diferencia que se redondea a cero no lleva signo', () => {
    expect(variacion(78.42, 78.4)).toBe('0,0')
  })

  // Escribir «+0,0» en la pesada más antigua sugiere que se comparó con algo.
  it('la primera pesada no tiene con qué compararse', () => {
    expect(variacion(78.4, undefined)).toBeNull()
  })
})

it('la fecha se lee corta y en español', () => {
  expect(fechaCorta('2026-08-18')).toBe('18 ago')
  expect(fechaCorta('2026-01-01')).toBe('1 ene')
  expect(fechaCorta('2026-12-31')).toBe('31 dic')
})

describe('formato del peso', () => {
  it('siempre un decimal y coma española', () => {
    expect(enKg(78)).toBe('78,0')
    expect(enKg(78.45)).toBe('78,5')
  })
})
