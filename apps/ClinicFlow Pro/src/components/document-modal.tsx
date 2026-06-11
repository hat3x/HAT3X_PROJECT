import { useEffect, useMemo, useState } from "react";
import { X, Download, Trash2, FileText, Receipt, ScrollText } from "lucide-react";
import { actions, computeTotals, useStore, type ClinicDocument, type DocStatus } from "@/lib/store";
import { downloadPdf, previewPdfBlobUrl } from "@/lib/pdf";

const STATUS: { value: DocStatus; label: string; cls: string }[] = [
  { value: "pendiente", label: "Pendiente", cls: "bg-warning/15 text-warning" },
  { value: "aceptado", label: "Aceptado", cls: "bg-primary/10 text-primary" },
  { value: "pagado", label: "Pagado", cls: "bg-success/15 text-success" },
  { value: "parcial", label: "Parcial", cls: "bg-accent text-foreground" },
  { value: "cancelado", label: "Cancelado", cls: "bg-destructive/10 text-destructive" },
];

const EUR = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

export function DocumentModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const doc = useStore((s) => s.documents.find((d) => d.id === id));
  const clinic = useStore((s) => s.clinic);
  const [tab, setTab] = useState<"editar" | "vista">("editar");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!doc || tab !== "vista") {
      setPreviewUrl(null);
      return;
    }
    const url = previewPdfBlobUrl(doc, clinic);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, tab, JSON.stringify(doc?.items), doc?.vat, doc?.status, doc?.notes, doc?.date, doc?.patientName]);

  const totals = useMemo(
    () => (doc ? computeTotals(doc) : { base: 0, tax: 0, total: 0 }),
    [doc],
  );

  if (!id || !doc) return null;

  const Icon = doc.type === "factura" ? Receipt : doc.type === "presupuesto" ? FileText : ScrollText;

  const patch = (p: Partial<ClinicDocument>) => actions.updateDocument(doc.id, p);
  const updateItem = (idx: number, p: Partial<{ concept: string; qty: number; price: number }>) => {
    const items = doc.items.map((it, i) => (i === idx ? { ...it, ...p } : it));
    patch({ items });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-foreground/40 backdrop-blur-sm p-0 md:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full md:max-w-4xl bg-card border border-border md:rounded-3xl rounded-t-3xl shadow-elegant overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Icon className="size-5" /></div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{doc.type}</div>
              <div className="font-display font-semibold truncate">{doc.number} · {doc.patientName}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => downloadPdf(doc, clinic)} className="h-9 px-3 rounded-lg bg-foreground text-background text-xs font-medium flex items-center gap-1.5"><Download className="size-3.5" /> PDF</button>
            <button onClick={onClose} className="size-9 rounded-lg hover:bg-accent flex items-center justify-center"><X className="size-4" /></button>
          </div>
        </div>

        <div className="flex items-center gap-1 px-5 pt-3 border-b border-border">
          {(["editar", "vista"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 h-9 text-sm font-medium rounded-t-lg ${tab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t === "editar" ? "Editar" : "Vista PDF"}</button>
          ))}
          <div className="ml-auto text-[11px] text-muted-foreground pb-2">Guardado automático</div>
        </div>

        <div className="overflow-auto p-5 md:p-6 space-y-5">
          {tab === "editar" && (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Fecha"><input type="date" value={doc.date} onChange={(e) => patch({ date: e.target.value })} className="input" /></Field>
                <Field label="IVA (%)"><input type="number" value={doc.vat} onChange={(e) => patch({ vat: parseFloat(e.target.value) || 0 })} className="input" /></Field>
                <Field label="Estado">
                  <select value={doc.status} onChange={(e) => patch({ status: e.target.value as DocStatus })} className="input">
                    {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_70px_100px_100px_36px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-accent/40">
                  <div>Concepto</div><div>Cant.</div><div>Precio</div><div className="text-right">Subtotal</div><div />
                </div>
                {doc.items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1fr_70px_100px_100px_36px] gap-2 px-3 py-2 items-center border-t border-border">
                    <input value={it.concept} onChange={(e) => updateItem(i, { concept: e.target.value })} className="input" placeholder="Concepto" />
                    <input type="number" value={it.qty} onChange={(e) => updateItem(i, { qty: parseFloat(e.target.value) || 0 })} className="input" />
                    <input type="number" value={it.price} onChange={(e) => updateItem(i, { price: parseFloat(e.target.value) || 0 })} className="input" />
                    <div className="text-right tabular-nums text-sm font-medium">{EUR(it.qty * it.price)}</div>
                    <button onClick={() => patch({ items: doc.items.filter((_, j) => j !== i) })} className="size-8 rounded-md hover:bg-destructive/10 text-destructive flex items-center justify-center"><Trash2 className="size-3.5" /></button>
                  </div>
                ))}
                <button onClick={() => patch({ items: [...doc.items, { concept: "", qty: 1, price: 0 }] })} className="w-full text-left px-3 py-2.5 text-sm text-primary hover:bg-primary/5 border-t border-border">+ Añadir concepto</button>
              </div>

              <div className="grid sm:grid-cols-[1fr_220px] gap-4">
                <Field label="Notas"><textarea rows={4} value={doc.notes ?? ""} onChange={(e) => patch({ notes: e.target.value })} className="input min-h-[96px] py-2" placeholder="Observaciones, plan de tratamiento…" /></Field>
                <div className="rounded-xl bg-accent/40 p-4 space-y-1.5 text-sm h-fit">
                  <Row label="Base" value={EUR(totals.base)} />
                  <Row label={`IVA (${doc.vat}%)`} value={EUR(totals.tax)} />
                  <div className="h-px bg-border my-1" />
                  <Row label="Total" value={EUR(totals.total)} bold />
                </div>
              </div>
            </>
          )}

          {tab === "vista" && previewUrl && (
            <iframe src={previewUrl} className="w-full h-[70vh] rounded-xl border border-border bg-white" title="PDF" />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<label className="block"><span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span><div className="mt-1">{children}</div></label>);
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (<div className="flex items-center justify-between"><span className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</span><span className={`tabular-nums ${bold ? "font-display font-semibold text-lg" : ""}`}>{value}</span></div>);
}