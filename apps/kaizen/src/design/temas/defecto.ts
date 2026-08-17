import type { Tema } from '../tema'

export const temaDefecto: Tema = {
  nombre: 'defecto',
  esquema: 'oscuro',
  color: {
    acento: '#4ECB9C',
    sobreAcento: '#04120C',
    texto: '#F4F5F2',
    textoTenue: '#98A09A',
    borde: 'rgba(255,255,255,0.10)',
    pista: 'rgba(255,255,255,0.10)',
    peligro: '#E2574C',
    sobrePeligro: '#2A0A07',
    proteina: '#E8A87C',
    carbos: '#7EA8D9',
    grasas: '#D9B26F',
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
    pantalla: { tipo: 'color', valor: '#060807' },
    velo: 'rgba(0,0,0,0)',
  },
  superficie: {
    tarjeta: { tipo: 'degradado', desde: 'rgba(255,255,255,0.085)', hasta: 'rgba(255,255,255,0.038)' },
    barraInferior: { tipo: 'degradado', desde: 'rgba(255,255,255,0.085)', hasta: 'rgba(255,255,255,0.038)' },
    botonPrimario: { tipo: 'color', valor: '#4ECB9C' },
    botonSecundario: { tipo: 'color', valor: 'rgba(255,255,255,0.10)' },
    botonPeligro: { tipo: 'color', valor: '#E2574C' },
    desenfoque: 22,
  },
  recetas: { barra: 'continua', anillo: 'liso' },
  decoracion: { cabecera: null, tarjetaEntrenamiento: null, tarjetaMision: null },
}
