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
    // Blanco casi opaco: sobre superficies ya claras, el canto se lee por ser
    // MÁS blanco que la tarjeta, no por ser más claro que el fondo.
    especular: 'rgba(255,255,255,0.95)',
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
    pantalla: { tipo: 'degradado', desde: '#FDFCFA', hasta: '#F2F1EC' },
    velo: 'rgba(255,255,255,0)',
    // Las mismas tres posiciones que el tema oscuro, para que las dos pieles se
    // sientan la misma app. En claro hay que bajar mucho la opacidad: sobre
    // fondo casi blanco, un 0,17 de verde no es atmósfera, es una mancha verde.
    aurora: [
      { color: '#1E9E73', x: 0.82, y: 0.14, radio: 0.75, opacidad: 0.1 },
      { color: '#4A7FBF', x: 0.08, y: 0.46, radio: 0.7, opacidad: 0.08 },
      { color: '#B08A3C', x: 0.7, y: 0.92, radio: 0.65, opacidad: 0.06 },
    ],
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
  decoracion: {
    cabecera: null,
    tarjetaNutricion: null,
    tarjetaAgua: null,
    tarjetaEntrenamiento: null,
    tarjetaMision: null,
    barraCalorias: null,
    botonRegistrar: null,
    botonAgua250: null,
    botonAgua500: null,
    botonMas: null,
    iconoProteina: null,
    iconoCarbos: null,
    iconoGrasas: null,
    iconoAgua: null,
  },
}
