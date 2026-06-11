# Checklist Operativo — Skill onboarding-hat3x

Este checklist debe completarse en cada ejecución del skill. Marca cada ítem antes de devolver el STATUS final.

---

## Fase 0 — Preparación

- [ ] CLAUDE.md leído y contexto del sistema comprendido
- [ ] `branding/brand-guidelines.md` leído
- [ ] `branding/tone-of-voice.md` leído
- [ ] `onboarding/templates/manifest.json` leído
- [ ] Todas las plantillas listadas en manifest verificadas como existentes
  - Si alguna falta → Bootstrap Mode activado y documentado en STATUS

---

## Fase 1 — Validación del Input

- [ ] Input JSON recibido y parseado sin errores de sintaxis
- [ ] Campo `cliente.nombre` presente y no vacío
- [ ] Campo `cliente.nombre_slug` presente o derivado automáticamente
- [ ] Campo `proyecto.nombre` presente y no vacío
- [ ] Campo `proyecto.tipo_servicio` presente
- [ ] Campo `comercial.precio` presente (o registrado en MISSING_DATA)
- [ ] Campo `comercial.fecha_inicio` presente y en formato ISO
- [ ] Campo `comercial.fecha_fin` presente, posterior a `fecha_inicio`
- [ ] Campo `legal.jurisdiccion` presente (o registrado en MISSING_DATA)
- [ ] Campo `portal_cliente.provisioned` presente (boolean explícito)
- [ ] Sin contradicciones detectadas en el input
  - Si las hay → BLOQUEADO, reportar antes de continuar

---

## Fase 2 — Creación de Estructura

- [ ] CLIENT_SLUG determinado correctamente
- [ ] YYYY-MM determinado correctamente
- [ ] Carpeta `/onboarding/clients/{CLIENT_SLUG}/{YYYY-MM}/` creada
- [ ] Ruta verificada antes de escribir archivos

---

## Fase 3 — Generación de Documentos

Para cada documento, verificar:

### 01 — Carta de Bienvenida
- [ ] Generado en carpeta de cliente
- [ ] Tono cálido-profesional aplicado
- [ ] Sin placeholders sin resolver (o registrados en MISSING_DATA)
- [ ] Firma del responsable HAT3X incluida

### 02 — Resumen Ejecutivo
- [ ] Generado en carpeta de cliente
- [ ] Objetivo de negocio claramente expresado
- [ ] Sin adjetivos vacíos ni hipérbole

### 03 — Roadmap del Proyecto
- [ ] Generado en carpeta de cliente
- [ ] Fases con duración, objetivo, entregable y responsable
- [ ] Dependencias del cliente declaradas explícitamente
- [ ] Riesgos incluidos

### 04 — Propuesta y Presupuesto
- [ ] Generado en carpeta de cliente
- [ ] Precio correcto (coincide con `comercial.precio` del input)
- [ ] Exclusiones explícitas incluidas
- [ ] Vigencia de propuesta incluida

### 05 — Contrato Base
- [ ] Generado en carpeta de cliente
- [ ] **LEYENDA DE BORRADOR PRESENTE** (verificación crítica)
- [ ] Datos de ambas partes correctos
- [ ] Sin cláusulas inventadas fuera de la plantilla base

### 06 — Guía del Portal
- [ ] Generado en carpeta de cliente
- [ ] Tono didáctico y paso a paso
- [ ] Referencia al portal coherente con estado de provisión

### 07 — Acceso al Portal
- [ ] Generado en carpeta de cliente
- [ ] Si `portal_cliente.provisioned = false` → nota de pendiente visible
- [ ] **NINGUNA CONTRASEÑA SIMULADA** (verificación crítica)
- [ ] Placeholder de contraseña temporal usa `{{TEMP_PASSWORD_PLACEHOLDER}}`

### 08 — Checklist Interno
- [ ] Generado en carpeta de cliente
- [ ] Estado de cada ítem refleja situación real del paquete
- [ ] Marcado como documento interno (no enviar al cliente)

### 09 — Índice del Paquete
- [ ] Generado en carpeta de cliente
- [ ] Lista todos los documentos generados
- [ ] Indica para cada uno si requiere acción del cliente

---

## Fase 4 — Metadata y Cierre

- [ ] `00_metadata.json` generado en carpeta de cliente
- [ ] `metadata.json` es JSON válido
- [ ] `generated_at` con timestamp ISO correcto
- [ ] `missing_data` lista todos los campos pendientes
- [ ] `assumptions` lista todos los supuestos tomados

---

## Fase 5 — Verificación Final de Calidad

- [ ] Nombre del cliente idéntico en todos los documentos generados
- [ ] Precio idéntico en todos los documentos donde aparece
- [ ] Fechas coherentes entre documentos
- [ ] Nombre del proyecto idéntico en todos los documentos
- [ ] Nombre del responsable HAT3X idéntico en todos los documentos
- [ ] Tono HAT3X aplicado en todos los documentos de cliente
- [ ] Sin secciones vacías ni Lorem Ipsum en ningún documento

---

## Fase 6 — STATUS Final

- [ ] STATUS determinado: COMPLETE / PARTIAL / BLOCKED
- [ ] FILES_CREATED lista todos los archivos creados con ruta completa
- [ ] ASSUMPTIONS documenta todos los supuestos
- [ ] MISSING_DATA documenta todos los campos pendientes
- [ ] NEXT_STEP es accionable y específico

---

## Notas de Escalada

**Si STATUS = BLOCKED:**
- Reportar exactamente qué dato o contradicción impide continuar
- No generar documentos parciales que puedan confundir
- Esperar input corregido antes de reiniciar

**Si STATUS = PARTIAL:**
- Los documentos generados son válidos y entregables
- MISSING_DATA indica qué completar antes de enviar al cliente
- El contrato NO debe enviarse hasta que MISSING_DATA esté vacío o con solo campos opcionales
