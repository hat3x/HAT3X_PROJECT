# Calendarios por Empleado — De Nueve a Nueve

## Distribución por sede

### Collado Villalba (location_id: `4159c713-3507-49ba-8319-c4b7ed4f38b2`)

| Empleado | Google Calendar ID |
|----------|-------------------|
| Fernando | `06136cb5016a75da20e0292649097ca53d818c3145984831dda2d02311d929f4@group.calendar.google.com` |
| Almudena | `aade57f8bb3504fdc3582de697f8892c71817b94a2e32cebf8a891d8a1d48c2b@group.calendar.google.com` |
| Johanna | `c35d85ddf7afa97e4edb360ef99552b6289a2d95e9b939745bff7505557b73e2@group.calendar.google.com` |
| Isabel | `df5a40b3c772d155e8451db37483283cb815d71914dfd7af21750266da3eec48@group.calendar.google.com` |
| Tania | `3e70700c207422d765f314fa80988edf99922c02bca81b62e0398347e15be65c@group.calendar.google.com` |
| Macarena | `293331e0b723181277b20c87228b119f9701886dd1d3645a2747c7ee22b850e8@group.calendar.google.com` |
| Alí | `01dabb00d1abb92b2313be55204645f2a6862e37f18779821045f3b1874250e1@group.calendar.google.com` |
| María | `968ca744f4a0356d6948ae097d54127b373c9cc5efcc889479381101773ee8e7@group.calendar.google.com` |
| María (2) | `d70f48f63430635525a6ad0e7f835a32ae68a6e77aeb74810fd8ba9c4de836a2@group.calendar.google.com` |
| Marian | `4cace839a6b98a4c7f5c910f4e898c1e0ebda5712c45939783b8e720543c9d5e@group.calendar.google.com` |

### Alpedrete (location_id: `61865f3b-976b-427b-b5f1-c856e7b97cdf`)

| Empleado | Google Calendar ID |
|----------|-------------------|
| Ana | `7ced6d3e137d513c4cc58b517ad1fa344efbb883cdd3dbce8fd0046ac053c924@group.calendar.google.com` |
| Cristina | `62b7d9a94d9f7a745d1d7c65448838ceecaa5ab4e999e3ace21546c913f7a710@group.calendar.google.com` |
| María | `d70f48f63430635525a6ad0e7f835a32ae68a6e77aeb74810fd8ba9c4de836a2@group.calendar.google.com` |

---

## Uso en workflows

Los workflows están configurados para:

1. **Verificar disponibilidad**: Consulta TODOS los calendarios de la sede solicitada. Devuelve `disponible: true` si al menos un empleado tiene hueco.

2. **Crear cita**: 
   - Si el cliente especifica empleado → usa el calendario de ese empleado
   - Si no especifica → usa `primary` (calendario general)

3. **Modificar/Cancelar**: Busca el evento por teléfono + fecha en el calendario principal

---

## Notas importantes

- Los IDs de calendario son sensibles a mayúsculas/minúsculas
- Normalización de nombres: "María" → "maria" (sin tilde) en el código
- Si un empleado cambia de sede, actualizar su entrada en la tabla
- María aparece dos veces: una en Collado y otra en Alpedrete (mismo ID de calendario para ambas)

---

## Integración con Staff App (Filtrado por Turno)

### Objetivo

A partir de la versión con `Consultar Staff App (Turnos)`, el flujo `01-verificar-disponibilidad.json` ya no consulta los calendarios de **todos** los empleados de la sede. Solo consulta los de los empleados que están **de turno** en la fecha y hora solicitada.

### Stack de la staff app

| Dato | Valor |
|------|-------|
| Tecnología | React + TypeScript + Vite + shadcn/ui |
| Backend | Supabase (PostgreSQL) — proyecto `cpocwvedqlxtwazwoyfn` |
| URL Supabase | `https://cpocwvedqlxtwazwoyfn.supabase.co` |
| Auth n8n | `apikey` header con la anon key de Supabase |
| No hay API REST propia | n8n llama directamente a Supabase via PostgREST |

### Tablas de Supabase relevantes

#### `staff_members`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | PK |
| `name` | text | Nombre del empleado |
| `location_id` | uuid | Sede (`4159c713...` = Collado, `61865f3b...` = Alpedrete) |
| `section` | text | Sección/especialidad |
| `active` | boolean | Si está activo en la empresa |
| `user_id` | uuid | Vinculado al usuario de auth |

