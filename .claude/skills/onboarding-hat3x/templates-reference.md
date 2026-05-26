# Templates Reference — onboarding-hat3x

Referencia completa de todas las plantillas del sistema. Usar este documento para entender el propósito, estructura y placeholders de cada plantilla antes de generarla.

---

## 01 — Carta de Bienvenida

**Archivo:** `01_carta_bienvenida.template.md`
**Es documento de cliente:** Sí
**Propósito:** Primera comunicación formal con el cliente. Confirma el inicio del proyecto, presenta el paquete de onboarding y establece los próximos pasos inmediatos.

**Secciones:**
1. Cabecera con fecha y destinatario
2. Párrafo de apertura: confirmación de inicio
3. Presentación breve del paquete de onboarding
4. Enfoque de trabajo HAT3X
5. Próximos pasos inmediatos (numerados)
6. Firma del responsable HAT3X

**Placeholders requeridos:**
`{{CLIENTE_NOMBRE}}`, `{{CLIENTE_CONTACTO}}`, `{{PROYECTO_NOMBRE}}`, `{{FECHA_INICIO}}`, `{{RESPONSABLE_HAT3X}}`, `{{SOPORTE_CONTACTO}}`

---

## 02 — Resumen Ejecutivo

**Archivo:** `02_resumen_ejecutivo.template.md`
**Es documento de cliente:** Sí
**Propósito:** Visión de alto nivel del proyecto para stakeholders que no participaron en la venta. Debe ser autosuficiente y legible en 2 minutos.

**Secciones:**
1. Contexto y oportunidad de negocio
2. Problema o reto identificado
3. Solución contratada (descripción técnica concisa)
4. Impacto esperado y métricas de éxito
5. Visión de ejecución (fases, plazos, equipo)

**Placeholders requeridos:**
`{{CLIENTE_NOMBRE}}`, `{{CLIENTE_SECTOR}}`, `{{PROYECTO_NOMBRE}}`, `{{PROYECTO_TIPO_SERVICIO}}`, `{{PROYECTO_DESCRIPCION}}`, `{{OBJETIVOS_NEGOCIO}}`, `{{ENTREGABLES}}`, `{{FECHA_INICIO}}`, `{{FECHA_FIN}}`, `{{RESPONSABLE_HAT3X}}`, `{{RESPONSABLE_CLIENTE}}`

---

## 03 — Roadmap del Proyecto

**Archivo:** `03_roadmap_proyecto.template.md`
**Es documento de cliente:** Sí
**Propósito:** Plan de ejecución detallado por fases. Define qué hace quién y cuándo. Es el documento operativo de referencia durante todo el proyecto.

**Secciones:**
1. Resumen de fases (tabla)
2. Detalle de cada fase: objetivo, tareas, entregables, responsable, duración
3. Dependencias del cliente
4. Hitos y criterios de aceptación
5. Riesgos y supuestos por fase
6. Próximos pasos inmediatos

**Placeholders requeridos:**
`{{CLIENTE_NOMBRE}}`, `{{PROYECTO_NOMBRE}}`, `{{FECHA_INICIO}}`, `{{FECHA_FIN}}`, `{{ENTREGABLES}}`, `{{STACK_HERRAMIENTAS}}`, `{{INTEGRACIONES}}`, `{{RESTRICCIONES}}`, `{{RIESGOS_CONOCIDOS}}`, `{{RESPONSABLE_HAT3X}}`, `{{RESPONSABLE_CLIENTE}}`

---

## 04 — Propuesta y Presupuesto

**Archivo:** `04_propuesta_presupuesto.template.md`
**Es documento de cliente:** Sí
**Propósito:** Documento comercial que detalla el alcance exacto, los entregables comprometidos, el precio y la forma de pago. Es la base del acuerdo económico.

**Secciones:**
1. Alcance incluido (lista detallada)
2. Alcance excluido (lista detallada)
3. Entregables comprometidos con formato y criterio de aceptación
4. Inversión total y desglose por hito
5. Forma de pago e hitos de facturación
6. Vigencia de la propuesta
7. Notas y condiciones adicionales

**Placeholders requeridos:**
`{{CLIENTE_NOMBRE}}`, `{{CLIENTE_NOMBRE_LEGAL}}`, `{{PROYECTO_NOMBRE}}`, `{{ALCANCE_INCLUIDO}}`, `{{ALCANCE_EXCLUIDO}}`, `{{ENTREGABLES}}`, `{{PRECIO}}`, `{{FORMA_PAGO}}`, `{{HITOS_FACTURACION}}`, `{{FECHA_INICIO}}`, `{{FECHA_FIN}}`, `{{RESPONSABLE_HAT3X}}`

---

## 05 — Contrato Base

