# 🏢 Oficina Virtual HAT3X — Guía de Uso

La oficina virtual convierte una orden en lenguaje natural en trabajo real ejecutado por
agentes Claude Code headless, con supervisión visual en tiempo real y checkpoints humanos
para las decisiones importantes.

## Requisitos

1. **Claude Code CLI** en el PATH (`claude --version`) — ya instalado.
2. **Supabase**: proyecto activo con las migraciones aplicadas
   (`apps/command/src/database/migrations/001–004`) y Realtime habilitado en `bus_events`:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE bus_events;
   ```
3. **`.env` configurado** en `apps/command` (ver `.env.example`: SUPABASE_URL, service key,
   HAT3X_TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, MAX_CONCURRENT_AGENTS) y `.env.local` en
   `apps/jarvis` (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, service key).

> ⚠️ **Estado 2026-07-04:** el proyecto Supabase del `.env` actual ya no existe
> (DNS ENOTFOUND). Hay que crear/restaurar el proyecto y actualizar ambos `.env`.
> Todo lo demás está operativo y verificado.

## Encender la oficina

```bash
cd apps/command
npm run office        # o: npx tsx src/index.ts start
```

Levanta y supervisa (con reinicio automático): el servidor de Command (puerto 3002),
el bot de Telegram y el scheduler. `Ctrl+C` apaga la oficina.

## Dar órdenes

**CLI:**
```bash
cd apps/command
npx tsx src/index.ts nueva "Web para Clínica NovaMed con reservas" --cliente novamed --modo phased
# → devuelve HAT3X-NNN
curl -X POST localhost:3002/api/process -H "Content-Type: application/json" -d "{\"taskId\":\"HAT3X-NNN\"}"   # genera el plan
curl -X POST localhost:3002/api/execute -H "Content-Type: application/json" -d "{\"taskId\":\"HAT3X-NNN\"}"   # los agentes trabajan
# o directamente: npx tsx src/index.ts ejecutar HAT3X-NNN
```

**Telegram:** comandos del bot (/nuevo, /status, /checkpoints…) mientras la oficina está encendida.

**Jarvis:** `cd apps/jarvis && npm run dev` → http://localhost:3001 (conversacional).

## Supervisar

| Vista | URL | Qué ves |
|---|---|---|
| 🏢 Oficina 2D | http://localhost:3001/oficina | Avatares por zonas: 🟢 trabajando (con burbuja de qué hace), 🔵 en reunión, 🔴 bloqueado, ⚪ descansando. Clic en un agente → su actividad. |
| 📊 Dashboard | http://localhost:3001/command | KPIs, agentes activos, feed de eventos en vivo, proyectos. |
| 🔔 Checkpoints | http://localhost:3001/command/checkpoints | Aprobar ✓ / Rechazar ✗ con feedback. También llegan a Telegram. |

## Cómo trabaja un agente

Cada subtarea del plan lanza un proceso `claude -p` headless con: la identidad del agente
(`agents/<vertical>/CLAUDE.md`), la subtarea, los skills asignados y el contexto del cliente.
Trabaja **solo dentro de** `clients/projects/<cliente>/` en la rama `hat3x/HAT3X-NNN`,
committea su entregable y publica su progreso al State Bus. Máximo `MAX_CONCURRENT_AGENTS`
(4) en paralelo.

**Líneas rojas** (el agente NO las ejecuta; genera checkpoint para ti):
deploy a producción · comunicaciones salientes a clientes · acciones irreversibles o con
gasto · escribir fuera de su carpeta.

## Verificado (2026-07-04)

- ✅ Agente headless real: creó `index.html` válido, lo committeó en su rama y reportó eventos.
- ✅ Línea roja: ante "haz deploy a producción" preparó el trabajo pero devolvió
  `HAT3X_CHECKPOINT` sin desplegar.
- ✅ Suite apps/command: 157 tests en verde (20 de integración se saltan sin Supabase;
  reactivar con `HAT3X_TEST_LIVE=1`).

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Tarea X no encontrada` / `fetch failed` | Supabase caído o `.env` desactualizado | Verificar proyecto en el dashboard de Supabase y URLs/keys |
| Agente termina sin ficheros | `claude` no está en el PATH del proceso | `claude --version` en la misma terminal; reinstalar CLI si falta |
| La oficina se para a mitad de proyecto | Límite de la ventana de 5h de la suscripción | Bajar `MAX_CONCURRENT_AGENTS` o esperar al reset |
| `/oficina` no se actualiza en vivo | Realtime no habilitado en `bus_events` | Ejecutar el `ALTER PUBLICATION` de arriba |
| Checkpoint no llega a Telegram | Bot no arrancado o token inválido | `npm run office` y revisar `HAT3X_TELEGRAM_BOT_TOKEN` |
