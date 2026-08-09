/**
 * CONTRATO de aislamiento de la rejilla del día (sub-6).
 *
 * La app de cliente (`BookingWizard`) y el panel (`AppointmentForm`) pintan la MISMA
 * rejilla COMPLETA de la jornada (`view=day`: libres + ocupados/pasados/cerrados), pero
 * ambos siguen reservando ÚNICAMENTE huecos libres. Y por diseño, la EXPOSICIÓN de una
 * cita de 3 fases del profesional aparece en la rejilla como hueco reservable (un
 * servicio corto cabe en ella). Aquí se ejercita END-TO-END cada consumidor con una
 * jornada de 3 fases y se comprueba que:
 *
 *   · Los tramos OCUPADOS se ven pero están deshabilitados (no seleccionables).
 *   · Solo el hueco de EXPOSICIÓN (libre) puede elegirse y es el que se acaba reservando.
 *
 * — La app de cliente stubbea `fetch` (disponibilidad `view=day` + creación).
 * — El panel mockea `@/hooks/use-appointments` (para inyectar la rejilla y espiar la
 *   creación) y `@/components/ui/select` por un `<select>` nativo (los eventos de puntero
 *   de Radix son inestables en jsdom; el foco de este test es el CONTRATO de reserva, no
 *   el widget). Ninguno de estos mocks afecta a la app de cliente, que no los importa.
 */
import { createElement } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fixtures compartidas (izadas para poder usarlas dentro de la factory de vi.mock).
const fx = vi.hoisted(() => {
  const SERVICE_ID = "22222222-2222-2222-2222-222222222222";
  const PROF_ID = "33333333-3333-3333-3333-333333333333";

  // Jornada con UNA cita de 3 fases del profesional ya reservada (Europe/Madrid, UTC+2):
  //   · aplicación 10:00 (08:00Z) → occupied · exposición 10:30 (08:30Z) → LIBRE
  //   · post       11:30 (09:30Z) → occupied
  const APPLICATION = {
    startsAt: "2026-07-20T08:00:00.000Z",
    endsAt: "2026-07-20T08:30:00.000Z",
    professionalId: PROF_ID,
    available: false,
    reason: "occupied" as const,
  }; // 10:00
  const EXPOSURE = {
    startsAt: "2026-07-20T08:30:00.000Z",
    endsAt: "2026-07-20T09:00:00.000Z",
    professionalId: PROF_ID,
    available: true,
  }; // 10:30 — hueco de exposición reservable
  const POST = {
    startsAt: "2026-07-20T09:30:00.000Z",
    endsAt: "2026-07-20T10:00:00.000Z",
    professionalId: PROF_ID,
    available: false,
    reason: "occupied" as const,
  }; // 11:30

  const GRID = [APPLICATION, EXPOSURE, POST];

  // Forma «dashboard» (snake_case) que consume el panel.
  const PANEL_SERVICES = [
    {
      id: SERVICE_ID,
      name: "Corte de pelo",
      duration_minutes: 30,
      price_cents: 2500,
      currency: "EUR",
    },
  ];
  const PANEL_PROFESSIONALS = [{ id: PROF_ID, full_name: "Ana" }];

  return {
    SERVICE_ID,
    PROF_ID,
    APPLICATION,
    EXPOSURE,
    POST,
    GRID,
    PANEL_SERVICES,
    PANEL_PROFESSIONALS,
    // Entradas capturadas del `createAppointment` del panel.
    created: [] as Array<Record<string, unknown>>,
  };
});

// El panel usa estos hooks; los mockeamos para inyectar la rejilla y espiar la creación.
vi.mock("@/hooks/use-appointments", () => ({
  useServices: () => ({ data: fx.PANEL_SERVICES }),
  useProfessionals: () => ({ data: fx.PANEL_PROFESSIONALS }),
  useServiceProfessionalsMap: () => ({ data: { [fx.SERVICE_ID]: [fx.PROF_ID] } }),
  useAvailabilityDaySlots: () => ({
    data: fx.GRID,
    isLoading: false,
    isError: false,
    isSuccess: true,
  }),
  useCreateAppointment: () => ({
    mutate: (
      input: Record<string, unknown>,
      opts?: { onSuccess?: (r: { ok: boolean }) => void },
    ) => {
      fx.created.push(input);
      opts?.onSuccess?.({ ok: true });
    },
    isPending: false,
    isError: false,
    data: undefined,
    error: null,
    reset: () => {},
  }),
}));

