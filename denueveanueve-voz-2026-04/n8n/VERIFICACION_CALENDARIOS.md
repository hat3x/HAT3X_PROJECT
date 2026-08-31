# Verificación — Citas guardadas en calendario correcto

## Mapeo de empleados a calendarios Google

### Collado Villalba

| Empleado | Nombre normalizado | Calendar ID |
|----------|-------------------|-------------|
| Fernando | `fernando` | `06136cb5016a75da20e0292649097ca53d818c3145984831dda2d02311d929f4@group.calendar.google.com` |
| Almudena | `almudena` | `aade57f8bb3504fdc3582de697f8892c71817b94a2e32cebf8a891d8a1d48c2b@group.calendar.google.com` |
| Johanna | `johanna` | `c35d85ddf7afa97e4edb360ef99552b6289a2d95e9b939745bff7505557b73e2@group.calendar.google.com` |
| **Isabel** | **`isabel`** | **`df5a40b3c772d155e8451db37483283cb815d71914dfd7af21750266da3eec48@group.calendar.google.com`** |
| Tania | `tania` | `3e70700c207422d765f314fa80988edf99922c02bca81b62e0398347e15be65c@group.calendar.google.com` |
| Macarena | `macarena` | `293331e0b723181277b20c87228b119f9701886dd1d3645a2747c7ee22b850e8@group.calendar.google.com` |
| Alí | `ali` | `01dabb00d1abb92b2313be55204645f2a6862e37f18779821045f3b1874250e1@group.calendar.google.com` |
| María (1) | `maria` | `968ca744f4a0356d6948ae097d54127b373c9cc5efcc889479381101773ee8e7@group.calendar.google.com` |
| María (2) | `maria2` | `d70f48f63430635525a6ad0e7f835a32ae68a6e77aeb74810fd8ba9c4de836a2@group.calendar.google.com` |
| Marian | `marian` | `4cace839a6b98a4c7f5c910f4e898c1e0ebda5712c45939783b8e720543c9d5e@group.calendar.google.com` |

### Alpedrete

| Empleado | Nombre normalizado | Calendar ID |
|----------|-------------------|-------------|
| Ana | `ana` | `7ced6d3e137d513c4cc58b517ad1fa344efbb883cdd3dbce8fd0046ac053c924@group.calendar.google.com` |
| Cristina | `cristina` | `62b7d9a94d9f7a745d1d7c65448838ceecaa5ab4e999e3ace21546c913f7a710@group.calendar.google.com` |
| María | `maria` | `d70f48f63430635525a6ad0e7f835a32ae68a6e77aeb74810fd8ba9c4de836a2@group.calendar.google.com` |

> **Nota:** María (2) de Collado y María de Alpedrete comparten el mismo calendario.

---

## Flujo de asignación de calendario

```
1. Cliente dice: "Quiero cita con Isabel"
                ↓
2. n8n recibe: empleado = "Isabel"
                ↓
3. Normaliza:    empleadoLower = "isabel"
   (minúsculas, sin tildes)
                ↓
4. Busca en CALENDARIOS_EMPLEADOS["isabel"]
                ↓
5. Obtiene:      "df5a40b3c772d155e8451db37483283cb815d71914dfd7af21750266da3eec48@group.calendar.google.com"
                ↓
6. Asigna:       calendar_id = valor_obtenido
                ↓
7. Google Calendar Node crea evento en ESE calendario específico
```

---

## Test de verificación — Isa García con Isabel

### Payload de prueba

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

### Resultado esperado del nodo "Parsear Argumentos"

```json
{
  "nombre": "Isa García",
  "telefono": "655 123 456",
  "sede": "collado_villalba",
  "servicio": "Meches completas",
  "fecha": "2026-04-10",
  "hora": "10:00",
  "empleado": "Isabel",
  "calendar_id": "df5a40b3c772d155e8451db37483283cb815d71914dfd7af21750266da3eec48@group.calendar.google.com",
  "location_id": "4159c713-3507-49ba-8319-c4b7ed4f38b2",
  "fechaInicio": "2026-04-10T10:00:00.000Z",
  "fechaFin": "2026-04-10T11:30:00.000Z",
  ...
}
```

### Verificación en Google Calendar

