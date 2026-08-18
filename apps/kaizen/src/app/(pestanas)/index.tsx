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
import { usarAgua } from '@/features/agua/usar-agua'
import { usarEntrenamiento } from '@/features/entrenamiento/usar-entrenamiento'
import { resumenEntrenamiento } from '@/dominio/entrenamiento'
import { usarNutricion } from '@/features/nutricion/usar-nutricion'
import { enKcal, enGramos } from '@/dominio/nutricion'
import { kaizenScore, mensajeScore, mision } from '@/dominio/kaizen-score'
import { fechaLarga } from '@/dominio/dia'
import { usarPerfil } from '@/features/perfil/usar-perfil'
import { usarFechaDeHoy } from '@/features/dia/usar-fecha-de-hoy'
import { usarObjetivos } from '@/features/objetivos/usar-objetivos'
import { usarHabitos } from '@/features/habitos/usar-habitos'

// Separador de miles con punto y coma decimal a la española, sin tirar de
// `Intl`: el soporte de locales en Hermes es irregular entre plataformas, y
// para un par de formatos tan simples no vale la pena arriesgarse a que
// "1.720" salga "1720" en un dispositivo y bien en el simulador.
function conSeparadorDeMiles(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function comaDecimal(n: number | string): string {
  return n.toString().replace('.', ',')
}

// El agua se guarda en mililitros —enteros, sin decimales que redondear mal— y
// se ensena en litros, que es como la gente la piensa. Un decimal basta: «1,8 L»
// se lee de un vistazo y «1,75 L» no anade nada util.
// Siempre un decimal, tambien cuando es redondo: «1 / 2,5 L» se lee como si
// una de las dos cifras fuera de otra unidad. «1,0 / 2,5 L» se lee de un golpe.
function enLitros(ml: number): string {
  return comaDecimal((Math.round(ml / 100) / 10).toFixed(1))
}

// Las dos cantidades de un toque. No es un token del tema: es cuanto bebe
// alguien de un trago, no como se ve la app.
const VASOS_ML = [250, 500] as const

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

// Geometría de esta lista, no del tema: no hay token de tamaño de icono en
// `Tema`, igual que `LADO_MAS`/`SOBRESALIENTE_MAS` en el layout de pestañas.
const TAMANO_ICONO_MISION = 16

export default function Hoy() {
  const t = useTema()
  const router = useRouter()
  const margen = useContext(SafeAreaInsetsContext) ?? SIN_MARGEN
  const agua = usarAgua()
  const entreno = usarEntrenamiento()
  const nutricion = usarNutricion()
  const { perfil } = usarPerfil()
  const fechaDeHoy = usarFechaDeHoy()
  const { hayObjetivos } = usarObjetivos()
  const habitos = usarHabitos()

  // Las tres columnas de macros, leidas de lo comido hoy y de los objetivos.
  const macros = [
    { clave: 'proteina', etiqueta: 'Proteína', actual: nutricion.total.proteina_g, objetivo: nutricion.objetivos.proteina_g, color: t.color.proteina },
    { clave: 'carbos', etiqueta: 'Carbos', actual: nutricion.total.carbos_g, objetivo: nutricion.objetivos.carbos_g, color: t.color.carbos },
    { clave: 'grasas', etiqueta: 'Grasas', actual: nutricion.total.grasas_g, objetivo: nutricion.objetivos.grasas_g, color: t.color.grasas },
  ]

  // El score del dia. `diaEnCurso` va fijo a `true` porque este Home siempre
  // ensena hoy: el dia cerrado con su nota llegara con el historico.
  //
  // `tocabaEntrenar` va a `false` mientras no exista la planificacion (bloque
  // 5): sin ella no se puede saber si hoy tocaba, y suponer que si penalizaria
  // por una obligacion que nadie ha puesto.
  const { score } = kaizenScore({
    kcal: nutricion.total.kcal,
    kcalObjetivo: nutricion.objetivos.kcal,
    proteinaG: nutricion.total.proteina_g,
    proteinaObjetivoG: nutricion.objetivos.proteina_g,
    aguaMl: agua.ml,
    aguaObjetivoMl: agua.objetivoMl,
    entrenamientos: entreno.deHoy.length,
    tocabaEntrenar: false,
    habitos: habitos.cuantos,
    habitosHechos: habitos.cuantosHechos,
    diaEnCurso: true,
  })

  const pasos = mision({
    momentosRegistrados: nutricion.items.map((i) => i.momento),
    proteinaG: nutricion.total.proteina_g,
    proteinaObjetivoG: nutricion.objetivos.proteina_g,
    aguaMl: agua.ml,
    aguaObjetivoMl: agua.objetivoMl,
    entrenamientos: entreno.deHoy.length,
  })

  // Nunca negativo en pantalla: pasarse del objetivo son «0 restantes», no
  // «-140 restantes», que se lee como si debieras calorias.
  const restantes = Math.max(0, nutricion.objetivos.kcal - nutricion.total.kcal)
  const progresoCalorias = nutricion.objetivos.kcal === 0 ? 0 : nutricion.total.kcal / nutricion.objetivos.kcal

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
          <Texto variante="titulo">
            {perfil?.nombre ? `Buenos días, ${perfil.nombre}` : 'Buenos días'}
          </Texto>
          {/* La fecha, no «Día 24 · Fase Definición»: sin alta guiada no hay
              fecha de inicio ni fase, e inventarlas es peor que no ponerlas. */}
          <Texto variante="tenue" style={{ marginTop: t.espaciado[1] }}>
            {fechaDeHoy ? fechaLarga(fechaDeHoy) : ' '}
          </Texto>
        </View>

        {/* 2. Kaizen Score */}
        <View style={{ alignItems: 'center' }}>
          <Anillo progreso={score / 100}>
            <Texto variante="heroe">{score}</Texto>
            <Texto variante="etiqueta" style={{ marginTop: t.espaciado[0], textAlign: 'center' }}>
              Kaizen Score
            </Texto>
          </Anillo>
          {/* Coach ya no tiene pestaña propia —salía la quinta y descuadraba el
              botón + del centro—, así que su entrada es este mensaje, que es
              donde el usuario ya lo lee. Sin la flecha no habría forma de
              saber que se puede pulsar, y la pantalla quedaría inalcanzable. */}
          <Pressable
            onPress={() => router.push('/coach')}
            accessibilityRole="button"
            accessibilityLabel="Abrir el coach"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.espaciado[1],
              marginTop: t.espaciado[3],
            }}
          >
            <Texto variante="tenue">{mensajeScore(score, true)}</Texto>
            <Feather name="chevron-right" size={TAMANO_ICONO_MISION} color={t.color.textoTenue} />
          </Pressable>
        </View>

        {/* Sin objetivos propios, todo lo de abajo se compara contra cifras
            genericas. Se dice y se ofrece arreglarlo, en vez de dejar que
            alguien confie en un objetivo que no es suyo. `hayObjetivos` es
            `null` mientras carga: asi no parpadea el aviso en cada arranque. */}
        {hayObjetivos === false && (
          <Pressable onPress={() => router.push('/alta')} accessibilityRole="button">
            <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.espaciado[3] }}>
                <Feather name="target" size={TAMANO_ICONO_MISION + 4} color={t.color.acento} />
                <View style={{ flex: 1 }}>
                  <Texto>Calcula tus objetivos</Texto>
                  <Texto variante="tenue" style={{ marginTop: t.espaciado[0] }}>
                    Ahora usamos cifras genéricas. Con tus datos serán las tuyas.
                  </Texto>
                </View>
                <Feather name="chevron-right" size={TAMANO_ICONO_MISION} color={t.color.textoTenue} />
              </View>
            </Superficie>
          </Pressable>
        )}

        {/* 3. Nutrición */}
        <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Texto variante="titulo">
              {enKcal(nutricion.total.kcal)} / {enKcal(nutricion.objetivos.kcal)}
            </Texto>
            <Texto variante="tenue">{enKcal(restantes)} restantes</Texto>
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
            {macros.map((macro) => (
              <View key={macro.clave} style={{ flex: 1 }}>
                <Texto variante="etiqueta">{macro.etiqueta}</Texto>
                <Texto style={{ marginTop: t.espaciado[0] }}>
                  {enGramos(macro.actual)}/{enGramos(macro.objetivo)}
                </Texto>
                <View style={{ marginTop: t.espaciado[1] }}>
                  {/* Más fina que la barra de calorías (por defecto 7, como
                      la de arriba): son tres, secundarias, y comparten fila. */}
                  <Barra
                    progreso={macro.objetivo === 0 ? 0 : macro.actual / macro.objetivo}
                    color={macro.color}
                    alto={5}
                  />
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
                {agua.cargando ? '—' : `${enLitros(agua.ml)} / ${enLitros(agua.objetivoMl)} L`}
              </Texto>
            </View>
            <View style={{ flexDirection: 'row', gap: t.espaciado[1] }}>
              {VASOS_ML.map((ml) => (
                <Boton
                  key={ml}
                  titulo={`+${ml}`}
                  tono="secundario"
                  deshabilitado={agua.cargando}
                  alPulsar={() => agua.anadir(ml)}
                />
              ))}
            </View>
          </View>
        </Superficie>

        {agua.errorAlGuardar && (
          <Texto variante="tenue" style={{ color: t.color.peligro }}>{agua.errorAlGuardar}</Texto>
        )}

        {/* 5. Entrenamiento */}
        <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: t.espaciado[2] }}>
              <Texto variante="etiqueta">Entrenamiento</Texto>
              <Texto variante="tenue" style={{ marginTop: t.espaciado[0] }}>
                {resumenEntrenamiento(entreno.cargando, entreno.deHoy)}
              </Texto>
            </View>
            <Boton
              titulo={entreno.deHoy.length > 0 ? 'Otro' : 'Registrar'}
              tono="primario"
              alPulsar={() => router.push('/registrar-entrenamiento')}
            />
          </View>
        </Superficie>

        {/* 6. Misión de hoy */}
        <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
          <Texto variante="etiqueta">Tu misión de hoy</Texto>
          <View style={{ marginTop: t.espaciado[3], gap: t.espaciado[2] }}>
            {pasos.map((item) => (
              <View key={item.clave} style={{ flexDirection: 'row', alignItems: 'center', gap: t.espaciado[1] }}>
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

        {/* 7. Habitos. Solo aparece si hay alguno: una tarjeta vacia invitando
            a configurar algo es ruido en la pantalla que se mira cada dia. La
            entrada para crearlos vive en Ajustes. */}
        {habitos.cuantos > 0 && (
          <Superficie fondo={t.superficie.tarjeta} radio={t.radio.tarjeta} style={{ padding: t.espaciado[4] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Texto variante="etiqueta">Hábitos</Texto>
              <Texto variante="tenue">{habitos.cuantosHechos}/{habitos.cuantos}</Texto>
            </View>
            <View style={{ marginTop: t.espaciado[3], gap: t.espaciado[2] }}>
              {habitos.deHoy.map((habito) => (
                <Pressable
                  key={habito.id}
                  onPress={() => habitos.alternar(habito)}
                  disabled={habitos.guardando}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: habito.hecho }}
                  accessibilityLabel={habito.nombre}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: t.espaciado[1] }}
                >
                  <Feather
                    name={habito.hecho ? 'check-circle' : 'circle'}
                    size={TAMANO_ICONO_MISION}
                    color={habito.hecho ? t.color.acento : t.color.textoTenue}
                  />
                  <Texto variante={habito.hecho ? 'tenue' : 'cuerpo'}>{habito.nombre}</Texto>
                </Pressable>
              ))}
            </View>
          </Superficie>
        )}
      </ScrollView>
    </Pantalla>
  )
}
