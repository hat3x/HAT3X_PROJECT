import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { actions, store } from "@/lib/store";
import { Sparkles, ArrowRight, Building2, User } from "lucide-react";

export const Route = createFileRoute("/_app/onboarding")({
  component: Onboarding,
});

type Step = "clinica" | "dentista";

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("clinica");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clinica, setClinica] = useState({
    name: "", cif: "", address: "", phone: "", email: "",
    logoInitials: "", vat: 21,
  });
  const [dentista, setDentista] = useState({
    dentistName: "", dentistEmail: "",
  });

  useEffect(() => {
    if (store.isDemo()) store.exitDemo();
  }, []);

  useEffect(() => {
    const words = clinica.name.trim().split(/\s+/).filter(Boolean);
    const initials = words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    if (initials) setClinica((prev) => ({ ...prev, logoInitials: initials }));
  }, [clinica.name]);

  const submitDentista = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Sin sesión activa");

      const userId = sessionData.session.user.id;

      const { error: dbErr } = await supabase.from("clinics").upsert({
        user_id: userId,
        name: clinica.name,
        cif: clinica.cif || null,
        address: clinica.address || null,
        phone: clinica.phone || null,
        email: clinica.email || null,
        logo_initials: clinica.logoInitials || clinica.name.slice(0, 2).toUpperCase(),
        vat: clinica.vat,
        dentist_name: dentista.dentistName || null,
        dentist_email: dentista.dentistEmail || null,
      }, { onConflict: "user_id" });

      if (dbErr) throw dbErr;

      actions.setClinicLocal({
        name: clinica.name,
        cif: clinica.cif,
        address: clinica.address,
        phone: clinica.phone,
        email: clinica.email,
        logoInitials: clinica.logoInitials || clinica.name.slice(0, 2).toUpperCase(),
        vat: clinica.vat,
        dentistName: dentista.dentistName,
        dentistEmail: dentista.dentistEmail,
      });

      navigate({ to: "/dashboard" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center -m-5 md:-m-8 p-5">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <div className="size-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant">
            <Sparkles className="size-5 text-primary-foreground" />
          </div>
          <span className="font-display font-semibold text-lg">ClinicFlow Pro</span>
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          <StepDot active={step === "clinica"} done={step === "dentista"} label="Tu clínica" icon={<Building2 className="size-3.5" />} />
          <div className="h-px w-8 bg-border" />
          <StepDot active={step === "dentista"} done={false} label="Tu perfil" icon={<User className="size-3.5" />} />
        </div>

        <div className="rounded-3xl bg-card border border-border shadow-elegant p-7">
          {step === "clinica" ? (
            <>
              <h1 className="font-display font-semibold text-2xl tracking-tight">Datos de tu clínica</h1>
              <p className="text-sm text-muted-foreground mt-1.5">Así aparecerán en presupuestos y facturas.</p>
              <form onSubmit={(e) => { e.preventDefault(); setStep("dentista"); }} className="mt-6 space-y-4">
                <F label="Nombre de la clínica *">
                  <input required placeholder="Clínica Dental Sonrisa" value={clinica.name}
                    onChange={(e) => setClinica({ ...clinica, name: e.target.value })} className="input" />
                </F>
                <div className="grid grid-cols-2 gap-3">
                  <F label="CIF">
                    <input placeholder="B12345678" value={clinica.cif}
                      onChange={(e) => setClinica({ ...clinica, cif: e.target.value })} className="input" />
                  </F>
                  <F label="Iniciales logo">
                    <input maxLength={3} placeholder="CS" value={clinica.logoInitials}
                      onChange={(e) => setClinica({ ...clinica, logoInitials: e.target.value.toUpperCase() })}
                      className="input uppercase" />
                  </F>
                </div>
                <F label="Dirección">
                  <input placeholder="Calle Mayor 23, Madrid" value={clinica.address}
                    onChange={(e) => setClinica({ ...clinica, address: e.target.value })} className="input" />
                </F>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Teléfono">
                    <input placeholder="+34 912 345 678" value={clinica.phone}
                      onChange={(e) => setClinica({ ...clinica, phone: e.target.value })} className="input" />
                  </F>
                  <F label="Correo electrónico">
                    <input type="email" placeholder="hola@miclinica.es" value={clinica.email}
                      onChange={(e) => setClinica({ ...clinica, email: e.target.value })} className="input" />
                  </F>
                </div>
                <F label="IVA por defecto (%)">
                  <input type="number" min={0} max={100} value={clinica.vat}
                    onChange={(e) => setClinica({ ...clinica, vat: parseFloat(e.target.value) || 0 })}
                    className="input" />
                </F>
                <button type="submit"
                  className="w-full h-12 rounded-xl bg-gradient-primary text-primary-foreground font-semibold text-sm shadow-elegant flex items-center justify-center gap-2 hover:opacity-95">
                  Continuar <ArrowRight className="size-4" />
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="font-display font-semibold text-2xl tracking-tight">Tu perfil profesional</h1>
              <p className="text-sm text-muted-foreground mt-1.5">Aparecerá en documentos y en el panel.</p>
              <form onSubmit={submitDentista} className="mt-6 space-y-4">
                <F label="Tu nombre completo *">
                  <input required placeholder="Dra. María García" value={dentista.dentistName}
                    onChange={(e) => setDentista({ ...dentista, dentistName: e.target.value })} className="input" />
                </F>
                <F label="Tu correo electrónico">
                  <input type="email" placeholder="maria@miclinica.es" value={dentista.dentistEmail}
                    onChange={(e) => setDentista({ ...dentista, dentistEmail: e.target.value })} className="input" />
                </F>
                {error && (
                  <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3">{error}</div>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep("clinica")}
                    className="flex-1 h-12 rounded-xl border border-border text-sm font-medium hover:bg-muted/50 transition-colors">
                    Atrás
                  </button>
                  <button type="submit" disabled={saving}
                    className="flex-1 h-12 rounded-xl bg-gradient-primary text-primary-foreground font-semibold text-sm shadow-elegant flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60">
                    {saving ? "Guardando…" : <><span>Entrar al panel</span><ArrowRight className="size-4" /></>}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Puedes cambiar estos datos en cualquier momento desde Configuración
        </p>
      </div>
    </div>
  );
}

function StepDot({ active, done, label, icon }: {
  active: boolean; done: boolean; label: string; icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={[
        "size-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
        done ? "bg-green-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      ].join(" ")}>
        {icon}
      </div>
      <span className={["text-[10px]", active ? "text-foreground font-medium" : "text-muted-foreground"].join(" ")}>
        {label}
      </span>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
