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
4. **PRODUCTIZACIÓN — Planes + white-label.**
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

- **Planes/entitlements**: qué ha contratado cada salón (base / +apps / +loyalty /
  +recepcionista). Guardar en `salons.settings` (jsonb) o columnas dedicadas. La UI
  muestra/oculta cada módulo según el plan. Sin contratar el add-on → el módulo ni aparece.
- **White-label**: logo + color de marca por salón (en `salons.settings` o tabla
  `salon_branding`). Panel y apps se pintan con la identidad del salón en runtime.
  Las apps cliente/staff son **UN solo código** que carga el branding del salón por
  BD (no una app por peluquería). Servidas por subdominio (`jotabarber.salonos.app`)
  para que el PWA instalado muestre la marca del salón.
- Estado actual: las apps están cableadas a denueveanueve (nombre/colores/logo
  fijos). Convertirlas en white-label dinámico es trabajo real de esta fase.

## Add-on Recepcionista IA (Retell + Twilio)

Reutiliza lo ya construido para denueveanueve/biodental. Contratable aparte (plan).

- Los workflows de **n8n reapuntados a Salón OS**: cada cita que cierre la
  recepcionista se escribe en `appointments` de Salón OS y aparece en la agenda.
- **Identificar al cliente por el teléfono de la llamada** (usa la identidad-por-
  teléfono de FASE 3). Si no existe, alta como cliente nuevo (nombre + teléfono).
- Coherente con el resto: misma BD, mismo cliente único, misma agenda.
