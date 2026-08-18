"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Evento no estándar que dispara Chrome/Android cuando la PWA es instalable. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "kairos-install-dismissed";

/**
 * Banner discreto "Instalar Kairos" (Android/Chrome). Aparece solo cuando el
 * navegador anuncia que la app es instalable (`beforeinstallprompt`), no si ya
 * está instalada (`display-mode: standalone`) ni si el usuario lo descartó. En
 * iOS el evento no existe: allí la instalación es manual (Compartir → Añadir a
 * inicio), cubierta por las metas `appleWebApp` del layout.
 */
export function InstallPrompt(): React.ReactElement | null {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* localStorage puede fallar en modo privado; seguimos */
    }
    const onPrompt = (event: Event): void => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = (): void => setVisible(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = (): void => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* noop */
    }
  };

  const install = async (): Promise<void> => {
    if (deferred === null) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border/70 bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Download className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">Instalar Kairos</p>
        <p className="truncate text-xs text-muted-foreground">Añádela a tu pantalla de inicio.</p>
      </div>
      <Button size="sm" onClick={() => void install()}>
        Instalar
      </Button>
      <Button size="icon" variant="ghost" aria-label="Ahora no" onClick={dismiss}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
