import { useEffect, useMemo, useState } from "react";
import { supabase, type EstadoPedido } from "@/lib/supabase";
import { useStaffLocal } from "@/lib/staff-local";
import { StaffHeader } from "@/components/StaffHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, ShoppingBag, Euro, Receipt, Clock, GlassWater, ChefHat, Check } from "lucide-react";
import { format } from "date-fns";

type TipoPedido = "cocina" | "bebidas" | "mixto";

interface Pedido {
  id: string;
  numero_pedido: number;
  tipo: TipoPedido;
  estado: EstadoPedido | null;
  estado_cocina: EstadoPedido | null;
  estado_bebidas: EstadoPedido | null;
  total: number;
  notas: string | null;
  created_at: string;
}

interface ItemLite {
  id: string;
  pedido_id: string;
  cantidad: number;
  precio_unitario: number;
  destino: "cocina" | "bebidas";
  producto: { nombre: string } | null;
}

const ESTADO_VARIANT: Record<EstadoPedido, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-amber-500 text-white" },
  recibido: { label: "Recibido", cls: "bg-[hsl(var(--status-recibido))] text-white" },
  preparando: { label: "Preparando", cls: "bg-[hsl(var(--status-preparando))] text-white" },
  listo: { label: "Listo", cls: "bg-[hsl(var(--status-listo))] text-white" },
  entregado: { label: "Entregado", cls: "bg-[hsl(var(--status-entregado))] text-white" },
  cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
};

const startOfDayIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const isActivo = (e: EstadoPedido | null) =>
  !!e && e !== "pendiente" && e !== "entregado" && e !== "cancelado";

// Fuente de verdad: el campo `destino` guardado en pedido_items.
// Fallback defensivo: si llegara nulo, asume cocina.
const effectiveDestino = (it: ItemLite): "cocina" | "bebidas" =>
  it.destino === "bebidas" ? "bebidas" : "cocina";

