import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase, SALON_ID } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Rol del staff dentro de un salón (Salón OS es multi-tenant).
export type MemberRole = Database['public']['Enums']['member_role']; // 'owner' | 'manager' | 'staff'

// Mensaje mostrado cuando el usuario se autentica pero NO pertenece a este salón.
const NO_ACCESS_ERROR = 'Sin acceso a este salón';

interface AuthState {
  user: User | null;
  session: Session | null;
  roles: MemberRole[];
  isStaff: boolean;
  isManager: boolean;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  // Login por ID de acceso (se mapea a un email sintético) + contraseña.
  signIn: (id: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasStaffAccess: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Convierte el ID de acceso introducido por el usuario en el email sintético con
// el que se autentica contra Supabase Auth: `<id>@salonos.app`.
function idToEmail(id: string): string {
  return `${id.trim().toLowerCase()}@salonos.app`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null, session: null, roles: [],
    isStaff: false, isManager: false, isAdmin: false,
    loading: true, error: null,
  });

  // Cache de la pertenencia al salón por usuario, para no re-consultar en cada
  // refresco de token. `role: null` = usuario autenticado pero no miembro.
  const membershipCache = useRef<{ userId: string; role: MemberRole | null } | null>(null);

  // Devuelve el rol del usuario en ESTE salón (VITE_SALON_ID) o null si no es miembro.
  const fetchMembership = useCallback(async (userId: string): Promise<MemberRole | null> => {
    if (membershipCache.current?.userId === userId) {
      return membershipCache.current.role;
    }

    try {
      const { data, error } = await supabase
        .from('salon_members')
        .select('role')
        .eq('salon_id', SALON_ID)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('[Auth] Error consultando salon_members:', error.message);
        return null;
      }

      const role = (data?.role ?? null) as MemberRole | null;
      membershipCache.current = { userId, role };
      return role;
    } catch (err) {
      console.error('[Auth] Fallo consultando salon_members:', err);
      return null;
    }
  }, []);

  const applyState = useCallback((session: Session | null, role: MemberRole | null) => {
    if (!session?.user) {
      membershipCache.current = null;
      setState({ user: null, session: null, roles: [], isStaff: false, isManager: false, isAdmin: false, loading: false, error: null });
      return;
    }
    if (!role) {
      // Sesión válida pero el usuario NO pertenece a este salón.
      setState({ user: session.user, session, roles: [], isStaff: false, isManager: false, isAdmin: false, loading: false, error: NO_ACCESS_ERROR });
      return;
    }
    setState({
      user: session.user, session, roles: [role],
      isStaff: true, // owner/manager/staff son todos personal del salón
      isManager: role === 'owner' || role === 'manager',
      isAdmin: role === 'owner',
      loading: false,
      error: null,
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    const timeout = setTimeout(() => {
      if (mounted) setState((s) => s.loading ? { ...s, loading: false } : s);
    }, 6000);

    const handleSession = async (session: Session | null) => {
      if (!mounted) return;
      if (!session?.user) {
        applyState(null, null);
        return;
      }
      const role = await fetchMembership(session.user.id);
      if (!mounted) return;
      if (!role) {
        // La sesión pertenece a alguien que no es miembro de este salón: se revoca
        // para no dejar una sesión válida sin acceso (Salón OS es multi-tenant).
        setState((s) => ({ ...s, loading: true }));
        await supabase.auth.signOut();
        if (mounted) applyState(null, null);
        return;
      }
      applyState(session, role);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // IMPORTANTE: no hagas await de llamadas a Supabase directamente dentro de
        // este callback para evitar deadlocks de auth (pueden bloquear signIn/signOut).
        setTimeout(() => {
          void handleSession(session);
        }, 0);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    }).catch(() => {
      if (mounted) setState((s) => ({ ...s, loading: false, error: 'Error de conexión' }));
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchMembership, applyState]);

  const signIn = async (id: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));

    const normalizedId = id.trim();
    if (!normalizedId) {
      const msg = 'Introduce tu ID de acceso';
      setState((s) => ({ ...s, loading: false, error: msg }));
      return { error: msg };
    }

    const email = idToEmail(normalizedId);

    try {
      const authPromise = supabase.auth.signInWithPassword({ email, password });
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Tiempo de espera agotado al iniciar sesión')), 8000);
      });

      const { data, error } = await Promise.race([authPromise, timeoutPromise]) as Awaited<typeof authPromise>;

      if (error) {
        // Mensaje genérico: no revelamos si el ID existe (evita enumeración de usuarios).
        const msg = 'ID o contraseña incorrectos';
        setState((s) => ({ ...s, loading: false, error: msg }));
        return { error: msg };
      }

      // Tras autenticar, verificar que el usuario es miembro de ESTE salón.
      const userId = data.user?.id;
      const role = userId ? await fetchMembership(userId) : null;
      if (!role) {
        // No pertenece al salón: cerramos sesión y avisamos.
        membershipCache.current = null;
        await supabase.auth.signOut();
        setState((s) => ({ ...s, loading: false, error: NO_ACCESS_ERROR }));
        return { error: NO_ACCESS_ERROR };
      }

      // Éxito: onAuthStateChange completará el estado (sesión + rol).
      return { error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión';
      setState((s) => ({ ...s, loading: false, error: message }));
      return { error: message };
    }
  };

  const signOut = async () => {
    membershipCache.current = null;
    await supabase.auth.signOut();
    setState({ user: null, session: null, roles: [], isStaff: false, isManager: false, isAdmin: false, loading: false, error: null });
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, hasStaffAccess: state.isStaff }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
