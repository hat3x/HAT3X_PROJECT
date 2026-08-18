import {
  traducirProducto, traducirResultados, energiaEnKcal, primeraMarca,
} from './open-food-facts'

const YOGUR = {
  code: '8410128750114',
  product_name: 'Yogur griego natural',
  brands: 'Hacendado,Mercadona',
  nutriments: {
    'energy-kcal_100g': 97,
    proteins_100g: 9,
    carbohydrates_100g: 3.6,
    fat_100g: 5,
  },
}

describe('traducir un producto', () => {
  it('coge nombre, marca y los valores por 100 g', () => {
    expect(traducirProducto(YOGUR)).toEqual({
      codigo: '8410128750114',
      nombre: 'Yogur griego natural',
      marca: 'Hacendado',
      kcal_100: 97,
      proteina_100: 9,
      carbos_100: 3.6,
      grasas_100: 5,
    })
  })

  // La ficha global suele venir en ingles o frances aunque el producto se venda
  // aqui, y leer «Greek style yoghurt» en una app en espanol chirria.
  it('prefiere el nombre en espanol cuando existe', () => {
    const producto = { ...YOGUR, product_name_es: 'Yogur griego' }
    expect(traducirProducto(producto)!.nombre).toBe('Yogur griego')
  })

  // La base es colaborativa: hay fichas sin nombre y sin energia. Ensenarlas
  // daria resultados que al tocarlos suman cero calorias.
  it('descarta lo que no sirve para registrar', () => {
    expect(traducirProducto({ ...YOGUR, product_name: '', product_name_es: '', generic_name: '' })).toBeNull()
    expect(traducirProducto({ ...YOGUR, code: '' })).toBeNull()
    expect(traducirProducto({ ...YOGUR, nutriments: {} })).toBeNull()
  })

  // Los macros que faltan si pueden ser cero: un refresco tiene 0 g de grasa de
  // verdad. Lo que no puede faltar es la energia.
  it('un macro ausente es cero, no descarta el producto', () => {
    const soloEnergia = { ...YOGUR, nutriments: { 'energy-kcal_100g': 42 } }
    expect(traducirProducto(soloEnergia)).toMatchObject({
      kcal_100: 42, proteina_100: 0, carbos_100: 0, grasas_100: 0,
    })
  })
})

describe('la energia venga como venga', () => {
  it('en kcal se usa tal cual', () => {
    expect(energiaEnKcal({ 'energy-kcal_100g': 250 })).toBe(250)
  })

  // Muchos productos europeos solo traen kilojulios.
  it('en kilojulios se convierte', () => {
    expect(energiaEnKcal({ 'energy-kj_100g': 418.4 })).toBeCloseTo(100, 5)
    expect(energiaEnKcal({ energy_100g: 418.4 })).toBeCloseTo(100, 5)
  })

  it('se prefiere kcal cuando estan los dos, para no arrastrar el redondeo', () => {
    expect(energiaEnKcal({ 'energy-kcal_100g': 100, 'energy-kj_100g': 900 })).toBe(100)
  })

  it('sin energia devuelve nulo, no cero: cero mentiria en el total del dia', () => {
    expect(energiaEnKcal({})).toBeNull()
    expect(energiaEnKcal({ 'energy-kcal_100g': 0 })).toBeNull()
    expect(energiaEnKcal({ 'energy-kcal_100g': 'no' })).toBeNull()
  })
})

describe('marca', () => {
  it('se queda con la primera de la lista', () => {
    expect(primeraMarca('Hacendado,Mercadona')).toBe('Hacendado')
  })

  it('sin marca es nulo, no cadena vacia', () => {
    expect(primeraMarca(undefined)).toBeNull()
    expect(primeraMarca('')).toBeNull()
    expect(primeraMarca('  ,  ')).toBeNull()
  })
})

describe('la lista de resultados', () => {
  // Open Food Facts devuelve la misma ficha indexada dos veces con cierta
  // frecuencia, y verla repetida da sensacion de error.
  it('no repite el mismo codigo', () => {
    expect(traducirResultados([YOGUR, YOGUR])).toHaveLength(1)
  })

  it('salta lo inservible sin romper el resto', () => {
    const resultados = traducirResultados([
      { code: 'x', product_name: 'Sin energia', nutriments: {} },
      YOGUR,
    ])
    expect(resultados).toHaveLength(1)
    expect(resultados[0]!.nombre).toBe('Yogur griego natural')
  })

  it('sin nada devuelve lista vacia, no revienta', () => {
    expect(traducirResultados([])).toEqual([])
  })
})
