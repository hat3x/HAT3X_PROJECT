import { createFileRoute, Link } from "@tanstack/react-router";
import { Topbar } from "@/components/topbar";
import { consents, formatDate } from "@/lib/mock-data";
import { ClipboardSignature, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/_app/consentimientos")({
  component: ConsentsPage,
});

function ConsentsPage() {
  return (
    <>
      <Topbar title="Consentimientos" subtitle="Consentimientos informados digitales" />
      <div className="grid md:grid-cols-2 gap-4">
        {consents.map((c) => (
          <div key={c.id} className="rounded-2xl bg-card border border-border shadow-soft p-5">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <ClipboardSignature className="size-5" />
              </div>
              <div className="flex-1">
                <div className="font-display font-semibold">{c.template}</div>
                <Link to="/pacientes/$id" params={{ id: c.patientId }} className="text-sm text-muted-foreground hover:text-primary">{c.patientName}</Link>
              </div>
              {c.signedAt ? (
                <span className="inline-flex items-center gap-1 text-xs text-success bg-success/15 px-2 py-1 rounded-md"><CheckCircle2 className="size-3" /> Firmado</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-warning bg-warning/15 px-2 py-1 rounded-md"><Clock className="size-3" /> Pendiente</span>
              )}
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              {c.signedAt ? `Firmado el ${formatDate(c.signedAt)}` : "Esperando firma del paciente."}
            </div>
            {!c.signedAt && (
              <button className="mt-4 h-9 px-4 rounded-lg bg-gradient-primary text-primary-foreground text-sm font-medium shadow-elegant">Enviar a firmar</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}