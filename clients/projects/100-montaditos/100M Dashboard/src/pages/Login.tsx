import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useStaffLocal } from "@/lib/staff-local";
import { toast } from "sonner";
import { ChefHat } from "lucide-react";

const TEST_USERS = [
  { label: "Cocina", email: "cocina@test.com" },
  { label: "Caja", email: "caja@test.com" },
  { label: "Admin", email: "admin@test.com" },
];

const Login = () => {
  const { signIn, user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("123456");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      toast.error("No se pudo iniciar sesión", { description: error.message });
    } else {
      toast.success("Sesión iniciada");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ChefHat className="h-7 w-7" />
          </div>
          <CardTitle className="text-3xl">Staff</CardTitle>
          <CardDescription>Inicia sesión para acceder al panel</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@test.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <div className="mt-6 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Usuarios de prueba</p>
            <div className="grid grid-cols-3 gap-2">
              {TEST_USERS.map((u) => (
                <Button
                  key={u.email}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmail(u.email);
                    setPassword("123456");
                  }}
                >
                  {u.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
