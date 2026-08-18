import {
  porCantidad, sumarMacros, leerGramos, leerNumero, enKcal, enGramos,
  tituloDeMomento, MACROS_CERO, numeroOPorDefecto,
} from './nutricion'

const POLLO = { kcal_100: 165, proteina_100: 31, carbos_100: 0, grasas_100: 3.6 }

describe('convertir «por 100 g» en lo que me he comido', () => {
  it('cien gramos son exactamente lo que dice la etiqueta', () => {
    expect(porCantidad(POLLO, 100)).toEqual({
      kcal: 165, proteina_g: 31, carbos_g: 0, grasas_g: 3.6,
    })
  })

  it('la mitad es la mitad', () => {
    expect(porCantidad(POLLO, 50)).toEqual({
      kcal: 83, proteina_g: 15.5, carbos_g: 0, grasas_g: 1.8,
    })
  })

  // A entero, 4,5 g se convierten en 4 o en 5, y ese error repetido cinco veces
  // al dia desplaza el total lo bastante como para notarse.
  it('los macros guardan un decimal en vez de redondear a entero', () => {
    const aceite = { kcal_100: 884, proteina_100: 0, carbos_100: 15, grasas_100: 100 }
    expect(porCantidad(aceite, 30).carbos_g).toBe(4.5)
  })
})

describe('sumar el dia', () => {
  it('sin nada comido, todo a cero', () => {
    expect(sumarMacros([])).toEqual(MACROS_CERO)
  })

  // Sin la pasada de redondeo final, 0,1 + 0,2 salen 0,30000000000000004 y la
  // tarjeta lo ensenaria tal cual.
  it('no arrastra el resto de la coma flotante', () => {
    const total = sumarMacros([
      { kcal: 10, proteina_g: 0.1, carbos_g: 0.1, grasas_g: 0.1 },
      { kcal: 10, proteina_g: 0.2, carbos_g: 0.2, grasas_g: 0.2 },
    ])
    expect(total).toEqual({ kcal: 20, proteina_g: 0.3, carbos_g: 0.3, grasas_g: 0.3 })
  })
})

describe('leer lo que se teclea', () => {
  it('acepta coma y punto', () => {
    expect(leerNumero('4,5')).toBe(4.5)
    expect(leerNumero('4.5')).toBe(4.5)
  })

  it('el vacio es «no lo he dicho», no cero', () => {
    expect(leerNumero('')).toBeNull()
  })

  it('rechaza negativos: no se come cantidad negativa', () => {
    expect(leerNumero('-5')).toBeNull()
    expect(leerGramos('-100')).toBeNull()
  })

  it('cero gramos no es haber comido algo, y tres kilos no es un plato', () => {
    expect(leerGramos('0')).toBeNull()
    expect(leerGramos('5000')).toBeNull()
    expect(leerGramos('150')).toBe(150)
  })
})

describe('formato', () => {
  it('las kcal llevan separador de miles a la espanola', () => {
    expect(enKcal(1720)).toBe('1.720')
    expect(enKcal(980)).toBe('980')
  })

  it('los gramos redondos no arrastran «,0»', () => {
    expect(enGramos(132)).toBe('132')
    expect(enGramos(4.5)).toBe('4,5')
  })

  it('un momento desconocido se ensena tal cual en vez de desaparecer', () => {
    expect(tituloDeMomento('cena')).toBe('Cena')
    expect(tituloDeMomento('merienda')).toBe('merienda')
  })
})

// Esto no es paranoia: el Home llego a pintar «1.167 / NaN» en una captura
// porque una fila de objetivos venia sin las columnas de macros. Las columnas
// son `not null` en la base, pero «no deberia pasar» no es motivo para que la
// pantalla se rompa si pasa.
describe('ningun dato mal formado puede llegar a la pantalla como NaN', () => {
  it('lo que no es un numero cae al valor por defecto', () => {
    expect(numeroOPorDefecto(undefined, 2300)).toBe(2300)
    expect(numeroOPorDefecto(null, 2300)).toBe(2300)
    expect(numeroOPorDefecto('no soy un numero', 2300)).toBe(2300)
    expect(numeroOPorDefecto(NaN, 2300)).toBe(2300)
    expect(numeroOPorDefecto(Infinity, 2300)).toBe(2300)
  })

  it('un numero de verdad se respeta, tambien si viene como texto', () => {
    expect(numeroOPorDefecto(1900, 2300)).toBe(1900)
    // PostgREST puede mandar `numeric` como cadena.
    expect(numeroOPorDefecto('1900', 2300)).toBe(1900)
    expect(numeroOPorDefecto(0, 2300)).toBe(0)
  })
})
