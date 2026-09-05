/**
 * Formulario de la MARCA (white-label) — validación y feedback EN LA UI (sub-7).
 *
 * Los planos PUROS ya están fijados aparte: la conversión/contraste de color en
 * `salon-branding-theme`, la validación de hex y de logo de servidor en
 * `salon-branding` / `salon-branding-server`. Aquí se prueba lo que ESOS no cubren:
 * que el COMPONENTE cliente `SalonMarcaForm` (sub-2) cablea correctamente esos
 * helpers a la experiencia del usuario:
 *
 *   1. Validación de hex — un color inválido marca `aria-invalid`, bloquea el
 *      guardado (no llama a la mutación) y muestra el mensaje; uno válido guarda.
 *   2. Validación del logo en cliente — tipo no admitido y tamaño > 2 MiB muestran
 *      un error y NO suben; un PNG válido dispara la subida.
 *   3. Aviso de contraste — un color problemático (gris medio) avisa; se comprueba
 *      tanto en el color PRINCIPAL como en el de ACENTO (el aviso lo alimenta la
 *      misma medida WCAG que elige el texto legible).
 *   4. Fallback al tema por defecto — sin marca configurada el formulario arranca
 *      con `DEFAULT_PRIMARY_COLOR`.
 *   5. Permiso — cuando el guardado se deniega (owner/manager), el formulario
 *      SURFACEA el mensaje de denegación (el gate real vive en el servidor: se fija
 *      en `salon-branding-server` y `salon-branding-actions`).
 *
 * Se sustituyen por stubs SOLO las mutaciones de datos (`@/hooks/use-salon-branding`):
 * no hay red ni Server Action ni QueryClientProvider en juego, solo la decisión de UI.
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PRIMARY_COLOR,
  MAX_LOGO_BYTES,
  type SalonBranding,
} from "@/lib/salon-branding/branding";

// Mutaciones (hoisted): objetos ESTABLES cuyos campos se reinician en cada test. El
// componente lee `.isPending/.isError/.error` en el render y llama a `.mutate(...)`.
const m = vi.hoisted(() => ({
  colors: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  upload: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  remove: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
}));

vi.mock("@/hooks/use-salon-branding", () => ({
  useSaveSalonColors: () => m.colors,
  useUploadSalonLogo: () => m.upload,
  useRemoveSalonLogo: () => m.remove,
}));

import { SalonMarcaForm } from "@/app/(dashboard)/ajustes/marca/salon-marca-form";

/** Reinicia el estado de una mutación stub a "reposo" antes de cada prueba. */
function resetMutation(mut: {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}): void {
  mut.mutate = vi.fn();
  mut.isPending = false;
  mut.isError = false;
  mut.error = null;
}

beforeEach(() => {
  resetMutation(m.colors);
  resetMutation(m.upload);
  resetMutation(m.remove);
});

afterEach(() => {
  cleanup();
});

/** Monta el formulario; `branding=null` por defecto (salón aún sin personalizar). */
function renderForm(branding: SalonBranding | null = null): HTMLElement {
  const { container } = render(
    createElement(SalonMarcaForm, { salonName: "Estudio Nova", branding }),
  );
  return container;
}

const primaryField = (): HTMLElement =>
  screen.getByRole("textbox", { name: /color principal/i });
const accentField = (): HTMLElement =>
  screen.getByRole("textbox", { name: /color de acento/i });
const saveColorsButton = (): HTMLElement =>
  screen.getByRole("button", { name: /guardar colores/i });
const fileInput = (container: HTMLElement): HTMLInputElement => {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("no se encontró el input de archivo del logo");
  return input;
};

