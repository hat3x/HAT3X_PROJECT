import { useEffect, useMemo, useState } from "react";
import { supabase, type EstadoPedido } from "@/lib/supabase";
import { StaffHeader } from "@/components/StaffHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  Euro,
  Receipt,
  ShoppingBag,
  Download,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

type Periodo = "dia" | "mes" | "anio";
type SortKey = "numero_pedido" | "created_at" | "total" | "estado";
type SortDir = "asc" | "desc";

interface Pedido {
  id: string;
  numero_pedido: number;
  estado: EstadoPedido;
  estado_cocina: EstadoPedido | null;
  estado_bebidas: EstadoPedido | null;
  tipo: "cocina" | "bebidas" | "mixto";
  total: number;
  notas: string | null;
  created_at: string;
}

interface Agregado {
  hora: string;
  dia: string;
  mes: string;
  anio: string;
  estado: EstadoPedido;
  tickets: number;
  ingresos: number;
}

interface DetailItem {
  id: string;
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
const ESTADO_FALLBACK = { label: "—", cls: "bg-muted text-muted-foreground" };
const variantFor = (e: EstadoPedido | null | undefined) =>
  (e && ESTADO_VARIANT[e]) || ESTADO_FALLBACK;

const PAGE_SIZES = [10, 25, 50, 100];
const pad = (n: number) => String(n).padStart(2, "0");

const rangeFor = (periodo: Periodo, fecha: Date) => {
  const start = new Date(fecha);
  const end = new Date(fecha);
  if (periodo === "dia") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (periodo === "mes") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  }
  return { start: start.toISOString(), end: end.toISOString() };
};

const todayInputValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const Historico = () => {
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [fechaStr, setFechaStr] = useState(todayInputValue());
  const [estadoFilter, setEstadoFilter] = useState<string>("entregado");
  const [search, setSearch] = useState("");

  // Agregaciones (desde la vista)
  const [agregados, setAgregados] = useState<Agregado[]>([]);
  const [aggLoading, setAggLoading] = useState(true);

  // Tabla paginada
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<DetailItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const fecha = useMemo(() => {
    const [y, m, d] = fechaStr.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }, [fechaStr]);

  const range = useMemo(() => rangeFor(periodo, fecha), [periodo, fecha]);

  // Cargar agregaciones desde la vista
  const loadAgregados = async () => {
    setAggLoading(true);
    let query = supabase
      .from("v_pedidos_agregados")
      .select("hora, dia, mes, anio, estado, tickets, ingresos")
      .gte("hora", range.start)
      .lte("hora", range.end);
    if (estadoFilter !== "all") query = query.eq("estado", estadoFilter);
    const { data, error } = await query;
    if (error) {
      toast.error("Error cargando agregados", { description: error.message });
      setAgregados([]);
    } else {
      setAgregados((data ?? []) as Agregado[]);
    }
    setAggLoading(false);
  };

  // Cargar tabla paginada
  const loadTable = async () => {
    setTableLoading(true);
    let q = supabase
      .from("pedidos")
      .select(
        "id, numero_pedido, estado, estado_cocina, estado_bebidas, tipo, total, notas, created_at",
        { count: "exact" },
      )
      .gte("created_at", range.start)
      .lte("created_at", range.end);
    if (estadoFilter !== "all") {
      q = q.or(
        `estado.eq.${estadoFilter},estado_cocina.eq.${estadoFilter},estado_bebidas.eq.${estadoFilter}`,
      );
    }
    if (search.trim()) {
      const n = Number(search.trim());
      if (!Number.isNaN(n)) q = q.eq("numero_pedido", n);
    }
    q = q.order(sortKey, { ascending: sortDir === "asc" });
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await q.range(from, to);
    if (error) {
      toast.error("Error cargando tickets", { description: error.message });
    } else {
      setPedidos((data ?? []) as Pedido[]);
      setTotalRows(count ?? 0);
    }
    setTableLoading(false);
  };

  useEffect(() => {
    loadAgregados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, fechaStr, estadoFilter]);

  useEffect(() => {
    loadTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, fechaStr, estadoFilter, search, page, pageSize, sortKey, sortDir]);

  // Reset paginación al cambiar filtros
  useEffect(() => {
    setPage(0);
  }, [periodo, fechaStr, estadoFilter, search, pageSize]);

  const stats = useMemo(() => {
    const total = agregados.reduce((s, a) => s + a.tickets, 0);
    const ingresos = agregados.reduce((s, a) => s + Number(a.ingresos), 0);
    const ticket = total ? ingresos / total : 0;
    return { total, ingresos, ticket };
  }, [agregados]);

  // Series para gráfico y tabla agregada
  const grupos = useMemo(() => {
    const map = new Map<
      string,
      { sortKey: string; label: string; tickets: number; ingresos: number }
    >();
    agregados.forEach((a) => {
      let bucketIso = "";
      if (periodo === "dia") bucketIso = a.hora;
      else if (periodo === "mes") bucketIso = a.dia;
      else bucketIso = a.mes;
      const d = new Date(bucketIso);
      let label = "";
      let key = "";
      if (periodo === "dia") {
        key = pad(d.getHours());
        label = `${pad(d.getHours())}h`;
      } else if (periodo === "mes") {
        key = pad(d.getDate());
        label = pad(d.getDate());
      } else {
        key = pad(d.getMonth() + 1);
        label = format(d, "MMM", { locale: es });
      }
      const cur = map.get(key) ?? { sortKey: key, label, tickets: 0, ingresos: 0 };
      cur.tickets += a.tickets;
      cur.ingresos += Number(a.ingresos);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [agregados, periodo]);

  const periodoLabel = useMemo(() => {
    if (periodo === "dia") return format(fecha, "EEEE d 'de' MMMM yyyy", { locale: es });
    if (periodo === "mes") return format(fecha, "MMMM yyyy", { locale: es });
    return format(fecha, "yyyy");
  }, [periodo, fecha]);

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetailLoading(true);
    const { data } = await supabase
      .from("pedido_items")
      .select("id, cantidad, precio_unitario, destino, producto:menu_productos(nombre)")
      .eq("pedido_id", id);
    setDetailItems((data ?? []) as unknown as DetailItem[]);
    setDetailLoading(false);
  };

  const exportCsv = async () => {
    // Exporta TODO el rango actual (no solo la página)
    let q = supabase
      .from("pedidos")
      .select("numero_pedido, estado, total, notas, created_at")
      .gte("created_at", range.start)
      .lte("created_at", range.end);
    if (estadoFilter !== "all") q = q.eq("estado", estadoFilter);
    q = q.order(sortKey, { ascending: sortDir === "asc" });
    const { data, error } = await q;
    if (error) {
      toast.error("Error exportando", { description: error.message });
      return;
    }
    const rows = (data ?? []).map((p) => {
      const d = new Date(p.created_at as string);
      return [
        p.numero_pedido,
        format(d, "yyyy-MM-dd"),
        format(d, "HH:mm"),
        p.estado,
        Number(p.total).toFixed(2),
        ((p.notas as string | null) ?? "").replace(/[\r\n,;]+/g, " "),
      ].join(",");
    });
    const csv = [["numero", "fecha", "hora", "estado", "total", "notas"].join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-${periodo}-${fechaStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const detailPedido = pedidos.find((p) => p.id === detailId) ?? null;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title="Histórico de tickets" subtitle={periodoLabel} />
      <main className="mx-auto max-w-[1800px] space-y-6 p-6">
        {/* Controles */}
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Período</label>
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
                <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dia">Día</SelectItem>
                  <SelectItem value="mes">Mes</SelectItem>
                  <SelectItem value="anio">Año</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                {periodo === "dia" ? "Día" : periodo === "mes" ? "Mes" : "Año"}
              </label>
              <Input type="date" value={fechaStr} onChange={(e) => setFechaStr(e.target.value)} className="md:w-52" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Estado</label>
              <Select value={estadoFilter} onValueChange={setEstadoFilter}>
                <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="entregado">Entregado</SelectItem>
                  <SelectItem value="listo">Listo</SelectItem>
                  <SelectItem value="preparando">Preparando</SelectItem>
                  <SelectItem value="recibido">Recibido</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar nº pedido…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" />Exportar CSV
            </Button>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCard icon={<ShoppingBag />} label="Tickets" value={stats.total.toString()} />
          <StatCard icon={<Euro />} label="Ingresos" value={`${stats.ingresos.toFixed(2)} €`} />
          <StatCard icon={<Receipt />} label="Ticket medio" value={`${stats.ticket.toFixed(2)} €`} />
        </div>

        {/* Gráfico */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarIcon className="h-5 w-5" />
              {periodo === "dia" ? "Por hora" : periodo === "mes" ? "Por día" : "Por mes"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aggLoading ? (
              <div className="py-12 text-center text-muted-foreground">Cargando…</div>
            ) : grupos.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">Sin datos</div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={grupos} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number, name) =>
                        name === "Ingresos" ? [`${v.toFixed(2)} €`, name] : [v, name]
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="left" dataKey="tickets" name="Tickets" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="ingresos" name="Ingresos" fill="hsl(var(--status-listo))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabla paginada */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Tickets ({totalRows})</CardTitle>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Por página</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {tableLoading ? (
              <div className="py-12 text-center text-muted-foreground">Cargando…</div>
            ) : pedidos.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">Sin tickets</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead onClick={() => toggleSort("numero_pedido")} active={sortKey === "numero_pedido"} dir={sortDir}>Nº</SortableHead>
                      <SortableHead onClick={() => toggleSort("created_at")} active={sortKey === "created_at"} dir={sortDir}>Fecha / Hora</SortableHead>
                      <TableHead>Cocina</TableHead>
                      <TableHead>Bebidas</TableHead>
                      <SortableHead onClick={() => toggleSort("total")} active={sortKey === "total"} dir={sortDir} className="text-right">Total</SortableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pedidos.map((p) => {
                      const d = new Date(p.created_at);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-bold">#{p.numero_pedido}</TableCell>
                          <TableCell>{format(d, "dd/MM/yyyy HH:mm")}</TableCell>
                          <TableCell>
                            {p.estado_cocina ? (
                              <Badge className={variantFor(p.estado_cocina).cls}>
                                {variantFor(p.estado_cocina).label}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.estado_bebidas ? (
                              <Badge className={variantFor(p.estado_bebidas).cls}>
                                {variantFor(p.estado_bebidas).label}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{Number(p.total).toFixed(2)} €</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => openDetail(p.id)}>Ver</Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Paginación */}
                <div className="mt-4 flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">
                    Página {page + 1} de {totalPages} · {totalRows} tickets
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                      <ChevronLeft className="h-4 w-4" />Anterior
                    </Button>
                    <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Siguiente<ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Pedido #{detailPedido?.numero_pedido} ·{" "}
              {detailPedido && format(new Date(detailPedido.created_at), "dd/MM/yyyy HH:mm")}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="py-6 text-center text-muted-foreground">Cargando…</div>
          ) : (
            <div className="space-y-3">
              {detailPedido && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {detailPedido.estado_cocina && (
                    <Badge className={variantFor(detailPedido.estado_cocina).cls}>
                      Cocina: {variantFor(detailPedido.estado_cocina).label}
                    </Badge>
                  )}
                  {detailPedido.estado_bebidas && (
                    <Badge className={variantFor(detailPedido.estado_bebidas).cls}>
                      Bebidas: {variantFor(detailPedido.estado_bebidas).label}
                    </Badge>
                  )}
                </div>
              )}
              {(["cocina", "bebidas"] as const).map((dest) => {
                const grupo = detailItems.filter((it) => it.destino === dest);
                if (grupo.length === 0) return null;
                return (
                  <div key={dest}>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SortableHead = ({
  children,
  onClick,
  active,
  dir,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: SortDir;
  className?: string;
}) => (
  <TableHead className={className}>
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : "text-muted-foreground"}`}
    >
      {children}
      <ArrowUpDown className="h-3 w-3" />
      {active && <span className="text-xs">{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
  </TableHead>
);

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

export default Historico;
