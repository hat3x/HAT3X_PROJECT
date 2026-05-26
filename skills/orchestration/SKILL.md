# Skill: Orquestación de Agentes HAT3X

> Para ser usado por el Master Orchestrator y PMs para delegar eficientemente.

---

## Principios de Delegación Efectiva

### 1. Delegar Temprano, Delegar a Menudo

No esperes a tener "toda la información". Delega con lo que tengas y deja que el subagente complete los huecos.

### 2. Contexto Rico, Instrucciones Claras

```markdown
[DELEGACIÓN EFECTIVA]
PM: [nombre del PM especializado]
TASK: "[verbo de acción] + [objeto] + [resultado esperado]"
CONTEXT: {
  "cliente": {...},
  "proyecto": {...},
  "restricciones": [...],
  "criterios_exito": [...]
}
COORDINACIÓN: [si hay múltiples PMs, qué debe ser coherente]
```

### 3. Paralelismo Siempre que Sea Posible

Si dos tareas no dependen una de la otra → ejecútalas en paralelo.

```
[PARALELO]
→ PM 1: "tarea A"
→ PM 2: "tarea B"
[FIN PARALELO]
```

### 4. Definir Criterios de Éxito Antes de Empezar

Cada subagente debe saber qué significa "terminado" antes de empezar.

---

## Patrones de Delegación

### Patrón 1: Proyecto Simple

```
[DELEGAR]
PM: [nombre]
TASK: "[objetivo claro]"
CONTEXT: {briefing}
CRITERIOS_EXITO: [lista de 3-5 items]
```

### Patrón 2: Proyecto Mixto

```
[DELEGAR EN PARALELO]
→ PM 1: "[tarea específica 1]"
→ PM 2: "[tarea específica 2]"
CONTEXT: {briefing compartido}
COORDINACIÓN: [qué debe ser coherente entre PMs]
CHECKPOINT: [cuándo sincronizar]
```

### Patrón 3: Subdelegación Interna

Cuando un PM necesita delegar dentro de su propio dominio:

```
[SUBDELEGAR]
ROL: [nombre del subagente interno]
TASK: "[tarea específica]"
CONTEXT: {contexto filtrado — solo lo necesario}
```

---

## Checkpoints de Sincronización

Para proyectos mixtos, definir checkpoints:

| Checkpoint | Cuándo | Quién coordina |
|---|---|---|
| Kickoff | Antes de empezar | Master Orchestrator |
| Mid-point | 50% del tiempo estimado | PM con mayor carga |
| Pre-entrega | Antes de cerrar | Master Orchestrator |

---

## Anti-patrones a Evitar

| Anti-patrón | Por qué evitarlo | Alternativa |
|---|---|---|
| Esperar confirmación para delegar | Ralentiza el flujo | Delegar inmediatamente |
| Sobrecargar de contexto | Ruido, confusión | Contexto mínimo necesario |
| Delegar sin criterios de éxito | El subagente no sabe cuándo parar | Definir 3-5 criterios claros |
| No definir coordinación en proyectos mixtos | Entregas inconsistentes | Designar coordinador y checkpoints |
| Acumular tareas "por si acaso" | Sobrecarga cognitiva | Delegar cada tarea al PM especializado |

---

## Métricas de Buena Orquestación

- [ ] Tiempo desde petición hasta primera delegación < 1 minuto
- [ ] Cero confirmaciones pedidas al usuario para delegar
- [ ] Todos los subagentes tienen criterios de éxito claros
- [ ] Checkpoints definidos en proyectos mixtos
- [ ] Memoria actualizada tras cerrar
