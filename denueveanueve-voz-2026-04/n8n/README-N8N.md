# Workflows n8n — Asistente de Voz De Nueve a Nueve

## Arquitectura

```
Noa (Retell AI) → Tool call → n8n webhook → Google Calendar (lectura/escritura directa)
                                              → Supabase API (sincronización opcional)
```

## Versión Compatible

- **n8n cloud**: 2.15.0+
- **Google Calendar Node**: typeVersion 1.3
- **Recursos actualizados**: `calendarId` en lugar de `calendar.__rl`

---

## Workflows disponibles

| # | Workflow | Path n8n | Tool Retell | Descripción |
|---|----------|----------|-------------|-------------|
| 01 | `01-verificar-disponibilidad.json` | `/denueveanueve-verificar-disponibilidad` | `verificar_disponibilidad` | Consulta huecos en Google Calendar (todos los empleados) |
| 02 | `02-crear-cita.json` | `/denueveanueve-crear-cita` | `crear_cita` | Crea evento en Google Calendar (empleado específico o primary) |
| 03 | `03-cancelar-cita.json` | `/denueveanueve-cancelar-cita` | `cancelar_cita` | Elimina evento de Google Calendar |
| 04 | `04-modificar-cita.json` | `/denueveanueve-modificar-cita` | `modificar_cita` | Actualiza evento en Google Calendar |
| 05 | `05-post-llamada.json` | `/denueveanueve-post-llamada` | (webhook_url) | Guarda log post-llamada |

---

## Calendarios por empleado

Los workflows están preconfigurados con los **12 calendarios de los empleados** de De Nueve a Nueve:

**Collado Villalba:** Fernando, Almudena, Isabel, Tania, Macarena, María (x2), Marian  
**Alpedrete:** Johanna, Ana, Cristina, Alí

Ver `CALENDARIOS_EMPLEADOS.md` para la lista completa de IDs.

---

## Configuración de Google Calendar en n8n

### Paso 1 — Crear credenciales OAuth2

1. En n8n: **Settings** → **Credentials** → **Add Credential** → **Google Calendar OAuth2 API**
2. Configurar OAuth2:
   - **Authorization URL**: `https://accounts.google.com/o/oauth2/v2/auth`
   - **Access Token URL**: `https://oauth2.googleapis.com/token`
   - **Client ID** y **Client Secret**: Desde Google Cloud Console
   - **Scope**: `https://www.googleapis.com/auth/calendar`

3. **Importante**: En Google Cloud Console, añadir `https://accounts.google.com/o/oauth2/auth` a "Authorized redirect URIs"

### Paso 2 — Configurar credenciales en los workflows

Al importar los workflows en n8n cloud 2.15.0:

1. Los nodos Google Calendar usan `calendarId` (string directo) en lugar de `calendar.__rl` (resource locator)
2. Al abrir cada workflow por primera vez, n8n detectará que faltan credenciales
3. Seleccionar las credenciales creadas en el Paso 1 desde el dropdown
4. Guardar el workflow

**Estructura correcta de nodos Google Calendar (n8n 2.15.0):**

```json
{
  "type": "n8n-nodes-base.googleCalendar",
  "typeVersion": 1.3,
  "parameters": {
    "resource": "event",
    "operation": "getAll | create | update | delete",
    "calendarId": "calendar_id_o_primary",
    "eventId": "={{ $json.evento_id }}",  // solo para update/delete
    "options": { ... }
  },
  "credentials": {
    "googleCalendarOAuth2Api": { "id": "...", "name": "..." }
  }
}
```

### Paso 3 — Calendarios por empleado

Ver `CALENDARIOS_EMPLEADOS.md` para la lista completa de IDs. Los workflows ya incluyen los 13 calendarios preconfigurados en el código.

---

## Instrucciones de importación

### Paso 1 — Importar workflows

1. En n8n cloud: **Workflows** → **Add workflow** → **Import from file**
2. Importar en orden:
   - `01-verificar-disponibilidad.json`
   - `02-crear-cita.json`
   - `03-cancelar-cita.json`
   - `04-modificar-cita.json`
   - `05-post-llamada.json`

### Paso 2 — Configurar credenciales (CRÍTICO)

Para cada workflow importado:

1. **Abrir el workflow** en modo edición
2. **Hacer clic en cada nodo de Google Calendar** (ver lista abajo)
3. En el campo **Credentials**, seleccionar las creadas en el Paso 1 de configuración
4. **Guardar** el workflow (Ctrl+S)

**Nodos que requieren credenciales por workflow:**

| Workflow | Nodos Google Calendar |
|----------|----------------------|
| `01-verificar-disponibilidad` | 1 nodo: "Google Calendar - Consultar Hueco" |
| `02-crear-cita` | 1 nodo: "Google Calendar - Crear Evento" |
| `03-cancelar-cita` | 2 nodos: "Buscar Evento", "Eliminar" |
| `04-modificar-cita` | 3 nodos: "Buscar Evento", "Verificar Nuevo Hueco", "Actualizar Evento" |

