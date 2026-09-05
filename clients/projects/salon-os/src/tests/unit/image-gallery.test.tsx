/**
 * `ImageGallery` — galería de imágenes/radiografías de un paciente.
 *
 * Resuelve las URLs firmadas con un `useQuery` REAL (`queryFn` llama a
 * `signImageUrls`, mockeada aquí), así que necesita un `QueryClientProvider`
 * real de fondo — mismo patrón que `booking-wizard.test.tsx` (fetch real
 * stubbeado dentro de un árbol de React real, no un hook mockeado). El
 * borrado (`useDeletePatientImage`) SÍ se mockea al nivel de hook, igual
 * patrón que `plan-detail.test.tsx`.
 */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PatientImage } from "@/types/database";

const m = vi.hoisted(() => ({
  del: { mutate: vi.fn(), isPending: false },
  signImageUrls: vi.fn(),
}));

vi.mock("@/hooks/use-patient-images", () => ({
  useDeletePatientImage: () => m.del,
}));

vi.mock("@/app/(dashboard)/expediente/actions", () => ({
  signImageUrls: (paths: string[]) => m.signImageUrls(paths),
}));

import { ImageGallery } from "@/components/dental/image-gallery";

beforeEach(() => {
  m.del.mutate = vi.fn();
  m.del.isPending = false;
  m.signImageUrls = vi.fn(async (paths: string[]) => ({
    ok: true,
    data: Object.fromEntries(paths.map((p) => [p, `https://signed.example/${p}`])),
  }));
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function patientImage(overrides: Partial<PatientImage> & { id: string }): PatientImage {
  return {
    salon_id: "salon-1",
    customer_id: "customer-1",
    treatment_plan_id: null,
    fdi_code: null,
    modality: "periapical",
    taken_at: null,
    taken_by: null,
    device: null,
    storage_path: `salon-1/customer-1/${overrides.id}.png`,
    thumbnail_path: null,
    mime: "image/png",
    dicom_metadata: null,
    tags: [],
    note: null,
    created_by: null,
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

const PERIAPICAL = patientImage({ id: "img-1", modality: "periapical", fdi_code: 11 });
const PANORAMIC = patientImage({ id: "img-2", modality: "panoramic" });

function renderGallery(images: PatientImage[]): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ImageGallery, { salonId: "salon-1", customerId: "customer-1", images }),
    ),
  );
}

describe("ImageGallery · modalidad, filtro y URLs firmadas", () => {
  it("vacío → empty state con CTA de subir", () => {
    renderGallery([]);
    expect(screen.getByText("Sin imágenes todavía")).toBeInTheDocument();
    expect(screen.getByText(/Subir imagen/)).toBeInTheDocument();
  });

  it("renderiza las imágenes con la etiqueta de su modalidad", () => {
    renderGallery([PERIAPICAL, PANORAMIC]);

    // { ignore: "option" } excluye las <option> del <select> nativo de filtro,
    // que repiten el mismo texto que el badge de cada tarjeta.
    expect(screen.getByText("Radiografía periapical", { ignore: "option" })).toBeInTheDocument();
    expect(
      screen.getByText("Ortopantomografía (panorámica)", { ignore: "option" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Diente 11")).toBeInTheDocument();
  });

  it("resuelve las URLs firmadas vía signImageUrls y las pinta en <img>", async () => {
    renderGallery([PERIAPICAL]);

    const img = await screen.findByAltText("Radiografía periapical");
    expect(img).toHaveAttribute("src", "https://signed.example/salon-1/customer-1/img-1.png");
    expect(m.signImageUrls).toHaveBeenCalledWith(["salon-1/customer-1/img-1.png"]);
  });

  it("el filtro por modalidad oculta las imágenes que no coinciden", () => {
    renderGallery([PERIAPICAL, PANORAMIC]);

    const select = screen.getByLabelText("Filtrar por modalidad");
    fireEvent.change(select, { target: { value: "panoramic" } });

    expect(screen.queryByText("Radiografía periapical", { ignore: "option" })).toBeNull();
    expect(
      screen.getByText("Ortopantomografía (panorámica)", { ignore: "option" }),
    ).toBeInTheDocument();
  });

  it("al borrar, llama a useDeletePatientImage con el id de la imagen", () => {
    renderGallery([PERIAPICAL]);

    fireEvent.click(screen.getByRole("button", { name: "Borrar imagen" }));

    expect(m.del.mutate).toHaveBeenCalledTimes(1);
    expect(m.del.mutate).toHaveBeenCalledWith(
      "img-1",
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });
});
