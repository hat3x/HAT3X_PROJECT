import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { store } from "@/lib/store";
import { Sparkles, ArrowRight, Mail, Lock, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth/")({
  component: AuthScreen,
});

type Mode = "login" | "register";

function AuthScreen() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = (m: Mode) => {
    setMode(m);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (mode === "register") {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setSuccess("Revisa tu correo para confirmar la cuenta y luego inicia sesión.");
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        if (data.session) store.initUser(data.session.user.id);
        navigate({ to: "/dashboard" });
      }
    } catch (err: unknown) {
      setError(translateError(err instanceof Error ? err.message : "Error desconocido"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) setError(translateError(err.message));
  };

  return (
    <div className="min-h-screen bg-gradient-soft flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="size-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant">
            <Sparkles className="size-5 text-primary-foreground" />
          </div>
          <span className="font-display font-semibold text-lg">ClinicFlow Pro</span>
        </div>

        <div className="rounded-3xl bg-card border border-border shadow-elegant p-7">
          <div className="flex rounded-xl bg-muted p-1 mb-6">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => reset(m)}
                className={[
                  "flex-1 h-8 rounded-lg text-sm font-medium transition-all",
                  mode === m
                    ? "bg-card shadow-soft text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {m === "login" ? "Iniciar sesión" : "Crear cuenta"}
              </button>
            ))}
          </div>

          <h1 className="font-display font-semibold text-xl tracking-tight">
            {mode === "login" ? "Bienvenido de nuevo" : "Empieza con tu clínica"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            {mode === "login"
              ? "Accede a tu panel de gestión."
              : "Crea tu cuenta y configura tu clínica en 2 minutos."}
          </p>

          <button
            onClick={handleGoogle}
            className="w-full h-11 rounded-xl border border-border bg-card flex items-center justify-center gap-2.5 text-sm font-medium hover:bg-muted/50 transition-colors mb-4"
          >
            <GoogleIcon />
            Continuar con Google
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">o con email</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Correo electrónico</span>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  required type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hola@miclinica.es"
                  className="input pl-9"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-xs text-muted-foreground">Contraseña</span>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  required
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "Mínimo 8 caracteres" : "Tu contraseña"}
                  minLength={mode === "register" ? 8 : undefined}
                  className="input pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            {error && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3">{error}</div>
            )}
            {success && (
              <div className="rounded-lg bg-green-500/10 text-green-700 text-xs p-3">{success}</div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full h-11 rounded-xl bg-gradient-primary text-primary-foreground font-semibold text-sm shadow-elegant flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60 transition-opacity"
            >
              {loading ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
              {!loading && <ArrowRight className="size-4" />}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Al registrarte aceptas los{" "}
          <a href="#" className="underline hover:text-foreground">Términos de servicio</a>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "Email o contraseña incorrectos.";
  if (msg.includes("Email not confirmed")) return "Confirma tu email antes de iniciar sesión.";
  if (msg.includes("User already registered")) return "Este email ya tiene cuenta. Inicia sesión.";
  if (msg.includes("Password should be")) return "La contraseña debe tener al menos 8 caracteres.";
  return msg;
}
