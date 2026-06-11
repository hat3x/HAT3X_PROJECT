import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
