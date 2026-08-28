/**
 * Server actions de EQUIPOS DE IMAGEN (`ajustes/equipos/actions`) — A1a.
 *
 * Mismo patrón que `expediente-actions.test.ts`: gate explícito de sector
 * (odontologia) + rol en servidor, ADICIONAL a RLS. Se mockean `@/lib/salon` y
 * `@/lib/supabase/server`.
 *
 * Lo que estos tests protegen, además del gate: que una configuración
 * incoherente NO llegue a la base. Guardar una carpeta vigilada con un AE title
 * de DICOM no falla al guardarse — falla el día que alguien intenta radiografiar
 * con el paciente en el sillón.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { MemberRole, SalonSector } from "@/types/database";

const { getActiveSalonMock, getActiveMembershipMock, fromMock, rpcMock } = vi.hoisted(() => ({
  getActiveSalonMock: vi.fn(),
  getActiveMembershipMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/salon", () => ({
  getActiveSalon: () => getActiveSalonMock(),
  getActiveMembership: () => getActiveMembershipMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => fromMock(table),
    rpc: (name: string, args: unknown) => rpcMock(name, args),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  deleteImagingDevice,
  saveImagingAgentSettings,
  saveImagingDevice,
} from "@/app/(dashboard)/ajustes/equipos/actions";
import { generatePairingToken } from "@/lib/imaging/pairing";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const DEVICE_ID = "44444444-4444-4444-4444-444444444444";

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

/** Equipo válido; cada caso cambia solo lo que quiere probar. */
function device(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Sensor del gabinete 2",
    adapter: "carpeta",
    settings: { path: "C:\\Radiografias\\salida" },
    modality: "periapical",
    active: true,
    ...overrides,
  };
}

/** Chain de Supabase; `onInsert` captura lo que se escribe. */
function chain(
  result: { data: unknown; error: unknown },
  onInsert?: (payload: unknown) => void,
): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  c.insert = vi.fn((payload: unknown) => {
    onInsert?.(payload);
    return c;
  });
  c.update = vi.fn(() => c);
  c.delete = vi.fn(() => c);
  c.select = vi.fn(() => c);
  c.eq = vi.fn(() => c);
  c.single = vi.fn(async () => result);
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  salon("odontologia");
  membership("owner");
});

describe("saveImagingDevice — gate de sector y rol", () => {
  it("sector peluquería ⇒ rechaza sin tocar la BD", async () => {
    salon("peluqueria");

    const result = await saveImagingDevice(device());

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rol staff ⇒ rechaza: configurar el equipo es administrar la clínica", async () => {
    membership("staff");

    const result = await saveImagingDevice(device());

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("sin salón asignado ⇒ rechaza", async () => {
    getActiveSalonMock.mockResolvedValue(null);

    const result = await saveImagingDevice(device());

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("saveImagingDevice — coherencia de la configuración", () => {
  it("rechaza ajustes que no son de ese adaptador, sin tocar la BD", async () => {
    const result = await saveImagingDevice(
      device({ adapter: "carpeta", settings: { aeTitle: "KAIROS_SCP" } }),
    );

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rechaza un equipo sin nombre", async () => {
    const result = await saveImagingDevice(device({ name: "   " }));

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("saveImagingDevice — alta", () => {
  it("guarda el equipo acotado al salón activo", async () => {
    const insertSpy = vi.fn();
    const guardado = { id: DEVICE_ID, salon_id: SALON_ID, ...device() };
    fromMock.mockImplementation((table: string) => {
      if (table === "salon_imaging_device") {
        return chain({ data: guardado, error: null }, insertSpy);
      }
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await saveImagingDevice(device());

    expect(result.ok).toBe(true);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        salon_id: SALON_ID,
        name: "Sensor del gabinete 2",
        adapter: "carpeta",
        modality: "periapical",
      }),
    );
  });

  it("acepta un equipo DICOM con su AE title y su puerto", async () => {
    const guardado = { id: DEVICE_ID, salon_id: SALON_ID };
    fromMock.mockImplementation(() => chain({ data: guardado, error: null }));

    const result = await saveImagingDevice(
      device({
        adapter: "dicom",
        settings: { aeTitle: "KAIROS_SCP", port: 11112 },
        modality: "panoramic",
      }),
    );

    expect(result.ok).toBe(true);
  });
});

describe("saveImagingAgentSettings", () => {
  it("guarda por RPC, no con un update directo", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const token = generatePairingToken();

    const result = await saveImagingAgentSettings({ port: 7345, token });

    expect(result.ok).toBe(true);
    // La RPC fusiona la clave `imaging_agent` con `||`. Un update desde aquí
    // obligaría a leer-modificar-escribir y podría dejar al salón sin su
    // `single_resource`, que es lo que impide dos pacientes en el mismo hueco.
    expect(rpcMock).toHaveBeenCalledWith("set_salon_imaging_agent", {
      p_salon_id: SALON_ID,
      p_port: 7345,
      p_token: token,
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rechaza un token corto sin llamar a la base", async () => {
    const result = await saveImagingAgentSettings({ port: 7345, token: "corto" });

    expect(result.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rechaza un token con espacios: es un copiado a medias", async () => {
    const result = await saveImagingAgentSettings({
      port: 7345,
      token: "a".repeat(20) + " " + "b".repeat(20),
    });

    expect(result.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rechaza un puerto fuera de rango", async () => {
    const result = await saveImagingAgentSettings({ port: 70000, token: generatePairingToken() });

    expect(result.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rol staff ⇒ rechaza: emparejar el agente es administrar la clínica", async () => {
    membership("staff");

    const result = await saveImagingAgentSettings({ port: 7345, token: generatePairingToken() });

    expect(result.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("si la RPC falla, lo dice y no aparenta éxito", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "sin permiso" } });

    const result = await saveImagingAgentSettings({ port: 7345, token: generatePairingToken() });

    expect(result.ok).toBe(false);
  });
});

describe("deleteImagingDevice", () => {
  it("acota el borrado al salón activo", async () => {
    const eqCalls: unknown[][] = [];
    const c = chain({ data: null, error: null });
    c.eq = vi.fn((...args: unknown[]) => {
      eqCalls.push(args);
      return c;
    });
    fromMock.mockImplementation(() => c);

    const result = await deleteImagingDevice(DEVICE_ID);

    expect(result.ok).toBe(true);
    // Sin el filtro por salón, un manager podría borrar el equipo de otra clínica.
    expect(eqCalls).toContainEqual(["salon_id", SALON_ID]);
    expect(eqCalls).toContainEqual(["id", DEVICE_ID]);
  });

  it("rol staff ⇒ rechaza sin tocar la BD", async () => {
    membership("staff");

    const result = await deleteImagingDevice(DEVICE_ID);

    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
