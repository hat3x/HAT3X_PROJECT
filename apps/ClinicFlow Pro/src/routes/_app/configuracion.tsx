import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Topbar } from "@/components/topbar";
import { actions, useStore } from "@/lib/store";
import { Mic, MicOff } from "lucide-react";

export const Route = createFileRoute("/_app/configuracion")({
  component: SettingsPage,
});

function SettingsPage() {
  const clinic = useStore((s) => s.clinic);
  return (
    <>
      <Topbar title="Configuración" subtitle="Datos de tu clínica y preferencias" action={<div />} />
      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Datos de la clínica">
          <BoundField label="Nombre" value={clinic.name} onChange={(v) => actions.updateClinic({ name: v })} />
          <BoundField label="CIF" value={clinic.cif} onChange={(v) => actions.updateClinic({ cif: v })} />
          <BoundField label="Dirección" value={clinic.address} onChange={(v) => actions.updateClinic({ address: v })} />
          <div className="grid grid-cols-2 gap-3">
            <BoundField label="Teléfono" value={clinic.phone} onChange={(v) => actions.updateClinic({ phone: v })} />
            <BoundField label="Correo" value={clinic.email} onChange={(v) => actions.updateClinic({ email: v })} />
          </div>
        </Section>

        <Section title="Identidad visual">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-2xl bg-gradient-primary flex items-center justify-center text-primary-foreground font-display font-bold text-xl shadow-elegant">{clinic.logoInitials}</div>
            <button className="h-10 px-4 rounded-xl border border-input text-sm font-medium hover:bg-accent">Subir logo</button>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2">Color principal</div>
            <div className="flex gap-2">
              {["#3b82f6", "#6ba3c8", "#7d9b76", "#0c2340", "#e85d3a"].map((c) => (
                <button key={c} onClick={() => actions.updateClinic({ primaryColor: c })} className={`size-9 rounded-xl border-2 ${clinic.primaryColor === c ? "border-foreground" : "border-border"}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </Section>

        <Section title="Preferencias">
          <div className="grid grid-cols-2 gap-3">
            <BoundField label="IVA por defecto (%)" value={String(clinic.vat)} onChange={(v) => actions.updateClinic({ vat: parseFloat(v) || 0 })} />
            <BoundField label="Duración cita (min)" value={String(clinic.appointmentDuration)} onChange={(v) => actions.updateClinic({ appointmentDuration: parseInt(v) || 30 })} />
            <BoundField label="Serie facturas" value={clinic.invoiceSeries} onChange={(v) => actions.updateClinic({ invoiceSeries: v })} />
            <BoundField label="Serie presupuestos" value={clinic.budgetSeries} onChange={(v) => actions.updateClinic({ budgetSeries: v })} />
          </div>
          <BoundField label="Horario de clínica" value={clinic.schedule} onChange={(v) => actions.updateClinic({ schedule: v })} />
        </Section>

        <AudioSection />

        <Section title="Cuenta">
          <BoundField label="Dentista" value={clinic.dentistName} onChange={(v) => actions.updateClinic({ dentistName: v })} />
          <BoundField label="Email" value={clinic.dentistEmail} onChange={(v) => actions.updateClinic({ dentistEmail: v })} />
          <button className="h-10 px-4 rounded-xl bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/15 w-fit">Cerrar sesión</button>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-6 space-y-4">
      <h2 className="font-display font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function BoundField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
    </label>
  );
}

function AudioSection() {
  const clinic = useStore((s) => s.clinic);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [permission, setPermission] = useState<"idle" | "granted" | "denied">("idle");
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const loadDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === "audioinput"));
    } catch {}
  };

  useEffect(() => { loadDevices(); }, []);

  const stopTest = () => {
    setTesting(false); setLevel(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    ctxRef.current?.close(); ctxRef.current = null;
  };

  const startTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: clinic.micDeviceId && clinic.micDeviceId !== "default" ? { deviceId: { exact: clinic.micDeviceId } } : true,
      });
      setPermission("granted"); streamRef.current = stream;
      const ctx = new AudioContext(); ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0; for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * (clinic.micSensitivity / 50)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick(); setTesting(true);
      await loadDevices();
    } catch { setPermission("denied"); }
  };

  useEffect(() => () => stopTest(), []);

  return (
    <Section title="Audio e IA">
      <p className="text-xs text-muted-foreground -mt-2">Selecciona el micrófono que usarás para el dictado por voz.</p>

      <label className="block">
        <span className="text-xs text-muted-foreground">Micrófono</span>
        <select value={clinic.micDeviceId} onChange={(e) => actions.updateClinic({ micDeviceId: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
          <option value="default">Predeterminado del sistema</option>
          {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Micrófono (${d.deviceId.slice(0, 6)})`}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="text-xs text-muted-foreground flex items-center justify-between">Sensibilidad <span className="tabular-nums">{clinic.micSensitivity}%</span></span>
        <input type="range" min={10} max={100} value={clinic.micSensitivity} onChange={(e) => actions.updateClinic({ micSensitivity: parseInt(e.target.value) })} className="w-full mt-2 accent-[var(--primary)]" />
      </label>

      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Prueba de micrófono</div>
          {testing ? (
            <button onClick={stopTest} className="h-9 px-3 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium flex items-center gap-1.5"><MicOff className="size-3.5" /> Detener</button>
          ) : (
            <button onClick={startTest} className="h-9 px-3 rounded-lg bg-foreground text-background text-xs font-medium flex items-center gap-1.5"><Mic className="size-3.5" /> Probar</button>
          )}
        </div>
        <div className="h-3 rounded-full bg-accent overflow-hidden">
          <div className="h-full bg-gradient-primary transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
        </div>
        <div className="text-[11px] text-muted-foreground">
          {permission === "denied" && "Permiso denegado. Habilita el micrófono en el navegador."}
          {permission === "granted" && testing && "Habla ahora — debería moverse el indicador."}
          {!testing && permission !== "denied" && "Pulsa Probar para verificar el dispositivo."}
        </div>
      </div>
    </Section>
  );
}