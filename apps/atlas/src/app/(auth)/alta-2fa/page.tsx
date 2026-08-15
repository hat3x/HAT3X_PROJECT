"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clienteNavegador } from "@/lib/supabase/navegador";

export default function Alta2FA() {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clienteNavegador()
      .auth.mfa.enroll({ factorType: "totp", friendlyName: "Atlas" })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          return;
        }
        setQr(data.totp.qr_code);
        setFactorId(data.id);
      });
    // Se enrola una sola vez al montar.
  }, []);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    const sb = clienteNavegador();
    const { data: reto, error: e1 } = await sb.auth.mfa.challenge({ factorId });
    if (e1) {
      setError(e1.message);
      return;
    }
    const { error: e2 } = await sb.auth.mfa.verify({
      factorId,
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
      <div className="cristal w-full max-w-sm p-6 space-y-4">
        <h1 className="text-lg font-semibold">Activa el segundo factor</h1>
        <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
          Atlas guarda las claves de todos los clientes. El segundo factor es
          obligatorio y no se puede desactivar. Escanea el código con tu app de
          autenticación.
        </p>
        {/* El QR llega como data URI desde Supabase: no hay petición externa. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && (
          <img
            src={qr}
            alt="Código QR para la app de autenticación"
            className="mx-auto rounded-lg bg-white p-2"
          />
        )}
        <form onSubmit={confirmar} className="space-y-3">
          <label className="block text-sm">
            Código de 6 dígitos
            <input
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 bg-transparent tracking-[0.4em] text-center"
            />
          </label>
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
            Confirmar
          </button>
        </form>
      </div>
    </main>
  );
}
