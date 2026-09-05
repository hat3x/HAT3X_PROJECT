# TPV — Mantenimiento y resolución de incidencias

Guía técnica para el responsable del salón y el equipo de HAT3X. Cubre las dos
incidencias operativas más frecuentes del TPV —**descuadres de caja** y
**numeración de facturas**— más un bloque de errores generales y comprobaciones
de salud del módulo.

- Para el uso diario del mostrador: **`GUIA-USO.md`**.
- Para el detalle de arquitectura, endpoints y esquema: **`README.md`** (este
  directorio) y **`db/README.md`**.

> **Regla de oro de este módulo:** el servidor es **autoritativo del dinero y de
> la numeración**. El navegador nunca fija totales, ni el efectivo teórico, ni el
> número de factura. Si algo «no cuadra», el origen casi siempre está en los
> **datos de entrada** (conteo, movimientos, método de pago mal elegido), no en
> el cálculo.

---

## Parte 1 — Descuadres de caja

### 1.1 Cómo se calcula el arqueo (qué compara el sistema)

El cierre de caja compara dos cifras. Solo una la introduce el cajero:

```
efectivo_teorico = saldo_inicial (fondo)
                 + Σ cobros en EFECTIVO   (con signo: el cambio devuelto resta)
                 + Σ entradas manuales
                 − Σ salidas manuales

descuadre = efectivo_real (contado por el cajero) − efectivo_teorico
```

- **`descuadre < 0` → FALTA** dinero en el cajón.
- **`descuadre > 0` → SOBRA** dinero en el cajón.
- **`|descuadre| < tolerancia` → CUADRA** (la tolerancia absorbe redondeos de
  céntimos; ver `TOLERANCIA_EUR` en `shared/money.ts`).

El cálculo vive en `shared/caja.ts` (`calcularArqueo`) y es **idéntico en cliente
y servidor**: la tablet previsualiza el arqueo mientras se cuenta, pero el cierre
que se guarda lo recalcula el servidor con los datos persistidos. **Solo tocan el
cajón los cobros en efectivo**; tarjeta, bizum y transferencia no afectan al
teórico de efectivo.

### 1.2 Causas frecuentes de descuadre y cómo resolverlas

| Síntoma | Causa probable | Cómo verificar | Solución |
|---|---|---|---|
| **Falta** una cantidad redonda parecida a un ticket | Un cobro en **efectivo** se registró como **tarjeta** (o al revés) | Revisa el desglose de cobros de la sesión frente al datáfono | Corrige el método en el cobro; si ya está cerrada, deja constancia en el parte de caja |
| **Falta** o **sobra** el importe de una compra/retirada | Entrada o salida de efectivo **no registrada** | ¿Hubo pagos a proveedores, retiradas o aportes de cambio sin apuntar? | Registrar siempre el movimiento (`entrada`/`salida`) en el momento; no cerrar hasta reflejarlo |
| **Sobra** justo el fondo | Se contó el **fondo inicial** como recaudación, o se abrió con un fondo distinto al real | Compara `saldo_inicial` de la sesión con lo que realmente había | Ajustar el conteo; abrir siempre con el fondo **real** contado |
| **Falta** el importe de un cambio | Se devolvió cambio pero el cobro en efectivo no incluyó la línea de cambio negativa | Revisa que los cobros en efectivo con devolución tengan el cambio con signo negativo | Cobrar el efectivo con su cambio (importe negativo) como indica la guía |
| Descuadre de **céntimos** | Redondeo normal | `|descuadre|` por debajo de la tolerancia → el sistema marca **cuadra** | No requiere acción |
| Descuadre que **cambia** al recontar | Error de conteo físico | Recuenta billetes y monedas por separado | Introducir el conteo correcto antes de confirmar el cierre |

### 1.3 Procedimiento ante un descuadre (antes de confirmar el cierre)

1. **No confirmes el cierre todavía.** Mientras la caja siga abierta puedes
   seguir investigando.
2. **Recuenta** el efectivo físico (billetes y monedas por separado).
3. **Revisa los movimientos manuales** de la sesión: ¿falta alguna entrada o
   salida por registrar? Añádela.
4. **Contrasta los cobros en efectivo** con el ticket del datáfono: lo que fue a
   tarjeta no debe estar en el efectivo y viceversa.
5. Vuelve a mirar el arqueo. Si ahora **cuadra**, cierra.
6. Si sigue sin cuadrar, **cierra igualmente con el efectivo real contado**: el
   descuadre queda **registrado** en el histórico de la sesión (es un dato
   contable, no un bloqueo). Anota la causa probable en el parte del salón.

> El cierre **nunca** se «fuerza a cuadrar» ajustando el teórico. El teórico es
> el registro fiel de lo que debería haber; el descuadre es información, no un
> error a ocultar.

