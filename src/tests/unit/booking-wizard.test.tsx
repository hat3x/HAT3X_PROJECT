/**
 * Asistente de reserva pública (sub-5) — el COMPONENTE que orquesta el flujo.
 *
 * El contrato PURO del endpoint ya está fijado aparte: los esquemas Zod en
 * `schema.ts` y la lógica de servidor en los tests de integración (booking-phases,
 * booking-customer-phone). Aquí se prueba lo que ESOS no cubren: que
 * `BookingWizard` cablea el recorrido servicio → profesional → fecha → hueco →
 * datos → POST y, en particular:
 *
 *   1. Recorrido feliz — envía al POST EXACTAMENTE el contrato de
 *      `bookingCustomerSchema` (sin inventar campos del customer) y muestra una
 *      confirmación clara con los datos de la cita.
 *   2. Hueco ocupado (409) — el error es RECUPERABLE: avisa con un mensaje legible
 *      y devuelve al paso de fecha REFRESCANDO la disponibilidad (la caché es de
 *      30 s: sin refetch se reofrecería la hora ya ocupada).
 *   3. Datos no válidos / salón no disponible — surfacea el mensaje legible del
 *      servidor tal cual, sin ofrecer la recuperación de hueco (que solo aplica al
 *      409).
 *
 * Se stubbea `fetch` (disponibilidad + creación); el resto es React real dentro de
 * un QueryClientProvider propio, para ejercitar el componente como lo ve el usuario.
 */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BookingWizard } from "@/app/(public)/reservar/[slug]/booking-wizard";
import type {
  BookingBootstrap,
  BookingPrefill,
  PublicSlot,
} from "@/lib/booking/types";

const SALON_ID = "11111111-1111-1111-1111-111111111111";
const SERVICE_ID = "22222222-2222-2222-2222-222222222222";
const PROF_ID = "33333333-3333-3333-3333-333333333333";

/** Hueco de las 09:00 UTC → 11:00 en Europe/Madrid (verano, UTC+2). */
const SLOT: PublicSlot = {
  startsAt: "2026-07-20T09:00:00.000Z",
  endsAt: "2026-07-20T09:30:00.000Z",
  professionalId: PROF_ID,
};
const SLOT_LABEL = "11:00";

const BOOTSTRAP: BookingBootstrap = {
  salon: {
    id: SALON_ID,
    name: "Estudio Nova",
    slug: "estudio-nova",
    timezone: "Europe/Madrid",
    phone: "600 100 200",
    address: "Calle Mayor 1",
  },
  services: [
    {
      id: SERVICE_ID,
      name: "Corte de pelo",
      description: null,
      category: null,
      durationMinutes: 30,
      priceCents: 2500,
      currency: "EUR",
    },
  ],
  professionals: [{ id: PROF_ID, fullName: "Ana", color: "#e11d48" }],
  serviceProfessionals: { [SERVICE_ID]: [PROF_ID] },
};

/** Respuesta mínima con la forma que consume el wizard (`ok`, `status`, `json`). */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

interface FetchCalls {
  availability: number;
  postBodies: unknown[];
}

/**
 * Instala un `fetch` sintético: la disponibilidad devuelve `slots` (por defecto un
 * único hueco) y el POST responde lo que dicte `post()`. Registra las llamadas para
 * poder afirmar sobre el cuerpo enviado y sobre el refresco de disponibilidad.
 */
function installFetch(opts: {
  slots?: PublicSlot[];
  post: () => { status: number; body: unknown };
}): FetchCalls {
  const calls: FetchCalls = { availability: 0, postBodies: [] };

  global.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/availability")) {
        calls.availability += 1;
        return jsonResponse(200, { slots: opts.slots ?? [SLOT] });
      }

      // POST de creación de reserva.
      calls.postBodies.push(JSON.parse(String(init?.body ?? "{}")));
      const { status, body } = opts.post();
      return jsonResponse(status, body);
    },
  ) as unknown as typeof fetch;

  return calls;
}

/** Monta el wizard con su propio QueryClient (sin reintentos, para que el error aflore ya). */
function renderWizard(prefill?: BookingPrefill | null): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(BookingWizard, {
        slug: "estudio-nova",
        bootstrap: BOOTSTRAP,
        prefill,
      }),
    ),
  );
}

/** Recorre servicio → «cualquier profesional» → hueco, hasta el paso de datos. */
async function advanceToContact(user: UserEvent): Promise<void> {
  await user.click(screen.getByRole("button", { name: /Corte de pelo/i }));
  await user.click(screen.getByRole("button", { name: /Cualquier profesional/i }));
  const slotButton = await screen.findByRole("button", { name: SLOT_LABEL });
  await user.click(slotButton);
}

