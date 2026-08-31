# Test de Parámetros — Empleado/Staff Member

## Problema identificado

La cita se guardó en el calendario `primary` en lugar del calendario de Isabel.

**Causa probable:** El parámetro `empleado` no se está pasando correctamente, o la IA está capturando el nombre del cliente ("Isa") en lugar del nombre de la empleada ("Isabel").

---

## Solución implementada

### 1. El workflow ahora acepta ambos parámetros

```javascript
// Aceptar tanto 'empleado' como 'staff_member'
const empleadoInput = String(body.empleado || body.staff_member || '').trim();
```

### 2. Búsqueda parcial de nombres

```javascript
// "Isa" coincide con "Isabel"
// "Almu" coincide con "Almudena"
for (const [nombreNorm, calId] of Object.entries(CALENDARIOS_EMPLEADOS)) {
  if (nombreNorm.includes(empleadoLower) || empleadoLower.includes(nombreNorm)) {
    calendarId = calId;
    break;
  }
}
```

---

## Tests para ejecutar

### Test 1: Nombre completo de empleada

```json
{
  "arguments": {
    "nombre": "María López",
    "telefono": "655 123 456",
    "sede": "collado_villalba",
    "servicio": "Meches completas",
    "fecha": "2026-04-10",
    "hora": "10:00",
    "empleado": "Isabel"
  }
}
```

**Resultado esperado:** `calendar_id` = calendario de Isabel

---

### Test 2: Nombre corto (apodo)

```json
{
  "arguments": {
    "nombre": "María López",
    "telefono": "655 123 456",
    "sede": "collado_villalba",
    "servicio": "Meches completas",
    "fecha": "2026-04-10",
    "hora": "10:00",
    "empleado": "Isa"
  }
}
```

**Resultado esperado:** `calendar_id` = calendario de Isabel (por búsqueda parcial)

---

### Test 3: Parámetro staff_member

```json
{
  "arguments": {
    "nombre": "María López",
    "telefono": "655 123 456",
    "sede": "collado_villalba",
    "servicio": "Meches completas",
    "fecha": "2026-04-10",
    "hora": "10:00",
    "staff_member": "Isabel"
  }
}
```

**Resultado esperado:** `calendar_id` = calendario de Isabel

---

### Test 4: Sin empleado (debe usar primary)

```json
{
  "arguments": {
    "nombre": "María López",
    "telefono": "655 123 456",
    "sede": "collado_villalba",
    "servicio": "Meches completas",
    "fecha": "2026-04-10",
    "hora": "10:00"
  }
}
```

**Resultado esperado:** `calendar_id` = `primary`

---

## Verificación en la respuesta

El campo `calendar_id` debe aparecer en la salida del nodo "Parsear Argumentos":

```json
{
  "calendar_id": "df5a40b3c772d155e8451db37483283cb815d71914dfd7af21750266da3eec48@group.calendar.google.com",
  "empleado": "Isabel"
}
```

---

## Mapeo de nombres completos

| Nombre en mapa | Coincide con |
|----------------|--------------|
| `isabel` | Isa, Is, Isabel, Isita |
| `almudena` | Almu, Almudena |
| `fernando` | Fer, Fernando, Nando |
| `macarena` | Maca, Macarena |
| `maria` | Mari, Maria, María |
| `marian` | Mari, Marian |
| `ana` | Ana |
| `cristina` | Cris, Cristina |
| `tania` | Tania |

---

## Checklist de depuración

- [ ] Verificar que el nodo "Retell Tool Call" recibe `empleado` o `staff_member`
- [ ] Verificar que el nodo "Parsear Argumentos" devuelve `calendar_id` correcto
- [ ] Verificar que el nodo "Google Calendar - Crear Evento" usa ese `calendar_id`
- [ ] Verificar en Google Calendar UI que el evento está en el calendario correcto

---

## Si el problema persiste

1. **Añadir logging temporal:**
   Agregar un nodo Code después de "Parsear Argumentos" que imprima:
   ```javascript
   console.log('Empleado recibido:', $('Parsear Argumentos').first().json.empleado);
   console.log('Calendar ID:', $('Parsear Argumentos').first().json.calendar_id);
   ```

2. **Verificar el prompt de la IA:**
   Asegurarse de que Noa está capturando el nombre de la empleada, no del cliente.

3. **Probar con nombre completo:**
   Si "Isa" no funciona, probar con "Isabel" directamente.
