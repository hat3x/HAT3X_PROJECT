# ClinicFlow Pro — Landing + Demo + Auth Multi-tenant

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Landing con "Ver demo" (app con datos mock, sin registro) y "Empezar" (registro real con email/contraseña o Google → onboarding → dashboard propio). Cada clínica registrada es un usuario aislado; sus datos nunca se mezclan con los de otra.

**Architecture:**
- **Demo mode**: estado en memoria con seed data, sin auth, sin persistencia. Flag `demoMode` en el store.
- **Clínica real**: Supabase Auth (email/password + Google OAuth). Config de clínica en tabla `clinics` de Supabase con RLS. Datos operacionales (pacientes, citas, documentos) en localStorage con clave `clinicapp:{userId}:v2` — aislados por usuario. La migración a Supabase de datos operacionales es Fase 2.
- **Rutas protegidas**: `_app.tsx` verifica sesión Supabase en `beforeLoad`; si no hay sesión, redirige a `/auth`. Si hay sesión pero sin clínica configurada, redirige a `/onboarding`.

**Tech Stack:** React 19, TanStack Router, Supabase JS v2, Tailwind CSS 4, localStorage (scoped por userId).

---

## Prerequisitos manuales (hacer antes de ejecutar el plan)

> El desarrollador debe completar estos pasos en Supabase antes de ejecutar las tareas.

