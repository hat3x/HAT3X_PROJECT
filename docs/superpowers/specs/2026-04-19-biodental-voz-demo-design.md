# Spec: Recepcionista IA — Clínica Dental Biodental (Demo)
**Fecha:** 2026-04-19
**Estado:** Aprobado — listo para implementación
**Proyecto:** `proyectos/biodental-voz-2026-04/`

---

## 1. Contexto y objetivo

Clínica Dental Biodental de Colmenarejo no tiene página web ni sistema de gestión. Han pedido a HAT3X una **demo funcional** de recepcionista IA que:

1. Atienda llamadas telefónicas
2. Reserve, modifique y cancele citas
3. Envíe confirmación por WhatsApp al paciente
4. Registre todas las citas en Google Sheets

La demo usa credenciales HAT3X (número Retell de prueba, Calendar y Sheets de demo, Twilio WhatsApp sandbox). En producción se sustituirán por las credenciales reales de la clínica.

---

## 2. Arquitectura

```
Llamada entrante
      ↓
  Retell AI — Agente "Sara"
  (LLM: claude-haiku, voz ElevenLabs femenina española)
      ↓ tool calls (4 herramientas)
  n8n webhooks
      ↓                    ↓
Google Calendar         Google Sheets
(disponibilidad real)   (registro histórico)
                            ↓
                    Twilio WhatsApp sandbox
                    (confirmación al paciente)
```

### Componentes y credenciales demo

| Componente | Detalle | Credenciales |
|---|---|---|
| Retell AI | LLM + agente + número | HAT3X account (número test) |
| n8n | 5 workflows via MCP | Instancia HAT3X existente |
| Google Calendar | 1 calendario demo | Google account HAT3X |
| Google Sheets | 1 spreadsheet demo | Google account HAT3X |
| Twilio sandbox | WhatsApp confirmaciones | Twilio HAT3X (tu número) |
| ElevenLabs | Voz femenina española | HAT3X account |

---

## 3. Agente de voz — Sara

### Identidad
- **Nombre:** Sara
- **Personalidad:** Cálida, profesional, tranquilizadora. Los pacientes dentales suelen estar nerviosos — Sara transmite calma y eficiencia.
- **Idioma:** Español (España)
- **Frase de apertura:** "Clínica Biodental, buenas [tardes/días]. Soy Sara, ¿en qué le puedo ayudar?"

### Servicios que puede reservar

| Servicio | Duración |
|---|---|
| Revisión / primera consulta | 30 min |
| Limpieza dental | 45 min |
| Empaste | 45 min |
| Extracción | 30 min |
| Blanqueamiento dental | 60 min |
| Consulta ortodoncia | 30 min |
| Consulta implantes | 30 min |
| Endodoncia | 60 min |

### Horario de la clínica (demo)
- Lunes a viernes: 9:00–14:00 y 16:00–20:00
- Sábados: 9:00–13:00
- Domingos: cerrado

### Cuándo transfiere la llamada
- El paciente pide hablar con el dentista o con una persona
- Queja o situación de tensión
- Pregunta por presupuesto o precio de tratamiento
- Urgencia dental
- Cualquier consulta clínica (síntomas, diagnóstico, dolor)

---

## 4. Herramientas del agente (Retell tools)

### Tool 1 — `verificar_disponibilidad`
- **Cuándo:** Siempre antes de crear o modificar cita
- **Input:** `servicio`, `fecha` (YYYY-MM-DD), `hora` (HH:MM)
- **n8n:** Consulta Google Calendar → busca huecos libres de la duración del servicio
- **Output:** `{ disponible: true/false, mensaje, siguiente_disponible? }`

### Tool 2 — `crear_cita`
- **Cuándo:** Tras verificar disponibilidad positiva y tener todos los datos del paciente
- **Input:** `nombre`, `telefono`, `servicio`, `fecha`, `hora`, `notas`
- **n8n:**
  1. Crea evento en Google Calendar (duración según servicio)
  2. Añade fila en Google Sheets pestaña "Citas"
  3. Envía WhatsApp por Twilio sandbox
- **Output:** `{ confirmado: true, mensaje_confirmacion, id_cita }`

### Tool 3 — `cancelar_cita`
- **Cuándo:** Paciente quiere cancelar
- **Input:** `telefono`, `fecha`, `hora?`
- **n8n:**
  1. Busca y elimina evento en Google Calendar
  2. Actualiza estado a "CANCELADA" en Sheets
- **Output:** `{ cancelado: true, mensaje }`

