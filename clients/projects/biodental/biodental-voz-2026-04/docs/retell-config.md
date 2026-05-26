# Configuración Retell AI — Recepcionista Biodental
# Sara — Recepcionista dental IA

> Arquitectura: RetellAI → Custom Tools (webhooks n8n) → Google Calendar + Google Sheets + Twilio WhatsApp

## Paso 1 — Crear el LLM

POST https://api.retellai.com/v2/create-retell-llm
Authorization: Bearer {RETELL_API_KEY}
Content-Type: application/json

```json
{
  "model": "claude-haiku-20241022",
  "general_prompt": "[PEGAR CONTENIDO DE prompts/system-prompt.md]",
  "begin_message": "Clínica Biodental, buenos días. Soy Sara, ¿en qué le puedo ayudar?",
  "general_tools": [
    {
      "type": "custom",
      "name": "verificar_disponibilidad",
      "description": "Verifica si hay un hueco disponible en el calendario para el servicio, fecha y hora indicados. Llamar SIEMPRE antes de crear o modificar una cita.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Un momento, consulto el calendario.",
      "url": "{{N8N_VERIFICAR_DISPONIBILIDAD_URL}}",
      "parameters": {
        "type": "object",
        "properties": {
          "servicio": {
            "type": "string",
            "description": "Nombre exacto del servicio: General, Prostodoncia, Endodoncia, Cirugia e implantes, Ortodoncia, Periodoncia"
          },
          "fecha": { "type": "string", "description": "Fecha en formato YYYY-MM-DD. Ejemplo: 2026-05-10" },
          "hora": { "type": "string", "description": "Hora en formato HH:MM. Ejemplo: 10:30" }
        },
        "required": ["servicio", "fecha", "hora"]
      }
    },
    {
      "type": "custom",
      "name": "crear_cita",
      "description": "Crea la cita en Google Calendar y registra en Google Sheets. Llamar solo después de verificar disponibilidad con resultado positivo.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Perfecto, te apunto ahora mismo.",
      "url": "{{N8N_CREAR_CITA_URL}}",
      "parameters": {
        "type": "object",
        "properties": {
          "nombre": { "type": "string", "description": "Nombre completo del paciente" },
          "telefono": { "type": "string", "description": "Teléfono del paciente. 9 dígitos sin espacios." },
          "servicio": { "type": "string", "description": "Nombre exacto del servicio" },
          "fecha": { "type": "string", "description": "Fecha en formato YYYY-MM-DD" },
          "hora": { "type": "string", "description": "Hora en formato HH:MM" },
          "notas": { "type": "string", "description": "Notas adicionales. Cadena vacía si no hay." }
        },
        "required": ["nombre", "telefono", "servicio", "fecha", "hora", "notas"]
      }
    },
    {
      "type": "custom",
      "name": "cancelar_cita",
      "description": "Cancela una cita existente identificada por teléfono y fecha.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Ahora mismo cancelo tu cita.",
      "url": "{{N8N_CANCELAR_CITA_URL}}",
      "parameters": {
        "type": "object",
        "properties": {
          "telefono": { "type": "string", "description": "Teléfono del paciente titular" },
          "fecha": { "type": "string", "description": "Fecha de la cita en formato YYYY-MM-DD" },
          "hora": { "type": "string", "description": "Hora en HH:MM. Incluir si el paciente tiene varias citas ese día." }
        },
        "required": ["telefono", "fecha"]
      }
    },
    {
      "type": "custom",
      "name": "modificar_cita",
      "description": "Modifica la fecha y/u hora de una cita existente. Llamar solo después de verificar disponibilidad en el nuevo hueco.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Déjame actualizar tu cita.",
      "url": "{{N8N_MODIFICAR_CITA_URL}}",
      "parameters": {
        "type": "object",
        "properties": {
          "telefono": { "type": "string", "description": "Teléfono del paciente" },
          "fecha_actual": { "type": "string", "description": "Fecha actual de la cita en formato YYYY-MM-DD" },
          "hora_actual": { "type": "string", "description": "Hora actual en HH:MM" },
          "nueva_fecha": { "type": "string", "description": "Nueva fecha en formato YYYY-MM-DD" },
          "nueva_hora": { "type": "string", "description": "Nueva hora en HH:MM" }
        },
        "required": ["telefono", "fecha_actual", "nueva_fecha", "nueva_hora"]
      }
    },
    {
      "type": "transfer_call",
      "name": "transferir_a_clinica",
      "description": "Transferir cuando el paciente lo pida, tenga urgencia dental, quiera presupuesto, o la consulta esté fuera del alcance de Sara.",
      "number": "{{CLINICA_PHONE_TRANSFER}}",
      "speak_during_execution": true,
      "speak_during_execution_message": "Voy a pasarte con la clínica ahora mismo, un momento por favor."
    }
  ]
}
```

