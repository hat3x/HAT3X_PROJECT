import { describe, it, expect } from 'vitest';
import {
  buildCatalogIndex,
  computeDurationMinutes,
  enrichAppointment,
  formatDuration,
  formatPrice,
  formatTimeRange,
  isUpcoming,
  localeToBcp47,
  partitionAppointments,
  statusLabelKey,
  STATUS_BADGE_CLASS,
  type AppointmentRow,
  type AppointmentStatus,
} from './appointments';
import type { BookingBootstrap } from './salon-os-api';

// ── Datos sintéticos (no producción) ─────────────────────────────────────────────
const SVC_A = '11111111-1111-4111-8111-111111111111';
const SVC_GONE = '99999999-9999-4999-8999-999999999999';
const PRO_A = '22222222-2222-4222-8222-222222222222';

/** Fábrica de filas de cita con valores por defecto razonables. */
function row(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: overrides.id ?? 'apt-1',
    starts_at: overrides.starts_at ?? '2026-07-25T08:00:00Z',
    ends_at: overrides.ends_at ?? '2026-07-25T08:45:00Z',
    status: overrides.status ?? 'confirmed',
    service_id: overrides.service_id ?? SVC_A,
    professional_id: overrides.professional_id ?? PRO_A,
    price_cents: overrides.price_cents ?? 2500,
    currency: overrides.currency ?? 'EUR',
  };
}

const NOW = Date.parse('2026-07-20T12:00:00Z'); // "ahora" fijo para tests deterministas

const bootstrap: BookingBootstrap = {
  salon: {
    id: 'salon-1',
    name: 'Jota Barber',
    slug: 'jotabarber',
    timezone: 'Europe/Madrid',
    phone: null,
    address: null,
  },
  services: [
    {
      id: SVC_A,
      name: 'Corte + Barba',
      description: null,
      category: null,
      durationMinutes: 45,
      priceCents: 2500,
      currency: 'EUR',
    },
  ],
  professionals: [{ id: PRO_A, fullName: 'Jota', color: null }],
  serviceProfessionals: { [SVC_A]: [PRO_A] },
};

// ── isUpcoming ────────────────────────────────────────────────────────────────
describe('isUpcoming', () => {
  it('una cita confirmada futura es próxima', () => {
    expect(isUpcoming({ status: 'confirmed', ends_at: '2026-07-25T08:45:00Z' }, NOW)).toBe(true);
  });

  it('una cita pendiente futura es próxima', () => {
    expect(isUpcoming({ status: 'pending', ends_at: '2026-07-25T08:45:00Z' }, NOW)).toBe(true);
  });

  it('una cita en curso (empezó pero no ha terminado) sigue siendo próxima', () => {
    const soon = new Date(NOW + 10 * 60000).toISOString(); // termina en 10 min
    expect(isUpcoming({ status: 'confirmed', ends_at: soon }, NOW)).toBe(true);
  });

  it('una cita confirmada ya terminada NO es próxima (va al historial)', () => {
    expect(isUpcoming({ status: 'confirmed', ends_at: '2026-07-19T08:45:00Z' }, NOW)).toBe(false);
  });

  it('estados terminales nunca son próximos, aunque la fecha sea futura', () => {
    for (const status of ['completed', 'cancelled', 'no_show'] as AppointmentStatus[]) {
      expect(isUpcoming({ status, ends_at: '2026-07-25T08:45:00Z' }, NOW)).toBe(false);
    }
  });

  it('una fecha inválida no cuela en próximas', () => {
    expect(isUpcoming({ status: 'confirmed', ends_at: 'no-es-fecha' }, NOW)).toBe(false);
  });
});

// ── partitionAppointments ───────────────────────────────────────────────────────
describe('partitionAppointments', () => {
  it('separa próximas de historial y no muta la entrada', () => {
    const rows = [
      row({ id: 'future', starts_at: '2026-07-25T08:00:00Z', ends_at: '2026-07-25T08:45:00Z' }),
      row({ id: 'done', status: 'completed', starts_at: '2026-07-10T08:00:00Z', ends_at: '2026-07-10T08:45:00Z' }),
    ];
    const snapshot = JSON.stringify(rows);
    const { upcoming, history } = partitionAppointments(rows, NOW);
    expect(upcoming.map((a) => a.id)).toEqual(['future']);
    expect(history.map((a) => a.id)).toEqual(['done']);
    expect(JSON.stringify(rows)).toBe(snapshot); // entrada intacta
  });

  it('ordena próximas ascendente (la más cercana primero)', () => {
    const rows = [
      row({ id: 'far', starts_at: '2026-08-01T08:00:00Z', ends_at: '2026-08-01T08:45:00Z' }),
      row({ id: 'near', starts_at: '2026-07-22T08:00:00Z', ends_at: '2026-07-22T08:45:00Z' }),
    ];
    expect(partitionAppointments(rows, NOW).upcoming.map((a) => a.id)).toEqual(['near', 'far']);
  });

  it('ordena historial descendente (la más reciente primero)', () => {
    const rows = [
      row({ id: 'old', status: 'completed', starts_at: '2026-07-01T08:00:00Z', ends_at: '2026-07-01T08:45:00Z' }),
      row({ id: 'recent', status: 'completed', starts_at: '2026-07-15T08:00:00Z', ends_at: '2026-07-15T08:45:00Z' }),
    ];
    expect(partitionAppointments(rows, NOW).history.map((a) => a.id)).toEqual(['recent', 'old']);
  });
});

