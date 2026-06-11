import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useStaffLocal } from "@/lib/staff-local";
import { supabase, type AppRole } from "@/lib/supabase";

interface Props {
  children: ReactNode;
  role: "caja" | "cocina";
}

export const StaffGuard = ({ children, role }: Props) => {
  const { user, hasRole, loading } = useAuth();
  const local = useStaffLocal((s) => s.local);
  const setLocal = useStaffLocal((s) => s.setLocal);
  const [resolving, setResolving] = useState(true);

  // Si no hay local en store, intenta resolver desde user_roles (staff con local fijo).
  useEffect(() => {
    let cancel = false;
    const run = async () => {
      if (!user || local) {
        setResolving(false);
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role, local_id, locales(id, nombre, ciudad)")
        .eq("user_id", user.id);
      if (cancel) return;
      const fixed = (data ?? []).find(
        (r: { role: AppRole; local_id: string | null; locales: unknown }) =>
          r.role !== "admin" && r.local_id && r.locales,
      );
      if (fixed) {
        const raw = fixed.locales as unknown;
        const loc = Array.isArray(raw) ? raw[0] : (raw as { id: string; nombre: string; ciudad: string | null });
        if (loc) setLocal({ id: loc.id, nombre: loc.nombre, ciudad: loc.ciudad });
      }
      setResolving(false);
    };
    run();
    return () => {
      cancel = true;
    };
  }, [user, local, setLocal]);

  if (loading || resolving) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Cargando…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!hasRole(role) && !hasRole("admin")) return <Navigate to="/login" replace />;
  if (!useStaffLocal.getState().local) return <Navigate to="/seleccionar-local" replace />;

  return <>{children}</>;
};