1. Crear proyecto en [supabase.com](https://supabase.com) → copiar `Project URL` y `anon public key`
2. En Supabase Dashboard → Authentication → Providers → habilitar **Google**
   - Crear OAuth App en [console.cloud.google.com](https://console.cloud.google.com) → copiar Client ID y Client Secret
   - Añadir URI de redirección: `https://<supabase-project>.supabase.co/auth/v1/callback`
3. Crear archivo `apps/ClinicFlow Pro/.env.local` con:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```

---

## File Map

| Acción | Archivo | Responsabilidad |
|--------|---------|----------------|
| Crear | `src/lib/supabase.ts` | Cliente Supabase + tipos de sesión |
| Crear | `supabase/migrations/001_clinics.sql` | Tabla `clinics` + RLS |
| Modificar | `src/lib/store.ts` | demoMode + store scoped por userId + sin seed para usuarios reales |
| Modificar | `src/routes/index.tsx` | Landing con "Ver demo" y "Empezar" |
| Crear | `src/components/demo-banner.tsx` | Banner "MODO DEMO" con salir/empezar |
| Crear | `src/routes/auth.tsx` | Layout pantalla de auth |
| Crear | `src/routes/auth/index.tsx` | Login + registro + Google en una pantalla |
| Crear | `src/routes/auth/callback.tsx` | Callback OAuth Google |
| Modificar | `src/routes/_app.tsx` | Guard async con sesión Supabase + DemoBanner |
| Modificar | `src/routes/_app/onboarding.tsx` | Guarda config en Supabase `clinics` + 2 pasos |
| Modificar | `src/components/app-sidebar.tsx` | Datos desde store/Supabase + logout |
| Crear | `apps/ClinicFlow Pro/.env.example` | Plantilla de variables de entorno |

---

## Task 1: Instalar Supabase y crear cliente

**Files:**
- Modify: `package.json` (via bun add)
- Create: `src/lib/supabase.ts`
- Create: `.env.example`

- [ ] **Paso 1: Instalar dependencia**

```bash
cd "apps/ClinicFlow Pro" && bun add @supabase/supabase-js
```

Esperado: `@supabase/supabase-js` aparece en `package.json` dependencies.

- [ ] **Paso 2: Crear `src/lib/supabase.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Tipo de la tabla clinics (refleja la BD)
export type ClinicRow = {
  id: string;
  user_id: string;
  name: string;
  cif: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_initials: string;
  primary_color: string;
  vat: number;
  appointment_duration: number;
  invoice_series: string;
  budget_series: string;
  receipt_series: string;
  schedule: string | null;
  dentist_name: string | null;
  dentist_email: string | null;
  mic_device_id: string;
  mic_sensitivity: number;
  created_at: string;
};
```

- [ ] **Paso 3: Crear `.env.example`**

```
# Supabase
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

- [ ] **Paso 4: Verificar que compila**

```bash
cd "apps/ClinicFlow Pro" && bun run typecheck 2>&1 | head -20
```

Esperado: sin errores relacionados con supabase.ts.

- [ ] **Paso 5: Commit**

```bash
git add "apps/ClinicFlow Pro/src/lib/supabase.ts" "apps/ClinicFlow Pro/.env.example" "apps/ClinicFlow Pro/package.json" "apps/ClinicFlow Pro/bun.lockb"
git commit -m "feat(clinicflow): add Supabase client + ClinicRow type"
```

---

## Task 2: Migración SQL — tabla clinics con RLS

**Files:**
- Create: `supabase/migrations/001_clinics.sql`

- [ ] **Paso 1: Crear carpeta y archivo de migración**

Crear `apps/ClinicFlow Pro/supabase/migrations/001_clinics.sql`:

```sql
-- Tabla clinics: una fila por usuario registrado
create table if not exists public.clinics (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  cif                 text,
  address             text,
  phone               text,
  email               text,
  logo_initials       text not null default 'CF',
  primary_color       text not null default '#3b82f6',
  vat                 numeric not null default 21,
  appointment_duration integer not null default 30,
  invoice_series      text not null default 'F-2026-',
  budget_series       text not null default 'PR-2026-',
  receipt_series      text not null default 'R-2026-',
  schedule            text,
  dentist_name        text,
  dentist_email       text,
  mic_device_id       text not null default 'default',
  mic_sensitivity     numeric not null default 70,
  created_at          timestamptz not null default now(),

  constraint clinics_user_id_unique unique (user_id)
);

-- Row Level Security: cada usuario solo ve y modifica su propia clínica
alter table public.clinics enable row level security;

create policy "Clinic owner full access"
  on public.clinics
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Paso 2: Ejecutar la migración en Supabase**

En el Supabase Dashboard → SQL Editor, pegar y ejecutar el contenido de `001_clinics.sql`.

Verificar: la tabla `clinics` aparece en Table Editor con las columnas correctas y RLS activo.

- [ ] **Paso 3: Commit**

```bash
git add "apps/ClinicFlow Pro/supabase/migrations/001_clinics.sql"
git commit -m "feat(clinicflow): SQL migration — clinics table with RLS"
```

---

## Task 3: Actualizar el store — demoMode + scoped por userId

**Files:**
- Modify: `src/lib/store.ts`

El store necesita tres cambios:
1. En demo: usa seed data en memoria, no persiste.
2. Para usuarios reales: clave de localStorage con `userId`, empieza vacío (sin seed).
3. `initUser(userId)` para activar el store del usuario tras el login.

- [ ] **Paso 1: Reemplazar `src/lib/store.ts` completo**

```typescript
import { useSyncExternalStore } from "react";
import {
  patients as seedPatients,
  appointments as seedAppointments,
  budgets as seedBudgets,
  invoices as seedInvoices,
  consents as seedConsents,
  payments as seedPayments,
  type Patient,
  type Appointment,
  type Consent,
  type Payment,
  type TreatmentItem,
} from "./mock-data";

export type ClinicConfig = {
  configured: boolean;
  name: string;
  cif: string;
  address: string;
  phone: string;
  email: string;
  logoInitials: string;
  primaryColor: string;
  vat: number;
  appointmentDuration: number;
  invoiceSeries: string;
  budgetSeries: string;
  receiptSeries: string;
  schedule: string;
  dentistName: string;
  dentistEmail: string;
  micDeviceId: string;
  micSensitivity: number;
};

export type DocStatus = "pendiente" | "aceptado" | "pagado" | "cancelado" | "parcial";
export type DocType = "presupuesto" | "factura" | "recibo";

export type ClinicDocument = {
  id: string;
  type: DocType;
  number: string;
  patientId: string;
  patientName: string;
  date: string;
  items: TreatmentItem[];
  vat: number;
  notes?: string;
  status: DocStatus;
  nextReview?: string;
  source?: "manual" | "ia";
  transcript?: string;
};

type State = {
  clinic: ClinicConfig;
  patients: Patient[];
  appointments: Appointment[];
  documents: ClinicDocument[];
  consents: Consent[];
  payments: Payment[];
};

const defaultClinic: ClinicConfig = {
  configured: false,
  name: "",
  cif: "",
  address: "",
  phone: "",
  email: "",
  logoInitials: "CF",
  primaryColor: "#3b82f6",
  vat: 21,
  appointmentDuration: 30,
  invoiceSeries: "F-2026-",
  budgetSeries: "PR-2026-",
  receiptSeries: "R-2026-",
  schedule: "L-V · 09:00 — 20:00",
  dentistName: "",
  dentistEmail: "",
  micDeviceId: "default",
  micSensitivity: 70,
};

const emptyState = (): State => ({
  clinic: defaultClinic,
  patients: [],
  appointments: [],
  documents: [],
  consents: [],
  payments: [],
});

function migrateSeed(): ClinicDocument[] {
  const docs: ClinicDocument[] = [];
  for (const b of seedBudgets) {
    docs.push({
      id: b.id, type: "presupuesto", number: b.number,
      patientId: b.patientId, patientName: b.patientName, date: b.date,
      items: b.items, vat: 21,
      status: b.status === "aceptado" ? "aceptado" : b.status === "rechazado" ? "cancelado" : "pendiente",
      source: "manual",
    });
  }
  for (const i of seedInvoices) {
    docs.push({
      id: i.id, type: "factura", number: i.number,
      patientId: i.patientId, patientName: i.patientName, date: i.date,
      items: [{ concept: "Tratamiento", qty: 1, price: i.total / 1.21 }],
      vat: 21, status: i.status === "pagada" ? "pagado" : "pendiente",
      source: "manual",
    });
  }
  return docs;
}

// ── Estado interno del módulo ──────────────────────────────────────────────
let demoMode = false;
let currentUserId: string | null = null;
let state: State = emptyState();
const listeners = new Set<() => void>();

function storeKey(userId: string) {
  return `clinicapp:${userId}:v2`;
}

function loadForUser(userId: string): State {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = localStorage.getItem(storeKey(userId));
    if (raw) return JSON.parse(raw) as State;
  } catch {}
  return emptyState();
}

function persist() {
  if (demoMode || !currentUserId) return;
  try {
    localStorage.setItem(storeKey(currentUserId), JSON.stringify(state));
  } catch {}
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

// ── Store público ──────────────────────────────────────────────────────────
export const store = {
  get: () => state,
  isDemo: () => demoMode,
  getUserId: () => currentUserId,

  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /** Llamar tras login exitoso para cargar los datos del usuario */
  initUser: (userId: string) => {
    demoMode = false;
    currentUserId = userId;
    state = loadForUser(userId);
    listeners.forEach((l) => l());
  },

  /** Llamar al hacer logout */
  clearUser: () => {
    demoMode = false;
    currentUserId = null;
    state = emptyState();
    listeners.forEach((l) => l());
  },

  set: (updater: (s: State) => State) => {
    state = updater(state);
    emit();
  },

  /** Entra en modo demo: datos mock en memoria, sin persistencia */
  enterDemo: () => {
    demoMode = true;
    currentUserId = null;
    state = {
      clinic: {
        ...defaultClinic,
        configured: true,
        name: "Clínica Demo",
        logoInitials: "CD",
        dentistName: "Dra. Pérez",
        dentistEmail: "demo@clinicflow.es",
      },
      patients: seedPatients,
      appointments: seedAppointments,
      documents: migrateSeed(),
      consents: seedConsents,
      payments: seedPayments,
    };
    listeners.forEach((l) => l());
  },

  /** Sale del modo demo */
  exitDemo: () => {
    demoMode = false;
    state = emptyState();
    listeners.forEach((l) => l());
  },
};

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(state), () => selector(state));
}

