import { useAuth } from '@/lib/auth';
import { useSalon } from '@/lib/salon-context';
import { Button } from '@/components/ui/button';
import { LogOut, Shield, User, Scissors } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const { user, roles, signOut } = useAuth();
  const { name: salonName } = useSalon();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const roleBadges: Record<string, string> = {
    owner: 'Propietario',
    manager: 'Manager',
    staff: 'Staff',
  };

  return (
    <div className="px-4 pt-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Scissors className="h-6 w-6 text-primary" />
          Ajustes
        </h1>
      </div>

      <div className="rounded-xl bg-card border border-border p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{user?.email}</p>
            <div className="flex gap-1 mt-1">
              {roles.map((r) => (
                <span key={r} className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                  {roleBadges[r] ?? r}
                </span>
              ))}
            </div>
          </div>
        </div>

        <hr className="border-border" />

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>App Staff · {salonName}</span>
        </div>

        <Button
          variant="outline"
          className="w-full h-12 border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-5 w-5" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
