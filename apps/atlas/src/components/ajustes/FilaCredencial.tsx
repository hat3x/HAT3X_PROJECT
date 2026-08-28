"use client";
import { useState, useTransition } from "react";
import { RotateCw, Trash2 } from "lucide-react";
import { rotarCredencial, borrarCredencial } from "@/lib/db/acciones-credenciales";
import { Campo } from "@/components/ui/Campo";
import type { CredencialResumen } from "@/lib/db/credenciales";

const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

export function FilaCredencial({ credencial }: { credencial: CredencialResumen }) {
  const [rotando, setRotando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [secreto, setSecreto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function rotar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    empezar(async () => {
      const r = await rotarCredencial(credencial.id, secreto);
      if (!r.ok) setError(r.error);
      else {
        setSecreto("");
        setRotando(false);
      }
    });
  }

  function borrar() {
    setError(null);
    empezar(async () => {
      const r = await borrarCredencial(credencial.id);
      if (!r.ok) {
        setError(r.error);
        setConfirmando(false);
      }
    });
  }

  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-24 shrink-0 font-medium">{credencial.proveedor}</span>
        <span className="flex-1 truncate">{credencial.etiqueta}</span>
        <code
          className="rounded px-2 py-0.5 text-xs"
          style={{ background: "var(--cristal-fondo)" }}
        >
          {credencial.prefijo ?? "••••"}
        </code>
        <span className="text-xs" style={{ color: "var(--texto-tenue)" }}>
          {credencial.rotadaEn
            ? `rotada ${FECHA.format(new Date(credencial.rotadaEn))}`
            : `alta ${FECHA.format(new Date(credencial.creadoEn))}`}
        </span>

        <button
          type="button"
          onClick={() => setRotando((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs opacity-70 hover:opacity-100"
        >
          <RotateCw size={13} aria-hidden="true" />
          Rotar
        </button>

        {confirmando ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={borrar}
              disabled={pendiente}
              className="rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-50"
              style={{ color: "var(--estado-caido)" }}
            >
              Confirmar borrado
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="rounded-lg px-2 py-1 text-xs opacity-70 hover:opacity-100"
            >
              No
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs opacity-70 hover:opacity-100"
          >
            <Trash2 size={13} aria-hidden="true" />
            Borrar
          </button>
        )}
      </div>

      {rotando && (
        <form onSubmit={rotar} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1">
            <Campo
              etiqueta="Nuevo secreto"
              id={`rotar-${credencial.id}`}
              ayuda="El anterior deja de valer en cuanto guardes. No se recupera."
            >
              <input
                id={`rotar-${credencial.id}`}
                type="password"
                autoComplete="off"
                value={secreto}
                onChange={(e) => setSecreto(e.target.value)}
                className="entrada"
              />
            </Campo>
          </div>
          <button
            type="submit"
            disabled={pendiente}
            className="cristal-denso rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {pendiente ? "Rotando…" : "Guardar rotación"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSecreto("");
              setRotando(false);
            }}
            className="rounded-lg px-3 py-1.5 text-sm opacity-70 hover:opacity-100"
          >
            Cancelar
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}
    </li>
  );
}
