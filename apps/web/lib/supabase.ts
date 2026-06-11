import { createClient } from "@supabase/supabase-js"

export function getServerClient() {
  const url = process.env["SUPABASE_URL"]
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]
  if (url == null || key == null) {
    throw new Error("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias")
  }
  return createClient(url, key, { auth: { persistSession: false } })
}
