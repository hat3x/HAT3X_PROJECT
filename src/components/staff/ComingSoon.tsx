import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ComingSoonProps {
  /** Contextual icon for the disabled feature (falls back to Sparkles). */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Where the "back" action goes. Defaults to the in-scope home. */
  backTo?: string;
  backLabel?: string;
}

/**
 * Graceful placeholder for features that are out of scope in the current
 * Salón OS build. Self-contained: it references no database tables or
 * schema-specific types, so it can never break the build.
 */
export function ComingSoon({
  icon,
  title,
  description = 'Esta sección estará disponible próximamente en la app de Salón OS.',
  backTo = '/dashboard',
  backLabel = 'Volver al inicio',
}: ComingSoonProps) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center animate-slide-up">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon ?? <Sparkles className="h-9 w-9" />}
      </div>

      <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3 w-3 text-primary" />
        Próximamente
      </span>

      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">{description}</p>

      <Button asChild variant="outline" className="mt-6 h-11">
        <Link to={backTo}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLabel}
        </Link>
      </Button>
    </div>
  );
}
