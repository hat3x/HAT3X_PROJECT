import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Hat3xLogo from "@/components/Hat3xLogo";
import { Eye, EyeOff, Loader2, ShieldCheck, Check, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const requirements = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Al menos una mayúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Al menos una minúscula", test: (p: string) => /[a-z]/.test(p) },
  { label: "Al menos un número", test: (p: string) => /[0-9]/.test(p) },
  { label: "Al menos un carácter especial (!@#$...)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const ChangePassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const allPassed = requirements.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allPassed || !passwordsMatch) return;

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Clear the flag
    if (user) {
      await supabase.from("profiles").update({ must_change_password: false } as any).eq("id", user.id);
    }

    toast({ title: "Contraseña actualizada", description: "Tu nueva contraseña ha sido guardada." });
    navigate(isAdmin ? "/admin" : "/portal", { replace: true });
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />

      <div className="w-full max-w-md relative">
        <div className="glass-card p-8 md:p-10">
          <div className="flex justify-center mb-6">
            <Hat3xLogo size="sm" />
          </div>

          <div className="flex items-center justify-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground text-center">
              Cambiar contraseña
            </h1>
          </div>
          <p className="text-sm text-muted-foreground text-center mb-8">
            Por seguridad, debes establecer una nueva contraseña antes de continuar.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-foreground">Nueva contraseña</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="bg-secondary/50 border-border/50 focus:border-primary/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-foreground">Confirmar contraseña</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-secondary/50 border-border/50 focus:border-primary/50"
              />
            </div>

            {/* Requirements checklist */}
            <div className="space-y-1.5 p-3 rounded-lg bg-secondary/30 border border-border/30">
              {requirements.map((r, i) => {
                const passed = r.test(password);
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {passed ? (
                      <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                    )}
                    <span className={passed ? "text-foreground" : "text-muted-foreground"}>
                      {r.label}
                    </span>
                  </div>
                );
              })}
              {confirmPassword.length > 0 && (
                <div className="flex items-center gap-2 text-xs mt-1 pt-1 border-t border-border/30">
                  {passwordsMatch ? (
                    <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-destructive shrink-0" />
                  )}
                  <span className={passwordsMatch ? "text-foreground" : "text-destructive"}>
                    Las contraseñas coinciden
                  </span>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading || !allPassed || !passwordsMatch}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 btn-primary-glow rounded-xl text-sm font-semibold h-11"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar nueva contraseña"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
