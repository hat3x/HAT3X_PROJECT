import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { store } from "@/lib/store";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        store.initUser(data.session.user.id);
        navigate({ to: "/dashboard" });
      } else {
        navigate({ to: "/auth" });
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-soft flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <div className="size-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant animate-pulse">
          <Sparkles className="size-6 text-primary-foreground" />
        </div>
        <p className="text-sm">Verificando sesión…</p>
      </div>
    </div>
  );
}
