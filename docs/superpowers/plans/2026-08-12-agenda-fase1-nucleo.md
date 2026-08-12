# Agenda — Fase 1 (núcleo: timeline elástico + estados unificados) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Los pasos usan checkbox (`- [ ]`).

**Goal:** Crear la lógica pura y testeable del **eje de tiempo elástico** de la agenda (el motor que garantiza que ninguna tarjeta se corta y que la franja se estira lo justo) y unificar el color de estado de cita en una sola fuente. Sin UI todavía; es el cimiento de las fases siguientes.

**Architecture:** Un módulo puro `src/lib/agenda/timeline.ts` (sin IO, sin React) con `buildDayTimeline` (mapeo tiempo↔px elástico) y `snapMinutes`. Y consolidar el color de estado reutilizando `src/components/appointments/appointment-status.tsx` (ya es fuente única de labels/badge/accent) añadiendo un helper de "punto" y eliminando el `statusDot` divergente de `calendar-view.tsx`.

**Tech Stack:** TypeScript strict, Vitest. (Sin Supabase, sin migración.)

**Referencia:** el algoritmo está portado del mockup aprobado `docs/superpowers/reference/2026-08-12-agenda-mockup.html` (función `buildTimeline`). Spec: `docs/superpowers/specs/2026-08-12-agenda-redesign-design.md`.

## Global Constraints

- Rama `hat3x/HAT3X-038` (repo `clients/projects/salon-os`).
- TypeScript strict — sin `any`. Lógica pura: **sin** imports de React, Supabase ni `@/lib/salon`.
- Minutos = enteros (minutos desde medianoche local). Sin fechas ni zonas horarias en esta capa (eso lo resuelve el llamador con `@/lib/booking/timezone`).
- No romper la suite existente. `tsc` 0 y Vitest verde al final.

---

### Task 1: Lógica pura del eje de tiempo elástico + snap

**Files:**
- Create: `src/lib/agenda/timeline.ts`
- Test: `src/tests/unit/agenda-timeline.test.ts`