// ── enriquecido con el catálogo ─────────────────────────────────────────────────
describe('buildCatalogIndex + enrichAppointment', () => {
  it('resuelve nombre de servicio y profesional desde el catálogo', () => {
    const index = buildCatalogIndex(bootstrap);
    const e = enrichAppointment(row(), index);
    expect(e.serviceName).toBe('Corte + Barba');
    expect(e.professionalName).toBe('Jota');
    expect(e.durationMinutes).toBe(45);
    expect(index.timezone).toBe('Europe/Madrid');
  });

  it('degrada a null si el servicio ya no está en el catálogo (retirado)', () => {
    const index = buildCatalogIndex(bootstrap);
    const e = enrichAppointment(row({ service_id: SVC_GONE }), index);
    expect(e.serviceName).toBeNull();
    expect(e.professionalName).toBe('Jota'); // el profesional sí resuelve
  });

  it('sin índice (catálogo no disponible) deja ambos nombres en null pero conserva la duración', () => {
    const e = enrichAppointment(row(), null);
    expect(e.serviceName).toBeNull();
    expect(e.professionalName).toBeNull();
    expect(e.durationMinutes).toBe(45);
  });
});

// ── duración ─────────────────────────────────────────────────────────────────
describe('computeDurationMinutes', () => {
  it('calcula minutos entre dos instantes', () => {
    expect(computeDurationMinutes('2026-07-25T08:00:00Z', '2026-07-25T09:30:00Z')).toBe(90);
  });
  it('nunca es negativa y es 0 con fechas inválidas', () => {
    expect(computeDurationMinutes('2026-07-25T09:00:00Z', '2026-07-25T08:00:00Z')).toBe(0);
    expect(computeDurationMinutes('x', 'y')).toBe(0);
  });
});

// ── formateo ─────────────────────────────────────────────────────────────────
describe('formateo', () => {
  it('formatDuration produce etiquetas humanas', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDuration(0)).toBe('');
  });

  it('formatPrice localiza desde céntimos', () => {
    // El separador puede variar por entorno ICU; comprobamos las partes estables.
    const es = formatPrice(2500, 'EUR', 'es');
    expect(es).toContain('25');
    expect(es).toContain('€');
    const en = formatPrice(2500, 'EUR', 'en');
    expect(en).toContain('25');
  });

  it('formatPrice tolera una divisa poco común de 3 letras sin romper', () => {
    // Intl acepta cualquier código alfabético de 3 letras (rama try): no lanza.
    const out = formatPrice(2500, 'XTS', 'es');
    expect(out).toContain('25');
    expect(out.toUpperCase()).toContain('XTS');
  });

  it('formatPrice cae al fallback con un código de divisa malformado', () => {
    // 'E' no es un código válido de 3 letras → Intl lanza → fallback "25.00 E".
    expect(formatPrice(2500, 'E', 'es')).toBe('25.00 E');
  });

  it('formatTimeRange usa la zona del salón y formato 24h', () => {
    // 08:00Z en Europe/Madrid (verano, UTC+2) = 10:00.
    const range = formatTimeRange('2026-07-25T08:00:00Z', '2026-07-25T08:45:00Z', {
      locale: 'es',
      timeZone: 'Europe/Madrid',
    });
    expect(range).toBe('10:00 – 10:45');
  });

  it('localeToBcp47 mapea es→es-ES y en→en-GB', () => {
    expect(localeToBcp47('es')).toBe('es-ES');
    expect(localeToBcp47('en')).toBe('en-GB');
    expect(localeToBcp47('lo-que-sea')).toBe('es-ES');
  });
});

// ── estados ─────────────────────────────────────────────────────────────────
describe('estilos y claves de estado', () => {
  it('hay un estilo de badge para cada estado del enum', () => {
    const statuses: AppointmentStatus[] = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
    for (const s of statuses) {
      expect(STATUS_BADGE_CLASS[s]).toBeTruthy();
    }
  });

  it('statusLabelKey construye la clave i18n', () => {
    expect(statusLabelKey('confirmed')).toBe('appointments.status.confirmed');
  });
});
