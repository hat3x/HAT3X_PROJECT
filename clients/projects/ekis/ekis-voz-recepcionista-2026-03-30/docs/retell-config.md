# Configuración Retell AI — Recepcionista Ekis
# VERSIÓN 2 — Con Custom Tools (llamadas en tiempo real a n8n)

> El agente tiene 4 herramientas que llama DURANTE la conversación.
> Cada herramienta dispara un webhook en n8n que consulta/actualiza Google Sheets.
> Los 4 workflows n8n están en `webhooks/` — importarlos antes de configurar las URLs aquí.

---

## Arquitectura de Tools

```
Carmen (LLM) → Tool call → n8n webhook → Google Calendar / Sheets → respuesta → Carmen sigue la conversación
```

Retell pausa la conversación mientras espera la respuesta del webhook (máx. 10 segundos).
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
  "general_prompt": "[PEGAR AQUÍ EL CONTENIDO DE prompts/system-prompt.md]",
  "begin_message": "Hola, buenas. Has llamado al Restaurante Ekis. Soy Carmen, ¿en qué puedo ayudarte?",
  "general_tools": [
    {
      "type": "custom",
      "name": "verificar_disponibilidad",
      "description": "Verifica si hay disponibilidad en el restaurante para una fecha, franja y número de personas. Llamar siempre antes de confirmar una reserva nueva o una modificación de fecha.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Un momento, compruebo la disponibilidad.",
      "execution_message_description": "Frase que Carmen dice mientras espera la respuesta",
      "url": "{{N8N_VERIFICAR_DISPONIBILIDAD_URL}}  ← copiar de .env tras activar workflow n8n",
      "parameters": {
        "type": "object",
        "properties": {
          "fecha": {
            "type": "string",
            "description": "Fecha de la reserva en formato YYYY-MM-DD. Ejemplo: 2026-04-15"
          },
          "franja": {
            "type": "string",
            "enum": ["almuerzo", "cena"],
            "description": "Franja horaria: almuerzo (13:30-16:00) o cena (20:30-00:00)"
          },
          "personas": {
            "type": "integer",
            "description": "Número de personas para las que se busca disponibilidad"
          }
        },
        "required": ["fecha", "franja", "personas"]
      }
    },
    {
      "type": "custom",
      "name": "crear_reserva",
      "description": "Crea una reserva nueva en el sistema. Llamar solo después de haber verificado disponibilidad y tener todos los datos del cliente.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Perfecto, te confirmo la reserva ahora mismo.",
      "url": "{{N8N_CREAR_RESERVA_URL}}  ← copiar de .env tras activar workflow n8n",
      "parameters": {
        "type": "object",
        "properties": {
          "nombre": {
            "type": "string",
            "description": "Nombre completo del titular de la reserva"
          },
          "telefono": {
            "type": "string",
            "description": "Teléfono de contacto del titular"
          },
          "personas": {
            "type": "integer",
            "description": "Número de personas"
          },
          "fecha": {
            "type": "string",
            "description": "Fecha en formato YYYY-MM-DD"
          },
          "franja": {
            "type": "string",
            "enum": ["almuerzo", "cena"]
          },
          "notas": {
            "type": "string",
            "description": "Notas especiales: alergias, ocasión especial, silla para bebé, etc. Si no hay notas, enviar cadena vacía."
          }
        },
        "required": ["nombre", "telefono", "personas", "fecha", "franja", "notas"]
      }
    },
    {
      "type": "custom",
      "name": "modificar_reserva",
      "description": "Modifica una reserva existente. Puede cambiar la fecha, la franja horaria o el número de personas.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Déjame actualizar tu reserva.",
      "url": "{{N8N_MODIFICAR_RESERVA_URL}}  ← copiar de .env tras activar workflow n8n",
      "parameters": {
        "type": "object",
        "properties": {
          "telefono": {
            "type": "string",
            "description": "Teléfono del titular para identificar la reserva"
          },
          "fecha_actual": {
            "type": "string",
            "description": "Fecha actual de la reserva en formato YYYY-MM-DD"
          },
          "nueva_fecha": {
            "type": "string",
            "description": "Nueva fecha si el cliente quiere cambiarla, en formato YYYY-MM-DD. Omitir si no cambia."
          },
          "nueva_franja": {
            "type": "string",
            "enum": ["almuerzo", "cena"],
            "description": "Nueva franja si el cliente quiere cambiarla. Omitir si no cambia."
          },
          "nuevas_personas": {
            "type": "integer",
            "description": "Nuevo número de personas si cambia. Omitir si no cambia."
          }
        },
        "required": ["telefono", "fecha_actual"]
      }
    },
    {
      "type": "custom",
      "name": "cancelar_reserva",
      "description": "Cancela una reserva existente identificada por teléfono y fecha.",
      "speak_during_execution": true,
      "speak_during_execution_message": "Ahora mismo cancelo tu reserva.",
      "url": "{{N8N_CANCELAR_RESERVA_URL}}  ← copiar de .env tras activar workflow n8n",
      "parameters": {
        "type": "object",
        "properties": {
          "telefono": {
            "type": "string",
            "description": "Teléfono del titular de la reserva"
          },
          "fecha": {
            "type": "string",
            "description": "Fecha de la reserva a cancelar en formato YYYY-MM-DD"
          }
        },
        "required": ["telefono", "fecha"]
      }
    },
    {
      "type": "transfer_call",
      "name": "transferir_al_encargado",
      "description": "Transferir la llamada al encargado cuando el cliente lo solicite, tenga una queja, pregunte por alérgenos o sea grupo de más de 10 personas",
      "number": "{{MANAGER_PHONE_NUMBER}}  ← copiar de .env",
      "speak_during_execution": true,
      "speak_during_execution_message": "Voy a pasarte con el encargado, un momento por favor."
    }
  ]
}
```

---

## Paso 2 — Crear el Agente

```json
POST https://api.retellai.com/v2/create-agent
Authorization: Bearer {RETELL_API_KEY}

