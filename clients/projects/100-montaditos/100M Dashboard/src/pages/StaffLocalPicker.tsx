import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useStaffLocal, type StaffLocal } from "@/lib/staff-local";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, Search } from "lucide-react";
import { toast } from "sonner";

interface LocalRow {
  id: string;
  nombre: string;
  ciudad: string | null;
  direccion: string | null;
}

const StaffLocalPicker = () => {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const setLocal = useStaffLocal((s) => s.setLocal);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rows, setRows] = useState<LocalRow[]>([]);
  const [selected, setSelected] = useState<LocalRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    let cancel = false;
    const run = async () => {
      let query = supabase
        .from("locales")
        .select("id, nombre, ciudad, direccion")
        .eq("activo", true)
        .limit(50);
      if (debounced) {
        const like = `%${debounced}%`;
        query = query.or(
          `nombre.ilike.${like},ciudad.ilike.${like},direccion.ilike.${like}`,
        );
      }
      const { data, error } = await query;
      if (cancel) return;
      if (error) {
        toast.error("No se pudieron cargar los locales", { description: error.message });
        return;
      }
      setRows((data ?? []) as LocalRow[]);
    };
    run();
    return () => {
      cancel = true;
    };
  }, [debounced]);

  const confirm = () => {
    if (!selected) return;
    setBusy(true);
    const local: StaffLocal = {
      id: selected.id,
      nombre: selected.nombre,
      ciudad: selected.ciudad,
    };
    setLocal(local);
    toast.success(`Local activo: ${local.nombre}`);
    if (role === "cocina") navigate("/cocina", { replace: true });
    else navigate("/caja", { replace: true });
  };

  const empty = useMemo(() => rows.length === 0, [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Selecciona el local
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Necesitas un local activo para operar en Caja o Cocina.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, ciudad o dirección…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              {empty && (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Sin resultados
                </div>
              )}
              {rows.map((r) => {
                const active = selected?.id === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r)}
                    className={`w-full rounded-lg border p-4 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="font-bold">{r.nombre}</div>
                    <div className="text-sm text-muted-foreground">
                      {[r.direccion, r.ciudad].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button onClick={confirm} disabled={!selected || busy}>
                Confirmar local
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StaffLocalPicker;
