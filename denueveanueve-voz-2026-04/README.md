# De Nueve a Nueve — Asistente de Voz IA

**Noa** — Recepcionista virtual para la peluquería y centro de estética De Nueve a Nueve.

---

## Descripción

Asistente de voz telefónico basado en IA que gestiona citas de forma autónoma para las sedes de **Collado Villalba** y **Alpedrete**.

### Operaciones soportadas

1. **Reservar citas nuevas** — consulta disponibilidad y crea la cita
2. **Modificar citas** — cambia fecha/hora de citas existentes
3. **Cancelar citas** — cancela citas reservadas
4. **Consultar disponibilidad** — informa de huecos libres
5. **Recordatorios / confirmaciones** — (pendiente de implementar)
6. **Transferir al salón** — pasa la llamada a un humano cuando es necesario

---

## Arquitectura

```
Cliente llama → Retell AI (Noa LLM + ElevenLabs voz)
              → n8n webhooks (5 workflows)
                → Supabase Edge Functions (vapi-webhook)
                  → Google Calendar (sync automático)
                  → Supabase DB (appointments, customers, staff)
```

### Componentes

| Componente | Tecnología | Función |
|------------|------------|---------|
| LLM / Diálogo | Retell AI + Claude Haiku | Procesa voz, gestiona conversación |
| Voz | ElevenLabs Turbo v2.5 | Síntesis de voz (español España, femenina) |
| Orquestación | n8n (5 workflows) | Conecta Retell con API Supabase |
| API / DB | Supabase Edge Functions + Postgres | Lógica de negocio, datos de citas |
| Calendario | Google Calendar | Sync bidireccional con la app |

---

## Estructura del proyecto

```
proyectos/denueveanueve-voz-2026-04/
├── README.md                      # Este archivo
├── prompts/
│   └── system-prompt.md           # Prompt del sistema para Noa
├── docs/
│   └── retell-config.md           # Configuración técnica Retell AI
└── n8n/
    ├── README-N8N.md              # Instrucciones workflows n8n
    ├── CONFIGURACION-RETELL.md    # Guía paso a paso Retell
    ├── 01-verificar-disponibilidad.json
    ├── 02-crear-cita.json
    ├── 03-cancelar-cita.json
    ├── 04-modificar-cita.json
    └── 05-post-llamada.json
```

---

## Quickstart

### 1. Configurar n8n

1. Importar los 5 JSON desde `n8n/` en tu instancia de n8n
2. Activar cada workflow
3. Configurar variables de entorno en n8n:
   ```env
   SUPABASE_URL=https://...supabase.co
   SUPABASE_ANON_KEY=...
   ```
4. Copiar las URLs de los webhooks

### 2. Configurar Retell AI

1. Crear LLM con `POST /v2/create-retell-llm` (ver `n8n/CONFIGURACION-RETELL.md`)
2. Crear Agente con `POST /v2/create-agent`
3. Asignar número con `POST /v2/create-phone-number`
4. Actualizar tools con las URLs reales de n8n

### 3. Probar

```bash
# Test webhook verificar_disponibilidad
curl -X POST https://n8n.tu-dominio.com/webhook/denueveanueve-verificar-disponibilidad \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"sede": "collado_villalba", "servicio": "Corte Señora", "fecha": "2026-04-10", "hora": "10:30"}}'
```

---

## Servicios disponibles (catálogo)

Ver `prompts/system-prompt.md` para el catálogo completo con duraciones.

**Resumen por categoría:**

| Categoría | Servicios principales | Duración |
|-----------|----------------------|----------|
| Corte | Señora, Caballero, flequillo, niño/a | 10-45 min |
| Color | Tinte raíz, mechas, balayage, baños | 60-110 min |
| Tratamientos | Keratina, anti-frizz, détox, caída | 15-160 min |
| Alisados/Permanentes | Alisado, desrizado, permanente | 30-160 min |
| Estilismo | Peinado, difusor, quitar humedad | 5-30 min |
| Estética facial | Cejas, tinte, depilación facial | 10-15 min |
| Depilación corporal | Axilas, brazos, piernas, espalda | 10-30 min |
| Manicura/Pedicura | Normal, semipermanente | 30-60 min |
| Premium | Servicio Estrella | 120 min |

---

## Sedes y horarios

| Sede | Dirección | Location ID (Supabase) |
|------|-----------|------------------------|
| Collado Villalba | C/ Principal 1, Collado Villalba | `4159c713-3507-49ba-8319-c4b7ed4f38b2` |
| Alpedrete | C/ Betanzos 1, Local 5, Alpedrete | `61865f3b-976b-427b-b5f1-c856e7b97cdf` |

**Horario general:** Lunes a sábado, 9:00 - 21:00  
**Domingos:** Cerrado

---

## API Supabase (vapi-webhook)

La Edge Function `vapi-webhook` expone estas acciones:

| Action | Parámetros | Descripción |
|--------|------------|-------------|
| `find_customer` | `customer_name`, `customer_phone` | Busca/crea cliente por nombre o teléfono |
| `check_availability` | `location_id`, `date`, `time`, `section` | Consulta huecos libres |
| `create_appointment` | `customer_id`, `location_id`, `date`, `time`, `section`, `services` | Cita nueva |
| `get_appointment` | `customer_id` | Obtiene próxima cita del cliente |
| `cancel_appointment` | `appointment_id` | Cancela cita |

**Documentación completa:** `app-denueveanueve/supabase/functions/vapi-webhook/index.ts`

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| "No hay disponibilidad" siempre | Verificar que `gcal-sync-appointments` tenga `GOOGLE_SERVICE_ACCOUNT_JSON` |
| Webhook n8n no responde | Comprobar que el workflow esté en **Active** |
| Error 401 de Supabase | Regenerar `SUPABASE_ANON_KEY` desde el dashboard |
| La voz no es en español | Verificar `language: "es-ES"` y voz ElevenLabs correcta |

---

## Próximos pasos (pendientes)

- [ ] Implementar recordatorios automáticos (24h antes)
- [ ] Añadir confirmación de citas por SMS/WhatsApp
- [ ] Integración con plataforma de pagos (Stripe)
- [ ] Dashboard de métricas de llamadas

---

**Proyecto creado:** 2026-04  
**Cliente:** De Nueve a Nueve  
**Vertical:** Voz + Automatizaciones  
**Equipo:** HAT3X
