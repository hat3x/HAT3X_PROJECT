## Tarea 9: Navegación, hoja del + y pantalla de acceso

**Ficheros:**
- Crear: `apps/kaizen/src/app/_layout.tsx`
- Crear: `apps/kaizen/src/app/(pestanas)/_layout.tsx`
- Crear: `apps/kaizen/src/app/(pestanas)/{index,nutricion,entrenamiento,evolucion,coach}.tsx`
- Crear: `apps/kaizen/src/app/anadir.tsx`
- Crear: `apps/kaizen/src/app/acceso.tsx`
- Test: `apps/kaizen/src/app/navegacion.test.tsx`

**Interfaces:**
- Consume: `ProveedorSesion`/`useSesion` (Tarea 4), `entrarConCorreo`/`registrarConCorreo`/`entrarConApple` (Tarea 5), `crearClienteConsultas`/`persistidor` (Tarea 6), `ProveedorTema`/`Texto`/`Boton` (Tarea 8).

- [ ] **Paso 1: Escribir el test que falla**

`src/app/navegacion.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native'
import Coach from './(pestanas)/coach'
import { ProveedorTema } from '@/design/proveedor'

it('Coach muestra su estado vacío explicando por qué', () => {
  render(<ProveedorTema nombre="defecto"><Coach /></ProveedorTema>)
  expect(screen.getByText(/todavía no tengo datos suficientes/i)).toBeTruthy()
})
```

- [ ] **Paso 2: Ejecutar y comprobar que falla**

Ejecutar: `npm test -- navegacion.test`
Esperado: FALLA con «Cannot find module './(pestanas)/coach'».

- [ ] **Paso 3: Implementar el layout raíz**

`src/app/_layout.tsx`:

```tsx
import { Stack, Redirect } from 'expo-router'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { ProveedorSesion, useSesion } from '@/datos/sesion'
import { crearClienteConsultas, persistidor } from '@/datos/cliente-consultas'
import { ProveedorTema } from '@/design/proveedor'
import { Pantalla } from '@/design/componentes/pantalla'

const cliente = crearClienteConsultas()

function Puerta() {
  const { sesion, cargando } = useSesion()
  // Nunca `null`: sin nada montado se ve el fondo por defecto de React Native
  // —blanco— y en una app oscura eso es un fogonazo en cada arranque lento.
  if (cargando) return <Pantalla />
  if (!sesion) return <Redirect href="/acceso" />
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(pestanas)" />
      <Stack.Screen name="anadir" options={{ presentation: 'modal' }} />
    </Stack>
  )
}

export default function Raiz() {
  return (
    <PersistQueryClientProvider
      client={cliente}
      persistOptions={{ persister: persistidor }}
      // Rehidratar NO reanuda nada por sí solo: `PersistQueryClientProvider`
      // solo restaura el estado. Sin esta llamada, lo que registraste sin
      // cobertura se guarda y no se envía jamás.
      onSuccess={() => cliente.resumePausedMutations()}
    >
      <ProveedorSesion>
        <ProveedorTema nombre="defecto">
          <Puerta />
        </ProveedorTema>
      </ProveedorSesion>
    </PersistQueryClientProvider>
  )
}
```

> **Aviso para quien escriba el bloque 1.** Una mutación persistida se serializa sin su función: al rehidratarse, TanStack Query la reconstruye con `mutationFn: undefined` y no tiene nada que ejecutar. Por eso **cada clave de mutación debe registrarse con `cliente.setMutationDefaults(clave, { mutationFn })` antes de que se restaure el estado**. En el bloque 0 no hay ninguna mutación de usuario todavía, así que no hay nada que registrar; en cuanto exista la primera —el vaso de agua— ese registro es obligatorio o la cola offline no reproduce nada.

- [ ] **Paso 4: Implementar la pestaña Coach**

`src/app/(pestanas)/coach.tsx`:

```tsx
import { View } from 'react-native'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

export default function Coach() {
  const t = useTema()
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: t.espaciado[5] }}>
      <Texto variante="titulo">Coach</Texto>
      <Texto variante="tenue" style={{ marginTop: t.espaciado[1] }}>
        Todavía no tengo datos suficientes sobre ti. Registra unos días y aquí
        empezaré a decirte cosas que valgan la pena.
      </Texto>
    </View>
  )
}
```

- [ ] **Paso 5: Implementar el layout de pestañas**

`src/app/(pestanas)/_layout.tsx`:

```tsx
import { Tabs, useRouter } from 'expo-router'
import { Pressable, View } from 'react-native'
import { Superficie } from '@/design/componentes/superficie'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

// Disposición, no tema: cuánto mide el botón central y cuánto sobresale de la
// barra. No hay token para esto porque no es «look», es geometría de esta barra.
const LADO_MAS = 52
const SOBRESALIENTE_MAS = 18

function BotonAnadir() {
  const t = useTema()
  const router = useRouter()
  return (
    <Pressable
      onPress={() => router.push('/anadir')}
      accessibilityRole="button"
      accessibilityLabel="Añadir registro"
      style={{
        width: LADO_MAS, height: LADO_MAS,
        borderRadius: LADO_MAS / 2, // círculo: derivado, no un radio inventado
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: t.color.acento,
        marginTop: -SOBRESALIENTE_MAS,
      }}
    >
      <Texto variante="titulo" style={{ color: t.color.sobreAcento }}>+</Texto>
    </Pressable>
  )
}

export default function LayoutPestanas() {
  const t = useTema()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.color.acento,
        tabBarInactiveTintColor: t.color.textoTenue,
        tabBarStyle: { position: 'absolute', borderTopWidth: 0, backgroundColor: 'transparent' },
        tabBarBackground: () => (
          <Superficie fondo={t.superficie.barraInferior} radio={0} style={{ flex: 1 }} />
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy' }} />
      <Tabs.Screen name="nutricion" options={{ title: 'Nutrición' }} />
      <Tabs.Screen
        name="anadir-hueco"
        options={{ title: '', tabBarButton: () => <BotonAnadir /> }}
      />
      <Tabs.Screen name="entrenamiento" options={{ title: 'Entreno' }} />
      <Tabs.Screen name="evolucion" options={{ title: 'Evolución' }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
    </Tabs>
  )
}
```

Crear también `src/app/(pestanas)/anadir-hueco.tsx` con `export default function Hueco() { return null }`. Existe solo para reservar el sitio central del **+**, que abre un modal en vez de navegar a una pestaña.

- [ ] **Paso 6: Implementar las otras tres pestañas**

`nutricion.tsx`, `entrenamiento.tsx` y `evolucion.tsx` copian exactamente la estructura de `coach.tsx` del Paso 4, cambiando el título y el texto:

- Nutrición → «Aquí verás tu histórico de comidas. Empieza registrando algo desde el botón +.»
- Entreno → «Tus entrenamientos aparecerán aquí en cuanto registres el primero.»
- Evolución → «Cuando lleves unas semanas registrando, aquí verás cómo has cambiado.»

`index.tsx` muestra por ahora el saludo y el contexto del día con `Texto`; el Home completo es del bloque 1.

- [ ] **Paso 7: Implementar la hoja del +**

`src/app/anadir.tsx`:

