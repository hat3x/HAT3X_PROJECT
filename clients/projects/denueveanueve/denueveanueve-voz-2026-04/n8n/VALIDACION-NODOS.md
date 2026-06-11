# Validación de Nodos Google Calendar — n8n Cloud 2.15.0

## Checklist de Importación

### 1. Verificar typeVersion

Al abrir cada workflow, confirmar que los nodos Google Calendar muestran:

```
type: n8n-nodes-base.googleCalendar
typeVersion: 1.3
```

**Si aparece otro número** → Los nodos pueden no funcionar correctamente.

---

### 2. Verificar estructura de parámetros

Cada nodo Google Calendar debe tener esta estructura:

```json
{
  "parameters": {
    "resource": "event",
    "operation": "getAll | create | update | delete",
    "calendarId": "valor_o_expresion",
    "options": { ... }
  }
}
```

**NO debe tener:**
- `calendar.__rl` (recurso locator deprecated)
- `calendar.mode`

---

### 3. Test de conexión OAuth2

**Paso a paso:**

1. En n8n cloud, ir a **Settings** → **Credentials**
2. Buscar credencial "Google Calendar OAuth2"
3. Hacer clic en **Connect**
4. Iniciar sesión con cuenta de Google que tenga acceso a los calendarios de De Nueve a Nueve
5. Aceptar permisos de Calendar API

**Validación:**
- [ ] Credencial aparece como "Connected"
- [ ] Scope incluye: `https://www.googleapis.com/auth/calendar`

---

### 4. Test unitario por workflow

#### Workflow 01: Verificar Disponibilidad

**Payload de prueba:**

```json
{
  "sede": "collado_villalba",
  "servicio": "Corte Señora",
  "fecha": "2026-04-10",
  "hora": "10:30"
}
```

**Ejecutar desde n8n:**
1. Abrir workflow `01-verificar-disponibilidad`
2. Hacer clic en **Execute** → **Test workflow**
3. Pegar payload en el nodo "Retell Tool Call"
4. Ejecutar

**Resultado esperado:**
```json
{
  "disponible": true|false,
  "mensaje": "..."
}
```

**Validar:**
- [ ] Nodo "Google Calendar - Consultar Hueco" ejecuta sin error
- [ ] Response incluye `disponible: true` o `disponible: false`

---

#### Workflow 02: Crear Cita

**Payload de prueba:**

```json
{
  "nombre": "Test Validación",
  "telefono": "600000000",
  "sede": "collado_villalba",
  "servicio": "Corte Señora",
  "fecha": "2026-04-15",
  "hora": "16:00",
  "notas": "Test de validación de nodos",
  "empleado": "Fernando"
}
```

**Ejecutar desde n8n:**
1. Abrir workflow `02-crear-cita`
2. **Execute** → **Test workflow**
3. Pegar payload
4. Ejecutar

**Resultado esperado:**
```json
{
  "confirmado": true,
  "id_cita": "google_event_id_xxx",
  "mensaje_confirmacion": "..."
}
```

**Validar:**
- [ ] Nodo "Google Calendar - Crear Evento" ejecuta sin error
- [ ] Evento aparece en Google Calendar de Fernando
- [ ] Response incluye `confirmado: true`

**Post-test:** Eliminar evento manualmente de Google Calendar

---

#### Workflow 03: Cancelar Cita

**Pre-requisito:** Crear evento de prueba primero (ver Workflow 02)

**Payload de prueba:**

```json
{
  "telefono": "600000000",
  "fecha": "2026-04-15",
  "hora": "16:00"
}
```

**Ejecutar desde n8n:**
1. Abrir workflow `03-cancelar-cita`
2. **Execute** → **Test workflow**
3. Pegar payload
4. Ejecutar

**Resultado esperado:**
```json
{
  "cancelado": true,
  "mensaje": "..."
}
```

**Validar:**
- [ ] Nodo "Google Calendar - Buscar Evento" encuentra el evento
- [ ] Nodo "Google Calendar - Eliminar" ejecuta sin error
- [ ] Evento desaparece de Google Calendar

---

#### Workflow 04: Modificar Cita

**Pre-requisito:** Crear evento de prueba primero (ver Workflow 02)

**Payload de prueba:**

```json
{
  "telefono": "600000000",
  "fecha_actual": "2026-04-15",
  "hora_actual": "16:00",
  "nueva_fecha": "2026-04-16",
  "nueva_hora": "17:00"
}
```

**Ejecutar desde n8n:**
1. Abrir workflow `04-modificar-cita`
2. **Execute** → **Test workflow**
3. Pegar payload
4. Ejecutar

**Resultado esperado:**
```json
{
  "modificado": true,
  "mensaje": "..."
}
```

**Validar:**
- [ ] Nodo "Google Calendar - Buscar Evento" encuentra el evento original
- [ ] Nodo "Google Calendar - Verificar Nuevo Hueco" confirma disponibilidad
- [ ] Nodo "Google Calendar - Actualizar Evento" ejecuta sin error
- [ ] Evento aparece en nueva fecha/hora en Google Calendar

---

## Errores Comunes y Soluciones

### Error: "Cannot read properties of undefined (reading 'id')"

**Causa:** Credenciales no seleccionadas en el nodo

**Solución:**
1. Abrir workflow en modo edición
2. Hacer clic en el nodo Google Calendar afectado
3. En **Credentials**, seleccionar la credencial OAuth2
4. Guardar workflow

---

### Error: "Calendar ID not found"

**Causa:** El `calendarId` está vacío o mal formado

**Solución:**
- Verificar que `calendarId` sea:
  - `"primary"` para calendario principal, o
  - ID completo: `xxx@group.calendar.google.com`

---

### Error: "Insufficient permissions"

**Causa:** OAuth2 sin scope correcto

**Solución:**
1. Ir a **Settings** → **Credentials**
2. Editar credencial Google Calendar OAuth2
3. Verificar scope: `https://www.googleapis.com/auth/calendar`
4. Reconectar si es necesario

---

### Error: "Node type version mismatch"

**Causa:** typeVersion incompatible

**Solución:**
1. Abrir nodo Google Calendar
2. En **Settings** del nodo, cambiar **Version** a `1.3`
3. Guardar cambios

---

## Validación Final

Completar checklist:

- [ ] Los 4 workflows importados sin errores
- [ ] Todos los nodos Google Calendar tienen credenciales seleccionadas
- [ ] Test unitario de `01-verificar-disponibilidad` → OK
- [ ] Test unitario de `02-crear-cita` → OK (evento creado en Calendar)
- [ ] Test unitario de `03-cancelar-cita` → OK (evento eliminado)
- [ ] Test unitario de `04-modificar-cita` → OK (evento actualizado)
- [ ] Workflows activados (toggle Active = ON)
- [ ] Production URLs copiadas y configuradas en Retell

---

## Archivos Reparados

| Archivo | Cambios |
|---------|---------|
| `01-verificar-disponibilidad.json` | `calendarId` directo, typeVersion 1.3 |
| `02-crear-cita.json` | `calendarId` directo, typeVersion 1.3 |
| `03-cancelar-cita.json` | `calendarId` directo, typeVersion 1.3 |
| `04-modificar-cita.json` | `calendarId` directo, typeVersion 1.3 |

**Cambio principal:** Se reemplazó `calendar.__rl` (resource locator) por `calendarId` (string directo), formato nativo de n8n cloud 2.15.0.
