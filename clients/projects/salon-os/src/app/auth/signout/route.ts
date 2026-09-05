import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Cierra la sesión del usuario actual (POST para evitar CSRF por GET).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user !== null) {
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL("/login", request.url), {
    status: 302,
  });
}
