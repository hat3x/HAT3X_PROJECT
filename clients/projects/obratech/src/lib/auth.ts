import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "employee" | "client" | "supplier";

export interface UserProfile {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  employee_id: string | null;
  client_id: string | null;
  supplier_id: string | null;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // Check that the user has admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    await supabase.auth.signOut();
    throw new Error("NO_ADMIN_ROLE");
  }

  return data;
}

export async function signInById(id: string, password: string, type: "employee" | "client" | "supplier") {
  const res = await supabase.functions.invoke("login-by-id", {
    body: { id, password, type },
  });

  if (res.error || !res.data?.access_token) {
    const msg = res.data?.error || "ID o contraseña incorrectos";
    throw new Error(msg);
  }

  // Set session with the tokens returned from the edge function
  const { error } = await supabase.auth.setSession({
    access_token: res.data.access_token,
    refresh_token: res.data.refresh_token,
  });

  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !data) return null;
  return data as UserProfile;
}
