# Test de Flujo — Crear Cita con Tiempo de Exposición

## Datos de la prueba

| Campo | Valor |
|-------|-------|
| **Cliente** | María López |
| **Teléfono** | 655 123 456 |
| **Sede** | Collado Villalba |
| **Servicio** | Mechas completas |
| **Fecha** | 2026-04-10 (viernes) |
| **Hora** | 10:00 |
| **Empleada** | Isabel |

> **IMPORTANTE:** El campo `empleado` debe contener el nombre de la **empleada**, NO el nombre del cliente. Si el cliente dice "quiero cita con Isa", la IA debe interpretar que "Isa" = "Isabel" y enviar `empleado: "Isabel"`.

---

## Tiempos del servicio (Meches completas)

| Concepto | Minutos |
|----------|---------|
| **Aplicación** | 45 min |
| **Exposición** (empleada libre) | 35 min |
| **Post-exposición** | 10 min |
| **TOTAL** | 90 min |

**Tiempo activo de la empleada:** 55 min (45 + 10)
**Tiempo libre durante exposición:** 35 min (puede coger otra cita)

---

## Timeline de la cita

```
10:00 ──────────────── 10:45 ────────────────────────── 11:20 ───── 11:30
│                      │                                │             │
└─ Aplicación (45min) ─┘ └─ Exposición (35min libre) ───┘ └─ Post ───┘

Empleada trabaja: 10:00-10:45 y 11:20-11:30
Empleada libre: 10:45-11:20 (puede coger un corte de 30min, por ejemplo)
```

---

## Payload para verificar_disponibilidad

```json
{
  "arguments": {
    "sede": "collado_villalba",
    "servicio": "Meches completas",
    "fecha": "2026-04-10",
    "hora": "10:00",
    "empleado": "Isabel"
  }
}
```

### Respuesta esperada (si hay hueco)

```json
{
  "disponible": true,
  "fecha": "2026-04-10",
  "hora": "10:00",
  "horaFin": "11:30",
  "servicio": "Meches completas",
  "sede": "collado_villalba",
  "empleados_libres": 1,
  "empleados_consultados": ["Fernando", "Almudena", "Johanna", "Isabel", "Tania", "Macarena", "Alí", "María", "Marian"],
  "staff_app_usada": true,
  "mensaje": "Hay disponibilidad el viernes 10 de abril a las 10:00 en collado_villalba",
  "tiempos_servicio": {
    "application_min": 45,
    "exposure_min": 35,
    "post_min": 10,
    "total_min": 90,
    "tiempo_activo_empleado": 55
  }
}
```

---

## Payload para crear_cita

```json
{
  "arguments": {
    "nombre": "Isa García",
    "telefono": "655 123 456",
    "sede": "collado_villalba",
    "servicio": "Meches completas",
    "fecha": "2026-04-10",
    "hora": "10:00",
    "empleado": "Isabel"
  }
}
```

### Respuesta esperada (éxito)

```json
{
  "confirmado": true,
  "id_cita": "google_calendar_event_id_abc123",
  "google_calendar_id": "df5a40b3c772d155e8451db37483283cb815d71914dfd7af21750266da3eec48@group.calendar.google.com",
  "resumen": "Isa García - Mechas completas el viernes 10 de abril a las 10:00",
  "mensaje_confirmacion": "Cita confirmada. Te esperamos el viernes 10 de abril a las 10:00 en collado_villalba. La cita dura 90 minutos, con tiempo de procesamiento incluido.",
  "gcal_html_link": "https://calendar.google.com/calendar/event?eid=...",
  "empleado": "Isabel",
  "sede": "collado_villalba",
  "tiempos": {
    "application_min": 45,
    "exposure_min": 35,
    "post_min": 10,
    "total_min": 90,
    "tiempo_activo_empleado": 55
  }
}
```

---

## Evento en Google Calendar

### Datos del evento creado

| Campo | Valor |
|-------|-------|
| **Summary** | `Isa García - Mechas completas (collado_villalba) con Isabel` |
| **Start** | `2026-04-10T10:00:00+02:00` |
| **End** | `2026-04-10T11:30:00+02:00` |
| **Description** | Ver abajo |

### Descripción del evento

