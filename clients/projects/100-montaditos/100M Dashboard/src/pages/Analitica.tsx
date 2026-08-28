import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useStaffLocal } from "@/lib/staff-local";
import { StaffHeader } from "@/components/StaffHeader";
import { PinGate } from "@/components/PinGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Euro, Receipt, ShoppingBag, TrendingUp, PieChart as PieIcon, Flame } from "lucide-react";
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
  PieChart,
  Pie,
  Cell,
} from "recharts";

type Periodo = "dia" | "mes" | "anio";

interface Kpis { tickets: number; ingresos: number; ticket_medio: number }
interface SeriePunto { bucket_ts: string; tickets: number; ingresos: number }
interface TopProducto { producto_id: string; nombre: string; numero: string | null; seccion: string | null; unidades: number; ingresos: number }
interface Categoria { seccion: string; unidades: number; ingresos: number }
interface HeatCelda { dow: number; hora: number; tickets: number; ingresos: number }

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DONUT_COLORS = [
  "hsl(var(--primary))", "hsl(var(--status-listo))", "hsl(var(--status-preparando))",
  "hsl(var(--status-recibido))", "#a78bfa", "#f472b6", "#38bdf8", "#facc15",
];
const pad = (n: number) => String(n).padStart(2, "0");
const todayInputValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const rangeFor = (periodo: Periodo, fecha: Date) => {
  const start = new Date(fecha);
  const end = new Date(fecha);
  if (periodo === "dia") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (periodo === "mes") {
    start.setDate(1); start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0); end.setHours(23, 59, 59, 999);
  } else {
    start.setMonth(0, 1); start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31); end.setHours(23, 59, 59, 999);
  }
  return { start, end };
};

