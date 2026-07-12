import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      {/* Suspense requerido por useSearchParams() en el prerender */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
