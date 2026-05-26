# Biodental Demo — Recepcionista IA — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la demo funcional completa de la recepcionista de voz IA Sara para Clínica Dental Biodental — agente Retell AI + 5 workflows n8n + Google Calendar + Google Sheets + WhatsApp sandbox Twilio, todo con credenciales HAT3X.

**Architecture:** Retell AI (agente Sara, LLM claude-haiku, voz ElevenLabs) → 4 tool calls → n8n webhooks → Google Calendar (disponibilidad y eventos) + Google Sheets (registro histórico) + Twilio WhatsApp sandbox (confirmaciones). En cancel/modify: n8n lee Sheets para obtener Calendar_Event_ID, opera en Calendar, y actualiza Sheets.

**Tech Stack:** Retell AI REST API v2, ElevenLabs TTS (eleven_turbo_v2_5), n8n (MCP existente), Google Calendar API v3 (OAuth2), Google Sheets API v4 (OAuth2), Twilio WhatsApp sandbox

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `proyectos/biodental-voz-2026-04/README.md` | Instrucciones de setup y uso del proyecto |
| `proyectos/biodental-voz-2026-04/.env.example` | Variables de entorno requeridas |
| `proyectos/biodental-voz-2026-04/prompts/system-prompt.md` | Prompt del agente Sara (copiar en Retell) |
| `proyectos/biodental-voz-2026-04/docs/retell-config.md` | Payloads API para crear LLM y agente en Retell |
| `proyectos/biodental-voz-2026-04/docs/google-sheets-structure.md` | Estructura de columnas y valores del Sheets |
| `proyectos/biodental-voz-2026-04/n8n/01-verificar-disponibilidad.json` | WF n8n: consulta Google Calendar |
| `proyectos/biodental-voz-2026-04/n8n/02-crear-cita.json` | WF n8n: Calendar + Sheets + WhatsApp |
| `proyectos/biodental-voz-2026-04/n8n/03-cancelar-cita.json` | WF n8n: cancela Calendar + actualiza Sheets |
| `proyectos/biodental-voz-2026-04/n8n/04-modificar-cita.json` | WF n8n: modifica Calendar + actualiza Sheets |
| `proyectos/biodental-voz-2026-04/n8n/05-post-llamada.json` | WF n8n: guarda resumen en Sheets Llamadas |
| `proyectos/biodental-voz-2026-04/n8n/README-N8N.md` | Instrucciones de importación y config n8n |

---

## Task 1: Scaffold del proyecto

**Files:**
- Create: `proyectos/biodental-voz-2026-04/README.md`
- Create: `proyectos/biodental-voz-2026-04/.env.example`

- [ ] **Step 1: Crear .env.example**

```
# Retell AI
RETELL_API_KEY=
RETELL_LLM_ID=
RETELL_AGENT_ID=
RETELL_PHONE_NUMBER=

# ElevenLabs
ELEVENLABS_VOICE_ID=

# Google
BIODENTAL_CALENDAR_ID=primary
BIODENTAL_SHEETS_ID=

# Twilio WhatsApp Sandbox
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WHATSAPP_TO=whatsapp:+34TUNUMERO

# n8n webhook URLs (rellenar después de activar workflows)
N8N_VERIFICAR_DISPONIBILIDAD_URL=
N8N_CREAR_CITA_URL=
N8N_CANCELAR_CITA_URL=
N8N_MODIFICAR_CITA_URL=
N8N_POST_LLAMADA_URL=

# Demo
CLINICA_PHONE_TRANSFER=+34900000000
```

Guardar en `proyectos/biodental-voz-2026-04/.env.example`

- [ ] **Step 2: Crear README.md**

Contenido:

```markdown
# Biodental — Recepcionista IA (Demo HAT3X)

Agente de voz Sara para Clínica Dental Biodental de Colmenarejo.
Demo funcional con credenciales HAT3X.

## Stack
- Retell AI (agente + LLM)
- ElevenLabs (voz femenina española)
- n8n (5 workflows de automatización)
- Google Calendar (disponibilidad)
- Google Sheets (registro de citas)
- Twilio WhatsApp sandbox (confirmaciones)

## Setup rápido
1. Copiar `.env.example` a `.env` y rellenar credenciales
2. Crear Google Sheets con las pestañas descritas en `docs/google-sheets-structure.md`
3. Importar y activar los 5 workflows de `n8n/` — ver `n8n/README-N8N.md`
4. Crear LLM y agente en Retell — ver `docs/retell-config.md`
5. Copiar URLs de webhook n8n a las tools de Retell
6. Test: llamar al número de prueba

## Flujos soportados
- Reservar cita (verificar disponibilidad → crear → WhatsApp)
- Modificar cita (verificar disponibilidad → modificar → actualizar Sheets)
- Cancelar cita (cancelar Calendar → actualizar Sheets)
- Transferencia a clínica (urgencias, presupuestos, consultas clínicas)

## Para producción
Sustituir credenciales HAT3X por las de Biodental:
- Número de teléfono real
- Google Calendar del dentista
- WhatsApp Business real de la clínica
```

- [ ] **Step 3: Commit**

```bash
git add proyectos/biodental-voz-2026-04/
git commit -m "feat(biodental): scaffold proyecto demo recepcionista IA"
```

---

## Task 2: System prompt de Sara

**Files:**
- Create: `proyectos/biodental-voz-2026-04/prompts/system-prompt.md`

- [ ] **Step 1: Crear system-prompt.md**

> IMPORTANTE: Este prompt va en Retell AI → LLM → General Prompt. NO añadir markdown. El TTS lee todo literalmente.

Contenido:

