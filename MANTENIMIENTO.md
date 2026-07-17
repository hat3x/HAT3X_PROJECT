# Mantenimiento — Salon OS

## Troubleshooting

### "Invalid API key" o errores 401 de Supabase
1. Verifica que `.env.local` existe y tiene `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` correctos.
2. Reinicia el servidor de desarrollo tras cambiar variables de entorno (Next.js las lee al arrancar).
3. Comprueba que la anon key es la del proyecto correcto (Dashboard → Project Settings → API).

### El login funciona pero /dashboard redirige a /login
- La cookie de sesión no se está refrescando. Comprueba que `src/middleware.ts` existe y que el `matcher` no excluye `/dashboard`.
- En producción detrás de proxy, verifica que el dominio de la cookie coincide con el dominio servido.

### "useSearchParams() should be wrapped in a suspense boundary"
- Cualquier componente cliente que use `useSearchParams` debe ir envuelto en `<Suspense>` (ya aplicado en `/login`). Replicar el patrón en páginas nuevas.

### Error de tipos tras cambiar el esquema de la base de datos
```bash
npx supabase gen types typescript --project-id <project-ref> > src/types/database.ts
npm run typecheck
```

### Estilos shadcn/ui no se aplican
- Verifica que la ruta del componente está cubierta por `content` en `tailwind.config.ts` (`./src/**/*.{ts,tsx}`).
- No mover componentes fuera de `src/`.

### TPV — "El cobro (X) no coincide con el total de la venta (Y)"
- Lo lanza `assertTendersCoverTotal` (`@/lib/payments`): la suma de los medios de pago debe igualar **exactamente** el total del ticket (no se admiten cobros parciales ni de más).
- Causa típica: importe introducido en euros/decimales en vez de **céntimos enteros**, o redondeo hecho fuera de la capa de pagos. Todo el dinero se maneja como céntimos; convertir en el borde de la UI y no antes.

### TPV — "Pasarela de pago no implementada: 'sumup'/'stripe'/'redsys'"
- `getPaymentGateway()` solo tiene implementada la pasarela `'manual'`. Los demás identificadores son objetivos del roadmap y lanzan error a propósito.
- Mientras no se desarrolle la integración real, usar `'manual'` (registro sin cobro). Ver la sección **Capa de pagos (`@/lib/payments`)** más abajo.

### TPV — el lector de carné (QR) no "escribe" en el campo / hay que pinchar cada vez
- El lector físico es un **HID "keyboard-wedge"**: teclea el `qr_token` del carné y pulsa **Enter** en el campo enfocado. El TPV mantiene el `<input>` de fidelización **siempre enfocado** (`useScannerFocus`, `src/hooks/use-scanner-focus.ts`) para que el escaneo aterrice sin clic. Si no ocurre:
  1. Configura el lector (con los códigos de setup de su manual) en modo **HID / emulación de teclado** (no "serie/COM") y con **sufijo Enter (CR/LF)**.
  2. Si el token sale con caracteres cambiados, fija el **layout de teclado ES** en el lector.
  3. El foco se **cede a propósito** mientras el cajero escribe (buscador, cantidad, precio, IVA, nota) o hay un diálogo/popover abierto (`src/lib/loyalty/scanner-focus.ts`): es lo esperado. En reposo debe recuperarse solo tras `SCANNER_RECLAIM_DELAY_MS` (80 ms).
  4. Sin lector, usa **la cámara** (*Escanear con cámara*, `camera-scan-button.tsx`) — requiere **HTTPS**.

### TPV — el ticket sale en blanco, en tamaño A4 o no imprime
- El ticket se imprime cargando un documento HTML autónomo en un **iframe oculto** y llamando a `window.print()` (`printTicketDocument`, `src/app/(dashboard)/tpv/print-ticket.ts`). Va contra el **driver del sistema** de la impresora, como cualquier impresora.
  1. Selecciona el **ancho de rollo** correcto (**80/58 mm**) en el diálogo *Venta registrada* **antes** de imprimir; el `@page` se dimensiona a ese ancho.
  2. En el diálogo de impresión del sistema, elige la impresora térmica y pon **márgenes = ninguno** y **escala 100%** (evita que recorte o reescale a A4).
  3. Si sale en blanco, suele ser bloqueo de pop-ups/iframes o impresora equivocada: reintenta y revisa que la térmica es la predeterminada del navegador del mostrador.