export function useDemo(): boolean {
  return useSyncExternalStore(store.subscribe, () => store.isDemo(), () => store.isDemo());
}

// ── Actions ────────────────────────────────────────────────────────────────
export const actions = {
  /** Solo actualiza el store local. La config de Supabase se guarda en onboarding. */
  setClinicLocal(c: Partial<ClinicConfig>) {
    store.set((s) => ({ ...s, clinic: { ...s.clinic, ...c, configured: true } }));
  },
  updateClinic(c: Partial<ClinicConfig>) {
    store.set((s) => ({ ...s, clinic: { ...s.clinic, ...c } }));
  },
  nextNumber(type: DocType) {
    const prefix =
      type === "factura" ? state.clinic.invoiceSeries || "F-" :
      type === "presupuesto" ? state.clinic.budgetSeries || "PR-" :
      state.clinic.receiptSeries || "R-";
    const count = state.documents.filter((d) => d.type === type).length + 1;
    return prefix + String(count).padStart(4, "0");
  },
  createDocument(type: DocType, patientId: string, payload: Partial<ClinicDocument> = {}): ClinicDocument {
    const patient = state.patients.find((p) => p.id === patientId);
    const doc: ClinicDocument = {
      id: "d_" + Math.random().toString(36).slice(2, 10),
      type,
      number: actions.nextNumber(type),
      patientId,
      patientName: patient?.name || "—",
      date: new Date().toISOString().slice(0, 10),
      items: payload.items ?? [{ concept: "", qty: 1, price: 0 }],
      vat: payload.vat ?? state.clinic.vat,
      status: payload.status ?? "pendiente",
      notes: payload.notes,
      nextReview: payload.nextReview,
      source: payload.source ?? "manual",
      transcript: payload.transcript,
    };
    store.set((s) => ({ ...s, documents: [doc, ...s.documents] }));
    return doc;
  },
  updateDocument(id: string, patch: Partial<ClinicDocument>) {
    store.set((s) => ({ ...s, documents: s.documents.map((d) => d.id === id ? { ...d, ...patch } : d) }));
  },
  deleteDocument(id: string) {
    store.set((s) => ({ ...s, documents: s.documents.filter((d) => d.id !== id) }));
  },
  upsertAppointment(a: Appointment) {
    store.set((s) => {
      const exists = s.appointments.some((x) => x.id === a.id);
      return { ...s, appointments: exists ? s.appointments.map((x) => x.id === a.id ? a : x) : [a, ...s.appointments] };
    });
  },
  deleteAppointment(id: string) {
    store.set((s) => ({ ...s, appointments: s.appointments.filter((a) => a.id !== id) }));
  },
  setAppointmentStatus(id: string, status: Appointment["status"]) {
    store.set((s) => ({ ...s, appointments: s.appointments.map((a) => a.id === id ? { ...a, status } : a) }));
  },
};

