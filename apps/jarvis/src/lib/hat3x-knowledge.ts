// Esencia del sistema orquestador HAT3X embebida en Jarvis.
// Cuando los agentes o skills cambien, actualizar aquí también.

export const HAT3X_KNOWLEDGE = `
## Qué es HAT3X
HAT3X es una consultoría de IA española que construye agentes de voz, chatbots, webs/apps
y automatizaciones para empresas. José María es el fundador.

---

## Sistema de 5 PMs especializados

Cuando el usuario pida trabajo de cliente, proyecto nuevo, o algo que hacer,
usa la herramienta delegate_to_pm con el PM correcto:

| pm | Vertical | Cuándo delegar |
|---|---|---|
| voz | PM Voz | Agentes telefónicos, recepcionistas IA, Retell AI, ElevenLabs, llamadas |
| chatbots | PM Chatbots | Chatbots web, WhatsApp Business, Instagram, Telegram, RAG |
| webs-apps | PM Webs y Apps | Webs, landings, dashboards, SaaS, Next.js, Supabase |
| automatizaciones | PM Automatizaciones | n8n, Make, Zapier, sincronización CRM, flujos automáticos |
| operaciones | PM Operaciones | Propuestas, presupuestos, contratos, facturación, cobros |

Proyectos mixtos: si el cliente pide "web + chatbot", delega a ambos PMs
con el campo coordinacion explicando qué deben compartir.

---

## PM Voz — Capacidades
- Agentes telefónicos Retell AI (inbound y outbound)
- Voces hiperrealistas ElevenLabs (eleven_turbo_v2_5)
- Recepcionistas IA: clínicas, restaurantes, inmobiliarias, despachos
- Cualificación automática de leads por teléfono
- Integración CRM (HubSpot, Pipedrive, Salesforce) vía webhook
- Integración calendarios (Cal.com, Google Calendar) para citas automáticas
- Transferencia a humano cuando no puede resolver

Datos mínimos para empezar: ¿Inbound u outbound? ¿Objetivo principal?
¿Sistemas que consulta? ¿Número propio o lo gestionamos?

---

## PM Chatbots — Capacidades
- Chatbots RAG: responde usando documentos del cliente como base de conocimiento
- WhatsApp Business API (Meta verificado)
- Personalidad propia — convierte visitantes en clientes
- Captura de leads con integración CRM

---

## PM Webs y Apps — Capacidades
- Stack: Next.js 14, shadcn/ui, Tailwind, Supabase, TypeScript strict
- Webs corporativas y landings de alta conversión
- Dashboards y herramientas internas
- SaaS con autenticación y base de datos
- PWA instalables en móvil

---

## PM Automatizaciones — Capacidades
- n8n autoalojado o cloud
- Sincronización CRM ↔ hojas de cálculo ↔ email ↔ WhatsApp
- Notificaciones automáticas y flujos de captación
- Éxito medido en horas/semana ahorradas al cliente

---

## PM Operaciones — Capacidades
- Propuesta comercial completa en menos de 48 horas
- Contrato base adaptable por sector
- Pipeline: lead → propuesta → cierre → onboarding → proyecto
- Control de facturación y cobros pendientes

---

## Precios orientativos (para responder rápido)
- Recepcionista IA: 800-1.500€ setup + 150-300€/mes
- Chatbot web básico: 600-1.200€
- Chatbot con RAG: 1.200-2.500€
- Web corporativa: 1.500-4.000€
- Automatización sencilla: 400-800€
- Automatización compleja: 1.000-3.000€

---

## Flujo interno
Lead entra → Jarvis registra → PM Operaciones cualifica → Discovery call →
PM técnico crea propuesta → cierre → tareas en Supabase → Jarvis supervisa

---

## Proyectos activos ahora mismo

### 100 Montaditos — App de gestión interna
- **Cliente**: 100 Montaditos (franquicia de restaurantes)
- **Tipo**: aplicación web interna (Next.js + Supabase)
- **PM asignado**: PM Webs y Apps
- **Estado**: en desarrollo activo
- **Descripción**: sistema de gestión para franquiciados con autenticación, pedidos y control operativo
- **Stack**: Next.js, Supabase (Postgres + Auth), TypeScript

### Biodental — Recepcionista IA telefónica
- **Cliente**: Clínica dental Biodental
- **Tipo**: agente de voz telefónico inbound
- **PM asignado**: PM Voz
- **Estado**: en desarrollo activo
- **Descripción**: recepcionista IA que gestiona citas automáticamente, consulta disponibilidad en Google Calendar, envía confirmación por WhatsApp vía Twilio
- **Stack**: Retell AI, n8n (hat3xia.app.n8n.cloud), Google Calendar, Twilio WhatsApp

### Jesús Peralta Peluqueros — Web + gestión Instagram
- **Cliente**: Jesús Peralta Peluqueros (peluquería)
- **Tipo**: web corporativa + automatización Instagram básica
- **PM asignado**: PM Webs y Apps + PM Automatizaciones
- **Estado**: en desarrollo activo
- **Descripción**: web de presentación del salón con galería y reservas, más flujo de automatización para publicar y responder en Instagram vía n8n
- **Stack**: Next.js (web), n8n (Instagram)
`;
