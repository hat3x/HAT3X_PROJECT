# Recepcionista IA "Noa" — De Nueve a Nueve (Retell AI)

## ✅ ESTADO: DESPLEGADA en Retell (2026-07-24)
Creada vía API en tu cuenta de Retell:
- **agent_id:** `agent_b30c174da9d247be01206d9685` — "Noa — Recepcionista De Nueve a Nueve"
- **llm_id:** `llm_0ceec9dee59de562abf0f63ab21f` — modelo `gpt-5.5`
- **Voz:** `cartesia-Elena` (femenina, español de España), es-ES
- **Tools (6):** verificar_disponibilidad · crear_cita · cancelar_cita · modificar_cita · transferir_al_salon (+34 918 502 012) · end_call
- **Fecha de hoy:** vía variable dinámica `{{current_time_Europe/Madrid}}` (no depende de n8n)
- IDs guardados en `../.env` (RETELL_API_KEY, LLM_ID, AGENT_ID).

### ⛔ BLOQUEANTE antes de usarla en real: activar los workflows de n8n
Las 5 webhooks `denueveanueve-*` de `hat3xia.app.n8n.cloud` responden **404 (no registradas)**.
Sara/biodental sí responde 200, así que la instancia está viva — **los workflows de
denueveanueve NO están activos/importados**. Hasta activarlos, Noa hablará bien pero
NO podrá consultar agenda ni crear/cancelar/modificar citas.
→ Importa los JSON de `../n8n/` en n8n y pon cada workflow en **Active**.

### Falta (decisiones tuyas)
- **Número de teléfono**: NO lo he comprado (es coste recurrente + decisión tuya). Puedes probarla ya con "Test Call" en el dashboard de Retell sin número. Dime si quieres que le asigne un número de Retell o vincule uno de Twilio.
- **Teléfono de transferencia de Alpedrete**: hoy toda transferencia va a Collado (918 502 012).

---

Paquete de la recepcionista dentro de Retell, corregido y alineado con los workflows de n8n.

## Ficheros
| Fichero | Qué es |
|---|---|
| `system-prompt.md` | El "cerebro" de Noa: personalidad, sedes, horario, catálogo, flujos y reglas. |
| `create-retell-llm.json` | El LLM de Retell + las 5 herramientas con **los contratos reales de tus n8n**. |
| `create-agent.json` | El agente (voz ElevenLabs, es-ES, ajustes de conversación). |

## Qué se corrigió respecto al material anterior
- **Contratos de las tools alineados con n8n** (antes el prompt usaba `location_id`/`services[]`, que n8n NO lee → la cita fallaba). Ahora: `sede`, `servicio`, `fecha`, `hora`, etc.
- **Path correcto de crear cita**: `denueveanueve-crear-cita-verificado` (el viejo apuntaba a `denueveanueve-crear-cita`).
- **Datos reales**: dirección Collado Villalba **C. Azuela 36** y teléfono **918 502 012** (antes eran placeholder), horario **9-21 L-V / 9-15 Sáb**.

## Pasos (API o dashboard de Retell)
1. **Crear LLM** → `POST /v2/create-retell-llm` con `create-retell-llm.json`.
   - Pega en `general_prompt` el contenido de `system-prompt.md`.
   - Sustituye `{{N8N_BASE_URL}}` por tu n8n real (ej. `https://n8n.hat3x.com`).
   - Guarda el `llm_id`.
2. **Crear agente** → `POST /v2/create-agent` con `create-agent.json`.
   - Pon el `llm_id` del paso 1 y un `ELEVENLABS_VOICE_ID` (voz femenina española).
   - Guarda el `agent_id`.
3. **Asignar número** → `POST /v2/create-phone-number` con `{ "area_code": "34", "agent_id": "<agent_id>" }` (o vincula un número que ya tengas).

## Lo que TÚ tienes que aportar (secretos/config)
- `RETELL_API_KEY` (tu cuenta de Retell).
- `N8N_BASE_URL` (la base pública de tu n8n).
- `ELEVENLABS_VOICE_ID` (elige la voz en ElevenLabs).
- El teléfono de transferencia de **Alpedrete** (en el prompt está `[POR CONFIRMAR]`).

## ⚠️ Preguntas que necesito que confirmes (encontré datos que no cuadran)
1. **¿Cuántas sedes hay activas?** Tu web/agregadores mencionan **Collado Villalba, Alpedrete y también Boadilla del Monte**. El sistema (n8n + Salón OS) está montado para **2 sedes**: Collado y Alpedrete. Si Boadilla está activa y quieres que Noa la ofrezca, hay que añadir la sede en n8n/Salón OS (no es solo el agente).
2. **Dirección y teléfono reales de Alpedrete** — verifiqué Collado (C. Azuela 36 · 918 502 012) pero no Alpedrete. En el prompt figura la dirección del proyecto (C/ Betanzos 1, Local 5) y el teléfono como `[POR CONFIRMAR]`.
3. **Equipo por sede** — usé los nombres del proyecto; confírmame si siguen vigentes (altas/bajas).
4. **Horario de Alpedrete** — puse el mismo que Collado (9-21 / 9-15). El proyecto antiguo tenía Alpedrete con horario partido los miércoles; dime cuál es el vigente y lo ajusto.

## A dónde escriben tus n8n hoy
Los webhooks (`denueveanueve-*`) son los que YA tienes. Noa llama a esos webhooks tal cual,
así que funciona con lo que haga tu n8n por debajo (Google Calendar o Salón OS). Cuando
reapuntes n8n a Salón OS (fase pendiente del roadmap), la recepcionista **no cambia**:
sigue llamando a los mismos webhooks.

## Prueba antes de dar el número al público
- [ ] Llamada de prueba: pedir cita → confirmar → que aparezca en la agenda.
- [ ] Cancelar y modificar.
- [ ] Pedir un profesional concreto.
- [ ] Fuera de horario / domingo → responde bien.
- [ ] Pedir precio → deriva al salón/app sin inventar.
