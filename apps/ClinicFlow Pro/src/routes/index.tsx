import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Sparkles, Mic, CalendarCheck, ShieldCheck, ArrowRight, Play } from "lucide-react";
import { store } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClinicFlow Pro — Gestión dental con IA" },
      { name: "description", content: "Pacientes, citas, presupuestos y dictado por voz con IA. Toda la operación de tu clínica dental en un solo lugar." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  const handleDemo = () => {
    store.enterDemo();
    navigate({ to: "/dashboard" });
  };

  const handleStart = () => {
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-gradient-soft flex flex-col">
      <header className="max-w-6xl mx-auto w-full px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant">
            <Sparkles className="size-4 text-primary-foreground" />
          </div>
          <span className="font-display font-semibold tracking-tight text-lg">ClinicFlow Pro</span>
        </div>
        <button
          onClick={handleStart}
          className="h-9 px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          Iniciar sesión
        </button>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 pt-16 pb-24">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-primary bg-primary/10 px-3 py-1.5 rounded-full mb-6">
            <Sparkles className="size-3" /> Dictado por voz con IA · Nuevo
          </div>
          <h1 className="font-display font-semibold text-4xl md:text-6xl tracking-tight leading-[1.05]">
            La gestión de tu clínica dental,
            <span className="bg-gradient-primary bg-clip-text text-transparent"> simple y mágica.</span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground mt-5 leading-relaxed max-w-2xl mx-auto">
            Pacientes, citas, presupuestos, facturas y consentimientos en un solo lugar.
            Dicta el tratamiento y deja que la IA genere todo en segundos.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleStart}
              className="w-full sm:w-auto h-12 px-8 rounded-xl bg-gradient-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 shadow-elegant hover:opacity-95 transition-opacity"
            >
              Empezar <ArrowRight className="size-4" />
            </button>
            <button
              onClick={handleDemo}
              className="w-full sm:w-auto h-12 px-8 rounded-xl border border-border bg-card text-sm font-medium flex items-center justify-center gap-2 hover:bg-muted/50 transition-colors"
            >
              <Play className="size-4 text-primary" /> Ver demo interactiva
            </button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Implementación personalizada · Soporte incluido
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5 mt-24">
          <Feature icon={<Mic className="size-5" />} title="Dictado mágico con IA" desc="Habla con naturalidad. La IA transcribe, genera el presupuesto y programa la próxima revisión automáticamente." />
          <Feature icon={<CalendarCheck className="size-5" />} title="Agenda inteligente" desc="Calendario con 4 vistas, estados de cita en tiempo real y gestión de huecos sin esfuerzo." />
          <Feature icon={<ShieldCheck className="size-5" />} title="Consentimientos digitales" desc="Plantillas listas para firmar desde cualquier dispositivo, vinculadas automáticamente al paciente." />
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            Diseñado para clínicas dentales que quieren dejar de perder tiempo con el papeleo
          </p>
        </div>
      </main>

      <footer className="border-t border-border py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>© 2026 ClinicFlow Pro by HAT3X</span>
          <span>Gestión dental con IA</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-6">
      <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
      <h3 className="font-display font-semibold mt-4">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{desc}</p>
    </div>
  );
}
