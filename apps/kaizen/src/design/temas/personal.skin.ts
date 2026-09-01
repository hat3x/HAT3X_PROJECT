import type { Tema } from '../tema'

/**
 * La piel personal. FUERA del control de versiones, junto con su arte.
 *
 * Solo entra en la compilación cuando `KAIZEN_SKIN=1` hace que metro resuelva
 * `./personal` a este fichero (ver `metro.config.js`). El perfil `tienda` no
 * puede incluirla ni por accidente: estos ficheros no están en el repositorio.
 *
 * El arte trae su propio marco, su propio brillo y su propio texto en los
 * botones. Por eso aquí se apagan tres cosas que el tema por defecto necesita
 * y esta piel no:
 *
 * - `aurora: []` — el fondo lo pone la ilustración, no un degradado radial.
 * - `desenfoque: 0` — el aspecto de cristal ya está pintado dentro de las
 *   tarjetas. Recalcular un desenfoque en cada fotograma encima de una imagen
 *   que ya lo simula es pagar lo más caro de la interfaz por nada.
 * - `especular: 'transparent'` — el canto de luz lo trae el marco dibujado;
 *   añadirle otro encima le pone una segunda línea que no cuadra con el arte.
 */
export const temaPersonal: Tema = {
  nombre: 'dragonball',
  esquema: 'oscuro',
  color: {
    // Naranja de bola de dragón para el acento, azul de cápsula para los datos.
    acento: '#F5A623',
    sobreAcento: '#1A0E00',
    texto: '#F2F6FA',
    textoTenue: '#8FA6BC',
    borde: 'rgba(120,180,230,0.18)',
    especular: 'transparent',
    pista: 'rgba(10,25,45,0.75)',
    peligro: '#E2574C',
    sobrePeligro: '#2A0A07',
    // Los mismos tres colores que llevan los iconos de macros del arte, para
    // que las barras y sus iconos no se contradigan.
    proteina: '#F09A2B',
    carbos: '#4FC3F7',
    grasas: '#FFD54F',
  },
  radio: { tarjeta: 10, boton: 6, pastilla: 8 },
  espaciado: [4, 8, 12, 16, 20, 24, 32, 40, 48],
  tipografia: {
    familiaTitular: null,
    familiaCuerpo: null,
    // Más peso que el tema por defecto: sobre arte con textura, un titular de
    // 600 se pierde.
    pesoTitular: '800',
    pesoCuerpo: '600',
    ajusteLinea: 1,
    mayusculasEtiquetas: true,
  },
  fondo: {
    // Azul de noche de Capsule Corp, que es el fondo sobre el que están
    // recortadas todas las tarjetas.
    // El fondo ES la piel: sin el, todo lo demas flota sobre negro y no se
    // parece a la referencia por muy bien que esten las tarjetas.
    pantalla: {
      tipo: 'recurso',
      fuente: require('../../../assets/skins/dragonball/fondo.jpg'),
      recuadro: null,
    },
    // Un velo oscuro sobre la ilustracion: sin el, el texto blanco de la
    // cabecera cae sobre cielo azul claro y no se lee. Bastante suave como
    // para que el fondo siga siendo el protagonista.
    velo: 'rgba(4,10,20,0.45)',
    // Sin aurora: el fondo ilustrado ya trae su propia luz y color, y
    // superponerle manchas solo lo ensucia.
    aurora: [],
  },
  superficie: {
    // Genérico para lo que no tiene arte propio (pantallas de registro,
    // ajustes). Sigue el mismo azul para no romper con las que sí lo tienen.
    tarjeta: { tipo: 'degradado', desde: 'rgba(30,60,100,0.55)', hasta: 'rgba(12,26,46,0.65)' },
    // La barra ES arte: cinco huecos, dos a cada lado y el circulo central,
    // colocados justo en los centros de cinco celdas iguales. `recuadro: null`
    // porque no se puede estirar: los huecos se desplazarian.
    barraInferior: {
      tipo: 'recurso',
      fuente: require('../../../assets/skins/dragonball/barra-inferior.png'),
      recuadro: null,
    },
    botonPrimario: { tipo: 'color', valor: '#3FCF6E' },
    botonSecundario: { tipo: 'color', valor: 'rgba(80,140,200,0.20)' },
    botonPeligro: { tipo: 'color', valor: '#E2574C' },
    desenfoque: 0,
  },
  // Barras segmentadas y anillo con marcas: es lo que hace el arte del scouter.
  recetas: { barra: 'segmentada', anillo: 'segmentado' },
  decoracion: {
    cabecera: null,
    anilloMarco: require('../../../assets/skins/dragonball/anillo-marco.png'),
    // `recuadro`: los píxeles de cada lado que NO se estiran. Sin esto, una
    // tarjeta de 750 px estirada a 380 deforma el marco y los remaches. Los
    // valores salen del arte: el marco mide unos 22 px, y en las tarjetas con
    // ilustración a un lado —el edificio, la bola— hay que proteger todo ese
    // ancho para que no se aplaste.
    // Las fracciones salen de mirar el arte: donde acaba la ilustracion de la
    // izquierda y donde empiezan los botones de la derecha. Se afinan viendo la
    // captura, que es mas fiable que medir pixeles con umbrales de brillo.
    tarjetaNutricion: {
      fondo: {
        tipo: 'recurso',
        fuente: require('../../../assets/skins/dragonball/tarjeta-nutricion.jpg'),
        recuadro: { arriba: 26, izquierda: 26, abajo: 26, derecha: 26 },
      },
      // Esta no tiene ilustracion a los lados, solo la cabecera de arriba.
      contenido: { izquierda: 0.05, derecha: 0.95 },
      pulsables: [],
    },
    tarjetaAgua: {
      fondo: {
        tipo: 'recurso',
        fuente: require('../../../assets/skins/dragonball/tarjeta-agua.png'),
        // Sin recuadro: esta tarjeta NO se estira. Sus dibujos —la gota, el
        // edificio, la bola, los botones— estan repartidos por todo el ancho,
        // asi que estirar el centro los desplaza de donde el arte los puso.
        // Se escala entera y la altura sale de su proporcion.
        recuadro: null,
      },
      // Entre la gota y el primer boton.
      contenido: { izquierda: 0.2, derecha: 0.58 },
      // Los +250 y +500 estan pintados dentro: aqui solo se escucha el toque.
      pulsables: [{ desde: 0.6, hasta: 0.78 }, { desde: 0.79, hasta: 0.97 }],
    },
    tarjetaEntrenamiento: {
      fondo: {
        tipo: 'recurso',
        fuente: require('../../../assets/skins/dragonball/tarjeta-entrenamiento.png'),
        // Sin recuadro: esta tarjeta NO se estira. Sus dibujos —la gota, el
        // edificio, la bola, los botones— estan repartidos por todo el ancho,
        // asi que estirar el centro los desplaza de donde el arte los puso.
        // Se escala entera y la altura sale de su proporcion.
        recuadro: null,
      },
      // Entre el edificio y el boton de registrar.
      contenido: { izquierda: 0.22, derecha: 0.6 },
      pulsables: [{ desde: 0.62, hasta: 0.88 }],
    },
    tarjetaMision: {
      fondo: {
        tipo: 'recurso',
        fuente: require('../../../assets/skins/dragonball/tarjeta-mision.png'),
        // Sin recuadro: esta tarjeta NO se estira. Sus dibujos —la gota, el
        // edificio, la bola, los botones— estan repartidos por todo el ancho,
        // asi que estirar el centro los desplaza de donde el arte los puso.
        // Se escala entera y la altura sale de su proporcion.
        recuadro: null,
      },
      // Entre la bola y el radar.
      contenido: { izquierda: 0.22, derecha: 0.72 },
      pulsables: [],
    },
    barraCalorias: require('../../../assets/skins/dragonball/barra-calorias.png'),
    // Ya viene pintado dentro de su tarjeta.
    botonRegistrar: null,
    // Ya viene pintado dentro de su tarjeta.
    botonAgua250: null,
    // Ya viene pintado dentro de su tarjeta.
    botonAgua500: null,
    botonMas: require('../../../assets/skins/dragonball/boton-mas.jpg'),
    iconoProteina: require('../../../assets/skins/dragonball/icono-proteina.jpg'),
    iconoCarbos: require('../../../assets/skins/dragonball/icono-carbos.jpg'),
    iconoGrasas: require('../../../assets/skins/dragonball/icono-grasas.jpg'),
    iconoAgua: require('../../../assets/skins/dragonball/icono-agua.jpg'),
  },
}