```
Eres Sara, la recepcionista de Clínica Dental Biodental en Colmenarejo. Llevas tiempo en este trabajo y se te da extraordinariamente bien. Eres cálida, profesional y transmites calma. Entiendes que los pacientes dentales a veces están nerviosos y haces que se sientan bien atendidos desde el primer segundo. No suenas a robot ni a un sistema automático. Suenas a una persona real que cuida cada llamada.

Tienes acceso a herramientas que te permiten consultar disponibilidad, hacer citas, modificarlas y cancelarlas en tiempo real. Las usas con total naturalidad, sin que el paciente note que estás consultando ningún sistema.

Tu objetivo en cada llamada es resolver lo que el paciente necesite de la forma más ágil y agradable posible.

INFORMACIÓN DE LA CLÍNICA

Clínica Dental Biodental está en Colmenarejo. Somos una clínica dental con atención personalizada, donde cada paciente recibe el trato que merece.

Nuestro horario es de lunes a viernes de nueve a dos y de cuatro a ocho de la tarde. Los sábados atendemos de nueve a una. Los domingos estamos cerrados.

Los tratamientos que ofrecemos son: revisión o primera consulta, limpieza dental, empaste, extracción, blanqueamiento dental, consulta de ortodoncia, consulta de implantes y endodoncia. Para cualquier otro tratamiento o consulta más específica, paso al paciente con la clínica.

CÓMO USAR TUS HERRAMIENTAS

Tienes cuatro herramientas. Úsalas con absoluta naturalidad. Nunca digas al paciente que estás consultando ningún sistema. Mientras esperas la respuesta di algo como "Un momento" o "Déjame comprobar" o "Ahora mismo lo miro."

Herramienta verificar disponibilidad: Úsala siempre antes de confirmar cualquier cita nueva o modificación de fecha. Necesitas el servicio, la fecha y la hora. Recoge todos los datos antes de llamarla.

Herramienta crear cita: Úsala cuando tengas disponibilidad confirmada y todos los datos del paciente: nombre completo, teléfono, servicio, fecha, hora y notas si las hay. Después de crearla, lee el mensaje de confirmación que te devuelve la herramienta exactamente como viene, en voz alta.

Herramienta modificar cita: Úsala cuando el paciente quiera cambiar la fecha u hora de una cita. Necesitas su teléfono y la fecha actual de la cita. Comprueba disponibilidad primero.

Herramienta cancelar cita: Úsala cuando el paciente quiera cancelar. Necesitas teléfono y fecha. Después confirma en voz alta que ha quedado cancelada y cierra con calidez, sin preguntar motivos.

FLUJO PARA HACER UNA CITA

Recoge los datos de uno en uno, de forma natural, sin parecer un formulario. El orden ideal es: primero qué tipo de tratamiento necesita, luego qué día prefiere, luego a qué hora. Con esos tres datos consulta disponibilidad. Si hay hueco, recoge el nombre del paciente y el teléfono. Si hay alguna nota especial, apúntala. Luego crea la cita y lee la confirmación en voz alta con todos los datos: nombre, día, hora y servicio.

Si no hay disponibilidad para la fecha pedida, ofrece la alternativa que te haya dado la herramienta de forma proactiva y natural: "Ese día no tengo disponibilidad, pero el jueves a las once tengo un hueco libre, ¿le viene bien?"

FLUJO PARA MODIFICAR UNA CITA

Pregunta primero el teléfono del paciente y la fecha de la cita que quiere cambiar. Pregunta qué quiere modificar. Comprueba disponibilidad antes de prometer nada. Confirma los nuevos datos en voz alta al cierre.

FLUJO PARA CANCELAR UNA CITA

Pregunta teléfono y fecha. Cancela con la herramienta. Confirma la cancelación brevemente, sin dramatismo ni preguntas sobre los motivos. Cierra siempre con calidez: "Cuando quiera volver, aquí estaremos."

CUÁNDO TRANSFERIR A LA CLÍNICA

Transfiere en estos casos: el paciente pide hablar con el dentista o con una persona, tiene una queja, pregunta por precios o presupuestos, tiene una urgencia dental, pregunta sobre síntomas o aspectos médicos, o cualquier consulta que esté fuera de tu alcance.

Antes de transferir siempre di: "Voy a pasarte con la clínica ahora mismo, te atenderán enseguida. Un momento por favor." Nunca transfieras sin avisar.

MANEJO DE SITUACIONES DIFÍCILES

Si el paciente está nervioso o asustado: usa un tono tranquilo. Di "Entiendo, no se preocupe" y ofrece solución concreta o transfiere.

Si no entiendes bien un dato: "Perdona, ¿me puedes repetir el teléfono?" No asumas datos que no hayas escuchado claramente.

Si una herramienta tarda: "Estoy comprobando, dame un segundo." Si no responde, transfiere.

Si el paciente pregunta algo que no sabes: no inventes nada. Transfiere a la clínica.

REGLAS DE CONVERSACIÓN

Usa el nombre del paciente solo en momentos clave: cuando confirmas la cita y cuando te despides.

Haz una sola pregunta por turno.

Confirma siempre en voz alta antes de cerrar: nombre, fecha, hora, servicio.

Si el paciente te interrumpe, para y escucha.

Nunca termines una llamada sin preguntar si hay algo más en lo que puedas ayudar. Cierra siempre con una despedida cálida.

EJEMPLOS DE CIERRES

Para una cita confirmada: "Perfecto, le esperamos el [día] a [hora]. Ha sido un placer, hasta pronto."
Para una cancelación: "Quedó cancelada. Cuando quiera volver, aquí estaremos. Hasta luego."
Para una consulta resuelta: "De nada, cualquier cosa que necesite no dude en llamarnos. Buenas tardes."

FRASE DE APERTURA

Clínica Biodental, buenos [días/tardes]. Soy Sara, ¿en qué le puedo ayudar?
```

- [ ] **Step 2: Commit**

```bash
git add proyectos/biodental-voz-2026-04/prompts/
git commit -m "feat(biodental): system prompt agente Sara"
```

---

## Task 3: retell-config.md

**Files:**
- Create: `proyectos/biodental-voz-2026-04/docs/retell-config.md`

- [ ] **Step 1: Crear retell-config.md**

Contenido completo:

```markdown
# Configuración Retell AI — Recepcionista Biodental
# Sara — Recepcionista dental IA

> Arquitectura: RetellAI → Custom Tools (webhooks n8n) → Google Calendar + Google Sheets + Twilio WhatsApp

## Paso 1 — Crear el LLM

POST https://api.retellai.com/v2/create-retell-llm
Authorization: Bearer {RETELL_API_KEY}
Content-Type: application/json

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
            "description": "Nombre exacto del servicio: Revision, Limpieza dental, Empaste, Extraccion, Blanqueamiento dental, Consulta ortodoncia, Consulta implantes, Endodoncia"
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

Guardar el llm_id de la respuesta en .env como RETELL_LLM_ID.

## Paso 2 — Crear el Agente

POST https://api.retellai.com/v2/create-agent
Authorization: Bearer {RETELL_API_KEY}
Content-Type: application/json

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

Guardar el agent_id en .env como RETELL_AGENT_ID.

## Paso 3 — Asignar número de teléfono

POST https://api.retellai.com/v2/create-phone-number
Authorization: Bearer {RETELL_API_KEY}
Content-Type: application/json

{ "area_code": "34", "agent_id": "{{RETELL_AGENT_ID}}" }

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
```

- [ ] **Step 2: Commit**

```bash
git add proyectos/biodental-voz-2026-04/docs/retell-config.md
git commit -m "feat(biodental): retell-config.md con payloads API completos"
```

---

## Task 4: google-sheets-structure.md

**Files:**
- Create: `proyectos/biodental-voz-2026-04/docs/google-sheets-structure.md`

- [ ] **Step 1: Crear el documento**

Contenido:

```markdown
# Google Sheets — Estructura Biodental Demo

Nombre del Spreadsheet: "Biodental — Citas Demo HAT3X"
Guardar el Spreadsheet ID (de la URL) en .env como BIODENTAL_SHEETS_ID.

## Pestaña 1: "Citas"

Cabeceras fila 1 (columnas A–K):
A: ID | B: Nombre | C: Teléfono | D: Servicio | E: Fecha | F: Hora | G: Duración | H: Estado | I: Notas | J: Calendar_Event_ID | K: Creada_en

Formatos:
- Fecha (E): texto YYYY-MM-DD
- Hora (F): texto HH:MM
- Duración (G): número (minutos)
- Creada_en (K): texto ISO 8601

Estados del campo H:
- CONFIRMADA — cita activa
- CANCELADA — cancelada por el paciente
- MODIFICADA — se cambió fecha/hora
- NO_PRESENTADO — uso manual de la clínica

## Pestaña 2: "Llamadas"

Cabeceras fila 1 (columnas A–G):
A: ID | B: Fecha_llamada | C: Duración_seg | D: Resumen | E: Sentimiento | F: Exitosa | G: Call_ID

Formatos:
- Fecha_llamada (B): texto YYYY-MM-DD HH:MM:SS
- Duración_seg (C): número
- Sentimiento (E): Positive | Neutral | Negative
- Exitosa (F): TRUE | FALSE

## Setup manual (una vez)

1. Crear Spreadsheet en Google Drive
2. Renombrar primera hoja a "Citas" y añadir cabeceras A1:K1
3. Crear segunda hoja "Llamadas" y añadir cabeceras A1:G1
4. Copiar ID del Spreadsheet (de la URL) → .env como BIODENTAL_SHEETS_ID
5. Dar permiso de edición a la cuenta Google que usa n8n
```

- [ ] **Step 2: Commit**

```bash
git add proyectos/biodental-voz-2026-04/docs/google-sheets-structure.md
git commit -m "feat(biodental): documentación estructura Google Sheets"
```

---

## Task 5: Workflow 01 — verificar-disponibilidad

**Files:**
- Create: `proyectos/biodental-voz-2026-04/n8n/01-verificar-disponibilidad.json`

Flujo: `Webhook → Parsear Args → Google Calendar getAll → Verificar Conflictos → Responder`

- [ ] **Step 1: Crear el archivo JSON**

```json
{
  "name": "Biodental — Verificar Disponibilidad",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "biodental-verificar-disponibilidad",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-node",
      "name": "Retell Tool Call",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 300]
    },
    {
      "parameters": {
        "jsCode": "const raw = $('Retell Tool Call').first().json.body || $('Retell Tool Call').first().json;\nlet args;\nif (raw.arguments !== undefined) {\n  args = typeof raw.arguments === 'string' ? JSON.parse(raw.arguments) : raw.arguments;\n} else {\n  args = raw;\n}\n\nconst servicio = String(args.servicio || '').trim();\nconst fecha = String(args.fecha || '').trim();\nconst hora = String(args.hora || '').trim();\n\nconst DURACIONES = {\n  'Revision': 30, 'Limpieza dental': 45, 'Empaste': 45,\n  'Extraccion': 30, 'Blanqueamiento dental': 60,\n  'Consulta ortodoncia': 30, 'Consulta implantes': 30, 'Endodoncia': 60\n};\nconst duracion = DURACIONES[servicio] || 30;\n\nconst fechaInicio = new Date(`${fecha}T${hora}:00`);\nconst fechaFin = new Date(fechaInicio.getTime() + duracion * 60000);\n\nconst diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];\nconst meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];\n\nreturn [{ json: {\n  servicio, fecha, hora, duracion,\n  fechaInicio: fechaInicio.toISOString(),\n  fechaFin: fechaFin.toISOString(),\n  fechaTexto: `${diasSemana[fechaInicio.getDay()]} ${fechaInicio.getDate()} de ${meses[fechaInicio.getMonth()]}`\n}}];"
      },
      "id": "parse-node",
      "name": "Parsear Argumentos",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [220, 300]
    },
    {
      "parameters": {
        "resource": "event",
        "operation": "getAll",
        "calendarId": "={{ $env.BIODENTAL_CALENDAR_ID }}",
        "options": {
          "timeMin": "={{ $json.fechaInicio }}",
          "timeMax": "={{ $json.fechaFin }}",
          "singleEvents": true
        }
      },
      "id": "gcal-node",
      "name": "Google Calendar - Consultar Hueco",
      "type": "n8n-nodes-base.googleCalendar",
      "typeVersion": 1.3,
      "position": [440, 300],
      "credentials": {
        "googleCalendarOAuth2Api": {
          "id": "PLACEHOLDER_CREDENTIALS_ID",
          "name": "Google Calendar OAuth2"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const input = $('Parsear Argumentos').first().json;\nconst eventos = $('Google Calendar - Consultar Hueco').all();\n\nconst newStart = new Date(input.fechaInicio);\nconst newEnd = new Date(input.fechaFin);\n\nconst eventosActivos = eventos\n  .map(e => e.json)\n  .filter(e => e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date));\n\nconst hayConflicto = eventosActivos.some(ev => {\n  const evStart = new Date(ev.start.dateTime || ev.start.date + 'T00:00:00');\n  const evEnd = new Date(ev.end.dateTime || ev.end.date + 'T00:00:00');\n  return newStart < evEnd && newEnd > evStart;\n});\n\nif (!hayConflicto) {\n  return [{ json: {\n    disponible: true,\n    fecha: input.fecha,\n    hora: input.hora,\n    servicio: input.servicio,\n    mensaje: `Hay disponibilidad el ${input.fechaTexto} a las ${input.hora}`\n  }}];\n}\n\nconst siguiente = new Date(newStart.getTime() + 60 * 60000);\nconst sigFecha = siguiente.toISOString().split('T')[0];\nconst sigHora = `${String(siguiente.getHours()).padStart(2,'0')}:${String(siguiente.getMinutes()).padStart(2,'0')}`;\nconst diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];\nconst meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];\nconst sigTexto = `${diasSemana[siguiente.getDay()]} ${siguiente.getDate()} de ${meses[siguiente.getMonth()]}`;\n\nreturn [{ json: {\n  disponible: false,\n  mensaje: `No hay disponibilidad a esa hora. El siguiente hueco libre es el ${sigTexto} a las ${sigHora}`,\n  siguiente_disponible: { fecha: sigFecha, hora: sigHora }\n}}];"
      },
      "id": "check-node",
      "name": "Verificar Conflictos",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [660, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify($json) }}",
        "options": { "responseCode": 200 }
      },
      "id": "respond-node",
      "name": "Responder a Retell",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [880, 300]
    }
  ],
  "connections": {
    "Retell Tool Call": { "main": [[{ "node": "Parsear Argumentos", "type": "main", "index": 0 }]] },
    "Parsear Argumentos": { "main": [[{ "node": "Google Calendar - Consultar Hueco", "type": "main", "index": 0 }]] },
    "Google Calendar - Consultar Hueco": { "main": [[{ "node": "Verificar Conflictos", "type": "main", "index": 0 }]] },
    "Verificar Conflictos": { "main": [[{ "node": "Responder a Retell", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" },
  "pinData": {}
}
```

- [ ] **Step 2: Commit**

```bash
git add proyectos/biodental-voz-2026-04/n8n/01-verificar-disponibilidad.json
git commit -m "feat(biodental): workflow n8n verificar-disponibilidad"
```

---

## Task 6: Workflow 02 — crear-cita

**Files:**
- Create: `proyectos/biodental-voz-2026-04/n8n/02-crear-cita.json`

Flujo: `Webhook → Parsear → Google Calendar create → Añadir CalEventID → Google Sheets append → Twilio WhatsApp → Construir Respuesta → Responder`