export function computeTotals(d: Pick<ClinicDocument, "items" | "vat">) {
  const base = d.items.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = base * (d.vat / 100);
  return { base, tax, total: base + tax };
}
```

- [ ] **Paso 2: Verificar compilación**

```bash
cd "apps/ClinicFlow Pro" && bun run typecheck 2>&1 | head -30
```

Esperado: sin errores en store.ts. Si hay errores de tipos con mock-data, ajustar los imports.

- [ ] **Paso 3: Commit**

```bash
git add "apps/ClinicFlow Pro/src/lib/store.ts"
git commit -m "feat(clinicflow): store scoped by userId + demoMode + no seed for real users"
```

---

## Task 4: Pantalla de autenticación (login + registro + Google)

**Files:**
- Create: `src/routes/auth.tsx`
- Create: `src/routes/auth/index.tsx`

Una sola pantalla con toggle Login / Registro. Google OAuth siempre visible.

- [ ] **Paso 1: Crear layout `src/routes/auth.tsx`**

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    // Si ya tiene sesión activa, ir al dashboard
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: () => <Outlet />,
});
```

- [ ] **Paso 2: Crear `src/routes/auth/index.tsx`**

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Sparkles, ArrowRight, Mail, Lock, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth/")({
  component: AuthScreen,
});

type Mode = "login" | "register";

