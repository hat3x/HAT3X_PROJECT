# SKILL: n8n Avanzado

## Patrones de Flujos HAT3X

### 1. Lead Nurturing Automático

**Trigger:** Nuevo lead en CRM / formulario web

```
Webhook (form submission) →
Set (normalizar datos) →
HubSpot (crear contacto) →
OpenAI (enriquecer lead) →
Gmail (email personalizado) →
Slack (notificar equipo) →
Google Sheets (log)
```

**Nodos clave:**
- Webhook node (POST desde formulario)
- Set node (mapear campos)
- HubSpot node (crear contacto)
- HTTP Request node (OpenAI API)
- Gmail/Outlook node (enviar email)
- Slack node (notificar canal)

---

### 2. Gestión de Citas con Recordatorios

**Trigger:** Solicitud de cita por web/WhatsApp

```
Webhook / WhatsApp →
Cal.com (verificar disponibilidad) →
IF: hay slot →
  Cal.com (crear booking) →
  Gmail (confirmación cliente) →
  WhatsApp (recordatorio 24h antes) →
  HubSpot (actualizar contacto)
IF: no hay slot →
  WhatsApp (ofrecer alternativas)
```

**Nodos clave:**
- Cal.com node (disponibilidad + booking)
- IF node (condicional)
- WhatsApp Business API node
- Schedule node (recordatorio programado)

---

### 3. Procesamiento de Documentos con IA

**Trigger:** Email con adjunto / upload

```
Email Trigger (con adjunto) / Webhook →
Extract from File (texto) →
OpenAI Vision/Text (clasificar + extraer) →
Set (estructurar datos) →
IF: tipo = factura →
  Google Sheets (registrar factura)
IF: tipo = contrato →
  Notion (guardar enContracts)
→ Gmail (confirmar recepción)
```

**Nodos clave:**
- Email Trigger node
- Extract from File node
- HTTP Request (OpenAI Vision API)
- Code node (lógica custom)
- Google Sheets / Notion node

---

### 4. Respuestas Automáticas Multicanal

**Trigger:** Mensaje entrante

```
WhatsApp / Instagram / Webhook →
OpenAI (clasificar intención) →
Switch (por intención) →
  CASE: venta → responder con info comercial
  CASE: soporte → buscar en KB + responder
  CASE: urgencia → notificar humano
→ HubSpot (log conversación)
```

**Nodos clave:**
- Multi-trigger (webhooks de cada canal)
- OpenAI node (clasificación)
- Switch node (routing por intención)
- HTTP Request (cada canal API)

---

## Nodos Esenciales

### HTTP Request Node — Configurar API Calls

```json
{
  "method": "POST",
  "url": "https://api.anthropic.com/v1/messages",
  "headers": {
    "x-api-key": "{{$env.ANTHROPIC_API_KEY}}",
    "anthropic-version": "2024-01-01",
    "content-type": "application/json"
  },
  "body": {
    "model": "claude-sonnet-4-6",
    "max_tokens": 500,
    "messages": [
      {
        "role": "user",
        "content": "{{$json.message}}"
      }
    ]
  }
}
```

### Code Node — JavaScript/TypeScript

```javascript
// Transformar datos entre nodos
const contact = {
  email: $input.first().json.email.toLowerCase(),
  name: $input.first().json.name.trim(),
  phone: $input.first().json.phone?.replace(/[^0-9]/g, ''),
  source: 'web_form',
  created_at: new Date().toISOString()
};

return { json: contact };
```

### IF Node — Condicionales

```
{{ $json.status === 'qualified' && $json.budget > 1000 }}
```

### Switch Node — Múltiples rutas

```javascript
// Expression para routing
const intent = $input.first().json.intent;

switch(intent) {
  case 'ventas': return 'route_sales';
  case 'soporte': return 'route_support';
  case 'urgencia': return 'route_urgent';
  default: return 'route_other';
}
```

---

## Manejo de Errores

### Error Trigger Global

Configurar en Settings del workflow:

```
Settings → Error Trigger →
  Email (notificar admin) →
  Slack (alerta canal errores)
```

### Rama onError por Nodo

```
Nodo crítico → Click derecho → Add Error Trigger →
  Set (guardar error details) →
  Email/Slack (notificar) →
  Google Sheets (log de errores)
```

### Retry Automático

```json
{
  "retryOnFail": {
    "maxTries": 3,
    "waitBetweenTries": 5000,
    "errorCodeRange": "5xx"
  }
}
```

---

## Variables y Expresiones

### Variables de Entorno

```
Settings → Environment Variables →
  ANTHROPIC_API_KEY
  HUBSPOT_ACCESS_TOKEN
  CAL_API_KEY
```

### Expresiones Comunes

```javascript
// Fecha formateada
{{ DateTime.now().setZone('Europe/Madrid').toFormat('dd/MM/yyyy HH:mm') }}

// Extraer email del primer match
{{ $json.text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/)?.[0] }}

// Conditional inline
{{ $json.amount > 1000 ? 'high_value' : 'standard' }}

// Unir arrays
{{ $input.all().map(i => i.json.name).join(', ') }}
```

---

## Webhooks

### Webhook Receptor

```
Webhook node:
  - Method: POST
  - Path: /lead-captured
  - Response Mode: Last Node
  - Binary Data: false
```

### Webhook Caller

```
HTTP Request node:
  - Method: POST
  - URL: https://tu-servidor.com/webhook
  - Headers: { "Content-Type": "application/json" }
  - Body: {{ JSON.stringify($json) }}
```

---

## Sub-workflows

Para flujos complejos, dividir en sub-workflows:

```
Workflow Principal:
  Trigger → Execute Workflow (sub-flujo 1) →
  Execute Workflow (sub-flujo 2) → Response

Sub-workflow:
  Workflow Trigger → Nodos → Return
```

---

## Rate Limiting

### Para APIs con límites

```javascript
// Code node antes de llamar API
const now = Date.now();
const lastCall = await $('Redis').item.json.last_call || 0;

if (now - lastCall < 1000) {
  // Esperar para no exceder rate limit
  await new Promise(r => setTimeout(r, 1000 - (now - lastCall)));
}

return { json: { proceed: true } };
```

---

## Variables de Entorno Necesarias

```env
# n8n
N8N_HOST=n8n.tu-dominio.com
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=xxx

# Webhook
WEBHOOK_URL=https://n8n.tu-dominio.com/webhook/

# Integraciones
ANTHROPIC_API_KEY=sk-ant-xxx
HUBSPOT_ACCESS_TOKEN=pat-xxx
CAL_API_KEY=cal_live_xxx
SLACK_BOT_TOKEN=xoxb-xxx
```

---

## Checklist de Flujo Listo

- [ ] Todos los nodos con nombres descriptivos (no "HTTP Request 3")
- [ ] Sticky notes explicando secciones complejas
- [ ] Rama de error configurada en nodos críticos
- [ ] Variables de entorno usadas (nada hardcodeado)
- [ ] Testeado con datos reales del cliente
- [ ] Notificación de errores funcionando
- [ ] Exportado JSON + documentación README
