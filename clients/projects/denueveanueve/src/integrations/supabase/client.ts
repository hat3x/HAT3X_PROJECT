// Cliente Supabase del frontend (Vite + React).
// Configurado para el proyecto Salón OS (jztoyekixcziaicrnlce) tras la migración
// desde Lovable. La URL y la publishable/anon key se leen desde las variables de
// entorno de Vite (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY); ver .env.example.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Fallo temprano y con mensaje claro si el .env no está configurado, en lugar del
// error críptico interno de createClient ("supabaseUrl is required").
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Faltan variables de entorno de Supabase. Define VITE_SUPABASE_URL y ' +
      'VITE_SUPABASE_PUBLISHABLE_KEY en tu archivo .env (consulta .env.example).'
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
