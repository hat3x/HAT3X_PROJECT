# Configuración Retell AI — Recepcionista De Nueve a Nueve
# Noa — Asistente de citas por voz

> Arquitectura: RetellAI → Custom Tools (webhooks n8n en tiempo real) → Google Calendar
> Identificador clave de cliente: **número de teléfono**
> Sedes: Collado Villalba · Alpedrete

---

## Arquitectura

```
Noa (LLM Retell) → Tool call → n8n webhook → Google Calendar → respuesta → Noa continúa
```

Retell pausa la conversación mientras espera la respuesta del webhook (máx. 10 s).
Si el webhook tarda más, el agente dice la frase de fallback configurada.

---

## Paso 1 — Crear el LLM en Retell

```
POST https://api.retellai.com/v2/create-retell-llm
Authorization: Bearer {RETELL_API_KEY}
Content-Type: application/json
```

```json
{
  "model": "claude-haiku-20241022",
  "general_prompt": "[PEGAR CONTENIDO DE prompts/system-prompt.md]",
  "begin_message": "Hola, buenas. Has llamado a De Nueve a Nueve. Soy Noa, ¿en qué puedo ayudarte?",
  "general_tools": [

    {
      "type": "custom",
      "name": "verificar_disponibilidad",
      "description": "Verifica si hay un hueco disponible en el calendario para el servicio, sede, fecha y hora indicados. Llamar SIEMPRE antes de crear o modificar una cita.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Un momento, consulto el calendario.",
      "url": "{{N8N_VERIFICAR_DISPONIBILIDAD_URL}}",
      "parameters": {
        "type": "object",
        "properties": {
          "sede": {
            "type": "string",
            "enum": ["collado_villalba", "alpedrete"],
            "description": "Sede donde se quiere la cita"
          },
          "servicio": {
            "type": "string",
            "description": "Nombre exacto del servicio tal como aparece en el catálogo. Ejemplo: 'Corte Señora', 'Mechas completas', 'Manicura semipermanente'"
          },
          "fecha": {
            "type": "string",
            "description": "Fecha deseada en formato YYYY-MM-DD. Ejemplo: 2026-04-10"
          },
          "hora": {
            "type": "string",
            "description": "Hora deseada en formato HH:MM. Ejemplo: 10:30"
          }
        },
        "required": ["sede", "servicio", "fecha", "hora"]
      }
    },

    {
      "type": "custom",
      "name": "crear_cita",
      "description": "Crea la cita en Google Calendar y la registra en el sistema. Llamar solo después de verificar disponibilidad con resultado positivo y tener todos los datos del cliente confirmados.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Perfecto, te apunto ahora mismo.",
      "url": "{{N8N_CREAR_CITA_URL}}",
      "parameters": {
        "type": "object",
        "properties": {
          "nombre": {
            "type": "string",
            "description": "Nombre completo del cliente"
          },
          "telefono": {
            "type": "string",
            "description": "Número de teléfono del cliente (identificador clave). Formato: 9 dígitos sin espacios. Ejemplo: 612345678"
          },
          "sede": {
            "type": "string",
            "enum": ["collado_villalba", "alpedrete"]
          },
          "servicio": {
            "type": "string",
            "description": "Nombre exacto del servicio"
          },
          "fecha": {
            "type": "string",
            "description": "Fecha en formato YYYY-MM-DD"
          },
          "hora": {
            "type": "string",
            "description": "Hora en formato HH:MM"
          },
          "notas": {
            "type": "string",
            "description": "Notas adicionales del cliente: alergias, preferencias de estilista, ocasión especial, etc. Cadena vacía si no hay notas."
          }
        },
        "required": ["nombre", "telefono", "sede", "servicio", "fecha", "hora", "notas"]
      }
    },

    {
      "type": "custom",
      "name": "cancelar_cita",
      "description": "Cancela una cita existente identificada por el teléfono del cliente y la fecha.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Ahora mismo cancelo tu cita.",
      "url": "{{N8N_CANCELAR_CITA_URL}}",
      "parameters": {
        "type": "object",
        "properties": {
          "telefono": {
            "type": "string",
            "description": "Teléfono del titular de la cita"
          },
          "fecha": {
            "type": "string",
            "description": "Fecha de la cita a cancelar en formato YYYY-MM-DD"
          },
          "hora": {
            "type": "string",
            "description": "Hora de la cita en formato HH:MM. Incluir si el cliente tiene varias citas ese día."
          }
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
          "telefono": {
            "type": "string",
            "description": "Teléfono del titular para identificar la cita"
          },
          "fecha_actual": {
            "type": "string",
            "description": "Fecha actual de la cita en formato YYYY-MM-DD"
          },
          "hora_actual": {
            "type": "string",
            "description": "Hora actual de la cita en formato HH:MM"
          },
          "nueva_fecha": {
            "type": "string",
            "description": "Nueva fecha en formato YYYY-MM-DD"
          },
          "nueva_hora": {
            "type": "string",
            "description": "Nueva hora en formato HH:MM"
          }
        },
        "required": ["telefono", "fecha_actual", "nueva_fecha", "nueva_hora"]
      }
    },

    {
      "type": "transfer_call",
      "name": "transferir_al_salon",
      "description": "Transferir la llamada al salón cuando el cliente lo pida explícitamente, tenga una reclamación, o la consulta esté fuera del alcance del asistente.",
      "number": "{{SALON_PHONE_NUMBER}}",
      "speak_during_execution": true,
      "speak_during_execution_message": "Ahora te paso con el salón, un momento por favor."
    }

  ]
}
```

---

## Paso 2 — Crear el Agente

```
POST https://api.retellai.com/v2/create-agent
Authorization: Bearer {RETELL_API_KEY}
Content-Type: application/json
```