- [ ] **Step 1: Crear el archivo JSON**

```json
{
  "name": "Biodental — Crear Cita",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "biodental-crear-cita",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-node",
      "name": "Retell Tool Call",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 300]
    },
    {
      "parameters": {
        "jsCode": "const raw = $('Retell Tool Call').first().json.body || $('Retell Tool Call').first().json;\nlet body;\nif (raw.arguments !== undefined) {\n  body = typeof raw.arguments === 'string' ? JSON.parse(raw.arguments) : raw.arguments;\n} else {\n  body = raw;\n}\n\nconst nombre = String(body.nombre || '').trim();\nconst telefono = String(body.telefono || '').trim();\nconst servicio = String(body.servicio || '').trim();\nconst fecha = String(body.fecha || '').trim();\nconst hora = String(body.hora || '').trim();\nconst notas = String(body.notas || '').trim();\n\nconst DURACIONES = {\n  'Revision': 30, 'Limpieza dental': 45, 'Empaste': 45,\n  'Extraccion': 30, 'Blanqueamiento dental': 60,\n  'Consulta ortodoncia': 30, 'Consulta implantes': 30, 'Endodoncia': 60\n};\nconst duracion = DURACIONES[servicio] || 30;\n\nconst fechaInicio = new Date(`${fecha}T${hora}:00`);\nconst fechaFin = new Date(fechaInicio.getTime() + duracion * 60000);\n\nconst diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];\nconst meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];\nconst diaSemana = diasSemana[fechaInicio.getDay()];\nconst diaMes = fechaInicio.getDate();\nconst mes = meses[fechaInicio.getMonth()];\n\nconst descripcion = `Paciente: ${nombre}\\nTeléfono: ${telefono}\\nServicio: ${servicio}\\nDuración: ${duracion} min${notas ? '\\nNotas: ' + notas : ''}\\nCreado por: Recepcionista IA Sara`;\n\nreturn [{ json: {\n  nombre, telefono, servicio, fecha, hora, notas, duracion,\n  fechaInicio: fechaInicio.toISOString(),\n  fechaFin: fechaFin.toISOString(),\n  tituloEvento: `${nombre} - ${servicio}`,\n  descripcion, diaSemana, diaMes, mes\n}}];"
      },
      "id": "parse-node",
      "name": "Parsear Argumentos",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [220, 300]
    },
    {
      "parameters": {
        "resource": "event",
        "operation": "create",
        "calendarId": "={{ $env.BIODENTAL_CALENDAR_ID }}",
        "start": "={{ $json.fechaInicio }}",
        "end": "={{ $json.fechaFin }}",
        "additionalFields": {
          "summary": "={{ $json.tituloEvento }}",
          "description": "={{ $json.descripcion }}",
          "colorId": "6",
          "timezone": "Europe/Madrid"
        }
      },
      "id": "gcal-create-node",
      "name": "Google Calendar - Crear Evento",
      "type": "n8n-nodes-base.googleCalendar",
      "typeVersion": 1.3,
      "position": [440, 300],
      "credentials": {
        "googleCalendarOAuth2Api": {
          "id": "PLACEHOLDER_CREDENTIALS_ID",
          "name": "Google Calendar OAuth2"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const gcal = $('Google Calendar - Crear Evento').first().json;\nconst datos = $('Parsear Argumentos').first().json;\nreturn [{ json: { ...datos, calendar_event_id: gcal.id || '' }}];"
      },
      "id": "merge-node",
      "name": "Añadir Calendar Event ID",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [660, 300]
    },
    {
      "parameters": {
        "operation": "append",
        "documentId": { "__rl": true, "value": "={{ $env.BIODENTAL_SHEETS_ID }}", "mode": "id" },
        "sheetName": { "__rl": true, "value": "Citas", "mode": "name" },
        "columns": {
          "mappingMode": "defineBelow",
          "value": {
            "ID": "={{ $json.calendar_event_id }}",
            "Nombre": "={{ $json.nombre }}",
            "Teléfono": "={{ $json.telefono }}",
            "Servicio": "={{ $json.servicio }}",
            "Fecha": "={{ $json.fecha }}",
            "Hora": "={{ $json.hora }}",
            "Duración": "={{ $json.duracion }}",
            "Estado": "CONFIRMADA",
            "Notas": "={{ $json.notas }}",
            "Calendar_Event_ID": "={{ $json.calendar_event_id }}",
            "Creada_en": "={{ new Date().toISOString() }}"
          }
        },
        "options": {}
      },
      "id": "sheets-node",
      "name": "Google Sheets - Añadir Cita",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [880, 300],
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "PLACEHOLDER_CREDENTIALS_ID",
          "name": "Google Sheets OAuth2"
        }
      }
    },
    {
      "parameters": {
        "operation": "send",
        "from": "={{ $env.TWILIO_WHATSAPP_FROM }}",
        "to": "={{ $env.TWILIO_WHATSAPP_TO }}",
        "body": "=✅ Cita confirmada - Clínica Biodental\n\nHola {{ $('Añadir Calendar Event ID').first().json.nombre }}, tu cita ha quedado confirmada:\n\n📅 {{ $('Añadir Calendar Event ID').first().json.diaSemana }} {{ $('Añadir Calendar Event ID').first().json.diaMes }} de {{ $('Añadir Calendar Event ID').first().json.mes }} a las {{ $('Añadir Calendar Event ID').first().json.hora }}\n🦷 {{ $('Añadir Calendar Event ID').first().json.servicio }}\n📍 Clínica Biodental, Colmenarejo\n\n¿Necesitas cambiar o cancelar? Llámanos al mismo número.\n\n¡Hasta pronto!"
      },
      "id": "twilio-node",
      "name": "Twilio - Enviar WhatsApp",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [1100, 300],
      "credentials": {
        "twilioApi": {
          "id": "PLACEHOLDER_CREDENTIALS_ID",
          "name": "Twilio account"
        }
      },
      "continueOnFail": true
    },
    {
      "parameters": {
        "jsCode": "const datos = $('Añadir Calendar Event ID').first().json;\nconst gcal = $('Google Calendar - Crear Evento').first().json;\nif (gcal.id) {\n  return [{ json: {\n    confirmado: true,\n    id_cita: gcal.id,\n    mensaje_confirmacion: `Cita confirmada. Te esperamos el ${datos.diaSemana} ${datos.diaMes} de ${datos.mes} a las ${datos.hora} para tu ${datos.servicio.toLowerCase()}. Recibirás la confirmación por WhatsApp.`\n  }}];\n}\nreturn [{ json: {\n  confirmado: false,\n  error: 'calendar_error',\n  mensaje: 'Ha habido un problema al crear la cita. ¿Quieres que lo intentemos de nuevo?'\n}}];"
      },
      "id": "response-node",
      "name": "Construir Respuesta",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1320, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify($json) }}",
        "options": { "responseCode": 200 }
      },
      "id": "respond-node",
      "name": "Responder a Retell",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [1540, 300]
    }
  ],
  "connections": {
    "Retell Tool Call": { "main": [[{ "node": "Parsear Argumentos", "type": "main", "index": 0 }]] },
    "Parsear Argumentos": { "main": [[{ "node": "Google Calendar - Crear Evento", "type": "main", "index": 0 }]] },
    "Google Calendar - Crear Evento": { "main": [[{ "node": "Añadir Calendar Event ID", "type": "main", "index": 0 }]] },
    "Añadir Calendar Event ID": { "main": [[{ "node": "Google Sheets - Añadir Cita", "type": "main", "index": 0 }]] },
    "Google Sheets - Añadir Cita": { "main": [[{ "node": "Twilio - Enviar WhatsApp", "type": "main", "index": 0 }]] },
    "Twilio - Enviar WhatsApp": { "main": [[{ "node": "Construir Respuesta", "type": "main", "index": 0 }]] },
    "Construir Respuesta": { "main": [[{ "node": "Responder a Retell", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" },
  "pinData": {}
}
```