#### `employee_schedules`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | PK |
| `staff_member_id` | uuid | FK → staff_members.id |
| `date` | date | Fecha (YYYY-MM-DD) |
| `entry_type` | enum | `availability` / `vacation` / `sick_leave` / `holiday` |
| `start_time` | time | Hora inicio del turno (solo en `availability`) |
| `end_time` | time | Hora fin del turno (solo en `availability`) |
| `notes` | text | Notas opcionales |

**Un empleado "está de turno" cuando tiene un registro `employee_schedules` con:**
- `entry_type = 'availability'`
- `date = fecha_solicitada`
- `start_time <= hora_solicitada`
- `end_time >= hora_fin_servicio`

### Endpoint que debe existir en Supabase

El nodo `Consultar Staff App (Turnos)` llama a una **Supabase RPC Function** (Edge Function PostgreSQL):

```
GET /rest/v1/rpc/get_empleados_de_turno
  ?p_location_id=<uuid>
  &p_fecha=<YYYY-MM-DD>
  &p_hora_inicio=<HH:MM>
  &p_hora_fin=<HH:MM>
```

**Respuesta esperada (array JSON):**
```json
[
  { "id": "uuid-empleado", "name": "Fernando", "section": "corte" },
  { "id": "uuid-empleado", "name": "Tania",    "section": "color" }
]
```

**SQL de la función a crear en Supabase:**
```sql
CREATE OR REPLACE FUNCTION get_empleados_de_turno(
  p_location_id uuid,
  p_fecha       date,
  p_hora_inicio time,
  p_hora_fin    time
)
RETURNS TABLE(id uuid, name text, section text)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT sm.id, sm.name, sm.section
  FROM staff_members sm
  INNER JOIN employee_schedules es ON es.staff_member_id = sm.id
  WHERE sm.location_id  = p_location_id
    AND sm.active       = true
    AND es.date         = p_fecha
    AND es.entry_type   = 'availability'
    AND es.start_time  <= p_hora_inicio
    AND es.end_time    >= p_hora_fin
  ORDER BY sm.name;
$$;
```

> Esta función debe crearse en el proyecto Supabase `cpocwvedqlxtwazwoyfn` por el equipo de desarrollo de la staff app.

### Lógica de fallback en n8n

El nodo `Filtrar Empleados de Turno` implementa tolerancia a fallos en tres capas:

| Situación | Comportamiento |
|-----------|----------------|
| API responde con lista de empleados | Filtra solo sus calendarios GCal |
| API responde vacía (nadie de turno registrado) | Fallback: consulta TODOS los calendarios de la sede |
| API no disponible / timeout / error | Fallback: consulta TODOS los calendarios de la sede |
| Ningún nombre coincide entre API y mapa GCal | Fallback: consulta TODOS los calendarios de la sede |

El campo `staff_app_usada: true/false` en la respuesta a Retell indica qué rama se ejecutó.

### Correspondencia nombre Supabase ↔ nombre en mapa GCal

El cruce se hace por **nombre normalizado** (minúsculas, sin tildes). La tabla de referencia es:

| Nombre en Supabase | Nombre normalizado | Empleado en mapa GCal |
|--------------------|-------------------|----------------------|
| Fernando | fernando | Fernando (CV) |
| Almudena | almudena | Almudena (CV) |
| Johanna | johanna | Johanna (CV) |
| Isabel | isabel | Isabel (CV) |
| Tania | tania | Tania (CV) |
| Macarena | macarena | Macarena (CV) |
| Alí | ali | Alí (CV) |
| María | maria | María / María2 (CV) — ver nota |
| Marian | marian | Marian (CV) |
| Ana | ana | Ana (Alpedrete) |
| Cristina | cristina | Cristina (Alpedrete) |
| María | maria | María (Alpedrete) |

> **Nota "María vs María2":** Hay dos empleadas llamadas María en Collado Villalba con distinto ID de calendario. Cuando la API devuelva "María", el filtro incluirá AMBAS por coincidencia de nombre. Si en el futuro deben diferenciarse, añadir un campo `google_calendar_id` en la tabla `staff_members` de Supabase y cruzar directamente por ID.

### Variables de entorno nuevas requeridas en n8n

| Variable | Valor |
|----------|-------|
| `STAFF_APP_SUPABASE_URL` | `https://cpocwvedqlxtwazwoyfn.supabase.co` |
| `STAFF_APP_SUPABASE_ANON_KEY` | anon key del proyecto (ver client.ts del repo) |

Añadir al `.env.example` del proyecto:
```env
# Staff App — Supabase (para consulta de turnos en workflow 01)
STAFF_APP_SUPABASE_URL=https://cpocwvedqlxtwazwoyfn.supabase.co
STAFF_APP_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```
