import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormCredencial } from "@/components/ajustes/FormCredencial";
import { FilaCredencial } from "@/components/ajustes/FilaCredencial";
import type { CredencialResumen } from "@/lib/db/credenciales";

// Los parámetros se declaran aunque no se usen: sin ellos `vi.fn` infiere una
// función de cero argumentos y `toHaveBeenCalledWith` deja de compilar.
const guardar = vi.fn(async (_entrada: unknown) => ({ ok: true }));
const rotar = vi.fn(async (_id: unknown, _secreto: unknown) => ({ ok: true }));
const borrar = vi.fn(async (_id: unknown) => ({ ok: true }));
vi.mock("@/lib/db/acciones-credenciales", () => ({
  guardarCredencial: (e: unknown) => guardar(e),
  rotarCredencial: (id: unknown, s: unknown) => rotar(id, s),
  borrarCredencial: (id: unknown) => borrar(id),
}));

const PROYECTOS = [
  { id: "22222222-2222-2222-2222-222222222222", nombre: "Recepcionista Sara" },
];

const CREDENCIAL: CredencialResumen = {
  id: "99999999-9999-9999-9999-999999999999",
  proveedor: "retell",
  etiqueta: "API produccion",
  prefijo: "sk_live_••••f456",
  proyectoId: null,
  creadoEn: "2026-05-01T10:00:00.000Z",
  rotadaEn: null,
};

beforeEach(() => {
  guardar.mockClear();
  rotar.mockClear();
  borrar.mockClear();
});

describe("alta de credencial", () => {
  it("está plegada hasta que la pides", () => {
    render(<FormCredencial proyectos={PROYECTOS} />);
    expect(screen.queryByLabelText(/secreto/i)).not.toBeInTheDocument();
  });

  it("el secreto se escribe a ciegas, como una contraseña", async () => {
    render(<FormCredencial proyectos={PROYECTOS} />);
    await userEvent.click(screen.getByRole("button", { name: /añadir clave/i }));
    expect(screen.getByLabelText(/secreto/i)).toHaveAttribute("type", "password");
  });

  it("sin proyecto elegido la credencial es global", async () => {
    render(<FormCredencial proyectos={PROYECTOS} />);
    await userEvent.click(screen.getByRole("button", { name: /añadir clave/i }));
    await userEvent.type(screen.getByLabelText(/proveedor/i), "retell");
    await userEvent.type(screen.getByLabelText(/etiqueta/i), "API produccion");
    await userEvent.type(screen.getByLabelText(/secreto/i), "sk_live_abc12345");
    await userEvent.click(screen.getByRole("button", { name: /guardar clave/i }));

    expect(guardar).toHaveBeenCalledWith({
      proveedor: "retell",
      etiqueta: "API produccion",
      secreto: "sk_live_abc12345",
      proyectoId: null,
    });
  });

  it("ata la credencial al proyecto elegido", async () => {
    render(<FormCredencial proyectos={PROYECTOS} />);
    await userEvent.click(screen.getByRole("button", { name: /añadir clave/i }));
    await userEvent.type(screen.getByLabelText(/proveedor/i), "twilio");
    await userEvent.type(screen.getByLabelText(/etiqueta/i), "Token");
    await userEvent.type(screen.getByLabelText(/secreto/i), "sk_live_abc12345");
    await userEvent.selectOptions(screen.getByLabelText(/proyecto/i), PROYECTOS[0]!.id);
    await userEvent.click(screen.getByRole("button", { name: /guardar clave/i }));

    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({ proyectoId: PROYECTOS[0]!.id })
    );
  });

  it("al guardar bien, el secreto desaparece de la pantalla", async () => {
    render(<FormCredencial proyectos={PROYECTOS} />);
    await userEvent.click(screen.getByRole("button", { name: /añadir clave/i }));
    await userEvent.type(screen.getByLabelText(/proveedor/i), "retell");
    await userEvent.type(screen.getByLabelText(/etiqueta/i), "API");
    await userEvent.type(screen.getByLabelText(/secreto/i), "sk_live_abc12345");
    await userEvent.click(screen.getByRole("button", { name: /guardar clave/i }));

    expect(
      await screen.findByRole("button", { name: /añadir clave/i })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/secreto/i)).not.toBeInTheDocument();
  });

  it("enseña el error y conserva lo escrito", async () => {
    guardar.mockResolvedValueOnce({
      ok: false,
      error: "Solo el propietario gestiona el llavero.",
    } as never);
    render(<FormCredencial proyectos={PROYECTOS} />);
    await userEvent.click(screen.getByRole("button", { name: /añadir clave/i }));
    await userEvent.type(screen.getByLabelText(/proveedor/i), "retell");
    await userEvent.type(screen.getByLabelText(/etiqueta/i), "API");
    await userEvent.type(screen.getByLabelText(/secreto/i), "sk_live_abc12345");
    await userEvent.click(screen.getByRole("button", { name: /guardar clave/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Solo el propietario");
    expect(screen.getByLabelText(/proveedor/i)).toHaveValue("retell");
  });
});

describe("una fila del llavero", () => {
  it("enseña el prefijo enmascarado y nada más", () => {
    render(<FilaCredencial credencial={CREDENCIAL} />);
    expect(screen.getByText("sk_live_••••f456")).toBeInTheDocument();
    expect(screen.getByText("retell")).toBeInTheDocument();
    expect(screen.getByText("API produccion")).toBeInTheDocument();
  });

  it("dice cuándo se dio de alta si nunca se ha rotado", () => {
    render(<FilaCredencial credencial={CREDENCIAL} />);
    expect(screen.getByText(/alta/i)).toBeInTheDocument();
  });

  it("dice cuándo se rotó por última vez", () => {
    render(
      <FilaCredencial
        credencial={{ ...CREDENCIAL, rotadaEn: "2026-08-01T09:00:00.000Z" }}
      />
    );
    expect(screen.getByText(/rotada/i)).toBeInTheDocument();
  });

  it("rotar manda el secreto nuevo", async () => {
    render(<FilaCredencial credencial={CREDENCIAL} />);
    await userEvent.click(screen.getByRole("button", { name: /rotar/i }));
    await userEvent.type(screen.getByLabelText(/nuevo secreto/i), "sk_live_nuevo123");
    await userEvent.click(screen.getByRole("button", { name: /guardar rotaci/i }));

    expect(rotar).toHaveBeenCalledWith(CREDENCIAL.id, "sk_live_nuevo123");
  });

  it("borrar pide confirmación antes de hacer nada", async () => {
    render(<FilaCredencial credencial={CREDENCIAL} />);
    await userEvent.click(screen.getByRole("button", { name: /^borrar$/i }));

    // Un clic no basta: una clave borrada no se recupera.
    expect(borrar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /confirmar borrado/i }));
    expect(borrar).toHaveBeenCalledWith(CREDENCIAL.id);
  });
});
