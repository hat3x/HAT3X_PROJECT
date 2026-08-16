import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dispositivos } from "@/components/ajustes/Dispositivos";

// Los parámetros se declaran aunque no se usen: sin ellos `vi.fn` infiere una
// función de cero argumentos y `toHaveBeenCalledWith` deja de compilar.
const registrar = vi.fn(async (_s: unknown) => ({ ok: true }));
const olvidar = vi.fn(async (_e: unknown) => ({ ok: true }));
vi.mock("@/lib/db/acciones-push", () => ({
  registrarDispositivo: (s: unknown) => registrar(s),
  olvidarDispositivo: (e: unknown) => olvidar(e),
}));

const SUSCRITOS = [
  { endpoint: "https://push.ejemplo.test/abc", dispositivo: "Chrome en Windows" },
];
const CLAVE = "BM3XJ_rdUbWHrbN7hGpEPB4vocwuTUOXW80mDl9FtuUni8TmAPUYSzqvHaGWJHi1cX40vTkkYd";

/**
 * jsdom no trae ni service workers ni push. Se ponen dobles para poder probar
 * las dos caras: navegador que lo admite y navegador que no.
 */
function darSoporte(permiso = "granted") {
  const suscripcion = {
    endpoint: "https://push.ejemplo.test/nuevo",
    toJSON: () => ({ keys: { p256dh: "clave-p256", auth: "clave-auth" } }),
  };
  Object.defineProperty(window, "PushManager", { value: class {}, configurable: true });
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      ready: Promise.resolve({ pushManager: { subscribe: async () => suscripcion } }),
    },
    configurable: true,
  });
  Object.defineProperty(window, "Notification", {
    value: { requestPermission: async () => permiso },
    configurable: true,
  });
}

function quitarSoporte() {
  for (const prop of ["PushManager", "Notification"]) {
    Object.defineProperty(window, prop, { value: undefined, configurable: true });
  }
  Object.defineProperty(navigator, "serviceWorker", {
    value: undefined,
    configurable: true,
  });
}

beforeEach(() => {
  registrar.mockClear();
  olvidar.mockClear();
  quitarSoporte();
});

afterEach(() => quitarSoporte());

describe("dispositivos para notificaciones", () => {
  it("enumera los dispositivos ya registrados", () => {
    render(<Dispositivos suscritos={SUSCRITOS} clavePublica={CLAVE} />);
    expect(screen.getByText("Chrome en Windows")).toBeInTheDocument();
  });

  it("sin ninguno, lo dice", () => {
    render(<Dispositivos suscritos={[]} clavePublica={CLAVE} />);
    expect(screen.getByText(/ning[úu]n dispositivo/i)).toBeInTheDocument();
  });

  it("olvidar un dispositivo lo retira", async () => {
    render(<Dispositivos suscritos={SUSCRITOS} clavePublica={CLAVE} />);
    await userEvent.click(screen.getByRole("button", { name: /olvidar/i }));
    expect(olvidar).toHaveBeenCalledWith("https://push.ejemplo.test/abc");
  });

  // En iOS el push solo existe si la app está en la pantalla de inicio. Decirlo
  // es la diferencia entre «no funciona» y «ya sé por qué no me llega».
  it("sin soporte del navegador, explica el caso de iOS y no ofrece activar", async () => {
    render(<Dispositivos suscritos={[]} clavePublica={CLAVE} />);
    expect(await screen.findByText(/pantalla de inicio/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /activar/i })).not.toBeInTheDocument();
  });

  it("con soporte, ofrece activarlas", async () => {
    darSoporte();
    render(<Dispositivos suscritos={[]} clavePublica={CLAVE} />);
    expect(await screen.findByRole("button", { name: /activar/i })).toBeInTheDocument();
  });

  // Sin clave configurada no se puede suscribir aunque el navegador quiera.
  it("sin clave VAPID tampoco ofrece activar", async () => {
    darSoporte();
    render(<Dispositivos suscritos={[]} clavePublica="" />);
    expect(await screen.findByText(/sin configurar/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /activar/i })).not.toBeInTheDocument();
  });

  it("activar registra el dispositivo con su endpoint y sus claves", async () => {
    darSoporte();
    render(<Dispositivos suscritos={[]} clavePublica={CLAVE} />);
    await userEvent.click(await screen.findByRole("button", { name: /activar/i }));

    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://push.ejemplo.test/nuevo",
        p256dh: "clave-p256",
        auth: "clave-auth",
      })
    );
  });

  it("si deniegas el permiso, lo dice en vez de callarse", async () => {
    darSoporte("denied");
    render(<Dispositivos suscritos={[]} clavePublica={CLAVE} />);
    await userEvent.click(await screen.findByRole("button", { name: /activar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/denegado/i);
    expect(registrar).not.toHaveBeenCalled();
  });

  it("enseña el error que devuelve la acción", async () => {
    registrar.mockResolvedValueOnce({ ok: false, error: "No hay sesión." } as never);
    darSoporte();
    render(<Dispositivos suscritos={[]} clavePublica={CLAVE} />);
    await userEvent.click(await screen.findByRole("button", { name: /activar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No hay sesión.");
  });
});
