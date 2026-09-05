# TPV — Guía de uso para el personal del salón

Guía práctica y **sin tecnicismos** para el día a día en el mostrador: abrir la
caja, cobrar a un cliente, emitir una factura y cerrar la caja al final del
turno. Está pensada para leerse desde la tablet.

> Si algo no cuadra o aparece un aviso que no entiendes, salta al final:
> **[¿Y si algo va mal?](#y-si-algo-va-mal)**. Para incidencias más técnicas
> (descuadres de caja, saltos en la numeración de facturas) existe una guía
> aparte: **`MANTENIMIENTO.md`**.

---

## Un vistazo al flujo del día

```
   ABRIR CAJA          COBRAR (todas las veces que haga falta)        CERRAR CAJA
  ┌──────────┐   ┌──────────────────────────────────────────┐   ┌──────────────┐
  │  Fondo   │ → │  Ticket → cobro → (factura si la piden)   │ → │ Arqueo/cierre │
  │ inicial  │   │  efectivo · tarjeta · mixto               │   │  (contar €)  │
  └──────────┘   └──────────────────────────────────────────┘   └──────────────┘
```

1. **Al empezar el turno:** abres la caja con el dinero de cambio (el *fondo*).
2. **Durante el turno:** creas un ticket por cada cliente, cobras y, si lo pide,
   emites factura.
3. **Al terminar:** cuentas el efectivo del cajón y cierras la caja. El sistema
   te dice si cuadra.

---

## 1. Abrir la caja (al empezar el turno)

Antes de poder cobrar en efectivo hay que **abrir la caja del salón**. Solo puede
haber **una caja abierta por salón** a la vez.

1. Entra en la pantalla **Caja**.
2. Pulsa **Abrir caja**.
3. Escribe el **fondo inicial**: el dinero de cambio con el que arrancas el cajón
   (por ejemplo, 100 €). Cuenta las monedas y billetes y pon la cifra real.
4. Confirma. A partir de ese momento ya puedes cobrar.

> **¿Ya estaba abierta?** Si al pulsar «Abrir caja» ves el aviso **«Ya hay una
> caja abierta»**, es que alguien la abrió antes (por ejemplo, en el turno
> anterior no se cerró). No abras otra: continúa cobrando en la que ya está
> abierta, o ciérrala si el turno anterior olvidó hacerlo.

---

## 2. Cobrar a un cliente

### a) Crear el ticket

- **Desde el catálogo:** en la pantalla de **Cobro**, toca los servicios y
  productos que lleva el cliente. Se van sumando al ticket de la derecha.
- **Desde una reserva de la agenda:** si el cliente venía con cita, en la agenda
  verás el botón **Cobrar** sobre las reservas ya **completadas**. Al pulsarlo se
  abre un ticket **ya rellenado** con el servicio y el cliente de la cita. Solo
  tienes que añadir extras si los hay y cobrar.

Puedes **cambiar cantidades**, **quitar líneas** o **añadir más** en cualquier
momento mientras el ticket esté abierto.

### b) Aplicar un descuento (opcional)

En cada línea, o en el total, puedes aplicar un descuento:

- **Por porcentaje** (ej. 10 %), o
- **Por importe** (ej. 5 €).

El total se recalcula solo, con el IVA ya incluido. **No hace falta que calcules
nada a mano**: el precio que ves es el precio final.

### c) Cobrar

Pulsa **Cobrar** y elige cómo paga el cliente:

- **Efectivo:** escribe lo que entrega y el sistema te muestra el **cambio** a
  devolver.
- **Tarjeta:** marca el importe cobrado con el datáfono.
- **Pago mixto** (parte y parte): añade **dos o más formas de pago**. Por
  ejemplo, 40 € con tarjeta y 20 € en efectivo. La suma tiene que cubrir el total.

Cuando el pago cubre el total, el ticket queda marcado como **pagado**. ✅

> **Avisos habituales al cobrar:**
> - **«Falta importe»** → lo introducido no llega al total. Añade otro pago.
> - **«Sobrepago»** → en tarjeta no se puede cobrar de más; ajusta el importe.
>   En efectivo, el sistema ya calcula el cambio automáticamente.

---

## 3. Emitir una factura

No todos los tickets necesitan factura: solo emítela cuando el cliente **la
pida**. Se emite **a partir de un ticket** (normalmente ya cobrado).

1. Abre el ticket y pulsa **Emitir factura**.
2. **Si el cliente quiere factura con sus datos** (empresa o autónomo): rellena
   **razón social**, **NIF**, **dirección** y, si quiere, **email**.
3. **Si no da datos:** se emite una **factura simplificada** («cliente contado»),
   válida como tique.
4. Confirma. El sistema asigna el **número de factura** automáticamente (algo como
   `A/000123`) y la deja lista.
5. Pulsa **Imprimir** para guardarla como PDF o **Descargar** para archivarla.

> **Reglas importantes de facturación:**
> - **Cada ticket se factura una sola vez.** Si intentas emitir dos veces verás
>   **«Ticket ya facturado»**; para reimprimir, usa la factura que ya existe.
> - **No se puede facturar** un ticket **anulado**, **reembolsado** o **vacío**.
> - **La numeración es automática y correlativa.** Nunca escribas tú el número:
>   el sistema garantiza que no haya saltos ni repetidos.
> - **La factura no cambia una vez emitida.** Aunque después edites precios o
>   datos del salón, la factura ya emitida se reimprime **exactamente igual**
>   (guarda una «foto» de los datos del momento).

---

## 4. Movimientos de caja durante el turno (opcional)

Si sacas o metes efectivo del cajón por algo que **no es un cobro** (pagar al
repartidor, retirar recaudación, meter cambio…), regístralo para que la caja
cuadre al cierre:

- **Entrada:** metes dinero en el cajón (ej. añadir cambio).
- **Salida:** sacas dinero (ej. pagar una compra, retirar recaudación).

Pon siempre un **concepto** claro. Cada movimiento cuenta para el recuento final.

> Si no registras estas entradas/salidas, al cerrar la caja **aparecerá un
> descuadre** aunque no falte dinero de verdad.

---

## 5. Cerrar la caja (al final del turno)

1. Entra en **Caja** y pulsa **Cerrar caja / Arqueo**.
2. **Cuenta el efectivo real** del cajón (billetes y monedas) e introdúcelo.
3. El sistema calcula solo lo que **debería haber** (fondo inicial + cobros en
   efectivo + entradas − salidas) y lo compara con lo que has contado:
   - **Cuadra** ✅ → todo correcto.
   - **Sobra** 🔵 → hay más dinero del esperado.
   - **Falta** 🔴 → hay menos dinero del esperado.
4. Confirma el cierre. La sesión queda guardada en el **histórico**.

> El importe «teórico» lo calcula **siempre el sistema** con los datos reales del
> turno; tú solo aportas lo que cuentas. Así el descuadre es fiable.
>
> **¿La caja no cuadra?** Es lo más habitual y casi siempre tiene explicación
> sencilla (un cambio mal dado, un movimiento sin registrar). Antes de cerrar,
> repasa: ¿contaste bien?, ¿registraste todas las entradas y salidas?, ¿algún
> cobro en efectivo se apuntó como tarjeta? La guía **`MANTENIMIENTO.md`** tiene
> el paso a paso para investigar un descuadre.

---

## ¿Y si algo va mal?

| Lo que ves | Qué significa | Qué hacer |
|---|---|---|
| **«Ya hay una caja abierta»** | El salón tiene una caja sin cerrar. | Sigue cobrando en esa caja o ciérrala si es de un turno anterior. |
| **«Caja no abierta»** | Intentas cobrar/mover efectivo sin caja abierta. | Abre la caja primero (paso 1). |
| **«Falta importe»** | El pago no llega al total. | Añade otra forma de pago hasta cubrirlo. |
| **«Sobrepago»** | Con tarjeta se cobra de más. | Ajusta el importe al total exacto. |
| **«Ticket ya facturado»** | Ese ticket ya tiene factura. | Reimprime la factura existente, no emitas otra. |
| **«Ticket no facturable»** | El ticket está anulado, reembolsado o vacío. | No se puede facturar; revisa el ticket. |
| **La caja no cuadra** | Descuadre entre lo contado y lo esperado. | Repasa conteo y movimientos (ver `MANTENIMIENTO.md`). |
| **No te deja tocar un salón que no es el tuyo** | Cada persona solo ve **su salón**. | Es correcto y esperado; usa el salón que tienes asignado. |

Para cualquier otra cosa que no aparezca aquí, avisa al responsable del salón o
al equipo de HAT3X con una captura de la pantalla y qué estabas haciendo.
