import { useEffect, useState } from "react";
import { supabase, type EstadoPedido } from "@/lib/supabase";
import { useStaffLocal } from "@/lib/staff-local";
import { StaffHeader } from "@/components/StaffHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ChefHat, Clock, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";

interface Pedido {
  id: string;
  numero_pedido: number;
  estado_cocina: EstadoPedido;
  total: number;
  notas: string | null;
  created_at: string;
}

interface PedidoItem {
  id: string;
  pedido_id: string;
  cantidad: number;
  destino: "cocina" | "bebidas";
  producto: { nombre: string } | null;
}

const COLUMNS: { key: EstadoPedido; title: string; next?: EstadoPedido; prev?: EstadoPedido; nextLabel?: string; prevLabel?: string }[] = [
  { key: "recibido", title: "Recibido", next: "preparando", nextLabel: "Comenzar" },
  { key: "preparando", title: "Preparando", next: "listo", prev: "recibido", nextLabel: "Marcar listo", prevLabel: "Volver" },
  { key: "listo", title: "Listo", next: "entregado", prev: "preparando", nextLabel: "Entregar", prevLabel: "Volver" },
];

const minutesSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

const borderForAge = (mins: number) => {
  if (mins < 5) return "border-l-[hsl(var(--timer-fresh))]";
  if (mins < 10) return "border-l-[hsl(var(--timer-warning))]";
  return "border-l-[hsl(var(--timer-late))]";
};

const Cocina = () => {
  const localId = useStaffLocal((s) => s.local?.id ?? null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [items, setItems] = useState<Record<string, PedidoItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const loadAll = async () => {
    if (!localId) {
      setPedidos([]);
      setItems({});
      setLoading(false);
      return;
    }
    const { data: peds, error } = await supabase
      .from("pedidos")
      .select("id, numero_pedido, estado_cocina, total, notas, created_at")
      .eq("local_id", localId)
      .not("estado_cocina", "is", null)
      .in("estado_cocina", ["recibido", "preparando", "listo"])
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Error cargando pedidos", { description: error.message });
      setLoading(false);
      return;
    }
    const list = (peds ?? []) as Pedido[];
    setPedidos(list);

    if (list.length > 0) {
      const ids = list.map((p) => p.id);
      const { data: its } = await supabase
        .from("pedido_items")
        .select("id, pedido_id, cantidad, destino, producto:menu_productos(nombre)")
        .in("pedido_id", ids)
        .eq("destino", "cocina");
      const grouped: Record<string, PedidoItem[]> = {};
      (its ?? []).forEach((it) => {
        const item = it as unknown as PedidoItem;
        if (!grouped[item.pedido_id]) grouped[item.pedido_id] = [];
        grouped[item.pedido_id].push(item);
      });
      setItems(grouped);
    } else {
      setItems({});
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!localId) return;
    loadAll();
    const channel = supabase
      .channel(`kds-pedidos-${localId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pedidos",
          filter: `local_id=eq.${localId}`,
        },
        () => loadAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_items" },
        () => loadAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId]);

  const updateEstado = async (id: string, estado_cocina: EstadoPedido) => {
    const { error } = await supabase
      .from("pedidos")
      .update({ estado_cocina, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("No se pudo actualizar", { description: error.message });
    } else {
      toast.success(`Cocina → ${estado_cocina}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title="Cocina · KDS" subtitle="Pedidos en tiempo real" />
      <main className="mx-auto max-w-[1800px] p-6">
        {loading ? (
          <div className="text-center text-muted-foreground py-20">Cargando pedidos…</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {COLUMNS.map((col) => {
              const colPedidos = pedidos.filter((p) => p.estado_cocina === col.key);
              return (
                <section key={col.key} className="flex flex-col">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold">{col.title}</h2>
                    <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{colPedidos.length}</span>
                  </div>
                  <div className="space-y-4">
                    {colPedidos.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                        Sin pedidos
                      </div>
                    )}
                    {colPedidos.map((p) => {
                      const mins = minutesSince(p.created_at);
                      const its = items[p.id] ?? [];
                      return (
                        <Card key={p.id} className={`border-l-4 p-5 ${borderForAge(mins)}`}>
                          <div className="mb-3 flex items-start justify-between">
                            <div>
                              <div className="text-3xl font-bold">#{p.numero_pedido}</div>
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Clock className="h-3.5 w-3.5" />
                                {formatDistanceToNowStrict(new Date(p.created_at), { locale: es })}
                              </div>
                            </div>
                            <div className="text-right text-sm font-semibold text-muted-foreground">
                              {Number(p.total).toFixed(2)} €
                            </div>
                          </div>
                          <ul className="mb-4 space-y-1.5 text-base">
                            {its.map((it) => (
                              <li key={it.id} className="flex items-baseline gap-2">
                                <span className="font-bold text-primary">{it.cantidad}×</span>
                                <span>{it.producto?.nombre ?? "—"}</span>
                              </li>
                            ))}
                            {its.length === 0 && (
                              <li className="text-sm italic text-muted-foreground">Sin items de cocina</li>
                            )}
                          </ul>
                          {p.notas && (
                            <div className="mb-3 rounded-md bg-muted p-2 text-sm italic">
                              📝 {p.notas}
                            </div>
                          )}
                          <div className="flex gap-2">
                            {col.prev && (
                              <Button variant="outline" size="sm" onClick={() => updateEstado(p.id, col.prev!)}>
                                <ArrowLeft className="h-4 w-4" />
                                {col.prevLabel}
                              </Button>
                            )}
                            {col.next && (
                              <Button size="sm" className="flex-1" onClick={() => updateEstado(p.id, col.next!)}>
                                {col.next === "listo" ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                                {col.nextLabel}
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        {pedidos.length === 0 && !loading && (
          <div className="mt-12 flex flex-col items-center justify-center text-muted-foreground">
            <ChefHat className="mb-3 h-12 w-12 opacity-40" />
            <p>No hay pedidos activos</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Cocina;
