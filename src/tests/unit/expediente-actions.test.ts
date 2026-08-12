/**
 * Server actions del EXPEDIENTE CLÍNICO (`app/(dashboard)/expediente/actions`):
 * consentimientos informados (`consents`) + imágenes/radiografías (`patient_images`).
 *
 * Mismo patrón que `planes-actions.test.ts` / `perio-actions.test.ts`: gate
 * explícito de sector (odontologia) + rol en servidor, ADICIONAL a RLS, se
 * mockea `@/lib/salon` (getActiveSalon + getActiveMembership) y
 * `@/lib/supabase/server` (incluyendo `storage.from` para las pruebas de
 * `uploadPatientImage`/`deletePatientImage`/`signImageUrls`).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import { getConsentTemplate } from "@/lib/dental/consents";
import type { MemberRole, SalonSector } from "@/types/database";

const { getActiveSalonMock, getActiveMembershipMock, fromMock, getUserMock, storageFromMock } =
  vi.hoisted(() => ({
    getActiveSalonMock: vi.fn(),
    getActiveMembershipMock: vi.fn(),
    fromMock: vi.fn(),
    getUserMock: vi.fn(),
    storageFromMock: vi.fn(),
  }));

vi.mock("@/lib/salon", () => ({
  getActiveSalon: () => getActiveSalonMock(),
  getActiveMembership: () => getActiveMembershipMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => fromMock(table),
    auth: { getUser: () => getUserMock() },
    storage: { from: (bucket: string) => storageFromMock(bucket) },
  }),
}));

import {
  createConsent,
  deleteConsent,
  deletePatientImage,
  revokeConsent,
  signConsent,
  signImageUrls,
  uploadPatientImage,
} from "@/app/(dashboard)/expediente/actions";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const CONSENT_ID = "22222222-2222-2222-2222-222222222222";
const IMAGE_ID = "33333333-3333-3333-3333-333333333333";

function consentRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: CONSENT_ID,
    salon_id: SALON_ID,
    customer_id: CUSTOMER_ID,
    type: "general",
    treatment_plan_id: null,
    plan_item_id: null,
    fdi_code: null,
    title: "Consentimiento informado general de tratamiento odontológico",
    body: "Texto del consentimiento…",
    template_version: "v1",
    document_uri: null,
    status: "pending",
    signed_at: null,
    signed_by_patient: null,
    witnessed_by: null,
    revoked_at: null,
    revoked_by: null,
    created_by: null,
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function imageRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: IMAGE_ID,
    salon_id: SALON_ID,
    customer_id: CUSTOMER_ID,
    treatment_plan_id: null,
    fdi_code: null,
    modality: "periapical",
    taken_at: null,
    taken_by: null,
    device: null,
    storage_path: `${SALON_ID}/${CUSTOMER_ID}/aaaa.png`,
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

function salon(sector: SalonSector): void {
  getActiveSalonMock.mockResolvedValue({
    id: SALON_ID,
    name: "Clínica de prueba",
    slug: "clinica-prueba",
    timezone: "Europe/Madrid",
    sector,
  });
}

function membership(role: MemberRole): void {
  getActiveMembershipMock.mockResolvedValue({ salonId: SALON_ID, role });
}

/** Chain de Supabase encadenable y "then-able": resuelve `result` sin importar qué se encadene. */
function chain(result: { data: unknown; error: unknown }): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  c.insert = vi.fn(() => c);
  c.update = vi.fn(() => c);
  c.delete = vi.fn(() => c);
  c.select = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  c.in = vi.fn(() => c);
  c.single = vi.fn(async () => result);
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

/**
 * Configura `fromMock` para devolver, por tabla, una secuencia de resultados
 * (consumidos en orden de llamada; se repite el último si se agotan). Permite
 * simular la misma tabla devolviendo filas distintas en llamadas sucesivas
 * (p.ej. `consents`: primero el fetch del estado actual, luego el UPDATE).
 */
