# Aiden — LLM conmutable vía OpenRouter · Diseño

**Fecha:** 2026-08-06
**Autor:** Jose (HAT3X) + Claude
**Estado:** Diseño aprobado en brainstorming, pendiente de revisión y de plan de implementación.

## 1. Propósito

**Aiden** (`apps/jarvis`) es el asistente ejecutivo agéntico de HAT3X: un bucle de tool-use
(hasta 6 rondas) que opera Supabase, ficheros, HTTP a APIs externas, finanzas, clientes,
etc. Hoy está **cableado a Claude** (SDK de Anthropic, modelo `JARVIS_MODEL` =
`claude-sonnet-4-6`). El coste de la API de Claude es alto para un uso intensivo diario.

Objetivo: que Aiden llame al LLM **a través de OpenRouter** (API compatible con el SDK de
OpenAI, que jarvis ya tiene instalado), eligiendo el modelo con una variable de entorno, para
usar modelos open-weight mucho más baratos (default **DeepSeek V4 Pro** — la opción más
barata que sigue siendo potente) y poder comparar Kimi / Qwen / GLM / Claude / modelos locales
cambiando un string.

Meta a largo plazo (fuera de este spec): Aiden como "mano derecha" total de HAT3X (proyectos,
cobros, plazos de entrega). Este cambio de modelo es el **habilitador** (usar Aiden a diario
sin miedo al coste); las features nuevas van en un spec aparte.

## 2. Decisiones (brainstorming)

| Tema | Decisión |
|---|---|
| Enfoque | **C — Todo por OpenRouter**: un único cliente OpenAI-compatible; el modelo es un string. |
| Modelo por defecto | **`deepseek/deepseek-v4-pro`** (~$0.44/$0.87 por millón tok.; ~$0.04/tarea; fuerte en tool-use). El equilibrio barato+potente. |
| Otros modelos | Cambiar el string: `deepseek/deepseek-v4-flash` (aún más barato, menos capaz), `moonshotai/kimi-k2.6`, `moonshotai/kimi-k3`, `qwen/qwen-3.6-plus`, `anthropic/claude-sonnet-5`, o un endpoint local (Ollama). |
| Claude | Se mantiene accesible **vía OpenRouter** (`anthropic/claude-sonnet-5`), no por el SDK de Anthropic directo. Se retira el uso del SDK de Anthropic en el handler. |
| Contexto/coste | Kimi K3 ($3/$15) NO ahorra (precio Claude); queda disponible como "modo bestia" puntual, no de diario. |

### Datos de coste (agosto 2026, por millón de tokens in/out)
- DeepSeek V4 Pro: ~$0.44 / $0.87 · DeepSeek V4 Flash: ~$0.10 / $0.20 · Kimi K2.6: ~$0.95 / $4.00
- Kimi K3: $3 / $15 · Claude Sonnet: $2-3 / $10-15. → open-weight de 3x a 30x más baratos.

## 3. Estado actual (lo que se toca)

- `apps/jarvis/src/lib/command-handler.ts`: `handleCommand()` construye el system prompt +
  contexto, instancia `new Anthropic({apiKey})`, y en un bucle `for (round < 6)` llama
  `anthropic.messages.create({model, max_tokens, system, tools, messages})`, lee bloques
  `text`/`tool_use`, ejecuta `executeTool`, y realimenta `tool_result`.
- `TOOLS: Anthropic.Tool[]` — 25 herramientas en formato Anthropic (`input_schema`).
- `executeTool(name, input, actionRef)` — ejecutor **agnóstico al proveedor** (Supabase,
  fetch, fs, etc.). NO se toca.
- Dependencias ya presentes: `@anthropic-ai/sdk`, `openai`.

## 4. Arquitectura propuesta

Módulo nuevo **`apps/jarvis/src/lib/llm.ts`** que encapsula:
- El cliente `OpenAI` configurado con `baseURL` (OpenRouter por defecto) + `apiKey`.
- La conversión de las tools de formato Anthropic → formato OpenAI (función pura).
- Una función `runAgenticLoop({ system, messages, tools, executeTool, maxRounds })` que
  ejecuta el bucle de tool-use en formato OpenAI y devuelve `{ text, action }`.

`command-handler.ts` deja de instanciar Anthropic y llama a `runAgenticLoop`. El array `TOOLS`
(en formato Anthropic, se mantiene como fuente única) y `executeTool` se pasan tal cual.

