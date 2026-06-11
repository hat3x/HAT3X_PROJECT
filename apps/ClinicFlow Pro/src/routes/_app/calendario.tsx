import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Topbar } from "@/components/topbar";
import { actions, useStore } from "@/lib/store";
import { formatTime } from "@/lib/mock-data";
import type { Appointment, AppointmentStatus } from "@/lib/mock-data";
import { ChevronLeft, ChevronRight, Plus, X, Trash2 } from "lucide-react";

type View = "dia" | "semana" | "mes" | "año";

export const Route = createFileRoute("/_app/calendario")({
  component: CalendarPage,
});

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const startOfWeek = (d: Date) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0,0,0,0); return x; };
const startOfMonth = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), 1); return x; };
const fmtMonth = (d: Date) => d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

function CalendarPage() {
  const appts = useStore((s) => s.appointments);
  const patients = useStore((s) => s.patients);
  const [view, setView] = useState<View>("semana");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [editing, setEditing] = useState<Appointment | null>(null);

  const move = (delta: number) => {
    const d = new Date(cursor);
    if (view === "dia") d.setDate(d.getDate() + delta);
    else if (view === "semana") d.setDate(d.getDate() + delta * 7);
    else if (view === "mes") d.setMonth(d.getMonth() + delta);
    else d.setFullYear(d.getFullYear() + delta);
    setCursor(d);
  };

  const title = useMemo(() => {
    if (view === "dia") return cursor.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (view === "semana") { const s = startOfWeek(cursor); const e = new Date(s); e.setDate(e.getDate() + 6); return `${s.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} — ${e.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`; }
    if (view === "mes") return fmtMonth(cursor);
    return String(cursor.getFullYear());
  }, [view, cursor]);

  const openNew = (d?: Date) => {
    const date = d ?? new Date();
    if (!d) date.setMinutes(0, 0, 0);
    setEditing({
      id: "new",
      patientId: patients[0]?.id ?? "",
      patientName: patients[0]?.name ?? "",
      treatment: "",
      dentist: "Dra. Pérez",
      date: date.toISOString(),
      duration: 30,
      status: "confirmada",
    });
  };

  return (
    <>
      <Topbar title="Calendario" subtitle={title} action={
        <button onClick={() => openNew()} className="h-10 px-4 rounded-xl bg-gradient-primary text-primary-foreground text-sm font-medium flex items-center gap-2 shadow-elegant"><Plus className="size-4" /> Nueva cita</button>
      } />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center bg-card border border-border rounded-xl shadow-soft overflow-hidden">
          <button onClick={() => move(-1)} className="size-10 hover:bg-accent flex items-center justify-center"><ChevronLeft className="size-4" /></button>
          <button onClick={() => setCursor(new Date())} className="h-10 px-3 text-sm font-medium border-x border-border hover:bg-accent">Hoy</button>
          <button onClick={() => move(1)} className="size-10 hover:bg-accent flex items-center justify-center"><ChevronRight className="size-4" /></button>
        </div>
        <div className="flex bg-card border border-border rounded-xl shadow-soft p-1">
          {(["dia","semana","mes","año"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3.5 h-8 rounded-lg text-xs font-medium capitalize transition ${view===v?"bg-foreground text-background":"text-muted-foreground hover:text-foreground"}`}>{v}</button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden">
        {view === "dia" && <DayView date={cursor} appts={appts} onEdit={setEditing} onNew={openNew} />}
        {view === "semana" && <WeekView date={cursor} appts={appts} onEdit={setEditing} onNew={openNew} />}
        {view === "mes" && <MonthView date={cursor} appts={appts} onPickDay={(d) => { setCursor(d); setView("dia"); }} />}
        {view === "año" && <YearView date={cursor} onPickMonth={(d) => { setCursor(d); setView("mes"); }} />}
      </div>

      {editing && <AppointmentModal appt={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8..19
const statusColor: Record<AppointmentStatus, string> = {
  confirmada: "bg-primary/10 text-primary border-l-primary",
  pendiente: "bg-warning/15 text-warning border-l-warning",
  cancelada: "bg-destructive/10 text-destructive border-l-destructive",
  completada: "bg-success/15 text-success border-l-success",
  reagendada: "bg-accent text-foreground border-l-foreground/40",
};

function ApptChip({ a, onClick }: { a: Appointment; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full text-left text-xs p-2 rounded-lg border-l-2 ${statusColor[a.status]} hover:opacity-90 transition mb-1`}>
      <div className="font-semibold tabular-nums">{formatTime(a.date)}</div>
      <div className="truncate font-medium text-foreground">{a.patientName}</div>
      <div className="truncate opacity-80">{a.treatment}</div>
    </button>
  );
}

function DayView({ date, appts, onEdit, onNew }: { date: Date; appts: Appointment[]; onEdit: (a: Appointment) => void; onNew: (d: Date) => void }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: "60px 1fr" }}>
      {HOURS.map((h) => {
        const cell = appts.filter((a) => { const d = new Date(a.date); return sameDay(d, date) && d.getHours() === h; });
        const slot = new Date(date); slot.setHours(h, 0, 0, 0);
        return (
          <div key={h} className="contents">
            <div className="border-b border-r border-border text-[10px] text-muted-foreground text-right pr-2 py-3 tabular-nums">{h}:00</div>
            <div onClick={() => cell.length === 0 && onNew(slot)} className="border-b border-border min-h-[72px] p-1.5 hover:bg-accent/30 cursor-pointer">
              {cell.map((a) => <ApptChip key={a.id} a={a} onClick={() => onEdit(a)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ date, appts, onEdit, onNew }: { date: Date; appts: Appointment[]; onEdit: (a: Appointment) => void; onNew: (d: Date) => void }) {
  const start = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[800px]" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
        <div className="border-b border-r border-border p-2" />
        {days.map((d, i) => (
          <div key={i} className={`border-b border-border p-2 text-center text-xs font-medium ${sameDay(d, new Date()) ? "text-primary" : ""}`}>
            <div className="capitalize">{d.toLocaleDateString("es-ES", { weekday: "short" })}</div>
            <div className="text-base font-display tabular-nums">{d.getDate()}</div>
          </div>
        ))}
        {HOURS.map((h) => (
          <div key={h} className="contents">
            <div className="border-b border-r border-border text-[10px] text-muted-foreground text-right pr-2 py-3 tabular-nums">{h}:00</div>
            {days.map((d, di) => {
              const cell = appts.filter((a) => { const ad = new Date(a.date); return sameDay(ad, d) && ad.getHours() === h; });
              const slot = new Date(d); slot.setHours(h, 0, 0, 0);
              return (
                <div key={di} onClick={() => cell.length === 0 && onNew(slot)} className="border-b border-r last:border-r-0 border-border min-h-[64px] p-1 hover:bg-accent/30 cursor-pointer">
                  {cell.map((a) => <ApptChip key={a.id} a={a} onClick={() => onEdit(a)} />)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthView({ date, appts, onPickDay }: { date: Date; appts: Appointment[]; onPickDay: (d: Date) => void }) {
  const first = startOfMonth(date);
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const weekdays = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border">
        {weekdays.map((w) => <div key={w} className="text-[10px] uppercase tracking-wider text-muted-foreground text-center py-2">{w}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const out = d.getMonth() !== date.getMonth();
          const today = sameDay(d, new Date());
          const dayAppts = appts.filter((a) => sameDay(new Date(a.date), d));
          return (
            <button key={i} onClick={() => onPickDay(d)} className={`text-left min-h-[110px] border-b border-r border-border p-2 hover:bg-accent/30 ${out ? "bg-accent/10 text-muted-foreground" : ""}`}>
              <div className={`text-sm tabular-nums font-medium ${today ? "size-7 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center" : ""}`}>{d.getDate()}</div>
              <div className="mt-1 space-y-1">
                {dayAppts.slice(0, 3).map((a) => (
                  <div key={a.id} className={`text-[10px] px-1.5 py-0.5 rounded truncate ${statusColor[a.status]}`}>{formatTime(a.date)} {a.patientName}</div>
                ))}
                {dayAppts.length > 3 && <div className="text-[10px] text-muted-foreground">+{dayAppts.length - 3} más</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function YearView({ date, onPickMonth }: { date: Date; onPickMonth: (d: Date) => void }) {
  const months = Array.from({ length: 12 }, (_, i) => new Date(date.getFullYear(), i, 1));
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-5">
      {months.map((m, i) => (
        <button key={i} onClick={() => onPickMonth(m)} className="rounded-xl border border-border p-4 text-left hover:shadow-soft hover:border-primary/40 transition">
          <div className="font-display font-semibold capitalize">{m.toLocaleDateString("es-ES", { month: "long" })}</div>
          <MiniMonth date={m} />
        </button>
      ))}
    </div>
  );
}

function MiniMonth({ date }: { date: Date }) {
  const first = startOfMonth(date);
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  return (
    <div className="grid grid-cols-7 gap-0.5 mt-3 text-[10px]">
      {cells.slice(0, 35).map((d, i) => (
        <div key={i} className={`text-center py-0.5 tabular-nums ${d.getMonth() !== date.getMonth() ? "text-muted-foreground/40" : sameDay(d, new Date()) ? "bg-primary text-primary-foreground rounded" : ""}`}>{d.getDate()}</div>
      ))}
    </div>
  );
}

function AppointmentModal({ appt, onClose }: { appt: Appointment; onClose: () => void }) {
  const patients = useStore((s) => s.patients);
  const [data, setData] = useState<Appointment>(appt);
  const isNew = appt.id === "new";
  const date = new Date(data.date);
  const dateStr = date.toISOString().slice(0, 10);
  const timeStr = `${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;

  const setDate = (dStr: string, tStr: string) => {
    const [h, m] = tStr.split(":").map(Number);
    const d = new Date(dStr); d.setHours(h, m, 0, 0);
    setData({ ...data, date: d.toISOString() });
  };

  const save = () => {
    const id = isNew ? "a_" + Math.random().toString(36).slice(2, 9) : data.id;
    const p = patients.find((p) => p.id === data.patientId);
    actions.upsertAppointment({ ...data, id, patientName: p?.name ?? data.patientName });
    onClose();
  };
  const remove = () => { if (!isNew) actions.deleteAppointment(data.id); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card border border-border rounded-3xl shadow-elegant overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="font-display font-semibold">{isNew ? "Nueva cita" : "Editar cita"}</div>
          <button onClick={onClose} className="size-9 rounded-lg hover:bg-accent flex items-center justify-center"><X className="size-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block"><span className="text-xs text-muted-foreground">Paciente</span>
            <select value={data.patientId} onChange={(e) => setData({ ...data, patientId: e.target.value })} className="input mt-1">
              {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs text-muted-foreground">Tratamiento</span>
            <input value={data.treatment} onChange={(e) => setData({ ...data, treatment: e.target.value })} className="input mt-1" placeholder="Ej. Limpieza dental" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs text-muted-foreground">Fecha</span>
              <input type="date" value={dateStr} onChange={(e) => setDate(e.target.value, timeStr)} className="input mt-1" />
            </label>
            <label className="block"><span className="text-xs text-muted-foreground">Hora</span>
              <input type="time" value={timeStr} onChange={(e) => setDate(dateStr, e.target.value)} className="input mt-1" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs text-muted-foreground">Duración (min)</span>
              <input type="number" value={data.duration} onChange={(e) => setData({ ...data, duration: parseInt(e.target.value) || 30 })} className="input mt-1" />
            </label>
            <label className="block"><span className="text-xs text-muted-foreground">Dentista</span>
              <input value={data.dentist} onChange={(e) => setData({ ...data, dentist: e.target.value })} className="input mt-1" />
            </label>
          </div>
          <label className="block"><span className="text-xs text-muted-foreground">Estado</span>
            <select value={data.status} onChange={(e) => setData({ ...data, status: e.target.value as AppointmentStatus })} className="input mt-1">
              {(["confirmada","pendiente","completada","cancelada","reagendada"] as AppointmentStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2 p-5 border-t border-border">
          {!isNew && <button onClick={remove} className="h-10 px-3 rounded-xl text-destructive hover:bg-destructive/10 flex items-center gap-1.5 text-sm font-medium"><Trash2 className="size-4" /> Eliminar</button>}
          <div className="flex-1" />
          <button onClick={onClose} className="h-10 px-4 rounded-xl border border-input text-sm font-medium hover:bg-accent">Cancelar</button>
          <button onClick={save} className="h-10 px-4 rounded-xl bg-gradient-primary text-primary-foreground text-sm font-semibold shadow-elegant">{isNew ? "Crear" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}