"use client";

import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { idToEmail } from "@/lib/auth/id-email";
import { sectorMismatchMessage } from "@/lib/auth/sector-login";
import { SECTOR_REGISTRY } from "@/lib/sector/registry";
import { KairosMark } from "@/components/brand/kairos-mark";
import type { SalonSector } from "@/types/database";

import { resolveTenantSector } from "./actions";

interface LoginFormProps {
  /** Sector elegido en el picker (`/login?sector=<x>`); tema la marca y, tras
   * el sign-in, se compara contra el sector real del tenant. */
  sector: SalonSector;
}

export function LoginForm({ sector }: LoginFormProps): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const brandName = SECTOR_REGISTRY[sector].brandName;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: idToEmail(loginId),
      password,
    });

    if (signInError) {
      setError("Credenciales incorrectas. Comprueba tu ID y contraseña.");
      setIsLoading(false);
      return;
    }

    // La credencial pertenece a UN tenant y por tanto a UN sector. Si no
    // coincide con el sector elegido en el picker, se rechaza aquí (UX) —
    // el aislamiento real de datos lo da la RLS, no esta comprobación.
    // Un fallo transitorio al resolver el sector NO debe colgar el login: se
    // deja pasar (el layout del panel aplica el sector real como red de seguridad).
    let tenantSector: SalonSector | null = null;
    try {
      tenantSector = await resolveTenantSector();
    } catch {
      tenantSector = null;
    }
    const mismatch = tenantSector
      ? sectorMismatchMessage(sector, tenantSector)
      : null;
    if (mismatch !== null) {
      await supabase.auth.signOut();
      setError(mismatch);
      setIsLoading(false);
      return;
    }

    const next = searchParams.get("next") ?? "/dashboard";
    router.push(next);
    router.refresh();
  }

  return (
    // Columna centrada con aire generoso; entrada suave (fade-up) al montar.
    <div className="flex w-full max-w-sm animate-fade-up flex-col items-center gap-8">
      {/* Marca: glifo de acento + wordmark. Minimal, con respiración vertical. */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-brand">
          <KairosMark className="h-7 w-7" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {brandName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Cada cliente, en su momento.
          </p>
        </div>
      </div>

      <Card className="w-full shadow-md">
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-lg">Iniciar sesión</CardTitle>
          <CardDescription>Accede con tu ID y contraseña</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="loginId">ID de acceso</Label>
              <Input
                id="loginId"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                aria-invalid={error !== null}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="tu-id"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              {/* Campo con botón integrado para mostrar/ocultar la contraseña. */}
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  aria-invalid={error !== null}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-apple-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
            </div>
            {/* Estado de error: panel teñido, icono y anuncio para lectores. */}
            {error !== null ? (
              <div
                role="alert"
                aria-live="assertive"
                className="flex animate-fade-in items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Entrando…" : "Entrar"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Firma discreta de HAT3X. */}
      <p className="text-xs text-muted-foreground/80">
        Hecho por{" "}
        <span className="font-medium tracking-wide text-foreground/70">
          HAT3X
        </span>
      </p>
    </div>
  );
}
