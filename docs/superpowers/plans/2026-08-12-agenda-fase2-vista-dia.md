# Agenda — Fase 2 (Vista Día: parrilla elástica por profesional) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recomendado) o executing-plans. Pasos con checkbox (`- [ ]`).

**Goal:** Sustituir la vista de día actual (lista vertical de tarjetas) por una **parrilla horaria con una columna por profesional**, eje de tiempo **elástico** (Fase 1), tarjetas legibles con nota, cabecera de profesionales **fija**, franjas de cierre, línea de "ahora", **KPIs del día** y **panel derecho** (mini-calendario + filtro de profesionales + leyenda). Primera fase visible; se despliega.

**Architecture:** Componentes cliente nuevos bajo `src/components/agenda/` que consumen los hooks existentes (`useAppointments`, `useProfessionals`, `useOverdueOrtho`) y la lógica pura de Fase 1 (`buildDayTimeline`, `snapMinutes`) + helpers puros nuevos (`agendaLocalMinutes`, `computeDayWindow`). El `appointments-view.tsx` pasa a renderizar la nueva parrilla en la vista "día", conservando por ahora los diálogos existentes (crear/cancelar/notas/reprogramar) y las vistas Semana/Lista actuales (se rehacen en Fase 5). Al pulsar una cita se abre, de momento, el diálogo de detalle/notas existente (el drawer llega en Fase 3).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, TanStack Query v5, Tailwind + shadcn/ui, Vitest, Playwright (verificación visual headless).

**Referencia visual/comportamiento:** `docs/superpowers/reference/2026-08-12-agenda-mockup.html` (portar CSS/estructura de la vista Día: `.grid-wrap`, `.col-head` sticky, `.col`, `.appt`, líneas de hora, `.closed-band`, `.nowline`, panel derecho, KPIs). Spec: `docs/superpowers/specs/2026-08-12-agenda-redesign-design.md`.

## Global Constraints

- Rama `hat3x/HAT3X-038`. TypeScript strict (`noUncheckedIndexedAccess` activo) — sin `any`; cuidado con accesos por índice.
- **RSC boundary** ([[reference_salonos_rsc_boundary]]): componentes cliente NO importan `@/lib/salon`; `salonId`/`timezone`/`sector`/`role` llegan por prop desde la página servidor.
- **UI con `ui-ux-pro-max`** en Tasks 2, 3, 4, 5; portar del mockup del repo manteniendo la paleta/tokens de Kairos (usar tokens semánticos existentes: `--primary`, `bg-warning/success/destructive`, `bg-muted`, `border`, `card`… no colores crudos).
- Estados de cita: usar SIEMPRE `appointment-status.tsx` (`APPOINTMENT_STATUS_LABELS`, `AppointmentStatusBadge`, `appointmentStatusAccent`, `appointmentStatusDot`).
- Sin migración. Reutiliza hooks/acciones existentes. `tsc` 0 + suite Vitest verde + `next build` OK antes del deploy [[reference_nextjs_build_gate]].
- Deploy por `node <scratchpad>/deploy_kairos.js`; verificación headless con Playwright (chromium en `C:/Users/josem/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe`).

---

### Task 1: Helpers puros del modelo de día (minutos locales + ventana del día)

**Files:**
- Create: `src/lib/agenda/day-model.ts`
- Test: `src/tests/unit/agenda-day-model.test.ts`

**Interfaces:**
- Consumes: `formatSlotTime` (`@/lib/booking/format`), `TimelineItem` (`@/lib/agenda/timeline`).
- Produces:
  - `agendaLocalMinutes(iso: string, timeZone: string): number` — minutos locales desde medianoche de un instante ISO.
  - `OpeningRange` (`{ startMin: number; endMin: number }`).
  - `computeDayWindow(ranges, items, fallback): { dayStartMin: number; dayEndMin: number; closed: OpeningRange[] }` — ventana del día (apertura ∪ citas, acotada por `fallback`) + **bandas de cierre** (huecos entre rangos de apertura).

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/agenda-day-model.test.ts
import { describe, it, expect } from "vitest";

import { agendaLocalMinutes, computeDayWindow } from "@/lib/agenda/day-model";

describe("agendaLocalMinutes", () => {
  it("convierte un instante ISO a minutos locales en la zona dada", () => {
    // 2026-08-12T07:30:00Z en Europe/Madrid (verano, UTC+2) = 09:30 local = 570 min
    expect(agendaLocalMinutes("2026-08-12T07:30:00Z", "Europe/Madrid")).toBe(9 * 60 + 30);
  });
});