**Archivo:** `05_contrato_base.template.md`
**Es documento de cliente:** Sí
**Propósito:** Borrador de contrato de prestación de servicios. SIEMPRE se presenta como borrador sujeto a revisión legal. No es un contrato válido hasta su firma y revisión por asesoría jurídica.

**Secciones:**
1. Identificación de las partes
2. Objeto del contrato
3. Alcance de los servicios
4. Obligaciones de HAT3X
5. Obligaciones del cliente
6. Plazos y entrega
7. Precio y condiciones de pago
8. Confidencialidad
9. Propiedad intelectual
10. Protección de datos
11. Limitación de responsabilidad
12. Cancelación y resolución
13. Jurisdicción y ley aplicable
14. Firmas

**Leyenda obligatoria (INAMOVIBLE):**
> **Borrador contractual sujeto a revisión legal final. Este documento no constituye un contrato válido hasta su firma por ambas partes y revisión por asesoría jurídica.**

**Placeholders requeridos:**
`{{CLIENTE_NOMBRE}}`, `{{CLIENTE_NOMBRE_LEGAL}}`, `{{CLIENTE_CONTACTO}}`, `{{CLIENTE_EMAIL}}`, `{{CLIENTE_TELEFONO}}`, `{{CLIENTE_DIRECCION}}`, `{{PROYECTO_NOMBRE}}`, `{{PROYECTO_DESCRIPCION}}`, `{{ALCANCE_INCLUIDO}}`, `{{ALCANCE_EXCLUIDO}}`, `{{ENTREGABLES}}`, `{{FECHA_INICIO}}`, `{{FECHA_FIN}}`, `{{PRECIO}}`, `{{FORMA_PAGO}}`, `{{HITOS_FACTURACION}}`, `{{JURISDICCION}}`, `{{CONFIDENCIALIDAD}}`, `{{PROPIEDAD_INTELECTUAL}}`, `{{RESPONSABLE_HAT3X}}`

---

## 06 — Guía del Portal del Cliente

**Archivo:** `06_guia_portal_cliente.template.md`
**Es documento de cliente:** Sí
**Propósito:** Manual de uso del portal del cliente. Explica cómo acceder, navegar, revisar el avance del proyecto, revisar entregables, dejar feedback y contactar con HAT3X.

**Secciones:**
1. Acceso al portal (URL y requisitos)
2. Primer inicio de sesión paso a paso
3. Navegación principal: secciones del portal
4. Cómo ver el avance del proyecto
5. Cómo revisar y aprobar entregables
6. Cómo dejar feedback
7. Cómo contactar con HAT3X desde el portal
8. Buenas prácticas de uso
9. Soporte y resolución de problemas

**Placeholders requeridos:**
`{{CLIENTE_NOMBRE}}`, `{{PORTAL_URL}}`, `{{PORTAL_USERNAME}}`, `{{PORTAL_ACTIVATION_METHOD}}`, `{{SOPORTE_CONTACTO}}`, `{{RESPONSABLE_HAT3X}}`

---

## 07 — Acceso al Portal del Cliente

**Archivo:** `07_acceso_portal_cliente.template.md`
**Es documento de cliente:** Sí
**Propósito:** Documento de credenciales y acceso. Contiene URL, usuario asignado, método de activación y recomendaciones de seguridad. Las contraseñas NUNCA se incluyen en texto plano.

**Secciones:**
1. URL del portal
2. Usuario asignado
3. Método de activación de la cuenta
4. Placeholder de contraseña temporal (con nota de provisión si aplica)
5. Recomendaciones de seguridad
6. Soporte para problemas de acceso

**Placeholders requeridos:**
`{{CLIENTE_NOMBRE}}`, `{{PORTAL_URL}}`, `{{PORTAL_USERNAME}}`, `{{PORTAL_ACTIVATION_METHOD}}`, `{{TEMP_PASSWORD_PLACEHOLDER}}`, `{{SOPORTE_CONTACTO}}`

**Regla crítica:** Si `portal_cliente.provisioned = false`, el documento debe incluir nota explícita: "Acceso pendiente de provisión. HAT3X os enviará las credenciales por canal seguro en [fecha estimada]."

---

## 08 — Checklist de Arranque Interno

**Archivo:** `08_checklist_arranque_interno.template.md`
**Es documento de cliente:** No (uso interno HAT3X)
**Propósito:** Lista de control para el equipo interno de HAT3X. Verifica que todos los elementos del onboarding están completados, el contrato firmado, el portal activo y el kickoff programado.

**Secciones:**
1. Validaciones previas al envío del paquete
2. Documentación emitida (lista de documentos)
3. Estado del contrato
4. Estado del portal del cliente
5. Kickoff y primeras reuniones
6. Responsables internos asignados
7. Bloqueos actuales
8. Siguiente acción inmediata

