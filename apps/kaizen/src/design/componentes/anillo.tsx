import React from 'react'
import Svg, { Circle, Line, Path, Defs, LinearGradient, Stop } from 'react-native-svg'
import { View, Image, StyleSheet } from 'react-native'
import { tramosPara, LADO } from '../anillo-segmentado'
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

  // El medidor de la piel personal: 32 tramos sobre un aro de arte. Va antes
  // que todo lo demas porque no comparte NADA con el anillo liso —ni radios, ni
  // trazo, ni marco—: sus medidas las manda el PNG, no el tema.
  if (t.recetas.anillo === 'segmentado' && t.decoracion.anilloMarco) {
    const puntuacion = recortado * 100
    return (
      <View
        style={{ width: tamano, height: tamano }}
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(puntuacion) }}
      >
        {/* `width`/`height` explicitos ademas del absoluteFill: sin ellos la
            imagen se pinta a su tamano original —900 px— y desborda la
            pantalla entera. Mismo fallo que ya aparecio en `Superficie`. */}
        <Image
          source={t.decoracion.anilloMarco}
          resizeMode="contain"
          style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        />
        <Svg viewBox={`0 0 ${LADO} ${LADO}`} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="kaizen-encendido" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#fff76a" />
              <Stop offset="0.42" stopColor="#ffb000" />
              <Stop offset="1" stopColor="#ff4d00" />
            </LinearGradient>
          </Defs>
          {tramosPara(puntuacion).map((tramo, indice) => (
            <React.Fragment key={indice}>
              <Path d={tramo.apagado} fill="#0b1722" stroke="#41515e" strokeWidth={4} />
              {tramo.encendido && (
                <Path
                  d={tramo.encendido}
                  fill="url(#kaizen-encendido)"
                  stroke="#ffd24a"
                  strokeWidth={3}
                />
              )}
            </React.Fragment>
          ))}
        </Svg>
        {/* El numero va centrado sobre el aro, no dentro de un hueco medido:
            el marco es simetrico, asi que centrar basta. */}
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          {children}
        </View>
      </View>
    )
  }

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