### TPV — «No se pudieron acreditar los puntos» al cerrar el cobro
- **El cobro SÍ quedó registrado.** La fidelización es **best-effort**: se acredita *después* de cerrar la venta y un fallo **nunca** revierte el cobro (`createSale`, `src/app/(dashboard)/tpv/actions.ts`).
- Pulsa **«Reintentar puntos»** en el recibo: reacredita sobre la **misma** venta sin volver a cobrar. Es **idempotente** (`ref = { pos_sale, saleId }`): si los puntos ya se habían sumado, muestra **«Fidelización ya acreditada»** y no duplica.
- Si el reintento persiste en fallar, revisa la conexión con Supabase y los logs `[tpv/createSale]` / `[tpv/retrySaleLoyalty]`. Es seguro reintentar las veces que haga falta.

### Facturación — "pos_invoices es un registro fiscal inmutable (Veri*factu)"
- Lo lanza el trigger `trg_pos_invoices_immutable` ante cualquier `UPDATE`/`DELETE` sobre `pos_invoices`, incluso desde `service_role`. **Es intencionado** (requisito legal).
- Para corregir una factura, **emite una factura rectificativa**; nunca edites ni borres el registro original.
- Corolario: **no se puede borrar un salón que tenga facturas** (el cascade choca con el trigger). Usar soft-delete (`update salons set active = false`).

### Facturación — hueco o salto en la numeración de una serie
- La numeración sin huecos la garantiza `emit.ts` + las restricciones `unique (salon_id, series, sequential_number)`. Un `insert` fallido **no deja fila**, así que no debería quedar hueco.
- Si observas un salto, revisa que no se estén **mezclando series** distintas (`A`, `B`…) en el mismo listado: cada serie es correlativa por separado. Verifica también la integridad de la cadena de huellas (ver abajo).

### Facturación — "insert or update violates foreign key (pos_invoices_chain_fkey)" al emitir
- El `previous_hash` de un registro debe corresponder a la huella del registro anterior **real** de la misma serie del salón. Se resuelve dentro de `emitInvoiceAction`; si aparece, suele indicar una **carrera** entre dos emisiones simultáneas: reintentar la emisión (el motor ya reintenta ante colisión de unicidad).
- Para auditar la cadena completa usa `verifyHashChain` (`@/lib/invoicing`) sobre las filas ordenadas por `sequential_number`.

### Facturación — el QR o el importe del documento no cuadra con lo cotejado en la AEAT
- `fecha` e `importe` de la URL de cotejo se formatean con los **mismos formateadores** que firman la huella (`spec-format.ts`): `dd-mm-yyyy` y euros con punto decimal. No reformatear por otra vía.
- El entorno del servicio de cotejo lo decide `VERIFACTU_ENVIRONMENT` (`test` → preproducción AEAT; cualquier otro valor → producción). En pruebas, un QR de `production` no validará contra preproducción y viceversa.

### Arqueo — "Ya hay una caja abierta. Ciérrala antes de abrir otra."
- El índice `uq_pos_sessions_open_per_location` permite **como mucho una sesión abierta** por (salón, sede). Cierra la sesión abierta (`/arqueo`) antes de abrir otra.
- Si la sesión quedó abierta por error y no hay cobros que arquear, ciérrala con efectivo contado = efectivo esperado (descuadre 0).

### Arqueo — el descuadre no cuadra con lo que espera el cajero
- El efectivo esperado se recalcula **en servidor** = `opening_float_cents` + Σ cobros en **efectivo** de la sesión (`pos_payments.session_id` con `method = 'efectivo'`). No cuenta tarjeta/Bizum (no mueven el cajón).
- Comprueba que los cobros llevan `session_id` de la caja correcta y que el método base (`pos_payments.method`) es el esperado. `cash_variance_cents` negativo = **falta** dinero en el cajón.

## Base de datos (Supabase)

### Aplicar migraciones
```bash
npx supabase link --project-ref <project-ref>   # una sola vez
npx supabase db push                            # aplica supabase/migrations/ en orden
```
Tras aplicar, regenerar tipos (ver arriba). Las migraciones son inmutables: para cambiar el esquema, crear una nueva con `npx supabase migration new <nombre>`.

