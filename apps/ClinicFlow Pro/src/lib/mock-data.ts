export type AppointmentStatus = "confirmada" | "pendiente" | "cancelada" | "completada" | "reagendada";

export type Patient = {
  id: string;
  name: string;
  phone: string;
  email: string;
  dni: string;
  birthDate: string;
  address: string;
  notes?: string;
  lastVisit?: string;
  nextReview?: string;
  alerts?: string[];
};

export type Appointment = {
  id: string;
  patientId: string;
  patientName: string;
  treatment: string;
  dentist: string;
  date: string; // ISO
  duration: number; // minutes
  status: AppointmentStatus;
};

export type TreatmentItem = {
  concept: string;
  qty: number;
  price: number;
};

export type Budget = {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  date: string;
  items: TreatmentItem[];
  status: "borrador" | "enviado" | "aceptado" | "rechazado";
  total: number;
};

export type Invoice = {
  id: string;
  number: string;
  patientId: string;
  patientName: string;
  date: string;
  total: number;
  status: "pagada" | "pendiente" | "vencida";
};

export type Consent = {
  id: string;
  patientId: string;
  patientName: string;
  template: string;
  signedAt: string | null;
};

export type Payment = {
  id: string;
  patientId: string;
  patientName: string;
  amount: number;
  method: "Efectivo" | "Tarjeta" | "Transferencia" | "Bizum";
  date: string;
  status: "completado" | "pendiente";
};

export const patients: Patient[] = [
  {
    id: "p1",
    name: "María García López",
    phone: "+34 612 345 678",
    email: "maria.garcia@email.com",
    dni: "12345678A",
    birthDate: "1985-03-12",
    address: "Calle Mayor 23, Madrid",
    notes: "Alergia a la penicilina.",
    lastVisit: "2026-05-12",
    nextReview: "2026-06-15",
    alerts: ["Revisión próxima"],
  },
  {
    id: "p2",
    name: "Carlos Martínez Ruiz",
    phone: "+34 698 112 334",
    email: "carlos.mr@email.com",
    dni: "87654321B",
    birthDate: "1978-11-02",
    address: "Avda. del Sol 8, Valencia",
    lastVisit: "2026-04-21",
    nextReview: "2026-10-21",
  },
  {
    id: "p3",
    name: "Lucía Fernández Pino",
    phone: "+34 644 998 221",
    email: "lucia.fp@email.com",
    dni: "11223344C",
    birthDate: "1992-07-19",
    address: "Plaza Nueva 1, Sevilla",
    lastVisit: "2026-05-29",
    nextReview: "2026-11-29",
    alerts: ["Presupuesto sin aceptar"],
  },
  {
    id: "p4",
    name: "Javier Romero Soto",
    phone: "+34 677 554 110",
    email: "javier.rs@email.com",
    dni: "55667788D",
    birthDate: "1965-01-30",
    address: "Calle Luna 14, Bilbao",
    lastVisit: "2025-11-04",
    alerts: ["Tratamiento incompleto", "No vuelve hace 6 meses"],
  },
  {
    id: "p5",
    name: "Ana Torres Vidal",
    phone: "+34 633 221 099",
    email: "ana.tv@email.com",
    dni: "99887766E",
    birthDate: "2001-09-08",
    address: "Gran Vía 56, Madrid",
    lastVisit: "2026-05-30",
    nextReview: "2026-08-30",
  },
];

const today = new Date();
const iso = (d: Date) => d.toISOString();
const at = (h: number, m = 0, offsetDays = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, m, 0, 0);
  return iso(d);
};