const originalFetch = global.fetch;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  global.fetch = originalFetch;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1) Recorrido feliz — contrato EXACTO del customer + confirmación clara.
// ─────────────────────────────────────────────────────────────────────────────
describe("BookingWizard · recorrido feliz y contrato del customer", () => {
  it("envía al POST solo los campos del contrato y confirma la cita", async () => {
    const user = userEvent.setup();
    const calls = installFetch({
      post: () => ({
        status: 201,
        body: {
          appointmentId: "44444444-4444-4444-4444-444444444444",
          startsAt: SLOT.startsAt,
          endsAt: SLOT.endsAt,
          professionalName: "Ana",
          serviceName: "Corte de pelo",
          salonName: "Estudio Nova",
        },
      }),
    });

    renderWizard();
    await advanceToContact(user);

    await user.type(screen.getByLabelText(/Nombre y apellidos/i), "Ana García");
    await user.type(screen.getByLabelText(/Teléfono/i), "600123123");
    await user.type(screen.getByLabelText(/Email/i), "ana@correo.com");
    await user.type(screen.getByLabelText(/Notas/i), "Alérgica al amoníaco");
    await user.click(screen.getByRole("checkbox"));

    await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));

    // Confirmación clara con los datos de la cita.
    expect(await screen.findByText("¡Reserva confirmada!")).toBeInTheDocument();
    expect(screen.getAllByText("Corte de pelo").length).toBeGreaterThan(0);
    expect(screen.getByText("Ana")).toBeInTheDocument();

    // El cuerpo enviado respeta EXACTAMENTE el contrato (nivel superior + customer).
    expect(calls.postBodies).toHaveLength(1);
    const body = calls.postBodies[0] as {
      serviceId: string;
      professionalId: string;
      startsAt: string;
      customer: Record<string, unknown>;
    };
    expect(body.serviceId).toBe(SERVICE_ID);
    expect(body.professionalId).toBe("any"); // se eligió «cualquier profesional»
    expect(body.startsAt).toBe(SLOT.startsAt);
    expect(body.customer).toEqual({
      fullName: "Ana García",
      phone: "600123123",
      email: "ana@correo.com",
      notes: "Alérgica al amoníaco",
      marketingConsent: true,
    });
    // Ni un campo de más: exactamente las claves de `bookingCustomerSchema`.
    expect(Object.keys(body.customer).sort()).toEqual([
      "email",
      "fullName",
      "marketingConsent",
      "notes",
      "phone",
    ]);
  });

  it("sin email ni notas, esos campos opcionales NO viajan en el cuerpo", async () => {
    const user = userEvent.setup();
    const calls = installFetch({
      post: () => ({
        status: 201,
        body: {
          appointmentId: "44444444-4444-4444-4444-444444444444",
          startsAt: SLOT.startsAt,
          endsAt: SLOT.endsAt,
          professionalName: "Ana",
          serviceName: "Corte de pelo",
          salonName: "Estudio Nova",
        },
      }),
    });

    renderWizard();
    await advanceToContact(user);

    // Solo lo obligatorio: nombre y teléfono.
    await user.type(screen.getByLabelText(/Nombre y apellidos/i), "Ana García");
    await user.type(screen.getByLabelText(/Teléfono/i), "600123123");
    await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));

    expect(await screen.findByText("¡Reserva confirmada!")).toBeInTheDocument();

    const body = calls.postBodies[0] as { customer: Record<string, unknown> };
    // email/notas ausentes (no como cadena vacía): el opcional no se inventa.
    expect(Object.keys(body.customer).sort()).toEqual([
      "fullName",
      "marketingConsent",
      "phone",
    ]);
    expect(body.customer.marketingConsent).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) Hueco ocupado (409) — recuperable: avisa y vuelve a elegir hora refrescando.
// ─────────────────────────────────────────────────────────────────────────────
describe("BookingWizard · el hueco ocupado (409) es recuperable", () => {
  it("avisa con mensaje legible y devuelve a elegir hora refrescando disponibilidad", async () => {
    const user = userEvent.setup();
    const calls = installFetch({
      post: () => ({
        status: 409,
        body: { error: "Ese horario ya no está disponible. Elige otro." },
      }),
    });

    renderWizard();
    await advanceToContact(user);

    const availabilityBefore = calls.availability;

    await user.type(screen.getByLabelText(/Nombre y apellidos/i), "Ana García");
    await user.type(screen.getByLabelText(/Teléfono/i), "600123123");
    await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));

    // Aviso específico y legible + acción de recuperación.
    expect(await screen.findByText("Esa hora acaba de ocuparse")).toBeInTheDocument();
    expect(
      screen.getByText("Ese horario ya no está disponible. Elige otro."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Elegir otra hora/i }));

    // De vuelta en la elección de hora, con disponibilidad recargada.
    expect(await screen.findByRole("button", { name: SLOT_LABEL })).toBeInTheDocument();
    expect(screen.queryByText("Esa hora acaba de ocuparse")).toBeNull();
    expect(calls.availability).toBeGreaterThan(availabilityBefore);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) Errores no recuperables — mensaje legible tal cual, sin recuperación de hueco.
