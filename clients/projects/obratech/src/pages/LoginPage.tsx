import { useState } from "react";
import { GlassScaffold } from "@/components/ui-kit/GlassScaffold";
import { GlassCard } from "@/components/ui-kit/GlassCard";
import { signInWithEmail, signInById } from "@/lib/auth";
import { Loader2, Mail, IdCard, User, Eye, EyeOff } from "lucide-react";
import obratechLogo from "@/assets/obratech-logo.png";
import { useToast } from "@/hooks/use-toast";

type LoginTab = "admin" | "client" | "employee";

const LoginPage = () => {
  const [tab, setTab] = useState<LoginTab>("admin");
  const [email, setEmail] = useState("");
  const [clientId, setClientId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "admin") {
        await signInWithEmail(email, password);
      } else if (tab === "client") {
        await signInById(clientId, password, "client");
      } else {
        await signInById(employeeId, password, "employee");
      }
    } catch (err: any) {
      let msg = err?.message || "Error al iniciar sesión";
      if (msg === "NO_ADMIN_ROLE") {
        msg = "No dispone del rol de administrador para acceder a este portal";
      } else if (msg.includes("Invalid login")) {
        msg = "ID o contraseña incorrectos";
      }
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const tabs: { key: LoginTab; label: string; icon: React.ReactNode }[] = [
    { key: "admin", label: "Admin", icon: <Mail className="w-4 h-4" /> },
    { key: "employee", label: "Empleado", icon: <IdCard className="w-4 h-4" /> },
    { key: "client", label: "Cliente", icon: <User className="w-4 h-4" /> },
  ];

  return (
    <GlassScaffold className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-md animate-scale-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img src={obratechLogo} alt="ObraTech" className="h-16 object-contain" />
          </div>
          <p className="text-muted-foreground text-sm">Gestión integral de obras</p>
        </div>

        <GlassCard className="p-6">
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-secondary/50 mb-6">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  tab === t.key
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setTab(t.key)}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === "admin" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input w-full"
                  placeholder="admin@email.com"
                  required
                />
              </div>
            )}

            {tab === "client" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">ID Cliente</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="glass-input w-full"
                  placeholder="CL-001"
                  required
                />
              </div>
            )}

            {tab === "employee" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">ID Empleado / Proveedor</label>
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="glass-input w-full"
                  placeholder="EMP-001 / PROV-001"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input w-full pr-12"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glass-button w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Iniciar Sesión
            </button>
          </form>
        </GlassCard>
      </div>
    </GlassScaffold>
  );
};

export default LoginPage;
