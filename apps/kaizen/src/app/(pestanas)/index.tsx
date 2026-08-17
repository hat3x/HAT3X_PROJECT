import { View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useContext } from 'react'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { Texto } from '@/design/componentes/texto'
import { Pantalla, SIN_MARGEN } from '@/design/componentes/pantalla'
import { Superficie } from '@/design/componentes/superficie'
import { Anillo } from '@/design/componentes/anillo'
import { Barra } from '@/design/componentes/barra'
import { Boton } from '@/design/componentes/boton'
import { useTema } from '@/design/proveedor'

// Separador de miles con punto y coma decimal a la española, sin tirar de
// `Intl`: el soporte de locales en Hermes es irregular entre plataformas, y
// para un par de formatos tan simples no vale la pena arriesgarse a que
// "1.720" salga "1720" en un dispositivo y bien en el simulador.
function conSeparadorDeMiles(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function comaDecimal(n: number): string {
  return n.toString().replace('.', ',')
}

// Altura del contenido de la barra de pestañas (variante uikit, sin el
// margen de seguridad del dispositivo): react-navigation la fija en 49pt y
// le suma el margen inferior por su cuenta (ver
// `node_modules/expo-router/build/react-navigation/bottom-tabs/views/BottomTabBar.js`,
// `TABBAR_HEIGHT_UIKIT`). Se replica aquí, sumada al margen seguro, para que
// la última tarjeta nunca quede tapada por la barra flotante — en vez de
// `useBottomTabBarHeight`, que solo funciona dentro de un navegador de
// pestañas real y obligaría a montar esta pantalla con `renderRouter` para
// poder probarla, distinto de como se prueba el resto del suite.
const ALTURA_CONTENIDO_BARRA = 49

/**
 * Datos de ejemplo para maquetar el Home mientras no existe registro real.
 * El bloque 1 los sustituye por datos leídos de verdad (Supabase): nada de
 * lo que hay debajo es un dato real, y no debe tratarse como tal.
 */
const DATOS_DE_EJEMPLO = {
  usuario: 'Jota',
  dia: 24,
  fase: 'Fase Definición',
  kaizenScore: 82,
  mensajeScore: 'Vas por muy buen camino.',
  nutricion: {
    caloriasConsumidas: 1720,
    caloriasObjetivo: 2300,
    macros: [
      { clave: 'proteina', etiqueta: 'Proteína', actual: 132, objetivo: 170 },
      { clave: 'carbos', etiqueta: 'Carbos', actual: 164, objetivo: 220 },
      { clave: 'grasas', etiqueta: 'Grasas', actual: 48, objetivo: 70 },
    ],
  },
  agua: { actual: 1.8, objetivo: 2.5 },
  entrenamiento: { estado: 'Pendiente hoy' },
  mision: [
    { texto: 'Desayuno registrado', hecho: true },
    { texto: '1 L de agua', hecho: true },
    { texto: 'Llegar a 170 g de proteína', hecho: false },
    { texto: 'Entrenamiento', hecho: false },
    { texto: 'Registrar cena', hecho: false },
  ],
} as const

// Todavía no hay dónde guardar nada (eso llega en el bloque 1): este
// manejador compartido existe solo para que los botones de la pantalla no
// rompan al pulsarlos, sin inventar una ruta ni una pantalla que no existe.
function sinDestino() {}

// Geometría de esta lista, no del tema: no hay token de tamaño de icono en
// `Tema`, igual que `LADO_MAS`/`SOBRESALIENTE_MAS` en el layout de pestañas.
const TAMANO_ICONO_MISION = 16

export default function Hoy() {
  const t = useTema()
  const router = useRouter()
  const margen = useContext(SafeAreaInsetsContext) ?? SIN_MARGEN

  const colorMacro: Record<(typeof DATOS_DE_EJEMPLO.nutricion.macros)[number]['clave'], string> = {
    proteina: t.color.proteina,
    carbos: t.color.carbos,
    grasas: t.color.grasas,
  }

  const restantes = DATOS_DE_EJEMPLO.nutricion.caloriasObjetivo - DATOS_DE_EJEMPLO.nutricion.caloriasConsumidas
  const progresoCalorias = DATOS_DE_EJEMPLO.nutricion.caloriasConsumidas / DATOS_DE_EJEMPLO.nutricion.caloriasObjetivo

  return (
    <Pantalla>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          paddingHorizontal: t.espaciado[5],
          paddingTop: t.espaciado[2],
        }}
      >
        <Pressable
          onPress={() => router.push('/ajustes')}
          accessibilityRole="button"
          accessibilityLabel="Ajustes"
        >
          <Texto variante="etiqueta">Ajustes</Texto>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: t.espaciado[5],
          paddingTop: t.espaciado[3],
          paddingBottom: margen.bottom + ALTURA_CONTENIDO_BARRA + t.espaciado[5],
          gap: t.espaciado[5],
        }}
      >
        {/* 1. Saludo */}
        <View>
          <Texto variante="titulo">Buenos días, {DATOS_DE_EJEMPLO.usuario}</Texto>
          <Texto variante="tenue" style={{ marginTop: t.espaciado[1] }}>
            Día {DATOS_DE_EJEMPLO.dia} · {DATOS_DE_EJEMPLO.fase}
          </Texto>
        </View>

        {/* 2. Kaizen Score */}
        <View style={{ alignItems: 'center' }}>
          <Anillo progreso={DATOS_DE_EJEMPLO.kaizenScore / 100}>
            <Texto variante="heroe">{DATOS_DE_EJEMPLO.kaizenScore}</Texto>
            <Texto variante="etiqueta" style={{ marginTop: t.espaciado[0], textAlign: 'center' }}>
              Kaizen Score
            </Texto>
          </Anillo>
          <Texto variante="tenue" style={{ marginTop: t.espaciado[3], textAlign: 'center' }}>
            {DATOS_DE_EJEMPLO.mensajeScore}
          </Texto>
        </View>

        {/* 3. Nutrición */}
        <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Texto variante="titulo">
              {conSeparadorDeMiles(DATOS_DE_EJEMPLO.nutricion.caloriasConsumidas)} /{' '}
              {conSeparadorDeMiles(DATOS_DE_EJEMPLO.nutricion.caloriasObjetivo)}
            </Texto>
            <Texto variante="tenue">{restantes} restantes</Texto>
          </View>
          <View style={{ marginTop: t.espaciado[2] }}>
            <Barra progreso={progresoCalorias} color={t.color.acento} />
          </View>
          <View
            style={{
              height: StyleSheet.hairlineWidth,
              backgroundColor: t.color.borde,
              marginVertical: t.espaciado[4],
            }}
          />
          <View style={{ flexDirection: 'row', gap: t.espaciado[3] }}>
            {DATOS_DE_EJEMPLO.nutricion.macros.map((macro) => (
              <View key={macro.clave} style={{ flex: 1 }}>
                <Texto variante="etiqueta">{macro.etiqueta}</Texto>
                <Texto style={{ marginTop: t.espaciado[0] }}>
                  {macro.actual}/{macro.objetivo}
                </Texto>
                <View style={{ marginTop: t.espaciado[1] }}>
                  {/* Más fina que la barra de calorías (por defecto 7, como
                      la de arriba): son tres, secundarias, y comparten fila. */}
                  <Barra progreso={macro.actual / macro.objetivo} color={colorMacro[macro.clave]} alto={5} />
                </View>
              </View>
            ))}
          </View>
        </Superficie>

        {/* 4. Agua */}
        <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Texto variante="etiqueta">Agua</Texto>
              <Texto variante="titulo" style={{ marginTop: t.espaciado[0] }}>
                {comaDecimal(DATOS_DE_EJEMPLO.agua.actual)} / {comaDecimal(DATOS_DE_EJEMPLO.agua.objetivo)} L
              </Texto>
            </View>
            <View style={{ flexDirection: 'row', gap: t.espaciado[1] }}>
              <Boton titulo="+250" tono="secundario" alPulsar={sinDestino} />
              <Boton titulo="+500" tono="secundario" alPulsar={sinDestino} />
            </View>
          </View>
        </Superficie>

        {/* 5. Entrenamiento */}
        <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Texto variante="etiqueta">Entrenamiento</Texto>
              <Texto variante="tenue" style={{ marginTop: t.espaciado[0] }}>
                {DATOS_DE_EJEMPLO.entrenamiento.estado}
              </Texto>
            </View>
            <Boton titulo="Registrar" tono="primario" alPulsar={sinDestino} />
          </View>
        </Superficie>

        {/* 6. Misión de hoy */}
        <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
          <Texto variante="etiqueta">Tu misión de hoy</Texto>
          <View style={{ marginTop: t.espaciado[3], gap: t.espaciado[2] }}>
            {DATOS_DE_EJEMPLO.mision.map((item) => (
              <View key={item.texto} style={{ flexDirection: 'row', alignItems: 'center', gap: t.espaciado[1] }}>
                <Feather
                  name={item.hecho ? 'check-circle' : 'circle'}
                  size={TAMANO_ICONO_MISION}
                  color={item.hecho ? t.color.acento : t.color.textoTenue}
                />
                <Texto variante={item.hecho ? 'tenue' : 'cuerpo'}>{item.texto}</Texto>
              </View>
            ))}
          </View>
        </Superficie>
      </ScrollView>
    </Pantalla>
  )
}
