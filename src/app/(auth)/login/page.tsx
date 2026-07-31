import type { Metadata } from "next";
import { Suspense } from "react";

import { parseSectorParam } from "@/lib/auth/sector-login";

import { LoginForm } from "./login-form";
import { SectorPicker } from "./sector-picker";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

interface LoginPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

export default function LoginPage({
  searchParams,
}: LoginPageProps): React.ReactElement {
  const rawSector = searchParams?.sector;
  const sector = parseSectorParam(
    Array.isArray(rawSector) ? rawSector[0] : rawSector,
  );

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-6">
      {/*
       * Ambiente sutil: dos halos violeta de muy baja opacidad que dan
       * profundidad sin distraer. Decorativo (aria-hidden) y no interactivo.
       */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 translate-x-1/3 translate-y-1/3 rounded-full bg-accent/40 blur-3xl" />
      </div>

      {sector === null ? (
        <SectorPicker />
      ) : (
        // Suspense requerido por useSearchParams() en el prerender
        <Suspense>
          <LoginForm sector={sector} />
        </Suspense>
      )}
    </main>
  );
}
