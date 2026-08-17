import Svg, { Circle, Line } from 'react-native-svg'
import { View } from 'react-native'
import type { ReactNode } from 'react'
import { useTema } from '../proveedor'

export function Anillo({ progreso, tamano = 168, grosor = 12, children }: {
  progreso: number
  tamano?: number
  grosor?: number
  children?: ReactNode
}) {
  const t = useTema()
  const recortado = Math.min(1, Math.max(0, progreso))
  const centro = tamano / 2
  const radio = centro - grosor / 2 - 6
  const vuelta = 2 * Math.PI * radio

  return (
    <View
      style={{ width: tamano, height: tamano }}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(recortado * 100) }}
    >
      <Svg width={tamano} height={tamano}>
        <Circle cx={centro} cy={centro} r={radio} fill="none"
                stroke={t.color.pista} strokeWidth={grosor} />
        <Circle cx={centro} cy={centro} r={radio} fill="none"
                stroke={t.color.acento} strokeWidth={grosor} strokeLinecap="round"
                strokeDasharray={`${vuelta * recortado} ${vuelta}`}
                transform={`rotate(-90 ${centro} ${centro})`} />
        {t.recetas.anillo === 'medidor' &&
          [0, 0.25, 0.5, 0.75].map((fraccion) => {
            const angulo = (fraccion * 2 - 0.5) * Math.PI
            return (
              <Line key={fraccion}
                    x1={centro + Math.cos(angulo) * (radio + grosor / 2 + 1)}
                    y1={centro + Math.sin(angulo) * (radio + grosor / 2 + 1)}
                    x2={centro + Math.cos(angulo) * (radio + grosor / 2 + 5)}
                    y2={centro + Math.sin(angulo) * (radio + grosor / 2 + 5)}
                    stroke={t.color.textoTenue} strokeWidth={2} />
            )
          })}
      </Svg>
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  )
}
