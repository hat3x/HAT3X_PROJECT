import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormServicio } from "@/components/proyectos/FormServicio";
import { FormContrato } from "@/components/proyectos/FormContrato";

// Los módulos reales son "use server" y hablarían con Supabase. Aquí se prueba
// lo que el formulario recoge y manda; la validación tiene su propio test.
// Los parámetros se declaran aunque no se usen: sin ellos `vi.fn` infiere una
// función de cero argumentos y `toHaveBeenCalledWith` deja de compilar.
const guardarServicio = vi.fn(async (_entrada: unknown, _slug: unknown) => ({
  ok: true,
}));
const guardarContrato = vi.fn(async (_entrada: unknown) => ({ ok: true }));
vi.mock("@/lib/db/acciones-proyecto", () => ({
  guardarServicio: (entrada: unknown, slug: unknown) => guardarServicio(entrada, slug),
  guardarContrato: (entrada: unknown) => guardarContrato(entrada),
}));

const PROYECTO = "22222222-2222-2222-2222-222222222222";
const CLIENTES = [
  { id: "11111111-1111-1111-1111-111111111111", nombre: "Dental Demo" },
  { id: "33333333-3333-3333-3333-333333333333", nombre: "Club Demo" },
];

beforeEach(() => {
  guardarServicio.mockClear();
  guardarContrato.mockClear();
});

function servicio() {
  render(
    <FormServicio proyectoId={PROYECTO} slugProyecto="recep-sara" clientes={CLIENTES} />
  );
}

function contrato() {
  render(<FormContrato proyectoId={PROYECTO} clientes={CLIENTES} />);
}

describe("alta de servicio", () => {
  it("está plegado hasta que lo pides", () => {
    servicio();
    expect(screen.queryByLabelText(/nombre/i)).not.toBeInTheDocument();
  });

  it("ofrece los diez tipos del esquema", async () => {
    servicio();
    await userEvent.click(screen.getByRole("button", { name: /añadir servicio/i }));
    const tipos = screen.getByLabelText(/tipo/i) as HTMLSelectElement;
    expect([...tipos.options].map((o) => o.value)).toEqual([
      "web", "api", "webhook", "workflow", "agente-voz",
      "telefonia", "base-datos", "cron", "dominio", "otro",
    ]);
  });

  it("sin cliente elegido manda null: el servicio es del proyecto", async () => {
    servicio();
    await userEvent.click(screen.getByRole("button", { name: /añadir servicio/i }));
    await userEvent.type(screen.getByLabelText(/nombre/i), "Agente Retell");
    await userEvent.selectOptions(screen.getByLabelText(/tipo/i), "agente-voz");
    await userEvent.click(screen.getByRole("button", { name: /guardar servicio/i }));

    expect(guardarServicio).toHaveBeenCalledWith(
      {
        proyectoId: PROYECTO,
        clienteId: null,
        nombre: "Agente Retell",
        tipo: "agente-voz",
        proveedor: null,
      },
      "recep-sara"
    );
  });

  it("atribuye el servicio al cliente elegido", async () => {
    servicio();
    await userEvent.click(screen.getByRole("button", { name: /añadir servicio/i }));
    await userEvent.type(screen.getByLabelText(/nombre/i), "n8n 02-crear-cita");
    await userEvent.selectOptions(screen.getByLabelText(/tipo/i), "workflow");
    await userEvent.type(screen.getByLabelText(/proveedor/i), "n8n");
    await userEvent.selectOptions(screen.getByLabelText(/cliente/i), CLIENTES[0]!.id);
    await userEvent.click(screen.getByRole("button", { name: /guardar servicio/i }));

    expect(guardarServicio).toHaveBeenCalledWith(
      expect.objectContaining({ clienteId: CLIENTES[0]!.id, proveedor: "n8n" }),
      "recep-sara"
    );
  });

  it("enseña el error y no cierra el formulario", async () => {
    guardarServicio.mockResolvedValueOnce({ ok: false, error: "Sin permiso." } as never);
    servicio();
    await userEvent.click(screen.getByRole("button", { name: /añadir servicio/i }));
    await userEvent.type(screen.getByLabelText(/nombre/i), "X");
    await userEvent.click(screen.getByRole("button", { name: /guardar servicio/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sin permiso.");
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
  });
});

describe("alta de contrato", () => {
  it("está plegado hasta que lo pides", () => {
    contrato();
    expect(screen.queryByLabelText(/alta/i)).not.toBeInTheDocument();
  });

  it("no deja guardar sin elegir cliente", async () => {
    contrato();
    await userEvent.click(screen.getByRole("button", { name: /añadir contrato/i }));
    await userEvent.click(screen.getByRole("button", { name: /guardar contrato/i }));

    expect(guardarContrato).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/cliente/i);
  });

  it("propone hoy como fecha de alta", async () => {
    contrato();
    await userEvent.click(screen.getByRole("button", { name: /añadir contrato/i }));
    const alta = screen.getByLabelText(/alta/i) as HTMLInputElement;
    expect(alta.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("manda la cuota como número y los add-ons partidos por coma", async () => {
    contrato();
    await userEvent.click(screen.getByRole("button", { name: /añadir contrato/i }));
    await userEvent.selectOptions(screen.getByLabelText(/cliente/i), CLIENTES[0]!.id);
    await userEvent.clear(screen.getByLabelText(/alta/i));
    await userEvent.type(screen.getByLabelText(/alta/i), "2026-05-01");
    await userEvent.type(screen.getByLabelText(/cuota/i), "290");
    await userEvent.type(screen.getByLabelText(/add-ons/i), "recepcionista-ia, sms");
    await userEvent.click(screen.getByRole("button", { name: /guardar contrato/i }));

    expect(guardarContrato).toHaveBeenCalledWith({
      clienteId: CLIENTES[0]!.id,
      proyectoId: PROYECTO,
      cuotaMensual: 290,
      addons: ["recepcionista-ia", "sms"],
      alta: "2026-05-01",
      baja: null,
      estado: "activo",
    });
  });

  it("una cuota vacía viaja como null: hay proyectos sin cargo", async () => {
    contrato();
    await userEvent.click(screen.getByRole("button", { name: /añadir contrato/i }));
    await userEvent.selectOptions(screen.getByLabelText(/cliente/i), CLIENTES[1]!.id);
    await userEvent.click(screen.getByRole("button", { name: /guardar contrato/i }));

    expect(guardarContrato).toHaveBeenCalledWith(
      expect.objectContaining({ cuotaMensual: null, addons: [] })
    );
  });

  it("enseña el error que devuelve la acción", async () => {
    guardarContrato.mockResolvedValueOnce({
      ok: false,
      error: "Solo el propietario puede gestionar contratos.",
    } as never);
    contrato();
    await userEvent.click(screen.getByRole("button", { name: /añadir contrato/i }));
    await userEvent.selectOptions(screen.getByLabelText(/cliente/i), CLIENTES[0]!.id);
    await userEvent.click(screen.getByRole("button", { name: /guardar contrato/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Solo el propietario");
  });
});
