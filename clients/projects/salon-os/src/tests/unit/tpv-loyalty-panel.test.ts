/**
 * Tests del PARSEO del lector físico (HID) en el panel de fidelización del TPV
 * (`LoyaltyPanel` de `app/(dashboard)/tpv/loyalty-panel`) — sub-9.
 *
 * Un lector QR físico actúa como "keyboard wedge": TECLEA el token en el campo
 * enfocado y termina con Enter, que ENVÍA el formulario. Aquí se prueba que ese
 * "texto + Enter" aterriza como un `qr_token` LIMPIO (recortado) en `onScan`, que
 * el campo queda listo para el siguiente escaneo y que una entrada vacía —o una
 * consulta ya en curso— NO dispara ninguna búsqueda. La política de FOCO del
 * escáner (mantenerlo armado sin robar el foco al resto del TPV) se cubre aparte
 * en `tpv-scanner.test.ts`.
 *
 * `CameraScanButton` se sustituye por un stub: la cámara (ZXing / getUserMedia) no
 * es el objeto de esta prueba y no debe cargarse en jsdom. No hay red ni Server
 * Action: el panel es presentacional y recibe `onScan` como prop.
 */
import { createElement, type ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/tpv/camera-scan-button", () => ({
  CameraScanButton: () => null,
}));

import { LoyaltyPanel } from "@/app/(dashboard)/tpv/loyalty-panel";

/** Monta el panel en reposo (sin cliente escaneado) con espías en los callbacks. */
function renderPanel(over: Partial<ComponentProps<typeof LoyaltyPanel>> = {}) {
  const onScan = vi.fn();
  const props: ComponentProps<typeof LoyaltyPanel> = {
    pending: false,
    result: undefined,
    onScan,
    onClear: vi.fn(),
    appliedCouponId: null,
    onApplyCoupon: vi.fn(),
    onRemoveCoupon: vi.fn(),
    ...over,
  };
  render(createElement(LoyaltyPanel, props));
  const input = screen.getByLabelText(/token del carné/i) as HTMLInputElement;
  return { onScan, input };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LoyaltyPanel · captura del lector físico (HID)", () => {
  it("un token tecleado + Enter dispara la consulta y deja el campo listo", async () => {
    const user = userEvent.setup();
    const { onScan, input } = renderPanel();

    await user.type(input, "loy_abc123{Enter}");

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("loy_abc123");
    expect(input.value).toBe(""); // listo para el siguiente escaneo
  });

  it("recorta los espacios del token leído (qr_token limpio)", async () => {
    const user = userEvent.setup();
    const { onScan } = renderPanel();

    await user.type(screen.getByLabelText(/token del carné/i), "  loy_espacios  {Enter}");

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("loy_espacios");
  });

  it("una entrada vacía o de solo espacios no dispara ninguna consulta", async () => {
    const user = userEvent.setup();
    const { onScan, input } = renderPanel();

    await user.type(input, "   {Enter}");

    expect(onScan).not.toHaveBeenCalled();
  });

  it("también envía al pulsar el botón Buscar (entrada manual)", async () => {
    const user = userEvent.setup();
    const { onScan, input } = renderPanel();

    await user.type(input, "loy_manual");
    await user.click(screen.getByRole("button", { name: /buscar/i }));

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("loy_manual");
  });

  it("con una consulta en curso (pending) el botón se deshabilita y Enter no re-dispara", async () => {
    const user = userEvent.setup();
    const { onScan, input } = renderPanel({ pending: true });

    const submit = screen.getByRole("button", { name: /buscar/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await user.type(input, "loy_pending{Enter}");

    expect(onScan).not.toHaveBeenCalled();
  });
});