```json
{
  "agent_name": "Noa — Recepcionista De Nueve a Nueve",
  "response_engine": {
    "type": "retell-llm",
    "llm_id": "{{LLM_ID_DEL_PASO_1}}"
  },
  "voice_id": "{{ELEVENLABS_VOICE_ID}}",
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
  "end_call_phrases": [
    "hasta luego",
    "que tengas un buen día",
    "adiós",
    "hasta pronto",
    "hasta el",
    "¡hasta pronto!"
  ],
  "webhook_url": "{{N8N_POST_LLAMADA_URL}}",
  "opt_out_sensitive_data_storage": false
}
```

---

## Paso 3 — Asignar número de teléfono

```
POST https://api.retellai.com/v2/create-phone-number
Authorization: Bearer {RETELL_API_KEY}
Content-Type: application/json
```

```json
{
  "area_code": "34",
  "agent_id": "{{AGENT_ID_DEL_PASO_2}}"
}
```

> Alternativa: importar número propio (Twilio/Vonage) si ya tienes uno.

---

## Respuestas esperadas de n8n → Retell

### verificar_disponibilidad — disponible
```json
{
  "disponible": true,
  "fecha": "2026-04-10",
  "hora": "10:30",
  "servicio": "Corte Señora",
  "sede": "collado_villalba",
  "mensaje": "Hay disponibilidad el jueves 10 de abril a las 10:30 en Collado Villalba"
}
```

### verificar_disponibilidad — sin hueco, ofrece alternativa
```json
{
  "disponible": false,
  "mensaje": "No hay disponibilidad a esa hora. El siguiente hueco libre es el viernes 11 de abril a las 12:00",
  "siguiente_disponible": {
    "fecha": "2026-04-11",
    "hora": "12:00"
  }
}
```

### crear_cita — confirmada
```json
{
  "confirmado": true,
  "id_cita": "gcal_event_abc123",
  "resumen": "Cita confirmada a nombre de María García para Corte Señora el jueves 10 de abril a las 10:30 en Collado Villalba",
  "mensaje_confirmacion": "Cita confirmada. Te esperamos el jueves diez de abril a las diez y media en Collado Villalba."
}
```

### crear_cita — error
```json
{
  "confirmado": false,
  "error": "slot_taken",
  "mensaje": "El hueco ya no está disponible. ¿Quieres que busque otro?"
}
```

### cancelar_cita — OK
```json
{
  "cancelado": true,
  "resumen": "Cita de María García del jueves 10 de abril cancelada correctamente",
  "mensaje": "Tu cita del jueves diez de abril ha quedado cancelada. ¡Hasta la próxima!"
}
```

### modificar_cita — OK
```json
{
  "modificado": true,
  "resumen_nuevo": "Cita de María García actualizada: ahora es el viernes 11 de abril a las 12:00",
  "mensaje": "Listo, tu cita ha quedado cambiada al viernes once de abril a las doce."
}
```

---

## Variables de entorno (.env)

```env
RETELL_API_KEY=
LLM_ID=
AGENT_ID=
SALON_PHONE_NUMBER=            # Número real del salón para transferencias
ELEVENLABS_VOICE_ID=           # Voice ID de ElevenLabs (voz femenina española)

# URLs webhooks n8n (rellenar tras activar los workflows)
N8N_VERIFICAR_DISPONIBILIDAD_URL=
N8N_CREAR_CITA_URL=
N8N_CANCELAR_CITA_URL=
N8N_MODIFICAR_CITA_URL=
N8N_POST_LLAMADA_URL=          # Webhook que recibe el resumen al finalizar la llamada
```

---

## Payload que Retell envía a n8n al finalizar la llamada (webhook_url)

```json
{
  "event": "call_ended",
  "call_id": "call_abc123",
  "agent_id": "agent_xyz",
  "from_number": "+34612345678",
  "to_number": "+34900000000",
  "duration_seconds": 87,
  "call_status": "ended",
  "transcript": "...",
  "call_analysis": {
    "call_summary": "La cliente María García ha pedido cita para Corte Señora el jueves 10 de abril a las 10:30 en Collado Villalba.",
    "user_sentiment": "Positive",
    "call_successful": true,
    "custom_analysis_data": {}
  }
}
```

> El agente de n8n puede usar `from_number` para identificar al cliente por teléfono en Supabase.

---

## Datos que n8n debe escribir en Supabase tras crear cita

Cuando `crear_cita` se confirma, n8n crea o actualiza en Supabase:

**Tabla `customers`** (buscar por teléfono, crear si no existe):
```json
{
  "phone": "612345678",
  "first_name": "María",
  "last_name": "García",
  "status": "ACTIVE"
}
```

**Tabla `appointments`** (enlace entre Google Calendar y la app):
```json
{
  "customer_id": "uuid del customer",
  "location_id": "uuid de la sede",
  "start_at": "2026-04-10T10:30:00+02:00",
  "end_at": "2026-04-10T11:15:00+02:00",
  "status": "CONFIRMED",
  "staff_notes": "Cita creada por asistente de voz Noa. Google Calendar ID: gcal_event_abc123"
}
```

---

## Checklist de configuración

- [ ] LLM creado con system prompt y 5 tools
- [ ] LLM_ID copiado al .env
- [ ] Agente creado y vinculado al LLM
- [ ] AGENT_ID copiado al .env
- [ ] URLs de los 4 webhooks n8n completadas en las tools
- [ ] Teléfono del salón configurado en `transferir_al_salon`
- [ ] Voz ElevenLabs configurada (voz femenina, español España)
- [ ] Número de teléfono asignado al agente
- [ ] Webhook post-llamada apuntando a n8n
- [ ] Test completo: pedir cita → modificar → cancelar
- [ ] Test de transferencia de llamada
