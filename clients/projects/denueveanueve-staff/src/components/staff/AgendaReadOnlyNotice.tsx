import { Lock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Aviso de SOLO LECTURA para las pantallas de agenda (Salón OS).
 *
 * En esta fase la app únicamente VISUALIZA citas: crear y cancelar quedan FUERA
 * de alcance. Para que la limitación quede explícita, la acción de "crear" se
 * materializa como un botón deliberadamente DESHABILITADO (presente pero inactivo,
 * no ausente) junto a una nota que explica el porqué. Así la acción se lee "clara
 * pero inactiva" en lugar de dar a entender que la pantalla no la contempla.
 *
 * Reutilizable por «Mi agenda» (empleado) y «Agenda del salón» (owner/manager)
 * para mantener un mensaje único y coherente.
 */
export function AgendaReadOnlyNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2',
        className,
      )}
    >
      <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>
          Solo lectura: por ahora la agenda solo se consulta. Crear o cancelar citas
          llegará en una próxima fase.
        </span>
      </p>

      {/* Acción de crear presente pero DESHABILITADA a propósito (fuera de alcance).
          El estilo `disabled` de shadcn (opacity-50 + pointer-events-none) ya la
          señala como inactiva; la nota de al lado explica el motivo a todos. */}
      <Button type="button" variant="outline" size="sm" disabled className="shrink-0">
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Nueva cita
      </Button>
    </div>
  );
}