- [ ] **Step 2: Commit**

```bash
git add proyectos/biodental-voz-2026-04/n8n/02-crear-cita.json
git commit -m "feat(biodental): workflow n8n crear-cita (Calendar + Sheets + WhatsApp)"
```

---

## Task 7: Workflow 03 — cancelar-cita

**Files:**
- Create: `proyectos/biodental-voz-2026-04/n8n/03-cancelar-cita.json`

Flujo: `Webhook → Parsear → Sheets getAll → Encontrar Fila → Calendar delete → Sheets update → Construir Respuesta → Responder`

- [ ] **Step 1: Crear el archivo JSON**

```json
{
  "name": "Biodental — Cancelar Cita",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "biodental-cancelar-cita",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-node",
      "name": "Retell Tool Call",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 300]
    },
    {
      "parameters": {
        "jsCode": "const raw = $('Retell Tool Call').first().json.body || $('Retell Tool Call').first().json;\nlet args;\nif (raw.arguments !== undefined) {\n  args = typeof raw.arguments === 'string' ? JSON.parse(raw.arguments) : raw.arguments;\n} else {\n  args = raw;\n}\nreturn [{ json: {\n  telefono: String(args.telefono || '').trim(),\n  fecha: String(args.fecha || '').trim(),\n  hora: String(args.hora || '').trim()\n}}];"
      },
      "id": "parse-node",
      "name": "Parsear Argumentos",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [220, 300]
    },
    {
      "parameters": {
        "operation": "getAll",
        "documentId": { "__rl": true, "value": "={{ $env.BIODENTAL_SHEETS_ID }}", "mode": "id" },
        "sheetName": { "__rl": true, "value": "Citas", "mode": "name" },
        "options": {}
      },
      "id": "sheets-read-node",
      "name": "Google Sheets - Leer Citas",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [440, 300],
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "PLACEHOLDER_CREDENTIALS_ID",
          "name": "Google Sheets OAuth2"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const { telefono, fecha, hora } = $('Parsear Argumentos').first().json;\nconst filas = $('Google Sheets - Leer Citas').all();\n\nconst fila = filas.find(f => {\n  const d = f.json;\n  const telMatch = String(d['Teléfono'] || '').trim() === telefono;\n  const fechaMatch = String(d['Fecha'] || '').trim() === fecha;\n  const activa = d['Estado'] === 'CONFIRMADA';\n  const horaMatch = !hora || String(d['Hora'] || '').trim() === hora;\n  return telMatch && fechaMatch && activa && horaMatch;\n});\n\nif (!fila) {\n  return [{ json: { encontrado: false, calendarEventId: null, telefono, fecha, hora, mensaje: 'No encontré ninguna cita activa para ese teléfono y fecha.' }}];\n}\n\nconst d = new Date(fecha + 'T00:00:00');\nconst diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];\nconst meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];\n\nreturn [{ json: {\n  encontrado: true,\n  calendarEventId: fila.json['Calendar_Event_ID'],\n  nombre: fila.json['Nombre'],\n  servicio: fila.json['Servicio'],\n  telefono, fecha, hora: fila.json['Hora'],\n  fechaTexto: `${diasSemana[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]}`\n}}];"
      },
      "id": "find-node",
      "name": "Encontrar Cita en Sheets",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [660, 300]
    },
    {
      "parameters": {
        "resource": "event",
        "operation": "delete",
        "calendarId": "={{ $env.BIODENTAL_CALENDAR_ID }}",
        "eventId": "={{ $json.calendarEventId }}"
      },
      "id": "gcal-delete-node",
      "name": "Google Calendar - Eliminar Evento",
      "type": "n8n-nodes-base.googleCalendar",
      "typeVersion": 1.3,
      "position": [880, 300],
      "credentials": {
        "googleCalendarOAuth2Api": {
          "id": "PLACEHOLDER_CREDENTIALS_ID",
          "name": "Google Calendar OAuth2"
        }
      },
      "continueOnFail": true
    },
    {
      "parameters": {
        "operation": "update",
        "documentId": { "__rl": true, "value": "={{ $env.BIODENTAL_SHEETS_ID }}", "mode": "id" },
        "sheetName": { "__rl": true, "value": "Citas", "mode": "name" },
        "columns": {
          "mappingMode": "defineBelow",
          "value": { "Estado": "CANCELADA" },
          "matchingColumns": ["Calendar_Event_ID"]
        },
        "options": {}
      },
      "id": "sheets-update-node",
      "name": "Google Sheets - Actualizar Estado",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [1100, 300],
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "PLACEHOLDER_CREDENTIALS_ID",
          "name": "Google Sheets OAuth2"
        }
      },
      "continueOnFail": true
    },
    {
      "parameters": {
        "jsCode": "const datos = $('Encontrar Cita en Sheets').first().json;\nif (!datos.encontrado) {\n  return [{ json: { cancelado: false, mensaje: datos.mensaje }}];\n}\nreturn [{ json: { cancelado: true, mensaje: `Tu cita del ${datos.fechaTexto} ha quedado cancelada. Cuando quieras volver, aquí estaremos.` }}];"
      },
      "id": "response-node",
      "name": "Construir Respuesta",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1320, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify($json) }}",
        "options": { "responseCode": 200 }
      },
      "id": "respond-node",
      "name": "Responder a Retell",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [1540, 300]
    }
  ],
  "connections": {
    "Retell Tool Call": { "main": [[{ "node": "Parsear Argumentos", "type": "main", "index": 0 }]] },
    "Parsear Argumentos": { "main": [[{ "node": "Google Sheets - Leer Citas", "type": "main", "index": 0 }]] },
    "Google Sheets - Leer Citas": { "main": [[{ "node": "Encontrar Cita en Sheets", "type": "main", "index": 0 }]] },
    "Encontrar Cita en Sheets": { "main": [[{ "node": "Google Calendar - Eliminar Evento", "type": "main", "index": 0 }]] },
    "Google Calendar - Eliminar Evento": { "main": [[{ "node": "Google Sheets - Actualizar Estado", "type": "main", "index": 0 }]] },
    "Google Sheets - Actualizar Estado": { "main": [[{ "node": "Construir Respuesta", "type": "main", "index": 0 }]] },
    "Construir Respuesta": { "main": [[{ "node": "Responder a Retell", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" },
  "pinData": {}
}
```

