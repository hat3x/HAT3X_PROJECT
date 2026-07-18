# Salón OS — Roadmap de productización y add-ons

Decisiones de arquitectura acordadas con Jota (2026-07-16). Este documento es la
referencia que las fases futuras DEBEN respetar. No implementa nada por sí mismo;
fija el "qué" y el "por qué" para que cada agente que construya una fase lo herede.

## Principio rector: un solo backend

Todo (gestión, loyalty, TPV, apps de cliente/staff, recepcionista IA) vive en la
BD de Salón OS. Una única fuente de verdad. Cualquier canal que cree citas o
clientes escribe en las tablas de Salón OS (`appointments`, `customers`), nunca en
una BD paralela.

## Aislamiento multi-tenant (YA construido)

Cada tabla lleva `salon_id` + RLS (`app.user_salon_ids()`, `app.has_salon_role()`).
Cada salón ve SOLO sus datos. denueveanueve = un `salon_id`; "Jota Barber" = otro.
Nunca se cruzan. Es el cimiento y ya funciona.

## Fases (orden vigente)

1. **FASE 1 — Loyalty nativo** (en curso). Schema + lógica (port de denueveanueve) + UI mínima.
2. **FASE 2 — TPV + loyalty local.** Escanear QR (HID + cámara), ver cupones/puntos,
   descuento en el ticket, acreditar puntos al cobrar, impresora térmica.
3. **FASE 3 — Re-apuntar apps** cliente+staff a la BD de Salón OS. Sin migración de
   datos (los de denueveanueve eran de prueba). **Incluye identidad-por-teléfono
   (ver abajo).**
4. **PRODUCTIZACIÓN — Planes + white-label.** En dos tramos:
   - **FASE 4A — Backend de productización** (✅ construido, 2026-07-18): catálogo de
     add-ons (`salon_features`), tabla de marca (`salon_branding`), bucket de logos
     (`salon-logos`), lectura pública del branding por slug (`get_salon_branding`) y
     feature-gating de las RPC de fidelización. Ver §"Productización" y el README.
   - **FASE 4B — Re-apuntar las apps a branding dinámico (white-label)** (⏳ pendiente):
     hacer que panel y apps cliente/staff carguen la marca del salón en runtime (hoy
     cableadas a denueveanueve). El backend (4A) ya expone todo lo necesario.
5. **ADD-ON — Recepcionista IA** (Retell + Twilio).

## Identidad-por-teléfono (dedup de clientes) — bakear en FASE 3

Un cliente = una ficha, entre por donde entre (salón, app o recepcionista).

- Añadir índice **único `(salon_id, phone)`** en `customers`.
- **Normalizar** el teléfono a formato canónico (E.164, p. ej. `+34XXXXXXXXX`)
  antes de comparar/guardar, para que `612345678` y `+34 612 34 56 78` casen.
- Toda alta (dashboard, app, recepcionista) **busca por teléfono primero**: si
  existe, enlaza el nuevo canal a la ficha existente; NO crea un duplicado.
- Caso concreto: cliente dado de alta por la recepcionista (nombre + teléfono en la
  llamada) que luego se crea cuenta en la app → se enlaza a su ficha, no se duplica.

NO se metió en FASE 1 a propósito: `customers` tiene datos de prueba con posibles
teléfonos nulos/duplicados, y un `unique` prematuro rompería la migración de loyalty.
Va en FASE 3, donde se rehace el flujo de alta/registro de clientes.

## Productización — planes + white-label

Decisión tomada: **tablas dedicadas** (no `salons.settings` jsonb) para ambas capas.

- **Planes/entitlements**: qué ha contratado cada salón (base / +apps / +loyalty /
  +recepcionista / +TPV). Se guarda en la tabla **`public.salon_features`** (una fila
  por add-on; enum `salon_feature`). Modelo **opt-in**: sin fila = no contratado → el
  módulo ni aparece. La UI muestra/oculta cada módulo según sus entitlements; la
  **escritura la hace HAT3X** (`service_role`/backoffice), nunca el propio salón.