function fromSequence(
  results: Record<string, Array<{ data: unknown; error: unknown }>>,
): (table: string) => Record<string, unknown> {
  const counters: Record<string, number> = {};
  return (table: string) => {
    const list = results[table];
    if (list === undefined || list.length === 0) {
      throw new Error(`tabla inesperada: ${table}`);
    }
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    const result = list[Math.min(idx, list.length - 1)] as { data: unknown; error: unknown };
    return chain(result);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

// ---------------------------------------------------------------------------
// (a) Gate compartido — sector peluquería ⇒ rechazo, sin tocar la BD
// ---------------------------------------------------------------------------

describe("gate de escritura del expediente clínico", () => {
  it("(a) sector peluquería ⇒ createConsent devuelve { ok:false } sin tocar la BD", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await createConsent({ customerId: CUSTOMER_ID, type: "general" });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("(a) sector peluquería ⇒ signConsent devuelve { ok:false } sin tocar la BD", async () => {
    salon("peluqueria");
    membership("owner");

    const result = await signConsent(CONSENT_ID, { signedByPatient: "Juan Pérez" });

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("(a) sector peluquería ⇒ uploadPatientImage devuelve { ok:false } sin tocar Storage", async () => {
    salon("peluqueria");
    membership("owner");

    const formData = new FormData();
    formData.set("file", new File([new Uint8Array(10)], "rx.png", { type: "image/png" }));
    formData.set("customerId", CUSTOMER_ID);
    formData.set("modality", "periapical");

    const result = await uploadPatientImage(formData);

    expect(result.ok).toBe(false);
    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("sin salón asignado ⇒ rechazo antes de consultar el rol", async () => {
    getActiveSalonMock.mockResolvedValue(null);

    const result = await createConsent({ customerId: CUSTOMER_ID, type: "general" });

    expect(result).toEqual({
      ok: false,
      error: "No tienes un salón asignado.",
    });
    expect(getActiveMembershipMock).not.toHaveBeenCalled();
  });

  it("deleteConsent: rol staff (sin permiso de borrado) ⇒ { ok:false } sin tocar la BD", async () => {
    salon("odontologia");
    membership("staff");

    const result = await deleteConsent(CONSENT_ID);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (b) createConsent — sin title/body usa la plantilla del tipo
// ---------------------------------------------------------------------------

describe("createConsent", () => {
  it("(b) sin title/body ⇒ usa título, cuerpo y versión de la plantilla del tipo", async () => {
    salon("odontologia");
    membership("staff");

    const template = getConsentTemplate("endodoncia");
    const consentsChain = chain({ data: consentRow({ type: "endodoncia" }), error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "consents") return consentsChain;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await createConsent({ customerId: CUSTOMER_ID, type: "endodoncia" });

    expect(result.ok).toBe(true);
    const insertMock = consentsChain.insert as ReturnType<typeof vi.fn>;
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.title).toBe(template.title);
    expect(payload.body).toBe(template.body);
    expect(payload.template_version).toBe(template.version);
    expect(payload.status).toBe("pending");
  });

  it("con title/body/templateVersion explícitos ⇒ los usa tal cual (no la plantilla)", async () => {
    salon("odontologia");
    membership("owner");

    const consentsChain = chain({ data: consentRow(), error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "consents") return consentsChain;
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await createConsent({
      customerId: CUSTOMER_ID,
      type: "general",
      title: "Consentimiento a medida",
      body: "Texto a medida",
      templateVersion: "v2-personalizado",
    });

    expect(result.ok).toBe(true);
    const insertMock = consentsChain.insert as ReturnType<typeof vi.fn>;
    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.title).toBe("Consentimiento a medida");
    expect(payload.body).toBe("Texto a medida");
    expect(payload.template_version).toBe("v2-personalizado");
  });

  it("opaca un error de BD devolviéndolo como { ok:false }", async () => {
    salon("odontologia");
    membership("owner");
    fromMock.mockImplementation(() => chain({ data: null, error: { message: "boom" } }));

    const result = await createConsent({ customerId: CUSTOMER_ID, type: "general" });

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

// ---------------------------------------------------------------------------
// (c) signConsent / revokeConsent — respetan canSignConsent/canRevokeConsent
// ---------------------------------------------------------------------------

describe("signConsent", () => {
  it("(c) pending ⇒ firma: status 'signed', signed_at y signed_by_patient", async () => {
    salon("odontologia");
    membership("staff");

    const existing = consentRow({ status: "pending" });
    const updated = consentRow({
      status: "signed",
      signed_at: "2026-08-01T12:00:00.000Z",
      signed_by_patient: "Juan Pérez",
    });

    fromMock.mockImplementation(
      fromSequence({
        consents: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
      }),
    );

    const result = await signConsent(CONSENT_ID, { signedByPatient: "Juan Pérez" });

    expect(result).toEqual({ ok: true, data: updated });
  });

  it("(c) signed ⇒ { ok:false }, no permite refirmar (canSignConsent)", async () => {
    salon("odontologia");
    membership("owner");

    const existing = consentRow({ status: "signed" });
    fromMock.mockImplementation((table: string) => {
      if (table === "consents") return chain({ data: existing, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await signConsent(CONSENT_ID, { signedByPatient: "Juan Pérez" });

    expect(result.ok).toBe(false);
  });

  it("(c) revoked ⇒ { ok:false } (canSignConsent)", async () => {
    salon("odontologia");
    membership("owner");

    const existing = consentRow({ status: "revoked" });
    fromMock.mockImplementation((table: string) => {
      if (table === "consents") return chain({ data: existing, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await signConsent(CONSENT_ID, { signedByPatient: "Juan Pérez" });

    expect(result.ok).toBe(false);
  });
});

describe("revokeConsent", () => {
  it("(c) signed ⇒ revoca: status 'revoked', revoked_at y revoked_by", async () => {
    salon("odontologia");
    membership("owner");

    const existing = consentRow({ status: "signed", signed_at: "2026-08-01T11:00:00.000Z" });
    const updated = consentRow({
      status: "revoked",
      signed_at: "2026-08-01T11:00:00.000Z",
      revoked_at: "2026-08-01T13:00:00.000Z",
      revoked_by: "user-1",
    });

    fromMock.mockImplementation(
      fromSequence({
        consents: [
          { data: existing, error: null },
          { data: updated, error: null },
        ],
      }),
    );

    const result = await revokeConsent(CONSENT_ID);

    expect(result).toEqual({ ok: true, data: updated });
  });

  it("(c) pending ⇒ { ok:false }, no permite revocar sin firmar (canRevokeConsent)", async () => {
    salon("odontologia");
    membership("owner");

    const existing = consentRow({ status: "pending" });
    fromMock.mockImplementation((table: string) => {
      if (table === "consents") return chain({ data: existing, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await revokeConsent(CONSENT_ID);

    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteConsent — solo 'pending' (owner/manager)
// ---------------------------------------------------------------------------

describe("deleteConsent", () => {
  it("pending + owner ⇒ borra el consentimiento", async () => {
    salon("odontologia");
    membership("owner");

    fromMock.mockImplementation((table: string) => {
      if (table === "consents") return chain({ data: { status: "pending" }, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await deleteConsent(CONSENT_ID);

    expect(result).toEqual({ ok: true, data: { id: CONSENT_ID } });
  });

  it("signed ⇒ { ok:false } (inmutable, no se borra)", async () => {
    salon("odontologia");
    membership("manager");

    fromMock.mockImplementation((table: string) => {
      if (table === "consents") return chain({ data: { status: "signed" }, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await deleteConsent(CONSENT_ID);

    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// uploadPatientImage / deletePatientImage
// ---------------------------------------------------------------------------

describe("uploadPatientImage", () => {
  it("sube la imagen a patient-media y crea la fila de metadatos", async () => {
    salon("odontologia");
    membership("staff");

    const uploadMock = vi.fn(async () => ({ error: null }));
    storageFromMock.mockReturnValue({ upload: uploadMock });

    const inserted = imageRow();
    fromMock.mockImplementation((table: string) => {
      if (table === "patient_images") return chain({ data: inserted, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const formData = new FormData();
    formData.set("file", new File([new Uint8Array(10)], "rx.png", { type: "image/png" }));
    formData.set("customerId", CUSTOMER_ID);
    formData.set("modality", "periapical");

    const result = await uploadPatientImage(formData);

    expect(result).toEqual({ ok: true, data: inserted });
    expect(storageFromMock).toHaveBeenCalledWith("patient-media");
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const call = uploadMock.mock.calls[0] as unknown as [string, unknown, Record<string, unknown>];
    const [path, , options] = call;
    expect(path.startsWith(`${SALON_ID}/${CUSTOMER_ID}/`)).toBe(true);
    expect(path.endsWith(".png")).toBe(true);
    expect(options.contentType).toBe("image/png");
  });

  it("sube un PDF a patient-media y crea la fila de metadatos", async () => {
    salon("odontologia");
    membership("staff");

    const uploadMock = vi.fn(async () => ({ error: null }));
    storageFromMock.mockReturnValue({ upload: uploadMock });

    const inserted = imageRow({ mime: "application/pdf", storage_path: `${SALON_ID}/${CUSTOMER_ID}/report.pdf` });
    fromMock.mockImplementation((table: string) => {
      if (table === "patient_images") return chain({ data: inserted, error: null });
      throw new Error(`tabla inesperada: ${table}`);
    });

    const formData = new FormData();
    formData.set("file", new File([new Uint8Array(100)], "report.pdf", { type: "application/pdf" }));
    formData.set("customerId", CUSTOMER_ID);
    formData.set("modality", "periapical");

    const result = await uploadPatientImage(formData);

    expect(result).toEqual({ ok: true, data: inserted });
    expect(storageFromMock).toHaveBeenCalledWith("patient-media");
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const call = uploadMock.mock.calls[0] as unknown as [string, unknown, Record<string, unknown>];
    const [path, , options] = call;
    expect(path.startsWith(`${SALON_ID}/${CUSTOMER_ID}/`)).toBe(true);
    expect(path.endsWith(".pdf")).toBe(true);
    expect(options.contentType).toBe("application/pdf");
  });

  it("MIME no admitido (image/gif) ⇒ { ok:false } sin llamar a Storage ni a la BD", async () => {
    salon("odontologia");
    membership("staff");

    const formData = new FormData();
    formData.set("file", new File([new Uint8Array(10)], "rx.gif", { type: "image/gif" }));
    formData.set("customerId", CUSTOMER_ID);
    formData.set("modality", "periapical");

    const result = await uploadPatientImage(formData);

    expect(result.ok).toBe(false);
    expect(storageFromMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("modalidad inválida ⇒ { ok:false } sin llamar a Storage", async () => {
    salon("odontologia");
    membership("staff");

    const formData = new FormData();
    formData.set("file", new File([new Uint8Array(10)], "rx.png", { type: "image/png" }));
    formData.set("customerId", CUSTOMER_ID);
    formData.set("modality", "resonancia_magnetica");

    const result = await uploadPatientImage(formData);

    expect(result.ok).toBe(false);
    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("sin archivo ⇒ { ok:false }", async () => {
    salon("odontologia");
    membership("staff");

    const formData = new FormData();
    formData.set("customerId", CUSTOMER_ID);
    formData.set("modality", "periapical");

    const result = await uploadPatientImage(formData);

    expect(result.ok).toBe(false);
  });
});

describe("deletePatientImage", () => {
  it("borra el objeto de Storage y la fila de metadatos", async () => {
    salon("odontologia");
    membership("staff");

    const removeMock = vi.fn(async () => ({ error: null }));
    storageFromMock.mockReturnValue({ remove: removeMock });

    const storagePath = `${SALON_ID}/${CUSTOMER_ID}/aaaa.png`;
    fromMock.mockImplementation((table: string) => {
      if (table === "patient_images") {
        return chain({ data: { storage_path: storagePath }, error: null });
      }
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await deletePatientImage(IMAGE_ID);

    expect(result).toEqual({ ok: true, data: { id: IMAGE_ID } });
    expect(removeMock).toHaveBeenCalledWith([storagePath]);
  });
});

// ---------------------------------------------------------------------------
// signImageUrls
// ---------------------------------------------------------------------------

describe("signImageUrls", () => {
  it("devuelve un mapa path→signedUrl, omitiendo entradas con error", async () => {
    salon("odontologia");
    membership("staff");

    const createSignedUrlsMock = vi.fn(async () => ({
      data: [
        { path: "salon/customer/a.png", signedUrl: "https://signed/a.png", error: null },
        { path: "salon/customer/b.png", signedUrl: "", error: "not_found" },
        { path: null, signedUrl: "", error: null },
      ],
      error: null,
    }));
    storageFromMock.mockReturnValue({ createSignedUrls: createSignedUrlsMock });

    const result = await signImageUrls(["salon/customer/a.png", "salon/customer/b.png"]);

    expect(result).toEqual({
      ok: true,
      data: { "salon/customer/a.png": "https://signed/a.png" },
    });
    expect(createSignedUrlsMock).toHaveBeenCalledWith(
      ["salon/customer/a.png", "salon/customer/b.png"],
      3600,
    );
  });

  it("array vacío ⇒ {} sin llamar a Storage", async () => {
    salon("odontologia");
    membership("staff");

    const result = await signImageUrls([]);

    expect(result).toEqual({ ok: true, data: {} });
    expect(storageFromMock).not.toHaveBeenCalled();
  });
});
