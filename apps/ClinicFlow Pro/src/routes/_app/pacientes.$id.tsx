import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { formatDate, formatTime } from "@/lib/mock-data";
import { actions, computeTotals, useStore, type ClinicDocument, type DocType } from "@/lib/store";
import { ArrowLeft, Mic, Phone, Mail, MapPin, Calendar, FileText, Receipt, ScrollText, ClipboardSignature, Sparkles, Plus, Download } from "lucide-react";
import { DictationModal } from "@/components/dictation-modal";
import { DocumentModal } from "@/components/document-modal";
import { downloadPdf } from "@/lib/pdf";

export const Route = createFileRoute("/_app/pacientes/$id")({
  loader: ({ params }) => ({ id: params.id }),
  component: PatientDetail,
  notFoundComponent: () => <div className="p-8">Paciente no encontrado.</div>,
});

const EUR = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

function PatientDetail() {
  const { id } = Route.useLoaderData();
  const patient = useStore((s) => s.patients.find((p) => p.id === id));
  const appts = useStore((s) => s.appointments.filter((a) => a.patientId === id));
  const allDocs = useStore((s) => s.documents.filter((d) => d.patientId === id));
  const consents = useStore((s) => s.consents.filter((c) => c.patientId === id));
  const clinic = useStore((s) => s.clinic);
  const [openDictation, setOpenDictation] = useState(false);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [tab, setTab] = useState<"resumen" | "citas" | "presupuestos" | "facturas" | "recibos" | "consentimientos">("resumen");

  if (!patient) throw notFound();

  const presupuestos = allDocs.filter((d) => d.type === "presupuesto");
  const facturas = allDocs.filter((d) => d.type === "factura");
  const recibos = allDocs.filter((d) => d.type === "recibo");

  const createDoc = (type: DocType) => {
    const d = actions.createDocument(type, patient.id);
    setOpenDocId(d.id);
    setTab(type === "factura" ? "facturas" : type === "recibo" ? "recibos" : "presupuestos");
  };

  return (
    <>
      <Link to="/pacientes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-4" /> Pacientes
      </Link>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 rounded-2xl bg-card border border-border shadow-soft p-6">
          <div className="flex items-start gap-4">
            <div className="size-16 rounded-2xl bg-gradient-primary flex items-center justify-center text-primary-foreground font-display font-semibold text-xl shadow-elegant shrink-0">
              {patient.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-display font-semibold tracking-tight">{patient.name}</h1>
              <div className="text-sm text-muted-foreground mt-1">DNI {patient.dni} · Nacido {formatDate(patient.birthDate)}</div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Phone className="size-3.5" /> {patient.phone}</span>
                <span className="flex items-center gap-1.5 text-muted-foreground"><Mail className="size-3.5" /> {patient.email}</span>
                <span className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-3.5" /> {patient.address}</span>
              </div>
              {patient.notes && <div className="mt-4 text-xs text-warning bg-warning/10 rounded-lg px-3 py-2 inline-block">⚠ {patient.notes}</div>}
            </div>
          </div>
        </div>

        <button onClick={() => setOpenDictation(true)} className="rounded-2xl bg-gradient-primary p-6 text-primary-foreground shadow-elegant text-left hover:opacity-95 transition group relative overflow-hidden">
          <div className="absolute -top-6 -right-6 size-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-80"><Sparkles className="size-3" /> Dictado con IA</div>
            <div className="font-display font-semibold text-lg mt-1">Dictar tratamiento</div>
            <p className="text-sm opacity-90 mt-1">Genera presupuesto o factura PDF en segundos.</p>
            <div className="mt-4 inline-flex items-center justify-center size-12 rounded-full bg-white/20 backdrop-blur group-hover:scale-110 transition"><Mic className="size-5" /></div>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-1 mb-4 overflow-x-auto -mx-2 px-2">
        {([
          ["resumen", "Resumen"],
          ["citas", `Citas (${appts.length})`],
          ["presupuestos", `Presupuestos (${presupuestos.length})`],
          ["facturas", `Facturas (${facturas.length})`],
          ["recibos", `Recibos (${recibos.length})`],
          ["consentimientos", `Consentimientos (${consents.length})`],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 h-9 rounded-lg text-sm font-medium whitespace-nowrap transition ${tab === k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}>{l}</button>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border shadow-soft p-5">
        {tab === "resumen" && (
          <div className="grid md:grid-cols-2 gap-5">
            <InfoBlock icon={<Calendar className="size-4" />} title="Próxima revisión" value={patient.nextReview ? formatDate(patient.nextReview) : "Sin programar"} />
            <InfoBlock icon={<FileText className="size-4" />} title="Presupuestos" value={`${presupuestos.length} documentos`} />
            <InfoBlock icon={<Receipt className="size-4" />} title="Facturado" value={EUR(facturas.reduce((s, d) => s + computeTotals(d).total, 0))} />
            <InfoBlock icon={<ClipboardSignature className="size-4" />} title="Consentimientos" value={`${consents.filter((c) => c.signedAt).length} firmados`} />
          </div>
        )}

        {tab === "citas" && (
          <ul className="divide-y divide-border -mx-2">
            {appts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-2 py-3">
                <div className="text-sm font-semibold tabular-nums text-primary w-20">{formatTime(a.date)}</div>
                <div className="flex-1"><div className="font-medium">{a.treatment}</div><div className="text-xs text-muted-foreground">{formatDate(a.date)} · {a.dentist}</div></div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.status}</span>
              </li>
            ))}
            {appts.length === 0 && <li className="text-sm text-muted-foreground p-3">Sin citas registradas.</li>}
          </ul>
        )}

        {tab === "presupuestos" && <DocList docs={presupuestos} clinic={clinic} type="presupuesto" onOpen={setOpenDocId} onCreate={() => createDoc("presupuesto")} />}
        {tab === "facturas" && <DocList docs={facturas} clinic={clinic} type="factura" onOpen={setOpenDocId} onCreate={() => createDoc("factura")} />}
        {tab === "recibos" && <DocList docs={recibos} clinic={clinic} type="recibo" onOpen={setOpenDocId} onCreate={() => createDoc("recibo")} />}

        {tab === "consentimientos" && (
          <ul className="divide-y divide-border -mx-2">
            {consents.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-2 py-3">
                <div><div className="font-medium">{c.template}</div><div className="text-xs text-muted-foreground">{c.signedAt ? `Firmado ${formatDate(c.signedAt)}` : "Pendiente"}</div></div>
                <div className="font-semibold tabular-nums">{c.signedAt ? "✓" : "—"}</div>
              </li>
            ))}
            {consents.length === 0 && <li className="text-sm text-muted-foreground p-3">Sin consentimientos.</li>}
          </ul>
        )}
      </div>

      <DictationModal open={openDictation} onClose={() => setOpenDictation(false)} patientId={patient.id} patientName={patient.name} onDocumentCreated={(id) => { setOpenDocId(id); setTab("presupuestos"); }} />
      <DocumentModal id={openDocId} onClose={() => setOpenDocId(null)} />
    </>
  );
}

