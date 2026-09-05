/**
 * `EquiposView` — Ajustes → Equipos de imagen (A1a).
 *
 * Es la pantalla donde cada clínica declara SU aparato, así que lo que se prueba
 * es que el formulario se adapte al adaptador elegido: pedir un AE title a quien
 * ha elegido una carpeta vigilada sería pedirle un dato que no tiene, y al revés
 * dejaría el equipo sin configurar sin decir por qué.
 *
 * También que un equipo desactivado siga listado y marcado: desactivar no es
 * borrar, y cuando el sensor vuelve del taller nadie debería reconfigurarlo.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SalonImagingDevice } from "@/types/database";

const m = vi.hoisted(() => ({
  list: { data: [] as unknown[], isLoading: false },
  save: { mutate: vi.fn(), isPending: false },
  del: { mutate: vi.fn(), isPending: false },
  agent: { data: null as unknown, isLoading: false },
  saveAgent: { mutate: vi.fn(), isPending: false },
}));

vi.mock("@/hooks/use-imaging-devices", () => ({
  useImagingDevices: () => m.list,
  useSaveImagingDevice: () => m.save,
  useDeleteImagingDevice: () => m.del,
  useImagingAgentSettings: () => m.agent,
  useSaveImagingAgentSettings: () => m.saveAgent,
}));

import { EquiposView } from "@/app/(dashboard)/ajustes/equipos/equipos-view";

const SALON_ID = "00000000-0000-0000-0000-000000000000";

function device(overrides: Partial<SalonImagingDevice> = {}): SalonImagingDevice {
  return {
    id: "d1",
    salon_id: SALON_ID,
    name: "Sensor gabinete 2",
    adapter: "carpeta",
    settings: { path: "C:\\Radiografias\\salida" },
    modality: "periapical",
    active: true,
    created_at: "2026-08-28T09:00:00.000Z",
    updated_at: "2026-08-28T09:00:00.000Z",
    ...overrides,
  } as SalonImagingDevice;
}

beforeEach(() => {
  m.list = { data: [], isLoading: false };
  m.save = { mutate: vi.fn(), isPending: false };
  m.del = { mutate: vi.fn(), isPending: false };
  m.agent = { data: null, isLoading: false };
  m.saveAgent = { mutate: vi.fn(), isPending: false };
});

afterEach(() => {
  cleanup();
});

describe("EquiposView — listado", () => {
  it("sin equipos, explica qué pasa mientras tanto", () => {
    render(<EquiposView salonId={SALON_ID} />);

    expect(screen.getByText("Todavía no has añadido ningún equipo")).toBeInTheDocument();
    expect(screen.getByText(/subirlas a mano/i)).toBeInTheDocument();
  });

  it("muestra el equipo con su adaptador y su configuración", () => {
    m.list = { data: [device()], isLoading: false };

    render(<EquiposView salonId={SALON_ID} />);

    expect(screen.getByText("Sensor gabinete 2")).toBeInTheDocument();
    expect(screen.getByText("Carpeta vigilada")).toBeInTheDocument();
    expect(screen.getByText("C:\\Radiografias\\salida")).toBeInTheDocument();
  });

  it("un equipo DICOM resume AE title y puerto", () => {
    m.list = {
      data: [
        device({
          adapter: "dicom",
          settings: { aeTitle: "KAIROS_SCP", port: 11112 },
          modality: "panoramic",
        }),
      ],
      isLoading: false,
    };

    render(<EquiposView salonId={SALON_ID} />);

    expect(screen.getByText("KAIROS_SCP:11112")).toBeInTheDocument();
  });

  it("un equipo desactivado sigue listado, y marcado", () => {
    // Desactivar no es borrar: conserva su configuración para cuando el sensor
    // vuelva del taller.
    m.list = { data: [device({ active: false })], isLoading: false };

    render(<EquiposView salonId={SALON_ID} />);

    const celda = screen.getByText("Sensor gabinete 2").closest("td") as HTMLElement;
    expect(within(celda).getByText("Desactivado")).toBeInTheDocument();
  });
});

describe("EquiposView — emparejamiento del agente", () => {
  const TOKEN = "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo";

  it("sin agente emparejado, ofrece generar el código", () => {
    render(<EquiposView salonId={SALON_ID} />);

    expect(screen.getByText("Todavía no hay ningún agente emparejado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar código" })).toBeInTheDocument();
  });

  it("generar guarda un token que cumple el mínimo del protocolo", () => {
    render(<EquiposView salonId={SALON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Generar código" }));

    expect(m.saveAgent.mutate).toHaveBeenCalledTimes(1);
    const [args] = m.saveAgent.mutate.mock.calls[0] as [{ port: number; token: string }];
    expect(args.port).toBe(7345);
    expect(args.token.length).toBeGreaterThanOrEqual(32);
  });

  it("el token no se enseña de entrada", () => {
    // Está a la vista de cualquiera que pase por detrás del mostrador; se
    // muestra solo cuando alguien lo pide.
    m.agent = { data: { port: 7345, pairingToken: TOKEN }, isLoading: false };

    render(<EquiposView salonId={SALON_ID} />);

    expect(screen.queryByText(TOKEN)).not.toBeInTheDocument();
  });

  it("se puede revelar", () => {
    m.agent = { data: { port: 7345, pairingToken: TOKEN }, isLoading: false };

    render(<EquiposView salonId={SALON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver el código" }));

    expect(screen.getByText(TOKEN)).toBeInTheDocument();
  });

  it("avisa de que regenerar deja fuera a los agentes ya instalados", () => {
    // Es la consecuencia que nadie espera: se genera uno nuevo "por si acaso" y
    // la clínica se queda sin poder radiografiar hasta que alguien lo actualice.
    m.agent = { data: { port: 7345, pairingToken: TOKEN }, isLoading: false };

    render(<EquiposView salonId={SALON_ID} />);

    expect(screen.getByText(/dejan de funcionar/i)).toBeInTheDocument();
  });
});

describe("EquiposView — el formulario sigue al adaptador", () => {
  it("carpeta vigilada pide la ruta y no pide AE title", () => {
    render(<EquiposView salonId={SALON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo equipo/ }));

    expect(screen.getByLabelText("Carpeta que se vigila")).toBeInTheDocument();
    expect(screen.queryByLabelText("AE title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre de la fuente TWAIN")).not.toBeInTheDocument();
  });

  it("al editar un equipo TWAIN aparece su fuente, no la ruta", () => {
    m.list = {
      data: [device({ adapter: "twain", settings: { source: "CS 1500 TWAIN" } })],
      isLoading: false,
    };

    render(<EquiposView salonId={SALON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: /Editar Sensor gabinete 2/ }));

    expect(screen.getByLabelText("Nombre de la fuente TWAIN")).toHaveValue("CS 1500 TWAIN");
    expect(screen.queryByLabelText("Carpeta que se vigila")).not.toBeInTheDocument();
  });

  it("no guarda una carpeta sin ruta, y lo dice", () => {
    render(<EquiposView salonId={SALON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo equipo/ }));

    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Sensor gabinete 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(m.save.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/carpeta/i);
  });

  it("con nombre y ruta, guarda", () => {
    render(<EquiposView salonId={SALON_ID} />);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo equipo/ }));

    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Sensor gabinete 1" },
    });
    fireEvent.change(screen.getByLabelText("Carpeta que se vigila"), {
      target: { value: "D:\\RX" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(m.save.mutate).toHaveBeenCalledTimes(1);
    expect(m.save.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          name: "Sensor gabinete 1",
          adapter: "carpeta",
          settings: { path: "D:\\RX" },
        }),
      }),
      expect.anything(),
    );
  });
});
