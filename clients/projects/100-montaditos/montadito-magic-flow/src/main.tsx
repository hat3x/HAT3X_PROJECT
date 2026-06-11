import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "@/integrations/supabase/client";

// Inyecta el session_id del cliente como header en todas las llamadas a PostgREST
// para que las RLS puedan validar que el cliente solo accede a SUS pedidos.
try {
  let sid = sessionStorage.getItem("montaditos_session");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("montaditos_session", sid);
  }
  // @ts-expect-error: rest.headers es interno pero estable en supabase-js v2
  supabase.rest.headers["x-session-id"] = sid;
} catch (e) {
  console.warn("No se pudo inyectar x-session-id", e);
}

createRoot(document.getElementById("root")!).render(<App />);
