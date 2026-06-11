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

export type DocStatus =
  | "pendiente"
  | "aceptado"
  | "pagado"
  | "cancelado"
  | "parcial";

export type DocType = "presupuesto" | "factura" | "recibo";

export type ClinicDocument = {
  id: string;
  type: DocType;
  number: string;
  patientId: string;
  patientName: string;
  date: string;
  items: TreatmentItem[];
  vat: number; // percent
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
  logoInitials: "CL",
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
      id: b.id,
      type: "presupuesto",
      number: b.number,
      patientId: b.patientId,
      patientName: b.patientName,
      date: b.date,
      items: b.items,
      vat: 21,
      status:
        b.status === "aceptado"
          ? "aceptado"
          : b.status === "rechazado"
          ? "cancelado"
          : "pendiente",
      source: "manual",
    });
  }
  for (const i of seedInvoices) {
    docs.push({
      id: i.id,
      type: "factura",
      number: i.number,
      patientId: i.patientId,
      patientName: i.patientName,
      date: i.date,
      items: [{ concept: "Tratamiento", qty: 1, price: i.total / 1.21 }],
      vat: 21,
      status:
        i.status === "pagada"
          ? "pagado"
          : i.status === "vencida"
          ? "pendiente"
          : "pendiente",
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

export const store = {
  get: () => state,
  isDemo: () => demoMode,
  getUserId: () => currentUserId,

  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  initUser: (userId: string) => {
    demoMode = false;
    currentUserId = userId;
    state = loadForUser(userId);
    listeners.forEach((l) => l());
  },

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

  exitDemo: () => {
    demoMode = false;
    state = emptyState();
    listeners.forEach((l) => l());
  },
};

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(state),
    () => selector(state),
  );
}

export function useDemo(): boolean {
  return useSyncExternalStore(
    store.subscribe,
    () => store.isDemo(),
    () => store.isDemo(),
  );
}

export const actions = {
  setClinicLocal(c: Partial<ClinicConfig>) {
    store.set((s) => ({ ...s, clinic: { ...s.clinic, ...c, configured: true } }));
  },
  updateClinic(c: Partial<ClinicConfig>) {
    store.set((s) => ({ ...s, clinic: { ...s.clinic, ...c } }));
  },
  nextNumber(type: DocType) {
    const prefix =
      type === "factura"
        ? state.clinic.invoiceSeries || "F-"
        : type === "presupuesto"
        ? state.clinic.budgetSeries || "PR-"
        : state.clinic.receiptSeries || "R-";
    const count =
      state.documents.filter((d) => d.type === type).length + 1;
    return prefix + String(count).padStart(4, "0");
  },
  createDocument(
    type: DocType,
    patientId: string,
    payload: Partial<ClinicDocument> = {},
  ): ClinicDocument {
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
    store.set((s) => ({
      ...s,
      documents: s.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  },
  deleteDocument(id: string) {
    store.set((s) => ({
      ...s,
      documents: s.documents.filter((d) => d.id !== id),
    }));
  },
  upsertAppointment(a: Appointment) {
    store.set((s) => {
      const exists = s.appointments.some((x) => x.id === a.id);
      return {
        ...s,
        appointments: exists
          ? s.appointments.map((x) => (x.id === a.id ? a : x))
          : [a, ...s.appointments],
      };
    });
  },
  deleteAppointment(id: string) {
    store.set((s) => ({
      ...s,
      appointments: s.appointments.filter((a) => a.id !== id),
    }));
  },
  setAppointmentStatus(id: string, status: Appointment["status"]) {
    store.set((s) => ({
      ...s,
      appointments: s.appointments.map((a) =>
        a.id === id ? { ...a, status } : a,
      ),
    }));
  },
};

export function computeTotals(d: Pick<ClinicDocument, "items" | "vat">) {
  const base = d.items.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = base * (d.vat / 100);
  return { base, tax, total: base + tax };
}