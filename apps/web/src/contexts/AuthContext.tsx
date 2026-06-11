import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "client" | "project_manager" | "developer" | "sales" | "partner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  isAdmin: boolean;
  isClient: boolean;
  loading: boolean;
  profile: { full_name: string; email: string; phone: string; avatar_url: string; must_change_password: boolean } | null;
  companyId: string | null;
  mustChangePassword: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  roles: [],
  isAdmin: false,
  isClient: false,
  loading: true,
  profile: null,
  companyId: null,
  mustChangePassword: false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    try {
      const [rolesRes, profileRes, companyRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase.from("company_users").select("company_id").eq("user_id", userId).limit(1).single(),
      ]);

      if (rolesRes.data) setRoles(rolesRes.data.map((r: any) => r.role as AppRole));
      if (profileRes.data) setProfile(profileRes.data as any);
      if (companyRes.data) setCompanyId(companyRes.data.company_id);
    } catch (e) {
      console.error("Error fetching user data:", e);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setRoles([]);
          setProfile(null);
          setCompanyId(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
    setProfile(null);
    setCompanyId(null);
  };

  const isAdmin = roles.includes("admin");
  const isClient = roles.includes("client");
  const mustChangePassword = profile?.must_change_password === true;

  return (
    <AuthContext.Provider value={{ user, session, roles, isAdmin, isClient, loading, profile, companyId, mustChangePassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