describe("computeDayWindow", () => {
  const fallback = { startMin: 8 * 60, endMin: 21 * 60 };

  it("con apertura partida, la ventana abarca ambos tramos y marca el cierre de mediodía", () => {
    const ranges = [
      { startMin: 9 * 60, endMin: 14 * 60 },
      { startMin: 16 * 60, endMin: 20 * 60 },
    ];
    const w = computeDayWindow(ranges, [], fallback);
    expect(w.dayStartMin).toBe(9 * 60);
    expect(w.dayEndMin).toBe(20 * 60);
    expect(w.closed).toEqual([{ startMin: 14 * 60, endMin: 16 * 60 }]);
  });

  it("expande la ventana si hay citas fuera de la apertura", () => {
    const ranges = [{ startMin: 9 * 60, endMin: 14 * 60 }];
    const items = [{ startMin: 8 * 60 + 30, durationMin: 30 }];
    const w = computeDayWindow(ranges, items, fallback);
    expect(w.dayStartMin).toBe(8 * 60 + 30);
    expect(w.dayEndMin).toBe(14 * 60);
  });

  it("sin apertura definida, usa el fallback y no marca cierres", () => {
    const w = computeDayWindow([], [], fallback);
    expect(w.dayStartMin).toBe(8 * 60);
    expect(w.dayEndMin).toBe(21 * 60);
    expect(w.closed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/tests/unit/agenda-day-model.test.ts` → FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/agenda/day-model.ts
import { formatSlotTime } from "@/lib/booking/format";
import type { TimelineItem } from "@/lib/agenda/timeline";

/** Minutos locales desde medianoche de un instante ISO, en la zona dada. */
export function agendaLocalMinutes(iso: string, timeZone: string): number {
  const hhmm = formatSlotTime(iso, timeZone); // "HH:MM" en hora local
  const parts = hhmm.split(":");
  const h = Number.parseInt(parts[0] ?? "0", 10);
  const m = Number.parseInt(parts[1] ?? "0", 10);
  return h * 60 + m;
}

export interface OpeningRange {
  startMin: number;
  endMin: number;
}

export interface DayWindow {
  dayStartMin: number;
  dayEndMin: number;
  closed: OpeningRange[];
}

/**
 * Ventana del día para la parrilla: abarca la apertura y cualquier cita que se
 * salga, acotada por `fallback`. Las bandas de cierre son los huecos entre
 * rangos de apertura dentro de la ventana (p. ej. el descanso de mediodía).
 */
export function computeDayWindow(
  ranges: readonly OpeningRange[],
  items: readonly TimelineItem[],
  fallback: { startMin: number; endMin: number },
): DayWindow {
  const sorted = [...ranges].sort((a, b) => a.startMin - b.startMin);

  if (sorted.length === 0) {
    // Sin apertura: ventana = fallback ampliado por citas; sin cierres.
    let start = fallback.startMin;
    let end = fallback.endMin;
    for (const it of items) {
      start = Math.min(start, it.startMin);
      end = Math.max(end, it.startMin + it.durationMin);
    }
    return { dayStartMin: start, dayEndMin: end, closed: [] };
  }

  let start = sorted[0]?.startMin ?? fallback.startMin;
  let end = sorted[sorted.length - 1]?.endMin ?? fallback.endMin;
  for (const it of items) {
    start = Math.min(start, it.startMin);
    end = Math.max(end, it.startMin + it.durationMin);
  }

  const closed: OpeningRange[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (cur === undefined || next === undefined) continue;
    if (next.startMin > cur.endMin) {
      closed.push({ startMin: cur.endMin, endMin: next.startMin });
    }
  }

  return { dayStartMin: start, dayEndMin: end, closed };
}
```

- [ ] **Step 4: Run test + typecheck** — `npx vitest run src/tests/unit/agenda-day-model.test.ts` → PASS; `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit** — `git add src/lib/agenda/day-model.ts src/tests/unit/agenda-day-model.test.ts && git commit -m "feat(agenda): helpers puros del modelo de dia (minutos locales + ventana)"`

---

### Task 2: Componente `DayGrid` (parrilla elástica por profesional)

**Files:**
- Create: `src/components/agenda/day-grid.tsx`

**Interfaces:**
- Props: `{ appointments: AppointmentWithDetails[]; professionals: {id:string; full_name:string; color:string|null}[]; timezone: string; isLoading: boolean; isError: boolean; overdueByCustomer?: Record<string, number>; onSelectAppointment(a: AppointmentWithDetails): void; onSelectSlot(professionalId: string, startMin: number): void }`.
- Consumes: `buildDayTimeline`, `snapMinutes` (`@/lib/agenda/timeline`); `agendaLocalMinutes`, `computeDayWindow` (Task 1); `appointmentStatusAccent`, `appointmentStatusDot`, `AppointmentStatusBadge` (`@/components/appointments/appointment-status`); `formatSlotTime`, `formatPrice` (`@/lib/booking/format`).

> **OBLIGATORIO:** invoca `ui-ux-pro-max`. **Porta** la vista Día del mockup `docs/superpowers/reference/2026-08-12-agenda-mockup.html` (estructura `.grid-wrap`/`.col-head` sticky/`.col`/`.appt`/líneas de hora/`.closed-band`/`.nowline`, y la tarjeta con hora–hora, paciente, servicio y **nota**). Reglas críticas ya depuradas en el mockup: la cabecera va **sticky, opaca y con z alto**; el contenedor scrollable **sin `padding-top`** que deje franja (usar `margin-top` en el wrapper); `.body` con su propio contexto de apilado (z-index:0) para que las citas queden por debajo de la cabecera. Adáptalo a Tailwind/tokens de Kairos.

**Comportamiento:**
- Columnas = `professionals` (ya filtradas por el padre). Cada cita: `startMin = agendaLocalMinutes(a.starts_at, tz)`, `durationMin = a.service?.duration_minutes ?? (a.ends_at−a.starts_at)/60000`, `needsExtra = !!a.notes`.
- Ventana del día: `computeDayWindow([], items, { startMin: 8*60, endMin: 21*60 })` (las bandas de cierre reales llegan al integrar horarios; por ahora fallback 08–21 sin `closed`).
- `buildDayTimeline(items, { dayStartMin, dayEndMin, base: 1.35, minCard: 74, extra: 40 })`; posiciona cada tarjeta con `yAt`.
- Tarjeta coloreada por estado (fondo tintado + acento del color del profesional), badge de estado, hora–hora, paciente (+ teléfono opcional), servicio, **nota** (2 líneas máx), y **morosidad** si `overdueByCustomer[a.customer_id] > 0` (píldora roja "⚠ N vencida(s)").
- Línea de "ahora" (roja) a `agendaLocalMinutes(new Date().toISOString(), tz)`.
- Estados: `isLoading` → skeletons de columnas; `isError` → mensaje con reintento; vacío → estado vacío amable.
- Pulsar tarjeta → `onSelectAppointment(a)`. Pulsar hueco vacío → `onSelectSlot(profId, snapMinutes(minAtDelCursor, 5))`.

- [ ] **Step 1: Implementar** (ui-ux-pro-max + port del mockup) — `"use client"`, sin importar `@/lib/salon`.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → 0.
- [ ] **Step 3: Commit** — `git add src/components/agenda/day-grid.tsx && git commit -m "feat(agenda): DayGrid parrilla elastica por profesional (ui-ux-pro-max)"`

---

### Task 3: Componente `AgendaSidePanel` (mini-calendario + filtro + leyenda)

**Files:**
- Create: `src/components/agenda/agenda-side-panel.tsx`

**Interfaces:**
- Props: `{ month: string; selectedDate: string; datesWithAppointments?: Set<string>; professionals: {id:string;full_name:string;color:string|null}[]; activeProfessionalIds: Set<string>; onToggleProfessional(id:string):void; onSelectDate(date:string):void; onChangeMonth(delta:number):void }`.
- Consumes: `APPOINTMENT_STATUS_LABELS`, `appointmentStatusDot` (leyenda).

> **OBLIGATORIO `ui-ux-pro-max`.** Porta el panel derecho del mockup (`.side`: mini-mes navegable, lista de profesionales con punto de color + check, leyenda de estados en 2 columnas). Compacto (~236px).

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Typecheck** → 0.
- [ ] **Step 3: Commit** — `feat(agenda): AgendaSidePanel (mini-cal + filtro + leyenda)`.

---

### Task 4: Componente `AgendaDayKpis` (tira de KPIs del día)

**Files:**
- Create: `src/components/agenda/agenda-day-kpis.tsx`

**Interfaces:**
- Props: `{ appointments: AppointmentWithDetails[] }`.
- Calcula: total, confirmadas, pendientes, completadas, facturación prevista (`sum(price_cents)` de no canceladas → `formatPrice`).

> **`ui-ux-pro-max`.** Porta `.kpis`/`.kpi` del mockup (5 tarjetas: valor grande `tabular-nums` + etiqueta, color por estado).

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Typecheck** → 0.
- [ ] **Step 3: Commit** — `feat(agenda): AgendaDayKpis`.

---

### Task 5: Integrar la Vista Día en `appointments-view.tsx` + pasar rol

**Files:**
- Modify: `src/app/(dashboard)/appointments/appointments-view.tsx`
- Modify: `src/app/(dashboard)/appointments/page.tsx` (pasar `role`)

**Interfaces:**
- Consumes: `DayGrid` (T2), `AgendaSidePanel` (T3), `AgendaDayKpis` (T4); hooks existentes.

> **Antes de editar, LEE `appointments-view.tsx` entero** (~800 líneas). Solo se **sustituye el bloque de la vista "día"** (la lista de tarjetas + el filtro de profesional inline) por `<AgendaDayKpis/>` + layout de 2 columnas `<DayGrid/>` (centro) + `<AgendaSidePanel/>` (derecha). El estado de fecha/vista/filtro y los diálogos existentes (Nueva cita, cancelar, notas, reprogramar, borrar) **se conservan**. Las vistas Semana/Lista (`CalendarView`) **no se tocan** en esta fase.

**Cableado:**
- Estado `activeProfessionalIds` (Set; por defecto todos). El filtro de profesional (hoy fila de pills) se **mueve** al `AgendaSidePanel`.
- `useAppointments(salonId, date)` (todas del día; filtrar en cliente por profesional activo para las columnas). `useProfessionals(salonId)`. `useOverdueOrtho(salonId, customerIds, today, sector === "odontologia")` → `overdueByCustomer`.
- `DayGrid.onSelectAppointment(a)` → por AHORA abre el diálogo/estado de detalle o notas existente; las acciones (confirmar/cancelar/etc.) siguen accesibles desde donde ya existan; el **drawer** unificado llega en Fase 3. Interino aceptable: `onSelectAppointment` abre el diálogo de notas existente + un pequeño popover con las mutaciones ya presentes en el archivo.
- `DayGrid.onSelectSlot(profId, startMin)` → abrir el diálogo "Nueva cita" existente (prefijar profesional/hora si es trivial; la hora libre real llega en Fase 6).
- `page.tsx`: obtener el rol con `getActiveMembership()` y pasarlo como prop `role` a `AppointmentsView`.

- [ ] **Step 1: Leer `appointments-view.tsx` y `page.tsx`.**
- [ ] **Step 2: Implementar la sustitución (día) + panel + KPIs; `page.tsx` pasa `role`.** (ui-ux-pro-max para el layout de 2 columnas.)
- [ ] **Step 3: Typecheck** → 0.
- [ ] **Step 4: Verificación visual** `npm run dev` → `/appointments` (día): parrilla por profesional, cabecera fija sin bleed, tarjetas con nota, KPIs, panel derecho; Semana/Lista siguen OK.
- [ ] **Step 5: Commit** — `feat(agenda): integrar Vista Dia (parrilla+panel+KPIs) en appointments`.

---

### Task 6: Verificación integral + captura headless + deploy

- [ ] **Step 1: Typecheck** `npx tsc --noEmit` → 0.
- [ ] **Step 2: Suite** `npx vitest run` → verde (previos + `agenda-day-model`).
- [ ] **Step 3: Build** `npx next build` → exit 0.
- [ ] **Step 4: Captura headless** — Playwright (chromium-1217): cargar `/appointments` (o el mockup si no hay sesión de login), hacer scroll y **verificar cabecera fija sin bleed** y que ninguna tarjeta se corta. Guardar screenshot y revisarlo.
- [ ] **Step 5: Deploy** `node <scratchpad>/deploy_kairos.js` → READY → verificar en `https://kairosmanager.app/appointments`.

---

## Self-Review (cobertura del spec, sub-fase Vista Día)

- **Parrilla por profesional + eje elástico** (spec §3.2) → Task 2. ✔
- **Cabecera fija sin bleed / tarjetas sin cortar** (spec §3.2, criterio 1) → Task 2 + Task 6. ✔
- **Nota en la tarjeta + morosidad** (spec §3.2) → Task 2. ✔
- **Panel derecho (mini-cal + filtro + leyenda)** (spec §3.1, §3.8) → Task 3. ✔
- **KPIs del día** (spec §3.1) → Task 4. ✔
- **Integración sin romper crear/editar ni Semana/Lista** (spec §5) → Task 5. ✔
- **Minutos locales / ventana** (spec §4) → Task 1 (puro, testeado). ✔
- **Sin migración, reutiliza hooks/acciones** (spec §4) → todas. ✔
- **Deploy + tsc/suite/build + captura** (spec §6,§7) → Task 6. ✔
- Fuera de esta fase (drawer, arrastre, hora libre real, Semana/Lista nuevas) → Fases 3-6. ✔

**Consistencia:** `agendaLocalMinutes`/`computeDayWindow` (T1) → `DayGrid` (T2); `DayGrid`/`AgendaSidePanel`/`AgendaDayKpis` (T2-4) → `appointments-view.tsx` (T5); color de estado siempre desde `appointment-status.tsx` (Fase 1).
