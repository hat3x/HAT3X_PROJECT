# MEMORIA TÉCNICA DEL PROGRAMA DE ORDENADOR
## A efectos de inscripción en el Registro de la Propiedad Intelectual

---

### 1. DATOS IDENTIFICATIVOS

| Campo | Dato |
|---|---|
| **Título de la obra** | Plataforma Digital de Pedidos |
| **Tipo de obra** | Programa de ordenador (software) |
| **Versión** | 1.0 |
| **Fecha de creación** | 2026 |
| **Autor / Desarrollador** | Jose Miguel Gonzalez Domingo |
| **Titular de los derechos** | Jose Miguel Gonzalez Domingo |
| **Lugar de divulgación** | España (publicación en dominio web propio) |

---

### 2. BREVE DESCRIPCIÓN DEL PROGRAMA

La obra es una **plataforma digital de autopedido y gestión para establecimientos de restauración y hostelería**. Permite que un cliente, desde su propio teléfono móvil y sin necesidad de instalar ninguna aplicación, consulte la carta, realice un pedido, lo pague de forma segura y siga su preparación en tiempo real; y que el personal del local reciba, gestione y entregue esos pedidos desde una aplicación de tablet.

El programa se compone de **tres módulos integrados**:

1. **Aplicación del Cliente (web / PWA).** Interfaz pública accesible mediante un enlace o código QR. Incluye: navegación de la carta por categorías (entrantes, raciones, ensaladas, combos, bebidas, etc.), fichas de producto con información de alérgenos, filtro de alérgenos, carrito de la compra, selección de variantes (tamaños, sabores y combos con selección de productos), un **asistente conversacional con Inteligencia Artificial** que recomienda productos, pasarela de pago integrada, seguimiento del pedido en tiempo real, alarma sonora y notificaciones push de «pedido listo».

2. **Panel del Personal (aplicación Android / dashboard).** Aplicación empaquetada como APK para tablet, con tres áreas operativas: **Caja** (registrar y cobrar pedidos, panel del día), **Cocina** (sistema KDS de preparación por estados) e **Histórico** (consulta y agregación de ventas). Incluye gestión de productos **agotados** por establecimiento y avisos sonoros de pedido entrante.

3. **Backend / Servidor.** Base de datos relacional, lógica de negocio (numeración diaria de pedidos por establecimiento, cálculo y validación de importes, control de disponibilidad), autenticación del personal por roles, sincronización en tiempo real, funciones de servidor para pago y notificaciones, y reglas de seguridad a nivel de fila.

**Funcionalidades singulares:** numeración de pedido diaria por establecimiento, recálculo y verificación del importe en servidor (anti-manipulación), gestión de disponibilidad por ingrediente y por producto que se refleja al instante en la carta, asistente de IA conectado a la carta real, y sistema de avisos (alarma web + notificación push) para cliente y personal.

---

### 3. LENGUAJES DE PROGRAMACIÓN Y TECNOLOGÍAS

| Lenguaje / Tecnología | Uso dentro del programa |
|---|---|
| **TypeScript** | Lenguaje principal de las dos aplicaciones (cliente y panel) |
| **JavaScript (JSX/TSX)** | Componentes de interfaz mediante la biblioteca **React 18** |
| **HTML5 / CSS3** | Estructura y estilos (framework **Tailwind CSS**, componentes shadcn/ui) |
| **SQL / PL/pgSQL** | Esquema, vistas, funciones y disparadores de la base de datos PostgreSQL |
| **TypeScript (Deno)** | Funciones de servidor (Edge Functions): pago y notificaciones |
| **Python** | Utilidades auxiliares de procesado de imágenes (eliminación de fondo) |
| **Bash / scripts** | Automatización de compilación y despliegue |

**Bibliotecas y frameworks principales:** React, Vite (empaquetador), React Router, TanStack Query, Zustand (estado), Framer Motion (animación), Tailwind CSS + shadcn/ui, Capacitor (empaquetado Android), pasarela de pago (Stripe), cliente de base de datos (Supabase JS), web-push / Service Workers (notificaciones), Web Audio API (alarma).

---

### 4. ENTORNO OPERATIVO

**4.1. Aplicación del Cliente**
- Ejecución en **navegador web moderno** (Chrome, Safari, Firefox, Edge) sobre Android e iOS, y como **PWA** instalable en pantalla de inicio.
- Requiere conexión a Internet y protocolo seguro **HTTPS**.
- Distribución mediante alojamiento web en un dominio propio.

