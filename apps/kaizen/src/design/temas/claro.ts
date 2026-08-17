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
