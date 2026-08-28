import {
  leerMinutos, enDuracion, tituloDeTipo, resumenEntrenamiento,
} from './entrenamiento'

describe('leer los minutos que se escriben', () => {
  it('acepta un entero dentro de las cotas', () => {
    expect(leerMinutos('75')).toBe(75)
  })

  it('vacío no son cero minutos: es «no lo he dicho»', () => {
    expect(leerMinutos('')).toBeNull()
    expect(leerMinutos('   ')).toBeNull()
  })

  it('rechaza decimales: los minutos no se parten', () => {
    expect(leerMinutos('45,5')).toBeNull()
    expect(leerMinutos('45.5')).toBeNull()
  })

  it('rechaza lo que no es una sesión creíble', () => {
    expect(leerMinutos('2')).toBeNull()
    expect(leerMinutos('600')).toBeNull()
    expect(leerMinutos('media hora')).toBeNull()
  })
})

describe('duración legible', () => {
  it('menos de una hora va solo en minutos', () => {
    expect(enDuracion(45)).toBe('45 min')
  })

  it('las horas redondas no arrastran «0 min»', () => {
    expect(enDuracion(120)).toBe('2 h')
  })

  it('lo demás lleva las dos partes', () => {
    expect(enDuracion(75)).toBe('1 h 15 min')
  })
})

it('un tipo que no está en la lista se enseña tal cual en vez de desaparecer', () => {
  expect(tituloDeTipo('fuerza')).toBe('Fuerza')
  expect(tituloDeTipo('natacion')).toBe('natacion')
})

describe('resumen de la tarjeta del Home', () => {
  // Sin este estado, la tarjeta afirma «Pendiente hoy» antes de saberlo y
  // parpadea a otra cosa medio segundo después.
  it('mientras carga no afirma que esté pendiente', () => {
    expect(resumenEntrenamiento(true, [])).toBe('Cargando…')
  })

  it('sin sesiones, pendiente', () => {
    expect(resumenEntrenamiento(false, [])).toBe('Pendiente hoy')
  })

  it('con una, la describe', () => {
    expect(resumenEntrenamiento(false, [{ tipo: 'cardio', duracion_min: 30 }])).toBe('Cardio · 30 min')
  })

  it('sin duración enseña solo el tipo, no un cero', () => {
    expect(resumenEntrenamiento(false, [{ tipo: 'fuerza', duracion_min: null }])).toBe('Fuerza')
  })

  // Listarlas todas desbordaría la tarjeta en cuanto haya tres.
  it('con varias, describe la última y cuenta el resto', () => {
    expect(
      resumenEntrenamiento(false, [
        { tipo: 'cardio', duracion_min: 30 },
        { tipo: 'fuerza', duracion_min: 60 },
      ]),
    ).toBe('Cardio · 30 min · +1 más')
  })
})
