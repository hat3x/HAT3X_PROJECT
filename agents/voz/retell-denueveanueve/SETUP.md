# Setup — Asistente de Voz Retell AI para De Nueve a Nueve

## Arquitectura

```
Cliente llama → Retell AI (Noa) → Custom Functions → Supabase Edge Function (retell-webhook) → DB
```

El agente de voz "Noa" usa LLM + prompt para conversar, y llama a funciones personalizadas para consultar/modificar datos en Supabase en tiempo real.

---

## Paso 1 — Desplegar la Edge Function

```bash
# Desde la carpeta del proyecto
cd app-denueveanueve

# Deploy de la función
npx supabase functions deploy retell-webhook --project-ref cpocwvedqlxtwazwoyfn

# Verificar que está activa
npx supabase functions list
```

La URL del webhook será:
```
https://cpocwvedqlxtwazwoyfn.supabase.co/functions/v1/retell-webhook
```

---

## Paso 2 — Crear agente en Retell AI

1. Ve a **https://app.retellai.com**
2. **Create Agent** → elige **LLM Agent**
3. Configura:

| Campo | Valor |
|---|---|
| Agent Name | Noa — De Nueve a Nueve |
| LLM | `claude-sonnet-4-6` (mejor español) |
| Language | Spanish |
| Voice | ElevenLabs → busca "Valentina" o "Paula" (español natural) |
| Ambient Sound | ninguno o "office" muy suave |
| Response Delay | 500ms |
| Enable Interruption | ✅ (el cliente puede interrumpir) |

---

## Paso 3 — Pegar el System Prompt

Copia el contenido completo de `system-prompt.md` y pégalo en el campo **System Prompt** del agente.

---

## Paso 4 — Añadir Custom Functions

En el agente → **Functions** → **Add Function** → pega cada una de las 6 funciones del archivo `custom-functions.json`:

1. `check_availability`
2. `get_customer_by_phone`
3. `get_appointment`
4. `create_appointment`
5. `cancel_appointment`
6. `get_loyalty`

La URL de todas es:
```
https://cpocwvedqlxtwazwoyfn.supabase.co/functions/v1/retell-webhook
```

Cada función tiene un header distinto `x-retell-action` para identificar qué acción ejecutar.

---

## Paso 5 — Asignar número de teléfono

1. En Retell → **Phone Numbers** → **Buy Number**
2. Elige número español (+34) o usa el tuyo propio con SIP
3. Asigna el número al agente "Noa"

Para usar tu número existente (+34 918 50 20 12):
- Ve a **Phone Numbers** → **Import SIP Trunk**
- Configura el desvío desde tu operadora a Retell

---

## Paso 6 — Configurar Webhooks (opcional pero recomendado)

En Retell → **Webhooks** → añade tu endpoint para recibir eventos:

| Evento | Para qué |
|---|---|
| `call_ended` | Registrar en logs que hubo una llamada |
| `call_analyzed` | Ver transcripción y análisis de la llamada |

Endpoint sugerido: una nueva Edge Function `retell-events` o un workflow de n8n.

---

## Paso 7 — Probar antes de publicar

1. En el dashboard de Retell → botón **Call** (llama directamente desde el browser)
2. Prueba estos escenarios:
   - "¿Cuáles son vuestros horarios?"
   - "Quiero reservar una cita para corte de caballero el viernes"
   - "¿Cuántos puntos tengo? Mi teléfono es 600000001"
   - "Quiero cancelar mi cita"
   - "¿Qué incluye el Plan Ladies?"

---

## Costes estimados

| Concepto | Coste |
|---|---|
| Llamada voz (Retell base) | ~$0.07/min |
| LLM Claude Sonnet | ~$0.05/min |
| Telefonía (número español) | ~$0.015/min |
| **Total estimado** | **~$0.135/min (~0.12€/min)** |
| Edge Function Supabase | Gratis (dentro del plan free) |

Con 100 llamadas de 3 min al mes → **~36€/mes**

---

## Variables de entorno necesarias en Supabase

La Edge Function usa automáticamente:
- `SUPABASE_URL` — ya configurada por defecto
- `SUPABASE_SERVICE_ROLE_KEY` — ya configurada por defecto en Edge Functions

No necesitas configurar nada adicional en Supabase.

---

## Próximas mejoras posibles

- [ ] Notificación por WhatsApp al crear/cancelar cita vía n8n
- [ ] Transferencia a número de WhatsApp del salón si el cliente lo pide
- [ ] Analíticas de llamadas (transcripciones, temas frecuentes)
- [ ] Versión multilocal: el agente pregunta qué centro prefiere y filtra disponibilidad por local
- [ ] Recordatorio automático de cita por llamada (outbound call 24h antes)
