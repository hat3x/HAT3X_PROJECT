import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PermisosUsuario } from "@/components/ajustes/PermisosUsuario";

// Los parámetros se declaran aunque no se usen: sin ellos `vi.fn` infiere una
// función de cero argumentos y `toHaveBeenCalledWith` deja de compilar.
const asignar = vi.fn(async (_u: unknown, _p: unknown, _r: unknown) => ({ ok: true }));
const retirar = vi.fn(async (_u: unknown, _p: unknown) => ({ ok: true }));
vi.mock("@/lib/db/acciones-usuarios", () => ({
  asignarPermiso: (u: unknown, p: unknown, r: unknown) => asignar(u, p, r),
  retirarPermiso: (u: unknown, p: unknown) => retirar(u, p),
}));

const USUARIO = "44444444-4444-4444-4444-444444444444";
const KAIROS = "55555555-5555-5555-5555-555555555555";
const SARA = "66666666-6666-6666-6666-666666666666";
const PROYECTOS = [
  { id: KAIROS, nombre: "Kairos" },
  { id: SARA, nombre: "Recepcionista Sara" },
];

beforeEach(() => {
  asignar.mockClear();
  retirar.mockClear();
});

describe("permisos de una persona", () => {
  it("avisa cuando no llega a ningún proyecto", () => {
    render(<PermisosUsuario usuarioId={USUARIO} permisos={[]} proyectos={PROYECTOS} />);
    expect(screen.getByText(/sin acceso a ning/i)).toBeInTheDocument();
  });

  it("enseña a qué proyecto llega y con qué rol", () => {
    render(
      <PermisosUsuario
        usuarioId={USUARIO}
        permisos={[{ proyectoId: KAIROS, proyectoNombre: "Kairos", rol: "editor" }]}
        proyectos={PROYECTOS}
      />
    );
    expect(screen.getByText(/Kairos · editor/)).toBeInTheDocument();
  });

  it("da acceso al proyecto y rol elegidos", async () => {
    render(<PermisosUsuario usuarioId={USUARIO} permisos={[]} proyectos={PROYECTOS} />);
    await userEvent.selectOptions(screen.getByLabelText(/proyecto/i), SARA);
    await userEvent.selectOptions(screen.getByLabelText(/rol/i), "lector");
    await userEvent.click(screen.getByRole("button", { name: /dar acceso/i }));

    expect(asignar).toHaveBeenCalledWith(USUARIO, SARA, "lector");
  });

  it("editor es el rol por defecto", async () => {
    render(<PermisosUsuario usuarioId={USUARIO} permisos={[]} proyectos={PROYECTOS} />);
    await userEvent.selectOptions(screen.getByLabelText(/proyecto/i), KAIROS);
    await userEvent.click(screen.getByRole("button", { name: /dar acceso/i }));

    expect(asignar).toHaveBeenCalledWith(USUARIO, KAIROS, "editor");
  });

  it("no deja dar acceso sin elegir proyecto", async () => {
    render(<PermisosUsuario usuarioId={USUARIO} permisos={[]} proyectos={PROYECTOS} />);
    await userEvent.click(screen.getByRole("button", { name: /dar acceso/i }));

    expect(asignar).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/proyecto/i);
  });

  it("solo ofrece los proyectos a los que aún no llega", () => {
    render(
      <PermisosUsuario
        usuarioId={USUARIO}
        permisos={[{ proyectoId: KAIROS, proyectoNombre: "Kairos", rol: "editor" }]}
        proyectos={PROYECTOS}
      />
    );
    const select = screen.getByLabelText(/proyecto/i) as HTMLSelectElement;
    // Kairos ya lo tiene: repetirlo solo serviría para reasignarle el mismo rol.
    expect([...select.options].map((o) => o.value)).toEqual(["", SARA]);
  });

  it("quitar el acceso lo retira", async () => {
    render(
      <PermisosUsuario
        usuarioId={USUARIO}
        permisos={[{ proyectoId: KAIROS, proyectoNombre: "Kairos", rol: "editor" }]}
        proyectos={PROYECTOS}
      />
    );
    await userEvent.click(
      screen.getByRole("button", { name: /quitar acceso a Kairos/i })
    );
    expect(retirar).toHaveBeenCalledWith(USUARIO, KAIROS);
  });

  it("enseña el error que devuelve la acción", async () => {
    asignar.mockResolvedValueOnce({
      ok: false,
      error: "Solo el propietario reparte permisos.",
    } as never);
    render(<PermisosUsuario usuarioId={USUARIO} permisos={[]} proyectos={PROYECTOS} />);
    await userEvent.selectOptions(screen.getByLabelText(/proyecto/i), KAIROS);
    await userEvent.click(screen.getByRole("button", { name: /dar acceso/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Solo el propietario");
  });
});
