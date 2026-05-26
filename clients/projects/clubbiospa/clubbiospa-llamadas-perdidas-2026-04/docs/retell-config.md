# Configuración Retell AI — Recepcionista Club BioSpa

## Versión
v1.0 — 2026-04-09

---

## Datos del agente

| Campo | Valor |
|---|---|
| Nombre del agente | Recepcionista Club BioSpa |
| Caso de uso | Inbound — llamadas no atendidas |
| Idioma | Español (es-ES) |
| LLM | claude-haiku-4-5 (menor latencia, suficiente para este flujo) |
| Voz | Ver `elevenlabs-config.md` |
| Estado | Pendiente de configurar |

---

## Configuración completa del agente (JSON para API o referencia de dashboard)

```json
{
  "agent_name": "Recepcionista Club BioSpa",

  "voice_id": "Ver elevenlabs-config.md — pendiente de confirmar voice ID",
  "voice_model": "eleven_turbo_v2_5",
  "voice_temperature": 1,

  "begin_message": "Gracias por llamar a Club BioSpa. En este momento no podemos atenderte personalmente, pero no te preocupes, estoy aquí para ayudarte a dejar tus datos y que nuestro equipo te llame lo antes posible.",

  "responsiveness": 1,
  "interruption_sensitivity": 0.7,
  "enable_backchannel": true,

  "end_call_after_silence_ms": 8000,
  "max_call_duration_ms": 300000,

  "end_call_phrases": [
    "hasta luego",
    "que tengas un buen día",
    "buen día",
    "adiós",
    "buenas tardes",
    "buenas noches"
  ],

  "webhook_url": "PENDIENTE — URL del webhook n8n de HAT3X",

  "ambient_sound": null,
  "ambient_sound_volume": 0
}
```

---

## Parámetros explicados

### interruption_sensitivity: 0.7
Valor ligeramente por debajo del máximo (1.0) para que el agente no se interrumpa con sonidos del entorno (tráfico, ruido de fondo leve). Para un spa, los clientes suelen llamar desde entornos tranquilos.

### end_call_after_silence_ms: 8000
8 segundos de silencio antes de intentar reactivar la conversación. Si tras el intento de reactivación sigue sin haber respuesta, Retell cierra la llamada. Apropiado para un flujo de recogida de datos donde los silencios son normales (el cliente está pensando el motivo).

### max_call_duration_ms: 300000
5 minutos máximo. Para este caso de uso (solo recoger 3 datos) es más que suficiente. Protege contra llamadas accidentales o clientes que dejan el teléfono abierto.

### enable_backchannel: true
Permite al agente emitir señales de escucha activa ("mmm", "entendido", "sí") mientras el cliente habla. Mejora la naturalidad de la conversación para el perfil de spa.

### ambient_sound: null
No añadir sonido ambiente. La voz calmada de ElevenLabs ya aporta la sensación de spa sin necesidad de música de fondo que podría dificultar la comprensión.

---

## LLM recomendado

**claude-haiku-4-5** es la opción recomendada para este agente por las siguientes razones:

- Latencia inferior a claude-sonnet en entornos de voz en tiempo real
- El flujo de este agente es simple y determinista — no requiere razonamiento complejo
- Coste significativamente menor para un volumen potencial alto de llamadas perdidas
- Capacidad suficiente para seguir instrucciones de sistema simples y capturar datos

Si se detectan errores en la captura de datos o el agente no sigue bien el flujo durante las pruebas, cambiar a **claude-sonnet-4-6**.

---

## Número de teléfono

| Campo | Estado |
|---|---|
| Número asignado | Pendiente |
| Tipo | Comprar en Retell (área code 34 para España) o importar número Twilio existente |
| Asignación al agente | Automática tras compra en Retell dashboard |

### Para comprar número nuevo en Retell:
```
Dashboard → Phone Numbers → Buy Number → Country: Spain (+34) → Assign to agent
```

### Para importar número Twilio existente:
```
Dashboard → Phone Numbers → Import Number → Introducir número y Termination URI de Twilio
```

---

## Webhook — eventos configurados

| Evento | Acción |
|---|---|
| call_ended | POST al webhook n8n con datos de la llamada |
| call_analyzed | Opcional — si se activa el análisis automático de Retell |

El webhook solo necesita escuchar `call_ended`. La URL se configura en el campo `webhook_url` del agente.

---

## Variables dinámicas disponibles (retell_llm_dynamic_variables)

No se usan variables dinámicas en este agente. El flujo es completamente genérico — el agente no recibe información previa sobre el cliente que llama.

Si en el futuro se integra con un CRM que identifique al caller por número, se puede pasar `{{nombre_cliente_previo}}` para personalizar el saludo.

---

## Checklist de configuración

- [ ] Agente creado en Retell dashboard
- [ ] System prompt cargado (ver `prompts/system-prompt.md`)
- [ ] Begin Message configurado
- [ ] Voice ID de ElevenLabs asignado (ver `docs/elevenlabs-config.md`)
- [ ] Webhook URL de n8n configurada
- [ ] Número de teléfono asignado al agente
- [ ] Prueba de llamada desde el dashboard de Retell ("Test Agent")
- [ ] Prueba de llamada real desde teléfono externo
- [ ] Webhook recibido y procesado correctamente por n8n
- [ ] WhatsApp de confirmación enviado al número de prueba

---

## Monitoreo y alertas recomendadas

- Revisar el dashboard de Retell semanalmente para ver tasa de llamadas completadas vs. abandonadas
- Configurar alerta en n8n si el webhook no recibe llamadas en un periodo de 7 días (puede indicar fallo en el desvío de llamadas)
- Revisar transcripciones de las primeras 20 llamadas reales para ajustar el prompt si es necesario
