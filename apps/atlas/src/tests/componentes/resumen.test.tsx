import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Conmutador } from "@/components/resumen/Conmutador";
import { SalaDeControl } from "@/components/resumen/SalaDeControl";
import { VistaLista } from "@/components/resumen/VistaLista";
import { VistaOficina } from "@/components/resumen/VistaOficina";
import type { FilaResumen, Contadores } from "@/lib/db/resumen";
import type { EstadoCheck } from "@/lib/incidencias/maquina";

const guardarVista = vi.fn(async (_v: unknown) => ({ ok: true }));
vi.mock("@/lib/db/acciones-resumen", () => ({
  guardarVista: (v: unknown) => guardarVista(v),
}));

function fila(
  nombre: string,
  estado: EstadoCheck,
  extra: Partial<FilaResumen> = {}
): FilaResumen {
  return {
    proyecto: {
      id: `id-${nombre}`,
      nombre,
      slug: nombre.toLowerCase().replace(/ /g, "-"),
      tipo: "voz",
      estado: "produccion",
      portadaUrl: null,
      gradiente: "linear-gradient(135deg,#0071e3,#00c7be)",
      numClientes: 1,
    },
    estado,
    serviciosOk: 1,
    serviciosTotal: 1,
    uptime30d: 100,
    peorError: null,
    cuota: null,
    ...extra,
  };
}

const FILAS: FilaResumen[] = [
  fila("Recepcionista Sara", "caido", {
    serviciosOk: 2,
    serviciosTotal: 3,
    uptime30d: 78.5,
    peorError: "HTTP 500",
    cuota: 290,
  }),
  fila("Kairos", "ok", { serviciosOk: 4, serviciosTotal: 4 }),
  fila("Atlas", "desconocido", {
    serviciosOk: 0,
    serviciosTotal: 0,
    uptime30d: null,
  }),
];

const CONTADORES: Contadores = {
  proyectos: 3,
  ok: 1,
  degradados: 0,
  caidos: 1,
  desconocidos: 1,
  uptimeMedio: 89.3,
};

beforeEach(() => guardarVista.mockClear());

describe("conmutador de vistas", () => {
  it("ofrece las tres", () => {
    render(<Conmutador actual="control" />);
    for (const v of [/sala de control/i, /lista/i, /oficina/i]) {
      expect(screen.getByRole("radio", { name: v })).toBeInTheDocument();
    }
  });

  it("marca la que está puesta", () => {
    render(<Conmutador actual="lista" />);
    expect(screen.getByRole("radio", { name: /lista/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /oficina/i })).not.toBeChecked();
  });

  it("cambiar de vista la guarda", async () => {
    render(<Conmutador actual="control" />);
    await userEvent.click(screen.getByRole("radio", { name: /oficina/i }));
    expect(guardarVista).toHaveBeenCalledWith("oficina");
  });

  it("enseña el error si no se puede guardar", async () => {
    guardarVista.mockResolvedValueOnce({ ok: false, error: "No hay sesión." } as never);
    render(<Conmutador actual="control" />);
    await userEvent.click(screen.getByRole("radio", { name: /lista/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No hay sesión.");
  });
});

describe("sala de control", () => {
  it("enseña los contadores de la franja", () => {
    render(<SalaDeControl filas={FILAS} contadores={CONTADORES} verImportes={false} />);
    const franja = screen.getByRole("group", { name: /resumen global/i });

    expect(within(franja).getByText("3")).toBeInTheDocument(); // proyectos
    expect(within(franja).getByText(/89,3 %/)).toBeInTheDocument(); // uptime medio
  });

  // Lo que hace útil la portada: no hay que buscar el problema.
  it("lo roto sube arriba del todo", () => {
    render(<SalaDeControl filas={FILAS} contadores={CONTADORES} verImportes={false} />);
    const titulos = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titulos[0]).toBe("Recepcionista Sara");
  });

  it("enseña qué está roto y por qué", () => {
    render(<SalaDeControl filas={FILAS} contadores={CONTADORES} verImportes={false} />);
    expect(screen.getByText("HTTP 500")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("los importes solo si eres el propietario", () => {
    const { rerender } = render(
      <SalaDeControl filas={FILAS} contadores={CONTADORES} verImportes={false} />
    );
    expect(screen.queryByText(/290/)).not.toBeInTheDocument();

    rerender(<SalaDeControl filas={FILAS} contadores={CONTADORES} verImportes />);
    expect(screen.getByText(/290/)).toBeInTheDocument();
  });

  it("sin proyectos lo dice en vez de dejar un hueco", () => {
    render(
      <SalaDeControl
        filas={[]}
        contadores={{ ...CONTADORES, proyectos: 0, uptimeMedio: null }}
        verImportes={false}
      />
    );
    expect(screen.getByText(/todav[íi]a no hay/i)).toBeInTheDocument();
  });
});

describe("vista de lista", () => {
  it("una fila por proyecto, con sus servicios y su uptime", () => {
    render(<VistaLista filas={FILAS} verImportes />);
    expect(screen.getAllByRole("row")).toHaveLength(FILAS.length + 1); // + cabecera
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText(/78,5 %/)).toBeInTheDocument();
  });

  // «sin datos» sale dos veces en esa fila —el distintivo y el uptime— y es
  // coherente: el proyecto no tiene servicios, así que no se sabe nada de él.
  it("sin datos de uptime lo dice, no pone 0", () => {
    render(<VistaLista filas={FILAS} verImportes />);
    const filaAtlas = screen.getByRole("row", { name: /Atlas/ });
    expect(within(filaAtlas).getAllByText(/sin datos/i).length).toBeGreaterThan(0);
    expect(within(filaAtlas).queryByText("0 %")).not.toBeInTheDocument();
  });

  it("la columna de cuota desaparece si no eres el propietario", () => {
    const { rerender } = render(<VistaLista filas={FILAS} verImportes />);
    expect(screen.getByRole("columnheader", { name: /cuota/i })).toBeInTheDocument();

    rerender(<VistaLista filas={FILAS} verImportes={false} />);
    expect(
      screen.queryByRole("columnheader", { name: /cuota/i })
    ).not.toBeInTheDocument();
  });
});

describe("vista de oficina", () => {
  it("una sala por proyecto", () => {
    render(<VistaOficina filas={FILAS} />);
    for (const f of FILAS) {
      expect(screen.getByText(f.proyecto.nombre)).toBeInTheDocument();
    }
  });

  // El color no basta: el estado tiene que poder leerse.
  it("cada sala dice su estado con palabras, no solo con color", () => {
    render(<VistaOficina filas={FILAS} />);
    expect(screen.getByText(/ca[íi]do/i)).toBeInTheDocument();
    expect(screen.getByText(/operativo/i)).toBeInTheDocument();
  });

  it("las luces de dentro son sus servicios", () => {
    render(<VistaOficina filas={FILAS} />);
    const sala = screen.getByRole("link", { name: /Recepcionista Sara/ });
    expect(within(sala).getAllByRole("presentation")).toHaveLength(3);
  });
});
