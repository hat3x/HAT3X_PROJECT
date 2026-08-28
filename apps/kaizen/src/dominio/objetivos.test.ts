import {
  calcularObjetivos, metabolismoBasal, objetivoAgua, explicarSuelo,
  MINIMO_KCAL, DEFICIT_MAXIMO, ACTIVIDADES, OBJETIVOS,
  type Entrada,
} from './objetivos'

const JOTA: Entrada = {
  edad: 34, alturaCm: 178, pesoKg: 80,
  sexo: 'hombre', actividad: 'moderada', objetivo: 'perder_grasa',
}

describe('metabolismo basal (Mifflin-St Jeor)', () => {
  it('hombre: 10·kg + 6,25·cm − 5·edad + 5', () => {
    // 800 + 1112,5 − 170 + 5 = 1747,5 -> 1748
    expect(metabolismoBasal(JOTA)).toBe(1748)
  })

  it('mujer: la misma cuenta con −161', () => {
    // 800 + 1112,5 − 170 − 161 = 1581,5 -> 1582
    expect(metabolismoBasal({ ...JOTA, sexo: 'mujer' })).toBe(1582)
  })

  // El spec pide no suponer uno de los dos cuando no se responde.
  it('sin decir el sexo, el punto medio de las dos formulas', () => {
    const hombre = metabolismoBasal({ ...JOTA, sexo: 'hombre' })
    const mujer = metabolismoBasal({ ...JOTA, sexo: 'mujer' })
    expect(metabolismoBasal({ ...JOTA, sexo: 'sin_decir' })).toBe(Math.round((hombre + mujer) / 2))
  })
})

describe('los suelos de seguridad', () => {
  // El caso real: una mujer menuda, sedentaria y con objetivo de perder grasa.
  // El calculo crudo la deja por debajo de lo que gasta en reposo.
  it('nunca por debajo del metabolismo basal', () => {
    const propuesta = calcularObjetivos({
      edad: 55, alturaCm: 150, pesoKg: 48,
      sexo: 'mujer', actividad: 'sedentario', objetivo: 'perder_grasa',
    })
    expect(propuesta.kcal).toBeGreaterThanOrEqual(propuesta.basal)
  })

  it('nunca por debajo del minimo del sexo', () => {
    const mujer = calcularObjetivos({
      edad: 60, alturaCm: 148, pesoKg: 45,
      sexo: 'mujer', actividad: 'sedentario', objetivo: 'perder_grasa',
    })
    expect(mujer.kcal).toBeGreaterThanOrEqual(MINIMO_KCAL.mujer)

    const hombre = calcularObjetivos({
      edad: 70, alturaCm: 160, pesoKg: 55,
      sexo: 'hombre', actividad: 'sedentario', objetivo: 'perder_grasa',
    })
    expect(hombre.kcal).toBeGreaterThanOrEqual(MINIMO_KCAL.hombre)
  })

  // Bajar mas rapido no acelera el resultado y cuesta mantenerlo.
  it('nunca un deficit mayor del 25 por ciento del gasto', () => {
    const propuesta = calcularObjetivos(JOTA)
    expect(propuesta.kcal).toBeGreaterThanOrEqual(propuesta.gasto * (1 - DEFICIT_MAXIMO))
  })

  // Subir el numero sin decir por que convierte una medida de seguridad en lo
  // que parece un error de la app.
  it('cuando se aplica un suelo, queda dicho cual', () => {
    const propuesta = calcularObjetivos({
      edad: 60, alturaCm: 148, pesoKg: 45,
      sexo: 'mujer', actividad: 'sedentario', objetivo: 'perder_grasa',
    })
    expect(propuesta.suelosAplicados.length).toBeGreaterThan(0)
    for (const motivo of propuesta.suelosAplicados) {
      expect(explicarSuelo(motivo)).toMatch(/hemos/i)
    }
  })

  it('un caso holgado no aplica ningun suelo', () => {
    const propuesta = calcularObjetivos({ ...JOTA, objetivo: 'mantener', actividad: 'alta' })
    expect(propuesta.suelosAplicados).toEqual([])
  })

  // Esta prueba nacio al reves —afirmaba que los suelos nunca suben por encima
  // del gasto— y al fallar enseno un caso real: una mujer de 60 anos, 148 cm y
  // 45 kg sedentaria gasta unas 1.097 kcal, y el minimo con el que se puede
  // comer bien son 1.200. El minimo GANA, porque la alternativa es recomendar
  // comer menos de 1.200. Lo que no puede es callarselo y etiquetar un
  // superavit como «perder grasa».
  it('cuando el minimo supera al gasto, gana el minimo y se avisa', () => {
    const propuesta = calcularObjetivos({
      edad: 60, alturaCm: 148, pesoKg: 45,
      sexo: 'mujer', actividad: 'sedentario', objetivo: 'perder_grasa',
    })
    expect(propuesta.kcal).toBe(MINIMO_KCAL.mujer)
    expect(propuesta.kcal).toBeGreaterThan(propuesta.gasto)
    expect(propuesta.sinMargenParaDeficit).toBe(true)
  })

  it('con margen de sobra, no se avisa de nada', () => {
    expect(calcularObjetivos(JOTA).sinMargenParaDeficit).toBe(false)
  })

  // Quien no pidio perder grasa no tiene por que ver un aviso sobre deficits.
  it('el aviso solo aparece si se pidio perder grasa', () => {
    const mantener = calcularObjetivos({
      edad: 60, alturaCm: 148, pesoKg: 45,
      sexo: 'mujer', actividad: 'sedentario', objetivo: 'mantener',
    })
    expect(mantener.sinMargenParaDeficit).toBe(false)
  })
})