const AnaliticaContent = () => {
  const local = useStaffLocal((s) => s.local);
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [fechaStr, setFechaStr] = useState(todayInputValue());
  const [loading, setLoading] = useState(true);

  const [kpis, setKpis] = useState<Kpis>({ tickets: 0, ingresos: 0, ticket_medio: 0 });
  const [serie, setSerie] = useState<SeriePunto[]>([]);
  const [topProductos, setTopProductos] = useState<TopProducto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [heatmap, setHeatmap] = useState<HeatCelda[]>([]);

  const fecha = useMemo(() => {
    const [y, m, d] = fechaStr.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }, [fechaStr]);

  const { start, end } = useMemo(() => rangeFor(periodo, fecha), [periodo, fecha]);
  const bucket = periodo === "dia" ? "hour" : periodo === "mes" ? "day" : "month";

  const periodoLabel = useMemo(() => {
    if (periodo === "dia") return format(fecha, "EEEE d 'de' MMMM yyyy", { locale: es });
    if (periodo === "mes") return format(fecha, "MMMM yyyy", { locale: es });
    return format(fecha, "yyyy");
  }, [periodo, fecha]);

  useEffect(() => {
    if (!local?.id) return;
    let cancel = false;
    const run = async () => {
      setLoading(true);
      const params = { p_local_id: local.id, p_from: start.toISOString(), p_to: end.toISOString() };
      const [kpisRes, serieRes, topRes, catRes, heatRes] = await Promise.all([
        supabase.rpc("analitica_kpis", params),
        supabase.rpc("analitica_timeseries", { ...params, p_bucket: bucket }),
        supabase.rpc("analitica_top_productos", { ...params, p_limit: 10 }),
        supabase.rpc("analitica_por_categoria", params),
        supabase.rpc("analitica_heatmap", params),
      ]);
      if (cancel) return;
      const errs = [kpisRes.error, serieRes.error, topRes.error, catRes.error, heatRes.error].filter(Boolean);
      if (errs.length) {
        toast.error("Error cargando analítica", { description: errs[0]?.message });
      }
      setKpis((kpisRes.data?.[0] as Kpis) ?? { tickets: 0, ingresos: 0, ticket_medio: 0 });
      setSerie((serieRes.data ?? []) as SeriePunto[]);
      setTopProductos((topRes.data ?? []) as TopProducto[]);
      setCategorias((catRes.data ?? []) as Categoria[]);
      setHeatmap((heatRes.data ?? []) as HeatCelda[]);
      setLoading(false);
    };
    run();
    return () => { cancel = true; };
  }, [local?.id, start, end, bucket]);

  const serieChart = useMemo(
    () =>
      serie.map((p) => {
        const d = new Date(p.bucket_ts);
        const label = periodo === "dia" ? `${pad(d.getHours())}h` : periodo === "mes" ? pad(d.getDate()) : format(d, "MMM", { locale: es });
        return { label, tickets: p.tickets, ingresos: Number(p.ingresos) };
      }),
    [serie, periodo],
  );

  const maxTop = Math.max(1, ...topProductos.map((p) => Number(p.ingresos)));
  const maxHeat = Math.max(1, ...heatmap.map((h) => h.tickets));
  const heatByCell = useMemo(() => {
    const m = new Map<string, HeatCelda>();
    heatmap.forEach((h) => m.set(`${h.dow}-${h.hora}`, h));
    return m;
  }, [heatmap]);

  if (!local?.id) return <Navigate to="/seleccionar-local" replace />;

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title="Analítica" subtitle={`${local.nombre} · ${periodoLabel}`} />
      <main className="mx-auto max-w-[1800px] space-y-6 p-6">
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
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCard icon={<ShoppingBag />} label="Tickets" value={kpis.tickets.toString()} />
          <StatCard icon={<Euro />} label="Ingresos" value={`${Number(kpis.ingresos).toFixed(2)} €`} />
          <StatCard icon={<Receipt />} label="Ticket medio" value={`${Number(kpis.ticket_medio).toFixed(2)} €`} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              {periodo === "dia" ? "Por hora" : periodo === "mes" ? "Por día" : "Por mes"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">Cargando…</div>
            ) : serieChart.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">Sin datos</div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serieChart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number, name) => (name === "Ingresos" ? [`${v.toFixed(2)} €`, name] : [v, name])}
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-lg">Más vendidos</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Cargando…</div>
              ) : topProductos.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">Sin ventas en este período</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {topProductos.map((p, i) => (
                    <div key={p.producto_id} className="flex items-center gap-3">
                      <span className="w-5 shrink-0 text-right text-xs font-bold text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate font-medium">
                            {p.numero && <span className="mr-1 text-xs text-muted-foreground">#{p.numero}</span>}
                            {p.nombre}
                          </span>
                          <span className="shrink-0 font-semibold">{Number(p.ingresos).toFixed(2)} €</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(Number(p.ingresos) / maxTop) * 100}%` }}
                          />
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{p.unidades} uds</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><PieIcon className="h-5 w-5" />Ventas por categoría</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Cargando…</div>
              ) : categorias.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">Sin datos</div>
              ) : (
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="h-56 w-56 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categorias} dataKey="ingresos" nameKey="seccion" innerRadius={55} outerRadius={85} paddingAngle={2}>
                          {categorias.map((_, i) => (
                            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                          formatter={(v: number) => `${Number(v).toFixed(2)} €`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex-1 space-y-1.5 text-sm">
                    {categorias.map((c, i) => (
                      <li key={c.seccion} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 truncate">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                          <span className="truncate">{c.seccion}</span>
                        </span>
                        <span className="shrink-0 font-medium">{Number(c.ingresos).toFixed(2)} €</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Flame className="h-5 w-5" />Horas de más tráfico</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">Cargando…</div>
            ) : heatmap.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">Sin datos</div>
            ) : (
              <div className="overflow-x-auto">
                <div className="inline-grid min-w-[720px] grid-cols-[3rem_repeat(24,1fr)] gap-1 text-xs">
                  <div />
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} className="text-center text-[10px] text-muted-foreground">{h}</div>
                  ))}
                  {DIAS.map((label, dow) => (
                    <div key={dow} className="contents">
                      <div className="flex items-center text-[11px] font-medium text-muted-foreground">{label}</div>
                      {Array.from({ length: 24 }).map((_, hora) => {
                        const cell = heatByCell.get(`${dow}-${hora}`);
                        const intensity = cell ? cell.tickets / maxHeat : 0;
                        return (
                          <div
                            key={hora}
                            title={cell ? `${label} ${pad(hora)}h · ${cell.tickets} tickets · ${Number(cell.ingresos).toFixed(2)} €` : undefined}
                            className="aspect-square rounded-sm"
                            style={{ background: intensity > 0 ? `hsl(var(--primary) / ${0.12 + intensity * 0.88})` : "hsl(var(--muted))" }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
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

const Analitica = () => (
  <PinGate>
    <AnaliticaContent />
  </PinGate>
);

export default Analitica;