### Tool 4 — `modificar_cita`
- **Cuándo:** Paciente quiere cambiar fecha/hora (siempre verificar disponibilidad antes)
- **Input:** `telefono`, `fecha_actual`, `hora_actual`, `nueva_fecha`, `nueva_hora`
- **n8n:**
  1. Modifica evento en Google Calendar
  2. Actualiza fila en Sheets
- **Output:** `{ modificado: true, mensaje }`

---

## 5. Workflows n8n

| # | Nombre | Trigger | Acciones |
|---|---|---|---|
| 01 | `biodental-verificar-disponibilidad` | Webhook POST | Consulta Google Calendar → devuelve disponibilidad + alternativa |
| 02 | `biodental-crear-cita` | Webhook POST | Calendar + Sheets + WhatsApp sandbox |
| 03 | `biodental-cancelar-cita` | Webhook POST | Cancela Calendar + actualiza Sheets |
| 04 | `biodental-modificar-cita` | Webhook POST | Modifica Calendar + actualiza Sheets |
| 05 | `biodental-post-llamada` | Webhook POST (Retell) | Guarda resumen en Sheets pestaña "Llamadas" |

---

## 6. Google Sheets — estructura

### Pestaña "Citas"
```
ID | Nombre | Teléfono | Servicio | Fecha | Hora | Duración | Estado | Notas | Calendar_Event_ID | Creada_en
```
- Fecha: YYYY-MM-DD
- Hora: HH:MM
- Duración: minutos (número)
- Estado: CONFIRMADA | CANCELADA | MODIFICADA | NO_PRESENTADO

### Pestaña "Llamadas"
```
ID | Fecha_llamada | Duración_seg | Resumen | Sentimiento | Exitosa | Call_ID
```
- Fecha_llamada: YYYY-MM-DD HH:MM:SS
- Sentimiento: Positive | Neutral | Negative
- Exitosa: TRUE | FALSE

---

## 7. WhatsApp — mensaje de confirmación

```
✅ Cita confirmada - Clínica Biodental

Hola [Nombre], tu cita ha quedado confirmada:

📅 [Día de la semana] [Fecha] a las [Hora]
🦷 [Servicio]
📍 Clínica Biodental, Colmenarejo

¿Necesitas cambiar o cancelar tu cita? Llámanos al [número demo].

¡Hasta pronto!
```

---

## 8. Configuración Retell AI

### LLM
```json
{
  "model": "claude-haiku-20241022",
  "general_prompt": "[system-prompt.md]",
  "begin_message": "Clínica Biodental, buenas tardes. Soy Sara, ¿en qué le puedo ayudar?"
}
```

### Agente
```json
{
  "agent_name": "Sara — Recepcionista Biodental (Demo HAT3X)",
  "voice_id": "[ElevenLabs voz femenina española]",
  "voice_model": "eleven_turbo_v2_5",
  "voice_temperature": 0.9,
  "language": "es-ES",
  "interruption_sensitivity": 0.8,
  "enable_backchannel": true,
  "backchannel_words": ["Entendido", "Claro", "Perfecto", "De acuerdo", "Sí"],
  "ambient_sound": "office",
  "ambient_sound_volume": 0.04,
  "end_call_after_silence_ms": 10000
}
```

---

## 9. Estructura de carpetas del proyecto

```
proyectos/biodental-voz-2026-04/
├── README.md
├── .env.example
├── prompts/
│   └── system-prompt.md
├── docs/
│   ├── retell-config.md
│   └── google-sheets-structure.md
└── n8n/
    ├── 01-verificar-disponibilidad.json
    ├── 02-crear-cita.json
    ├── 03-cancelar-cita.json
    ├── 04-modificar-cita.json
    ├── 05-post-llamada.json
    └── README-N8N.md
```

---

## 10. Criterios de éxito de la demo

- [ ] Llamada entrante → Sara responde con la frase de apertura
- [ ] Flujo completo reserva: verificar disponibilidad → recoger datos → crear cita → confirmación verbal
- [ ] WhatsApp sandbox llega al número HAT3X con los datos de la cita
- [ ] Fila aparece en Google Sheets con estado CONFIRMADA
- [ ] Evento aparece en Google Calendar con duración correcta
- [ ] Flujo cancelación funciona y actualiza Sheets
- [ ] Flujo modificación funciona (verifica disponibilidad primero)
- [ ] Transfer call funciona cuando corresponde

---

## 11. Lo que NO incluye esta demo (para producción)

- Número de teléfono real de Biodental
- WhatsApp Business real de la clínica
- Google Calendar real del dentista
- Dashboard de control de citas (fase siguiente)
- Integración con software de gestión dental (futuro)
