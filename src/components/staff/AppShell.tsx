import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { LoadingState } from '@/components/staff/LoadingState';
import { BottomNav } from './BottomNav';
import { Shield } from 'lucide-react';

export function AppShell() {
  const { user, loading, hasStaffAccess } = useAuth();

  if (loading) return <LoadingState message="Verificando acceso..." />;
  if (!user) return <Navigate to="/login" replace />;

  if (!hasStaffAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <Shield className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-foreground">Acceso denegado</h1>
          <p className="text-muted-foreground text-sm">Tu cuenta no tiene permisos de staff.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

/** Shell for employee-only routes (staff with linked staff_member) */
export function EmployeeShell() {
  const { user, loading, hasStaffAccess } = useAuth();

  if (loading) return <LoadingState message="Verificando acceso..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasStaffAccess) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <EmployeeBottomNav />
    </div>
  );
}

/** Shell for admin-only routes */
export function AdminShell() {
  const { user, loading, isAdmin } = useAuth();

  if (loading) return <LoadingState message="Verificando acceso..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <AdminBottomNav />
    </div>
  );
}

// Employee bottom nav
import { NavLink } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

function EmployeeBottomNav() {
  // "Mi Calendario" is out of scope in the Salón OS build (disabled screen),
  // so this nav only exposes in-scope destinations.
  const items = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
    { to: '/employee/settings', icon: Settings, label: 'Ajustes' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) => cn(
              'flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}>
            <Icon className="h-5 w-5" />
            <span className="font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

// Admin bottom nav
import { LayoutDashboard, Users, ScanLine, Clock } from 'lucide-react';

function AdminBottomNav() {
  // Employee management (/admin/employees) is out of scope in the Salón OS
  // build, so it is replaced here by the in-scope customers destination.
  const items = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
    { to: '/scan', icon: ScanLine, label: 'Escanear' },
    { to: '/customers', icon: Users, label: 'Clientes' },
    { to: '/history', icon: Clock, label: 'Historial' },
    { to: '/settings', icon: Settings, label: 'Ajustes' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) => cn(
              'flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}>
            <Icon className="h-5 w-5" />
            <span className="font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
