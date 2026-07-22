import { Outlet } from 'react-router-dom';
import { RequireRole } from './RequireRole';
import { STAFF_ROLES, ADMIN_ROLES } from '@/lib/auth';
import { BottomNav } from './BottomNav';

// Mensajes de denegación por tipo de vista (se muestran a un usuario AUTENTICADO
// cuyo rol de salón no alcanza para la sección). El bloqueo real de datos lo impone
// la RLS de Supabase; estas guardias solo evitan pintar pantallas sin permiso.
const STAFF_DENIED = 'Tu cuenta no tiene permisos de staff en este salón.';
const ADMIN_DENIED =
  'Necesitas permisos de administración (propietario o encargado) para ver esta sección.';

/** Layout + guardia de las rutas comunes de staff (owner/manager/staff). */
export function AppShell() {
  return (
    <RequireRole allow={STAFF_ROLES} deniedMessage={STAFF_DENIED}>
      <div className="flex min-h-screen flex-col bg-background">
        <main className="flex-1 pb-20">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </RequireRole>
  );
}

/** Layout + guardia de las rutas de empleado (mismo acceso base que staff). */
export function EmployeeShell() {
  return (
    <RequireRole allow={STAFF_ROLES} deniedMessage={STAFF_DENIED}>
      <div className="flex min-h-screen flex-col bg-background">
        <main className="flex-1 pb-20">
          <Outlet />
        </main>
        <EmployeeBottomNav />
      </div>
    </RequireRole>
  );
}

/** Layout + guardia de las rutas de administración: solo propietario/encargado. */
export function AdminShell() {
  return (
    <RequireRole allow={ADMIN_ROLES} deniedMessage={ADMIN_DENIED}>
      <div className="flex min-h-screen flex-col bg-background">
        <main className="flex-1 pb-20">
          <Outlet />
        </main>
        <AdminBottomNav />
      </div>
    </RequireRole>
  );
}

// Employee bottom nav
import { NavLink } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

function EmployeeBottomNav() {
  // "Mi agenda" (agenda del profesional) ya está en alcance de Salón OS (sub-3) y se enlaza aquí.
  const items = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
    { to: '/employee/calendar', icon: CalendarDays, label: 'Agenda' },
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
import { LayoutDashboard, Users, ScanLine, Clock, CalendarDays } from 'lucide-react';

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
