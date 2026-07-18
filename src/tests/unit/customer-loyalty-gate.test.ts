/**
 * Gating BARATO de UI de la fidelización en la FICHA DE CLIENTE
 * (`CustomerDetailView` de `app/(dashboard)/customers/[id]/customer-detail-view`).
 *
 * La fidelización nativa es un add-on contratable. El servidor resuelve el
 * entitlement (`activeSalonHasFeature("loyalty")`, espejo de `salon-features`) y lo
 * baja como `loyaltyEnabled`. Aquí se FIJA que el acceso "Fidelización" de la ficha
 * solo se ofrece con el add-on activo: sin él, el enlace desaparece. Es SOLO
 * presentación —el gate REAL de datos sigue en el servidor: la ruta redirige y
 * `lookupByQr` devuelve `feature_not_enabled` (403)—, así que ocultar el enlace no
 * sustituye al gate, solo evita ofrecer una acción inútil. El gate es ADITIVO: no
 * toca el resto de la ficha (editar/eliminar), coherente con el gate del backend.
 *
 * Se sustituyen por stubs las dependencias ajenas a la decisión de gating: los
 * hooks de datos (`@/hooks/use-customers`) —no red ni QueryClientProvider— y el
 * enrutado de Next (`next/link`, `next/navigation`), que exigen el App Router
 * montado y no son el objeto de esta prueba.
 */
import { createElement, type ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Customer } from "@/types/database";

// next/link → ancla simple: evita el prefetch y el contexto de router en jsdom.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) =>
    createElement("a", { href, ...rest }, children),
}));

// next/navigation → router inerte (la ficha usa useRouter al borrar/volver).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Hooks de datos: la decisión de gating no depende de ellos. Stubs mínimos y
// estables para que la ficha renderice sin red. `useCustomer` devuelve `undefined`
// a propósito: la ficha cae a `initialCustomer` (prop), que es lo que se renderiza.
vi.mock("@/hooks/use-customers", () => ({
  useCustomer: () => ({ data: undefined }),
  useCustomerVisits: () => ({ data: [], isPending: false, isError: false }),
  useUpdateCustomer: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useDeleteCustomer: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

import { CustomerDetailView } from "@/app/(dashboard)/customers/[id]/customer-detail-view";

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";

/** Ficha mínima válida (`Tables<"customers">`) para renderizar la vista. */
const CUSTOMER: Customer = {
  id: CUSTOMER_ID,
  salon_id: "22222222-2222-2222-2222-222222222222",
  full_name: "Lucía Gómez",
  email: null,
  phone: null,
  birth_date: null,
  notes: null,
  marketing_consent: false,
  tax_id: null,
  address: null,
  qr_token: "loy_lucia",
  user_id: null,
  phone_e164: null,
  created_at: "2026-01-01T10:00:00.000Z",
  updated_at: "2026-01-01T10:00:00.000Z",
};

/** Ruta de la ficha de fidelización del cliente (el destino del enlace gateado). */
const LOYALTY_HREF = `/customers/${CUSTOMER_ID}/loyalty`;

function renderDetail(loyaltyEnabled: boolean): void {
  const props: ComponentProps<typeof CustomerDetailView> = {
    salonId: CUSTOMER.salon_id,
    customerId: CUSTOMER_ID,
    initialCustomer: CUSTOMER,
    loyaltyEnabled,
  };
  render(createElement(CustomerDetailView, props));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CustomerDetailView · gating de UI de la fidelización", () => {
  it("con el add-on activo ofrece el enlace 'Fidelización' a la ficha de puntos", () => {
    renderDetail(true);

    const link = screen.getByRole("link", { name: /fidelización/i });
    expect(link).toHaveAttribute("href", LOYALTY_HREF);
  });

  it("sin el add-on NO ofrece el acceso a fidelización (ni enlace ni ruta)", () => {
    renderDetail(false);

    expect(screen.queryByRole("link", { name: /fidelización/i })).toBeNull();
    // Defensa extra: tampoco queda ninguna ancla que apunte a la ruta gateada.
    expect(document.querySelector(`a[href="${LOYALTY_HREF}"]`)).toBeNull();
  });

  it("el gate es aditivo: editar y eliminar no dependen del add-on", () => {
    renderDetail(false);

    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /eliminar/i })).toBeInTheDocument();
  });
});
