# SKILL: WhatsApp Business API

## Opciones de Implementación

| Proveedor | Cuándo usarlo | Complejidad |
|---|---|---|
| **Twilio WhatsApp API** | Default — bien documentado, sandbox para testing | Media |
| **Meta Cloud API** | Si el cliente quiere directo con Meta | Media-Alta |
| **360dialog** | Clientes en Europa, soporte en español | Media |
| **Wati.io** | Si el cliente quiere dashboard sin código | Baja |

---

## Twilio WhatsApp API — Setup

```env
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

### Enviar Mensaje

```typescript
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

async function sendWhatsApp(to: string, body: string) {
  const message = await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: `whatsapp:+34${to}`,
    body
  })

  return message.sid
}
```

### Recibir Mensajes (Webhook)

```typescript
// app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const data = await req.formData()
  const from = data.get('From') as string
  const body = data.get('Body') as string

  // Procesar mensaje con IA
  const response = await processWithAI(from, body)

  // Responder
  await sendWhatsApp(from.replace('whatsapp:', ''), response)

  return NextResponse.json({ status: 'ok' })
}
```

### Configurar Webhook en Twilio

1. Ir a WhatsApp Sandbox en Twilio Console
2. "Configure Sandbox" → Webhook URL
3. Poner tu URL: `https://tu-dominio.com/api/whatsapp/webhook`
4. HTTP POST

---

## Meta Cloud API (Directo)

```env
META_ACCESS_TOKEN=EAABsbCS1iBoBOZxxx
META_PHONE_NUMBER_ID=123456789
META_BUSINESS_ID=987654321
```

### Enviar Mensaje

```typescript
async function sendWhatsAppMeta(to: string, body: string) {
  const res = await fetch(
    `https://graph.facebook.com/v17.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body }
      })
    }
  )

  return res.json()
}
```

### Webhook de Meta

```typescript
// Verificación del webhook (GET)
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge)
  }

  return new NextResponse('Forbidden', { status: 403 })
}

// Recepción de mensajes (POST)
export async function POST(req: NextRequest) {
  const body = await req.json()

  if (body.object === 'whatsapp_business_account') {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.value.messages) {
          const message = change.value.messages[0]
          const from = message.from
          const text = message.text?.body

          await processMessage(from, text)
        }
      }
    }
  }

  return NextResponse.json({ status: 'ok' })
}
```

---

## Plantillas de Mensajes (Templates)

Para mensajes outbound iniciados por el negocio (24h window):

### Aprobación de Plantilla

```typescript
// Crear plantilla en Meta
const template = {
  name: 'cita_confirmacion',
  language: { code: 'es' },
  category: 'MARKETING',
  components: [
    {
      type: 'BODY',
      text: 'Hola {{1}}, tu cita del {{2}} está confirmada. Responde CANCELAR si necesitas cancelarla.'
    }
  ]
}
```

### Enviar Plantilla Aprobada

```typescript
async function sendTemplate(to: string, templateName: string, params: string[]) {
  return fetch(
    `https://graph.facebook.com/v17.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'es' },
          components: [{
            type: 'body',
            parameters: params.map(p => ({ type: 'text', text: p }))
          }]
        }
      })
    }
  )
}
```

---

## 24-Hour Session Window

**Regla crítica:** Solo puedes responder mensajes del usuario dentro de las 24h posteriores a su último mensaje.

```typescript
// Gestionar sesiones
async function canReplyToUser(userId: string): Promise<boolean> {
  const lastMessage = await db.getLastMessageFromUser(userId)
  if (!lastMessage) return false

  const now = new Date()
  const lastMessageDate = new Date(lastMessage.timestamp)
  const hoursSince = (now.getTime() - lastMessageDate.getTime()) / (1000 * 60 * 60)

  return hoursSince < 24
}

// Si fuera de 24h → usar plantilla aprobada
async function sendMessageOutsideWindow(userId: string, body: string) {
  // Solo plantillas aprobadas funcionan fuera de 24h
  return sendTemplate(userId, 'mensaje_general', [body])
}
```

---

## Integración con n8n

### Patrón estándar

```
WhatsApp Webhook →
OpenAI (clasificar intención) →
Switch (por intención) →
  CASE: cita → Cal.com node
  CASE: info → HTTP Request (buscar en KB)
  CASE: humano → Slack notification
→ WhatsApp node (responder)
→ HubSpot node (log)
```

### Configurar en n8n

1. **Webhook node:**
   - Method: POST
   - Path: /whatsapp
   - Response Mode: Last Node

2. **WhatsApp node (Twilio):**
   - Credential: Twilio API
   - From: WhatsApp sandbox number
   - To: {{$json.from}}
   - Body: {{$json.response}}

---

## Mensajes Multimedia

```typescript
// Enviar imagen
async function sendImage(to: string, imageUrl: string, caption: string) {
  return fetch(
    `https://graph.facebook.com/v17.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link: imageUrl, caption }
      })
    }
  )
}

// Enviar documento
async function sendDocument(to: string, documentUrl: string, filename: string) {
  return fetch(/* ... */, {
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { link: documentUrl, filename }
    })
  })
}
```

---

## Variables de Entorno

```env
# Twilio
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Meta Cloud API
META_ACCESS_TOKEN=EAABxxx
META_PHONE_NUMBER_ID=123456789
META_BUSINESS_ID=987654321
WHATSAPP_VERIFY_TOKEN=tu_token_secreto

# Webhook
WHATSAPP_WEBHOOK_URL=https://tu-dominio.com/api/whatsapp/webhook
```

---

## Checklist de Implementación

- [ ] Sandbox probado con números de testing
- [ ] Webhook configurado y verificado
- [ ] Plantillas de mensajes creadas y aprobadas (si hay outbound)
- [ ] 24h window gestionada correctamente
- [ ] Logs de conversaciones guardados en DB/CRM
- [ ] Manejo de errores (mensajes no entregados)
- [ ] El cliente tiene documentación de cómo usar
