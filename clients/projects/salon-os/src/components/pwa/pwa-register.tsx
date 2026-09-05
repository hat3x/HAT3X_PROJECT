"use client";

import { useEffect } from "react";

/**
 * Registra el service worker de Kairos (`/sw.js`) para que la app sea instalable
 * y tenga cáscara offline. No renderiza nada; el registro es best-effort (si
 * falla, la app funciona igual). Se monta una vez en el layout raíz.
 */
export function PwaRegister(): null {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = (): void => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registro best-effort: no rompemos la app si falla */
      });
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
