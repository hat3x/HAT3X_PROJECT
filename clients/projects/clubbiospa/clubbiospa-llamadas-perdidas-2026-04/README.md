# Club BioSpa — Automatización de Llamadas Perdidas

**Cliente:** Club BioSpa | Spa / Centro de bienestar  
**Proyecto:** Automatización de llamadas perdidas con recepcionista IA  
**Entregado por:** HAT3X — PM Automatizaciones  
**Fecha:** 2026-04-09  
**Estado:** Listo para configurar y desplegar

---

## Qué hace este sistema

Cuando un cliente llama a Club BioSpa y no es atendido, este sistema actúa automáticamente:

**Caso A — Llamada fuera de horario:**
1. Retell AI activa el recepcionista IA para atender la llamada
2. La IA saluda, recoge el nombre del cliente, teléfono y motivo de consulta
3. Al colgar, Retell dispara el webhook de n8n
4. n8n envía alerta por Telegram + email al encargado con el informe completo
5. n8n envía un WhatsApp automático al cliente confirmando que su consulta fue recibida

**Caso B — Llamada perdida en horario laboral:**
1. El sistema detecta la llamada perdida y dispara el webhook
2. n8n alerta por Telegram + email al encargado de forma inmediata
3. n8n envía WhatsApp automático al cliente

**En ambos casos**, el encargado recibe toda la información necesaria para llamar de vuelta al cliente.

---

## Tiempo ahorrado estimado

| Tarea manual eliminada | Tiempo anterior | Con automatización |
|---|---|---|
| Revisar llamadas perdidas del día | 15-30 min/día | 0 — notificación instantánea |
| Contactar cliente para saber su consulta | 5-10 min/llamada | 0 — la IA recoge los datos |
| Escribir WhatsApp manual al cliente | 2-3 min/llamada | 0 — automático |
| **Total estimado** | **~4-6h/semana** | **~15 min/semana** |

---

## Estructura del Proyecto

```
clubbiospa-llamadas-perdidas-2026-04/
├── README.md                    ← Este archivo
├── .env.example                 ← Variables de entorno (copia como .env y rellena)
├── MANTENIMIENTO.md             ← Troubleshooting y mantenimiento
├── n8n/
│   ├── workflow-principal.json  ← Workflow n8n importable directamente
│   └── README-N8N.md            ← Guía de configuración de credenciales
└── docs/
    └── flujo-diagrama.md        ← Diagrama Mermaid del flujo completo
```

---

## Requisitos Previos

| Herramienta | Plan recomendado | Para qué |
|---|---|---|
| n8n | Self-hosted o Starter Cloud | Motor de automatización |
| Retell AI | Plan con webhooks | Recepcionista IA + detección horario |
| Twilio | Pay-as-you-go | WhatsApp Business al cliente |
| Telegram | Gratuito | Alertas inmediatas al encargado |
| Gmail / SMTP | Cuenta existente | Emails de informe y errores |

---

## Setup en 5 Pasos

### Paso 1 — Importar el workflow en n8n

```
n8n → Workflows → Import from File → seleccionar n8n/workflow-principal.json
```

Deja el workflow en **Inactive** hasta completar la configuración.

### Paso 2 — Configurar credenciales

Sigue `n8n/README-N8N.md` para configurar:
- [ ] SMTP (Gmail o servidor de correo del cliente)
- [ ] Twilio API (WhatsApp Business)
- [ ] Telegram Bot

### Paso 3 — Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con los valores reales
```

Variables críticas:
- `EMAIL_ENCARGADO` — A quién llegan los informes
- `TWILIO_WHATSAPP_FROM` — Número Twilio con WhatsApp
- `TELEGRAM_CHAT_ID` — Chat del encargado

### Paso 4 — Activar el webhook en n8n

1. Activa el workflow en n8n (toggle → Active)
2. Copia la URL del webhook: `https://<instancia>/webhook/clubbiospa-llamada-perdida`
3. Comparte la URL con el PM Voz para configurarla en Retell AI

### Paso 5 — Prueba de integración

Ejecuta el curl de prueba documentado en `n8n/README-N8N.md` y verifica que:
- [ ] Telegram recibe la alerta
- [ ] Email llega al encargado
- [ ] WhatsApp llega al número de prueba

---

## Coordinación PM Voz (Retell AI)

Este workflow espera que Retell AI envíe el siguiente payload al webhook:

```json
{
  "nombre_cliente": "Nombre del cliente",
  "telefono": "+34XXXXXXXXX",
  "motivo_consulta": "Descripción breve de la consulta",
  "duracion_llamada": 90,
  "timestamp": "2026-04-09T18:00:00.000Z",
  "fuera_de_horario": true
}
```

El PM Voz debe confirmar que el agente Retell AI genera exactamente estos campos al finalizar cada llamada.

---

## Personalización

### Cambiar el mensaje de WhatsApp al cliente

En n8n, edita el nodo `Twilio — WhatsApp al Cliente` → campo `Message`.

Mensaje actual:
> "Hola [nombre], somos Club BioSpa. Hemos recibido tu llamada perdida. Ya hemos informado a nuestro equipo especializado y contactaremos contigo lo antes posible. Gracias por confiar en nosotros. — Club BioSpa"

### Cambiar el horario de atención

El horario se configura directamente en Retell AI (PM Voz). Este workflow no gestiona horarios; simplemente procesa el campo `fuera_de_horario` que envía Retell.

### Añadir más canales de notificación

El flujo está preparado para añadir nodos adicionales (Slack, WhatsApp encargado, CRM) después del nodo de email, sin superar el límite de 20 nodos.

---

## Soporte

Para incidencias, contactar a HAT3X con:
1. Captura del error en n8n (Executions → failed execution)
2. Payload recibido en el webhook
3. Descripción del comportamiento esperado vs. obtenido