**Interfaces:**
- Produces: `TimelineItem` (`{ startMin: number; durationMin: number; needsExtra?: boolean }`); `DayTimeline` (`{ yAt(min:number):number; minAt(y:number):number; total:number }`); `buildDayTimeline(items, opts): DayTimeline`; `snapMinutes(min, step): number`.
- `opts`: `{ dayStartMin:number; dayEndMin:number; base:number; minCard:number; extra:number; gridEveryMin?:number }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/agenda-timeline.test.ts
import { describe, it, expect } from "vitest";

import { buildDayTimeline, snapMinutes } from "@/lib/agenda/timeline";

const OPTS = { dayStartMin: 9 * 60, dayEndMin: 20 * 60, base: 1, minCard: 60, extra: 40 };

describe("snapMinutes", () => {
  it("redondea al múltiplo más cercano", () => {
    expect(snapMinutes(612, 5)).toBe(610);
    expect(snapMinutes(613, 5)).toBe(615);
    expect(snapMinutes(600, 15)).toBe(600);
  });
});

describe("buildDayTimeline", () => {
  it("una cita larga NO se estira (altura natural >= minCard)", () => {
    const tl = buildDayTimeline([{ startMin: 9 * 60, durationMin: 90 }], OPTS);
    const h = tl.yAt(9 * 60 + 90) - tl.yAt(9 * 60);
    expect(h).toBeCloseTo(90, 5); // 90min * base 1 = 90px, > minCard 60
  });

  it("una cita corta se estira hasta minCard (nunca se corta)", () => {
    const tl = buildDayTimeline([{ startMin: 10 * 60, durationMin: 20 }], OPTS);
    const h = tl.yAt(10 * 60 + 20) - tl.yAt(10 * 60);
    expect(h).toBeGreaterThanOrEqual(60 - 1e-6); // 20px natural -> estirado a >= 60
  });

  it("una cita con nota reserva altura extra (minCard + extra)", () => {
    const tl = buildDayTimeline([{ startMin: 10 * 60, durationMin: 20, needsExtra: true }], OPTS);
    const h = tl.yAt(10 * 60 + 20) - tl.yAt(10 * 60);
    expect(h).toBeGreaterThanOrEqual(100 - 1e-6); // minCard 60 + extra 40
  });

  it("mantiene el orden temporal y el eje es monótono creciente", () => {
    const tl = buildDayTimeline(
      [{ startMin: 9 * 60, durationMin: 20 }, { startMin: 11 * 60, durationMin: 30 }],
      OPTS,
    );
    expect(tl.yAt(9 * 60)).toBeLessThan(tl.yAt(11 * 60));
    expect(tl.total).toBeGreaterThan(0);
  });

  it("minAt es la inversa de yAt (dentro de la tolerancia de snap)", () => {
    const tl = buildDayTimeline([{ startMin: 10 * 60, durationMin: 20 }], OPTS);
    const min = 12 * 60 + 30;
    expect(tl.minAt(tl.yAt(min))).toBeCloseTo(min, 3);
  });

  it("clampa fuera de rango a los extremos del día", () => {
    const tl = buildDayTimeline([], OPTS);
    expect(tl.yAt(8 * 60)).toBe(0);
    expect(tl.yAt(21 * 60)).toBeCloseTo(tl.total, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/tests/unit/agenda-timeline.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/agenda/timeline.ts
/**
 * Eje de tiempo ELÁSTICO de la agenda (vista Día). Puro, sin IO.
 *
 * Cada franja del día se estira lo justo para que ninguna tarjeta quede por
 * debajo de su altura mínima legible (`minCard`, +`extra` si la cita lleva
 * nota). Como todas las columnas (profesionales) comparten el mismo eje, las
 * horas siguen alineadas entre columnas. Portado del mockup aprobado.
 *
 * Minutos = enteros desde medianoche local (la zona horaria la resuelve el
 * llamador). No conoce React ni Supabase.
 */

export interface TimelineItem {
  startMin: number;
  durationMin: number;
  /** La cita necesita altura extra (p. ej. muestra una nota en la tarjeta). */
  needsExtra?: boolean;
}

export interface DayTimeline {
  /** Píxel del eje para un minuto dado (clampa a [dayStart, dayEnd]). */
  yAt(min: number): number;
  /** Minuto del día para un píxel dado (inversa de `yAt`). */
  minAt(y: number): number;
  /** Altura total del eje en píxeles. */
  total: number;
}

export interface DayTimelineOptions {
  dayStartMin: number;
  dayEndMin: number;
  /** Píxeles por minuto en la escala base (antes de estirar). */
  base: number;
  /** Altura mínima legible de una tarjeta, en píxeles. */
  minCard: number;
  /** Altura extra a reservar cuando la cita `needsExtra`. */
  extra: number;
  /** Marcas de rejilla (líneas de hora) a incluir como cortes, en minutos. Def. 60. */
  gridEveryMin?: number;
}

/** Redondea `min` al múltiplo de `step` más cercano. */
export function snapMinutes(min: number, step: number): number {
  return Math.round(min / step) * step;
}

export function buildDayTimeline(
  items: readonly TimelineItem[],
  opts: DayTimelineOptions,
): DayTimeline {
  const { dayStartMin: lo, dayEndMin: hi, base, minCard, extra } = opts;
  const grid = opts.gridEveryMin ?? 60;

  // Cortes: extremos del día + marcas de hora + inicios/fines de cada cita.
  const cuts = new Set<number>([lo, hi]);
  for (let t = Math.ceil(lo / grid) * grid; t < hi; t += grid) cuts.add(t);
  for (const it of items) {
    cuts.add(it.startMin);
    cuts.add(it.startMin + it.durationMin);
  }
  const B = [...cuts].filter((x) => x >= lo && x <= hi).sort((a, b) => a - b);

  // Altura de cada segmento: base * duración * factor de estiramiento.
  const segH: number[] = [];
  const Y: number[] = [0];
  for (let i = 0; i < B.length - 1; i += 1) {
    const ds = B[i + 1] - B[i];
    let factor = 1;
    for (const it of items) {
      const s = it.startMin;
      const e = it.startMin + it.durationMin;
      if (s <= B[i] && e >= B[i + 1]) {
        const natural = it.durationMin * base;
        const required = minCard + (it.needsExtra ? extra : 0);
        if (natural > 0) factor = Math.max(factor, Math.max(natural, required) / natural);
      }
    }
    const h = ds * base * factor;
    segH.push(h);
    Y.push(Y[i] + h);
  }
  const total = Y[Y.length - 1];

  function yAt(min: number): number {
    const clamped = Math.max(lo, Math.min(hi, min));
    for (let i = 0; i < B.length - 1; i += 1) {
      if (clamped <= B[i + 1]) {
        return Y[i] + ((clamped - B[i]) / (B[i + 1] - B[i])) * segH[i];
      }
    }
    return total;
  }

  function minAt(y: number): number {
    const clamped = Math.max(0, Math.min(total, y));
    for (let i = 0; i < segH.length; i += 1) {
      if (clamped <= Y[i + 1]) {
        const frac = segH[i] > 0 ? (clamped - Y[i]) / segH[i] : 0;
        return B[i] + frac * (B[i + 1] - B[i]);
      }
    }
    return hi;
  }

  return { yAt, minAt, total };
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/tests/unit/agenda-timeline.test.ts` → PASS. Luego `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agenda/timeline.ts src/tests/unit/agenda-timeline.test.ts
git commit -m "feat(agenda): eje de tiempo elastico (buildDayTimeline) + snap"
```