### 4.1 Conversión de tools (Anthropic → OpenAI)
```
{ name, description, input_schema }
→ { type: "function", function: { name, description, parameters: input_schema } }
```
(`input_schema` es JSON Schema estándar, compatible como `parameters`.) Función pura `toOpenAITools(tools)`.

### 4.2 El bucle (formato OpenAI)
- `messages`: primer mensaje `role:"system"` con el system prompt; luego historial + user.
- Llamada: `openai.chat.completions.create({ model, max_tokens, messages, tools, tool_choice: "auto" })`.
- Respuesta: `choice.message`. Si `message.tool_calls` está vacío o `finish_reason === "stop"` → devolver `message.content`.
- Si hay `tool_calls`: por cada uno, `JSON.parse(tool_call.function.arguments)` (con guarda: si falla, devolver al modelo un tool result de error legible), ejecutar `executeTool(name, args, actionRef)`, y añadir:
  - el `message` del asistente (con `tool_calls`) al historial;
  - un mensaje `role:"tool"` por cada call: `{ role:"tool", tool_call_id, content }`.
- Repetir hasta `maxRounds` (6). Tools en paralelo con `Promise.all` (igual que hoy).

### 4.3 Diferencias clave vs Anthropic (a cubrir en tests)
- `system` como parámetro aparte → mensaje `role:"system"`.
- `tool_use.input` (objeto) → `tool_calls[].function.arguments` (**string JSON**, hay que parsear).
- `tool_result` en mensaje `user` → mensajes `role:"tool"` con `tool_call_id`.
- `stop_reason` → `finish_reason` / ausencia de `tool_calls`.

## 5. Configuración (env, en `apps/jarvis/.env.local`)
- `JARVIS_MODEL` — default `deepseek/deepseek-v4-pro`.
- `JARVIS_BASE_URL` — default `https://openrouter.ai/api/v1`.
- `JARVIS_API_KEY` (o `OPENROUTER_API_KEY`) — la clave de OpenRouter.
- Cabeceras opcionales OpenRouter: `HTTP-Referer` y `X-Title` (identificación de la app).
- Cambiar de modelo/proveedor = cambiar `JARVIS_MODEL` (y, para local, `JARVIS_BASE_URL` a `http://localhost:11434/v1` con Ollama).

## 6. Manejo de errores
- Error del proveedor (red, 4xx/5xx, saldo) → capturar y devolver un texto claro para la voz
  ("No he podido contactar con el modelo; revisa la configuración"), sin romper.
- `tool_calls` con `arguments` no parseables → devolver al modelo un tool result de error para
  que reintente, en vez de lanzar.
- Nunca loguear la API key.

## 7. Tests
- **Unitarios** (Vitest): `toOpenAITools` (formato correcto); parseo de una respuesta con
  `tool_calls` (incluye caso `arguments` inválido → error legible); construcción de los
  mensajes `role:"tool"`.
- **Integración manual**: con una key real de OpenRouter y `JARVIS_MODEL=deepseek/deepseek-v4-pro`,
  lanzar una orden que ejercite el bucle (p. ej. "¿cuántos clientes tenemos?" → `supabase_query`
  → respuesta en español). Verificar que resuelve en ≤6 rondas.

## 8. Fuera de alcance (YAGNI)
- No se usa Vercel AI SDK. No se tocan las 25 tools ni `executeTool` ni la lógica de negocio.
- No se añaden features nuevas de "mano derecha" (plazos, seguimiento de proyectos, cobros):
  eso es un spec/proyecto aparte, posterior.
- `whisper.ts` (voz→texto por OpenAI) no se toca.

## 9. Prerrequisitos y riesgos
- **Prerrequisito**: cuenta OpenRouter con saldo y su API key en `.env.local` (o, alternativa,
  DeepSeek directo con su propia baseURL/key). A resolver al implementar.
- **Fiabilidad de tool-calling**: los modelos baratos pueden ser algo menos consistentes que
  Claude en el bucle agéntico multi-turno. Mitigación: el bucle tolera errores de parseo y
  reintenta; se puede subir a un modelo mejor (Kimi K3, Claude) cambiando el string si un flujo
  crítico falla.
- **Privacidad**: los datos de HAT3X (memoria, tablas) pasan por OpenRouter y el proveedor del
  modelo. Para uso interno de Jose se acepta; OpenRouter permite excluir proveedores que
  entrenen con los datos. Documentar en el README de jarvis.
