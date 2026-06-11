import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Hat3xLogo from "@/components/Hat3xLogo";
import { Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const Login = () => {
  const [clientId, setClientId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const input = clientId.trim().toLowerCase();
    // If it looks like an email, use directly; otherwise convert to internal format
    const email = input.includes("@") ? input : `${input}@hat3x.local`;
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error de acceso", description: "ID o contraseña incorrectos", variant: "destructive" });
    }
    // Redirect handled by App.tsx based on role
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-20 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a la web
        </button>

        <div className="glass-card p-8 md:p-10">
          <div className="flex justify-center mb-8">
            <Hat3xLogo size="sm" />
          </div>

          <h1 className="text-2xl font-bold text-foreground text-center mb-2">
            Acceso al portal
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-8">
            Introduce tu ID de cliente y contraseña
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="clientId" className="text-foreground">ID de cliente</Label>
              <Input
                id="clientId"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="CLI-001"
                required
                className="bg-secondary/50 border-border/50 focus:border-primary/50 uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
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

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 btn-primary-glow rounded-xl text-sm font-semibold h-11"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Iniciar sesión"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            ¿No tienes acceso? Contacta con HAT3X para obtener tus credenciales.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
