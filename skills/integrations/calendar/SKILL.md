# SKILL: Integración Calendario

## Opciones soportadas en HAT3X

| Plataforma | Cuándo usarlo | Complejidad |
|---|---|---|
| **Cal.com** | Default para nuevas implementaciones — API limpia, self-hosteable | Baja |
| **Google Calendar** | Si el cliente ya usa Google Workspace | Media |
| **Calendly** | Si el cliente ya tiene Calendly activo | Media |
| **Microsoft Outlook** | Clientes enterprise con Microsoft 365 | Alta |

---

## Cal.com — Operaciones Frecuentes

Cal.com es nuestra primera opción: API REST clara, webhooks nativos, open source.

```env
CAL_API_KEY=cal_live_xxx
CAL_USERNAME=tu-usuario-o-equipo
```

### Obtener disponibilidad
```typescript
// GET /v1/availability
async function getAvailability(params: {
  eventTypeId: number;
  startTime: string;  // ISO 8601: "2026-04-01T00:00:00Z"
  endTime: string;    // ISO 8601: "2026-04-07T23:59:59Z"
  timeZone?: string;  // "Europe/Madrid"
}) {
  const url = new URL('https://api.cal.com/v1/availability');
  url.searchParams.set('apiKey', process.env.CAL_API_KEY!);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const res = await fetch(url.toString());
  const data = await res.json();
  return data.busy;  // array de slots ocupados
}
```

### Crear reserva
```typescript
async function createBooking(params: {
  eventTypeId: number;
  start: string;       // "2026-04-02T10:00:00Z"
  end: string;         // "2026-04-02T10:30:00Z"
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  timeZone?: string;
  language?: string;
}) {
  const res = await fetch(`https://api.cal.com/v1/bookings?apiKey=${process.env.CAL_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventTypeId: params.eventTypeId,
      start: params.start,
      end: params.end,
      responses: {
        name: params.name,
        email: params.email,
        phone: params.phone,
        notes: params.notes
      },
      timeZone: params.timeZone || 'Europe/Madrid',
      language: params.language || 'es',
      metadata: {}
    })
  });

  if (!res.ok) throw new Error(`Cal.com booking failed: ${await res.text()}`);
  return res.json();
}
```

### Cancelar/reprogramar reserva
```typescript
async function cancelBooking(bookingId: number, reason?: string) {
  const res = await fetch(
    `https://api.cal.com/v1/bookings/${bookingId}/cancel?apiKey=${process.env.CAL_API_KEY}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || 'Cancelado por el cliente' })
    }
  );
  return res.json();
}
```

### Webhooks de Cal.com
Cal.com puede notificar a tu servidor cuando se crea/cancela/reprograma una cita:

```
POST /api/cal/webhook
```

```typescript
app.post('/api/cal/webhook', async (req, res) => {
  const { triggerEvent, payload } = req.body;

  switch (triggerEvent) {
    case 'BOOKING_CREATED':
      await syncToCRM(payload);
      await sendConfirmationWhatsApp(payload.attendees[0].phone, payload);
      break;
    case 'BOOKING_CANCELLED':
      await updateCRMStatus(payload.uid, 'cancelled');
      break;
    case 'BOOKING_RESCHEDULED':
      await updateCRMStatus(payload.uid, 'rescheduled');
      await notifyTeam(payload);
      break;
  }

  res.sendStatus(200);
});
```

---

## Google Calendar — Operaciones Frecuentes

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REFRESH_TOKEN=xxx  # OAuth2 refresh token del usuario
GOOGLE_CALENDAR_ID=primary  # o ID del calendario específico
```

### Setup OAuth2
```typescript
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
```

### Verificar disponibilidad (FreeBusy)
```typescript
async function checkAvailability(startTime: Date, endTime: Date) {
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      items: [{ id: process.env.GOOGLE_CALENDAR_ID }]
    }
  });

  const busy = res.data.calendars?.[process.env.GOOGLE_CALENDAR_ID!]?.busy || [];
  return busy;  // array de {start, end} con slots ocupados
}
```

### Crear evento
```typescript
async function createEvent(params: {
  summary: string;
  start: Date;
  end: Date;
  attendeeEmail?: string;
  description?: string;
  location?: string;
}) {
  const event = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    sendUpdates: 'all',  // envía invitación por email al asistente
    requestBody: {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: { dateTime: params.start.toISOString(), timeZone: 'Europe/Madrid' },
      end: { dateTime: params.end.toISOString(), timeZone: 'Europe/Madrid' },
      attendees: params.attendeeEmail ? [{ email: params.attendeeEmail }] : [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 1440 },  // 24h antes
          { method: 'popup', minutes: 30 }
        ]
      }
    }
  });

  return event.data;
}
```

---

## Slots Disponibles — Algoritmo Común

Para mostrar al usuario los próximos slots disponibles:

```typescript
async function getNextAvailableSlots(params: {
  durationMinutes: number;
  businessHours: { start: number; end: number };  // {start: 9, end: 18}
  daysAhead: number;
  count: number;  // cuántos slots devolver
}): Promise<Date[]> {
  const slots: Date[] = [];
  const busyPeriods = await getBusyPeriods(new Date(), addDays(new Date(), params.daysAhead));

  let current = startOfNextBusinessHour(new Date(), params.businessHours);

  while (slots.length < params.count) {
    const end = addMinutes(current, params.durationMinutes);

    if (!overlapsWithBusy(current, end, busyPeriods)) {
      slots.push(current);
    }

    current = addMinutes(current, 30);  // verificar cada 30 minutos
    if (current.getHours() >= params.businessHours.end) {
      current = startOfNextBusinessHour(addDays(current, 1), params.businessHours);
    }
  }

  return slots;
}
```

---

## Integración desde n8n

### Patrón estándar para gestión de citas en n8n
```
Trigger (webhook / chatbot / agente voz) →
Set node (extraer: nombre, email, teléfono, fecha preferida) →
Cal.com: Get Available Slots →
IF: hay slots →
  Cal.com: Create Booking →
  Send Email (confirmación al cliente) →
  HubSpot: Create Deal / Update Contact
IF: no hay slots →
  Notificar que no hay disponibilidad →
  Sugerir próxima semana
```

---

## Variables de Entorno Necesarias

```env
# Cal.com
CAL_API_KEY=cal_live_xxx
CAL_EVENT_TYPE_ID=123

# Google Calendar (si aplica)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REFRESH_TOKEN=xxx
GOOGLE_CALENDAR_ID=primary
```

---

## Checklist de Integración Calendario

- [ ] Zona horaria configurada correctamente (Europe/Madrid para España)
- [ ] Horario de negocio del cliente reflejado en la plataforma
- [ ] Confirmaciones automáticas funcionando (email/WhatsApp)
- [ ] Cancelaciones y reprogramaciones probadas
- [ ] CRM actualizado cuando se crea/cancela una cita
- [ ] El cliente puede ver sus citas en su herramienta habitual
