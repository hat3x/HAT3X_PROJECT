# README n8n — Club BioSpa Llamadas Perdidas

**Workflow:** `workflow-principal.json`  
**Versión:** 1.0 | **Fecha:** 2026-04-09  
**Nodos:** 10 | **Integraciones:** Retell AI · Twilio · Telegram · SMTP

---

## Importar el Workflow

1. Abre tu instancia de n8n
2. Ve a **Workflows** → **Add Workflow** → **Import from File**
3. Selecciona `workflow-principal.json`
4. El workflow se importa en estado **Inactive** — no lo actives hasta configurar las credenciales

---

## Credenciales a Configurar

### 1. SMTP (Email al encargado y emails de error)

En n8n: **Settings** → **Credentials** → **Add** → **SMTP**

| Campo | Valor |
|-------|-------|
| Name | `ClubBioSpa SMTP` |
| Host | `smtp.gmail.com` (o servidor del cliente) |
| Port | `587` |
| User | Email remitente |
| Password | Contraseña de aplicación (no la normal) |
| SSL | STARTTLS |

Vincula esta credencial a los nodos:
- `Email — Notificar Encargado` (ID: n6)
- `Email — Error Crítico` (ID: n10)

**IMPORTANTE:** Si usas Gmail, activa "Contraseñas de aplicación" en la cuenta Google (requiere 2FA activo).

---

### 2. Twilio (WhatsApp al cliente)

En n8n: **Settings** → **Credentials** → **Add** → **Twilio API**

| Campo | Valor |
|-------|-------|
| Name | `Twilio ClubBioSpa` |
| Account SID | `TWILIO_ACCOUNT_SID` del .env |
| Auth Token | `TWILIO_AUTH_TOKEN` del .env |

Vincula esta credencial al nodo `Twilio — WhatsApp al Cliente` (ID: n7).

**Número de origen:** Configura `TWILIO_WHATSAPP_FROM` con el número de Twilio con WhatsApp habilitado.

**Modos disponibles:**
- **Sandbox (desarrollo):** Usa `+14155238886`. Los clientes deben mandar "join [palabra]" al número Twilio primero.
- **Producción:** Número de negocio aprobado por Meta via Twilio. Tiempo de aprobación: 1-3 días hábiles.

---

### 3. Telegram Bot (alerta inmediata al encargado)

#### Crear el bot:
1. Abre Telegram → busca `@BotFather`
2. Envía `/newbot` → pon un nombre → obtén el **Bot Token**
3. Guarda el token como `TELEGRAM_BOT_TOKEN`

#### Obtener el Chat ID:
1. Añade el bot al chat/grupo del equipo Club BioSpa
2. Envía cualquier mensaje al bot
3. Ve a: `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Copia el `chat.id` del último mensaje
5. Guarda como `TELEGRAM_CHAT_ID`

En n8n: **Settings** → **Credentials** → **Add** → **Telegram API**

| Campo | Valor |
|-------|-------|
| Name | `Telegram ClubBioSpa Bot` |
| Access Token | `TELEGRAM_BOT_TOKEN` del .env |

Vincula al nodo `Telegram — Alerta Encargado` (ID: n8).

---

## Configurar Variables de Entorno en n8n

Las variables dinámicas se leen del nodo mismo o de las credenciales. Para los campos como `EMAIL_FROM`, `EMAIL_ENCARGADO` y `TELEGRAM_CHAT_ID`:

**Opción A — Variables de entorno de n8n (recomendado en self-hosted):**
Añade en tu `docker-compose.yml` o `.env` de n8n:
```
N8N_CUSTOM_ENVIRONMENT_VARIABLES=EMAIL_FROM,EMAIL_ENCARGADO,TELEGRAM_CHAT_ID,TWILIO_WHATSAPP_FROM
```

**Opción B — Hardcode temporal en los nodos:**
Abre cada nodo y reemplaza `{{ $env.VARIABLE }}` con el valor directo durante las pruebas. Antes de producción, migrar a variables de entorno.

---

## URL del Webhook

Una vez activo el workflow, la URL de Retell AI a configurar es:

```
POST https://<tu-instancia>.n8n.cloud/webhook/clubbiospa-llamada-perdida
```

Para desarrollo/testing con n8n local + ngrok:
```
POST https://<tu-ngrok-id>.ngrok.io/webhook/clubbiospa-llamada-perdida
```

---

## Estructura del Payload Esperado

El nodo Webhook espera recibir este JSON de Retell AI:

```json
{
  "nombre_cliente": "string — nombre completo del cliente",
  "telefono": "string — formato E.164, ej: +34612345678",
  "motivo_consulta": "string — resumen de la consulta del cliente",
  "duracion_llamada": "number — segundos de duración de la llamada IA",
  "timestamp": "string — ISO 8601, ej: 2026-04-09T18:32:00.000Z",
  "fuera_de_horario": "boolean — true si la IA atendió, false si fue en horario"
}
```

Todos los campos tienen valores por defecto en caso de ausencia (nodo Set n2).

---

## Probar el Workflow

### Test manual (sin Retell AI):

1. Activa el workflow en n8n
2. Copia la URL del webhook
3. Ejecuta este curl:

```bash
curl -X POST https://<tu-instancia>/webhook/clubbiospa-llamada-perdida \
  -H "Content-Type: application/json" \
  -d '{
    "nombre_cliente": "Ana Martínez",
    "telefono": "+34612345678",
    "motivo_consulta": "Quiero información sobre el paquete spa completo",
    "duracion_llamada": 87,
    "timestamp": "2026-04-09T19:00:00.000Z",
    "fuera_de_horario": true
  }'
```

4. Verifica:
   - [ ] Respuesta 200 `{"status":"ok"}`
   - [ ] Telegram recibido por el encargado
   - [ ] Email recibido en `EMAIL_ENCARGADO`
   - [ ] WhatsApp enviado al número `+34612345678`

### Test rama de error:

Simula un fallo desconectando la credencial SMTP y ejecuta el test. Debe llegar el email de error (si el SMTP estaba configurado antes) o verse el error en los logs de n8n.

---

## Monitoreo

- **Logs de ejecución:** n8n → Workflow → Executions
- **Alertas de fallo:** Email automático al `EMAIL_ENCARGADO` en cualquier error
- **Frecuencia esperada:** Una ejecución por llamada perdida

---

## Notas de Integración con PM Voz

El PM Voz (Retell AI) debe configurar:

1. En el agente de Retell: webhook `call_ended` apuntando a esta URL
2. El campo `fuera_de_horario` debe setearse en las variables de la llamada de Retell antes de disparar el webhook
3. Si Retell no soporta el campo `fuera_de_horario` nativo, el PM Voz usará un campo custom en el `call_metadata`

Coordinación pendiente con PM Voz: confirmar nombre exacto de los campos en el payload de Retell AI `call_ended`.
