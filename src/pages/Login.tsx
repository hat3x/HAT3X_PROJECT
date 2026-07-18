import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useSalon } from '@/lib/salon-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();
  // Marca del salón resuelto en runtime: logo/nombre reales (nunca cableados a un salón).
  const { name: salonName, logoUrl } = useSalon();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(loginId, password);
    setLoading(false);
    if (error) {
      setError(error);
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 gradient-dark">
      {/* Decorative glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-gold/5 blur-[120px]" />
      </div>

      <div className="relative z-10 flex w-full max-w-xs flex-col items-center text-center">
        {/* Header */}
        <p className="mb-2 text-sm uppercase tracking-[0.3em] text-gold-light">
          Staff Panel
        </p>

        {logoUrl ? (
          <img src={logoUrl} alt={salonName} className="mb-8 h-10 w-auto max-w-[220px] object-contain" />
        ) : (
          <h1 className="mb-8 font-display text-2xl font-semibold tracking-wide text-foreground">
            {salonName}
          </h1>
        )}

        <p className="mb-12 text-sm tracking-widest uppercase text-muted-foreground">
          Acceso interno del equipo
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
          <div className="space-y-2 text-left">
            <Label htmlFor="loginId" className="text-gold-light text-xs uppercase tracking-widest">
              ID de acceso
            </Label>
            <Input
              id="loginId"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              placeholder="tu ID"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              className="h-12 bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-gold focus:ring-ring"
            />
          </div>
          <div className="space-y-2 text-left">
            <Label htmlFor="password" className="text-gold-light text-xs uppercase tracking-widest">
              Contraseña
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-12 bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-gold focus:ring-ring pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="mt-4 h-12 w-full gradient-gold text-primary-foreground font-semibold tracking-wide shadow-gold hover:opacity-90 transition-opacity"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Iniciar sesión'}
          </Button>
        </form>
      </div>
    </div>
  );
}
