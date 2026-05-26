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
