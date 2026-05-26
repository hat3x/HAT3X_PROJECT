# Recepcionista Voz — Demo Restaurante Ekis
**HAT3X — Demo Comercial**
Fecha: 2026-03-30

---

## Qué es esto

Demo de recepcionista por voz con IA para restaurantes.
Atiende llamadas entrantes, gestiona reservas y responde FAQs.
Construido con Retell AI + ElevenLabs + Claude.

Este proyecto es la demo que HAT3X enseña a restaurantes para venderles el producto.
El restaurante "Ekis" es ficticio. Los datos de contacto son de ejemplo.

---

## Qué hace el agente

- Recibe llamadas entrantes (inbound)
- Toma reservas: recoge nombre, personas, día, franja y teléfono
- Gestiona cancelaciones y modificaciones de reserva
- Responde FAQs: horarios, dirección, precio, parking, terraza
- Transfiere al encargado cuando la consulta lo requiere
- Registra cada llamada automáticamente (webhook → Google Sheets)

---

## Stack

| Componente | Herramienta |
|---|---|
| Motor de llamadas | Retell AI |
| Voz sintetizada | ElevenLabs (eleven_turbo_v2_5) |
| LLM | Claude Haiku (menor latencia) |
| Post-llamada | n8n webhook → Google Sheets |
| Notificaciones | Slack (opcional) |

---

## Setup en 5 pasos

### Paso 1 — Credenciales
```bash
cp .env.example .env
# Rellenar RETELL_API_KEY y ELEVENLABS_API_KEY
```

### Paso 2 — Configurar voz en ElevenLabs
1. Leer `docs/elevenlabs-config.md`
2. Probar las voces recomendadas con las frases de test
3. Elegir voz y guardar el Voice ID en `.env` → `ELEVENLABS_VOICE_ID`

### Paso 3 — Crear agente en Retell AI
1. Leer `docs/retell-config.md`
2. Crear el LLM con el contenido de `prompts/system-prompt.md`
3. Crear el agente con la configuración JSON del doc
4. Asignar un número de teléfono al agente
5. Guardar `RETELL_AGENT_ID` y `RETELL_PHONE_NUMBER` en `.env`

### Paso 4 — Activar los 5 workflows de n8n

Importar en este orden (n8n → Workflows → Import from file):

| Archivo | Propósito | URL en .env |
|---|---|---|
| `webhooks/verificar-disponibilidad.json` | Consultar huecos antes de reservar | `N8N_VERIFICAR_DISPONIBILIDAD_URL` |
| `webhooks/crear-reserva.json` | Guardar reserva nueva en Sheets | `N8N_CREAR_RESERVA_URL` |
| `webhooks/modificar-reserva.json` | Cambiar fecha/franja/personas | `N8N_MODIFICAR_RESERVA_URL` |
| `webhooks/cancelar-reserva.json` | Cancelar y mover al historial | `N8N_CANCELAR_RESERVA_URL` |
| `webhooks/call-ended.json` | Log post-llamada en Sheets | `N8N_POST_LLAMADA_URL` |

Para cada workflow:
1. Sustituir `COMPLETAR_CON_ID_SPREADSHEET` con el ID real de tu Google Sheet
2. Configurar credenciales Google Sheets (cuenta de servicio)
3. Activar y copiar la URL del webhook al `.env`

Una vez completado el `.env`, actualizar las URLs en `docs/retell-config.md`.

### Paso 5 — Testing
1. Leer `docs/tests.md`
2. Completar los 10 escenarios obligatorios
3. Solo mostrar la demo cuando todos estén en OK

---

## Cómo actualizar el agente

Para cambiar la personalidad, información o flujos del agente:

1. Editar `prompts/system-prompt.md`
2. Ir a Retell AI dashboard → LLMs → seleccionar el LLM del agente
3. Pegar el nuevo contenido del system prompt
4. Guardar y hacer una llamada de prueba

No es necesario tocar ningún código. Todo se controla desde el system prompt.

---

## Estructura del proyecto

```
ekis-voz-recepcionista-2026-03-30/
├── prompts/
│   ├── system-prompt.md       ← Prompt completo del agente (editar para personalizar)
│   ├── flujos.md              ← Diagramas de conversación
│   └── objeciones.md          ← 10 situaciones difíciles con respuestas preparadas
├── docs/
│   ├── retell-config.md       ← Configuración paso a paso de Retell AI
│   ├── elevenlabs-config.md   ← Selección de voz y parámetros
│   └── tests.md               ← Plan de testing con 10 escenarios
├── webhooks/
│   └── call-ended.json        ← Workflow n8n para procesar datos post-llamada
├── .env.example               ← Variables de entorno necesarias
├── README.md                  ← Este archivo
└── MANTENIMIENTO.md           ← Qué hacer si algo falla
```

---

## Adaptar para un cliente real

Cuando se venda este producto a un restaurante real, sustituir:

| Dato ficticio (Ekis) | Dato real del cliente |
|---|---|
| "Restaurante Ekis" | Nombre del restaurante |
| "Carmen" | Nombre que elija el cliente para su recepcionista |
| Dirección Serrano 78 | Dirección real |
| Horarios del prompt | Horarios reales del restaurante |
| Platos y precios | Carta y precios reales |
| Teléfono encargado | Teléfono real del encargado |
| Email info@ | Email real del restaurante |

Tiempo estimado de adaptación para cliente real: 2-4 horas si ya hay toda la información.