function AuthScreen() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === "register") {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setSuccess("Revisa tu correo para confirmar la cuenta. Luego inicia sesión.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate({ to: "/dashboard" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(translateError(msg));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) setError(translateError(err.message));
  };

  return (
    <div className="min-h-screen bg-gradient-soft flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="size-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant">
            <Sparkles className="size-5 text-primary-foreground" />
          </div>
          <span className="font-display font-semibold text-lg">ClinicFlow Pro</span>
        </div>

        <div className="rounded-3xl bg-card border border-border shadow-elegant p-7">
          {/* Toggle modo */}
          <div className="flex rounded-xl bg-muted p-1 mb-6">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setSuccess(null); }}
                className={[
                  "flex-1 h-8 rounded-lg text-sm font-medium transition-all",
                  mode === m ? "bg-card shadow-soft text-foreground" : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {m === "login" ? "Iniciar sesión" : "Crear cuenta"}
              </button>
            ))}
          </div>

          <h1 className="font-display font-semibold text-xl tracking-tight">
            {mode === "login" ? "Bienvenido de nuevo" : "Empieza con tu clínica"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            {mode === "login"
              ? "Accede a tu panel de gestión."
              : "Crea tu cuenta y configura tu clínica en 2 minutos."}
          </p>

          {/* Google */}
          <button
            onClick={handleGoogle}
            className="w-full h-11 rounded-xl border border-border bg-card flex items-center justify-center gap-2.5 text-sm font-medium hover:bg-muted/50 transition-colors mb-4"
          >
            <GoogleIcon />
            Continuar con Google
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">o con email</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Correo electrónico</span>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  required type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hola@miclinica.es"
                  className="input pl-9"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-xs text-muted-foreground">Contraseña</span>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  required type={showPwd ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "Mínimo 8 caracteres" : "Tu contraseña"}
                  minLength={mode === "register" ? 8 : undefined}
                  className="input pl-9 pr-10"
                />
                <button
                  type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            {error && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg bg-green-500/10 text-green-700 text-xs p-3">
                {success}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full h-11 rounded-xl bg-gradient-primary text-primary-foreground font-semibold text-sm shadow-elegant flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60 transition-opacity"
            >
              {loading ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
              {!loading && <ArrowRight className="size-4" />}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Al registrarte aceptas los{" "}
          <a href="#" className="underline hover:text-foreground">Términos de servicio</a>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "Email o contraseña incorrectos.";
  if (msg.includes("Email not confirmed")) return "Confirma tu email antes de iniciar sesión.";
  if (msg.includes("User already registered")) return "Este email ya tiene una cuenta. Inicia sesión.";
  if (msg.includes("Password should be")) return "La contraseña debe tener al menos 8 caracteres.";
  return msg;
}
```

- [ ] **Paso 3: Commit**

```bash
git add "apps/ClinicFlow Pro/src/routes/auth.tsx" "apps/ClinicFlow Pro/src/routes/auth/index.tsx"
git commit -m "feat(clinicflow): auth screen — login + register + Google OAuth"
```

---

## Task 5: Callback OAuth de Google

**Files:**
- Create: `src/routes/auth/callback.tsx`

- [ ] **Paso 1: Crear `src/routes/auth/callback.tsx`**

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { store } from "@/lib/store";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        store.initUser(data.session.user.id);
        navigate({ to: "/dashboard" });
      } else {
        navigate({ to: "/auth/" });
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-soft flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <div className="size-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant animate-pulse">
          <Sparkles className="size-6 text-primary-foreground" />
        </div>
        <p className="text-sm">Verificando sesión…</p>
      </div>
    </div>
  );
}
```

- [ ] **Paso 2: Commit**

```bash
git add "apps/ClinicFlow Pro/src/routes/auth/callback.tsx"
git commit -m "feat(clinicflow): OAuth callback route — exchanges code for session"
```

---

## Task 6: Actualizar guards de rutas protegidas

**Files:**
- Modify: `src/routes/_app.tsx`

La guardia `beforeLoad` ahora debe:
1. Si demoMode → pasar
2. Si no hay sesión Supabase → redirect a `/auth/`
3. Si hay sesión pero clínica no configurada → redirect a `/onboarding`
4. Si hay sesión → inicializar el store con el userId

- [ ] **Paso 1: Reemplazar `src/routes/_app.tsx`**

```tsx
import { createFileRoute, Outlet, Link, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { DemoBanner } from "@/components/demo-banner";
import { supabase } from "@/lib/supabase";
import { store } from "@/lib/store";
import {
  LayoutDashboard, Users, Calendar, FileText, Wallet, Settings,
} from "lucide-react";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;

    // Demo mode: pasa siempre
    if (store.isDemo()) return;

    // Onboarding: solo requiere sesión, no clínica configurada
    const isOnboarding = location.pathname === "/onboarding";

    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth/" });

    // Inicializar store con el usuario actual si no está ya inicializado
    if (store.getUserId() !== data.session.user.id) {
      store.initUser(data.session.user.id);
    }

    // Si la clínica no está configurada y no estamos en onboarding → onboarding
    if (!isOnboarding && !store.get().clinic.configured) {
      throw redirect({ to: "/onboarding" });
    }
  },
  component: AppLayout,
});

const mobileNav = [
  { url: "/dashboard", icon: LayoutDashboard, label: "Inicio" },
  { url: "/pacientes", icon: Users, label: "Pacientes" },
  { url: "/calendario", icon: Calendar, label: "Citas" },
  { url: "/presupuestos", icon: FileText, label: "Docs" },
  { url: "/configuracion", icon: Settings, label: "Ajustes" },
];

function AppLayout() {
  return (
    <div className="min-h-screen bg-gradient-soft flex flex-col">
      <DemoBanner />
      <div className="flex flex-1 min-h-0">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 p-5 md:p-8 pb-24 md:pb-8 max-w-[1400px] w-full mx-auto">
            <Outlet />
          </div>
          <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border flex justify-around py-2 z-30">
            {mobileNav.map((item) => (
              <Link
                key={item.url}
                to={item.url}
                className="flex flex-col items-center gap-1 p-2 text-[10px] text-muted-foreground [&.active]:text-primary"
                activeProps={{ className: "active" }}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Paso 2: Commit**

```bash
git add "apps/ClinicFlow Pro/src/routes/_app.tsx"
git commit -m "feat(clinicflow): async session guard + store.initUser on auth"
```

---

## Task 7: Landing rediseñada

**Files:**
- Modify: `src/routes/index.tsx`

- [ ] **Paso 1: Reemplazar `src/routes/index.tsx`**

```tsx
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
    navigate({ to: "/auth/" });
  };

  return (
    <div className="min-h-screen bg-gradient-soft flex flex-col">
      {/* Header */}
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

      {/* Hero */}
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

          {/* CTAs */}
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

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-5 mt-24">
          <Feature
            icon={<Mic className="size-5" />}
            title="Dictado mágico con IA"
            desc="Habla con naturalidad. La IA transcribe, genera el presupuesto y programa la próxima revisión automáticamente."
          />
          <Feature
            icon={<CalendarCheck className="size-5" />}
            title="Agenda inteligente"
            desc="Calendario con 4 vistas, estados de cita en tiempo real y gestión de huecos sin esfuerzo."
          />
          <Feature
            icon={<ShieldCheck className="size-5" />}
            title="Consentimientos digitales"
            desc="Plantillas listas para firmar desde cualquier dispositivo, vinculadas automáticamente al paciente."
          />
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            Diseñado para clínicas dentales que quieren dejar de perder tiempo con el papeleo
          </p>
        </div>
      </main>

      {/* Footer */}
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
```

- [ ] **Paso 2: Commit**

```bash
git add "apps/ClinicFlow Pro/src/routes/index.tsx"
git commit -m "feat(clinicflow): landing with Empezar (auth) + Ver demo interactiva"
```

---

## Task 8: DemoBanner

**Files:**
- Create: `src/components/demo-banner.tsx`

- [ ] **Paso 1: Crear `src/components/demo-banner.tsx`**

```tsx
import { useNavigate } from "@tanstack/react-router";
import { FlaskConical, X, ArrowRight } from "lucide-react";
import { store, useDemo } from "@/lib/store";

export function DemoBanner() {
  const isDemo = useDemo();
  const navigate = useNavigate();

  if (!isDemo) return null;

  const handleExit = () => {
    store.exitDemo();
    navigate({ to: "/" });
  };

  const handleStart = () => {
    store.exitDemo();
    navigate({ to: "/auth/" });
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between gap-4 text-sm font-medium shadow-md">
      <div className="flex items-center gap-2 min-w-0">
        <FlaskConical className="size-4 shrink-0" />
        <span className="truncate">
          <span className="font-semibold">Modo demo</span>
          <span className="hidden sm:inline text-amber-100">
            {" "}· Estás viendo datos de ejemplo. Nada de lo que hagas aquí se guardará.
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleStart}
          className="h-7 px-3 rounded-lg bg-white text-amber-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-amber-50 transition-colors"
        >
          Empezar <ArrowRight className="size-3" />
        </button>
        <button
          onClick={handleExit}
          aria-label="Salir del modo demo"
          className="size-7 rounded-lg flex items-center justify-center hover:bg-amber-600 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Paso 2: Commit**

```bash
git add "apps/ClinicFlow Pro/src/components/demo-banner.tsx"
git commit -m "feat(clinicflow): DemoBanner with exit demo + go to auth"
```

---

## Task 9: Onboarding guarda clínica en Supabase

**Files:**
- Modify: `src/routes/_app/onboarding.tsx`

Tras el registro, el usuario llega aquí. El onboarding guarda la config en la tabla `clinics` de Supabase y también inicializa el store local.

- [ ] **Paso 1: Reemplazar `src/routes/_app/onboarding.tsx`**

```tsx
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

      // Inicializar store local con los datos de la clínica
      actions.setClinicLocal({
        name: clinica.name,
        cif: clinica.cif,
        address: clinica.address,
        phone: clinica.phone,
        email: clinica.email,
        logoInitials: clinica.logoInitials,
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
                  <F label="CIF"><input placeholder="B12345678" value={clinica.cif}
                    onChange={(e) => setClinica({ ...clinica, cif: e.target.value })} className="input" /></F>
                  <F label="Iniciales logo"><input maxLength={3} placeholder="CS" value={clinica.logoInitials}
                    onChange={(e) => setClinica({ ...clinica, logoInitials: e.target.value.toUpperCase() })}
                    className="input uppercase" /></F>
                </div>
                <F label="Dirección"><input placeholder="Calle Mayor 23, Madrid" value={clinica.address}
                  onChange={(e) => setClinica({ ...clinica, address: e.target.value })} className="input" /></F>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Teléfono"><input placeholder="+34 912 345 678" value={clinica.phone}
                    onChange={(e) => setClinica({ ...clinica, phone: e.target.value })} className="input" /></F>
                  <F label="Correo electrónico"><input type="email" placeholder="hola@miclinica.es" value={clinica.email}
                    onChange={(e) => setClinica({ ...clinica, email: e.target.value })} className="input" /></F>
                </div>
                <F label="IVA por defecto (%)"><input type="number" min={0} max={100} value={clinica.vat}
                  onChange={(e) => setClinica({ ...clinica, vat: parseFloat(e.target.value) || 0 })}
                  className="input" /></F>
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
                {error && <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3">{error}</div>}
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

function StepDot({ active, done, label, icon }: { active: boolean; done: boolean; label: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={["size-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
        done ? "bg-green-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      ].join(" ")}>{icon}</div>
      <span className={["text-[10px]", active ? "text-foreground font-medium" : "text-muted-foreground"].join(" ")}>{label}</span>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}
```

- [ ] **Paso 2: Commit**

```bash
git add "apps/ClinicFlow Pro/src/routes/_app/onboarding.tsx"
git commit -m "feat(clinicflow): onboarding saves clinic to Supabase + 2-step flow"
```

---

## Task 10: Sidebar con datos reales + logout

**Files:**
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Paso 1: Reemplazar `src/components/app-sidebar.tsx`**

```tsx
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Calendar, FileText, Receipt,
  ClipboardSignature, Wallet, Settings, Sparkles, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore, useDemo, store } from "@/lib/store";
import { supabase } from "@/lib/supabase";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Pacientes", url: "/pacientes", icon: Users },
  { title: "Calendario", url: "/calendario", icon: Calendar },
  { title: "Presupuestos", url: "/presupuestos", icon: FileText },
  { title: "Facturas", url: "/facturas", icon: Receipt },
  { title: "Consentimientos", url: "/consentimientos", icon: ClipboardSignature },
  { title: "Pagos", url: "/pagos", icon: Wallet },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const isActive = (u: string) => path === u || path.startsWith(u + "/");
  const clinic = useStore((s) => s.clinic);
  const isDemo = useDemo();

  const dentistInitials = (clinic.dentistName || "CF")
    .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    store.clearUser();
    navigate({ to: "/" });
  };

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="px-5 py-5 flex items-center gap-2.5">
        <div className="size-9 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant shrink-0">
          <Sparkles className="size-4 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="font-display font-semibold text-sidebar-foreground tracking-tight truncate">
              {clinic.name || "ClinicFlow Pro"}
            </div>
            {isDemo && (
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider bg-amber-500 text-white px-1.5 py-0.5 rounded-md">
                Demo
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">ClinicFlow Pro</div>
        </div>
      </div>

      <nav className="px-3 mt-2 flex-1 flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isActive(item.url);
          return (
            <Link key={item.url} to={item.url}
              className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className={cn("size-[18px]", active && "text-primary")} />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <Link to="/configuracion"
          className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            isActive("/configuracion") ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
          )}
        >
          <Settings className="size-[18px]" />
          Configuración
        </Link>

        <div className="mt-2 flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="size-8 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
            {dentistInitials}
          </div>
          <div className="text-xs min-w-0 flex-1">
            <div className="font-medium text-sidebar-foreground truncate">{clinic.dentistName || "Usuario"}</div>
            <div className="text-muted-foreground">Odontólogo/a</div>
          </div>
          {!isDemo && (
            <button onClick={handleLogout} title="Cerrar sesión"
              className="shrink-0 size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Paso 2: Commit**

```bash
git add "apps/ClinicFlow Pro/src/components/app-sidebar.tsx"
git commit -m "feat(clinicflow): sidebar — real clinic data + logout button"
```

---

## Task 11: Verificación end-to-end

- [ ] **Paso 1: Arrancar dev server**

```bash
cd "apps/ClinicFlow Pro" && bun run dev
```

Esperado: servidor en `http://localhost:3000` sin errores de consola.

- [ ] **Paso 2: Flujo Demo**

- ✅ Landing muestra "Empezar" y "Ver demo interactiva"
- ✅ Click "Ver demo" → dashboard con datos mock + banner amarillo + badge "Demo" en sidebar
- ✅ Navegar por pacientes, calendario, facturas — datos visibles
- ✅ Click X en banner → vuelve a `/`
- ✅ Click "Empezar" en banner → va a `/auth/`
- ✅ Refrescar en demo → vuelve a `/` (no persiste)

- [ ] **Paso 3: Flujo Registro email**

- ✅ Click "Empezar" en landing → `/auth/` con toggle login/registro
- ✅ Toggle "Crear cuenta" → form aparece
- ✅ Registrar email + contraseña ≥ 8 chars → mensaje "Revisa tu correo"
- ✅ Confirmar email en bandeja → volver a la app
- ✅ Login con esas credenciales → redirige a `/onboarding` (clínica nueva)
- ✅ Completar onboarding paso 1 (clínica) → paso 2 (dentista)
- ✅ Guardar → llega al dashboard con nombre de clínica real en sidebar, sin banner
- ✅ Recargar → sigue en dashboard (sesión Supabase activa + localStorage)

- [ ] **Paso 4: Flujo Google OAuth**

- ✅ Click "Continuar con Google" → redirect a Google
- ✅ Autorizar → callback `/auth/callback` → redirige a `/onboarding` o `/dashboard`

- [ ] **Paso 5: Logout**

- ✅ Click icono logout (flecha) en sidebar → vuelve a `/`, sin datos en store
- ✅ Intentar ir a `/dashboard` → redirige a `/auth/`

- [ ] **Paso 6: Aislamiento multi-clínica**

- ✅ Registrar segundo usuario con otro email → su localStorage es `clinicapp:{userId2}:v2`
- ✅ Los datos de la primera clínica no son visibles para la segunda

- [ ] **Paso 7: Commit final**

```bash
git add -A
git commit -m "feat(clinicflow): landing + demo + auth complete — multi-tenant ready"
```

---

## Resumen de archivos

| Archivo | Cambio |
|---------|--------|
| `src/lib/supabase.ts` | **Nuevo** — cliente Supabase + tipo `ClinicRow` |
| `supabase/migrations/001_clinics.sql` | **Nuevo** — tabla `clinics` + RLS |
| `src/lib/store.ts` | demoMode + scoped por userId + `initUser` / `clearUser` + sin seed para reales |
| `src/routes/index.tsx` | Landing con "Empezar" (→ auth) + "Ver demo" |
| `src/components/demo-banner.tsx` | **Nuevo** — banner modo demo |
| `src/routes/auth.tsx` | **Nuevo** — layout auth con guard de sesión |
| `src/routes/auth/index.tsx` | **Nuevo** — login + registro + Google |
| `src/routes/auth/callback.tsx` | **Nuevo** — callback OAuth |
| `src/routes/_app.tsx` | Guard async con sesión Supabase + DemoBanner |
| `src/routes/_app/onboarding.tsx` | Guarda en Supabase + 2 pasos + exit demo |
| `src/components/app-sidebar.tsx` | Datos reales + badge DEMO + botón logout |
| `.env.example` | **Nuevo** — plantilla vars de entorno |
