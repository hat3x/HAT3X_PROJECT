/**
 * Política PURA de foco del lector físico (HID) de fidelización en el TPV.
 *
 * Se aísla aquí —sin React ni estado de componente— para poder testearla y para
 * que el hook de captura ({@link import("@/hooks/use-scanner-focus")}) se centre
 * solo en el ciclo de vida del DOM y los temporizadores.
 *
 * ── Contexto ──────────────────────────────────────────────────────────────────
 * Un lector de QR físico actúa como "keyboard wedge": TECLEA el `qr_token` a gran
 * velocidad en el campo enfocado y termina con Enter. Para que un escaneo aterrice
 * SIEMPRE —sin que el cajero tenga que hacer clic en el campo cada vez— el input
 * de fidelización debe permanecer enfocado. Pero "siempre enfocado" chocaría con
 * el resto del TPV (buscador, cantidades, precio, IVA, nota, diálogos de cobro) si
 * le robara el foco a lo que el cajero está usando.
 *
 * La regla, por tanto, es RE-ARMAR el foco solo cuando el elemento activo NO es un
 * control de escritura ni hay un popover/diálogo gestionando el suyo:
 * {@link isFocusYieldTarget} decide cuándo hay que CEDER y {@link shouldReclaimScannerFocus}
 * compone la decisión final que aplica el hook.
 *
 * No confundir con el módulo hermano `scan.ts` (normalización del texto leído por
 * CÁMARA y traducción de errores de `getUserMedia`): son concerns distintos.
 */

/** Retardo (ms) antes de re-enfocar el input del escáner tras perder el foco. */
export const SCANNER_RECLAIM_DELAY_MS = 80;

/** Tipos de `<input>` donde el cajero TECLEA: nunca les robamos el foco. */
const EDITABLE_INPUT_TYPES = new Set([
  "text",
  "search",
  "number",
  "email",
  "tel",
  "url",
  "password",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
]);

/**
 * Contenedores "efímeros" que gestionan su propio foco (diálogos y popovers de
 * Radix: cobro, recibo, desplegable de IVA, menús). Mientras el foco esté dentro
 * de uno de ellos NO lo recuperamos, para no cerrarlos ni atrapar al usuario.
 */
const MANAGED_FOCUS_CONTAINERS = [
  "[role='dialog']",
  "[role='alertdialog']",
  "[role='listbox']",
  "[role='menu']",
  "[data-radix-popper-content-wrapper]",
].join(",");

/**
 * ¿Debe el escáner CEDER el foco a `el` (no robárselo)?
 *
 * Devuelve `true` para controles de escritura (inputs de texto, `textarea`,
 * `select`), elementos editables, disparadores de popover ABIERTOS (p. ej. el
 * Select de IVA desplegado) y cualquier elemento dentro de un diálogo/popover
 * gestionado. Devuelve `false` para botones, enlaces, zonas neutras y `null`
 * (foco en `body`): ahí el escáner puede re-armarse sin molestar.
 */
export function isFocusYieldTarget(el: Element | null): boolean {
  if (el === null) return false;

  // Dentro de un diálogo/popover gestionado (cobro, recibo, IVA desplegado…).
  if (el.closest(MANAGED_FOCUS_CONTAINERS) !== null) return true;

  // Disparador de un popover ABIERTO (el trigger cerrado se trata como botón).
  if (
    el.getAttribute("aria-expanded") === "true" ||
    el.getAttribute("data-state") === "open"
  ) {
    return true;
  }

  // Contenido editable (rich text, celdas contenteditable…).
  const contentEditable = el.getAttribute("contenteditable");
  if (
    (el as HTMLElement).isContentEditable ||
    contentEditable === "true" ||
    contentEditable === ""
  ) {
    return true;
  }

  const role = el.getAttribute("role");
  if (role === "textbox" || role === "searchbox") return true;

  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    return EDITABLE_INPUT_TYPES.has((el as HTMLInputElement).type.toLowerCase());
  }
  return false;
}

/** Entrada de {@link shouldReclaimScannerFocus}: el estado del foco en un instante. */
export interface ReclaimFocusParams {
  /** Elemento con el foco ahora mismo (`document.activeElement`). */
  active: Element | null;
  /** El input del escáner que queremos mantener enfocado (`ref.current`). */
  scanner: Element | null;
  /** Hay un diálogo modal abierto que gestiona su propio foco. */
  overlayOpen: boolean;
}

/**
 * Núcleo de decisión (puro): ¿debe el escáner RECUPERAR el foco ahora?
 *
 * `true` solo si hay input de escáner montado, no hay diálogo modal abierto, el
 * foco no está ya en el escáner y el elemento activo no es un control al que haya
 * que cederle el foco ({@link isFocusYieldTarget}). Así el escáner queda armado en
 * reposo (foco en `body`, botones táctiles del catálogo…) pero jamás interrumpe al
 * cajero mientras escribe o cobra.
 */
export function shouldReclaimScannerFocus({
  active,
  scanner,
  overlayOpen,
}: ReclaimFocusParams): boolean {
  if (scanner === null) return false;
  if (overlayOpen) return false;
  if (active === scanner) return false;
  return !isFocusYieldTarget(active);
}
