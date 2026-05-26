# MANTENIMIENTO — Club BioSpa Llamadas Perdidas

**Última revisión:** 2026-04-09  
**Responsable técnico:** HAT3X — PM Automatizaciones

---

## Monitoreo Diario

Revisar semanalmente en n8n → Workflows → ClubBioSpa — Llamadas Perdidas → Executions:

- [ ] Ejecuciones fallidas (estado rojo)
- [ ] Tiempo medio de ejecución (normal: < 5 segundos)
- [ ] Número de ejecuciones vs. llamadas esperadas

---

## Problemas Frecuentes y Soluciones

### El webhook no recibe datos de Retell AI

**Síntomas:** No hay ejecuciones nuevas en n8n aunque hubo llamadas perdidas.

**Causas y soluciones:**
1. El workflow está **Inactive** en n8n → Activarlo (toggle en verde)
2. La URL del webhook cambió → Verificar URL en n8n y actualizar en Retell AI
3. Retell AI no está configurado para disparar el webhook → Revisar con PM Voz
4. Problema de red/firewall entre Retell y n8n → Comprobar logs de Retell

**Diagnóstico rápido:**
```bash
curl -X POST https://<instancia>/webhook/clubbiospa-llamada-perdida \
  -H "Content-Type: application/json" \
  -d '{"nombre_cliente":"Test","telefono":"+34000000000","fuera_de_horario":true}'
```
Si responde 200 → n8n funciona, problema en Retell. Si no responde → problema en n8n.

---

### El WhatsApp no llega al cliente

**Síntomas:** El workflow ejecuta correctamente pero el cliente no recibe WhatsApp.

**Causas y soluciones:**

| Causa | Solución |
|-------|----------|
| Número de teléfono sin formato E.164 | Asegurarse de que Retell envía `+34XXXXXXXXX`, no `6XXXXXXXX` |
| Créditos Twilio agotados | Revisar saldo en [console.twilio.com](https://console.twilio.com) y recargar |
| Número Twilio Sandbox: cliente no se unió | En sandbox, el cliente debe enviar "join [palabra]" al número Twilio primero. En producción esto no aplica |
| Número de cliente no tiene WhatsApp | Normal — Twilio devolverá error. El flujo captura el error y notifica al encargado |
| Número de destino bloqueado por WhatsApp | Contactar soporte de Twilio |

---

### Los emails no llegan al encargado

**Síntomas:** Workflow ejecuta sin errores pero no llega el email.

**Causas:**
1. Email en carpeta de spam → Revisar spam y marcar como "no es spam"
2. Credencial SMTP expirada o contraseña cambiada → Actualizar en n8n Credentials
3. Gmail bloqueó el acceso a app de terceros → Regenerar contraseña de aplicación
4. `EMAIL_ENCARGADO` mal configurado → Verificar valor en el nodo de email

---

### Telegram no notifica

**Síntomas:** No llegan mensajes al Telegram del encargado.

**Causas:**
1. El bot fue eliminado del chat → Volver a añadirlo y obtener nuevo Chat ID
2. Token del bot expirado → Revocar y regenerar en @BotFather
3. Chat ID incorrecto → Repetir proceso de obtención del Chat ID (ver README-N8N.md)

---

### Ejecuciones fallidas con error genérico

**Acción:** Ir a n8n → Executions → abrir la ejecución fallida → identificar el nodo rojo → leer el mensaje de error.

Errores comunes:

| Error | Causa | Solución |
|-------|-------|----------|
| `401 Unauthorized` en Twilio | Auth Token incorrecto o expirado | Actualizar credencial Twilio en n8n |
| `Connection timeout` en SMTP | Servidor de correo inaccesible | Verificar configuración SMTP y acceso de red |
| `Chat not found` en Telegram | Chat ID incorrecto | Actualizar TELEGRAM_CHAT_ID |
| `Could not parse JSON` | Retell envía payload malformado | Coordinar con PM Voz para corregir formato |

---

## Actualizar Credenciales

Si se cambia alguna contraseña o token:

1. n8n → Settings → Credentials
2. Localizar la credencial (SMTP, Twilio, Telegram)
3. Editar → actualizar campos → Save & Test
4. Verificar ejecutando el curl de prueba

---

## Cambiar el Número de WhatsApp de Twilio

Si se migra del sandbox al número de producción:

1. Aprobar el número en Twilio Console → WhatsApp Senders
2. Actualizar `TWILIO_WHATSAPP_FROM` en el nodo Twilio de n8n
3. Actualizar `.env` (archivo de referencia)
4. Ejecutar prueba de verificación

---

## Cambiar Email o Telegram del Encargado

1. En n8n, editar el nodo `Email — Notificar Encargado`
2. Actualizar el campo `To Email` con el nuevo correo
3. Para Telegram: actualizar `TELEGRAM_CHAT_ID` en el nodo Telegram
4. Actualizar `.env` como referencia

---

## Backup del Workflow

Exportar el workflow actualizado cada vez que se hagan cambios:

```
n8n → Workflow → ⋮ (menú) → Download
```

Guardar como `n8n/workflow-principal-vX.json` en esta carpeta y actualizar el archivo sin versión.

---

## Escalado

Si el volumen de llamadas supera 100/día:

- Revisar rate limits de Twilio WhatsApp (85 mensajes/segundo en producción)
- Considerar queue en n8n si hay picos simultáneos
- Evaluar plan n8n según número de ejecuciones mensuales incluidas

---

## Contacto de Soporte HAT3X

Ante cualquier incidencia no resuelta con este documento:

- Abrir ticket con: captura del error + payload recibido + descripción del problema
- Adjuntar export del workflow actual (`n8n/workflow-principal.json`)
- Prioridad según impacto: alta si los clientes no reciben WhatsApp, media si solo falla el email interno