export const appointments: Appointment[] = [
  { id: "a1", patientId: "p1", patientName: "María García López", treatment: "Limpieza dental", dentist: "Dra. Pérez", date: at(9, 0), duration: 30, status: "confirmada" },
  { id: "a2", patientId: "p2", patientName: "Carlos Martínez Ruiz", treatment: "Revisión", dentist: "Dr. López", date: at(10, 0), duration: 20, status: "confirmada" },
  { id: "a3", patientId: "p3", patientName: "Lucía Fernández Pino", treatment: "Empaste molar", dentist: "Dra. Pérez", date: at(11, 30), duration: 45, status: "pendiente" },
  { id: "a4", patientId: "p5", patientName: "Ana Torres Vidal", treatment: "Ortodoncia control", dentist: "Dr. Ramos", date: at(13, 0), duration: 30, status: "completada" },
  { id: "a5", patientId: "p4", patientName: "Javier Romero Soto", treatment: "Endodoncia", dentist: "Dra. Pérez", date: at(16, 0), duration: 60, status: "confirmada" },
  { id: "a6", patientId: "p2", patientName: "Carlos Martínez Ruiz", treatment: "Reconstrucción", dentist: "Dr. López", date: at(9, 30, 1), duration: 45, status: "confirmada" },
  { id: "a7", patientId: "p1", patientName: "María García López", treatment: "Blanqueamiento", dentist: "Dra. Pérez", date: at(12, 0, 1), duration: 60, status: "pendiente" },
];

export const budgets: Budget[] = [
  {
    id: "b1", number: "PR-2026-0142", patientId: "p1", patientName: "María García López", date: "2026-05-28",
    items: [{ concept: "Limpieza dental", qty: 1, price: 60 }, { concept: "Blanqueamiento", qty: 1, price: 220 }],
    status: "aceptado", total: 280,
  },
  {
    id: "b2", number: "PR-2026-0143", patientId: "p3", patientName: "Lucía Fernández Pino", date: "2026-05-29",
    items: [{ concept: "Empaste molar", qty: 2, price: 75 }], status: "enviado", total: 150,
  },
  {
    id: "b3", number: "PR-2026-0144", patientId: "p4", patientName: "Javier Romero Soto", date: "2026-05-30",
    items: [{ concept: "Endodoncia", qty: 1, price: 320 }, { concept: "Corona", qty: 1, price: 480 }],
    status: "borrador", total: 800,
  },
];

export const invoices: Invoice[] = [
  { id: "i1", number: "F-2026-0231", patientId: "p1", patientName: "María García López", date: "2026-05-12", total: 60, status: "pagada" },
  { id: "i2", number: "F-2026-0232", patientId: "p2", patientName: "Carlos Martínez Ruiz", date: "2026-05-15", total: 180, status: "pagada" },
  { id: "i3", number: "F-2026-0233", patientId: "p5", patientName: "Ana Torres Vidal", date: "2026-05-22", total: 90, status: "pendiente" },
  { id: "i4", number: "F-2026-0234", patientId: "p3", patientName: "Lucía Fernández Pino", date: "2026-04-30", total: 150, status: "vencida" },
];

export const consents: Consent[] = [
  { id: "c1", patientId: "p1", patientName: "María García López", template: "Blanqueamiento dental", signedAt: "2026-05-28" },
  { id: "c2", patientId: "p3", patientName: "Lucía Fernández Pino", template: "Empaste con composite", signedAt: null },
  { id: "c3", patientId: "p4", patientName: "Javier Romero Soto", template: "Endodoncia", signedAt: "2025-11-04" },
];

export const payments: Payment[] = [
  { id: "pay1", patientId: "p1", patientName: "María García López", amount: 60, method: "Tarjeta", date: "2026-05-12", status: "completado" },
  { id: "pay2", patientId: "p2", patientName: "Carlos Martínez Ruiz", amount: 180, method: "Bizum", date: "2026-05-15", status: "completado" },
  { id: "pay3", patientId: "p5", patientName: "Ana Torres Vidal", amount: 90, method: "Efectivo", date: "2026-05-22", status: "pendiente" },
  { id: "pay4", patientId: "p3", patientName: "Lucía Fernández Pino", amount: 150, method: "Transferencia", date: "2026-04-30", status: "pendiente" },
];

export const formatEUR = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);

export const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });

export const formatTime = (d: string) =>
  new Date(d).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });