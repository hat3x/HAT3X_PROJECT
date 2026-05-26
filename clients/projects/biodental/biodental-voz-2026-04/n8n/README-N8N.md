# Configuración n8n — Biodental Demo

## Prerrequisitos en n8n
- Credencial Google Calendar OAuth2 configurada
- Credencial Google Sheets OAuth2 configurada
- Credencial Twilio configurada
- Variables de entorno configuradas (ver tabla abajo)

## Importar los workflows (en orden)

1. Settings → Import from File → seleccionar `01-verificar-disponibilidad.json`
2. Importar `02-crear-cita.json`
3. Importar `03-cancelar-cita.json`
4. Importar `04-modificar-cita.json`
5. Importar `05-post-llamada.json`

## Después de importar cada workflow

1. Abrir el workflow
2. En cada nodo Google Calendar / Google Sheets / Twilio: reemplazar `PLACEHOLDER_CREDENTIALS_ID` por el ID real de la credencial
3. Activar el workflow (toggle superior derecho)
4. Copiar la URL del webhook → nodo "Retell Tool Call" → **Production URL**
5. Pegar la URL en `.env` en la variable correspondiente

## Tabla de URLs

| Variable .env                     | Workflow | Path webhook                       |
|-----------------------------------|----------|------------------------------------|
| N8N_VERIFICAR_DISPONIBILIDAD_URL  | 01       | biodental-verificar-disponibilidad |
| N8N_CREAR_CITA_URL                | 02       | biodental-crear-cita               |
| N8N_CANCELAR_CITA_URL             | 03       | biodental-cancelar-cita            |
| N8N_MODIFICAR_CITA_URL            | 04       | biodental-modificar-cita           |
| N8N_POST_LLAMADA_URL              | 05       | biodental-post-llamada             |

## Variables de entorno en n8n

Settings → Environment Variables:

| Variable               | Valor                          |
|------------------------|--------------------------------|
| BIODENTAL_CALENDAR_ID  | primary (o ID del calendario)  |
| BIODENTAL_SHEETS_ID    | ID del Spreadsheet (de la URL) |
| TWILIO_WHATSAPP_FROM   | whatsapp:+14155238886          |
| TWILIO_WHATSAPP_TO     | whatsapp:+34TUNUMERO           |
| CLINICA_PHONE_TRANSFER | número para transferencia      |

## Test rápido WF01

```bash
curl -X POST {N8N_VERIFICAR_DISPONIBILIDAD_URL} \
  -H "Content-Type: application/json" \
  -d '{"arguments": "{\"servicio\": \"Limpieza dental\", \"fecha\": \"2026-05-10\", \"hora\": \"10:30\"}"}'
```

Respuesta esperada: `{"disponible": true, "fecha": "2026-05-10", "hora": "10:30", ...}`

## Test rápido WF02

```bash
curl -X POST {N8N_CREAR_CITA_URL} \
  -H "Content-Type: application/json" \
  -d '{"arguments": "{\"nombre\": \"Test Demo\", \"telefono\": \"600000001\", \"servicio\": \"Limpieza dental\", \"fecha\": \"2026-05-10\", \"hora\": \"10:30\", \"notas\": \"\"}"}'
```

Resultado esperado: `{"confirmado": true, ...}` + evento en Google Calendar + fila en Sheets + WhatsApp al sandbox.