const Caja = () => {
  const localId = useStaffLocal((s) => s.local?.id ?? null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [items, setItems] = useState<Record<string, ItemLite[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("all");
  const [detailId, setDetailId] = useState<string | null>(null);

  const loadPedidos = async () => {
    if (!localId) {
      setPedidos([]);
      setItems({});
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("pedidos")
      .select(
        "id, numero_pedido, tipo, estado, estado_cocina, estado_bebidas, total, notas, created_at",
      )
      .eq("local_id", localId)
      .gte("created_at", startOfDayIso())
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Error cargando pedidos", { description: error.message });
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Pedido[];
    setPedidos(list);

    if (list.length > 0) {
      const ids = list.map((p) => p.id);
      const { data: its } = await supabase
        .from("pedido_items")
        .select(
          "id, pedido_id, cantidad, precio_unitario, destino, producto:menu_productos(nombre)",
        )
        .in("pedido_id", ids);
      const grouped: Record<string, ItemLite[]> = {};
      (its ?? []).forEach((it) => {
        const item = it as unknown as ItemLite;
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
    loadPedidos();
    const ch = supabase
      .channel(`caja-pedidos-${localId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pedidos",
          filter: `local_id=eq.${localId}`,
        },
        () => loadPedidos(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_items" },
        () => loadPedidos(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId]);

  // Sección Bebidas: pedidos con estado_bebidas activo
  const bebidaActivos = useMemo(
    () => pedidos.filter((p) => isActivo(p.estado_bebidas)),
    [pedidos],
  );
  // Sección Cocina (vista en Caja): pedidos con cocina LISTO para entregar
  const cocinaParaEntregar = useMemo(
    () => pedidos.filter((p) => p.estado_cocina === "listo"),
    [pedidos],
  );

  const stats = useMemo(() => {
    const total = pedidos.length;
    const ingresos = pedidos.reduce((s, p) => s + Number(p.total), 0);
    const ticket = total ? ingresos / total : 0;
    const pendientes = pedidos.filter(
      (p) => isActivo(p.estado_cocina) || isActivo(p.estado_bebidas),
    ).length;
    const listos = pedidos.filter(
      (p) => p.estado_cocina === "listo" || p.estado_bebidas === "listo",
    ).length;
    const entregados = pedidos.filter(
      (p) =>
        (p.estado_cocina === null || p.estado_cocina === "entregado") &&
        (p.estado_bebidas === null || p.estado_bebidas === "entregado"),
    ).length;
    return { total, ingresos, ticket, pendientes, listos, entregados };
  }, [pedidos]);

  const filtered = useMemo(() => {
    return pedidos.filter((p) => {
      if (estadoFilter !== "all") {
        if (p.estado_cocina !== estadoFilter && p.estado_bebidas !== estadoFilter) return false;
      }
      if (search && !String(p.numero_pedido).includes(search.trim())) return false;
      return true;
    });
  }, [pedidos, search, estadoFilter]);

  const porTicar = useMemo(
    () =>
      pedidos.filter(
        (p) => p.estado_cocina === "pendiente" || p.estado_bebidas === "pendiente",
      ),
    [pedidos],
  );

  const ticarPedido = async (p: Pedido) => {
    const patch: Record<string, string> = { updated_at: new Date().toISOString() };
    if (p.estado_cocina === "pendiente") patch.estado_cocina = "recibido";
    if (p.estado_bebidas === "pendiente") patch.estado_bebidas = "recibido";
    const { error } = await supabase.from("pedidos").update(patch).eq("id", p.id);
    if (error) toast.error("Error", { description: error.message });
    else toast.success(`Pedido #${p.numero_pedido} ticado y enviado`);
  };

  const ticarSeccion = async (p: Pedido, seccion: "cocina" | "bebidas") => {
    const col = seccion === "cocina" ? "estado_cocina" : "estado_bebidas";
    const { error } = await supabase
      .from("pedidos")
      .update({ [col]: "recibido", updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) toast.error("Error", { description: error.message });
    else toast.success(`${seccion} de #${p.numero_pedido} enviado`);
  };

  const updateSeccion = async (
    id: string,
    seccion: "cocina" | "bebidas",
    estado: EstadoPedido,
  ) => {
    const col = seccion === "cocina" ? "estado_cocina" : "estado_bebidas";
    const { error } = await supabase
      .from("pedidos")
      .update({ [col]: estado, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error("Error", { description: error.message });
    else toast.success(`${seccion} → ${estado}`);
  };

  const detailPedido = pedidos.find((p) => p.id === detailId) ?? null;
  const detailItems = detailId ? items[detailId] ?? [] : [];

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title="Caja · Dashboard del día" subtitle={format(new Date(), "EEEE d 'de' MMMM yyyy")} />
      <main className="mx-auto max-w-[1800px] space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard icon={<ShoppingBag />} label="Pedidos hoy" value={stats.total.toString()} />
          <StatCard icon={<Euro />} label="Ingresos" value={`${stats.ingresos.toFixed(2)} €`} />
          <StatCard icon={<Receipt />} label="Ticket medio" value={`${stats.ticket.toFixed(2)} €`} />
          <StatCard
            icon={<Clock />}
            label="Activos / Listos / Entreg."
            value={`${stats.pendientes} · ${stats.listos} · ${stats.entregados}`}
          />
        </div>

        {/* POR TICAR: pedidos del cliente que aún no han pasado por caja */}
        <Card className="border-amber-500/50 bg-amber-50/40 dark:bg-amber-950/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="h-5 w-5 text-amber-600" />
              Por ticar ({porTicar.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {porTicar.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Sin pedidos pendientes de ticar
              </div>
            )}
            {porTicar.map((p) => {
              const its = items[p.id] ?? [];
              const cocinaIts = its.filter((it) => effectiveDestino(it) === "cocina");
              const bebidaIts = its.filter((it) => effectiveDestino(it) === "bebidas");
              const cocinaPend = p.estado_cocina === "pendiente";
              const bebidaPend = p.estado_bebidas === "pendiente";
              return (
                <Card key={`t-${p.id}`} className="border-l-4 border-l-amber-500 p-3">
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold">#{p.numero_pedido}</span>
                        <Badge className="bg-amber-500 text-white">Por ticar</Badge>
                        <TipoBadge tipo={p.tipo} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(p.created_at), "HH:mm")}
                      </div>
                    </div>
                    <div className="text-sm font-semibold">{Number(p.total).toFixed(2)} €</div>
                  </div>
                  <div className="mb-3 grid gap-2 sm:grid-cols-2">
                    {cocinaIts.length > 0 && (
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-orange-700">
                          <ChefHat className="h-3 w-3" /> Cocina
                          {cocinaPend && <Badge className="ml-1 bg-amber-500 text-white">Por ticar</Badge>}
                        </div>
                        <ul className="text-sm">
                          {cocinaIts.map((it) => (
                            <li key={it.id}>
                              <span className="font-bold">{it.cantidad}×</span> {it.producto?.nombre ?? "—"}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {bebidaIts.length > 0 && (
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-sky-700">
                          <GlassWater className="h-3 w-3" /> Bebidas
                          {bebidaPend && <Badge className="ml-1 bg-amber-500 text-white">Por ticar</Badge>}
                        </div>
                        <ul className="text-sm">
                          {bebidaIts.map((it) => (
                            <li key={it.id}>
                              <span className="font-bold">{it.cantidad}×</span> {it.producto?.nombre ?? "—"}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {p.notas && (
                    <div className="mb-2 rounded-md bg-muted p-2 text-xs italic">📝 {p.notas}</div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {cocinaPend && bebidaPend && (
                      <Button size="sm" onClick={() => ticarPedido(p)}>
                        <Check className="h-4 w-4" /> Ticar todo y enviar
                      </Button>
                    )}
                    {cocinaPend && (
                      <Button
                        size="sm"
                        variant={cocinaPend && bebidaPend ? "outline" : "default"}
                        onClick={() => ticarSeccion(p, "cocina")}
                      >
                        <ChefHat className="h-4 w-4" /> Ticar y enviar a cocina
                      </Button>
                    )}
                    {bebidaPend && (
                      <Button
                        size="sm"
                        variant={cocinaPend && bebidaPend ? "outline" : "default"}
                        onClick={() => ticarSeccion(p, "bebidas")}
                      >
                        <GlassWater className="h-4 w-4" /> Ticar y enviar a bebidas
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setDetailId(p.id)}>
                      Ver
                    </Button>
                  </div>
                </Card>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* BEBIDAS */}
          <Card className="border-sky-500/40 bg-sky-50/30 dark:bg-sky-950/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <GlassWater className="h-5 w-5 text-sky-600" />
                Bebidas ({bebidaActivos.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bebidaActivos.length === 0 && (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Sin tickets de bebida
                </div>
              )}
              {bebidaActivos.map((p) => (
                <SeccionTicket
                  key={`b-${p.id}`}
                  pedido={p}
                  items={(items[p.id] ?? []).filter((it) => effectiveDestino(it) === "bebidas")}
                  seccion="bebidas"
                  accent="sky"
                  onAction={(estado) => updateSeccion(p.id, "bebidas", estado)}
                  onView={() => setDetailId(p.id)}
                />
              ))}
            </CardContent>
          </Card>

          {/* COCINA: solo para entregar desde caja */}
          <Card className="border-orange-500/40 bg-orange-50/30 dark:bg-orange-950/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ChefHat className="h-5 w-5 text-orange-600" />
                Cocina · listos para entregar ({cocinaParaEntregar.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cocinaParaEntregar.length === 0 && (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Sin tickets listos
                </div>
              )}
              {cocinaParaEntregar.map((p) => (
                <SeccionTicket
                  key={`c-${p.id}`}
                  pedido={p}
                  items={(items[p.id] ?? []).filter((it) => effectiveDestino(it) === "cocina")}
                  seccion="cocina"
                  accent="orange"
                  onAction={(estado) => updateSeccion(p.id, "cocina", estado)}
                  onView={() => setDetailId(p.id)}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número de pedido…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={estadoFilter} onValueChange={setEstadoFilter}>
              <SelectTrigger className="md:w-56">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="recibido">Recibido</SelectItem>
                <SelectItem value="preparando">Preparando</SelectItem>
                <SelectItem value="listo">Listo</SelectItem>
                <SelectItem value="entregado">Entregado</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Tabla del día */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pedidos del día ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">Cargando…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">Sin pedidos para mostrar</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Productos</TableHead>
                    <TableHead>Cocina</TableHead>
                    <TableHead>Bebidas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const its = items[p.id] ?? [];
                    const cocinaIts = its.filter((it) => effectiveDestino(it) === "cocina");
                    const bebidaIts = its.filter((it) => effectiveDestino(it) === "bebidas");
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-bold align-top">#{p.numero_pedido}</TableCell>
                        <TableCell className="align-top">
                          <TipoBadge tipo={p.tipo} />
                        </TableCell>
                        <TableCell className="align-top">{format(new Date(p.created_at), "HH:mm")}</TableCell>
                        <TableCell className="align-top text-sm">
                          {its.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="space-y-1">
                              {cocinaIts.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-orange-700">
                                    <ChefHat className="h-3 w-3" /> Cocina
                                  </div>
                                  <ul>
                                    {cocinaIts.map((it) => (
                                      <li key={it.id}>
                                        <span className="font-bold">{it.cantidad}×</span> {it.producto?.nombre ?? "—"}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {bebidaIts.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-sky-700">
                                    <GlassWater className="h-3 w-3" /> Bebidas
                                  </div>
                                  <ul>
                                    {bebidaIts.map((it) => (
                                      <li key={it.id}>
                                        <span className="font-bold">{it.cantidad}×</span> {it.producto?.nombre ?? "—"}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          {p.estado_cocina && ESTADO_VARIANT[p.estado_cocina] ? (
                            <Badge className={ESTADO_VARIANT[p.estado_cocina].cls}>
                              {ESTADO_VARIANT[p.estado_cocina].label}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          {p.estado_bebidas && ESTADO_VARIANT[p.estado_bebidas] ? (
                            <Badge className={ESTADO_VARIANT[p.estado_bebidas].cls}>
                              {ESTADO_VARIANT[p.estado_bebidas].label}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right align-top font-semibold">{Number(p.total).toFixed(2)} €</TableCell>
                        <TableCell className="text-right align-top">
                          <Button size="sm" variant="outline" onClick={() => setDetailId(p.id)}>
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Pedido #{detailPedido?.numero_pedido} ·{" "}
              {detailPedido && format(new Date(detailPedido.created_at), "HH:mm")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {detailItems.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Este pedido no tiene productos
              </div>
            )}
            {(["cocina", "bebidas"] as const).map((dest) => {
              const grupo = detailItems.filter((it) => effectiveDestino(it) === dest);
              if (grupo.length === 0) return null;
              return (
                <div key={dest}>
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {dest === "cocina" ? <ChefHat className="h-3 w-3" /> : <GlassWater className="h-3 w-3" />}
                    {dest}
                  </div>
                  <ul className="divide-y divide-border">
                    {grupo.map((it) => (
                      <li key={it.id} className="flex items-center justify-between py-2">
                        <div>
                          <span className="font-bold">{it.cantidad}×</span>{" "}
                          <span>{it.producto?.nombre ?? "—"}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {(it.cantidad * Number(it.precio_unitario)).toFixed(2)} €
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {detailPedido?.notas && (
              <div className="rounded-md bg-muted p-3 text-sm italic">📝 {detailPedido.notas}</div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-3 text-lg font-bold">
              <span>Total</span>
              <span>{detailPedido && Number(detailPedido.total).toFixed(2)} €</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const TipoBadge = ({ tipo }: { tipo: TipoPedido }) => {
  if (tipo === "bebidas")
    return (
      <Badge variant="outline" className="border-sky-500 text-sky-700">
        <GlassWater className="mr-1 h-3 w-3" /> Bebidas
      </Badge>
    );
  if (tipo === "cocina")
    return (
      <Badge variant="outline" className="border-orange-500 text-orange-700">
        <ChefHat className="mr-1 h-3 w-3" /> Cocina
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-purple-500 text-purple-700">
      Mixto
    </Badge>
  );
};

const SeccionTicket = ({
  pedido,
  items,
  seccion,
  accent,
  onAction,
  onView,
}: {
  pedido: Pedido;
  items: ItemLite[];
  seccion: "cocina" | "bebidas";
  accent: "sky" | "orange";
  onAction: (estado: EstadoPedido) => void;
  onView: () => void;
}) => {
  const borderCls = accent === "sky" ? "border-l-sky-500" : "border-l-orange-500";
  const estado = seccion === "cocina" ? pedido.estado_cocina : pedido.estado_bebidas;
  const v = estado ? ESTADO_VARIANT[estado] : null;

  const renderActions = () => {
    if (seccion === "bebidas") {
      if (estado === "pendiente" || estado === "recibido")
        return (
          <Button size="sm" className="flex-1" onClick={() => onAction("preparando")}>
            Comenzar
          </Button>
        );
      if (estado === "preparando")
        return (
          <Button size="sm" className="flex-1" onClick={() => onAction("listo")}>
            <Check className="h-4 w-4" /> Listo
          </Button>
        );
      if (estado === "listo")
        return (
          <Button size="sm" className="flex-1" onClick={() => onAction("entregado")}>
            Entregar
          </Button>
        );
    } else {
      // cocina: caja sólo entrega
      if (estado === "listo")
        return (
          <Button size="sm" className="flex-1" onClick={() => onAction("entregado")}>
            Entregar
          </Button>
        );
    }
    return null;
  };

  return (
    <Card className={`border-l-4 ${borderCls} p-3`}>
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="text-2xl font-bold">#{pedido.numero_pedido}</div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(pedido.created_at), "HH:mm")}
            {pedido.tipo === "mixto" && (
              <Badge variant="outline" className="ml-2 border-purple-500 text-purple-700">
                Mixto
              </Badge>
            )}
          </div>
        </div>
        <div className="text-right">
          {v && <Badge className={v.cls}>{v.label}</Badge>}
          <div className="mt-1 text-sm font-semibold">{Number(pedido.total).toFixed(2)} €</div>
        </div>
      </div>
      <ul className="mb-2 space-y-0.5 text-sm">
        {items.map((it) => (
          <li key={it.id}>
            <span className="font-bold">{it.cantidad}×</span> {it.producto?.nombre}
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-xs italic text-muted-foreground">Sin items en esta sección</li>
        )}
      </ul>
      {pedido.notas && (
        <div className="mb-2 rounded-md bg-muted p-2 text-xs italic">📝 {pedido.notas}</div>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onView}>
          Ver
        </Button>
        {renderActions()}
      </div>
    </Card>
  );
};

const StatCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <Card>
    <CardContent className="flex items-center gap-4 p-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </CardContent>
  </Card>
);

export default Caja;
