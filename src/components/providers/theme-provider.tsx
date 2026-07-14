"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { THEME_STORAGE_KEY } from "@/components/providers/theme-script";

/**
 * Provider de tema claro/oscuro sin dependencias externas.
 * ----------------------------------------------------------------------
 * - `theme`: preferencia del usuario — "light" | "dark" | "system".
 * - `resolvedTheme`: tema efectivo tras resolver "system" contra el SO.
 * - Persiste en localStorage y refleja el cambio en la clase `.dark` del
 *   <html>. El parpadeo inicial lo evita ThemeScript (ver theme-script.tsx).
 * - En modo "system" escucha cambios de `prefers-color-scheme` en vivo.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyClass(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  // SSR y primer render cliente comparten "system" para no romper la
  // hidratación; el valor real se rehidrata en el efecto de montaje.
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  // Rehidrata la preferencia persistida al montar.
  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeState(stored);
    }
  }, []);

  // Resuelve el tema efectivo y sincroniza la clase cada vez que cambia la
  // preferencia; en "system", además, sigue los cambios del SO en vivo.
  useEffect(() => {
    const update = (): void => {
      const resolved: ResolvedTheme =
        theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
      setResolvedTheme(resolved);
      applyClass(resolved);
    };

    update();

    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [theme]);

  const setTheme = useCallback((next: Theme): void => {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  }
  return ctx;
}
