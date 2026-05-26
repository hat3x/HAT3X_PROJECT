# SKILL: Retell AI

## Qué es
Retell AI es la plataforma para construir agentes de voz telefónicos con IA.
Gestiona la telefonía, la latencia, las interrupciones y la integración con LLMs.
Nosotros configuramos el agente; Retell gestiona toda la infraestructura de llamadas.

---

## Conceptos Clave

| Concepto | Descripción |
|---|---|
| **Agent** | El agente de voz con su LLM, voz y configuración |
| **Phone Number** | Número asignado al agente (comprado en Retell o traído propio) |
| **Call** | Instancia de una llamada (inbound o outbound) |
| **Webhook** | Notificaciones de eventos de llamada a tu servidor |
| **Concurrency** | Número de llamadas simultáneas permitidas |

---

## Crear un Agente — Configuración Completa

```json
{
  "agent_name": "Recepcionista Clínica XYZ",
  "llm_websocket_url": "wss://your-llm-endpoint.com/retell",

  "voice_id": "eleven_[voice_id]",
  "voice_model": "eleven_turbo_v2_5",
  "voice_temperature": 1,

  "begin_message": "Hola, has llamado a Clínica XYZ. Soy María, ¿en qué puedo ayudarte?",

  "responsiveness": 1,
  "interruption_sensitivity": 0.8,
  "enable_backchannel": true,

  "end_call_after_silence_ms": 600000,
  "max_call_duration_ms": 3600000,

  "end_call_phrases": ["hasta luego", "que tenga buen día", "adiós", "bye"],

  "webhook_url": "https://tu-servidor.com/api/retell/webhook",

  "ambient_sound": "coffee-shop",
  "ambient_sound_volume": 0.1
}
```

---

## Integración LLM (Claude)

Retell conecta con Claude vía WebSocket. El servidor implementa el endpoint:

```typescript
// Endpoint WebSocket para Retell
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

app.ws('/retell-llm', (ws) => {
  ws.on('message', async (data) => {
    const msg = JSON.parse(data);

    if (msg.interaction_type === 'call_details') {
      // Llamada iniciada — guardar metadatos
      return;
    }

    if (msg.interaction_type === 'response_required' ||
        msg.interaction_type === 'reminder_required') {

      const stream = await client.messages.stream({
        model: 'claude-haiku-4-5-20251001',  // Haiku para menor latencia
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: msg.transcript.map(t => ({
          role: t.role === 'agent' ? 'assistant' : 'user',
          content: t.content
        }))
      });

      let response = '';
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta') {
          response += chunk.delta.text;
          // Enviar chunks en tiempo real para menor latencia
          ws.send(JSON.stringify({
            response_id: msg.response_id,
            content: chunk.delta.text,
            content_complete: false,
            end_call: false
          }));
        }
      }

      ws.send(JSON.stringify({
        response_id: msg.response_id,
        content: '',
        content_complete: true,
        end_call: shouldEndCall(response)
      }));
    }
  });
});
```

---

## Webhooks — Eventos Importantes

Retell envía POST a tu `webhook_url` con estos eventos:

```typescript
type RetellWebhookEvent =
  | { event: 'call_started'; call: CallObject }
  | { event: 'call_ended'; call: CallObject }
  | { event: 'call_analyzed'; call: CallObject };  // análisis post-llamada
```

### Procesamiento de call_ended (n8n o servidor propio)

```typescript
app.post('/api/retell/webhook', async (req, res) => {
  const { event, call } = req.body;

  if (event === 'call_ended') {
    // Datos disponibles en call:
    // call.transcript — transcripción completa
    // call.call_analysis — resumen, sentiment, datos extraídos
    // call.duration_ms — duración
    // call.from_number / call.to_number

    await updateCRM(call);
    await logToDatabase(call);
    if (call.call_analysis?.custom_analysis_data?.appointment) {
      await createCalendarEvent(call);
    }
  }

  res.sendStatus(200);
});
```

---

## Llamadas Outbound — API

```typescript
// Iniciar llamada outbound
const response = await fetch('https://api.retellai.com/v2/create-phone-call', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.RETELL_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    agent_id: 'agent_xxx',
    from_number: '+34600000000',  // número Retell
    to_number: '+34611222333',    // número del lead
    retell_llm_dynamic_variables: {
      // Variables dinámicas pasadas al system prompt
      lead_name: 'María García',
      product_interest: 'automatizaciones',
      source: 'formulario web'
    }
  })
});
```

### Variables dinámicas en el system prompt
```
Estás llamando a {{lead_name}}, que mostró interés en {{product_interest}}
a través de {{source}}.
```

---

## Transferencia a Humano

```typescript
// En el WebSocket LLM, para transferir:
ws.send(JSON.stringify({
  response_id: msg.response_id,
  content: 'Un momento, te transfiero con un agente.',
  content_complete: true,
  transfer_number: '+34600123456',  // número al que transferir
  end_call: false
}));
```

---

## Números de Teléfono

```typescript
// Comprar número en Retell
POST https://api.retellai.com/v2/create-phone-number
{
  "area_code": 34,  // España
  "agent_id": "agent_xxx"
}

// Importar número propio (via Twilio/Vonage)
POST https://api.retellai.com/v2/import-phone-number
{
  "phone_number": "+34600000000",
  "termination_uri": "xxx.pstn.twilio.com"
}
```

---

## Variables de Entorno Necesarias

```env
RETELL_API_KEY=key_xxx
RETELL_AGENT_ID=agent_xxx
RETELL_PHONE_NUMBER=+34600000000
RETELL_WEBHOOK_SECRET=secret_xxx  # para verificar webhooks
```

---

## Checklist de Go-Live

- [ ] Agent creado y testado con llamadas de prueba desde Retell dashboard
- [ ] Webhook URL accesible públicamente (no localhost)
- [ ] Número de teléfono asignado al agente
- [ ] Variables dinámicas funcionando correctamente
- [ ] Transferencia a humano configurada y probada
- [ ] Límite de concurrencia configurado según expectativas del cliente
- [ ] Monitoreo activo (Retell dashboard + alertas en Slack)