// El formulario usa useCustomerSearch (buscador de cliente existente). Se mockea
// para no requerir QueryClient; devuelve una búsqueda vacía (el test usa alta manual).
vi.mock("@/hooks/use-customers", () => ({
  useCustomerSearch: () => ({ data: [], isFetching: false }),
}));

// `<select>` nativo equivalente al Select de Radix (evita sus eventos de puntero).
vi.mock("@/components/ui/select", async () => {
  const { createElement: h } = await import("react");
  return {
    Select: ({
      value,
      onValueChange,
      disabled,
      children,
    }: {
      value: string;
      onValueChange: (v: string) => void;
      disabled?: boolean;
      children?: ReactNode;
    }) =>
      h(
        "select",
        {
          value,
          disabled,
          onChange: (e: ChangeEvent<HTMLSelectElement>) => onValueChange(e.target.value),
        },
        children,
      ),
    SelectTrigger: ({ children }: { children?: ReactNode }) => children,
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: ReactNode }) => children,
    SelectItem: ({ value, children }: { value: string; children?: ReactNode }) =>
      h("option", { value }, children),
  };
});

import { BookingWizard } from "@/app/(public)/reservar/[slug]/booking-wizard";
import { AppointmentForm } from "@/app/(dashboard)/appointments/appointment-form";
import type { BookingBootstrap } from "@/lib/booking/types";

const TZ = "Europe/Madrid";
const SALON_ID = "11111111-1111-1111-1111-111111111111";
const SLUG = "estudio-nova";

// ─────────────────────────────────────────────────────────────────────────────
// App de cliente — BookingWizard con la rejilla completa vía view=day.
// ─────────────────────────────────────────────────────────────────────────────

const BOOTSTRAP: BookingBootstrap = {
  salon: {
    id: SALON_ID,
    name: "Estudio Nova",
    slug: SLUG,
    timezone: TZ,
    phone: null,
    address: null,
  },
  services: [
    {
      id: fx.SERVICE_ID,
      name: "Corte de pelo",
      description: null,
      category: null,
      durationMinutes: 30,
      priceCents: 2500,
      currency: "EUR",
    },
  ],
  professionals: [{ id: fx.PROF_ID, fullName: "Ana", color: "#e11d48" }],
  serviceProfessionals: { [fx.SERVICE_ID]: [fx.PROF_ID] },
};

const CONFIRMATION = {
  appointmentId: "44444444-4444-4444-4444-444444444444",
  startsAt: fx.EXPOSURE.startsAt,
  endsAt: fx.EXPOSURE.endsAt,
  professionalName: "Ana",
  serviceName: "Corte de pelo",
  salonName: "Estudio Nova",
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

interface FetchCalls {
  availabilityUrls: string[];
  postBodies: Array<Record<string, unknown>>;
}

/**
 * `fetch` sintético: con `view=day` (profesional concreto) devuelve la rejilla COMPLETA
 * de 3 fases; el POST responde 201. Registra las llamadas para afirmar sobre lo enviado.
 */
function installFetch(): FetchCalls {
  const calls: FetchCalls = { availabilityUrls: [], postBodies: [] };
  global.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/availability")) {
        calls.availabilityUrls.push(url);
        return jsonResponse(200, { daySlots: fx.GRID });
      }
      calls.postBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return jsonResponse(201, CONFIRMATION);
    },
  ) as unknown as typeof fetch;
  return calls;
}

function renderWizard(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(BookingWizard, { slug: SLUG, bootstrap: BOOTSTRAP }),
    ),
  );
}

const originalFetch = global.fetch;

beforeEach(() => {
  fx.created.length = 0;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  global.fetch = originalFetch;
});