### 1.4 Consultas SQL de apoyo (equipo HAT3X)

> Ejecutar con el rol adecuado; la RLS por `salon_id` limita la visibilidad al
> salón del usuario. Sustituye `:sesion_id` por el identificador de la sesión.

```sql
-- Desglose de cobros de una sesión: efectivo vs. resto.
-- (el efectivo es el método con codigo = 'efectivo'; es lo único que toca el cajón)
SELECT mp.codigo, mp.nombre,
       count(*) AS apuntes, sum(p.importe) AS total
FROM   tpv_pagos p
JOIN   tpv_metodos_pago mp ON mp.id = p.metodo_pago_id
WHERE  p.sesion_caja_id = :sesion_id
  AND  p.estado = 'completado'
GROUP  BY mp.codigo, mp.nombre;

-- Movimientos manuales de la sesión (entradas/salidas).
SELECT tipo, importe, motivo, created_at
FROM   tpv_movimientos_caja
WHERE  sesion_caja_id = :sesion_id
ORDER  BY created_at;
```

> Los nombres exactos de tablas/columnas están en las migraciones
> `20260713000001_tpv_module` (ventas/pagos/métodos) y `20260713000004_tpv_caja`
> (sesiones y movimientos). Ajusta si tu esquema difiere.

---

## Parte 2 — Numeración de facturas

### 2.1 Cómo funciona la numeración (por qué NO debería haber saltos)

- La factura se identifica por **`(salon_id, serie, numero)`**, con la referencia
  visible **`SERIE/NÚMERO`** rellenada a la izquierda (p. ej. `A/000123`).
- El **número lo asigna la base de datos**, no la aplicación, mediante el trigger
  `tpv_asignar_numero_factura()` (migración `20260713000001_tpv_module`):

  ```sql
  -- Bajo advisory lock por (salon_id, serie): correlativo SIN saltos y seguro
  -- ante concurrencia (dos cajeros emitiendo a la vez).
  numero := COALESCE(MAX(numero), 0) + 1
            WHERE salon_id = NEW.salon_id AND serie = NEW.serie;
  ```

- **Un ticket = una factura:** `UNIQUE(venta_id)` en `tpv_facturas`. El segundo
  intento devuelve `TICKET_YA_FACTURADO` (código Postgres `23505`).
- La factura es un **snapshot inmutable**: al emitir se congelan emisor, cliente,
  desglose de IVA y líneas. Reeditar el ticket o la config **no** altera facturas
  ya emitidas.

### 2.2 Incidencias de numeración y cómo resolverlas

| Síntoma | Causa | Verificación | Solución |
|---|---|---|---|
| **«Ticket ya facturado»** al emitir | El ticket ya tiene factura (`UNIQUE(venta_id)`) | `SELECT * FROM tpv_facturas WHERE venta_id = :venta_id` | No re-emitir: **reimprimir** la factura existente (`tpv-obtener-factura` por `venta_id`) |
| **«Ticket no facturable»** | Ticket **anulado**, **reembolsado** o **sin líneas** | Revisa el estado y las líneas del ticket | Solo se factura un ticket con líneas y en estado facturable |
| Un número parece **saltado** | Suele ser un **cambio de serie** (cada serie tiene su propio correlativo desde 1), no un salto real | Compara la serie de las facturas «antes» y «después» | Comportamiento correcto: la numeración es correlativa **por serie**. Documentar el cambio de serie |
| El número **reinicia en 1** | Se cambió `serie_por_defecto` o se pasó otra `serie` en la emisión | `SELECT serie, max(numero) FROM tpv_facturas WHERE salon_id = :salon GROUP BY serie` | Es el comportamiento fiscal esperado al abrir serie nueva. Confirmar que el cambio fue intencionado |
| Dos emisiones simultáneas | El **advisory lock** serializa la asignación: no hay duplicados ni saltos | — | No requiere acción; es seguro por diseño |
| Factura reimpresa **sale distinta** a la original | No debería ocurrir: el snapshot es inmutable | Compara `lineas_snapshot`/`desglose_iva`/emisor de la fila | Si difiere, es un incidente grave: **escalar a HAT3X** (posible manipulación de datos) |

### 2.3 ¿De verdad falta un número? Diagnóstico

Un «hueco» aparente casi nunca es un salto de numeración. Comprueba **en este
orden**:

1. **¿Es la misma serie?** Cada serie numera desde 1 de forma independiente. Un
   `A/45` seguido de `B/1` no es un salto.
2. **¿Se anuló la factura?** Si el flujo permite anulaciones, el número anulado
   sigue existiendo (no se reutiliza) — eso es correcto fiscalmente.
