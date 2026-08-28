import { MOMENTOS, esMomento } from './tipos'

describe('momentos del día', () => {
  it('incluye los seis momentos', () => {
    expect(MOMENTOS).toEqual([
      'desayuno', 'almuerzo', 'comida', 'merienda', 'cena', 'otro',
    ])
  })

  it('reconoce un momento válido', () => {
    expect(esMomento('cena')).toBe(true)
  })

  it('rechaza un valor que no es un momento', () => {
    expect(esMomento('brunch')).toBe(false)
  })
})
