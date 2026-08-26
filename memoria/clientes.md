# Memoria de Clientes — HAT3X

> Actualizar tras cada proyecto cerrado. El Master Orchestrator lee este archivo
> antes de arrancar cualquier proyecto nuevo.
> PM Operaciones gestiona el formato y la actualización.

---

## Formato de entrada

```markdown
## [NOMBRE CLIENTE] — [SECTOR]
**Proyectos:** [lista de proyectos entregados con fechas]
**Tecnologías usadas:** [lista]
**Contacto:** [nombre y email del interlocutor principal]
**Último contacto:** [fecha]
**Estado:** activo | mantenimiento | cerrado | potencial recontacto
**Notas:** [qué funcionó bien, qué fue difícil, preferencias del cliente]
**Oportunidades futuras:** [qué más podrían necesitar]
```

---

<!-- Añadir clientes aquí según se vayan cerrando proyectos -->

## Club BioSpa — Spa / Centro de bienestar
**Proyectos:** Automatización de llamadas perdidas — inicio abril 2026 (en desarrollo)
**Tecnologías usadas:** Retell AI, ElevenLabs (voz Laura), n8n, Twilio WhatsApp, Telegram Bot, SMTP
**Contacto:** Pendiente de confirmar
**Último contacto:** 9 de abril de 2026 (diseño workflow n8n + recepcionista IA Sofía)
**Estado:** activo — en desarrollo
**Notas:** Proyecto automatizaciones + voz. Workflow n8n listo (10 nodos). Recepcionista IA "Sofía" diseñada. Pendiente: importar workflow en n8n, comprar número Retell, aprobar voz con cliente, pruebas end-to-end. Portal ID proyecto: f267432d-462c-4a10-a9ff-0f859a4b66c1
**Oportunidades futuras:** Chatbot WhatsApp para consultas, sistema de reservas online, recordatorios automáticos de citas

## De Nueve a Nueve — Peluquería / Centro de estética
**Proyectos:** Asistente de voz IA para gestión de citas — inicio abril 2026 (en desarrollo)
**Tecnologías usadas:** Retell AI, ElevenLabs, n8n, Supabase, Google Calendar
**Contacto:** Pendiente de confirmar
**Último contacto:** 3 de abril de 2026 (generación workflows n8n + documentación)
**Estado:** activo — en desarrollo
**Notas:** Proyecto voz + automatizaciones. Cliente usa app propia con sincronización Google Calendar. Workflows n8n creados (5: verificar, crear, cancelar, modificar, post-llamada). Pendiente: importar en n8n, configurar Retell AI, pruebas end-to-end.
**Oportunidades futuras:** Recordatorios automáticos SMS/WhatsApp, dashboard de métricas, integración pagos

## Jesus Peralta Peluqueros — Peluquería
**Razón social:** NNJBARBERS S.L. (CIF: B19334382)
**Proyectos:** Página Web + Instagram — inicio 4 enero 2026 (servicio mensual recurrente)
**Tecnologías usadas:** Herramientas basadas en IA, Instagram
**Contacto:** Jesus Peralta Baquet — email y teléfono pendientes de confirmar
**Último contacto:** 3 de abril de 2026 (generación paquete onboarding)
**Estado:** activo — mantenimiento mensual 300 €/mes + IVA
**Notas:** Implementación gratuita (descuento 100% sobre 290 €). Portal no provisionado — activación estimada 4 abril 2026. Email y teléfono del cliente pendientes de completar en contrato.
**Oportunidades futuras:** SEO, gestión de otras redes sociales, sistema de reservas online dedicado