### Modelo multi-tenant (resumen)
- **Tenant raíz:** `salons`. Toda tabla de dominio lleva `salon_id`.
- **RLS:** el acceso se resuelve por membresía en `salon_members` (roles `owner` > `manager` > `staff`). Los helpers viven en el esquema `app` (SECURITY DEFINER, no expuestos por PostgREST).
- **Integridad de tenant:** las FKs de `appointments`, `visits` y `professional_services` son compuestas `(fk_id, salon_id)` — la base de datos impide mezclar entidades de salones distintos. Al añadir tablas nuevas con FKs a entidades del salón, replicar este patrón.
- **Historial:** `appointment_history` y `customer_history` se escriben solo vía triggers; no tienen política de INSERT para clientes. `visits` se genera automáticamente al pasar una cita a `completed`.
- **Borrado de salones:** usar soft-delete (`active = false`). El DELETE físico puede chocar con las FKs RESTRICT de citas/visitas (intencionado).

### La cita no genera visita al completarse
- El trigger solo dispara en la **transición** a `completed` (`UPDATE ... SET status = 'completed'`). Si la cita ya estaba en `completed`, no re-genera (idempotente por `UNIQUE (appointment_id)`).

---

## TPV, caja y facturación

> ⚠️ **Aviso de conformidad fiscal.** Todo lo descrito aquí implementa los mecanismos técnicos del Reglamento Veri\*factu, pero **la conformidad legal del sistema de facturación debe validarla una gestoría/asesoría antes de emitir facturas de cara al público**, y el modo **VERI\*factu** (transmisión a la AEAT con certificado electrónico) **es fase futura, no implementada**. Ver el bloque completo **Conformidad fiscal (Veri\*factu) — gestoría + fase futura** al final de esta sección y en el [README](./README.md#aviso-de-conformidad-fiscal-veri-factu).

### Modelo de datos (mapa rápido)

Prefijo común `pos_` (Point of Sale). Dinero **siempre** en enteros de céntimos (`*_cents integer`), nunca `numeric`/`float`. Convención del esquema: identificadores en inglés, comentarios en español; FKs a entidades del salón **compuestas** `(fk_id, salon_id)` anti cross-tenant.

| Tabla | Rol | Notas clave |
|---|---|---|
| `products` | Catálogo de retail vendible | `price_cents` PVP con IVA incl.; `vat_rate` por producto; `stock` NULL = no inventariado; soft-delete `active` |
| `pos_payment_methods` | Métodos aceptados por salón | Autoprovisiona efectivo/tarjeta/bizum al crear el salón; `affects_cash_drawer` = cuenta en arqueo |
| `pos_sessions` | Sesión de caja (apertura→cierre) | Fondo inicial, efectivo esperado/contado, `cash_variance_cents`, `closing_totals` (jsonb) |
| `pos_sales` | Cabecera de venta / ticket | Totales snapshot: `total = subtotal − discount + tax`; vincula opcionalmente cita/cliente/profesional |
| `pos_sale_lines` | Líneas del ticket | Servicio **o** producto **o** cargo manual; `description`/`unit_price_cents`/`vat_rate` son snapshots; `quantity numeric(12,3)` |
| `pos_payments` | Pagos que liquidan la venta | Pago mixto = **varias filas**; casi inmutable (insert/delete, sin update); `method` (enum) es autoridad de reconciliación |
| `pos_invoices` | **Registro de facturación Veri\*factu** | **Inmutable** (trigger), encadenado por huella SHA-256, numeración sin huecos por serie; ticket F2 / completa F1 |

- **Modelo de precios: BRUTO (PVP, IVA incluido).** La base imponible y la cuota se **extraen** del bruto: `base = round(bruto / (1 + tipo/100))`, `cuota = bruto − base` (por diferencia → `base + cuota === bruto` exacto). Mapeo a snapshots: `pos_sale_lines.line_total_cents` (bruto de línea), `pos_sales.subtotal_cents` (Σ base), `pos_sales.tax_cents` (Σ cuota), `pos_sales.total_cents ≡ subtotal + tax`.
- **Pago mixto** no es un valor de enum: es simplemente `pos_payments` con más de una fila para la misma venta (`isMixedPayment(tenders)` lo detecta para la UI).
- **Snapshots inmutables:** las líneas guardan nombre/precio/IVA del momento de la venta; `pos_invoices` guarda `issuer_data`/`recipient_data` porque el salón/cliente puede cambiar después.
- **Detalle exhaustivo del esquema:** comentarios `comment on ...` en las migraciones `20260713170000_fiscal_base.sql`, `20260713180000_pos_base.sql` y `20260714100000_verifactu_invoices.sql`.

### Flujo de caja y arqueo

1. **Abrir caja** (`/arqueo` → `openSession`): registra `opening_float_cents` (fondo) y deja la sesión `open`. Como mucho **una sesión abierta por (salón, sede)** — lo fuerza `uq_pos_sessions_open_per_location`.
2. **Cobrar** (`/tpv`): cada venta y sus pagos cuelgan de la sesión abierta (`session_id`). Un ticket sin caja abierta puede cobrarse igualmente (`session_id` NULL), pero entonces no entra en el arqueo.
3. **Cerrar caja** (`closeSession`): recalcula **en servidor** (nunca se fía del cliente) a partir de `pos_payments` de la sesión:
   - `totalTakings` = Σ todos los métodos;
   - `expected_cash_cents` = fondo + Σ cobros en **efectivo**;
   - `cash_variance_cents` = **contado − esperado** (negativo = falta dinero);
   - `closing_totals` = snapshot jsonb de totales por método para el informe.
   El cierre está condicionado a `status = 'open'` (evita doble cierre por carrera). La lógica pura de sumas vive en `src/app/(dashboard)/arqueo/session-totals.ts`.

### Periféricos del TPV — lector de carné (HID) e impresora térmica

El TPV está pensado para un **mostrador con hardware de tienda**: un lector de códigos QR y una impresora de tickets térmica. **Ninguno necesita drivers propios de la app ni variables en `.env`**; se conectan en el sistema operativo del equipo del mostrador.

**Lector de carné (escáner HID, "keyboard-wedge").**
- Un lector QR/código de barras físico se comporta como un **teclado**: al escanear teclea el `qr_token` del carné y termina con **Enter**. No hay integración especial: basta un `<input>` que reciba ese texto.
- Para que un escaneo **aterrice siempre** sin que el cajero pinche el campo, el input de fidelización se mantiene **siempre enfocado** con el hook `useScannerFocus` (`src/hooks/use-scanner-focus.ts`) y la política **pura** `src/lib/loyalty/scanner-focus.ts`. El **Enter** envía el `<form>` → `onScan(qrToken)` → *lookup* del cliente.
- **Cede el foco** deliberadamente cuando el cajero escribe (buscador, cantidad, precio, IVA, nota) o hay un diálogo/popover abierto; lo **recupera** en reposo tras `SCANNER_RECLAIM_DELAY_MS` (80 ms). Así el escáner nunca interrumpe el resto del TPV.
- **Configuración del lector** (una vez, con los códigos de setup de su manual): modo **HID / teclado** (no serie/COM), **sufijo Enter (CR)** y layout **ES** si cambia caracteres.
- **Alternativa sin lector:** botón *Escanear con cámara* (`camera-scan-button.tsx` + normalización pura en `src/lib/loyalty/scan.ts`). Requiere **HTTPS** (`getUserMedia`).
- **El carné** codifica el token **en crudo** (`customer-qr.tsx`); `normalizeScannedToken` además tolera que venga envuelto en una URL (`?token=` / `?t=` / último segmento de ruta).

**Impresora térmica de tickets (58/80 mm).**
- Se imprime con `window.print()` sobre un **documento HTML autónomo** cargado en un **iframe oculto** (`printTicketDocument`, `src/app/(dashboard)/tpv/print-ticket.ts`); el documento lo genera la función **pura** `buildTicketDocumentHtml` (`src/lib/tpv/ticket-document.ts`).
- **No requiere driver propio de la app:** imprime contra el **driver del sistema** de la impresora (ESC/POS), igual que cualquier impresora. Conecta la térmica en el SO (USB/red/Bluetooth) y déjala como predeterminada del navegador del mostrador.
- **Ancho de rollo** seleccionable **80 mm (por defecto) o 58 mm** en el diálogo *Venta registrada*: ajusta el `@page` y el tipo de letra.
- El **porqué** del iframe oculto (aísla el tamaño de página de la app, sin pop-ups, generador puro y testeable) y el detalle del contenido del ticket están en **[`src/lib/tpv/README.md`](./src/lib/tpv/README.md)**.

**Mejora futura (NO implementada): impresión directa ESC/POS por WebUSB.**
- Hoy la impresión pasa por el **diálogo del sistema** (`window.print()`): universal, pero requiere una interacción y depende del driver instalado. Para un flujo "un toque → sale el ticket" se puede hablar **directamente** con la impresora por **[WebUSB](https://developer.mozilla.org/docs/Web/API/WebUSB_API)** enviando comandos **ESC/POS** (una util pura `buildTicketEscPos(data): Uint8Array` espejo del HTML, reutilizando el mismo `TicketDocumentData` como fuente de verdad).
- Es **Chromium-only** (Chrome/Edge/Android; **Safari/iOS no**) ⇒ debe **convivir** con `window.print()` como alternativa universal; requiere **gesto de usuario + HTTPS** y **emparejar el dispositivo por salón** (`vendorId`/`productId`/endpoint). Boceto completo, comandos y límites en **[`src/lib/tpv/README.md` → "Mejora futura … WebUSB"](./src/lib/tpv/README.md)**.

### Fidelización en el TPV — núcleo NATIVO y LOCAL (sin API externa)

- **Sin servicio externo ni claves.** La fidelización del TPV corre **íntegramente sobre el Supabase del propio proyecto** (módulo nativo `@/lib/loyalty/server`, esquema de la migración `20260716120000_loyalty_base.sql`). **No hay API HTTP externa que llamar ni variable `LOYALTY_API_KEY`** (ni ninguna otra credencial de fidelización): buscar `LOYALTY_API_KEY` en el repo **no** da resultados, y es lo correcto. Detalle del núcleo en **[`src/lib/loyalty/README.md`](./src/lib/loyalty/README.md)**.
- *(Nota de migración: convive un fichero proxy heredado `@/lib/loyalty` —`loyalty.ts`— hacia Edge Functions externas; los flujos del TPV **no** lo usan, van al módulo nativo `@/lib/loyalty/server`.)*
- **Flujos que toca el TPV** (todos en `src/app/(dashboard)/tpv/actions.ts`): *lookup* del cliente al escanear (`lookupLoyaltyByQr`), **acreditación de la visita al cerrar el cobro** (`awardVisit`) y **reintento manual** (`retrySaleLoyalty`).

**Acreditación best-effort + reintento (§sub-6/§sub-7).**
- La visita se acredita **después** de que el cobro esté firme. Un fallo aquí **nunca bloquea ni revierte** la venta: se registra en logs y la caja se comporta **igual que sin fidelización** (`loyalty: null`). El dinero manda; los puntos son secundarios.
- Cuando había cliente escaneado pero la acreditación falló, el recibo ofrece **«Reintentar puntos»** (tarjeta `LoyaltyRetryCard`). El reintento **no vuelve a cobrar** ni crea otra venta: reconstruye los importes desde las **líneas persistidas** (`pos_sale_lines.line_total_cents`, autoritativas, con el descuento del cupón ya prorrateado) y reacredita sobre la **misma** venta.
- **Idempotencia:** anclada en `ref = { pos_sale, saleId }`. Reintentar (o duplicar la venta) **no** vuelve a sumar puntos ni a canjear el cupón; si ya constaba acreditada, `awardVisit` devuelve `already_awarded` y el recibo muestra **«Fidelización ya acreditada»** en vez de un engañoso "+0 puntos".
- **Puntos:** por defecto `ceil(price_cents / 200)` por línea (~1 punto por cada 2 €), sobre lo **realmente cobrado**. Hitos (3/5/8/10) y recompensas: ver el README del núcleo.

### Capa de pagos (`@/lib/payments`)

Capa de dominio **pura** (sin React/Next/Supabase), con dos responsabilidades y su propio README ([`src/lib/payments/README.md`](./src/lib/payments/README.md)):

1. **Totales e IVA** (`computeSaleTotals` / `computeLineTotals` + `vatBreakdown`) — **fuente única** reutilizada por caja y facturación; la facturación **no recalcula** IVA.
2. **Abstracción de pasarela** (`PaymentGateway`): convierte los medios de pago (*tenders*) en filas de `pos_payments`. `registerPayment` **no persiste**: devuelve las filas para que el Server Action las inserte en su propia transacción, junto a la venta.

**Estado actual: pasarela `manual` (registro sin cobro real).** `getPaymentGateway()` devuelve hoy siempre `ManualPaymentGateway`, que **valida y registra** el método elegido pero **no ejecuta ningún cobro** (no habla con datáfono ni API de proveedor).

#### TODO — pasarela de pago real

La abstracción existe precisamente para que enchufar un proveedor **no toque el TPV**. Para integrar uno real:

1. Crear una clase que implemente `PaymentGateway` (p. ej. `SumUpGateway`).
2. Añadir su `case` en `getPaymentGateway()` (`src/lib/payments/index.ts`) — **único punto a tocar**.
3. La integración debe: **(a) autorizar el cobro ANTES** de devolver las filas; (b) devolver `status` distinto de `'registered'` si procede; (c) guardar la referencia del proveedor en `pos_payments.reference`; (d) manejar fallo/timeout lanzando un error de dominio que el TPV muestre sin dejar la venta a medias.

Objetivos del roadmap (identificadores ya reservados en `PaymentGatewayId`): **`sumup`** (datáfono Bluetooth para pymes), **`stripe`** (Terminal presencial / Payment Intents online), **`redsys`** (TPV bancario español, redirección + firma HMAC-SHA256). Ninguno está implementado: pedirlos hoy lanza error a propósito.

### Facturación Veri\*factu (`@/lib/invoicing`)

Motor de emisión de **registros de facturación de alta** en modo **NO VERI\*FACTU**, con su propio README ([`src/lib/invoicing/README.md`](./src/lib/invoicing/README.md)):

- **Emisión** (`emitInvoiceAction`, Server Action en `src/app/(dashboard)/tpv/invoice-actions.ts`): resuelve el número correlativo sin huecos y el eslabón anterior, y **inserta con reintento** ante colisión concurrente.
- **Inmutabilidad**: `pos_invoices` no tiene `updated_at` y el trigger `trg_pos_invoices_immutable` aborta `UPDATE`/`DELETE` a nivel de motor (por encima de RLS, bloquea incluso a `service_role`). Correcciones = **factura rectificativa**.
- **Encadenamiento**: `current_hash` = SHA-256 sobre la cadena canónica + `previous_hash` del registro anterior. `verifyHashChain` reverifica la integridad. Alterar un registro rompe la huella de todos los siguientes.
- **Numeración sin huecos**: `unique (salon_id, series, sequential_number)`; un `insert` fallido no deja fila.
- **Documento imprimible**: `GET /api/facturacion/documento/[id]` → HTML autónomo (Ctrl+P → PDF) con **QR de cotejo AEAT**, sello de tiempo, huella y desglose de IVA, y **aviso NO VERI\*FACTU** visible. Entorno del QR según `VERIFACTU_ENVIRONMENT`.
- **Libro registro**: `GET /api/facturacion/export?series=&from=&to=&format=csv|json` → descarga para la gestoría, restringida a `owner`/`manager` y aislada por `salon_id` resuelto en servidor.

### Conformidad fiscal (Veri\*factu) — gestoría + fase futura

> 🛑 **Antes de que un salón facture de cara al público:**
>
> 1. **Validación por gestoría obligatoria.** El sistema aporta los mecanismos técnicos (inmutabilidad, numeración sin huecos, huella SHA-256, desglose de IVA, sello de tiempo, QR AEAT), pero **la conformidad de un SIF depende de la configuración fiscal del negocio** (series, tipos de IVA, recargo de equivalencia, exenciones, rectificativas, datos del emisor). **HAT3X no da asesoramiento fiscal**: el titular debe validar la puesta en marcha con su gestoría y asume la responsabilidad legal.
> 2. **Modo NO VERI\*FACTU (conserva, no remite).** Los documentos se rotulan **«NO VERI\*FACTU»** (banner + leyenda del QR). El sistema conserva la cadena inalterable pero **no la envía a la AEAT en tiempo real**.
> 3. **VERI\*FACTU (transmisión a la AEAT con certificado) = FASE FUTURA.** La remisión automática con **certificado electrónico** del obligado tributario (firma, envío al servicio web de la AEAT, gestión de acuses/errores) **no está implementada**. No prometer transmisión a la AEAT al cliente hasta desarrollarla y validarla.
> 4. **Cobro no real.** La pasarela `manual` registra el pago pero **no cobra** contra ningún proveedor (ver la sección **Capa de pagos** y su TODO más arriba).

## Tareas periódicas

| Frecuencia | Tarea |
|---|---|
| Semanal | `npm outdated` — revisar actualizaciones de seguridad |
| Mensual | Actualizar dependencias menores y ejecutar `npm run build && npm run typecheck` |
| Tras cambios de esquema | Regenerar `src/types/database.ts` |

## Reglas del proyecto

- **TypeScript strict:** no introducir `any`. `tsconfig.json` tiene `noUncheckedIndexedAccess`: los accesos por índice devuelven `T | undefined` — manejar el caso.
- **Secretos:** `SUPABASE_SERVICE_ROLE_KEY` jamás en código cliente ni con prefijo `NEXT_PUBLIC_`. `.env.local` está en `.gitignore` — no comitear credenciales.
- **Auth:** las páginas protegidas verifican `getUser()` en el servidor además del middleware (defensa en profundidad). Mantener este patrón.
- **Componentes UI:** añadirlos con la CLI de shadcn (`npx shadcn@latest add <componente>`), no copiar a mano de otras fuentes.