describe("Contrato · app de cliente reserva solo huecos libres pese a la rejilla completa", () => {
  it("muestra los ocupados deshabilitados y reserva únicamente el hueco de exposición", async () => {
    const user = userEvent.setup();
    const calls = installFetch();

    renderWizard();

    // Servicio → profesional CONCRETO (dispara view=day → rejilla completa).
    await user.click(screen.getByRole("button", { name: /Corte de pelo/i }));
    await user.click(screen.getByRole("button", { name: /Ana/ }));

    // El tramo OCUPADO (aplicación, 10:00) se ve pero está deshabilitado y da el motivo.
    const occupied = await screen.findByRole("button", { name: "10:00 — ocupado" });
    expect(occupied).toHaveAttribute("aria-disabled", "true");

    // Click en el ocupado: no avanza (seguimos en la elección de hora).
    await user.click(occupied);
    expect(screen.getByRole("button", { name: "10:30" })).toBeInTheDocument();
    expect(screen.queryByText(/Ya casi está/i)).toBeNull();

    // El hueco de EXPOSICIÓN (10:30, libre) sí reserva.
    await user.click(screen.getByRole("button", { name: "10:30" }));
    await user.type(screen.getByLabelText(/Nombre y apellidos/i), "Ana García");
    await user.type(screen.getByLabelText(/Teléfono/i), "600123123");
    await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));

    expect(await screen.findByText("¡Reserva confirmada!")).toBeInTheDocument();

    // Reservó EXACTAMENTE el hueco de exposición (libre), no un tramo ocupado.
    expect(calls.postBodies).toHaveLength(1);
    expect(calls.postBodies[0]!.startsAt).toBe(fx.EXPOSURE.startsAt);
    expect([fx.APPLICATION.startsAt, fx.POST.startsAt]).not.toContain(
      calls.postBodies[0]!.startsAt,
    );
    // Y pidió la rejilla completa (view=day) con el profesional concreto.
    expect(calls.availabilityUrls.some((u) => u.includes("view=day"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Panel — AppointmentForm con la misma rejilla completa de 3 fases.
// ─────────────────────────────────────────────────────────────────────────────
describe("Contrato · el panel reserva solo huecos libres pese a la rejilla completa", () => {
  function renderPanel(): { onSuccess: ReturnType<typeof vi.fn> } {
    const onSuccess = vi.fn();
    render(
      createElement(AppointmentForm, {
        salonId: SALON_ID,
        salonSlug: SLUG,
        timezone: TZ,
        onSuccess,
        onCancel: vi.fn(),
      }),
    );
    return { onSuccess };
  }

  it("los ocupados no se pueden elegir; el hueco de exposición sí crea la cita", async () => {
    const user = userEvent.setup();
    const { onSuccess } = renderPanel();

    const serviceSelect = screen.getAllByRole("combobox")[0]!;
    // Elegir servicio → aparece la rejilla; luego profesional concreto (view=day).
    await user.selectOptions(serviceSelect, fx.SERVICE_ID);
    await user.selectOptions(screen.getAllByRole("combobox")[1]!, fx.PROF_ID);

    // El ocupado (10:00) se muestra pero está deshabilitado y expone el motivo.
    const occupied = await screen.findByRole("button", { name: "10:00 — ocupado" });
    expect(occupied).toHaveAttribute("aria-disabled", "true");

    // Sin selección válida, «Crear cita» sigue deshabilitado (el ocupado no selecciona).
    await user.click(occupied);
    expect(screen.getByRole("button", { name: /Crear cita/i })).toBeDisabled();

    // El hueco de EXPOSICIÓN (10:30, libre) sí se elige.
    await user.click(screen.getByRole("button", { name: "10:30" }));
    await user.type(screen.getByLabelText("Nombre y apellidos"), "Ana García");
    // Match exacto: el buscador de cliente tiene un aria-label que también contiene
    // "teléfono", así que un regex /Teléfono/i sería ambiguo.
    await user.type(screen.getByLabelText("Teléfono"), "600123123");
    await user.click(screen.getByRole("button", { name: /Crear cita/i }));

    // Creó EXACTAMENTE la cita del hueco de exposición, con el profesional del slot.
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(fx.created).toHaveLength(1);
    const input = fx.created[0]!;
    expect(input.startsAt).toBe(fx.EXPOSURE.startsAt);
    expect(input.endsAt).toBe(fx.EXPOSURE.endsAt);
    expect(input.professionalId).toBe(fx.PROF_ID); // slot.professionalId, no el estado
    expect([fx.APPLICATION.startsAt, fx.POST.startsAt]).not.toContain(input.startsAt);
  });
});
