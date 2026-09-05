"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  SCANNER_RECLAIM_DELAY_MS,
  shouldReclaimScannerFocus,
} from "@/lib/loyalty/scanner-focus";

/** Diálogos modales de Radix que, si están abiertos, gestionan su propio foco. */
const OVERLAY_SELECTOR = "[role='dialog'],[role='alertdialog']";

interface UseScannerFocusOptions {
  /** El `<input>` de captura que debe permanecer enfocado. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Desactiva la gestión de foco (por defecto activa). */
  enabled?: boolean;
}

/**
 * Mantiene un `<input>` de captura de escáner (HID) SIEMPRE enfocado, sin robar el
 * foco al resto del TPV. Así un lector físico —que teclea el token y pulsa Enter—
 * "aterriza" siempre en el campo correcto sin que el cajero haga clic en él.
 *
 * ── Cómo re-arma el foco ──────────────────────────────────────────────────────
 *  • Al montar (o al reactivarse) enfoca el input.
 *  • Ante cualquier movimiento de foco (`focusout`), toque (`pointerup`) o al
 *    volver a la pestaña (`window.focus`), reprograma un re-enfoque con un pequeño
 *    retardo. El retardo deja que el foco "se asiente" (p. ej. al abrir el Select
 *    de IVA) y así {@link shouldReclaimScannerFocus} decide sobre el estado final.
 *  • Solo recupera el foco si NO hay un diálogo modal abierto y el elemento activo
 *    no es un control de escritura ni un popover: si el cajero está buscando,
 *    editando una cantidad o cobrando, el escáner CEDE y no interfiere.
 *
 * Devuelve una función para RE-ARMAR el foco de forma imperativa (útil justo
 * después de disparar un escaneo, por si el foco quedó en un botón).
 */
export function useScannerFocus({
  inputRef,
  enabled = true,
}: UseScannerFocusOptions): () => void {
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const focusScanner = useCallback((): void => {
    const scanner = inputRef.current;
    const overlayOpen = document.querySelector(OVERLAY_SELECTOR) !== null;
    if (
      shouldReclaimScannerFocus({
        active: document.activeElement,
        scanner,
        overlayOpen,
      })
    ) {
      scanner?.focus({ preventScroll: true });
    }
  }, [inputRef]);

  const scheduleFocus = useCallback((): void => {
    clearTimeout(timer.current);
    timer.current = setTimeout(focusScanner, SCANNER_RECLAIM_DELAY_MS);
  }, [focusScanner]);

  useEffect(() => {
    if (!enabled) return;

    focusScanner(); // Arma el escáner al montar / al reactivarse.

    const onFocusOut = (): void => scheduleFocus();
    const onPointerUp = (): void => scheduleFocus();
    const onWindowFocus = (): void => scheduleFocus();

    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerup", onPointerUp);
    window.addEventListener("focus", onWindowFocus);

    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [enabled, focusScanner, scheduleFocus]);

  return focusScanner;
}
