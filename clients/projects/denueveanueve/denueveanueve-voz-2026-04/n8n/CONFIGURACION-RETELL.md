# Configuración Agente Retell AI — Noa, De Nueve a Nueve

## Resumen ejecutivo

- **Agente**: Noa — Recepcionista virtual de De Nueve a Nueve
- **Modelo**: Claude Haiku 20241022 (vía Retell LLM)
- **Voz**: ElevenLabs Turbo v2.5 (voz femenina, español España)
- **Integraciones**: n8n → Google Calendar (OAuth2) → Supabase (opcional)
- **Sedes**: Collado Villalba · Alpedrete

---

## Paso 1 — Crear LLM en Retell

```bash
POST https://api.retellai.com/v2/create-retell-llm
Authorization: Bearer $RETELL_API_KEY
Content-Type: application/json
```

**Body** (sustituir URLs con las reales de tu n8n):

```json
{
  "model": "claude-haiku-20241022",
  "general_prompt": "[COPIAR CONTENIDO DE ../prompts/system-prompt.md]",
  "begin_message": "Hola, buenas. Has llamado a De Nueve a Nueve. Soy Noa, ¿en qué puedo ayudarte?",
  "general_tools": [
    {
      "type": "custom",
      "name": "verificar_disponibilidad",
      "description": "Verifica si hay un hueco disponible en el calendario para el servicio, sede, fecha y hora indicados. Llamar SIEMPRE antes de crear o modificar una cita.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Un momento, consulto el calendario.",
      "url": "https://n8n.tu-dominio.com/webhook/denueveanueve-verificar-disponibilidad",
      "parameters": {
        "type": "object",
        "properties": {
          "sede": { "type": "string", "enum": ["collado_villalba", "alpedrete"], "description": "Sede donde se quiere la cita" },
          "servicio": { "type": "string", "description": "Nombre exacto del servicio" },
          "fecha": { "type": "string", "description": "Fecha deseada en formato YYYY-MM-DD" },
          "hora": { "type": "string", "description": "Hora deseada en formato HH:MM" }
        },
        "required": ["sede", "servicio", "fecha", "hora"]
      }
    },
    {
      "type": "custom",
      "name": "crear_cita",
      "description": "Crea la cita en Google Calendar. Llamar solo después de verificar disponibilidad con resultado positivo. Opcional: especificar empleado si el cliente lo pide.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Perfecto, te apunto ahora mismo.",
      "url": "https://n8n.tu-dominio.com/webhook/denueveanueve-crear-cita",
      "parameters": {
        "type": "object",
        "properties": {
          "nombre": { "type": "string", "description": "Nombre completo del cliente" },
          "telefono": { "type": "string", "description": "Teléfono del cliente (9 dígitos)" },
          "sede": { "type": "string", "enum": ["collado_villalba", "alpedrete"] },
          "servicio": { "type": "string", "description": "Nombre exacto del servicio" },
          "fecha": { "type": "string", "description": "Fecha en formato YYYY-MM-DD" },
          "hora": { "type": "string", "description": "Hora en formato HH:MM" },
          "notas": { "type": "string", "description": "Notas adicionales. Vacío si no hay." },
          "empleado": { "type": "string", "description": "Nombre del empleado/a solicitado (opcional). Ej: 'Fernando', 'Almudena', 'Johanna', 'Isabel', 'Tania', 'Macarena', 'Ana', 'Cristina', 'María', 'Alí', 'Marian'" }
        },
        "required": ["nombre", "telefono", "sede", "servicio", "fecha", "hora", "notas"]
      }
    },
    {
      "type": "custom",
      "name": "cancelar_cita",
      "description": "Cancela una cita existente identificada por teléfono y fecha.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Ahora mismo cancelo tu cita.",
      "url": "https://n8n.tu-dominio.com/webhook/denueveanueve-cancelar-cita",
      "parameters": {
        "type": "object",
        "properties": {
          "telefono": { "type": "string", "description": "Teléfono del titular" },
          "fecha": { "type": "string", "description": "Fecha de la cita en YYYY-MM-DD" },
          "hora": { "type": "string", "description": "Hora de la cita en HH:MM" }
        },
        "required": ["telefono", "fecha"]
      }
    },
    {
      "type": "custom",
      "name": "modificar_cita",
      "description": "Modifica la fecha/hora de una cita existente. Verifica disponibilidad antes.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Déjame actualizar tu cita.",
      "url": "https://n8n.tu-dominio.com/webhook/denueveanueve-modificar-cita",
      "parameters": {
        "type": "object",
        "properties": {
          "telefono": { "type": "string", "description": "Teléfono del titular" },
          "fecha_actual": { "type": "string", "description": "Fecha actual en YYYY-MM-DD" },
          "hora_actual": { "type": "string", "description": "Hora actual en HH:MM" },
          "nueva_fecha": { "type": "string", "description": "Nueva fecha en YYYY-MM-DD" },
          "nueva_hora": { "type": "string", "description": "Nueva hora en HH:MM" }
        },
        "required": ["telefono", "fecha_actual", "nueva_fecha", "nueva_hora"]
      }
    },
    {
      "type": "transfer_call",
      "name": "transferir_al_salon",
      "description": "Transferir la llamada al salón cuando el cliente lo pida o tenga una reclamación.",
      "number": "+34912345678",
      "speak_during_execution": true,
      "speak_during_execution_message": "Ahora te paso con el salón, un momento por favor."
    }
  ]
}
```

