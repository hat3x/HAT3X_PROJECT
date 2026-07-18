/**
 * Marca (white-label) — capa de datos de SERVIDOR (sub-1).
 *
 * Ejercita `@/lib/salon-branding/server` contra un doble MÍNIMO de Supabase (tabla
 * `salon_branding` + bucket `salon-logos`) y stubs de `@/lib/salon`,
 * `@/lib/salon-features` y `next/cache`. Comprueba las invariantes de la subtarea:
 *   · lectura de la marca del salón activo (sesión + RLS);
 *   · validación de hex EN SERVIDOR con mensaje legible ANTES del CHECK de la BD;
 *   · subida/reemplazo/borrado del logo en `{salon_id}/logo.<ext>` + persistencia de
 *     la URL pública en `logo_url`;
 *   · gate de owner/manager (defensa en profundidad sobre la RLS);
 *   · lectura de `salon_features` (semántica `app.salon_has_feature`) para gating;
 *   · revalidación de las rutas afectadas tras cada escritura.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database, SalonBranding } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mocks (hoisted): funciones compartidas entre las factorías de vi.mock y los tests.
const h = vi.hoisted(() => ({
  getActiveMembership: vi.fn(),
  salonHasFeature: vi.fn(),
  activeSalonHasFeature: vi.fn(),
  revalidatePath: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/salon", () => ({
  getActiveMembership: h.getActiveMembership,
  canManageSettings: (role: string | null | undefined) =>
    role === "owner" || role === "manager",
  activeSalonHasFeature: h.activeSalonHasFeature,
}));
vi.mock("@/lib/salon-features", () => ({ salonHasFeature: h.salonHasFeature }));
vi.mock("@/lib/supabase/server", () => ({ createClient: h.createClient }));

import {
  BRANDING_REVALIDATE_PATHS,
  BrandingError,
  getActiveSalonBranding,
  getActiveSalonBrandingForApp,
  removeActiveSalonLogo,
  updateActiveSalonColors,
  uploadActiveSalonLogo,
} from "@/lib/salon-branding/server";

// ─────────────────────────────────────────────────────────────────────────────
// Doble mínimo de Supabase (tabla salon_branding + bucket salon-logos)
// ─────────────────────────────────────────────────────────────────────────────
const SALON_ID = "9f2c0000-0000-4000-8000-000000000001";
const PUBLIC_URL = (path: string) =>
  `https://sb.test/storage/v1/object/public/salon-logos/${path}`;

interface FakeError {
  message: string;
  code?: string;
}
interface FakeState {
  brandingRow: SalonBranding | null;
  readError: FakeError | null;
  writeError: FakeError | null;
  storageObjects: Array<{ name: string }> | null;
  listError: FakeError | null;
  uploadError: FakeError | null;
  removeError: FakeError | null;
  uploads: Array<{ path: string; options: Record<string, unknown> }>;
  removed: string[][];
}

function freshState(partial: Partial<FakeState> = {}): FakeState {
  return {
    brandingRow: null,
    readError: null,
    writeError: null,
    storageObjects: [],
    listError: null,
    uploadError: null,
    removeError: null,
    uploads: [],
    removed: [],
    ...partial,
  };
}

function baseRow(salonId: string): SalonBranding {
  return {
    salon_id: salonId,
    logo_url: null,
    primary_color: "#111827",
    secondary_color: null,
    created_at: "2026-07-18T10:00:00.000Z",
    updated_at: "2026-07-18T10:00:00.000Z",
  };
}

function makeTableBuilder(state: FakeState) {
  let op: "read" | "upsert" | "update" = "read";
  let upsertPayload: Record<string, unknown> = {};
  let updatePatch: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: () => builder,
    upsert: (payload: Record<string, unknown>) => {
      op = "upsert";
      upsertPayload = payload;
      return builder;
    },
    update: (patch: Record<string, unknown>) => {
      op = "update";
      updatePatch = patch;
      return builder;
    },
    maybeSingle: () =>
      Promise.resolve({
        data: state.readError !== null ? null : state.brandingRow,
        error: state.readError,
      }),
    single: () => {
      if (op === "upsert") {
        if (state.writeError !== null) {
          return Promise.resolve({ data: null, error: state.writeError });
        }
        const merged = {
          ...(state.brandingRow ?? baseRow(String(upsertPayload.salon_id))),
          ...upsertPayload,
        } as SalonBranding;
        state.brandingRow = merged;
        return Promise.resolve({ data: merged, error: null });
      }
      if (op === "update") {
        if (state.writeError !== null) {
          return Promise.resolve({ data: null, error: state.writeError });
        }
        const merged = {
          ...(state.brandingRow ?? baseRow(SALON_ID)),
          ...updatePatch,
        } as SalonBranding;
        state.brandingRow = merged;
        return Promise.resolve({ data: merged, error: null });
      }
      return Promise.resolve({ data: state.brandingRow, error: null });
    },
  };
  return builder;
}

function makeStorage(state: FakeState) {
  return {
    from: (bucket: string) => ({
      list: () =>
        Promise.resolve({
          data: state.listError !== null ? null : state.storageObjects,
          error: state.listError,
        }),
      upload: (path: string, _body: unknown, options: Record<string, unknown>) => {
        state.uploads.push({ path, options });
        return Promise.resolve({
          data: state.uploadError !== null ? null : { path },
          error: state.uploadError,
        });
      },
      remove: (paths: string[]) => {
        state.removed.push(paths);
        return Promise.resolve({ data: [], error: state.removeError });
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://sb.test/storage/v1/object/public/${bucket}/${path}` },
      }),
    }),
  };
}

function makeClient(state: FakeState): SupabaseClient<Database> {
  return {
    from: () => makeTableBuilder(state),
    storage: makeStorage(state),
  } as unknown as SupabaseClient<Database>;
}

type Membership = { salonId: string; role: string } | null;

function arrange(
  state: FakeState,
  membership: Membership = { salonId: SALON_ID, role: "owner" },
): void {
  h.getActiveMembership.mockResolvedValue(membership);
  h.createClient.mockReturnValue(makeClient(state));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────
describe("getActiveSalonBranding", () => {
  it("devuelve la fila de marca del salón activo (sesión + RLS)", async () => {
    const row = { ...baseRow(SALON_ID), primary_color: "#abcdef", logo_url: PUBLIC_URL(`${SALON_ID}/logo.png`) };
    arrange(freshState({ brandingRow: row }));
    await expect(getActiveSalonBranding()).resolves.toEqual(row);
  });

  it("sin sesión/salón ⇒ null (no toca el cliente)", async () => {
    arrange(freshState(), null);
    await expect(getActiveSalonBranding()).resolves.toBeNull();
    expect(h.createClient).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Colores — validación de hex antes del CHECK + gate de rol + revalidación
// ─────────────────────────────────────────────────────────────────────────────
describe("updateActiveSalonColors", () => {
  it("hex principal inválido ⇒ invalid_request/400 con mensaje legible, ANTES de tocar la BD", async () => {
    await expect(updateActiveSalonColors({ primaryColor: "rojo" })).rejects.toMatchObject({
      code: "invalid_request",
      status: 400,
      message: "El color principal debe estar en formato #RRGGBB",
    });
    // La validación ocurre antes de resolver sesión/cliente y sin revalidar.
    expect(h.getActiveMembership).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("hex secundario inválido ⇒ invalid_request/400 con su propia etiqueta", async () => {
    await expect(
      updateActiveSalonColors({ secondaryColor: "#12345" }),
    ).rejects.toMatchObject({
      code: "invalid_request",
      message: "El color secundario debe estar en formato #RRGGBB",
    });
  });

  it("sin ningún cambio ⇒ invalid_request", async () => {
    await expect(updateActiveSalonColors({})).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("sin sesión ⇒ unauthorized/401 (aunque el color sea válido)", async () => {
    arrange(freshState(), null);
    await expect(updateActiveSalonColors({ primaryColor: "#000000" })).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });
  });

  it("rol staff ⇒ forbidden/403 (defensa en profundidad sobre la RLS)", async () => {
    arrange(freshState(), { salonId: SALON_ID, role: "staff" });
    await expect(updateActiveSalonColors({ primaryColor: "#000000" })).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });

  it("cambia solo el primario y PRESERVA secundario y logo (upsert por columnas)", async () => {
    const state = freshState({
      brandingRow: {
        ...baseRow(SALON_ID),
        primary_color: "#000000",
        secondary_color: "#ffffff",
        logo_url: PUBLIC_URL(`${SALON_ID}/logo.png`),
      },
    });
    arrange(state);
    const result = await updateActiveSalonColors({ primaryColor: "#123456" });
    expect(result.primary_color).toBe("#123456");
    expect(result.secondary_color).toBe("#ffffff");
    expect(result.logo_url).toBe(PUBLIC_URL(`${SALON_ID}/logo.png`));
    expect(h.revalidatePath).toHaveBeenCalledWith("/ajustes/marca");
  });

  it("primera fila con solo secundario ⇒ el primario cae al default #111827", async () => {
    const state = freshState({ brandingRow: null });
    arrange(state);
    const result = await updateActiveSalonColors({ secondaryColor: "#00ff00" });
    expect(result.primary_color).toBe("#111827");
    expect(result.secondary_color).toBe("#00ff00");
  });

  it("secundario null limpia el acento", async () => {
    const state = freshState({
      brandingRow: { ...baseRow(SALON_ID), secondary_color: "#ffffff" },
    });
    arrange(state);
    const result = await updateActiveSalonColors({ secondaryColor: null });
    expect(result.secondary_color).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Logo — subida/reemplazo en {salon_id}/logo.<ext> + persistencia de la URL
// ─────────────────────────────────────────────────────────────────────────────
describe("uploadActiveSalonLogo", () => {
  it("MIME no admitido ⇒ invalid_request (antes de tocar sesión/Storage)", async () => {
    await expect(
      uploadActiveSalonLogo({ data: new Uint8Array(4), contentType: "image/gif" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(h.getActiveMembership).not.toHaveBeenCalled();
  });

  it("archivo vacío ⇒ invalid_request", async () => {
    await expect(
      uploadActiveSalonLogo({ data: new Uint8Array(0), contentType: "image/png" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("supera 2 MiB ⇒ invalid_request", async () => {
    await expect(
      uploadActiveSalonLogo({
        data: new Uint8Array(2_097_153),
        contentType: "image/png",
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("sube a {salon_id}/logo.png, persiste la URL pública y revalida", async () => {
    const state = freshState({ brandingRow: null });
    arrange(state);
    const result = await uploadActiveSalonLogo({
      data: new Uint8Array(16),
      contentType: "image/png",
    });

    const expectedPath = `${SALON_ID}/logo.png`;
    expect(result.path).toBe(expectedPath);
    expect(result.publicUrl).toBe(PUBLIC_URL(expectedPath));
    expect(result.branding.logo_url).toBe(PUBLIC_URL(expectedPath));
    // primary_color se crea con el default al ser la primera fila.
    expect(result.branding.primary_color).toBe("#111827");

    expect(state.uploads).toHaveLength(1);
    const upload = state.uploads[0];
    expect(upload?.path).toBe(expectedPath);
    expect(upload?.options.upsert).toBe(true);
    expect(upload?.options.contentType).toBe("image/png");
    expect(h.revalidatePath).toHaveBeenCalledWith("/ajustes/marca");
  });

  it("reemplazar con otra extensión borra el logo previo (limpieza de huérfanos)", async () => {
    const state = freshState({
      brandingRow: { ...baseRow(SALON_ID), logo_url: PUBLIC_URL(`${SALON_ID}/logo.png`) },
      storageObjects: [{ name: "logo.png" }],
    });
    arrange(state);
    const result = await uploadActiveSalonLogo({
      data: new Uint8Array(16),
      contentType: "image/webp",
    });
    expect(result.path).toBe(`${SALON_ID}/logo.webp`);
    expect(state.removed).toContainEqual([`${SALON_ID}/logo.png`]);
  });

  it("rol staff ⇒ forbidden/403", async () => {
    arrange(freshState(), { salonId: SALON_ID, role: "staff" });
    await expect(
      uploadActiveSalonLogo({ data: new Uint8Array(16), contentType: "image/png" }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Borrado del logo
// ─────────────────────────────────────────────────────────────────────────────
describe("removeActiveSalonLogo", () => {
  it("borra los objetos del salón y pone logo_url a null; revalida", async () => {
    const state = freshState({
      brandingRow: { ...baseRow(SALON_ID), logo_url: PUBLIC_URL(`${SALON_ID}/logo.png`) },
      storageObjects: [{ name: "logo.png" }],
    });
    arrange(state);
    const result = await removeActiveSalonLogo();
    expect(state.removed).toContainEqual([`${SALON_ID}/logo.png`]);
    expect(result?.logo_url).toBeNull();
    expect(h.revalidatePath).toHaveBeenCalledWith("/ajustes/marca");
  });

  it("salón sin fila de marca ⇒ null (nada que limpiar, no revalida)", async () => {
    arrange(freshState({ brandingRow: null, storageObjects: [] }));
    await expect(removeActiveSalonLogo()).resolves.toBeNull();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("rol staff ⇒ forbidden/403", async () => {
    arrange(freshState(), { salonId: SALON_ID, role: "staff" });
    await expect(removeActiveSalonLogo()).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gating (entitlements) para las apps white-label
// ─────────────────────────────────────────────────────────────────────────────
describe("getActiveSalonBrandingForApp", () => {
  it("sin sesión ⇒ { enabled:false, branding:null } y no consulta el add-on", async () => {
    arrange(freshState(), null);
    await expect(getActiveSalonBrandingForApp("client_app")).resolves.toEqual({
      enabled: false,
      branding: null,
    });
    expect(h.salonHasFeature).not.toHaveBeenCalled();
  });

  it("lee salon_features (app.salon_has_feature) y la marca en paralelo", async () => {
    const row = { ...baseRow(SALON_ID), primary_color: "#abcdef" };
    arrange(freshState({ brandingRow: row }));
    h.salonHasFeature.mockResolvedValue(true);
    const result = await getActiveSalonBrandingForApp("client_app");
    expect(result).toEqual({ enabled: true, branding: row });
    expect(h.salonHasFeature).toHaveBeenCalledWith(expect.anything(), SALON_ID, "client_app");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contrato de revalidación
// ─────────────────────────────────────────────────────────────────────────────
describe("BRANDING_REVALIDATE_PATHS", () => {
  it("apunta a la página de edición de marca (Ajustes → Marca)", () => {
    expect(BRANDING_REVALIDATE_PATHS).toEqual(["/ajustes/marca"]);
  });

  it("BrandingError expone code + status para el borde", () => {
    const error = new BrandingError("not_found", 404, "x");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("not_found");
    expect(error.status).toBe(404);
  });
});
