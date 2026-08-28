import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStaffLocal } from "@/lib/staff-local";
import { StaffHeader } from "@/components/StaffHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface Valoracion {
  id: string;
  estrellas: number;
  comentario: string | null;
  created_at: string;
}

const Valoraciones = () => {
  const localId = useStaffLocal((s) => s.local?.id ?? null);
  const [items, setItems] = useState<Valoracion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!localId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("valoraciones")
      .select("id, estrellas, comentario, created_at")
      .eq("local_id", localId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error("Error cargando valoraciones", { description: error.message });
    else setItems((data ?? []) as Valoracion[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId]);

  const stats = useMemo(() => {
    const n = items.length;
    const media = n ? items.reduce((s, v) => s + v.estrellas, 0) / n : 0;
    const dist = [5, 4, 3, 2, 1].map((e) => ({ e, count: items.filter((v) => v.estrellas === e).length }));
    return { n, media, dist };
  }, [items]);

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title="Valoraciones" subtitle="Opiniones de los clientes" />
      <main className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* Resumen */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <div className="text-5xl font-black text-foreground">{stats.media.toFixed(1)}</div>
              <div className="mt-2 flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-5 w-5 ${stats.media >= n - 0.25 ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                  />
                ))}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {stats.n} valoración{stats.n === 1 ? "" : "es"}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Distribución</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.dist.map(({ e, count }) => {
                const pct = stats.n ? (count / stats.n) * 100 : 0;
                return (
                  <div key={e} className="flex items-center gap-3 text-sm">
                    <span className="flex w-9 items-center gap-1 justify-end">
                      {e}
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    </span>
                    <div className="h-2 flex-1 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-muted-foreground">{count}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Lista de comentarios */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Comentarios</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">Cargando…</div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">Aún no hay valoraciones</div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((v) => (
                  <li key={v.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`h-4 w-4 ${v.estrellas >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(v.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                      </span>
                    </div>
                    {v.comentario && <p className="mt-1.5 text-sm text-foreground">{v.comentario}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Valoraciones;