Guardar el llm_id de la respuesta en .env como RETELL_LLM_ID.

## Paso 2 — Crear el Agente

POST https://api.retellai.com/v2/create-agent
Authorization: Bearer {RETELL_API_KEY}
Content-Type: application/json

```json
{
  "agent_name": "Sara — Recepcionista Biodental (Demo HAT3X)",
  "response_engine": { "type": "retell-llm", "llm_id": "{{RETELL_LLM_ID}}" },
  "voice_id": "{{ELEVENLABS_VOICE_ID}}",
  "voice_model": "eleven_turbo_v2_5",
  "voice_temperature": 0.9,
  "voice_speed": 1.0,
  "language": "es-ES",
  "interruption_sensitivity": 0.8,
  "enable_backchannel": true,
  "backchannel_frequency": 0.4,
  "backchannel_words": ["Entendido", "Claro", "Perfecto", "De acuerdo", "Sí"],
  "ambient_sound": "office",
  "ambient_sound_volume": 0.04,
  "end_call_after_silence_ms": 10000,
  "max_call_duration_ms": 600000,
  "end_call_phrases": ["hasta luego", "que tenga un buen día", "adiós", "hasta pronto"],
  "webhook_url": "{{N8N_POST_LLAMADA_URL}}",
  "opt_out_sensitive_data_storage": false
}
```

Guardar el agent_id en .env como RETELL_AGENT_ID.

## Paso 3 — Asignar número de teléfono

POST https://api.retellai.com/v2/create-phone-number
Authorization: Bearer {RETELL_API_KEY}
Content-Type: application/json

```json
{ "area_code": "34", "agent_id": "{{RETELL_AGENT_ID}}" }
```

## Respuestas esperadas n8n → Retell

verificar_disponibilidad disponible:
{"disponible": true, "fecha": "2026-05-10", "hora": "10:30", "servicio": "Limpieza dental", "mensaje": "Hay disponibilidad el sábado diez de mayo a las diez y media"}

verificar_disponibilidad sin hueco:
{"disponible": false, "mensaje": "No hay disponibilidad a esa hora. El siguiente hueco libre es el lunes doce de mayo a las once", "siguiente_disponible": {"fecha": "2026-05-12", "hora": "11:00"}}

crear_cita confirmada:
{"confirmado": true, "id_cita": "gcal_event_abc123", "mensaje_confirmacion": "Cita confirmada. Te esperamos el sábado diez de mayo a las diez y media para tu limpieza dental. Recibirás la confirmación por WhatsApp."}

cancelar_cita OK:
{"cancelado": true, "mensaje": "Tu cita del sábado diez de mayo ha quedado cancelada. Cuando quieras volver, aquí estaremos."}

modificar_cita OK:
{"modificado": true, "mensaje": "Listo, tu cita ha quedado cambiada al lunes doce de mayo a las once."}

## Checklist final
- [ ] LLM creado y LLM_ID guardado en .env
- [ ] Agente creado y AGENT_ID guardado en .env
- [ ] URLs de 4 webhooks n8n en las tools del LLM
- [ ] Número de transferencia configurado en transfer_call tool
- [ ] Voz ElevenLabs femenina española configurada
- [ ] Número de teléfono asignado al agente
- [ ] Webhook post-llamada apuntando a n8n
- [ ] Test: pedir cita, verificar WhatsApp y Sheets
- [ ] Test: cancelar cita, verificar Sheets actualizado
- [ ] Test: transfer call funciona