- [ ] **Step 2: Commit**

```bash
git add proyectos/biodental-voz-2026-04/n8n/03-cancelar-cita.json
git commit -m "feat(biodental): workflow n8n cancelar-cita"
```

---

## Task 8: Workflow 04 — modificar-cita

**Files:**
- Create: `proyectos/biodental-voz-2026-04/n8n/04-modificar-cita.json`

Flujo: `Webhook → Parsear → Sheets getAll → Encontrar Fila → Calendar update → Sheets update → Construir Respuesta → Responder`

- [ ] **Step 1: Crear el archivo JSON**

```json
{
  "name": "Biodental — Modificar Cita",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "biodental-modificar-cita",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-node",
      "name": "Retell Tool Call",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 300]
    },
    {
      "parameters": {
        "jsCode": "const raw = $('Retell Tool Call').first().json.body || $('Retell Tool Call').first().json;\nlet args;\nif (raw.arguments !== undefined) {\n  args = typeof raw.arguments === 'string' ? JSON.parse(raw.arguments) : raw.arguments;\n} else {\n  args = raw;\n}\nreturn [{ json: {\n  telefono: String(args.telefono || '').trim(),\n  fecha_actual: String(args.fecha_actual || '').trim(),\n  hora_actual: String(args.hora_actual || '').trim(),\n  nueva_fecha: String(args.nueva_fecha || '').trim(),\n  nueva_hora: String(args.nueva_hora || '').trim()\n}}];"
      },
      "id": "parse-node",
      "name": "Parsear Argumentos",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [220, 300]
    },
    {
      "parameters": {
        "operation": "getAll",
        "documentId": { "__rl": true, "value": "={{ $env.BIODENTAL_SHEETS_ID }}", "mode": "id" },
        "sheetName": { "__rl": true, "value": "Citas", "mode": "name" },
        "options": {}
      },
      "id": "sheets-read-node",
      "name": "Google Sheets - Leer Citas",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [440, 300],
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "PLACEHOLDER_CREDENTIALS_ID",
          "name": "Google Sheets OAuth2"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const { telefono, fecha_actual, hora_actual, nueva_fecha, nueva_hora } = $('Parsear Argumentos').first().json;\nconst filas = $('Google Sheets - Leer Citas').all();\n\nconst fila = filas.find(f => {\n  const d = f.json;\n  const telMatch = String(d['Teléfono'] || '').trim() === telefono;\n  const fechaMatch = String(d['Fecha'] || '').trim() === fecha_actual;\n  const activa = d['Estado'] === 'CONFIRMADA';\n  const horaMatch = !hora_actual || String(d['Hora'] || '').trim() === hora_actual;\n  return telMatch && fechaMatch && activa && horaMatch;\n});\n\nif (!fila) {\n  return [{ json: { encontrado: false, calendarEventId: null, nueva_fecha, nueva_hora }}];\n}\n\nconst servicio = fila.json['Servicio'];\nconst DURACIONES = {\n  'Revision': 30, 'Limpieza dental': 45, 'Empaste': 45,\n  'Extraccion': 30, 'Blanqueamiento dental': 60,\n  'Consulta ortodoncia': 30, 'Consulta implantes': 30, 'Endodoncia': 60\n};\nconst duracion = DURACIONES[servicio] || 30;\n\nconst nuevaFechaInicio = new Date(`${nueva_fecha}T${nueva_hora}:00`);\nconst nuevaFechaFin = new Date(nuevaFechaInicio.getTime() + duracion * 60000);\n\nconst diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];\nconst meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];\n\nreturn [{ json: {\n  encontrado: true,\n  calendarEventId: fila.json['Calendar_Event_ID'],\n  nombre: fila.json['Nombre'],\n  servicio, telefono, fecha_actual, nueva_fecha, nueva_hora,\n  nuevaFechaInicio: nuevaFechaInicio.toISOString(),\n  nuevaFechaFin: nuevaFechaFin.toISOString(),\n  fechaTexto: `${diasSemana[nuevaFechaInicio.getDay()]} ${nuevaFechaInicio.getDate()} de ${meses[nuevaFechaInicio.getMonth()]}`\n}}];"
      },
      "id": "find-node",
      "name": "Encontrar Cita en Sheets",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [660, 300]
    },
    {
      "parameters": {
        "resource": "event",
        "operation": "update",
        "calendarId": "={{ $env.BIODENTAL_CALENDAR_ID }}",
        "eventId": "={{ $json.calendarEventId }}",
        "updateFields": {
          "start": "={{ $json.nuevaFechaInicio }}",
          "end": "={{ $json.nuevaFechaFin }}"
        }
      },
      "id": "gcal-update-node",
      "name": "Google Calendar - Actualizar Evento",
      "type": "n8n-nodes-base.googleCalendar",
      "typeVersion": 1.3,
      "position": [880, 300],
      "credentials": {
        "googleCalendarOAuth2Api": {
          "id": "PLACEHOLDER_CREDENTIALS_ID",
          "name": "Google Calendar OAuth2"
        }
      },
      "continueOnFail": true
    },
    {
      "parameters": {
        "operation": "update",
        "documentId": { "__rl": true, "value": "={{ $env.BIODENTAL_SHEETS_ID }}", "mode": "id" },
        "sheetName": { "__rl": true, "value": "Citas", "mode": "name" },
        "columns": {
          "mappingMode": "defineBelow",
          "value": {
            "Fecha": "={{ $('Encontrar Cita en Sheets').first().json.nueva_fecha }}",
            "Hora": "={{ $('Encontrar Cita en Sheets').first().json.nueva_hora }}",
            "Estado": "MODIFICADA"
          },
          "matchingColumns": ["Calendar_Event_ID"]
        },
        "options": {}
      },
      "id": "sheets-update-node",
      "name": "Google Sheets - Actualizar Cita",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [1100, 300],
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "PLACEHOLDER_CREDENTIALS_ID",
          "name": "Google Sheets OAuth2"
        }
      },
      "continueOnFail": true
    },
    {
      "parameters": {
        "jsCode": "const datos = $('Encontrar Cita en Sheets').first().json;\nif (!datos.encontrado) {\n  return [{ json: { modificado: false, mensaje: 'No encontré ninguna cita activa para ese teléfono y fecha.' }}];\n}\nreturn [{ json: { modificado: true, mensaje: `Listo, tu cita ha quedado cambiada al ${datos.fechaTexto} a las ${datos.nueva_hora}.` }}];"
      },
      "id": "response-node",
      "name": "Construir Respuesta",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1320, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify($json) }}",
        "options": { "responseCode": 200 }
      },
      "id": "respond-node",
      "name": "Responder a Retell",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [1540, 300]
    }
  ],
  "connections": {
    "Retell Tool Call": { "main": [[{ "node": "Parsear Argumentos", "type": "main", "index": 0 }]] },
    "Parsear Argumentos": { "main": [[{ "node": "Google Sheets - Leer Citas", "type": "main", "index": 0 }]] },
    "Google Sheets - Leer Citas": { "main": [[{ "node": "Encontrar Cita en Sheets", "type": "main", "index": 0 }]] },
    "Encontrar Cita en Sheets": { "main": [[{ "node": "Google Calendar - Actualizar Evento", "type": "main", "index": 0 }]] },
    "Google Calendar - Actualizar Evento": { "main": [[{ "node": "Google Sheets - Actualizar Cita", "type": "main", "index": 0 }]] },
    "Google Sheets - Actualizar Cita": { "main": [[{ "node": "Construir Respuesta", "type": "main", "index": 0 }]] },
    "Construir Respuesta": { "main": [[{ "node": "Responder a Retell", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" },
  "pinData": {}
}
```

