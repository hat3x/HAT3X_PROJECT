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
    especular: 'rgba(255,255,255,0.28)',
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
    // Degradado y no color plano: aunque la diferencia entre los dos extremos
    // sea mínima, basta para que el borde superior de la pantalla no se
    // confunda con el inferior y el conjunto deje de parecer un folio negro.
    pantalla: { tipo: 'degradado', desde: '#0B0F0D', hasta: '#040605' },
    velo: 'rgba(0,0,0,0)',
    // Tres manchas, no más: con cuatro el fondo empieza a competir con el
    // contenido. Verde del acento arriba a la derecha (donde cae el anillo),
    // un azul frío a la izquierda para que las tarjetas de en medio no recojan
    // todas el mismo tinte, y un ámbar muy tenue abajo que calienta la zona de
    // la barra. Opacidades por debajo de 0,20: esto es atmósfera, no adorno.
    aurora: [
      { color: '#4ECB9C', x: 0.82, y: 0.14, radio: 0.75, opacidad: 0.17 },
      { color: '#5C7CE0', x: 0.08, y: 0.46, radio: 0.70, opacidad: 0.13 },
      { color: '#D9B26F', x: 0.70, y: 0.92, radio: 0.65, opacidad: 0.09 },
    ],
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
