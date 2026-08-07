import { useEffect, useRef, useState } from "react";
import { supabase, type EstadoPedido } from "@/lib/supabase";
import { useStaffLocal } from "@/lib/staff-local";
import { playBeep, unlockAudio } from "@/lib/beep";
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
  variante: string | null;
  producto: { nombre: string; numero?: string | null } | null;
}

/** Nombre del item + variante en una línea (ej. "Nachos · Cheddar y bacon"). */
const itemLabel = (it: PedidoItem): string =>
  (it.producto?.nombre ?? "—") + (it.variante ? ` · ${it.variante.replace(/\n/g, " · ")}` : "");

const COLUMNS: { key: EstadoPedido; title: string; emoji: string; next?: EstadoPedido; prev?: EstadoPedido; nextLabel?: string }[] = [
  { key: "recibido", title: "Recibido", emoji: "📥", next: "preparando", nextLabel: "▶ Empezar" },
  { key: "preparando", title: "Preparando", emoji: "🔥", next: "listo", prev: "recibido", nextLabel: "Entregar" },
  { key: "listo", title: "Listo", emoji: "✅", next: "entregado", prev: "preparando", nextLabel: "Entregado" },
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
        .select("id, pedido_id, cantidad, destino, variante, producto:menu_productos(nombre, numero)")
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

    // Respaldo por polling: si el WebSocket Realtime no entrega eventos (RLS,
    // red del APK, etc.), refrescamos cada 5s para que los pedidos nuevos
    // aparezcan solos sin tener que salir y volver a entrar.
    const poll = setInterval(loadAll, 5000);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
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
    } catch (e) {
      console.warn("[realtime] no disponible en cocina, se usa polling", e);
    }
    return () => {
      clearInterval(poll);
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId]);

  // 🔔 Alarma al llegar un pedido NUEVO a cocina (id que no estaba antes).
  // No suena en la carga inicial.
  const seenRef = useRef<Set<string>>(new Set());
  const beepInitRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    const ids = pedidos.map((p) => p.id);
    if (!beepInitRef.current) {
      seenRef.current = new Set(ids);
      beepInitRef.current = true;
      return;
    }
    if (ids.some((id) => !seenRef.current.has(id))) playBeep();
    seenRef.current = new Set(ids);
  }, [pedidos, loading]);

  // Desbloquea el audio del WebView de Android al primer toque del usuario.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

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
    <div className="min-h-screen">
      <StaffHeader title="Cocina · KDS" subtitle="Pedidos en tiempo real" />
      <main className="mx-auto max-w-[1800px] px-4 pb-10 pt-4">
        {loading ? (
          <div className="empty">Cargando pedidos…</div>
        ) : (
          <div className="kds">
            {COLUMNS.map((col) => {
              const colPedidos = pedidos.filter((p) => p.estado_cocina === col.key);
              return (
                <section key={col.key} className="kcol glass">
                  <h3>
                    <span>{col.emoji} {col.title}</span>
                    <span className="count">{colPedidos.length}</span>
                  </h3>
                  {colPedidos.length === 0 && <div className="empty">Sin pedidos</div>}
                  {colPedidos.map((p) => {
                    const mins = minutesSince(p.created_at);
                    const timerClass = mins < 5 ? "t-fresh" : mins < 10 ? "t-warn" : "t-late";
                    const timerText = mins < 1 ? "ahora" : `${mins} min`;
                    const its = items[p.id] ?? [];
                    return (
                      <div key={p.id} className="ticket glass">
                        <div className="head">
                          <span className="num">#{p.numero_pedido}</span>
                          <span className={`timer ${timerClass}`}>{timerText}</span>
                        </div>
                        <ul className="items">
                          {its.map((it) => (
                            <li key={it.id}>
                              <span className="qty">{it.cantidad}×</span>
                              {it.producto?.numero && <span className="nchip">#{it.producto.numero}</span>}
                              <span>{itemLabel(it)}</span>
                            </li>
                          ))}
                          {its.length === 0 && (
                            <li style={{ color: "var(--b-dim)", fontStyle: "italic", fontSize: "13px" }}>Sin items de cocina</li>
                          )}
                        </ul>
                        {p.notas && (
                          <div className="group-label" style={{ textTransform: "none" }}>📝 {p.notas}</div>
                        )}
                        <div className="actions">
                          {col.next && (
                            <button className="btn primary" onClick={() => updateEstado(p.id, col.next!)}>
                              {col.nextLabel}
                            </button>
                          )}
                          {col.prev && (
                            <button className="btn ghost" title="Volver" onClick={() => updateEstado(p.id, col.prev!)}>↩</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Cocina;