## Clínica Dental Biodental — Odontología (clínica dental biológica, Colmenarejo, Madrid)
**Proyectos:** Recepcionista IA de voz «Sara» (gestión de citas) — piloto mayo 2026, producción desde junio 2026. Alta en app de gestión Kairos (sector odontología) — desde 5 de agosto de 2026.
**Tecnologías usadas:** Retell AI (modelo claude-4.5-haiku, voz Cartesia), n8n (7 workflows: today, verificar, crear, cancelar, modificar, derivar-ortodoncia, post-llamada), Google Calendar, Google Sheets, Twilio SMS. App Kairos (Next.js + Supabase).
**Contacto:** Pendiente de confirmar. Dirección: Carretera Galapagar 13, 28270 Colmenarejo (Madrid). Ortodoncia: Kristel (+34 645574869).
**Último contacto:** 4 de agosto de 2026 (alta Kairos + nueva cuota).
**Estado:** activo — mantenimiento mensual. Cliente amigo (piloto en producción). Precios: mayo 2026 piloto gratuito; julio 2026 primera cuota cobrada (290 €); desde agosto 2026 → 350 €/mes (290 € recepcionista + 60 € app Kairos, alta 5 ago 2026).
**Notas:** Horario de verano (L 10-14/17-20, M/J/V 10-14, X 10-20 continuo, fines de semana cerrado). Endodoncias solo martes (especialista Nicolás Zunino; también general salvo extracciones). Cierre puntual lunes 3 ago 2026 (mecanismo DIAS_CERRADOS reutilizable). Facturas fiscales las emite HAT3X aparte; presupuestos mensuales en `clients/projects/biodental/facturacion/`. Datos fiscales de emisor/cliente aún pendientes en las plantillas. Registro automático de llamadas (WF05) desplegado 24 jul 2026. Insight de producto: ~42 % de llamadas piden callback/hablar con persona, no reservar.
**Oportunidades futuras:** Recordatorios automáticos, más módulos de Kairos, afinar Sara para convertir más callbacks en citas, replicar el modelo (400 € implantación + cuota) en otros clientes de los 3 sectores de Kairos (dental, peluquería, restauración).

## MTDI — Interiorismo y reformas (estudio; dos actividades: Reformas «Serie R» + Decoración/Interiorismo «Serie D»)
**Interlocutor:** Ismael (dirección creativa; trabaja prácticamente solo).
**Proyectos:** Propuesta enviada 7 ago 2026 — «Automatización Integral de MTDI (Odoo + IA)». Sistema de gestión integral por fases (implantación tipo ERP + capa de automatización n8n + IA).
**Tecnologías propuestas:** Odoo (núcleo), n8n + IA/LLM multimodal (OCR facturas, triaje de correo), Dropbox (archivo), app móvil Capacitor reutilizando base `obratech`, WordPress (publicación), Canva. CAD/DWG como bloque aparte.
**Contacto:** pendiente de confirmar (email/teléfono de Ismael).
**Último contacto:** 7 de agosto de 2026 (entrega de propuesta + roadmap por fases).
**Estado:** POTENCIAL — propuesta lista para enviar (modelo licencia híbrida). El cliente está de vacaciones y **avisará en septiembre de 2026 para reunirse**. Siguiente paso: reunión de Descubrimiento (incluida en el alta de 990 €) cuando vuelva.
**Notas:** Brecha de expectativas GRANDE — el cliente espera 50-200 €. **MODELO ELEGIDO (Jose, 7 ago): licencia híbrida** — alta única **990 €** (incluye Descubrimiento + puesta en marcha Etapa 1) + **cuota mensual TODO INCLUIDO desde 350 €** (Nivel 1 Admin 350 € → Nivel 2 +proyectos 400 € → Nivel 3 +diseño 450 €; add-ons CAD/redes), **permanencia 12 meses**. Todo incluido = HAT3X aloja Odoo+n8n+IA, las licencias de terceros van DENTRO de la cuota (no aparte). Modelo auto-financiado: cada módulo se construye cuando el cliente lo activa. Estrategia: liderar con valor (sustituye admin + rentabilidad real por obra) y baja barrera de entrada. Entregables en `clients/projects/mtdi/propuesta/`: propuesta `2026-08-07_propuesta-mtdi.md`, mensaje email+WhatsApp `mensaje-comunicacion-cliente.md`, y **visual/PDF publicado**: https://claude.ai/code/artifact/5d6d0c2d-8754-49fe-9d36-789d92f235cd . Calendario 5/35/25/20/15 es de MTDI a SUS clientes (no de HAT3X a MTDI).
**Oportunidades futuras:** Etapas 2-6 (clientes/docs, presupuestos/cobros, productos/moodboard, presentaciones, diseño 2D/3D asistido) + módulo redes/WordPress. Ticket alto y recurrente si se convierte.
