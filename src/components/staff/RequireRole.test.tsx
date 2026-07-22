import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';

// El guard lee el rol vía useAuth() (única fuente que consulta salon_members).
// Mockeamos SOLO useAuth y conservamos las constantes reales (STAFF_ROLES/ADMIN_ROLES)
// para verificar la configuración de permisos que la app usa de verdad.
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, useAuth: vi.fn() };
});

import { useAuth, STAFF_ROLES, ADMIN_ROLES, type MemberRole } from '@/lib/auth';
import { RequireRole } from './RequireRole';

const mockedUseAuth = vi.mocked(useAuth);
const FAKE_USER = { id: 'user-1' } as unknown as User;

// Estado base "no autenticado"; cada test sobreescribe lo que necesita.
function setAuth(overrides: Partial<ReturnType<typeof useAuth>>) {
  mockedUseAuth.mockReturnValue({
    user: null,
    session: null,
    roles: [],
    isStaff: false,
    isManager: false,
    isAdmin: false,
    loading: false,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    hasStaffAccess: false,
    ...overrides,
  } as ReturnType<typeof useAuth>);
}

function renderGuard(allow: readonly MemberRole[]) {
  return render(
    <MemoryRouter initialEntries={['/protegido']}>
      <Routes>
        <Route path="/login" element={<div>PANTALLA LOGIN</div>} />
        <Route path="/dashboard" element={<div>PANTALLA DASHBOARD</div>} />
        <Route
          path="/protegido"
          element={
            <RequireRole allow={allow}>
              <div>CONTENIDO PROTEGIDO</div>
            </RequireRole>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RequireRole — configuración de permisos', () => {
  it('ADMIN_ROLES autoriza a propietario y encargado, pero NO al staff base', () => {
    expect(ADMIN_ROLES).toContain('owner');
    expect(ADMIN_ROLES).toContain('manager');
    expect(ADMIN_ROLES).not.toContain('staff');
  });

  it('STAFF_ROLES incluye a todo el personal del salón (los tres roles)', () => {
    expect(STAFF_ROLES).toEqual(expect.arrayContaining(['owner', 'manager', 'staff']));
  });
});

describe('RequireRole — flujo de sesión', () => {
  it('mientras carga muestra el spinner de verificación (no filtra contenido)', () => {
    setAuth({ loading: true });
    renderGuard(ADMIN_ROLES);

    expect(screen.getByText(/verificando acceso/i)).toBeInTheDocument();
    expect(screen.queryByText('CONTENIDO PROTEGIDO')).toBeNull();
  });

  it('sin sesión redirige a /login', () => {
    setAuth({ user: null });
    renderGuard(ADMIN_ROLES);

    expect(screen.getByText('PANTALLA LOGIN')).toBeInTheDocument();
    expect(screen.queryByText('CONTENIDO PROTEGIDO')).toBeNull();
  });
});

describe('RequireRole — gating de pantallas de administración (owner/manager)', () => {
  it('BLOQUEA a un usuario staff: muestra acceso denegado, no el contenido', () => {
    setAuth({ user: FAKE_USER, roles: ['staff'], isStaff: true, hasStaffAccess: true });
    renderGuard(ADMIN_ROLES);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Acceso denegado');
    expect(screen.queryByText('CONTENIDO PROTEGIDO')).toBeNull();
  });

  it('PERMITE a un encargado (manager) entrar a la administración', () => {
    setAuth({
      user: FAKE_USER,
      roles: ['manager'],
      isStaff: true,
      isManager: true,
      hasStaffAccess: true,
    });
    renderGuard(ADMIN_ROLES);

    expect(screen.getByText('CONTENIDO PROTEGIDO')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('PERMITE a un propietario (owner) entrar a la administración', () => {
    setAuth({
      user: FAKE_USER,
      roles: ['owner'],
      isStaff: true,
      isManager: true,
      isAdmin: true,
      hasStaffAccess: true,
    });
    renderGuard(ADMIN_ROLES);

    expect(screen.getByText('CONTENIDO PROTEGIDO')).toBeInTheDocument();
  });
});

describe('RequireRole — vistas de staff (todos los roles)', () => {
  it('un staff base SÍ puede ver las vistas comunes de staff', () => {
    setAuth({ user: FAKE_USER, roles: ['staff'], isStaff: true, hasStaffAccess: true });
    renderGuard(STAFF_ROLES);

    expect(screen.getByText('CONTENIDO PROTEGIDO')).toBeInTheDocument();
  });

  it('un usuario autenticado SIN rol de salón queda bloqueado', () => {
    setAuth({ user: FAKE_USER, roles: [] });
    renderGuard(STAFF_ROLES);

    expect(screen.getByRole('alert')).toHaveTextContent('Acceso denegado');
    expect(screen.queryByText('CONTENIDO PROTEGIDO')).toBeNull();
  });
});