**Respuesta**: Guardar `llm_id` para el Paso 2.

---

## Paso 2 — Crear Agente

```bash
POST https://api.retellai.com/v2/create-agent
Authorization: Bearer $RETELL_API_KEY
```

```json
{
  "agent_name": "Noa — Recepcionista De Nueve a Nueve",
  "response_engine": { "type": "retell-llm", "llm_id": "LLM_ID_DEL_PASO_1" },
  "voice_id": "ELEVENLABS_VOICE_ID",
  "voice_model": "eleven_turbo_v2_5",
  "voice_temperature": 0.9,
  "voice_speed": 1.0,
  "language": "es-ES",
  "interruption_sensitivity": 0.8,
  "enable_backchannel": true,
  "backchannel_frequency": 0.4,
  "backchannel_words": ["Entendido", "Claro", "Perfecto", "De acuerdo", "Sí"],
  "ambient_sound": "coffee-shop",
  "ambient_sound_volume": 0.06,
  "end_call_after_silence_ms": 10000,
  "max_call_duration_ms": 600000,
  "end_call_phrases": ["hasta luego", "que tengas un buen día", "adiós", "hasta pronto"],
  "webhook_url": "https://n8n.tu-dominio.com/webhook/denueveanueve-post-llamada",
  "opt_out_sensitive_data_storage": false
}
```

**Respuesta**: Guardar `agent_id`.

---

## Paso 3 — Asignar número de teléfono

```bash
POST https://api.retellai.com/v2/create-phone-number
Authorization: Bearer $RETELL_API_KEY
```

```json
{ "area_code": "34", "agent_id": "AGENT_ID_DEL_PASO_2" }
```

---

## Variables de entorno (.env)

```env
# Retell AI
RETELL_API_KEY=
LLM_ID=
AGENT_ID=

# Teléfono del salón para transferencias
SALON_PHONE_NUMBER=+34912345678

# ElevenLabs
ELEVENLABS_VOICE_ID=

# n8n webhook URLs
N8N_VERIFICAR_DISPONIBILIDAD_URL=https://n8n.tu-dominio.com/webhook/denueveanueve-verificar-disponibilidad
N8N_CREAR_CITA_URL=https://n8n.tu-dominio.com/webhook/denueveanueve-crear-cita
N8N_CANCELAR_CITA_URL=https://n8n.tu-dominio.com/webhook/denueveanueve-cancelar-cita
N8N_MODIFICAR_CITA_URL=https://n8n.tu-dominio.com/webhook/denueveanueve-modificar-cita
N8N_POST_LLAMADA_URL=https://n8n.tu-dominio.com/webhook/denueveanueve-post-llamada

# Supabase (opcional, solo sincronización)
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=
```

---

## Checklist

- [ ] LLM creado con system prompt y 5 tools
- [ ] LLM_ID copiado al .env
- [ ] Agente creado y vinculado al LLM
- [ ] AGENT_ID copiado al .env
- [ ] URLs de n8n en las tools
- [ ] Teléfono del salón en `transferir_al_salon`
- [ ] Voz ElevenLabs configurada
- [ ] Número de teléfono asignado
- [ ] Webhook post-llamada configurado
- [ ] Test: pedir cita → modificar → cancelar

---

## Prueba rápida (curl)

```bash
curl -X POST https://n8n.tu-dominio.com/webhook/denueveanueve-verificar-disponibilidad \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"sede": "collado_villalba", "servicio": "Corte Señora", "fecha": "2026-04-10", "hora": "10:30"}}'
```

**Respuesta esperada:**

```json
{
  "disponible": true,
  "mensaje": "Hay disponibilidad el viernes 10 de abril a las 10:30 en collado_villalba"
}
```
