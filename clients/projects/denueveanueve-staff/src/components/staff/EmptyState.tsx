import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  message?: string;
}

export function EmptyState({ icon, title = 'Sin resultados', message = 'No hay datos que mostrar' }: EmptyStateProps) {
  return (
    <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 px-6 text-center">
      {icon || <Inbox className="h-10 w-10 text-muted-foreground/40" />}
      <div>
        <h3 className="font-medium text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
