"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clienteNavegador } from "@/lib/supabase/navegador";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await clienteNavegador().auth.signInWithPassword({
      email,
      password: clave,
    });
    setEnviando(false);
    if (error) {
      setError("Email o contraseña incorrectos.");
      return;
    }
    router.refresh();
  }

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <form onSubmit={entrar} className="cristal w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Atlas</h1>
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 bg-transparent"
          />
        </label>
        <label className="block text-sm">
          Contraseña
          <input
            type="password"
            required
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2 bg-transparent"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-lg px-3 py-2 font-medium disabled:opacity-50"
          style={{ background: "var(--estado-ok)", color: "#04210c" }}
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