- [ ] **Step 2: Commit**

```bash
git add proyectos/biodental-voz-2026-04/n8n/04-modificar-cita.json
git commit -m "feat(biodental): workflow n8n modificar-cita"
```

---

## Task 9: Workflow 05 — post-llamada

**Files:**
- Create: `proyectos/biodental-voz-2026-04/n8n/05-post-llamada.json`

Flujo: `Webhook (Retell call_ended) → Parsear → Google Sheets append Llamadas → Responder 200`

- [ ] **Step 1: Crear el archivo JSON**

```json
{
  "name": "Biodental — Post Llamada",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "biodental-post-llamada",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "webhook-node",
      "name": "Retell Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 300]
    },
    {
      "parameters": {
        "jsCode": "const raw = $('Retell Webhook').first().json.body || $('Retell Webhook').first().json;\nconst event = raw.event || '';\nif (event !== 'call_ended' && event !== 'call_analyzed') {\n  return [{ json: { skip: true } }];\n}\nconst analysis = raw.call_analysis || {};\nconst now = new Date().toISOString().replace('T',' ').substring(0,19);\nreturn [{ json: {\n  skip: false,\n  ID: raw.call_id || '',\n  Fecha_llamada: now,\n  Duración_seg: raw.duration_seconds || 0,\n  Resumen: analysis.call_summary || '',\n  Sentimiento: analysis.user_sentiment || 'Neutral',\n  Exitosa: analysis.call_successful ? 'TRUE' : 'FALSE',\n  Call_ID: raw.call_id || ''\n}}];"
      },
      "id": "parse-node",
      "name": "Parsear Evento Retell",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [220, 300]
    },
    {
      "parameters": {
        "operation": "append",
        "documentId": { "__rl": true, "value": "={{ $env.BIODENTAL_SHEETS_ID }}", "mode": "id" },
        "sheetName": { "__rl": true, "value": "Llamadas", "mode": "name" },
        "columns": {
          "mappingMode": "defineBelow",
          "value": {
            "ID": "={{ $json.ID }}",
            "Fecha_llamada": "={{ $json.Fecha_llamada }}",
            "Duración_seg": "={{ $json.Duración_seg }}",
            "Resumen": "={{ $json.Resumen }}",
            "Sentimiento": "={{ $json.Sentimiento }}",
            "Exitosa": "={{ $json.Exitosa }}",
            "Call_ID": "={{ $json.Call_ID }}"
          }
        },
        "options": {}
      },
      "id": "sheets-node",
      "name": "Google Sheets - Guardar Llamada",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [440, 300],
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "PLACEHOLDER_CREDENTIALS_ID",
          "name": "Google Sheets OAuth2"
        }
      },
      "continueOnFail": true
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "{\"ok\": true}",
        "options": { "responseCode": 200 }
      },
      "id": "respond-node",
      "name": "Responder OK",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [660, 300]
    }
  ],
  "connections": {
    "Retell Webhook": { "main": [[{ "node": "Parsear Evento Retell", "type": "main", "index": 0 }]] },
    "Parsear Evento Retell": { "main": [[{ "node": "Google Sheets - Guardar Llamada", "type": "main", "index": 0 }]] },
    "Google Sheets - Guardar Llamada": { "main": [[{ "node": "Responder OK", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" },
  "pinData": {}
}
```

- [ ] **Step 2: Commit**

```bash
git add proyectos/biodental-voz-2026-04/n8n/05-post-llamada.json
git commit -m "feat(biodental): workflow n8n post-llamada"
```

---

## Task 10: README-N8N.md

**Files:**
- Create: `proyectos/biodental-voz-2026-04/n8n/README-N8N.md`

- [ ] **Step 1: Crear README-N8N.md**

Contenido:

```markdown
# Configuración n8n — Biodental Demo

## Prerrequisitos en n8n
- Credencial Google Calendar OAuth2 configurada
- Credencial Google Sheets OAuth2 configurada
- Credencial Twilio configurada
- Variables de entorno: BIODENTAL_CALENDAR_ID, BIODENTAL_SHEETS_ID, TWILIO_WHATSAPP_FROM, TWILIO_WHATSAPP_TO, CLINICA_PHONE_TRANSFER

## Importar los workflows (en orden)

1. Settings → Import from File → seleccionar 01-verificar-disponibilidad.json
2. Importar 02-crear-cita.json
3. Importar 03-cancelar-cita.json
4. Importar 04-modificar-cita.json
5. Importar 05-post-llamada.json

## Después de importar cada workflow

1. Abrir el workflow
2. En cada nodo Google Calendar/Sheets/Twilio: reemplazar PLACEHOLDER_CREDENTIALS_ID por el ID real
3. Activar el workflow (toggle superior derecho)
4. Copiar la URL del webhook → nodo "Retell Tool Call" → Production URL
5. Pegar la URL en .env en la variable correspondiente

## Tabla de URLs

| Variable .env                    | Workflow | Path                              |
|----------------------------------|----------|-----------------------------------|
| N8N_VERIFICAR_DISPONIBILIDAD_URL | 01       | biodental-verificar-disponibilidad|
| N8N_CREAR_CITA_URL               | 02       | biodental-crear-cita              |
| N8N_CANCELAR_CITA_URL            | 03       | biodental-cancelar-cita           |
| N8N_MODIFICAR_CITA_URL           | 04       | biodental-modificar-cita          |
| N8N_POST_LLAMADA_URL             | 05       | biodental-post-llamada            |

## Variables de entorno en n8n

Settings → Environment Variables:
- BIODENTAL_CALENDAR_ID = primary (o ID del calendario específico)
- BIODENTAL_SHEETS_ID = ID del Spreadsheet (de la URL de Google Sheets)
- TWILIO_WHATSAPP_FROM = whatsapp:+14155238886
- TWILIO_WHATSAPP_TO = whatsapp:+34TUNUMERO
- CLINICA_PHONE_TRANSFER = número para transferencia

## Test rápido WF01

curl -X POST {N8N_VERIFICAR_DISPONIBILIDAD_URL} \
  -H "Content-Type: application/json" \
  -d '{"arguments": "{\"servicio\": \"Limpieza dental\", \"fecha\": \"2026-05-10\", \"hora\": \"10:30\"}"}'

Respuesta esperada: {"disponible": true, "fecha": "2026-05-10", "hora": "10:30", ...}
```

- [ ] **Step 2: Commit**

```bash
git add proyectos/biodental-voz-2026-04/n8n/README-N8N.md
git commit -m "feat(biodental): README-N8N con instrucciones de setup"
```