**4.2. Panel del Personal**
- **Aplicación Android nativa** (APK) generada con **Capacitor** (motor WebView), instalable en tablet.
- Sistema operativo **Android 7.0 o superior**.

**4.3. Backend / Servidor**
- Plataforma en la nube (Supabase): base de datos **PostgreSQL 15**, **Edge Functions** (runtime Deno), servicio de **Autenticación**, **Realtime** (WebSocket) y **Storage**.
- Pasarela de pago externa (Stripe).
- Servicio de notificaciones push estándar de los navegadores (Web Push / VAPID).

**4.4. Entorno de desarrollo**
- Node.js + Vite; control de versiones Git; compilación Android con Gradle + JDK 21.

---

### 5. DIAGRAMA DE FLUJO

Flujo principal de un pedido (del cliente a la entrega):

```
            ┌──────────────────────────────────────────────┐
            │   CLIENTE (móvil / navegador · PWA)           │
            └──────────────────────────────────────────────┘
                                │
                    Abre el enlace / QR del local
                                ▼
                 ┌───────────────────────────┐
                 │  Selección de local        │
                 └───────────────────────────┘
                                ▼
        ┌───────────────────────────────────────────────┐
        │  Carta: categorías, fichas, alérgenos          │
        │  (Asistente IA recomienda productos)           │
        │  Productos AGOTADOS ocultos/avisados ◄─────────┼──┐
        └───────────────────────────────────────────────┘  │
                                ▼                           │
                 ┌───────────────────────────┐              │
                 │  Carrito + variantes        │             │ (estado de
                 │  (tamaños, sabores, combos) │             │  agotados
                 └───────────────────────────┘              │  en tiempo
                                ▼                           │  real)
                 ┌───────────────────────────┐              │
                 │  Pago seguro (pasarela)     │             │
                 └───────────────────────────┘              │
                                ▼                           │
   ┌──────────────────────────────────────────────────┐    │
   │  SERVIDOR                                         │    │
   │   • Recalcula y valida el importe (anti-fraude)  │    │
   │   • Crea el pedido y asigna Nº diario por local  │    │
   │   • Verifica el pago (webhook de la pasarela)    │    │
   └──────────────────────────────────────────────────┘    │
              │  (sincronización en tiempo real)            │
              ▼                                             │
   ┌──────────────────────────────────────────────────┐    │
   │  PANEL DEL PERSONAL (tablet Android)             │    │
   │                                                  │    │
   │   CAJA ──► registra/cobra ──► envía a:           │    │
   │      ├─► COCINA (KDS): recibido→preparando→listo │    │
   │      └─► BEBIDAS: recibido→preparando→listo      │────┘
   │   (aviso sonoro al entrar pedido)                │
   │   HISTÓRICO: ventas y agregados                  │
   │   AGOTADOS: marca ingredientes/productos         │
   └──────────────────────────────────────────────────┘
              │  (pedido marcado «listo»)
              ▼
   ┌──────────────────────────────────────────────────┐
   │  Aviso al CLIENTE:                               │
   │   • Alarma sonora en pantalla                    │
   │   • Notificación push (móvil bloqueado)          │
   │   → «¡Tu pedido está listo!» → recogida          │
   └──────────────────────────────────────────────────┘
```

---

### 6. LISTADO DE FICHEROS

El código fuente se organiza en tres componentes. Resumen cuantitativo:

| Componente | Ficheros de código fuente |
|---|---|
| Aplicación del Cliente (TypeScript/React) | 101 (.ts/.tsx) |
| Panel del Personal (TypeScript/React) | 76 (.ts/.tsx) |
| Funciones de servidor (Deno) | 6 |
| Migraciones de base de datos (SQL) | 58 |

**6.1. Aplicación del Cliente**

