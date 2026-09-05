import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Cliente Supabase apuntando a la BD de Salón OS (proyecto jztoyekixcziaicrnlce).
// Los valores se leen de las variables de entorno VITE_* (ver .env / .env.example);
// si faltasen, se usa el valor por defecto de Salón OS para que la app siga
// apuntando a la base de datos correcta.
//
// Valor antiguo (proyecto Supabase descartado — NO USAR):
//   const SUPABASE_URL = "https://cpocwvedqlxtwazwoyfn.supabase.co";
//   const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwb2N3dmVkcWx4dHdhendveWZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDAyOTQsImV4cCI6MjA4ODM3NjI5NH0.hmPg_dNwauEQ6fAQQGA6alZzwuFsb0unnZ6wg20OmX4";
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://jztoyekixcziaicrnlce.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6dG95ZWtpeGN6aWFpY3JubGNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4OTY1ODIsImV4cCI6MjA5OTQ3MjU4Mn0.8qlU89qoPtvzuhSP0BVR0pue_Uy9WoMYKcBLeh_rNdY';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Identidad del salón (Salón OS es multi-tenant). El salon_id EFECTIVO de la app se
// resuelve EN RUNTIME (subdominio > ?salon= > VITE_SALON_SLUG) y se obtiene vía la RPC
// pública get_salon_branding: se deriva del salón resuelto con `useSalon()` / `useSalonId()`
// (ver src/lib/salon.ts + src/lib/salon-context.tsx). Ya NO existe un SALON_ID cableado:
// VITE_SALON_ID quedó OBSOLETO como fuente de verdad y VITE_SALON_SLUG es solo el fallback
// del slug para la resolución en runtime (no se lee desde aquí).

export const SUPABASE_PROJECT_ID =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? 'jztoyekixcziaicrnlce';
