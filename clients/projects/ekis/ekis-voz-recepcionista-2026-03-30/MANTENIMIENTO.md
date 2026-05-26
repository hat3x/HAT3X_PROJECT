# Mantenimiento — Recepcionista Ekis

> Qué hacer cuando algo falla. Leer esto ANTES de tocar ninguna configuración.

---

## El agente no responde / llamada en silencio

**Síntomas:** El teléfono conecta pero el agente no habla o hay silencio.

**Causa más probable:** El LLM de Retell no está respondiendo a tiempo.

**Pasos:**
1. Ir a Retell AI dashboard → Calls → ver el log de la llamada fallida
2. Revisar si hay errores en el LLM (timeout, error de autenticación)
3. Verificar que `RETELL_API_KEY` siga siendo válida (caducan si se regeneran)
4. Probar una llamada desde el botón "Test Call" del dashboard
5. Si el problema persiste, contactar soporte Retell: support@retellai.com

---

## El agente habla pero no entiende al usuario

**Síntomas:** El agente da respuestas genéricas, fuera de contexto o en inglés.

**Causa más probable:** El system prompt se ha corrompido o el modelo ha cambiado.

**Pasos:**
1. Retell dashboard → LLMs → abrir el LLM del agente
2. Verificar que el system prompt esté completo y en español
3. Verificar que el modelo sea `claude-haiku-20241022`
4. Si el prompt parece correcto, probar con una llamada de prueba del dashboard
5. Si no mejora, copiar desde `prompts/system-prompt.md` y repegar en Retell

---

## La voz suena robótica o con artefactos

**Síntomas:** La voz de Carmen suena metálica, cortada o poco natural.

**Causa más probable:** Problema de latencia o parámetros de ElevenLabs.

**Pasos:**
1. Verificar que el modelo sea `eleven_turbo_v2_5` (NO usar multilingual para producción)
2. Intentar aumentar `similarity_boost` a 0.85 en ElevenLabs
3. Verificar que `ELEVENLABS_API_KEY` sea válida y tenga créditos disponibles
4. Comprobar el estado de ElevenLabs en status.elevenlabs.io
5. Si hay cortes frecuentes, es problema de red/latencia — probar desde otra conexión

---

## Las reservas no se están registrando

**Síntomas:** El webhook de n8n no recibe datos o Google Sheets no se actualiza.

**Pasos:**
1. Verificar que el workflow de n8n esté activo (botón verde)
2. Ir a n8n → Executions → ver si hay errores en las últimas ejecuciones
3. Verificar que la webhook URL en Retell sea la correcta (copiar de n8n)
4. Probar el webhook manualmente: Retell dashboard → Calls → "Resend webhook" en una llamada reciente
5. Si el error es de Google Sheets, verificar que las credenciales de Google no hayan expirado

---

## La transferencia al encargado no funciona

**Síntomas:** El agente dice que va a transferir pero la llamada no se transfiere.

**Pasos:**
1. Retell dashboard → Agent → ver la herramienta `transfer_call`
2. Verificar que el número destino sea correcto y en formato internacional (+34XXXXXXXXX)
3. Hacer una llamada de prueba y pedir expresamente hablar con una persona
4. Revisar el log de la llamada para ver si la herramienta se activó

---

## La cuenta de Retell o ElevenLabs se ha quedado sin créditos

**Síntomas:** Las llamadas fallan con error 402 o similar.

**Pasos:**
1. Entrar al dashboard de la plataforma correspondiente
2. Añadir créditos o actualizar el plan de pago
3. No hay que reconfigurar el agente — solo recargar la cuenta

---

## Cómo actualizar el horario o información del restaurante

No requiere tocar código. Solo:
1. Editar `prompts/system-prompt.md` con la nueva información
2. Copiar el prompt actualizado
3. Retell dashboard → LLMs → editar el LLM → pegar el nuevo prompt → guardar
4. Hacer una llamada de prueba para confirmar que el cambio está activo

---

## Contactos de soporte

| Plataforma | Soporte |
|---|---|
| Retell AI | support@retellai.com / dashboard.retellai.com |
| ElevenLabs | help.elevenlabs.io |
| n8n (cloud) | community.n8n.io |
| HAT3X (equipo técnico) | Contactar al equipo interno |
