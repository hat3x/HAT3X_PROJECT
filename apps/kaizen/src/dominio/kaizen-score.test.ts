import {
  kaizenScore, puntuarCalorias, puntuarProporcional, mensajeScore,
  PESOS, mision, type EntradaScore,
} from './kaizen-score'

/** Un día vacío: nada comido, nada bebido, nada entrenado, sin hábitos. */
const VACIO: EntradaScore = {
  kcal: 0, kcalObjetivo: 2300,
  proteinaG: 0, proteinaObjetivoG: 170,
  aguaMl: 0, aguaObjetivoMl: 2500,
  entrenamientos: 0, tocabaEntrenar: false,
  habitos: 0, habitosHechos: 0,
  diaEnCurso: true,
}

describe('calorias', () => {
  it('dentro de la banda del 8 por ciento puntua entero', () => {
    expect(puntuarCalorias(2300, 2300, false)).toBe(1)
    expect(puntuarCalorias(2300 * 1.08, 2300, false)).toBe(1)
    expect(puntuarCalorias(2300 * 0.92, 2300, false)).toBe(1)
  })

  // §9.3 del spec: una app que puntua mejor cuanto menos comes empuja justo al
  // comportamiento que el producto quiere evitar.
  it('con el dia cerrado, comer 900 kcal NO es un dia perfecto', () => {
    expect(puntuarCalorias(900, 2300, false)).toBeLessThan(0.6)
  })

  it('pasarse penaliza, y cuanto mas, mas', () => {
    const poco = puntuarCalorias(2600, 2300, true)
    const mucho = puntuarCalorias(3200, 2300, true)
    expect(poco).toBeLessThan(1)
    expect(mucho).toBeLessThan(poco)
  })

  it('pasarse muchisimo llega a cero, y no baja de ahi', () => {
    expect(puntuarCalorias(10_000, 2300, true)).toBe(0)
  })

  // La diferencia entre una app que acompana y una que insulta: a las nueve de
  // la manana no has comido nada.
  describe('el dia en curso mide progreso, no nota', () => {
    it('ir por la mitad a mediodia no es un fracaso', () => {
      expect(puntuarCalorias(1058, 2300, true)).toBeCloseTo(0.5, 1)
    })

    it('el mismo numero puntua mejor en curso que cerrado', () => {
      expect(puntuarCalorias(1058, 2300, true)).toBeGreaterThan(puntuarCalorias(1058, 2300, false))
    })

    // Pasarse no lo arregla el resto de la tarde, asi que penaliza igual.
    it('pero pasarse penaliza igual estando el dia en curso', () => {
      expect(puntuarCalorias(3200, 2300, true)).toBe(puntuarCalorias(3200, 2300, false))
    })
  })

  it('sin objetivo no se puede puntuar', () => {
    expect(puntuarCalorias(1500, 0, true)).toBe(0)
  })
})

describe('proporcionales', () => {
  it('llegar al objetivo es el maximo', () => {
    expect(puntuarProporcional(170, 170)).toBe(1)
  })

  // Beber tres litros en vez de dos y medio no es peor, solo no es mas.
  it('pasarse no penaliza ni suma', () => {
    expect(puntuarProporcional(3000, 2500)).toBe(1)
  })

  it('la mitad es la mitad', () => {
    expect(puntuarProporcional(85, 170)).toBe(0.5)
  })
})

describe('normalizacion sobre los componentes activos', () => {
  // Un dia sin entrenamiento programado no puede tener un techo de 80.
  it('sin entrenar ni haber tocado, un dia perfecto sigue siendo 100', () => {
    const { score } = kaizenScore({
      ...VACIO, kcal: 2300, proteinaG: 170, aguaMl: 2500,
    })
    expect(score).toBe(100)
  })

  it('si tocaba entrenar y no se entreno, se pierden sus puntos', () => {
    const { score } = kaizenScore({
      ...VACIO, kcal: 2300, proteinaG: 170, aguaMl: 2500, tocabaEntrenar: true,
    })
    // 70 de 90 posibles: los 20 del entrenamiento se quedan a cero pero cuentan.
    expect(score).toBe(Math.round((70 / 90) * 100))
  })

  it('entrenar sin que tocara suma, no resta', () => {
    const base = kaizenScore({ ...VACIO, kcal: 2300, proteinaG: 170, aguaMl: 2500 })
    const conEntreno = kaizenScore({
      ...VACIO, kcal: 2300, proteinaG: 170, aguaMl: 2500, entrenamientos: 1,
    })
    expect(conEntreno.score).toBeGreaterThanOrEqual(base.score)
    expect(conEntreno.componentes.some((c) => c.clave === 'entrenamiento')).toBe(true)
  })

  it('sin habitos configurados, el componente ni aparece', () => {
    const { componentes } = kaizenScore(VACIO)
    expect(componentes.some((c) => c.clave === 'habitos')).toBe(false)
  })

  it('con habitos configurados, cuentan los marcados', () => {
    const { componentes } = kaizenScore({ ...VACIO, habitos: 4, habitosHechos: 3 })
    const habitos = componentes.find((c) => c.clave === 'habitos')
    expect(habitos?.logro).toBe(0.75)
    expect(habitos?.peso).toBe(PESOS.habitos)
  })
})

