"use client";
import { useState, useEffect, useTransition } from "react";
import { BellRing, Smartphone } from "lucide-react";
import { registrarDispositivo, olvidarDispositivo } from "@/lib/db/acciones-push";

export type Suscrito = { endpoint: string; dispositivo: string | null };

/**
 * La clave VAPID pública viaja en base64url y el navegador la quiere en bytes.
 *
 * `Uint8Array<ArrayBuffer>` y no `Uint8Array` a secas: desde TypeScript 5.7 el
 * tipo es genérico, y `pushManager.subscribe` no acepta un `SharedArrayBuffer`.
 */
function aBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const normal = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export function Dispositivos({
  suscritos,
  clavePublica,
}: {
  suscritos: Suscrito[];
  clavePublica: string;
}) {
  // Arranca en false y se resuelve al montar: el servidor no puede saber qué
  // admite el navegador, y pintar lo mismo en los dos sitios evita que React se
  // queje de la discrepancia.
  const [soportado, setSoportado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  useEffect(() => {
    setSoportado(
      "serviceWorker" in navigator &&
        navigator.serviceWorker !== undefined &&
        "PushManager" in window &&
        window.PushManager !== undefined
    );
  }, []);

  function activar() {
    setError(null);
    empezar(async () => {
      try {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") {
          setError("El navegador ha denegado el permiso.");
          return;
        }
        const registro = await navigator.serviceWorker.ready;
        const sus = await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: aBytes(clavePublica),
        });
        const json = sus.toJSON();
        const r = await registrarDispositivo({
          endpoint: sus.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          dispositivo: navigator.userAgent.slice(0, 120),
        });
        if (!r.ok) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function olvidar(endpoint: string) {
    setError(null);
    empezar(async () => {
      const r = await olvidarDispositivo(endpoint);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {clavePublica === "" ? (
        <div className="cristal flex items-start gap-3 p-3 text-sm">
          <BellRing size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p style={{ color: "var(--texto-tenue)" }}>
            El push está <strong>sin configurar</strong>: falta la clave pública en{" "}
            <code>NEXT_PUBLIC_VAPID_PUBLICA</code>. Se genera con{" "}
            <code>npx web-push generate-vapid-keys</code>.
          </p>
        </div>
      ) : !soportado ? (
        <div className="cristal flex items-start gap-3 p-3 text-sm">
          <Smartphone size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p style={{ color: "var(--texto-tenue)" }}>
            Este navegador no admite notificaciones push. En iPhone y iPad solo
            funcionan si añades Atlas a la <strong>pantalla de inicio</strong>: pulsa
            Compartir y luego «Añadir a inicio». Es una limitación de Apple, no de
            Atlas.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={activar}
          disabled={pendiente}
          className="cristal-denso inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <BellRing size={15} aria-hidden="true" />
          {pendiente ? "Activando…" : "Activar en este dispositivo"}
        </button>
      )}

      <div className="cristal cristal-denso overflow-hidden">
        {suscritos.length === 0 ? (
          <p className="p-6 text-center text-sm" style={{ color: "var(--texto-tenue)" }}>
            No hay ningún dispositivo registrado.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
            {suscritos.map((s) => (
              <li key={s.endpoint} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="flex-1 truncate">
                  {s.dispositivo ?? "Dispositivo sin nombre"}
                </span>
                <button
                  type="button"
                  onClick={() => olvidar(s.endpoint)}
                  disabled={pendiente}
                  className="rounded-lg px-2 py-1 text-xs opacity-70 hover:opacity-100 disabled:opacity-30"
                >
                  Olvidar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
