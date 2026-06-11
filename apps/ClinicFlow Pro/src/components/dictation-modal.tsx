import { useEffect, useRef, useState } from "react";
import { Mic, X, Sparkles, Loader2, CheckCircle2, Square } from "lucide-react";
import { formatEUR } from "@/lib/mock-data";
import { actions } from "@/lib/store";
import { DEMO_TRANSCRIPT, parseDictation } from "@/lib/ai-parse";
import type { TreatmentItem } from "@/lib/mock-data";

type Phase = "idle" | "recording" | "processing" | "result";

export type GeneratedResult = {
  transcript: string;
  notes: string;
  items: TreatmentItem[];
  nextReview?: string;
};

export function DictationModal({
  open, onClose, patientId, patientName, onDocumentCreated,
}: { open: boolean; onClose: () => void; patientId: string; patientName: string; onDocumentCreated?: (id: string) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(28).fill(0.2));
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const timerRef = useRef<number | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setPhase("idle"); setSeconds(0); setResult(null);
    }
  }, [open]);

  useEffect(() => {
    if (phase === "recording") {
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      const tick = () => {
        setLevels((prev) => prev.map(() => 0.25 + Math.random() * 0.75));
        animRef.current = window.setTimeout(tick, 110) as unknown as number;
      };
      tick();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animRef.current) clearTimeout(animRef.current);
    };
  }, [phase]);

  const start = () => { setSeconds(0); setPhase("recording"); };

  const stop = () => {
    setPhase("processing");
    setTimeout(() => {
      const parsed = parseDictation(DEMO_TRANSCRIPT);
      setResult({ transcript: parsed.transcript, notes: parsed.notes, items: parsed.items, nextReview: parsed.nextReview });
      setPhase("result");
    }, 1800);
  };

  const create = (type: "presupuesto" | "factura") => {
    if (!result) return;
    const doc = actions.createDocument(type, patientId, {
      items: result.items,
      notes: result.notes,
      nextReview: result.nextReview,
      source: "ia",
      transcript: result.transcript,
    });
    onClose();
    onDocumentCreated?.(doc.id);
  };

  if (!open) return null;

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-foreground/40 backdrop-blur-sm p-0 md:p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full md:max-w-2xl bg-card border border-border md:rounded-3xl rounded-t-3xl shadow-elegant overflow-hidden animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <div className="flex items-center gap-2 text-xs text-primary font-medium uppercase tracking-wider"><Sparkles className="size-3" /> Dictado con IA</div>
            <div className="font-display font-semibold text-lg mt-0.5">{patientName}</div>
          </div>
          <button onClick={onClose} className="size-9 rounded-lg hover:bg-accent flex items-center justify-center"><X className="size-4" /></button>
        </div>

        <div className="p-6 md:p-10">
          {phase === "idle" && (
            <div className="flex flex-col items-center text-center">
              <button onClick={start} className="relative size-28 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-elegant hover:scale-105 transition">
                <Mic className="size-10" />
              </button>
              <h3 className="mt-6 font-semibold text-lg">Pulsa para empezar a dictar</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">Habla con naturalidad. Di el tratamiento, importe y próxima revisión. La IA generará todo automáticamente.</p>
            </div>
          )}

          {phase === "recording" && (
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/30" style={{ animation: "pulse-ring 1.6s ease-out infinite" }} />
                <div className="absolute inset-0 rounded-full bg-primary/20" style={{ animation: "pulse-ring 1.6s ease-out infinite 0.5s" }} />
                <button onClick={stop} className="relative size-28 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-elegant">
                  <Square className="size-8 fill-current" />
                </button>
              </div>
              <div className="mt-6 font-display text-3xl tabular-nums font-semibold">{mm}:{ss}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Grabando…</div>
              <div className="mt-6 flex items-center justify-center gap-1 h-14">
                {levels.map((l, i) => (
                  <div key={i} className="w-1.5 rounded-full bg-primary/70" style={{ height: `${Math.max(8, l * 56)}px`, transition: "height 110ms ease" }} />
                ))}
              </div>
              <button onClick={stop} className="mt-6 px-5 h-10 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90">Detener y procesar</button>
            </div>
          )}

          {phase === "processing" && (
            <div className="flex flex-col items-center text-center py-10">
              <Loader2 className="size-10 text-primary animate-spin" />
              <h3 className="mt-5 font-semibold">Procesando con IA…</h3>
              <p className="text-sm text-muted-foreground mt-1">Transcribiendo, estructurando y generando documentos.</p>
            </div>
          )}

          {phase === "result" && result && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="flex items-center gap-2 text-success text-sm font-medium">
                <CheckCircle2 className="size-4" /> Generado automáticamente
              </div>

              <Section title="Transcripción">
                <p className="text-sm italic text-muted-foreground">“{result.transcript}”</p>
              </Section>

              <Section title="Notas clínicas">
                <p className="text-sm whitespace-pre-line">{result.notes}</p>
              </Section>

              <Section title="Tratamiento y presupuesto">
                <div className="rounded-xl border border-border divide-y divide-border">
                  {result.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between p-3 text-sm">
                      <span>{it.concept}</span>
                      <span className="font-semibold tabular-nums">{formatEUR(it.price)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 text-sm bg-accent/50">
                    <span className="font-medium">Total</span>
                    <span className="font-display font-semibold text-lg tabular-nums">{formatEUR(result.items.reduce((s, i) => s + i.price, 0))}</span>
                  </div>
                </div>
              </Section>

              {result.nextReview && (
                <Section title="Próxima revisión">
                  <div className="text-sm font-medium">{new Date(result.nextReview).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}</div>
                </Section>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button onClick={() => create("presupuesto")} className="flex-1 h-11 rounded-xl border border-input text-sm font-medium hover:bg-accent">Generar presupuesto</button>
                <button onClick={() => create("factura")} className="flex-1 h-11 rounded-xl bg-gradient-primary text-primary-foreground text-sm font-semibold shadow-elegant">Generar factura PDF</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">{title}</div>
      {children}
    </div>
  );
}