describe('el ajuste por objetivo', () => {
  it('perder grasa baja y ganar musculo sube, respecto a mantener', () => {
    const mantener = calcularObjetivos({ ...JOTA, objetivo: 'mantener' })
    const perder = calcularObjetivos({ ...JOTA, objetivo: 'perder_grasa' })
    const ganar = calcularObjetivos({ ...JOTA, objetivo: 'ganar_musculo' })
    expect(perder.kcal).toBeLessThan(mantener.kcal)
    expect(ganar.kcal).toBeGreaterThan(mantener.kcal)
  })

  it('recomposicion y habitos se quedan en mantenimiento', () => {
    const mantener = calcularObjetivos({ ...JOTA, objetivo: 'mantener' }).kcal
    expect(calcularObjetivos({ ...JOTA, objetivo: 'recomposicion' }).kcal).toBe(mantener)
    expect(calcularObjetivos({ ...JOTA, objetivo: 'habitos' }).kcal).toBe(mantener)
  })

  it('mas actividad, mas calorias', () => {
    const kcal = ACTIVIDADES.map((a) => calcularObjetivos({ ...JOTA, actividad: a.clave }).kcal)
    for (let i = 1; i < kcal.length; i++) {
      expect(kcal[i]!).toBeGreaterThan(kcal[i - 1]!)
    }
  })
})

describe('macros', () => {
  it('en deficit la proteina sube a 2 g/kg; en el resto, 1,8', () => {
    expect(calcularObjetivos({ ...JOTA, objetivo: 'perder_grasa' }).proteinaG).toBe(160)
    expect(calcularObjetivos({ ...JOTA, objetivo: 'mantener' }).proteinaG).toBe(144)
  })

  // A quien los suelos le hayan subido las calorias sigue queriendo perder
  // grasa, y sigue necesitando la proteina alta.
  it('los suelos no rebajan la proteina del deficit', () => {
    const conSuelo = calcularObjetivos({
      edad: 60, alturaCm: 148, pesoKg: 45,
      sexo: 'mujer', actividad: 'sedentario', objetivo: 'perder_grasa',
    })
    expect(conSuelo.suelosAplicados.length).toBeGreaterThan(0)
    expect(conSuelo.proteinaG).toBe(90) // 45 kg x 2,0
  })

  it('las grasas nunca bajan del 20 por ciento de las calorias', () => {
    for (const objetivo of OBJETIVOS) {
      const p = calcularObjetivos({ ...JOTA, objetivo: objetivo.clave })
      // Margen de un gramo por el redondeo.
      expect(p.grasasG * 9).toBeGreaterThanOrEqual(p.kcal * 0.2 - 9)
    }
  })

  // Un objetivo de carbos negativo no significa nada y romperia las barras.
  it('los carbohidratos nunca salen negativos', () => {
    const extremo = calcularObjetivos({
      edad: 25, alturaCm: 150, pesoKg: 130,
      sexo: 'mujer', actividad: 'sedentario', objetivo: 'perder_grasa',
    })
    expect(extremo.carbosG).toBeGreaterThanOrEqual(0)
  })

  it('los tres macros suman aproximadamente las calorias', () => {
    const p = calcularObjetivos(JOTA)
    const suma = p.proteinaG * 4 + p.carbosG * 4 + p.grasasG * 9
    // Margen del 5%, el mismo que la via manual acepta (§8.3).
    expect(Math.abs(suma - p.kcal) / p.kcal).toBeLessThan(0.05)
  })
})

describe('agua', () => {
  it('35 ml por kilo, a los 100 mas cercanos', () => {
    expect(objetivoAgua(80)).toBe(2800)
    expect(objetivoAgua(70)).toBe(2500) // 2450 -> 2500
  })

  it('ni una cifra ridicula ni una que nadie cumple', () => {
    expect(objetivoAgua(30)).toBe(1500)
    expect(objetivoAgua(200)).toBe(4000)
  })
})

it('sin decir el sexo, se avisa de que la estimacion es aproximada', () => {
  expect(calcularObjetivos({ ...JOTA, sexo: 'sin_decir' }).estimacionAproximada).toBe(true)
  expect(calcularObjetivos(JOTA).estimacionAproximada).toBe(false)
})

// Barrido amplio: ninguna combinacion razonable puede producir un objetivo
// absurdo. Es la red que atrapa lo que no se me haya ocurrido probar a mano, y
// en un modulo que decide cuanto come alguien vale la pena tenerla.
it('ninguna combinacion produce un objetivo peligroso o sin sentido', () => {
  for (const sexo of ['hombre', 'mujer', 'sin_decir'] as const) {
    for (const actividad of ACTIVIDADES) {
      for (const objetivo of OBJETIVOS) {
        for (const pesoKg of [45, 60, 80, 110]) {
          for (const edad of [18, 35, 70]) {
            const p = calcularObjetivos({
              edad, alturaCm: 170, pesoKg, sexo,
              actividad: actividad.clave, objetivo: objetivo.clave,
            })
            expect(p.kcal).toBeGreaterThanOrEqual(MINIMO_KCAL[sexo])
            expect(p.kcal).toBeGreaterThanOrEqual(p.basal)
            expect(p.proteinaG).toBeGreaterThan(0)
            expect(p.grasasG).toBeGreaterThan(0)
            expect(p.carbosG).toBeGreaterThanOrEqual(0)
            expect(p.aguaMl).toBeGreaterThanOrEqual(1500)
            expect(Number.isFinite(p.kcal)).toBe(true)
          }
        }
      }
    }
  }
})