// ─────────────────────────────────────────────────────────────────────────────
// 4) Fallback — sin marca configurada arranca con el color por defecto.
// ─────────────────────────────────────────────────────────────────────────────
describe("SalonMarcaForm · fallback al tema por defecto sin marca", () => {
  it("sin fila de marca, el color principal arranca en DEFAULT_PRIMARY_COLOR", () => {
    renderForm(null);
    expect(primaryField()).toHaveValue(DEFAULT_PRIMARY_COLOR);
    // El acento es opcional: vacío por defecto (sin acento hasta que se elija).
    expect(accentField()).toHaveValue("");
  });

  it("con marca existente arranca con SUS colores (no con el default)", () => {
    renderForm({
      salon_id: "00000000-0000-0000-0000-000000000000",
      logo_url: null,
      primary_color: "#0EA5E9",
      secondary_color: "#F97316",
      created_at: "2026-07-18T00:00:00.000Z",
      updated_at: "2026-07-18T00:00:00.000Z",
    });
    expect(primaryField()).toHaveValue("#0EA5E9");
    expect(accentField()).toHaveValue("#F97316");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1) Validación de hex — bloquea el guardado en inválido, guarda en válido.
// ─────────────────────────────────────────────────────────────────────────────
describe("SalonMarcaForm · validación de color hex", () => {
  it("un hex inválido marca aria-invalid, NO llama a la mutación y avisa", async () => {
    const user = userEvent.setup();
    renderForm(null);

    const primary = primaryField();
    await user.clear(primary);
    await user.type(primary, "nothex");
    expect(primary).toHaveAttribute("aria-invalid", "true");

    await user.click(saveColorsButton());
    expect(m.colors.mutate).not.toHaveBeenCalled();
    expect(
      screen.getByText("El color principal debe estar en formato #RRGGBB."),
    ).toBeInTheDocument();
  });

  it("un hex válido limpia el estado inválido y guarda con el payload esperado", async () => {
    const user = userEvent.setup();
    renderForm(null);

    const primary = primaryField();
    await user.clear(primary);
    await user.type(primary, "#00ff00"); // el formulario lo normaliza a mayúsculas
    expect(primary).toHaveValue("#00FF00");
    expect(primary).toHaveAttribute("aria-invalid", "false");

    await user.click(saveColorsButton());
    expect(m.colors.mutate).toHaveBeenCalledTimes(1);
    // Sin acento ⇒ secondaryColor null (limpia/no fija acento).
    expect(m.colors.mutate).toHaveBeenCalledWith(
      { primaryColor: "#00FF00", secondaryColor: null },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("un acento inválido también bloquea el guardado (con su propia etiqueta)", async () => {
    const user = userEvent.setup();
    renderForm(null);

    await user.type(accentField(), "verde");
    await user.click(saveColorsButton());

    expect(m.colors.mutate).not.toHaveBeenCalled();
    expect(
      screen.getByText("El color de acento debe estar en formato #RRGGBB."),
    ).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) Validación del logo en cliente — tipo y tamaño.
//    Se usa fireEvent.change (no user.upload) para EJERCITAR la validación del
//    componente sin que el filtro `accept` del navegador descarte antes el archivo.
// ─────────────────────────────────────────────────────────────────────────────
describe("SalonMarcaForm · validación del logo en cliente (tipo y tamaño)", () => {
  it("un tipo no admitido (GIF) muestra error y NO sube", () => {
    const container = renderForm(null);
    const file = new File([new Uint8Array(8)], "logo.gif", { type: "image/gif" });

    fireEvent.change(fileInput(container), { target: { files: [file] } });

    expect(m.upload.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/Formato de imagen no admitido/i)).toBeInTheDocument();
  });

  it("un archivo que supera 2 MiB muestra error de tamaño y NO sube", () => {
    const container = renderForm(null);
    const file = new File([new Uint8Array(8)], "logo.png", { type: "image/png" });
    // Falsear el tamaño evita reservar 2 MiB reales; el componente lee `file.size`.
    Object.defineProperty(file, "size", { value: MAX_LOGO_BYTES + 1 });

    fireEvent.change(fileInput(container), { target: { files: [file] } });

    expect(m.upload.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/supera el tamaño máximo/i)).toBeInTheDocument();
  });

  it("un archivo vacío muestra error (nada que subir) y NO sube", () => {
    const container = renderForm(null);
    const file = new File([], "logo.png", { type: "image/png" });

    fireEvent.change(fileInput(container), { target: { files: [file] } });

    expect(m.upload.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/está vacío/i)).toBeInTheDocument();
  });

  it("un PNG válido dentro de límite dispara la subida con el propio File", () => {
    const container = renderForm(null);
    const file = new File([new Uint8Array(64)], "logo.png", { type: "image/png" });

    fireEvent.change(fileInput(container), { target: { files: [file] } });

    expect(m.upload.mutate).toHaveBeenCalledTimes(1);
    expect(m.upload.mutate).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    // No debe quedar ningún mensaje de error de validación.
    expect(screen.queryByText(/Formato de imagen no admitido/i)).toBeNull();
    expect(screen.queryByText(/supera el tamaño máximo/i)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3) Aviso de contraste — detecta un color problemático en principal Y en acento.
// ─────────────────────────────────────────────────────────────────────────────
describe("SalonMarcaForm · aviso de contraste WCAG del color de marca", () => {
  it("un color seguro no avisa; un gris medio problemático SÍ avisa (principal)", async () => {
    const user = userEvent.setup();
    renderForm(null); // arranca con #111827 (casi negro): contraste holgado

    expect(screen.queryByText(/por debajo del mínimo AA/i)).toBeNull();

    const primary = primaryField();
    await user.clear(primary);
    await user.type(primary, "#808080"); // gris medio: no alcanza AA con ningún texto

    const warning = screen.getByText(/por debajo del mínimo AA/i);
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent(/El color principal seguirá siendo legible/i);
  });

  it("el aviso también evalúa el color de ACENTO (mismo criterio de contraste)", async () => {
    const user = userEvent.setup();
    renderForm(null); // principal por defecto es seguro ⇒ el único aviso será del acento

    await user.type(accentField(), "#808080");

    const warning = screen.getByText(/El color de acento seguirá siendo legible/i);
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent(/por debajo del mínimo AA/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5) Permiso — el formulario surfacea la denegación del servidor (owner/manager).
// ─────────────────────────────────────────────────────────────────────────────
describe("SalonMarcaForm · denegación de permiso surfaceada en la UI", () => {
  it("si el guardado se deniega, muestra el mensaje de permiso en una alerta", () => {
    // El gate real (rol distinto de owner/manager ⇒ 403) vive en el servidor; el
    // hook lanza y el formulario lo refleja como error de guardado accesible.
    m.colors.isError = true;
    m.colors.error = new Error("No tienes permiso para editar la marca del salón.");

    renderForm(null);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "No tienes permiso para editar la marca del salón.",
    );
  });
});
