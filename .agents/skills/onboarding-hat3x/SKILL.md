# Skill: onboarding-hat3x

**Invocación:** `/onboarding-hat3x`

**Propósito:** Generar un paquete de onboarding completo para un cliente nuevo de HAT3X. Produce todos los documentos necesarios para iniciar una relación profesional: carta de bienvenida, resumen ejecutivo, roadmap, propuesta, contrato borrador, guía de portal y checklist interno.

---

## Trigger

Este skill se activa cuando el usuario escribe `/onboarding-hat3x` seguido de un bloque JSON con los datos del cliente.

```
/onboarding-hat3x

INPUT:
{
  "cliente": { ... },
  "proyecto": { ... },
  "comercial": { ... },
  "legal": { ... },
  "portal_cliente": { ... },
  "branding": { ... }
}
```

---

## Flujo Completo Paso a Paso

### Paso 1 — Leer contexto de marca
- Leer `AGENTS.md` para contexto general del sistema
- Leer `branding/brand-guidelines.md` para identidad verbal
- Leer `branding/tone-of-voice.md` para reglas de redacción
- Estos documentos definen el tono que deben tener TODOS los entregables de cliente

### Paso 2 — Leer plantillas disponibles
- Leer `onboarding/templates/manifest.json` para conocer la lista completa de plantillas
- Verificar que cada archivo listado en el manifest existe físicamente
- Si alguna plantilla falta → activar **Bootstrap Mode**

### Paso 3 — Validar input JSON
- Contrastar el input contra `onboarding/schema/onboarding_input.schema.json`
- Campos required faltantes → registrar en `MISSING_DATA`, usar `{{PENDIENTE_CONFIRMAR}}`
- Contradicciones de datos (fechas inversas, precios negativos) → PARAR y reportar
- Datos coherentes pero incompletos → continuar con placeholder visible

### Paso 4 — Bootstrap Mode (si aplica)
- Si las plantillas base no existen en `onboarding/templates/`
- Crearlas desde las especificaciones documentadas en `templates-reference.md`
- Crear también `manifest.json` si no existe
- Registrar en STATUS que se ejecutó bootstrap

### Paso 5 — Determinar destino de los archivos
- `CLIENT_SLUG`: usar `cliente.nombre_slug` del input, o derivarlo normalizando `cliente.nombre` (minúsculas, guiones, sin tildes)
- `YYYY-MM`: mes y año de `comercial.fecha_inicio` o fecha actual si no se provee
- Ruta base: `onboarding/clients/{CLIENT_SLUG}/{YYYY-MM}/`

### Paso 6 — Generar documentos
Para cada plantilla del manifest (en orden):
1. Leer la plantilla base desde `onboarding/templates/`
2. Sustituir cada `{{PLACEHOLDER}}` con el valor correspondiente del input
3. Placeholders sin valor en input → `{{PENDIENTE_CONFIRMAR}}` + registro en MISSING_DATA
4. Placeholders de portal con `provisioned: false` → mantener placeholder + nota de pendiente
5. Escribir el documento generado en la carpeta del cliente
6. Verificar escritura correcta

### Paso 7 — Generar metadata
Crear `onboarding/clients/{CLIENT_SLUG}/{YYYY-MM}/00_metadata.json`:
```json
{
  "generated_at": "ISO timestamp",
  "generated_by": "onboarding-hat3x skill",
  "client_slug": "...",
  "client_name": "...",
  "project_name": "...",
  "templates_used": ["01_carta_bienvenida", "..."],
  "missing_data": [],
  "assumptions": [],
  "portal_provisioned": false
}
```

### Paso 8 — Devolver STATUS

```
STATUS: COMPLETE | PARTIAL | BLOCKED

FILES_CREATED:
- [lista de rutas absolutas de archivos generados]

ASSUMPTIONS:
- [lista de supuestos tomados]

MISSING_DATA:
- [lista de campos pendientes con acción recomendada]

NEXT_STEP:
[Instrucción clara: qué revisar, qué completar, cómo enviar al cliente]
```

---

## Reglas de Negocio Críticas

| Regla | Descripción |
|---|---|
| No alterar plantillas base | Los archivos en `onboarding/templates/` son inmutables durante la ejecución |
| Contrato siempre como borrador | La leyenda legal del `05_contrato_base` es obligatoria e inamovible |
| Portal sin contraseñas reales | Si `portal_cliente.provisioned = false`, usar placeholder + nota explicativa |
| Consistencia total | Precio, nombre cliente, fechas y alcance deben ser idénticos en todos los documentos |
| Tono HAT3X | Todos los documentos de cliente siguen las reglas de `branding/` |
| Sin Lorem Ipsum | Nunca usar contenido de relleno. Si no hay datos, usar placeholder visible |

---

## Archivos de Referencia

| Archivo | Propósito |
|---|---|
| `checklist.md` | Checklist operativo de cada ejecución |
| `templates-reference.md` | Referencia detallada de cada plantilla |
| `examples/output-example.md` | Ejemplo de STATUS de salida |
| `onboarding/schema/onboarding_input.schema.json` | Schema de validación del input |
| `onboarding/examples/input-demo.json` | Ejemplo de input completo |
