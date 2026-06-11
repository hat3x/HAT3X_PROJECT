# Aiden ↔ Command Contract

## Principio

Command es el cerebro operativo de HAT3X. Aiden es la interfaz ejecutiva segura encima de Command.

Aiden no debe ejecutar tareas criticas directamente. Su trabajo es conversar con Jota, consultar datos de bajo riesgo, presentar planes, pedir aprobaciones y enrutar ordenes estructuradas hacia Command.

## Responsabilidades

### Aiden

- Voz, chat y dashboard.
- Consulta rapida de CRM, finanzas, tareas, eventos y checkpoints.
- Presentacion de planes.
- Solicitud de aprobaciones.
- Enrutamiento de ordenes hacia Command.
- Respuestas naturales en modo voz.
- Respuestas estructuradas en modo trabajo.
- Audit log de decisiones y rutas.

### Command

- Sistema operativo agentico.
- Carga memoria de cliente.
- Descompone tareas.
- Selecciona agentes y skills.
- Ordena fases.
- Calcula riesgo.
- Crea checkpoints.
- Publica eventos en Supabase.
- Coordina ejecucion multiagente.

## Payload Formal

```json
{
  "source": "aiden",
  "user": "jota",
  "intent": "project_request",
  "orderRaw": "Crear una app completa para gestionar reservas",
  "clientId": "cliente-opcional",
  "mode": "project_mode",
  "priority": "normal",
  "riskLevel": "medium",
  "approvalPolicy": {
    "requireApprovalFor": ["high", "critical"]
  },
  "context": {
    "conversationSummary": "Resumen de la conversacion",
    "crmContext": {},
    "projectContext": {},
    "companyBrain": {}
  },
  "expectedDeliverables": ["Plan ejecutivo", "Roadmap"],
  "constraints": ["Mostrar plan antes de ejecutar"]
}
```

## Endpoints

- `POST /api/preview`: previsualiza plan sin ejecutar.
- `POST /api/tasks`: delega una tarea a Command.
- `POST /api/process`: procesa una tarea existente.
- `GET /api/tasks/:id/status`: consulta estado.
- `GET /health`: healthcheck.
- `POST /api/checkpoints/:id/approve`: aprueba checkpoint.
- `POST /api/checkpoints/:id/reject`: rechaza checkpoint.

## Politica De Riesgo

| Nivel | Aiden puede | Ejemplos |
| --- | --- | --- |
| low | Ejecutar automaticamente | `supabase_query`, `read_file`, `query_finances`, `find_clients`, `get_task_status` |
| medium | Preparar y validar | `create_client`, `record_transaction`, `add_company_memory`, `write_file` en rutas seguras |
| high | Pedir aprobacion | `send_outreach_email`, `http_request` POST/PATCH/PUT, `run_command` allowlisted |
| critical | Delegar a Command o checkpoint | `supabase_delete`, `send_bulk_outreach`, `http_request` DELETE, `git push`, `.env`, dinero real |

## Modos De Respuesta

- `voice_mode`: respuesta natural, breve, orientada a conversacion.
- `work_mode`: respuesta estructurada, util para operar.
- `project_mode`: proyectos complejos que entran en Command.
- `audit_mode`: auditorias con trazabilidad y checkpoints.
- `controlled_autonomous_mode`: alto riesgo, requiere aprobaciones.

## Plan De Refactor Progresivo

1. Crear contrato, policy engine, response mode, prompt limpio y router basico.
2. Hacer que `/api/command` use el clasificador antes de invocar herramientas.
3. Sustituir ejecuciones directas high/critical por checkpoints y delegacion a Command.
4. Mover herramientas peligrosas fuera de Aiden o dejarlas solo como adaptadores aprobados.
5. Añadir audit log persistente para cada decision de routing.
6. Completar endpoints faltantes en Command para estado, tareas y checkpoints.