{
  "agent_name": "Recepcionista Ekis — Demo HAT3X",
  "response_engine": {
    "type": "retell-llm",
    "llm_id": "COMPLETAR_CON_LLM_ID_DEL_PASO_1"
  },
  "voice_id": "COMPLETAR_CON_ELEVENLABS_VOICE_ID",
  "voice_model": "eleven_turbo_v2_5",
  "voice_temperature": 1.0,
  "voice_speed": 1.0,
  "language": "es-ES",
  "interruption_sensitivity": 0.8,
  "enable_backchannel": true,
  "backchannel_frequency": 0.5,
  "backchannel_words": ["Entendido", "Claro", "Perfecto", "De acuerdo"],
  "ambient_sound": "coffee-shop",
  "ambient_sound_volume": 0.08,
  "end_call_after_silence_ms": 600000,
  "max_call_duration_ms": 600000,
  "end_call_phrases": [
    "hasta luego",
    "que tengas un buen día",
    "que aproveche",
    "adiós",
    "hasta pronto"
  ],
  "webhook_url": "{{N8N_POST_LLAMADA_URL}}  ← copiar de .env",
  "opt_out_sensitive_data_storage": false
}
```

---

## Paso 3 — Asignar Número de Teléfono

```json
POST https://api.retellai.com/v2/create-phone-number
Authorization: Bearer {RETELL_API_KEY}

{
  "area_code": "34",
  "agent_id": "AGENT_ID_DEL_PASO_2"
}
```

---

## Respuestas esperadas de cada tool (para referencia)

### verificar_disponibilidad → respuesta OK
```json
{
  "disponible": true,
  "personas_disponibles": 23,
  "proxima_disponible": null,
  "mensaje": "Disponibilidad confirmada para 4 personas el martes a mediodía"
}
```

### verificar_disponibilidad → sin sitio
```json
{
  "disponible": false,
  "personas_disponibles": 0,
  "proxima_disponible": {
    "fecha": "2026-04-16",
    "franja": "cena",
    "personas_disponibles": 18
  },
  "mensaje": "Sin disponibilidad el martes a mediodía. Siguiente hueco: miércoles por la noche"
}
```

### crear_reserva → confirmación
```json
{
  "confirmado": true,
  "id_reserva": "20260415A-K7F2",
  "resumen": "Reserva confirmada a nombre de García para 4 personas el martes quince a mediodía",
  "mensaje_confirmacion": "Reserva confirmada a nombre de García, para cuatro personas, el martes a mediodía. Te esperamos."
}
```

### modificar_reserva → OK
```json
{
  "modificado": true,
  "id_reserva": "20260415A-K7F2",
  "resumen_nuevo": "Reserva de García actualizada: ahora es el miércoles dieciséis a mediodía, para cuatro personas"
}
```

### cancelar_reserva → OK
```json
{
  "cancelado": true,
  "resumen": "Reserva de García del martes quince cancelada correctamente"
}
```

---

## Checklist de Configuración

- [ ] LLM creado con el system prompt y las 5 tools configuradas
- [ ] Agente creado y vinculado al LLM
- [ ] URLs de webhooks n8n completadas en todas las tools
- [ ] Teléfono del encargado configurado en transfer_call
- [ ] Voz ElevenLabs configurada
- [ ] Número de teléfono asignado al agente
- [ ] Webhook post-llamada configurado
- [ ] Llamada de prueba completa: reserva → modificar → cancelar
