# Roadmap del Proyecto — {{PROYECTO_NOMBRE}}

**Cliente:** {{CLIENTE_NOMBRE}}
**Período:** {{FECHA_INICIO}} — {{FECHA_FIN}}
**Responsable HAT3X:** {{RESPONSABLE_HAT3X}}
**Responsable cliente:** {{RESPONSABLE_CLIENTE}}

---

## Resumen de Fases

| Fase | Nombre | Duración | Responsable principal | Estado |
|---|---|---|---|---|
| 1 | Descubrimiento y Análisis | {{PENDIENTE_CONFIRMAR}} | HAT3X | Pendiente inicio |
| 2 | Diseño y Arquitectura | {{PENDIENTE_CONFIRMAR}} | HAT3X | Pendiente inicio |
| 3 | Implementación | {{PENDIENTE_CONFIRMAR}} | HAT3X | Pendiente inicio |
| 4 | Integración y Pruebas | {{PENDIENTE_CONFIRMAR}} | HAT3X + {{CLIENTE_NOMBRE}} | Pendiente inicio |
| 5 | Despliegue y Adopción | {{PENDIENTE_CONFIRMAR}} | HAT3X + {{CLIENTE_NOMBRE}} | Pendiente inicio |

---

## Detalle de Fases

### Fase 1 — Descubrimiento y Análisis

**Objetivo:** Comprender en profundidad el estado actual, los sistemas existentes y los requisitos técnicos y operativos.

**Tareas principales:**
- Revisión de sistemas actuales y flujos de trabajo existentes
- Entrevistas con usuarios clave de {{CLIENTE_NOMBRE}}
- Análisis de restricciones técnicas: {{RESTRICCIONES}}
- Documentación de requisitos funcionales y no funcionales

**Entregables:**
- Documento de requisitos validado
- Mapa de sistemas y flujos actuales
- Listado de integraciones necesarias: {{INTEGRACIONES}}

**Dependencias del cliente:**
- Acceso a sistemas actuales
- Disponibilidad de {{RESPONSABLE_CLIENTE}} para entrevistas (estimado: 4h)
- Documentación existente de procesos

**Hito de cierre:** Validación escrita del documento de requisitos por {{RESPONSABLE_CLIENTE}}

---

### Fase 2 — Diseño y Arquitectura

**Objetivo:** Definir la arquitectura técnica de la solución, el stack tecnológico y los criterios de aceptación de cada componente.

**Tareas principales:**
- Diseño de arquitectura de la solución
- Selección y configuración del stack: {{STACK_HERRAMIENTAS}}
- Definición de API e interfaces de integración
- Plan de pruebas

**Entregables:**
- Documento de arquitectura técnica
- Especificación de integraciones
- Plan de pruebas detallado

**Dependencias del cliente:**
- Aprobación del documento de arquitectura (estimado: 48h desde entrega)
- Acceso a entornos de desarrollo/staging

**Hito de cierre:** Aprobación del documento de arquitectura por {{RESPONSABLE_CLIENTE}}

---

### Fase 3 — Implementación

**Objetivo:** Construir los componentes definidos en la arquitectura aprobada.

**Tareas principales:**
- Desarrollo de los componentes core de la solución
- Configuración de herramientas y plataformas: {{STACK_HERRAMIENTAS}}
- Implementación de flujos de automatización
- Documentación técnica interna

**Entregables:**
{{ENTREGABLES}}

**Dependencias del cliente:**
- Credenciales de acceso a sistemas de {{CLIENTE_NOMBRE}} (provisionar antes de inicio de fase)
- Aprobación de componentes al finalizar cada sprint

**Hito de cierre:** Demo técnica de la solución completa en entorno de staging

---

### Fase 4 — Integración y Pruebas

**Objetivo:** Conectar la solución con los sistemas de {{CLIENTE_NOMBRE}} y verificar el comportamiento en condiciones reales.