1. Abrir Google Calendar
2. Ir a **Configuración** → **Configuración de mis calendarios**
3. Buscar el calendario de **Isabel**
4. Verificar que el evento aparece en ESE calendario (no en "primary" u otro)

**URL directa al calendario de Isabel:**
```
https://calendar.google.com/calendar/u/0/r/settings/edit/df5a40b3c772d155e8451db37483283cb815d71914dfd7af21750266da3eec48@group.calendar.google.com
```

### Comprobación en la respuesta del webhook

El campo `google_calendar_id` debe coincidir con el calendario de Isabel:

```json
{
  "confirmado": true,
  "google_calendar_id": "df5a40b3c772d155e8451db37483283cb815d71914dfd7af21750266da3eec48@group.calendar.google.com",
  "empleado": "Isabel",
  "sede": "collado_villalba",
  ...
}
```

---

## Casos especiales a verificar

### 1. Empleado no especificado → usa `primary`

**Input:**
```json
{ "empleado": "" }
```

**Resultado:**
```json
{ "calendar_id": "primary" }
```

### 2. Nombre con tilde → normalizado correctamente

**Input:**
```json
{ "empleado": "María" }
```

**Proceso:**
```
"María" → "maría" → "maria" (NFD + strip diacríticos)
```

**Resultado:**
```json
{ "calendar_id": "968ca744f4a0356d6948ae097d54127b373c9cc5efcc889479381101773ee8e7@group.calendar.google.com" }
```

### 3. Nombre en mayúsculas → normalizado

**Input:**
```json
{ "empleado": "ISABEL" }
```

**Proceso:**
```
"ISABEL" → "isabel" (toLowerCase)
```

**Resultado:** Mismo calendar_id que "Isabel"

### 4. María (dos empleadas con mismo nombre)

**Input:**
```json
{ "empleado": "María", "sede": "collado_villalba" }
```

**Resultado actual:**
```json
{ "calendar_id": "968ca744f4a0356d6948ae097d54127b373c9cc5efcc889479381101773ee8e7@group.calendar.google.com" }
```

> Solo devuelve la primera María (Collado Villalba). Si se necesita la de Alpedrete, especificar "María Alpedrete" o usar el nombre completo.

---

## Script de prueba manual (curl)

```bash
# Test 1: Isabel
curl -X POST "https://n8n.tu-dominio.com/webhook/denueveanueve-crear-cita" \
  -H "Content-Type: application/json" \
  -d '{
    "arguments": {
      "nombre": "Isa García",
      "telefono": "655 123 456",
      "sede": "collado_villalba",
      "servicio": "Meches completas",
      "fecha": "2026-04-10",
      "hora": "10:00",
      "empleado": "Isabel"
    }
  }'

# Verificar respuesta: google_calendar_id debe ser el de Isabel
```

---

## Checklist de verificación

- [ ] El nodo "Parsear Argumentos" devuelve `calendar_id` correcto para Isabel
- [ ] El nodo "Google Calendar - Crear Evento" usa el `calendarId` de Isabel
- [ ] El evento aparece en el calendario de Isabel en Google Calendar
- [ ] La respuesta incluye `google_calendar_id` correcto
- [ ] La descripción del evento incluye "Empleada: Isabel"
- [ ] El título del evento incluye "con Isabel"

---

## Posibles problemas y soluciones

| Problema | Causa | Solución |
|----------|-------|----------|
| Evento en calendario "primary" | `empleado` vacío o no encontrado | Verificar que el nombre coincide exactamente |
| Error "Calendar not found" | Calendar ID incorrecto | Copiar ID exacto desde Google Calendar Settings |
| Evento en calendario equivocado | Nombre mal normalizado | Revisar regex de normalización |
| María siempre en Collado | Coincidencia parcial | Especificar sede o usar nombre completo |

---

## Cómo verificar en Google Calendar UI

1. Abrir https://calendar.google.com
2. Click en el evento creado
3. Ver el calendario asignado (aparece debajo del título)
4. Debe decir "Isabel" o el nombre del calendario correspondiente

**Alternativa:**
1. Ir a https://calendar.google.com/calendar/u/0/r/settings
2. Ver lista de calendarios
3. Buscar el calendario del empleado
4. Ver eventos de ese calendario específico
