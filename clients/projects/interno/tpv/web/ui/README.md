# TPV — UI de cobro (React, tablet-first)

Capa de **interfaz** del punto de venta. Se monta sobre los hooks de dominio de
sub-3 (`tpv/web/hooks.ts`) y el núcleo de cálculo de sub-1 (`tpv/shared/money.ts`).
Es **aditiva**: no toca la agenda ni las reservas.

> Sub-tarea **sub-4**. Depende de sub-1 (esquema + `money.ts`), sub-2 (RLS) y
> sub-3 (Edge Functions + hooks TanStack Query).

## Qué resuelve

Pantalla de cobro rápida para el **mostrador en tablet**:

- **Catálogo** de servicios/productos con búsqueda y pestañas por categoría.
- **Ticket** (carrito) con stepper de cantidad, descuentos por línea y global,
  y desglose de totales/IVA en vivo.
- **Cobro** con selección de método, **efectivo con cálculo de cambio** y
  **pago mixto** (varios métodos en un ticket).
- **Confirmación** con el cambio a devolver bien visible.
- Estados de **carga** (skeletons), **vacío** (catálogo/ticket/búsqueda) y
  **error**, con **feedback táctil** (objetivos ≥ 56 px, pulsación física).

## Dirección visual

«Ticket de mostrador»: tinta cálida sobre papel, un único acento terracota,
superficies con sombra de pulsación (nada de glassmorphism ni neón), números
**tabulares** para que los importes no bailen. Color en `oklch`. Modo noche
opt-in (`tema="noche"`). Respeta `prefers-reduced-motion`.

## Estructura

```
web/ui/
├── tokens.css              Design tokens (color oklch, tipografía, toque, sombras)
├── tpv.css                 Estilos de componentes (importa tokens.css)
├── formato.ts              euros() · porcentaje() · numeroTicket() (es-ES, Intl)
├── catalogo.ts             ItemCatalogo + filtrar/agrupar por categoría
├── carritoReducer.ts       Estado local del carrito (reducer puro) → LineaInput
├── iconos.tsx              Set de iconos SVG inline (sin dependencias)
├── primitivas.tsx          Boton · Stepper · Skeleton* · Vacio · Spinner
├── CatalogoPanel.tsx       Panel izquierdo: búsqueda, categorías, rejilla
├── TicketPanel.tsx         Rail derecho: líneas, totales, cobrar
├── LineaTicket.tsx         Fila de carrito (cantidad + descuento + total)
├── DescuentoSheet.tsx      Editor de descuento (importe/% con teclado)
├── PanelPago.tsx           Cobro: métodos, efectivo+cambio, mixto
├── Confirmacion.tsx        Éxito + cambio + nuevo ticket
├── PantallaCobro.tsx       Orquestador (compra → pago → confirmado)
├── PantallaCobro.example.tsx   Demo con catálogo/métodos mock
└── index.ts                Barrel de exportación
```

## Uso

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PantallaCobro } from 'tpv/web/ui';
import 'tpv/web/ui/tpv.css';           // una sola vez en el arranque

<QueryClientProvider client={new QueryClient()}>
  <PantallaCobro
    supabase={supabase}               // cliente autenticado (JWT del usuario)
    salonId={salonId}
    catalogo={catalogo}               // ItemCatalogo[] (tu propio fetch)
    metodosPago={metodosPago}         // MetodoPago[] del salón
    sesionCajaId={sesionCajaId}       // opcional, para el cuadre de efectivo
    onRecibo={(ventaId) => imprimir(ventaId)}
  />
</QueryClientProvider>
```

El **catálogo** y los **métodos de pago** se inyectan por props: la capa de API
de sub-3 modela tickets, no el catálogo del salón. Trae esos datos con tu propio
fetch (Supabase, config del salón) y pásalos a la pantalla.

## Contrato con el servidor (dinero autoritativo)

- El carrito es **estado local** y se **previsualiza** con `money.ts` (idéntico
  al servidor). Sólo se toca la red al **cobrar**:
  1. **Cobrar** → `useCrearTicket` (o `useActualizarLineas` si ya existe) envía
     las líneas; el servidor recalcula y devuelve el `total` autoritativo.
  2. **Confirmar** → `useRegistrarPago` registra el/los pago(s) y marca
     `pagada`.
- La UI **acota el importe al pendiente** para no provocar `SOBREPAGO`; el
  exceso de efectivo se muestra como **cambio** (no se envía como pago).
- Los descuentos se emiten como `descuento` **o** `descuento_pct` (excluyentes,
  según el esquema Zod), nunca ambos.
- Los errores de la API (`ErrorTpv`) se muestran al cajero (banner al ir a cobro,
  inline en el panel de pago).

## Accesibilidad

- Roles/labels en diálogos (`role="dialog"`, `aria-modal`), grupos de stepper,
  `aria-pressed` en pestañas y métodos, `aria-busy`/`aria-live` en zonas que
  cambian, foco visible de alto contraste.
- Objetivos de toque grandes y teclados numéricos para importe y descuento.
- `prefers-reduced-motion` desactiva las animaciones.

## Peer deps

`react`, `@tanstack/react-query`, `@supabase/supabase-js` (más `zod` vía la capa
compartida). Sin librerías de UI ni de iconos: los estilos son CSS propio y los
iconos son SVG inline.

## Pendiente / integración

- Proveer `catalogo` y `metodosPago` reales (fetch del salón).
- Enganchar `onRecibo` a la impresión/envío del recibo (fuera de sub-4).
- Verificación visual en tablet y prueba de humo del flujo completo con las
  Edge Functions desplegadas (requiere entorno Supabase; no disponible en el
  entorno del agente).
