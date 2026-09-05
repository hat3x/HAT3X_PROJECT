import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ScanLine, Users, CalendarDays, Clock, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNav() {
  // "Mi agenda" (agenda del profesional) ya está en alcance de Salón OS (sub-3) y se enlaza
  // aquí. Las vistas de administración (agenda del salón, "Empleados") también están activas
  // pero son solo para owner/manager: su punto de entrada vive en Ajustes (no en esta barra,
  // común a todo el personal), y su propia sub-navegación es AdminBottomNav.
  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
    { to: '/scan', icon: ScanLine, label: 'Escanear' },
    { to: '/customers', icon: Users, label: 'Clientes' },
    { to: '/employee/calendar', icon: CalendarDays, label: 'Agenda' },
    { to: '/history', icon: Clock, label: 'Historial' },
    { to: '/settings', icon: Settings, label: 'Ajustes' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span className="font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