describe('el score entero', () => {
  it('el dia arranca en cero', () => {
    expect(kaizenScore(VACIO).score).toBe(0)
  })

  it('nunca se sale de 0 a 100', () => {
    const pasado = kaizenScore({
      ...VACIO, kcal: 9000, proteinaG: 900, aguaMl: 9000, entrenamientos: 3,
      habitos: 2, habitosHechos: 9,
    })
    expect(pasado.score).toBeGreaterThanOrEqual(0)
    expect(pasado.score).toBeLessThanOrEqual(100)
  })

  // Sin objetivos no hay nada contra lo que medir; devolver 100 seria mentir y
  // devolver NaN romperia el anillo.
  it('sin ningun objetivo devuelve cero, no NaN', () => {
    const { score } = kaizenScore({
      ...VACIO, kcalObjetivo: 0, proteinaObjetivoG: 0, aguaObjetivoMl: 0,
    })
    expect(score).toBe(0)
    expect(Number.isNaN(score)).toBe(false)
  })

  it('media manana tipica: algo comido, algo bebido, sin entrenar', () => {
    const { score } = kaizenScore({
      ...VACIO, kcal: 700, proteinaG: 45, aguaMl: 750,
    })
    // Ni cero —algo se ha hecho— ni una nota alta.
    expect(score).toBeGreaterThan(20)
    expect(score).toBeLessThan(50)
  })
})

describe('el mensaje del anillo', () => {
  // Quien mira la app a las once de la noche con un 30 ya sabe que el dia no ha
  // ido bien. No necesita que se lo diga la pantalla.
  it('nunca regana', () => {
    const todos = [0, 15, 30, 45, 60, 75, 85, 100].flatMap((s) => [
      mensajeScore(s, true), mensajeScore(s, false),
    ])
    for (const frase of todos) {
      expect(frase).not.toMatch(/mal|fatal|deberias|fracas|pobre/i)
    }
  })

  it('con el dia en curso, un cero habla de lo que queda por delante', () => {
    expect(mensajeScore(0, true)).toMatch(/empez|queda/i)
  })

  it('distingue el dia en curso del cerrado', () => {
    expect(mensajeScore(90, true)).not.toBe(mensajeScore(90, false))
  })
})

describe('la mision del dia', () => {
  const NADA = {
    momentosRegistrados: [] as string[],
    proteinaG: 0, proteinaObjetivoG: 170,
    aguaMl: 0, aguaObjetivoMl: 2500,
    entrenamientos: 0,
  }

  it('sin nada hecho, ninguna linea esta marcada', () => {
    expect(mision(NADA).every((p) => !p.hecho)).toBe(true)
  })

  // La lista de maqueta decia lo mismo pasara lo que pasara.
  it('cada linea se marca sola con lo que se registra', () => {
    const pasos = mision({
      ...NADA,
      momentosRegistrados: ['desayuno', 'comida'],
      proteinaG: 180, aguaMl: 2600, entrenamientos: 1,
    })
    const hecho = (clave: string) => pasos.find((p) => p.clave === clave)?.hecho
    expect(hecho('desayuno')).toBe(true)
    expect(hecho('comida')).toBe(true)
    expect(hecho('cena')).toBe(false)
    expect(hecho('proteina')).toBe(true)
    expect(hecho('agua')).toBe(true)
    expect(hecho('entrenamiento')).toBe(true)
  })

  it('llegar justo al objetivo cuenta como hecho', () => {
    const pasos = mision({ ...NADA, proteinaG: 170, aguaMl: 2500 })
    expect(pasos.find((p) => p.clave === 'proteina')?.hecho).toBe(true)
    expect(pasos.find((p) => p.clave === 'agua')?.hecho).toBe(true)
  })

  // La mision no puede hablar de mililitros mientras la tarjeta de al lado dice
  // litros.
  it('el agua se pide en litros, como en la tarjeta', () => {
    expect(mision(NADA).find((p) => p.clave === 'agua')?.texto).toBe('Beber 2,5 L de agua')
  })

  it('sin objetivo, esa linea ni aparece', () => {
    const pasos = mision({ ...NADA, proteinaObjetivoG: 0, aguaObjetivoMl: 0 })
    expect(pasos.some((p) => p.clave === 'proteina')).toBe(false)
    expect(pasos.some((p) => p.clave === 'agua')).toBe(false)
  })
})
