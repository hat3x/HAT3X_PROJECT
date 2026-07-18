import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthError, User, Session } from '@supabase/supabase-js';

// Autenticación del frontend sobre Supabase Auth (auth.users) de Salón OS.
// Estrategia: email + contraseña con sesión persistente. El alta (signUp) escribe
// los metadatos que el trigger `handle_new_user` de Salón OS espera en
// raw_user_meta_data (first_name, last_name, phone, date_of_birth, consent_*),
// que a su vez crea la fila en public.customers. Ver supabase/migrations.

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, metadata?: Record<string, unknown>) => Promise<{ data: { user: User | null; session: Session | null }; error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signUp: async () => ({ data: { user: null, session: null }, error: null }),
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  resetPassword: async () => ({ error: null }),
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Regla de oro de Supabase: registrar el listener de forma síncrona ANTES de
    // pedir la sesión inicial, y mantener el callback sin llamadas async a supabase
    // (evita el deadlock conocido del cliente de auth). Solo actualizamos estado.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    // Rehidrata la sesión persistida (localStorage) al montar.
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!mounted) return;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, metadata?: Record<string, unknown>) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        // Tras confirmar el correo, Supabase redirige de vuelta a la app.
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    // Devolvemos `data` ({ user, session }) además del error: cuando el proyecto
    // no exige confirmación de correo, `session` viene ya activa y permite
    // ejecutar la RPC de enlace por teléfono con auth.uid() disponible. Ver
    // Register.tsx.
    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    return { error };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

/**
 * Traduce el error crudo (en inglés) de Supabase Auth a una clave de i18n
 * estable, para que la UI muestre un mensaje localizado en vez del texto interno.
 * Devuelve siempre una clave existente en `translations` (fallback: genérico).
 */
export const mapAuthError = (error: unknown): string => {
  if (!error) return 'auth.error.generic';

  const err = error as { code?: string; message?: string };
  const code = (err.code ?? '').toLowerCase();
  const message = (err.message ?? '').toLowerCase();

  const has = (needle: string) => code.includes(needle) || message.includes(needle);

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'auth.error.invalidCredentials';
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed') || message.includes('not confirmed')) {
    return 'auth.error.emailNotConfirmed';
  }
  if (has('already') || code === 'user_already_exists' || message.includes('already registered')) {
    return 'auth.error.emailAlreadyRegistered';
  }
  if (has('rate') || message.includes('for security purposes') || message.includes('too many')) {
    return 'auth.error.rateLimited';
  }
  if (code === 'weak_password' || message.includes('password should be') || message.includes('weak password')) {
    return 'auth.error.weakPassword';
  }
  return 'auth.error.generic';
};

/**
 * Traduce el error crudo de la RPC `register_my_customer_account` (Salón OS) a
 * una clave de i18n. La RPC lanza EXCEPTION (SQLSTATE `P0001`) con un mensaje que
 * identifica el motivo:
 *   - `INVALID_PHONE`   → el teléfono no tiene un formato válido.
 *   - `PHONE_CONFLICT`  → el teléfono ya pertenece a otra cuenta/ficha.
 * Se comprueba primero el texto del mensaje (más específico); como red de
 * seguridad, el código `P0001` sin texto reconocible se trata como conflicto de
 * teléfono, que es el fallo esperado más frecuente de esta RPC.
 */
export const mapRegisterError = (error: unknown): string => {
  if (!error) return 'auth.error.generic';

  const err = error as { code?: string; message?: string };
  const code = (err.code ?? '').toUpperCase();
  const message = (err.message ?? '').toUpperCase();

  if (message.includes('INVALID_PHONE')) return 'auth.error.invalidPhone';
  if (message.includes('PHONE_CONFLICT') || code === 'P0001') return 'auth.error.phoneConflict';
  return 'auth.error.generic';
};