function InfoBlock({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (<div className="rounded-xl border border-border p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {title}</div><div className="mt-1.5 font-display font-semibold text-lg">{value}</div></div>);
}

function DocList({ docs, clinic, type, onOpen, onCreate }: { docs: ClinicDocument[]; clinic: any; type: DocType; onOpen: (id: string) => void; onCreate: () => void }) {
  const Icon = type === "factura" ? Receipt : type === "presupuesto" ? FileText : ScrollText;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted-foreground">{docs.length} {type}{docs.length === 1 ? "" : "s"}</div>
        <button onClick={onCreate} className="h-9 px-3 rounded-lg bg-foreground text-background text-xs font-medium flex items-center gap-1.5"><Plus className="size-3.5" /> Nuevo {type}</button>
      </div>
      {docs.length === 0 ? (
        <button onClick={onCreate} className="w-full rounded-xl border-2 border-dashed border-border p-8 text-center hover:border-primary/40 hover:bg-accent/30 transition">
          <Icon className="size-6 mx-auto text-muted-foreground" />
          <div className="mt-2 text-sm font-medium">Crear primer {type}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Manual o por dictado de voz</div>
        </button>
      ) : (
        <ul className="divide-y divide-border -mx-2">
          {docs.map((d) => {
            const t = computeTotals(d);
            return (
              <li key={d.id} className="flex items-center gap-3 px-2 py-3 hover:bg-accent/30 rounded-lg cursor-pointer" onClick={() => onOpen(d.id)}>
                <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Icon className="size-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{d.number} <span className="text-xs text-muted-foreground capitalize">· {d.status}</span></div>
                  <div className="text-xs text-muted-foreground">{formatDate(d.date)} · {d.items.length} concepto{d.items.length === 1 ? "" : "s"}</div>
                </div>
                <div className="font-display font-semibold tabular-nums">{EUR(t.total)}</div>
                <button onClick={(e) => { e.stopPropagation(); downloadPdf(d, clinic); }} className="size-8 rounded-md hover:bg-accent flex items-center justify-center" title="Descargar PDF"><Download className="size-3.5" /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}