- `src/pages/` — páginas principales: aplicación de cliente, índice y página de error.
- `src/components/client/` — 20 componentes de interfaz: pantalla de bienvenida, selector de local, cabecera, rejilla y pestañas de categorías y secciones, ficha de producto, tarjeta de combo, diálogo de selección de combo, hoja de carrito, pasarela embebida, seguimiento de pedido, asistente conversacional y su avatar/animación, pantalla promocional, e iconografía y avisos de alérgenos y de alcohol.
- `src/components/ui/` — 49 componentes de interfaz reutilizables (biblioteca shadcn/ui).
- `src/hooks/` — lógica reutilizable: carta, disponibilidad/agotados, alérgenos, restricciones por local, notificaciones push, detección de dispositivo, avisos.
- `src/lib/` — utilidades de dominio: estado del carrito, local activo, combos, mapas de imágenes de producto y bebida, imágenes de sección, filtro de alérgenos, alarma sonora, redirección de pago, integración de pasarela y utilidades generales.
- `src/integrations/` — cliente y tipos de la base de datos.
- `src/main.tsx`, `index.html`, `public/sw.js` (Service Worker de notificaciones).
- `supabase/functions/` — 6 funciones de servidor: creación y confirmación de pago, webhook de pago, creación de checkout, notificación de pedido listo y asistente de carta (IA).
- `supabase/migrations/` — 58 ficheros `.sql` (esquema, seguridad RLS, funciones, vistas y disparadores).

**6.2. Panel del Personal**

- `src/pages/` — inicio de sesión, selector de local, Caja, Cocina, Histórico, Agotados, índice y página de error.
- `src/components/` — cabecera de personal, enlace de navegación, ruta protegida y guarda de sesión (+ componentes de interfaz `ui/`).
- `src/hooks/` — autenticación, detección de dispositivo y avisos.
- `src/lib/` — cliente de base de datos, local del personal, alarma sonora, mapas de imágenes de producto/bebida/ingrediente y utilidades generales.
- `src/App.tsx`, `src/main.tsx`, `capacitor.config.ts`, proyecto nativo `android/`.

**6.3. Recursos**

- Ilustraciones de productos (bebidas, entrantes, raciones, combos) e iconografía de alérgenos, en formato PNG con fondo transparente.
- Ficheros de configuración del proyecto: `package.json`, `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`.

---

### 7. DECLARACIÓN SOBRE LA AUTORÍA Y EL USO DE INTELIGENCIA ARTIFICIAL

**Intervención del autor.** El autor es quien concibe la obra y define su finalidad, alcance y funcionalidades. Su intervención ha consistido, de forma concreta, en: la concepción y diseño del producto (experiencia de usuario, flujos de pedido, pantallas y arquitectura de los tres módulos —aplicación de cliente, panel de personal y servidor—); la definición de los requisitos funcionales y de las reglas de negocio (numeración diaria de pedidos por establecimiento, recálculo y validación de importes en servidor, gestión de disponibilidad por ingrediente y producto, ciclo de estados del pedido, control de accesos por roles, avisos y notificaciones); la selección de las tecnologías y la organización de los componentes; la toma de todas las decisiones de diseño funcionales y estéticas; y un trabajo continuo de prueba en operación real, depuración, corrección, adaptación e integración de cada parte hasta obtener el resultado final. El autor ha ejercido en todo momento el control creativo y la supervisión del conjunto, asumiendo la responsabilidad sobre la obra resultante.

**Alcance del uso de herramientas de inteligencia artificial.** Durante el desarrollo se emplearon asistentes basados en inteligencia artificial como herramienta auxiliar de apoyo a la programación y a la redacción, con el fin de agilizar la implementación de las instrucciones y especificaciones dadas por el autor. La herramienta de IA no concibió la obra de manera autónoma: operó siempre bajo la dirección continua del autor, quien especificó cada requisito, revisó, validó o corrigió cada resultado, adoptó todas las decisiones de arquitectura y diseño, y se encargó de seleccionar, adaptar, integrar y verificar el código generado. La originalidad, la estructura, las elecciones funcionales y la expresión creativa resultante son atribuibles al autor; el uso de la IA fue un medio de ejecución, equiparable a otras herramientas de desarrollo de software (editores, compiladores, bibliotecas), sin sustituir la aportación intelectual humana, que es la determinante en la creación de la obra.

---

### 8. DECLARACIÓN

La presente memoria describe de forma sucinta el programa de ordenador objeto de inscripción, su funcionalidad, los lenguajes y entorno empleados, su flujo de funcionamiento y la relación de ficheros que componen su código fuente, cuyo contenido íntegro se aporta como ejemplar de la obra a efectos del Registro de la Propiedad Intelectual.

_Documento generado para la solicitud de inscripción. La fecha de firma deberá completarse en el momento de la presentación._