- **White-label**: logo + colores de marca por salón en la tabla **`public.salon_branding`**
  (1:1 con `salons`); el **fichero** del logo vive en el bucket de Storage
  **`salon-logos`**. Panel y apps se pintan con la identidad del salón en runtime.
  Las apps cliente/staff son **UN solo código** que carga el branding del salón por
  BD (no una app por peluquería). Servidas por subdominio (`jotabarber.salonos.app`)
  para que el PWA instalado muestre la marca del salón. La lectura pública para el
  **visitante anónimo** (tema por subdominio antes del login) entra por la RPC
  **`get_salon_branding(slug)`**, nunca por la tabla (que guarda datos fiscales).

### Estado de implementación (2026-07-18)

**FASE 4A — Backend de productización: ✅ construido.** Ya existe todo el andamiaje de
datos y seguridad; falta el trabajo de front (4B).

| Pieza | Migración | Qué hace |
|---|---|---|
| Catálogo de add-ons | `20260718100000_salon_features.sql` | enum `salon_feature` + tabla `salon_features` (opt-in; RLS de solo-lectura para miembros) + gate `app.salon_has_feature()` |
| Backfill de arranque | `20260718120000_backfill_salon_features.sql` | da de alta los add-ons **ya en uso** (denueveanueve + salones con actividad real) para no ocultar módulos vivos |
| Feature-gating | `20260718150000_rpc_feature_gate.sql` | `register_my_customer_account` exige `client_app`+`loyalty`; `staff_award_visit` exige `staff_app`+`loyalty` (`FEATURE_NOT_ENABLED`) |
| Marca (white-label) | `20260718110000_salon_branding.sql` | tabla `salon_branding` (logo + colores, 1:1; escritura owner/manager) |
| Logo (bytes) | `20260718130000_storage_salon_logos.sql` | bucket `salon-logos` (lectura pública; escritura owner/manager por `salon_id`) |
| Lectura pública | `20260718140000_rpc_get_salon_branding.sql` | RPC `get_salon_branding(slug)` — marca por slug para anónimos, sin exponer la tabla |
| Guardián de aislamiento | `20260718160000_rls_productization_guard.sql` | aserción «última palabra»: RLS activa y sin políticas anon/public en `salons`/`salon_features`/`salon_branding` + integridad de `app.salon_has_feature` |

Detalle operativo (cómo dar de alta un add-on por SQL/`service_role`, cómo leer el
branding, convención de ruta del bucket) en el **README →
«Productización: planes (add-ons) y white-label»**. Justificación de diseño en
`docs/salon-branding-design.md`, `docs/salon-logos-storage-design.md` y
`docs/salon-branding-public-read-design.md`.

**FASE 4B — Re-apuntar las apps a branding dinámico: ⏳ pendiente.** Hoy panel y apps
cliente/staff siguen cableadas a denueveanueve (nombre/colores/logo fijos).
Convertirlas en white-label dinámico —cargar la marca por slug/subdominio **en
runtime**, consumiendo `get_salon_branding` y el bucket `salon-logos`— es el trabajo de
esta fase. El backend (4A) ya expone todo lo necesario; 4B es puramente front.

## Add-on Recepcionista IA (Retell + Twilio)

Reutiliza lo ya construido para denueveanueve/biodental. Contratable aparte (plan).

- Los workflows de **n8n reapuntados a Salón OS**: cada cita que cierre la
  recepcionista se escribe en `appointments` de Salón OS y aparece en la agenda.
- **Identificar al cliente por el teléfono de la llamada** (usa la identidad-por-
  teléfono de FASE 3). Si no existe, alta como cliente nuevo (nombre + teléfono).
- Coherente con el resto: misma BD, mismo cliente único, misma agenda.