**Tareas principales:**
- Integración con sistemas de {{CLIENTE_NOMBRE}}: {{INTEGRACIONES}}
- Pruebas funcionales y de regresión
- Pruebas de carga y rendimiento si aplica
- Corrección de incidencias detectadas

**Dependencias del cliente:**
- Acceso a entorno de producción o pre-producción
- Participación del equipo técnico de {{CLIENTE_NOMBRE}} en pruebas de aceptación (estimado: 8h)

**Hito de cierre:** Firma del acta de aceptación de pruebas por {{RESPONSABLE_CLIENTE}}

---

### Fase 5 — Despliegue y Adopción

**Objetivo:** Poner en producción la solución y garantizar que el equipo de {{CLIENTE_NOMBRE}} la adopta con eficacia.

**Tareas principales:**
- Despliegue en entorno de producción
- Formación al equipo de {{CLIENTE_NOMBRE}}
- Documentación de usuario final
- Soporte de arranque (primeras 2 semanas post-go-live)

**Dependencias del cliente:**
- Disponibilidad del equipo para sesiones de formación
- Comunicación interna del cambio a los usuarios

**Hito de cierre:** Go-live confirmado + 2 semanas de operación estable

---

## Hitos Clave y Entregables

| Hito | Entregable asociado | Responsable de aceptación | Fecha estimada |
|---|---|---|---|
| H1 — Requisitos validados | Documento de requisitos | {{RESPONSABLE_CLIENTE}} | {{PENDIENTE_CONFIRMAR}} |
| H2 — Arquitectura aprobada | Documento de arquitectura | {{RESPONSABLE_CLIENTE}} | {{PENDIENTE_CONFIRMAR}} |
| H3 — Demo de solución | Demo en staging | {{RESPONSABLE_CLIENTE}} | {{PENDIENTE_CONFIRMAR}} |
| H4 — Pruebas aceptadas | Acta de aceptación | {{RESPONSABLE_CLIENTE}} | {{PENDIENTE_CONFIRMAR}} |
| H5 — Go-live | Sistema en producción | {{RESPONSABLE_CLIENTE}} | {{FECHA_FIN}} |

---

## Riesgos y Supuestos

### Riesgos identificados

{{RIESGOS_CONOCIDOS}}

| Riesgo | Probabilidad | Impacto | Mitigación | Responsable |
|---|---|---|---|---|
| Retraso en provisión de accesos por parte del cliente | Media | Alto | Solicitar accesos en kickoff con plazo de 5 días hábiles | {{RESPONSABLE_CLIENTE}} |
| Cambio de alcance durante la implementación | Media | Medio | Proceso de gestión de cambios documentado | HAT3X + {{RESPONSABLE_CLIENTE}} |
| Incompatibilidad técnica con sistemas existentes | Baja | Alto | Análisis de integraciones en Fase 1 | HAT3X |

### Supuestos del proyecto

- El equipo de {{CLIENTE_NOMBRE}} estará disponible en los plazos indicados en cada fase
- Los sistemas actuales tienen APIs accesibles o mecanismos de exportación de datos
- Las restricciones técnicas descritas son completas: {{RESTRICCIONES}}
- No hay cambios normativos o regulatorios previstos que afecten al proyecto durante su ejecución

---

## Próximos Pasos Inmediatos

1. Kickoff oficial con {{RESPONSABLE_HAT3X}} y {{RESPONSABLE_CLIENTE}} — Plazo: semana del {{FECHA_INICIO}}
2. Provisión de accesos a sistemas para Fase 1 — Responsable: {{RESPONSABLE_CLIENTE}} — Plazo: 5 días hábiles tras kickoff
3. Confirmar disponibilidad del equipo de {{CLIENTE_NOMBRE}} para entrevistas de Fase 1

---

*Documento preparado por HAT3X para {{CLIENTE_NOMBRE}}.*
*Fecha de emisión: {{FECHA_INICIO}}*
*Las fechas marcadas como {{PENDIENTE_CONFIRMAR}} se definirán en la reunión de kickoff.*