3. **Consulta la continuidad real:**

   ```sql
   -- Busca huecos en la secuencia por (salon, serie).
   WITH s AS (
     SELECT serie, numero,
            numero - LAG(numero) OVER (PARTITION BY serie ORDER BY numero) AS salto
     FROM   tpv_facturas
     WHERE  salon_id = :salon_id
   )
   SELECT * FROM s WHERE salto > 1;   -- 0 filas = numeración continua, sin saltos
   ```

   Si esta consulta devuelve **0 filas**, la numeración es correcta aunque a
   simple vista pareciera faltar un número.

> **Nunca** asignes números de factura a mano ni ejecutes `UPDATE` sobre
> `tpv_facturas.numero`. Romperías la garantía de unicidad/continuidad y el
> carácter inmutable del snapshot fiscal. Toda emisión pasa por
> `tpv-emitir-factura` → trigger.

---

## Parte 3 — Errores generales del módulo

Todas las Edge Functions devuelven `{ error: { codigo, mensaje, detalles? } }`
con un estado HTTP. Referencia rápida (tabla completa en `README.md`):

| `codigo` | HTTP | Qué mirar |
|---|---|---|
| `VALIDACION` | 422 | El cuerpo no cumple el esquema Zod. Revisa el payload en la consola del navegador. |
| `NO_AUTENTICADO` | 401 | Falta/expiró el `Authorization`. Re-login del usuario. |
| `PROHIBIDO` | 403 | El usuario no tiene ese `salon_id` asignado (RLS). Revisar pertenencia al salón. |
| `NO_ENCONTRADO` | 404 | Ticket/factura inexistente **o** invisible por RLS (otro salón). |
| `TICKET_NO_ABIERTO` | 409 | Se intenta modificar/cobrar un ticket ya pagado/anulado. |
| `METODO_PAGO_INVALIDO` | 422 | Método inactivo o de otro salón. Revisar `tpv_metodos_pago`. |
| `SOBREPAGO` / `PAGO_INSUFICIENTE` | 409 | Descuadre en el cobro (ver Parte 1 para efectivo). |
| `CAJA_YA_ABIERTA` / `CAJA_NO_ABIERTA` | 409 | Estado de la sesión de caja del salón. |
| `INTEGRACION_RESERVAS` | 422 | Falta la vista de integración: migración `0005` no aplicada. |
| `CONFLICTO` | 409 | Violación de constraint (p. ej. `UNIQUE(venta_id)` → ya facturado). |

---

## Parte 4 — Comprobaciones de salud (equipo HAT3X)

### 4.1 Migraciones que deben estar aplicadas

| Migración | Aporta | Si falta… |
|---|---|---|
| `20260713000001_tpv_module` | Ventas, líneas, pagos, métodos, facturas + triggers de numeración | El TPV no funciona |
| `20260713000002_tpv_rls` | Aislamiento por `salon_id` (RLS) | `PROHIBIDO`/fuga entre salones |
| `20260713000003_tpv_facturacion` | Config de facturación + snapshot fiscal | No hay serie/datos de emisor |
| `20260713000004_tpv_caja` | Sesiones y movimientos de caja | Caja no disponible |
| `20260713000005_tpv_reservas_integracion` | Vistas de precarga desde reservas | `INTEGRACION_RESERVAS` |

### 4.2 Variables de entorno

Las Edge Functions solo necesitan `SUPABASE_URL` y `SUPABASE_ANON_KEY` (ver
`.env.example`). **No usan `service_role`**: reenvían el JWT del usuario para que
la RLS se aplique de extremo a extremo. La configuración de facturación (serie,
datos fiscales del emisor) **no es una variable de entorno**: vive por salón en
la tabla `tpv_config_facturacion`.

### 4.3 Ejecutar la suite de pruebas

```bash
# Suite completa (unitarias + integración + e2e, y SQL si hay BD). Ver tpv/tests/README.md.
./tpv/tests/run_tests.sh        # ./tpv/tests/run_tests.ps1 en Windows

# Solo el núcleo de cálculo (dinero y caja), sin red:
deno test tpv/shared/
```

Las pruebas de arqueo/descuadre están en `shared/caja_test.ts` y las de
facturación/numeración en `shared/factura_test.ts` y
`db/tests/tpv_aditividad_regresion_test.sql`.

---

## Cuándo escalar a HAT3X

- Una factura **reimpresa** difiere de la original (posible manipulación de
  datos).
- La consulta de huecos (§2.3) devuelve **saltos reales** dentro de una **misma
  serie**.
- Descuadres **sistemáticos** en el mismo salón sin causa identificable.
- Errores `500` o `CONFLICTO` recurrentes fuera de los casos descritos.

Adjunta: salón afectado, sesión/ticket/factura implicados, captura del error y
los pasos para reproducirlo.
