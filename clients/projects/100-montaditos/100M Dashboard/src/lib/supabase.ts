import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: localStorage,
  },
});

export type AppRole = "cocina" | "caja" | "admin";
export type EstadoPedido =
  | "pendiente"
  | "recibido"
  | "preparando"
  | "listo"
  | "entregado"
  | "cancelado";
export type TipoPedido = "cocina" | "bebidas" | "mixto";
export type DestinoItem = "cocina" | "bebidas";
