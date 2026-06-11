import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { id, password, type } = await req.json();

    if (!id || !password || !type) {
      return new Response(
        JSON.stringify({ error: "Faltan campos obligatorios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate type
    const validTypes = ["employee", "client", "supplier"];
    if (!validTypes.includes(type)) {
      return new Response(
        JSON.stringify({ error: "Tipo inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate input lengths
    if (typeof id !== "string" || typeof password !== "string" || id.length > 100 || password.length > 200) {
      return new Response(
        JSON.stringify({ error: "Datos inválidos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Rate limiting: check recent failed attempts for this identifier
    const identifier = `${type}:${id}`;
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

    const { count } = await supabaseAdmin
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("identifier", identifier)
      .gte("attempted_at", windowStart);

    if (count !== null && count >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({ error: "Demasiados intentos. Inténtelo de nuevo en 15 minutos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up email by employee_id, supplier_id, or client_id
    let profile: { email: string; role: string } | null = null;

    if (type === "employee") {
      const { data: empProfile } = await supabaseAdmin
        .from("profiles")
        .select("email, role")
        .eq("employee_id", id)
        .single();

      if (empProfile && empProfile.email && empProfile.role === "employee") {
        profile = empProfile;
      } else {
        const { data: supProfile } = await supabaseAdmin
          .from("profiles")
          .select("email, role")
          .eq("supplier_id", id)
          .single();

        if (supProfile && supProfile.email && supProfile.role === "supplier") {
          profile = supProfile;
        }
      }
    } else if (type === "client") {
      const { data: cliProfile } = await supabaseAdmin
        .from("profiles")
        .select("email, role")
        .eq("client_id", id)
        .single();

      if (cliProfile && cliProfile.email && cliProfile.role === "client") {
        profile = cliProfile;
      }
    } else if (type === "supplier") {
      const { data: supProfile } = await supabaseAdmin
        .from("profiles")
        .select("email, role")
        .eq("supplier_id", id)
        .single();

      if (supProfile && supProfile.email && supProfile.role === "supplier") {
        profile = supProfile;
      }
    }

    if (!profile || !profile.email) {
      // Record failed attempt
      await supabaseAdmin.from("login_attempts").insert({ identifier });
      return new Response(
        JSON.stringify({ error: "ID o contraseña incorrectos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sign in with the looked-up email
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email: profile.email,
      password,
    });

    if (authError) {
      // Record failed attempt
      await supabaseAdmin.from("login_attempts").insert({ identifier });
      return new Response(
        JSON.stringify({ error: "ID o contraseña incorrectos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cleanup old attempts on successful login
    await supabaseAdmin
      .from("login_attempts")
      .delete()
      .eq("identifier", identifier);

    return new Response(
      JSON.stringify({
        access_token: authData.session?.access_token,
        refresh_token: authData.session?.refresh_token,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
