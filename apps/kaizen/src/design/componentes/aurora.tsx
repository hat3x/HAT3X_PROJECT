import { StyleSheet } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useTema } from '../proveedor'

/**
 * Las manchas de color difusas del fondo, detrás de todo lo demás.
 *
 * Es lo que hace que el cristal se vea cristal: sin variación de color detrás,
 * desenfocar un fondo plano solo da otro plano más claro. Con la aurora, cada
 * tarjeta recoge un tinte distinto según dónde caiga.
 *
 * Cada mancha se pinta como un rectángulo a pantalla completa relleno con un
 * degradado radial que se apaga hasta transparente. Se usa `Rect` y no `Circle`
 * porque el degradado va en unidades del propio rectángulo: al ser la pantalla
 * más alta que ancha, la mancha sale ovalada, que es justo lo que se busca —una
 * mancha perfectamente redonda se lee como un foco, no como atmósfera.
 */
export function Aurora() {
  const t = useTema()
  if (t.fondo.aurora.length === 0) return null

  // El identificador lleva el nombre del tema porque en una app de pestañas hay
  // varias pantallas montadas a la vez, cada una con su Aurora. Compartiendo
  // tema comparten degradado, que es idéntico, así que la colisión es inocua.
  const id = (indice: number) => `aurora-${t.nombre}-${indice}`

  return (
    // `width`/`height` explícitos además del estilo: sin ellos el lienzo toma
    // un tamaño intrínseco propio y las manchas salen recortadas en un
    // rectángulo de bordes duros arriba a la izquierda. Visto en la captura.
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {t.fondo.aurora.map((mancha, indice) => (
          <RadialGradient
            key={indice}
            id={id(indice)}
            cx={String(mancha.x)}
            cy={String(mancha.y)}
            r={String(mancha.radio)}
          >
            <Stop offset="0" stopColor={mancha.color} stopOpacity={mancha.opacidad} />
            <Stop offset="1" stopColor={mancha.color} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {t.fondo.aurora.map((_, indice) => (
        <Rect key={indice} x="0" y="0" width="100%" height="100%" fill={`url(#${id(indice)})`} />
      ))}
    </Svg>
  )
}
