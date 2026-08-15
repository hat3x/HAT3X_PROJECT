"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { clienteNavegador } from "@/lib/supabase/navegador";

export default function Alta2FA() {
  const router = useRouter();
  const [uri, setUri] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  // React en desarrollo monta los efectos DOS veces (StrictMode). Sin esta
  // guarda, el segundo enroll choca con el nombre ya usado y responde 422
  // («Unexpected failure»), pisando el QR que sí había traído el primero.
  const enrolando = useRef(false);

  useEffect(() => {
    if (enrolando.current) return;
    enrolando.current = true;

    (async () => {
      const sb = clienteNavegador();

      // Un intento anterior a medias deja un factor sin verificar que bloquea
      // el siguiente enroll. Se limpian antes de empezar.
      const { data: factores } = await sb.auth.mfa.listFactors();
      for (const f of factores?.all ?? []) {
        if (f.status === "unverified") {
          await sb.auth.mfa.unenroll({ factorId: f.id });
        }
      }

      const { data, error } = await sb.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Atlas",
      });
      if (error) {
        setError(error.message);
        return;
      }
      // Se usa `uri` (unos 100 caracteres) y NO `qr_code`: ese SVG mide más de
      // 300.000 caracteres y como data URI el navegador no lo pinta.
      setUri(data.totp.uri);
      setFactorId(data.id);
    })();
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

        {uri ? (
          <div className="mx-auto w-fit rounded-lg bg-white p-3">
            <QRCodeSVG value={uri} size={192} level="M" />
          </div>
        ) : (
          !error && (
            <p className="text-center text-sm" style={{ color: "var(--texto-tenue)" }}>
              Generando el código…
            </p>
          )
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
            disabled={!factorId}
            className="w-full rounded-lg px-3 py-2 font-medium disabled:opacity-50"
            style={{ background: "var(--estado-ok)", color: "#04210c" }}
          >
            Confirmar
          </button>
        </form>
      </div>
    </main>
  );
}