---

### Task 2: Unificar el color de estado (punto) + eliminar el divergente

**Files:**
- Modify: `src/components/appointments/appointment-status.tsx` (exportar `appointmentStatusDot`)
- Modify: `src/app/(dashboard)/appointments/calendar-view.tsx` (usar el helper en vez de su `statusDot` con colores crudos)
- Test: `src/tests/unit/appointment-status.test.ts`

**Interfaces:**
- Consumes: `AppointmentStatus`, el `STATUS_STYLES` interno.
- Produces: `appointmentStatusDot(status: AppointmentStatus): string` (clase Tailwind del punto de color, p. ej. `"bg-warning"`).

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/unit/appointment-status.test.ts
import { describe, it, expect } from "vitest";

import {
  appointmentStatusDot,
  appointmentStatusAccent,
  APPOINTMENT_STATUS_LABELS,
} from "@/components/appointments/appointment-status";

describe("appointmentStatusDot", () => {
  it("devuelve una clase de color por estado, coherente con el acento", () => {
    expect(appointmentStatusDot("pending")).toBe("bg-warning");
    expect(appointmentStatusDot("confirmed")).toBe("bg-primary");
    expect(appointmentStatusDot("completed")).toBe("bg-success");
    expect(appointmentStatusDot("cancelled")).toBe("bg-destructive");
  });
  it("cubre los 5 estados", () => {
    (Object.keys(APPOINTMENT_STATUS_LABELS) as (keyof typeof APPOINTMENT_STATUS_LABELS)[])
      .forEach((s) => expect(typeof appointmentStatusDot(s)).toBe("string"));
    expect(appointmentStatusAccent("no_show")).toContain("muted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/tests/unit/appointment-status.test.ts` → FAIL (`appointmentStatusDot` no existe).

- [ ] **Step 3: Write the implementation**

En `appointment-status.tsx`, junto a `appointmentStatusAccent`, añadir:
```ts
/** Clase de color sólido del punto indicador de estado (dot). */
export function appointmentStatusDot(status: AppointmentStatus): string {
  return STATUS_STYLES[status].dot;
}
```
En `calendar-view.tsx`: **leer primero** el fichero. Localizar su función local `statusDot` (que usa colores crudos `bg-amber-500`/`bg-emerald-500`…). Sustituir sus usos por `appointmentStatusDot` importado de `@/components/appointments/appointment-status` y **eliminar** la función local divergente. No cambiar ninguna otra lógica ni el layout de `calendar-view.tsx`. Nota: `STATUS_STYLES.confirmed.dot` es `"bg-primary"` (violeta de marca), no azul; es el color canónico correcto.

- [ ] **Step 4: Run test + typecheck** — `npx vitest run src/tests/unit/appointment-status.test.ts` → PASS; `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/appointments/appointment-status.tsx "src/app/(dashboard)/appointments/calendar-view.tsx" src/tests/unit/appointment-status.test.ts
git commit -m "refactor(agenda): unificar color de estado (appointmentStatusDot) y eliminar divergente"
```

---

### Task 3: Verificación integral

- [ ] **Step 1: Typecheck** — `npx tsc --noEmit` → 0.
- [ ] **Step 2: Suite completa** — `npx vitest run` → todo verde (previos + `agenda-timeline` + `appointment-status`).
- [ ] **Step 3: Build** — `npx next build` → exit 0 (no hay server actions nuevas, pero se confirma que nada se rompe) [[reference_nextjs_build_gate]].
- [ ] **Step 4: Nota** — sin cambio visible para el usuario (fase de cimiento); el despliegue se hará al aterrizar la Vista Día (Fase 2). No desplegar aún.

---

## Self-Review (cobertura)

- **Timeline elástico** (spec §3.2, §4) → Task 1 (`buildDayTimeline` con garantía de altura mínima + `needsExtra` para notas + `minAt` inversa para el arrastre de fases futuras). ✔
- **Snap fino** (spec §3.3) → `snapMinutes` (Task 1). ✔
- **Estados unificados** (spec §3.8, §4) → Task 2 (helper de punto + eliminación del divergente en `calendar-view.tsx`). ✔
- **Sin migración / puro** (spec §4) → Task 1 sin IO; Task 2 solo presentación. ✔
- **TDD + tsc 0 + suite + build** (spec §6, §7) → Tasks 1,2 con tests; Task 3 verifica. ✔
- Fuera de esta fase (Día UI, drawer, arrastre, semana, hora libre) → fases 2-6. ✔

**Consistencia de tipos:** `TimelineItem`/`DayTimeline`/`buildDayTimeline`/`snapMinutes` (Task 1) los consumirá `DayGrid` en Fase 2; `appointmentStatusDot` (Task 2) lo consumirán las tarjetas y la leyenda en Fase 2.