### Paso 3 — Activar workflows

Para cada workflow:
1. Hacer clic en **Activate** (toggle superior derecho)
2. Esperar a que aparezca el estado "Active"
3. Copiar la **Production URL** del webhook (aparece al activar)

### Paso 4 — Configurar variables de entorno en n8n

En **Settings** → **Environment Variables**:

```env
# Supabase (solo para sincronización opcional)
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Paso 5 — Actualizar URLs en Retell AI

Editar `docs/retell-config.md` y sustituir las URLs por las copiadas:

```env
N8N_VERIFICAR_DISPONIBILIDAD_URL=https://n8n.tu-dominio.com/webhook/denueveanueve-verificar-disponibilidad
N8N_CREAR_CITA_URL=https://n8n.tu-dominio.com/webhook/denueveanueve-crear-cita
N8N_CANCELAR_CITA_URL=https://n8n.tu-dominio.com/webhook/denueveanueve-cancelar-cita
N8N_MODIFICAR_CITA_URL=https://n8n.tu-dominio.com/webhook/denueveanueve-modificar-cita
N8N_POST_LLAMADA_URL=https://n8n.tu-dominio.com/webhook/denueveanueve-post-llamada
```

---

## Flujo de datos (Google Calendar primero)

### 1. Verificar disponibilidad

```
Retell → n8n webhook → Google Calendar API (getEvents en ventana)
  → Si hay eventos → disponible: false
  → Si no hay eventos → disponible: true
```

### 2. Crear cita

```
Retell → n8n webhook → Google Calendar API (create event)
  → Evento creado con: título, descripción, hora, duración
  → (Opcional) Supabase API para sincronizar con app
  ← Respuesta con ID del evento y confirmación
```

### 3. Cancelar cita

```
Retell → n8n webhook → Google Calendar API (search by phone + fecha)
  → Filtrar por hora exacta
  → Google Calendar API (delete event)
  ← Confirmación de cancelación
```

### 4. Modificar cita

```
Retell → n8n webhook → Google Calendar (buscar evento actual)
  → Google Calendar (verificar nuevo hueco libre)
  → Google Calendar (update event con nueva fecha/hora)
  ← Confirmación de modificación
```

---

## Respuestas esperadas

### verificar_disponibilidad (éxito)

```json
{
  "disponible": true,
  "fecha": "2026-04-10",
  "hora": "10:30",
  "servicio": "Corte Señora",
  "sede": "collado_villalba",
  "mensaje": "Hay disponibilidad el viernes 10 de abril a las 10:30 en collado_villalba"
}
```

### crear_cita (confirmación)

```json
{
  "confirmado": true,
  "id_cita": "google_calendar_event_id_abc123",
  "resumen": "María García - Corte Señora el viernes 10 de abril a las 10:30",
  "mensaje_confirmacion": "Cita confirmada. Te esperamos el viernes diez de abril a las diez y media."
}
```

---

## Troubleshooting

| Problema | Causa probable | Solución |
|----------|----------------|----------|
| "Credentials not found" | Credenciales de Google Calendar no seleccionadas | Abrir workflow → hacer clic en nodo Google Calendar → seleccionar credenciales en dropdown |
| "Insufficient permissions" | OAuth2 sin scope de Calendar | Verificar scope: `https://www.googleapis.com/auth/calendar` |
| "Calendar ID not valid" | Formato de calendarId incorrecto | Usar `calendarId: "primary"` o ID completo (`xxx@group.calendar.google.com`) |
| Evento no se encuentra | Búsqueda por teléfono no coincide | Verificar que el teléfono esté en la descripción del evento |
| Webhook no responde | Workflow no está activo | Verificar toggle **Active** en n8n |
| "Calendar not found" | ID de calendario incorrecto | Copiar ID exacto desde Google Calendar → Settings |
| Nodos aparecen con borde rojo | typeVersion incompatible | Los workflows están en typeVersion 1.3, compatible con n8n 2.15.0 |

---

## Pruebas recomendadas

Ver **`VALIDACION-NODOS.md`** para la guía completa de validación paso a paso.

1. **Test unitario**: Ejecutar cada workflow desde n8n con payload manual
2. **Test integración**: 
   - Pedir cita → verificar que aparece en Google Calendar
   - Modificar cita → verificar cambio en Calendar
   - Cancelar cita → verificar que desaparece
3. **Test concurrencia**: Intentar reservar mismo hueco dos veces

---

**Documentación completa**: `docs/retell-config.md`  
**Configuración Retell**: `CONFIGURACION-RETELL.md`