```
Cliente: Isa García
Teléfono: 655 123 456
Servicio: Mechas completas

TIEMPOS:
- Inicio: 10:00
- Fin aplicación: 10:45
- Empleado libre: 35 min
- Vuelve empleado: 11:20
- Fin cita: 11:30

Duración total: 90 min
Tiempo activo empleado: 55 min
Empleada: Isabel
```

---

## Flujo de conversación simulado (Noa ↔ Cliente)

```
Noa: "¡Hola! Soy Noa, de De Nueve a Nueve. ¿En qué puedo ayudarte hoy?"

Cliente: "Hola, quiero pedir cita para mechas completas"

Noa: "Perfecto. ¿Prefieres venir a Collado Villalba o a Alpedrete?"

Cliente: "Collado Villalba"

Noa: "¿Qué día y hora te viene bien?"

Cliente: "El viernes 10 por la mañana, lo antes posible"

Noa: [calcula: viernes 10 de abril de 2026]
Noa: [llama a verificar_disponibilidad para Mechas completas]
Noa: "Tengo hueco a las 10:00 con Isabel. La cita dura 90 minutos. ¿Te va bien?"

Cliente: "Sí, perfecto"

Noa: "Perfecto. Para confirmar, ¿me das tu nombre completo y teléfono?"

Cliente: "Isa García, 655 123 456"

Noa: "Entonces te apunto el viernes 10 de abril a las 10:00 para mechas completas en Collado Villalba con Isabel, a nombre de Isa García, teléfono 655 123 456. La cita durará aproximadamente 1 hora y 30 minutos. ¿Es correcto?"

Cliente: "Sí"

Noa: [llama a crear_cita]
Noa: "¡Perfecto! Tu cita está confirmada para el viernes 10 de abril a las 10:00 en Collado Villalba. La cita incluye tiempo de procesamiento, así que estarás cómoda sin prisas. ¿Necesitas algo más?"

Cliente: "No, nada más. Gracias"

Noa: "¡Genial! Te esperamos. ¡Hasta pronto!"
```

---

## Cómo ejecutar el test

### Paso 1 — Verificar disponibilidad

```bash
# En n8n, ejecutar el workflow 01-verificar-disponibilidad con este payload:
{
  "arguments": {
    "sede": "collado_villalba",
    "servicio": "Meches completas",
    "fecha": "2026-04-10",
    "hora": "10:00"
  }
}
```

### Paso 2 — Crear cita

```bash
# En n8n, ejecutar el workflow 02-crear-cita-actualizado con este payload:
{
  "arguments": {
    "nombre": "Isa García",
    "telefono": "655 123 456",
    "sede": "collado_villalba",
    "servicio": "Meches completas",
    "fecha": "2026-04-10",
    "hora": "10:00",
    "empleado": "Isabel"
  }
}
```

### Paso 3 — Verificar en Google Calendar

1. Abrir Google Calendar
2. Buscar el calendario de Isabel: `df5a40b3c772d155e8451db37483283cb815d71914dfd7af21750266da3eec48@group.calendar.google.com`
3. Verificar evento el 2026-04-10 de 10:00 a 11:30
4. Comprobar que la descripción incluye los tiempos de exposición

---

## Validación de tiempos de exposición

Después de crear la cita, el calendario de Isabel debería mostrar:

- **10:00 - 10:45**: Ocupado (aplicación de mechas)
- **10:45 - 11:20**: **LIBRE** (exposición — puede coger otra cita de 30-35 min)
- **11:20 - 11:30**: Ocupado (post-exposición / acabado)

**Prueba de solapamiento:**
Intentar crear otra cita para Isabel de 10:45 a 11:15 (durante la exposición). Debería ser **posible** porque la empleada está libre.

---

## Notas importantes

1. El workflow actualizado (`02-crear-cita-actualizado.json`) incluye los tiempos de exposición en la descripción del evento, pero **el evento en Google Calendar ocupa todo el bloque** (10:00-11:30).

2. Para que el solapamiento funcione realmente, se necesita:
   - O bien: Un sistema de "bloques internos" dentro del evento (no soportado nativamente por Google Calendar)
   - O bien: Consultar la descripción del evento antes de crear otra cita para verificar los tiempos de exposición

3. La implementación recomendada es:
   - En `verificar_disponibilidad`, leer la descripción de eventos existentes
   - Parsear los tiempos de exposición
   - Calcular si hay hueco real considerando el tiempo activo del empleado
