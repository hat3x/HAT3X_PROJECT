"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clienteNavegador } from "@/lib/supabase/navegador";

export default function Verificar() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function comprobar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const sb = clienteNavegador();

    const { data: factores, error: e0 } = await sb.auth.mfa.listFactors();
    if (e0) {
      setError(e0.message);
      return;
    }
    const totp = factores.totp[0];
    if (!totp) {
      setError("No hay ningún segundo factor dado de alta.");
      return;
    }

    const { data: reto, error: e1 } = await sb.auth.mfa.challenge({
      factorId: totp.id,
    });
    if (e1) {
      setError(e1.message);
      return;
    }
    const { error: e2 } = await sb.auth.mfa.verify({
      factorId: totp.id,
      challengeId: reto.id,
      code: codigo,
    });
    if (e2) {
      setError("El código no es válido. Prueba con el siguiente.");
      return;
    }
    router.refresh();
  }

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <form onSubmit={comprobar} className="cristal w-full max-w-sm p-6 space-y-4">
        <h1 className="text-lg font-semibold">Código de verificación</h1>
        <input
          inputMode="numeric"
          pattern="[0-9]{6}"
          required
          autoFocus
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          aria-label="Código de 6 dígitos"
          className="w-full rounded-lg border px-3 py-2 bg-transparent tracking-[0.4em] text-center"
        />
        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-lg px-3 py-2 font-medium"
          style={{ background: "var(--estado-ok)", color: "#04210c" }}
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
