import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { AppRole } from "@/lib/supabase";

interface Props {
  children: ReactNode;
  requiredRole?: AppRole | AppRole[];
}

const roleHome = (role: AppRole | null): string => {
  if (role === "caja") return "/caja";
  if (role === "cocina") return "/cocina";
  if (role === "admin") return "/";
  return "/login";
};

export const ProtectedRoute = ({ children, requiredRole }: Props) => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Cargando…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    // Admin tiene acceso a todo
    if (role !== "admin" && (!role || !allowed.includes(role))) {
      return <Navigate to={roleHome(role)} replace />;
    }
  }

  return <>{children}</>;
};
