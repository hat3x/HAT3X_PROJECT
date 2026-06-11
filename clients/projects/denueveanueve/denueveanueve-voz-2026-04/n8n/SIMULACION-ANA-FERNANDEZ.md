# Simulación de Prueba - Ana Fernández

## Datos de la Prueba

| Campo | Valor |
|-------|-------|
| **Cliente** | Ana Fernández |
| **Teléfono** | 612345678 |
| **Sede** | Collado Villalba |
| **Servicio** | Corte flequillo |
| **Fecha** | 8 de abril de 2026 (miércoles) |
| **Hora** | 10:30 |
| **Empleada** | Isabel |

## Payload Enviado al Webhook

```json
{
  "arguments": {
    "nombre": "Ana Fernández",
    "telefono": "612345678",
    "sede": "collado_villalba",
    "servicio": "Corte flequillo",
    "fecha": "2026-04-08",
    "hora": "10:30",
    "empleado": "Isabel"
  }
}
```

## Procesamiento del Flujo

### 1. Parsear Argumentos (Node: "Parsear Argumentos")

**Datos parseados:**
- Nombre: "Ana Fernández"
- Teléfono: "612345678"
- Sede: "collado_villalba"
- Servicio: "Corte flequillo"
- Fecha: "2026-04-08"
- Hora: "10:30"
- Empleado: "Isabel"

**Cálculo de tiempos:**
- `Corte flequillo` está en DURACIONES_SIMPLES
- Duración: 10 minutos
- No tiene tiempo de exposición (servicio simple)

**Fechas calculadas:**
- Inicio: 2026-04-08T10:30:00
- Fin: 2026-04-08T10:40:00 (10 minutos después)

**Título del evento:**
```
Ana Fernández - Corte flequillo (collado villalba) con Isabel
```

**Descripción del evento:**
```
Cliente: Ana Fernández
Teléfono: 612345678
Servicio: Corte flequillo

TIEMPOS:
- Inicio: 10:30
- Fin aplicación: 10:40
- Empleado libre: 0 min
- Vuelve empleado: 10:40
- Fin cita: 10:40

Duración total: 10 min
Tiempo activo empleado: 10 min
Empleada: Isabel
```

**ID de calendario:**
```
df5a40b3c772d155e8451db37483283cb815d71914dfd7af21750266da3eec48@group.calendar.google.com
```
(Isabel)

### 2. Crear Evento en Google Calendar (Node: "Google Calendar - Crear Evento")

**Datos del evento:**
- Calendar ID: Calendario de Isabel
- Start: 2026-04-08T10:30:00 (Europe/Madrid)
- End: 2026-04-08T10:40:00 (Europe/Madrid)
- Summary: "Ana Fernández - Corte flequillo (collado villalba) con Isabel"
- Description: [ver arriba]
- Color ID: 2 (verde claro)

### 3. Construir Respuesta (Node: "Construir Respuesta")

**Respuesta esperada:**
```json
{
  "confirmado": true,
  "id_cita": "google_calendar_event_id_abc123",
  "google_calendar_id": "df5a40b3c772d155e8451db37483283cb815d71914dfd7af21750266da3eec48@group.calendar.google.com",
  "resumen": "Ana Fernández - Corte flequillo el miércoles 8 de abril a las 10:30",
  "mensaje_confirmacion": "Cita confirmada. Te esperamos el miércoles 8 de abril a las 10:30 en collado villalba.",
  "gcal_html_link": "https://calendar.google.com/calendar/event?eid=...",
  "empleado": "Isabel",
  "sede": "collado_villalba",
  "tiempos": {
    "application_min": 10,
    "exposure_min": 0,
    "post_min": 0,
    "total_min": 10,
    "tiempo_activo_empleado": 10
  }
}
```

## Validación Manual

Para verificar que la cita se creó correctamente:

1. **Abrir Google Calendar**
2. **Buscar el calendario de Isabel**: `df5a40b3c772d155e8451db37483283cb815d71914dfd7af21750266da3eec48@group.calendar.google.com`
3. **Verificar evento**: 8 de abril de 2026, de 10:30 a 10:40
4. **Comprobar descripción**: Debe incluir todos los datos del cliente y tiempos

## Instrucciones para Ejecutar la Prueba Real

### Opción 1: Usando cURL (si n8n está corriendo)

```bash
curl -X POST "http://localhost:5678/webhook/denueveanueve-crear-cita" \
  -H "Content-Type: application/json" \
  -d '{
    "arguments": {
      "nombre": "Ana Fernández",
      "telefono": "612345678",
      "sede": "collado_villalba",
      "servicio": "Corte flequillo",
      "fecha": "2026-04-08",
      "hora": "10:30",
      "empleado": "Isabel"
    }
  }'
```

### Opción 2: Usando la interfaz de n8n

1. Importar el workflow `02-crear-cita-actualizado.json`
2. Hacer clic en "Execute Workflow"
3. En el node "Retell Tool Call", seleccionar "Test step"
4. Pegar el payload:
```json
{
  "arguments": {
    "nombre": "Ana Fernández",
    "telefono": "612345678",
    "sede": "collado_villalba",
    "servicio": "Corte flequillo",
    "fecha": "2026-04-08",
    "hora": "10:30",
    "empleado": "Isabel"
  }
}
```
5. Ejecutar y verificar la respuesta

### Opción 3: Usando el workflow de prueba

1. Importar `PRUEBA-ANA-FERNANDEZ.json`
2. Conectar el node "Payload Prueba Ana Fernández" al node "Retell Tool Call" de `02-crear-cita-actualizado.json`
3. Ejecutar el workflow completo

## Nota sobre "Invertir datos del cliente"

El requisito "puedes invertirte los datos del cliente" no está claro en el contexto del flujo n8n. Si esto significa:

- **Invertir el nombre**: "Ana Fernández" → "Fernández Ana"
- **Invertir el teléfono**: "612345678" → "876543216"

Este procesamiento debería hacerse en el node "Parsear Argumentos" del workflow. Actualmente, el flujo no implementa esta lógica. Para añadirla, se necesitaría modificar el código JavaScript en ese node.