**Placeholders requeridos:**
`{{CLIENTE_NOMBRE}}`, `{{PROYECTO_NOMBRE}}`, `{{FECHA_INICIO}}`, `{{RESPONSABLE_HAT3X}}`, `{{RESPONSABLE_CLIENTE}}`, `{{PORTAL_URL}}`

---

## 09 — Índice del Paquete de Onboarding

**Archivo:** `09_indice_paquete_onboarding.template.md`
**Es documento de cliente:** Sí
**Propósito:** Primer documento que lee el cliente. Lista todos los documentos del paquete, su propósito y si requieren acción del cliente. Es el mapa de navegación del paquete.

**Secciones:**
1. Introducción breve
2. Tabla de documentos: número, nombre, descripción, acción requerida
3. Orden de lectura recomendado
4. Contacto para dudas

**Placeholders requeridos:**
`{{CLIENTE_NOMBRE}}`, `{{PROYECTO_NOMBRE}}`, `{{FECHA_INICIO}}`, `{{SOPORTE_CONTACTO}}`, `{{RESPONSABLE_HAT3X}}`

---

## Mapa de Placeholders

| Placeholder | Descripción | Documentos donde aparece |
|---|---|---|
| `{{CLIENTE_NOMBRE}}` | Nombre comercial del cliente | 01, 02, 03, 04, 05, 06, 07, 08, 09 |
| `{{CLIENTE_NOMBRE_LEGAL}}` | Razón social completa | 04, 05 |
| `{{CLIENTE_CONTACTO}}` | Nombre del contacto principal | 01, 05 |
| `{{CLIENTE_EMAIL}}` | Email del contacto | 05 |
| `{{CLIENTE_TELEFONO}}` | Teléfono del contacto | 05 |
| `{{CLIENTE_DIRECCION}}` | Dirección fiscal | 05 |
| `{{CLIENTE_SECTOR}}` | Sector de actividad | 02 |
| `{{PROYECTO_NOMBRE}}` | Nombre del proyecto | 01, 02, 03, 04, 05, 08, 09 |
| `{{PROYECTO_TIPO_SERVICIO}}` | Tipo de servicio contratado | 02 |
| `{{PROYECTO_DESCRIPCION}}` | Descripción técnica del proyecto | 02, 05 |
| `{{OBJETIVOS_NEGOCIO}}` | Objetivos de negocio a alcanzar | 02 |
| `{{ALCANCE_INCLUIDO}}` | Lista de lo que incluye el proyecto | 03, 04, 05 |
| `{{ALCANCE_EXCLUIDO}}` | Lista de lo que no incluye el proyecto | 04, 05 |
| `{{ENTREGABLES}}` | Lista de entregables comprometidos | 02, 03, 04, 05 |
| `{{STACK_HERRAMIENTAS}}` | Tecnologías y herramientas a usar | 03 |
| `{{INTEGRACIONES}}` | Sistemas a integrar | 03 |
| `{{RESTRICCIONES}}` | Restricciones técnicas u operativas | 03 |
| `{{RIESGOS_CONOCIDOS}}` | Riesgos identificados en el proyecto | 03 |
| `{{FECHA_INICIO}}` | Fecha de inicio del proyecto | 01, 02, 03, 04, 05, 08, 09 |
| `{{FECHA_FIN}}` | Fecha de fin estimada | 02, 03, 04, 05 |
| `{{PRECIO}}` | Precio total del proyecto | 04, 05 |
| `{{FORMA_PAGO}}` | Condiciones de pago | 04, 05 |
| `{{HITOS_FACTURACION}}` | Hitos vinculados a facturación | 04, 05 |
| `{{JURISDICCION}}` | Jurisdicción legal aplicable | 05 |
| `{{CONFIDENCIALIDAD}}` | Términos de confidencialidad | 05 |
| `{{PROPIEDAD_INTELECTUAL}}` | Cláusula de propiedad intelectual | 05 |
| `{{PORTAL_URL}}` | URL del portal del cliente | 06, 07, 08 |
| `{{PORTAL_USERNAME}}` | Usuario asignado al cliente | 06, 07 |
| `{{PORTAL_ACTIVATION_METHOD}}` | Método de activación de cuenta | 06, 07 |
| `{{TEMP_PASSWORD_PLACEHOLDER}}` | Placeholder contraseña temporal | 07 |
| `{{SOPORTE_CONTACTO}}` | Email/teléfono de soporte HAT3X | 01, 06, 07, 09 |
| `{{RESPONSABLE_HAT3X}}` | Nombre del responsable de proyecto en HAT3X | 01, 02, 03, 04, 08, 09 |
| `{{RESPONSABLE_CLIENTE}}` | Nombre del responsable de proyecto en cliente | 02, 03, 08 |
