/**
 * Tests de la captura del lector físico (HID) de fidelización en el TPV (sub-2).
 *
 * Dos niveles:
 *  1. La POLÍTICA de foco pura (`@/lib/loyalty/scanner-focus`): qué elementos
 *     hacen que el escáner CEDA el foco y cuándo debe RECUPERARLO. Es la lógica
 *     delicada del requisito "siempre enfocado, sin interferir con el resto del TPV".
 *  2. El hook `useScannerFocus` sobre jsdom: comprueba el comportamiento observable
 *     —enfocar al montar, re-armar tras un toque en zona neutra, y CEDER ante un
 *     campo de texto o un diálogo modal abierto—.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isFocusYieldTarget,
  SCANNER_RECLAIM_DELAY_MS,
  shouldReclaimScannerFocus,
} from "@/lib/loyalty/scanner-focus";
import { useScannerFocus } from "@/hooks/use-scanner-focus";

// ── Política pura: isFocusYieldTarget ────────────────────────────────────────

describe("isFocusYieldTarget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("CEDE a los controles de escritura (input de texto, textarea, select)", () => {
    const text = document.createElement("input"); // type por defecto = "text"
    const search = document.createElement("input");
    search.type = "search";
    const number = document.createElement("input");
    number.type = "number";
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");

    expect(isFocusYieldTarget(text)).toBe(true);
    expect(isFocusYieldTarget(search)).toBe(true);
    expect(isFocusYieldTarget(number)).toBe(true);
    expect(isFocusYieldTarget(textarea)).toBe(true);
    expect(isFocusYieldTarget(select)).toBe(true);
  });

  it("NO cede a botones, enlaces, inputs no textuales ni a `null` (foco en body)", () => {
    const button = document.createElement("button");
    const link = document.createElement("a");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const div = document.createElement("div");

    expect(isFocusYieldTarget(button)).toBe(false);
    expect(isFocusYieldTarget(link)).toBe(false);
    expect(isFocusYieldTarget(checkbox)).toBe(false);
    expect(isFocusYieldTarget(div)).toBe(false);
    expect(isFocusYieldTarget(null)).toBe(false);
  });

  it("CEDE a lo editable y a los roles de campo (contenteditable, textbox)", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const textbox = document.createElement("span");
    textbox.setAttribute("role", "textbox");

    expect(isFocusYieldTarget(editable)).toBe(true);
    expect(isFocusYieldTarget(textbox)).toBe(true);
  });

  it("CEDE dentro de un diálogo/popover gestionado (Radix)", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inner = document.createElement("button");
    dialog.appendChild(inner);

    expect(isFocusYieldTarget(inner)).toBe(true);
  });

  it("CEDE a un disparador de popover ABIERTO, pero no a uno cerrado", () => {
    const open = document.createElement("button");
    open.setAttribute("aria-expanded", "true");
    const stateOpen = document.createElement("button");
    stateOpen.setAttribute("data-state", "open");
    const closed = document.createElement("button");
    closed.setAttribute("aria-expanded", "false");

    expect(isFocusYieldTarget(open)).toBe(true);
    expect(isFocusYieldTarget(stateOpen)).toBe(true);
    expect(isFocusYieldTarget(closed)).toBe(false);
  });
});

// ── Núcleo de decisión: shouldReclaimScannerFocus ────────────────────────────

describe("shouldReclaimScannerFocus", () => {
  const scanner = document.createElement("input");

  it("recupera el foco desde una zona neutra (botón o body)", () => {
    const button = document.createElement("button");
    expect(
      shouldReclaimScannerFocus({ active: button, scanner, overlayOpen: false }),
    ).toBe(true);
    expect(
      shouldReclaimScannerFocus({ active: null, scanner, overlayOpen: false }),
    ).toBe(true);
  });

  it("NO recupera si no hay input de escáner montado", () => {
    expect(
      shouldReclaimScannerFocus({ active: null, scanner: null, overlayOpen: false }),
    ).toBe(false);
  });

  it("NO recupera con un diálogo modal abierto", () => {
    const button = document.createElement("button");
    expect(
      shouldReclaimScannerFocus({ active: button, scanner, overlayOpen: true }),
    ).toBe(false);
  });

  it("NO recupera si el foco ya está en el escáner", () => {
    expect(
      shouldReclaimScannerFocus({ active: scanner, scanner, overlayOpen: false }),
    ).toBe(false);
  });

  it("NO recupera si el cajero está en un control de escritura", () => {
    const search = document.createElement("input");
    search.type = "search";
    expect(
      shouldReclaimScannerFocus({ active: search, scanner, overlayOpen: false }),
    ).toBe(false);
  });
});

// ── Hook: useScannerFocus ────────────────────────────────────────────────────

describe("useScannerFocus", () => {
  let scanner: HTMLInputElement;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    scanner = document.createElement("input");
    scanner.type = "text";
    document.body.appendChild(scanner);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  function mountHook(enabled = true) {
    const inputRef = { current: scanner };
    return renderHook(() => useScannerFocus({ inputRef, enabled }));
  }

  it("enfoca el input del escáner al montar (sin que el cajero haga clic)", () => {
    mountHook();
    expect(document.activeElement).toBe(scanner);
  });

  it("no gestiona el foco cuando está deshabilitado", () => {
    mountHook(false);
    expect(document.activeElement).not.toBe(scanner);
  });

  it("re-arma el foco tras un toque en zona neutra (p. ej. un botón del catálogo)", () => {
    mountHook();
    const button = document.createElement("button");
    document.body.appendChild(button);

    act(() => {
      button.focus();
    });
    expect(document.activeElement).toBe(button);

    act(() => {
      document.dispatchEvent(new Event("pointerup"));
      vi.advanceTimersByTime(SCANNER_RECLAIM_DELAY_MS);
    });
    expect(document.activeElement).toBe(scanner);
  });

  it("NO roba el foco a un campo de texto que el cajero está usando", () => {
    mountHook();
    const search = document.createElement("input");
    search.type = "search";
    document.body.appendChild(search);

    act(() => {
      search.focus();
    });
    act(() => {
      document.dispatchEvent(new Event("focusout"));
      vi.advanceTimersByTime(SCANNER_RECLAIM_DELAY_MS);
    });
    expect(document.activeElement).toBe(search);
  });

  it("NO roba el foco mientras hay un diálogo modal abierto (cobro/recibo)", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const dialogInput = document.createElement("input");
    dialog.appendChild(dialogInput);
    document.body.appendChild(dialog);

    mountHook(); // Al montar hay overlay → no debe enfocar el escáner.
    act(() => {
      dialogInput.focus();
    });
    act(() => {
      document.dispatchEvent(new Event("pointerup"));
      vi.advanceTimersByTime(SCANNER_RECLAIM_DELAY_MS);
    });
    expect(document.activeElement).toBe(dialogInput);
  });
});