```tsx
import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Texto } from '@/design/componentes/texto'
import { useTema } from '@/design/proveedor'

const OPCIONES = [
  { clave: 'buscar',    titulo: 'Buscar alimento',   ruta: '/nutricion/buscar' },
  { clave: 'escanear',  titulo: 'Escanear código',   ruta: '/nutricion/escanear' },
  { clave: 'rapida',    titulo: 'Entrada rápida',    ruta: '/nutricion/rapida' },
  { clave: 'agua',      titulo: 'Agua',              ruta: '/agua' },
  { clave: 'entreno',   titulo: 'Entrenamiento',     ruta: '/entrenamiento/nuevo' },
  { clave: 'peso',      titulo: 'Peso',              ruta: '/peso/nuevo' },
] as const

export default function Anadir() {
  const t = useTema()
  const router = useRouter()
  return (
    <View style={{ flex: 1, padding: t.espaciado[3], gap: t.espaciado[1] }}>
      <Texto variante="etiqueta">Añadir</Texto>
      {OPCIONES.map((o) => (
        <Pressable
          key={o.clave}
          accessibilityRole="button"
          onPress={() => router.replace(o.ruta)}
          style={{ paddingVertical: t.espaciado[3] }}
        >
          <Texto>{o.titulo}</Texto>
        </Pressable>
      ))}
    </View>
  )
}
```

**Las seis rutas de destino se crean en el bloque 1.** Hasta entonces navegan a pantallas que no existen: al ejecutar este plan, deja las entradas visibles pero apuntando a `/` y anota el pendiente. No añadas opciones deshabilitadas ni «próximamente».

- [ ] **Paso 8: Implementar la pantalla de acceso**

`src/app/acceso.tsx`:

```tsx
import { useState } from 'react'
import { View, TextInput, Platform } from 'react-native'
import { Texto } from '@/design/componentes/texto'
import { Boton } from '@/design/componentes/boton'
import { useTema } from '@/design/proveedor'
import { entrarConCorreo, registrarConCorreo, entrarConApple } from '@/datos/autenticacion'

export default function Acceso() {
  const t = useTema()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function ejecutar(accion: () => Promise<{ error: string | null }>) {
    // Sin esta guarda, un segundo toque lanza otra petición: dos registros
    // con el mismo correo devuelven «ya existe» justo después de haber
    // funcionado, y el usuario ve un error tras algo que salió bien.
    if (ocupado) return
    setOcupado(true)
    setError((await accion()).error)
    setOcupado(false)
  }

  const campo = {
    borderWidth: 1, borderColor: t.color.borde, borderRadius: t.radio.boton,
    padding: t.espaciado[2], color: t.color.texto,
  }

  return (
    <Pantalla style={{ justifyContent: 'center', padding: t.espaciado[5], gap: t.espaciado[2] }}>
      <Texto variante="titulo">Entrar en KAIZEN</Texto>

      <TextInput
        style={campo}
        value={correo}
        onChangeText={setCorreo}
        placeholder="Correo"
        placeholderTextColor={t.color.textoTenue}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={campo}
        value={contrasena}
        onChangeText={setContrasena}
        placeholder="Contraseña"
        placeholderTextColor={t.color.textoTenue}
        secureTextEntry
      />

      {error && <Texto variante="tenue" style={{ color: t.color.peligro }}>{error}</Texto>}

      <Boton titulo={ocupado ? 'Un momento…' : 'Entrar'} deshabilitado={ocupado}
             alPulsar={() => ejecutar(() => entrarConCorreo(correo, contrasena))} />
      <Boton titulo="Crear cuenta" tono="secundario" deshabilitado={ocupado}
             alPulsar={() => ejecutar(() => registrarConCorreo(correo, contrasena))} />
      {Platform.OS === 'ios' && (
        <Boton titulo="Continuar con Apple" tono="secundario" deshabilitado={ocupado}
               alPulsar={() => ejecutar(entrarConApple)} />
      )}
    </Pantalla>
  )
}
```

- [ ] **Paso 9: Ejecutar y comprobar que pasa**

Ejecutar: `npm test` → todo PASA
Ejecutar: `npx tsc --noEmit` → sin errores

- [ ] **Paso 10: Comitear**

```bash
git add apps/kaizen/src/app
git commit -m "feat(kaizen): navegacion de cinco pestanas, hoja de anadir y acceso"
```

---