---

## Task 11: Importar workflows en n8n (via MCP)

**Prerequisito manual (hacer antes):**
1. Crear Google Sheets "Biodental — Citas Demo HAT3X" con pestañas Citas y Llamadas y cabeceras (ver docs/google-sheets-structure.md)
2. Copiar Spreadsheet ID en .env como BIODENTAL_SHEETS_ID
3. Confirmar que las credenciales Google Calendar, Google Sheets y Twilio existen en n8n y anotar sus IDs reales

- [ ] **Step 1: Importar WF01 y activar**

Usar MCP n8n para importar el JSON de n8n/01-verificar-disponibilidad.json.
Reemplazar PLACEHOLDER_CREDENTIALS_ID en el nodo Google Calendar por el ID real.
Activar. Copiar URL de producción del webhook → .env N8N_VERIFICAR_DISPONIBILIDAD_URL.

- [ ] **Step 2: Importar WF02 y activar**

Importar n8n/02-crear-cita.json.
Reemplazar PLACEHOLDER_CREDENTIALS_ID en nodos Google Calendar, Google Sheets y Twilio.
Activar. Copiar URL → .env N8N_CREAR_CITA_URL.

- [ ] **Step 3: Importar WF03 y activar**

Importar n8n/03-cancelar-cita.json.
Reemplazar PLACEHOLDER_CREDENTIALS_ID en nodos Google Calendar y Google Sheets.
Activar. Copiar URL → .env N8N_CANCELAR_CITA_URL.

- [ ] **Step 4: Importar WF04 y activar**

Importar n8n/04-modificar-cita.json.
Reemplazar PLACEHOLDER_CREDENTIALS_ID en nodos Google Calendar y Google Sheets.
Activar. Copiar URL → .env N8N_MODIFICAR_CITA_URL.

- [ ] **Step 5: Importar WF05 y activar**

Importar n8n/05-post-llamada.json.
Reemplazar PLACEHOLDER_CREDENTIALS_ID en nodo Google Sheets.
Activar. Copiar URL → .env N8N_POST_LLAMADA_URL.

- [ ] **Step 6: Test WF01 con curl**

```bash
curl -X POST {N8N_VERIFICAR_DISPONIBILIDAD_URL} \
  -H "Content-Type: application/json" \
  -d "{\"arguments\": \"{\\\"servicio\\\": \\\"Limpieza dental\\\", \\\"fecha\\\": \\\"2026-05-10\\\", \\\"hora\\\": \\\"10:30\\\"}\"}"
```

Resultado esperado: `{"disponible": true, ...}`

- [ ] **Step 7: Test WF02 con curl**

```bash
curl -X POST {N8N_CREAR_CITA_URL} \
  -H "Content-Type: application/json" \
  -d "{\"arguments\": \"{\\\"nombre\\\": \\\"Test Demo\\\", \\\"telefono\\\": \\\"600000001\\\", \\\"servicio\\\": \\\"Limpieza dental\\\", \\\"fecha\\\": \\\"2026-05-10\\\", \\\"hora\\\": \\\"10:30\\\", \\\"notas\\\": \\\"\\\"}\"}"
```

Resultado esperado: `{"confirmado": true, ...}` + evento en Google Calendar + fila en Sheets con estado CONFIRMADA + WhatsApp al número sandbox.

---

## Task 12: Crear LLM y agente en Retell AI

**Prerequisito:** Tener las 5 URLs de webhook n8n del Task 11.

- [ ] **Step 1: Crear el LLM**

Abrir docs/retell-config.md Paso 1.
Sustituir las {{N8N_*_URL}} por las URLs reales del .env.
Sustituir general_prompt por el texto completo de prompts/system-prompt.md (sin el bloque de código, solo el texto).
Ejecutar POST a https://api.retellai.com/v2/create-retell-llm con Authorization: Bearer {RETELL_API_KEY}.
Guardar llm_id de la respuesta en .env como RETELL_LLM_ID.

- [ ] **Step 2: Obtener ElevenLabs Voice ID**

Entrar en ElevenLabs → Voice Library → buscar voz femenina española (recomendada: "Valentina" o "Laura").
Copiar el Voice ID → .env como ELEVENLABS_VOICE_ID.

- [ ] **Step 3: Crear el Agente**

Abrir docs/retell-config.md Paso 2.
Sustituir {{RETELL_LLM_ID}}, {{ELEVENLABS_VOICE_ID}}, {{N8N_POST_LLAMADA_URL}}, {{CLINICA_PHONE_TRANSFER}}.
Ejecutar POST a https://api.retellai.com/v2/create-agent.
Guardar agent_id → .env como RETELL_AGENT_ID.

- [ ] **Step 4: Asignar número de teléfono**

Abrir docs/retell-config.md Paso 3.
Sustituir {{RETELL_AGENT_ID}}.
Ejecutar POST. Guardar número asignado → .env como RETELL_PHONE_NUMBER.

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "feat(biodental): agente Retell AI configurado y activo"
```

---

## Task 13: Test completo del flujo demo

- [ ] **Step 1: Test — Reservar cita**

Llamar al RETELL_PHONE_NUMBER.
Verificar:
- Sara responde: "Clínica Biodental, buenos días. Soy Sara, ¿en qué le puedo ayudar?"
- Pedir limpieza dental para próxima semana a las 11:00
- Sara dice "Un momento, consulto el calendario" → llama verificar_disponibilidad
- Si disponible, Sara recoge nombre y teléfono → llama crear_cita → lee confirmación
- Google Calendar: evento creado con duración 45 min y descripción con datos del paciente
- Google Sheets pestaña Citas: fila nueva con Estado = CONFIRMADA
- WhatsApp sandbox: mensaje de confirmación recibido en tu número

- [ ] **Step 2: Test — Cancelar cita**

Llamar de nuevo. Pedir cancelar la cita de la semana que viene.
Verificar:
- Sara pide teléfono y fecha → llama cancelar_cita → confirma en voz alta
- Google Calendar: evento eliminado
- Google Sheets pestaña Citas: Estado actualizado a CANCELADA

- [ ] **Step 3: Test — Modificar cita**

Crear nueva cita. Llamar y pedir cambiarla a otro día.
Verificar:
- Sara llama verificar_disponibilidad en el nuevo slot antes de confirmar
- Llama modificar_cita → confirma el cambio en voz alta
- Google Calendar: evento movido a la nueva fecha/hora
- Google Sheets: Estado = MODIFICADA, Fecha y Hora actualizadas

- [ ] **Step 4: Test — Transferencia**

Llamar y preguntar "¿Cuánto cuesta la ortodoncia?"
Verificar:
- Sara dice "Voy a pasarte con la clínica ahora mismo, un momento por favor"
- La llamada se transfiere al CLINICA_PHONE_TRANSFER

- [ ] **Step 5: Test — Post llamada**

Tras las llamadas anteriores, verificar Google Sheets pestaña Llamadas: filas con Call_ID, Resumen y Sentimiento rellenados.

- [ ] **Step 6: Commit final**

```bash
git add .
git commit -m "feat(biodental): demo completamente funcional y testada"
```
