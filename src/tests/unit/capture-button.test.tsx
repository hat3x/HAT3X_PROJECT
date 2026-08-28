/**
 * `CaptureButton` — disparar una radiografía desde la ficha del paciente (A1a).
 *
 * La decisión de producto que fijan estos tests: **si no hay agente, el botón no
 * existe**. No aparece en gris, ni con un aviso. La mayoría de clínicas no tiene
 * agente instalado, y un botón permanentemente deshabilitado en la ficha de cada
 * paciente es ruido que alguien acabará pulsando para averiguar qué hace.
 *
 * Y lo mismo si hay agente pero ningún equipo activo: no hay nada que disparar,
 * así que no hay nada que ofrecer.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  agent: { data: null as unknown, isLoading: false },
  devices: { data: [] as unknown[], isLoading: false },
  upload: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  captureFromAgent: vi.fn(),
  probeAgent: vi.fn(),
}));

vi.mock("@/hooks/use-imaging-devices", () => ({
  useImagingAgentSettings: () => m.agent,
  useUsableImagingDevices: () => m.devices,
}));

vi.mock("@/hooks/use-patient-images", () => ({
  useUploadPatientImage: () => m.upload,
}));

vi.mock("@/lib/imaging/agent-client", async () => {
  const real = await vi.importActual<typeof import("@/lib/imaging/agent-client")>(
    "@/lib/imaging/agent-client",
  );
  return {
    ...real,
    captureFromAgent: (...args: unknown[]) => m.captureFromAgent(...args),
    probeAgent: (...args: unknown[]) => m.probeAgent(...args),
  };
});

import { CaptureButton } from "@/components/dental/capture-button";

const SALON_ID = "00000000-0000-0000-0000-000000000000";
const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const DEVICE_ID = "44444444-4444-4444-4444-444444444444";
const TOKEN = "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo";

const EQUIPO = {
  id: DEVICE_ID,
  salon_id: SALON_ID,
  name: "Sensor gabinete 2",
  adapter: "carpeta",
  settings: { path: "C:\\RX" },
  modality: "periapical",
  active: true,
  created_at: "2026-08-28T09:00:00.000Z",
  updated_at: "2026-08-28T09:00:00.000Z",
};

function emparejado(): void {
  m.agent = { data: { port: 7345, pairingToken: TOKEN }, isLoading: false };
  m.devices = { data: [EQUIPO], isLoading: false };
  m.probeAgent.mockResolvedValue(true);
}

beforeEach(() => {
  m.agent = { data: null, isLoading: false };
  m.devices = { data: [], isLoading: false };
  m.upload = {
    mutate: vi.fn(),
    mutateAsync: vi.fn(async () => ({ id: "img-1" })),
    isPending: false,
  };
  m.captureFromAgent = vi.fn();
  m.probeAgent = vi.fn(async () => false);
});

afterEach(() => {
  cleanup();
});

describe("CaptureButton — cuándo aparece", () => {
  it("sin agente emparejado no pinta nada", () => {
    const { container } = render(<CaptureButton salonId={SALON_ID} customerId={CUSTOMER_ID} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("con agente pero sin equipos activos, tampoco", () => {
    m.agent = { data: { port: 7345, pairingToken: TOKEN }, isLoading: false };
    m.devices = { data: [], isLoading: false };

    const { container } = render(<CaptureButton salonId={SALON_ID} customerId={CUSTOMER_ID} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("con agente y equipo activo, ofrece capturar", () => {
    emparejado();

    render(<CaptureButton salonId={SALON_ID} customerId={CUSTOMER_ID} />);

    expect(screen.getByRole("button", { name: /Sensor gabinete 2/ })).toBeInTheDocument();
  });
});

describe("CaptureButton — capturar", () => {
  it("pide la captura con el equipo, el paciente y el diente", async () => {
    emparejado();
    m.captureFromAgent.mockResolvedValue({
      filename: "rx-0002.jpg",
      mime: "image/jpeg",
      bytes: new Uint8Array([1, 2, 3, 4]),
    });

    render(<CaptureButton salonId={SALON_ID} customerId={CUSTOMER_ID} fdiCode={46} />);
    fireEvent.click(screen.getByRole("button", { name: /Sensor gabinete 2/ }));

    await waitFor(() => expect(m.captureFromAgent).toHaveBeenCalledTimes(1));
    expect(m.captureFromAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 7345,
        token: TOKEN,
        deviceId: DEVICE_ID,
        customerId: CUSTOMER_ID,
        modality: "periapical",
        fdiCode: 46,
      }),
    );
  });

  it("sube la imagen capturada al expediente", async () => {
    emparejado();
    m.captureFromAgent.mockResolvedValue({
      filename: "rx-0002.jpg",
      mime: "image/jpeg",
      bytes: new Uint8Array([1, 2, 3, 4]),
    });

    render(<CaptureButton salonId={SALON_ID} customerId={CUSTOMER_ID} fdiCode={46} />);
    fireEvent.click(screen.getByRole("button", { name: /Sensor gabinete 2/ }));

    await waitFor(() => expect(m.upload.mutateAsync).toHaveBeenCalledTimes(1));
    const [formData] = m.upload.mutateAsync.mock.calls[0] as [FormData];
    expect(formData.get("customerId")).toBe(CUSTOMER_ID);
    expect(formData.get("modality")).toBe("periapical");
    expect(formData.get("fdiCode")).toBe("46");
    expect(formData.get("file")).toBeInstanceOf(File);
  });

  it("si la captura falla, lo dice y NO sube nada", async () => {
    emparejado();
    const { AgentError } = await import("@/lib/imaging/agent-client");
    m.captureFromAgent.mockRejectedValue(new AgentError("No ha llegado ninguna imagen."));

    render(<CaptureButton salonId={SALON_ID} customerId={CUSTOMER_ID} />);
    fireEvent.click(screen.getByRole("button", { name: /Sensor gabinete 2/ }));

    // Una imagen a medias en la ficha de un paciente es peor que ninguna.
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/no ha llegado/i));
    expect(m.upload.mutateAsync).not.toHaveBeenCalled();
  });
});