// ─────────────────────────────────────────────────────────────────────────────
describe("BookingWizard · errores legibles no recuperables", () => {
  it("un teléfono inválido (400) muestra el mensaje del servidor sin ofrecer otra hora", async () => {
    const user = userEvent.setup();
    installFetch({
      post: () => ({
        status: 400,
        body: { error: "El teléfono no es válido. Revísalo e inténtalo de nuevo." },
      }),
    });

    renderWizard();
    await advanceToContact(user);

    await user.type(screen.getByLabelText(/Nombre y apellidos/i), "Ana García");
    await user.type(screen.getByLabelText(/Teléfono/i), "600123");
    await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));

    expect(
      await screen.findByText(/El teléfono no es válido/i),
    ).toBeInTheDocument();
    // 400 ≠ conflicto de hueco: no se ofrece «Elegir otra hora».
    expect(screen.queryByText("Esa hora acaba de ocuparse")).toBeNull();
    expect(screen.queryByRole("button", { name: /Elegir otra hora/i })).toBeNull();
  });

  it("un salón no disponible (404) surfacea el mensaje legible del servidor", async () => {
    const user = userEvent.setup();
    installFetch({
      post: () => ({
        status: 404,
        body: { error: "Salón no encontrado." },
      }),
    });

    renderWizard();
    await advanceToContact(user);

    await user.type(screen.getByLabelText(/Nombre y apellidos/i), "Ana García");
    await user.type(screen.getByLabelText(/Teléfono/i), "600123123");
    await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));

    expect(await screen.findByText("Salón no encontrado.")).toBeInTheDocument();
    expect(screen.queryByText("Esa hora acaba de ocuparse")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4) Precarga del cliente autenticado (sub-6) — siembra «Tus datos» y reserva de un toque.
//
// Cuando la página pasa `prefill` (cliente con sesión y ficha en este salón), el paso
// «Tus datos» arranca sembrado con sus datos de perfil y muestra un aviso de
// reconocimiento; lo sembrado sigue siendo editable. Sin `prefill`, comportamiento
// idéntico al de siempre (formulario vacío, sin aviso).
// ─────────────────────────────────────────────────────────────────────────────
describe("BookingWizard · precarga del cliente autenticado (sub-6)", () => {
  const PREFILL: BookingPrefill = {
    fullName: "Ada Lovelace",
    phone: "611 22 33 44",
    email: "ada@correo.com",
    marketingConsent: true,
  };

  const CONFIRMATION = {
    appointmentId: "44444444-4444-4444-4444-444444444444",
    startsAt: SLOT.startsAt,
    endsAt: SLOT.endsAt,
    professionalName: "Ana",
    serviceName: "Corte de pelo",
    salonName: "Estudio Nova",
  };

  it("siembra nombre/teléfono/email/consentimiento y muestra el aviso de reconocimiento", async () => {
    const user = userEvent.setup();
    installFetch({ post: () => ({ status: 201, body: CONFIRMATION }) });

    renderWizard(PREFILL);
    await advanceToContact(user);

    expect(screen.getByLabelText(/Nombre y apellidos/i)).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText(/Teléfono/i)).toHaveValue("611 22 33 44");
    expect(screen.getByLabelText(/Email/i)).toHaveValue("ada@correo.com");
    expect(screen.getByRole("checkbox")).toBeChecked();
    // Reconocimiento visible: el cliente ve que le hemos rellenado los datos.
    expect(screen.getByText(/Hemos rellenado tus datos/i)).toBeInTheDocument();
  });

  it("reserva de un toque: envía al POST los datos SEMBRADOS sin reescribir nada", async () => {
    const user = userEvent.setup();
    const calls = installFetch({ post: () => ({ status: 201, body: CONFIRMATION }) });

    renderWizard(PREFILL);
    await advanceToContact(user);

    // Sin teclear: el botón ya está habilitado (nombre + teléfono válidos sembrados).
    await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));

    expect(await screen.findByText("¡Reserva confirmada!")).toBeInTheDocument();
    const body = calls.postBodies[0] as { customer: Record<string, unknown> };
    expect(body.customer).toEqual({
      fullName: "Ada Lovelace",
      phone: "611 22 33 44",
      email: "ada@correo.com",
      marketingConsent: true,
    });
  });

  it("lo sembrado es EDITABLE: al cambiar el teléfono, viaja el nuevo valor", async () => {
    const user = userEvent.setup();
    const calls = installFetch({ post: () => ({ status: 201, body: CONFIRMATION }) });

    renderWizard(PREFILL);
    await advanceToContact(user);

    const phone = screen.getByLabelText(/Teléfono/i);
    await user.clear(phone);
    await user.type(phone, "600999999");
    await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));

    expect(await screen.findByText("¡Reserva confirmada!")).toBeInTheDocument();
    const body = calls.postBodies[0] as { customer: Record<string, unknown> };
    expect(body.customer.phone).toBe("600999999");
  });

  it("sin precarga (anónimo): el formulario arranca vacío y sin aviso de reconocimiento", async () => {
    const user = userEvent.setup();
    installFetch({ post: () => ({ status: 201, body: CONFIRMATION }) });

    renderWizard(); // sin prefill
    await advanceToContact(user);

    expect(screen.getByLabelText(/Nombre y apellidos/i)).toHaveValue("");
    expect(screen.getByLabelText(/Teléfono/i)).toHaveValue("");
    expect(screen.queryByText(/Hemos rellenado tus datos/i)).toBeNull();
  });
});
