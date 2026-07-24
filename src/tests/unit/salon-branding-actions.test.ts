/**
 * Server Actions de la MARCA (`app/(dashboard)/ajustes/marca/actions`) — sub-7.
 *
 * La lógica de datos (validación de hex, gate de rol owner/manager, RLS, subida a
 * Storage) ya se cubre en `salon-branding-server.test.ts` contra un doble de Supabase.
 * Aquí se aísla la ÚNICA responsabilidad del wrapper de acciones: traducir el desenlace
 * de la capa de servidor a un `ActionResult` que el formulario consume, SIN filtrar
 * detalles internos. En concreto se blinda el requisito de PERMISOS:
 *
 *   · un rol distinto de owner/manager NO puede guardar la marca ⇒ la capa de datos
 *     lanza `BrandingError('forbidden', 403, …)` y la acción devuelve
 *     `{ ok:false, error:"No tienes permiso para editar la marca del salón." }`
 *     (mensaje LEGIBLE, tal cual, para que el usuario entienda por qué se deniega);
 *   · un error inesperado se OPACA con un mensaje genérico (no se filtra el interno);
 *   · el éxito viaja como `{ ok:true, data }`.
 *
 * Se mockea por completo `@/lib/salon-branding/server` (stubs + clase de error propia)
 * para no arrastrar Supabase ni `next/cache`: la acción importa `BrandingError` del
 * MISMO módulo mockeado, así que el `instanceof` de la acción y el de estos tests son
 * la misma clase (mismo patrón que `tpv-loyalty-actions.test.ts`).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/salon-branding/server", () => {
  class BrandingError extends Error {
    constructor(
      public readonly code: string,
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "BrandingError";
    }
  }
  return {
    BrandingError,
    updateActiveSalonColors: vi.fn(),
    uploadActiveSalonLogo: vi.fn(),
    removeActiveSalonLogo: vi.fn(),
  };
});

import {
  deleteSalonLogo,
  saveSalonColors,
  saveSalonLogo,
} from "@/app/(dashboard)/ajustes/marca/actions";
import {
  BrandingError,
  removeActiveSalonLogo,
  updateActiveSalonColors,
  uploadActiveSalonLogo,
} from "@/lib/salon-branding/server";
import type { SalonBranding } from "@/types/database";

const updateColors = vi.mocked(updateActiveSalonColors);
const uploadLogo = vi.mocked(uploadActiveSalonLogo);
const removeLogo = vi.mocked(removeActiveSalonLogo);

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const ROW: SalonBranding = {
  salon_id: SALON_ID,
  logo_url: null,
  primary_color: "#123456",
  secondary_color: null,
  created_at: "2026-07-18T10:00:00.000Z",
  updated_at: "2026-07-18T10:00:00.000Z",
};

/** Mensaje de dominio que ve el usuario al que se le deniega editar la marca. */
const FORBIDDEN_MESSAGE = "No tienes permiso para editar la marca del salón.";
/** Denegación de permiso tal y como la lanza la capa de datos (owner/manager). */
const forbidden = (): BrandingError =>
  new BrandingError("forbidden", 403, FORBIDDEN_MESSAGE);

beforeEach(() => {
  updateColors.mockReset();
  uploadLogo.mockReset();
  removeLogo.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// saveSalonColors — permiso, éxito y opacado de errores inesperados.
// ─────────────────────────────────────────────────────────────────────────────
describe("saveSalonColors", () => {
  it("un rol sin permiso NO puede guardar: devuelve el mensaje de denegación legible", async () => {
    updateColors.mockRejectedValue(forbidden());

    const result = await saveSalonColors({ primaryColor: "#000000" });

    expect(result).toEqual({ ok: false, error: FORBIDDEN_MESSAGE });
  });

  it("propaga el color guardado como { ok:true, data }", async () => {
    updateColors.mockResolvedValue(ROW);

    const result = await saveSalonColors({ primaryColor: "#123456" });

    expect(result).toEqual({ ok: true, data: ROW });
    expect(updateColors).toHaveBeenCalledWith({ primaryColor: "#123456" });
  });

  it("un error inesperado se OPACA con un mensaje genérico (no se filtra el interno)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    updateColors.mockRejectedValue(new Error("detalle interno de la BD"));

    const result = await saveSalonColors({ primaryColor: "#123456" });

    expect(result).toEqual({
      ok: false,
      error: "No se pudo completar la operación. Inténtalo de nuevo.",
    });
    errorSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// saveSalonLogo — guard de archivo + permiso + éxito.
// ─────────────────────────────────────────────────────────────────────────────
describe("saveSalonLogo", () => {
  /**
   * Envuelve el fichero igual que el hook: `FormData` con la clave `logo`.
   * La acción recibe FormData —y NO un `File` suelto— porque los argumentos de
   * una Server Action deben ser serializables (un `File` es una clase y Next lo
   * rechaza en runtime). Estos tests fijan ese contrato.
   */
  function logoForm(file?: File): FormData {
    const formData = new FormData();
    if (file !== undefined) {
      formData.append("logo", file);
    }
    return formData;
  }

  it("sin un File válido (o vacío) NO toca el servidor y pide un archivo", async () => {
    const noFile = await saveSalonLogo(logoForm());
    expect(noFile).toEqual({
      ok: false,
      error: "Selecciona un archivo de imagen para el logo.",
    });

    const empty = await saveSalonLogo(
      logoForm(new File([], "logo.png", { type: "image/png" })),
    );
    expect(empty).toEqual({
      ok: false,
      error: "Selecciona un archivo de imagen para el logo.",
    });

    expect(uploadLogo).not.toHaveBeenCalled();
  });

  it("un rol sin permiso NO puede subir el logo: devuelve la denegación legible", async () => {
    uploadLogo.mockRejectedValue(forbidden());
    const file = new File([new Uint8Array(16)], "logo.png", { type: "image/png" });

    const result = await saveSalonLogo(logoForm(file));

    expect(result).toEqual({ ok: false, error: FORBIDDEN_MESSAGE });
  });

  it("en éxito devuelve la fila de marca actualizada", async () => {
    uploadLogo.mockResolvedValue({
      branding: ROW,
      path: `${SALON_ID}/logo.png`,
      publicUrl: `https://sb.test/${SALON_ID}/logo.png`,
    });
    const file = new File([new Uint8Array(16)], "logo.png", { type: "image/png" });

    const result = await saveSalonLogo(logoForm(file));

    expect(result).toEqual({ ok: true, data: ROW });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteSalonLogo — permiso + passthrough.
// ─────────────────────────────────────────────────────────────────────────────
describe("deleteSalonLogo", () => {
  it("un rol sin permiso NO puede quitar el logo: devuelve la denegación legible", async () => {
    removeLogo.mockRejectedValue(forbidden());

    const result = await deleteSalonLogo();

    expect(result).toEqual({ ok: false, error: FORBIDDEN_MESSAGE });
  });

  it("propaga la fila resultante (o null si no había marca) como éxito", async () => {
    removeLogo.mockResolvedValue(null);

    const result = await deleteSalonLogo();

    expect(result).toEqual({ ok: true, data: null });
  });
});
