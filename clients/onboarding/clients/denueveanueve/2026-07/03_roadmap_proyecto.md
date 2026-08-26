# Roadmap del Proyecto — Salón OS — Plataforma de gestión integral (piloto)

**Cliente:** De Nueve a Nueve
**Período:** 11 de julio de 2026 — 31 de agosto de 2026
**Responsable HAT3X:** Jose Miguel González Domingo
**Responsable cliente:** [POR CONFIRMAR]

---

## Resumen de Fases

| Fase | Nombre | Duración estimada | Responsable principal | Estado |
|---|---|---|---|---|
| 1 | Descubrimiento y Análisis | 11–18 jul 2026 | HAT3X | En curso |
| 2 | Diseño, Configuración y White-label | 19–25 jul 2026 | HAT3X | Pendiente inicio |
| 3 | Implementación y Siembra de Datos | 26 jul – 8 ago 2026 | HAT3X | Pendiente inicio |
| 4 | Integración y Pruebas | 9–22 ago 2026 | HAT3X + De Nueve a Nueve | Pendiente inicio |
| 5 | Despliegue y Adopción | 23–31 ago 2026 | HAT3X + De Nueve a Nueve | Pendiente inicio |

> Las duraciones son estimadas desde el 11 de julio de 2026 y pueden ajustarse según el ritmo de aprobaciones y la coordinación de los pasos de infraestructura.

---

## Detalle de Fases

### Fase 1 — Descubrimiento y Análisis

**Objetivo:** Comprender en profundidad el estado actual de las dos sedes, sus servicios, su personal y sus horarios, y confirmar los requisitos del piloto.

**Tareas principales:**
- Revisión de la operativa actual de las dos sedes (agenda, clientes, caja)
- Entrevistas con usuarios clave de De Nueve a Nueve
- Análisis de restricciones técnicas: (1) la facturación real requiere validación previa del módulo Veri*factu por gestoría; (2) el registro de clientes por la app requiere el proveedor de SMS (Twilio) configurado; (3) los datos del salón quedan aislados por diseño, ningún otro salón puede verlos
- Recopilación de logo y colores del salón para el white-label

**Entregables:**
- Inventario validado de sedes, servicios (con el modelo de 3 fases), personal y horarios
- Listado de integraciones necesarias: Supabase (backend único), Twilio (SMS de verificación y recordatorios), Retell AI + n8n (recepcionista de voz — complemento)

**Dependencias del cliente:**
- Direcciones exactas de las dos sedes (Collado Villalba y Alpedrete)
- Disponibilidad de [POR CONFIRMAR] para entrevistas (estimado: 4h)
- Logo, colores y datos de servicios/personal/horarios

**Hito de cierre:** Validación escrita del inventario de datos por [POR CONFIRMAR]

---

### Fase 2 — Diseño, Configuración y White-label

**Objetivo:** Configurar la plataforma para De Nueve a Nueve y aplicar su identidad visual en panel y apps.

**Tareas principales:**
- Configuración de sedes, servicios (modelo de 3 fases), personal y horarios en el panel
- Aplicación de logo y colores del salón (white-label) en panel y apps, servidas por subdominio
- Definición del programa de fidelización (puntos, cupones de bienvenida, recompensas por hitos, carné con QR)
- Plan de pruebas del piloto

**Entregables:**
- Panel de configuración de De Nueve a Nueve listo
- Apps de marca blanca con la identidad del salón
- Programa de fidelización parametrizado

**Dependencias del cliente:**
- Aprobación de la identidad visual aplicada (estimado: 48h desde entrega)
- Confirmación de las reglas del programa de fidelización

**Hito de cierre:** Aprobación de la configuración y del white-label por [POR CONFIRMAR]

---

### Fase 3 — Implementación y Siembra de Datos

**Objetivo:** Sembrar los datos reales del salón y dejar la plataforma y las apps operativas en entorno de trabajo.

**Tareas principales:**
- Siembra de datos inicial ("hazlo por mí"): 2 sedes, 13 profesionales, 25 servicios con sus 3 fases y horarios ya cargados
- Publicación de la reserva online pública con la marca del salón
- Verificación del aislamiento de datos por salón (multi-tenant)
- Documentación técnica interna

**Entregables:**
- Plataforma Salón OS desplegada para De Nueve a Nueve (panel web).
- App de cliente de marca blanca (PWA instalable).
- App de personal de marca blanca (PWA instalable).
- Datos del salón sembrados (sedes, servicios, personal, horarios).
- Reserva online pública con la marca del salón.
- Documentación de uso y mantenimiento.
- Backend de recepcionista IA listo para activar (complemento).

**Dependencias del cliente:**
- Confirmación de los datos a sembrar (servicios, precios, personal, horarios)
- Validación de la reserva online antes de publicarla

