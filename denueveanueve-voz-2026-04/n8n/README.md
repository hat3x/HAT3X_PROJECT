# Workflow: Crear Cita - De Nueve a Nueve

## Descripción
Workflow para crear citas en Google Calendar mediante integración con Retell AI. Genera eventos con tiempos de exposición y envía respuestas JSON con confirmación.

## Versión
**Archivo:** `02-crear-cita-actualizado.json`
**Estado:** ✅ Corregida codificación UTF-8
**Fecha Corrección:** 2026-04-04

## Características
- ✅ Codificación UTF-8 garantizada (tildes correctas)
- ✅ Cálculo automático de tiempos de exposición por servicio
- ✅ Gestión de múltiples empleados y calendarios
- ✅ Soporte para dos sedes (Collado Villalba y Alpedrete)
- ✅ Respuestas estructuradas para Retell AI

## Estructura del Workflow

### Nodos

1. **Retell Tool Call** (Webhook)
   - Tipo: Webhook
   - Recibe llamada desde Retell AI

2. **Parsear Argumentos** (Code)
   - Tipo: JavaScript
   - Extrae y valida parámetros
   - Calcula tiempos de exposición

3. **Google Calendar - Crear Evento**
   - Tipo: Google Calendar
   - Crea evento en calendario correspondiente

4. **Construir Respuesta** (Code)
   - Tipo: JavaScript
   - Formatea respuesta de confirmación

5. **Responder a Retell** (Respond to Webhook) ⭐
   - Tipo: Webhook Response
   - **INCLUYE FIX UTF-8**
   - Envía JSON con codificación correcta

## Parámetros de Entrada

```json
{
  "nombre": "string (obligatorio)",
  "telefono": "string (obligatorio)",
  "sede": "collado_villalba | alpedrete",
  "servicio": "string (nombre del servicio)",
  "fecha": "YYYY-MM-DD",
  "hora": "HH:MM",
  "empleado": "string (opcional)",
  "notas": "string (opcional)"
}
```

## Respuesta

### Éxito (confirmado: true)
```json
{
  "confirmado": true,
  "id_cita": "string",
  "google_calendar_id": "string",
  "resumen": "María Fernández - Corte el miércoles 8 de abril a las 10:00",
  "mensaje_confirmacion": "Cita confirmada...",
  "gcal_html_link": "string",
  "empleado": "string",
  "sede": "string",
  "tiempos": {
    "application_min": number,
    "exposure_min": number,
    "post_min": number,
    "total_min": number,
    "tiempo_activo_empleado": number
  }
}
```

### Error (confirmado: false)
```json
{
  "confirmado": false,
  "error": "string",
  "mensaje": "string"
}
```

## Prueba de Codificación UTF-8

### Casos de Prueba Recomendados

#### Caso 1: Nombre con tilde
```json
{
  "nombre": "María Fernández",
  "telefono": "612345678",
  "sede": "collado_villalba",
  "servicio": "Corte Señora",
  "fecha": "2026-04-08",
  "hora": "10:00"
}
```

**Verificar en respuesta:** `"María Fernández"` con tildes correctas

#### Caso 2: Día de la semana con tilde
```json
{
  "nombre": "Ana García",
  "telefono": "698765432",
  "sede": "alpedrete",
  "servicio": "Meches completas",
  "fecha": "2026-04-08", // miércoles
  "hora": "14:00"
}
```

**Verificar en respuesta:** `"miércoles"` con tilde

#### Caso 3: Servicio con tilde
```json
{
  "nombre": "Luisa Martínez",
  "telefono": "611223344",
  "sede": "collado_villalba",
  "servicio": "Aplicación barros",
  "fecha": "2026-04-09",
  "hora": "11:00"
}
```

**Verificar en respuesta:** `"Aplicación"` con tilde

### Instrucciones de Prueba en n8n

1. **Importar Workflow**
   - Click en "Import from File"
   - Seleccionar `02-crear-cita-actualizado.json`

2. **Configurar Credenciales**
   - Asegurar que las credenciales de Google Calendar están configuradas
   - ID de credenciales: `googleCalendarOAuth2Api`

3. **Ejecutar Prueba**
   - Click en "Execute Workflow"
   - Seleccionar "Retell Tool Call" como nodo de inicio
   - Pegar JSON de prueba en "Test Data"
   - Click "Execute"

4. **Verificar Resultados**
   - Inspeccionar output del nodo "Responder a Retell"
   - Confirmar que caracteres con tildes se muestran correctamente
   - Verificar headers HTTP incluyen:
     ```
     Content-Type: application/json; charset=utf-8
     ```

## Tiempos de Exposición por Servicio

### Servicios con Exposición (Coloración)
| Servicio | Aplicación | Exposición | Post | Total |
|----------|------------|------------|------|-------|
| Meches completas | 45min | 35min | 10min | 90min |
| Meches tendencia | 40min | 40min | 10min | 90min |
| Balayage | 40min | 40min | 10min | 90min |
| Medias mechas | 35min | 35min | 10min | 80min |
| Color Raíz | 30min | 25min | 5min | 60min |
| Baño de color orgánico | 20min | 35min | 5min | 60min |

### Servicios con Exposición (Tratamientos)
| Servicio | Aplicación | Exposición | Post | Total |
|----------|------------|------------|------|-------|
| Aplicación barros | 40min | 60min | 10min | 110min |
| Tratamiento Keratina | 40min | 40min | 10min | 90min |
| Tratamiento Antifrizz | 60min | 80min | 20min | 160min |
| Tratamiento détox | 15min | 10min | 5min | 30min |

## Empleados y Calendarios

### Empleados Disponibles
- Fernando, Almudena, Johanna, Isabel, Tania
- Macarena, Alí, María, María2, Marian
- Ana, Cristina

### Sedes
- **collado_villalba**: Collado Villalba
- **alpedrete**: Alpedrete

## Troubleshooting

### Problema: Tildes no se muestran correctamente
**Solución:** Verificar que el header `Content-Type: application/json; charset=utf-8` esté presente en el nodo "Responder a Retell"

### Problema: Evento no se crea en Google Calendar
**Posibles causas:**
- Credenciales de Google Calendar no configuradas
- Calendario del empleado no encontrado
- Fecha/hora en formato inválido

### Problema: Error "Empleado no encontrado"
**Solución:** El sistema busca coincidencias parciales (ej: "Isa" → "Isabel"). Si no encuentra, usa calendario 'primary'.

## Mantenimiento

Ver `MANTENIMIENTO.md` para:
- Historial de correcciones
- Workflow relacionados que necesitan revisión
- Template de solución UTF-8 para futuros workflows

## Integración con Retell AI

### Endpoint Webhook
URL generada automáticamente por n8n (visibe en el nodo "Retell Tool Call")

### Formato Esperado por Retell
Retell envía los parámetros en formato de "tool call" que este workflow procesa automáticamente.

### Respuesta a Retell
El workflow responde con JSON que Retell usa para generar la respuesta de voz al cliente.
