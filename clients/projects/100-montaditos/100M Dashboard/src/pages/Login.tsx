import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useStaffLocal } from "@/lib/staff-local";
import { toast } from "sonner";
import { ChefHat } from "lucide-react";

// Acceso del personal con un solo botón: no tienen que recordar contraseña.
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "Admin100M!264c6a3a";

const Login = () => {
  const { signIn, user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user || !role) return;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role, local_id, locales(id, nombre, ciudad)")
        .eq("user_id", user.id);
      const isAdmin = (data ?? []).some((r) => r.role === "admin");
      const fixed = (data ?? []).find(
        (r) => r.role !== "admin" && r.local_id && r.locales,
      );
      const setLocal = useStaffLocal.getState().setLocal;
      const currentLocal = useStaffLocal.getState().local;

      if (fixed) {
        const raw = fixed.locales as unknown;
        const loc = Array.isArray(raw)
          ? raw[0]
          : (raw as { id: string; nombre: string; ciudad: string | null });
        if (loc) setLocal({ id: loc.id, nombre: loc.nombre, ciudad: loc.ciudad });
        navigate(role === "cocina" ? "/cocina" : "/caja", { replace: true });
        return;
      }

      if (role === "admin" || isAdmin) {
        if (!currentLocal) navigate("/seleccionar-local", { replace: true });
        else navigate("/", { replace: true });
        return;
      }

      if (!currentLocal) navigate("/seleccionar-local", { replace: true });
      else navigate(role === "cocina" ? "/cocina" : "/caja", { replace: true });
    })();
  }, [user, role, loading, navigate]);

  const handleAdmin = async () => {
    setSubmitting(true);
    const { error } = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
    setSubmitting(false);
    if (error) {
      toast.error("No se pudo iniciar sesión", { description: error.message });
    } else {
      toast.success("Sesión iniciada");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="login-card glass">
        <div className="login-logo">
          <ChefHat className="h-8 w-8" />
        </div>
        <div className="login-title">Staff</div>
        <div className="login-sub">Pulsa para entrar al panel</div>
        <button onClick={handleAdmin} disabled={submitting} className="btn primary login-btn">
          {submitting ? "Entrando…" : "Admin"}
        </button>
      </div>
    </div>
  );
};

export default Login;