**Hito de cierre:** Demo de la plataforma y las apps con los datos reales del salón

---

### Fase 4 — Integración y Pruebas

**Objetivo:** Conectar los pasos de infraestructura y verificar el comportamiento en condiciones reales antes del arranque.

**Tareas principales:**
- Configuración del proveedor de SMS (Twilio) para el registro con verificación por OTP y recordatorios
- Coordinación del despliegue en producción (dominio, hosting) y del correo
- Validación fiscal del módulo Veri*factu por la gestoría de De Nueve a Nueve (requisito para facturar en real)
- Pruebas funcionales de agenda, TPV, fidelización y apps

**Dependencias del cliente:**
- Acceso o decisión sobre dominio y hosting
- Validación del módulo Veri*factu por su gestoría (no facturar en real hasta el visto bueno)
- Participación en las pruebas de aceptación (estimado: 8h)

**Hito de cierre:** Acta de aceptación de pruebas firmada por [POR CONFIRMAR], con el módulo Veri*factu validado por gestoría

---

### Fase 5 — Despliegue y Adopción

**Objetivo:** Poner Salón OS en producción para De Nueve a Nueve y garantizar la adopción por el equipo.

**Tareas principales:**
- Despliegue en producción (go-live)
- Formación de arranque al equipo de las dos sedes
- Entrega de la documentación de uso y mantenimiento
- Soporte de arranque (primeras 2 semanas post-go-live)

**Dependencias del cliente:**
- Disponibilidad del equipo para la formación de arranque
- Comunicación interna del cambio a los profesionales

**Hito de cierre:** Go-live confirmado + 2 semanas de operación estable

---

## Hitos Clave y Entregables

| Hito | Entregable asociado | Responsable de aceptación | Fecha estimada |
|---|---|---|---|
| H1 — Inventario de datos validado | Inventario de sedes/servicios/personal/horarios | [POR CONFIRMAR] | 18 jul 2026 |
| H2 — Configuración y white-label aprobados | Panel + apps de marca blanca | [POR CONFIRMAR] | 25 jul 2026 |
| H3 — Demo con datos reales | Plataforma y apps sembradas | [POR CONFIRMAR] | 8 ago 2026 |
| H4 — Pruebas aceptadas + Veri*factu validado | Acta de aceptación | [POR CONFIRMAR] | 22 ago 2026 |
| H5 — Go-live | Sistema en producción | [POR CONFIRMAR] | 31 ago 2026 |

---

## Riesgos y Supuestos

### Riesgos identificados

1. **Veri*factu:** responsabilidad fiscal — no facturar en real hasta la validación de la gestoría.
2. **Costes variables del complemento de recepcionista** (minutos de voz, SMS) a acotar antes de activarlo.
3. **Dependencia de pasos de infraestructura** (despliegue, Twilio) previos al arranque real.

| Riesgo | Probabilidad | Impacto | Mitigación | Responsable |
|---|---|---|---|---|
| Facturar en real antes de la validación fiscal de Veri*factu | Media | Alto | No activar facturación real hasta el visto bueno de la gestoría del cliente | Compartido |
| Retraso en la configuración de Twilio (bloquea el registro por SMS) | Media | Medio | Coordinar el alta de Twilio en Fase 4 antes del go-live | HAT3X + [POR CONFIRMAR] |
| Costes variables del complemento de voz sin acotar | Baja | Medio | Acotar minutos y SMS estimados antes de activar la recepcionista IA | HAT3X |
| Retraso en la provisión de accesos/decisiones de infraestructura por el cliente | Media | Alto | Solicitar decisiones en kickoff con plazo de 5 días hábiles | [POR CONFIRMAR] |

### Supuestos del proyecto

- El equipo de De Nueve a Nueve estará disponible en los plazos indicados en cada fase.
- La siembra de datos parte de la información facilitada por el salón (2 sedes, 13 profesionales, 25 servicios).
- La facturación en real no se activa hasta la validación del módulo Veri*factu por gestoría.
- No hay migración de datos históricos de sistemas anteriores dentro de este alcance.

---

## Próximos Pasos Inmediatos

1. Kickoff oficial con Jose Miguel González Domingo y [POR CONFIRMAR] — Plazo: semana del 11 de julio de 2026
2. Confirmar direcciones de las dos sedes y datos a sembrar — Responsable: [POR CONFIRMAR] — Plazo: 5 días hábiles tras kickoff
3. Agendar la validación del módulo Veri*factu con la gestoría del salón — Responsable: De Nueve a Nueve

---

*Documento preparado por HAT3X para De Nueve a Nueve.*
*Fecha de emisión: 11 de julio de 2026*
*Las duraciones y fechas son estimaciones del piloto y pueden ajustarse en el seguimiento.*
