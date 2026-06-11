import { LogOut, MapPin, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import { useStaffLocal } from "@/lib/staff-local";

interface Props {
  title: string;
  subtitle?: string;
}

export const StaffHeader = ({ title, subtitle }: Props) => {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHistorico = location.pathname.startsWith("/historico");
  const local = useStaffLocal((s) => s.local);
  const isAdmin = role === "admin";

  const handleSignOut = async () => {
    await signOut();
    useStaffLocal.getState().clear();
    navigate("/login", { replace: true });
  };

  const changeLocal = () => {
    if (!isAdmin) return;
    navigate("/seleccionar-local");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {local && (
            <button
              type="button"
              onClick={changeLocal}
              disabled={!isAdmin}
              className={`flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm ${
                isAdmin ? "cursor-pointer hover:bg-muted" : "cursor-default"
              }`}
            >
              <MapPin className="h-4 w-4 text-primary" />
              <span className="font-medium">{local.nombre}</span>
              {local.ciudad && (
                <span className="text-muted-foreground">· {local.ciudad}</span>
              )}
              {isAdmin && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium">{user?.email}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{role}</div>
          </div>
          {(role === "caja" || role === "admin") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(isHistorico ? "/caja" : "/historico")}
            >
              {isHistorico ? "Caja" : "Histórico"}
            </Button>
          )}
          {role === "admin" && (
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              Panel
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </div>
      </div>
    </header>
  );
};
