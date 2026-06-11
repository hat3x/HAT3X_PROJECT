import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  codigo: string;
  nombre: string;
  icono?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const sizeMap = {
  sm: 'w-6 h-6 text-[13px]',
  md: 'w-9 h-9 text-lg',
  lg: 'w-12 h-12 text-2xl',
};

export function AllergenIcon({ codigo, nombre, icono, size = 'sm', showLabel = false }: Props) {
  const emoji = icono ?? '⚠️';
  const dot = (
    <span
      aria-label={nombre}
      role="img"
      className={`${sizeMap[size]} rounded-full flex items-center justify-center shrink-0 bg-[#FEF3C7] text-[#92400E] ring-1 ring-[#FCD34D]/60 shadow-sm`}
      data-allergen={codigo}
    >
      <span aria-hidden>{emoji}</span>
    </span>
  );

  if (showLabel) {
    return (
      <div className="flex flex-col items-center gap-1 min-w-[56px]">
        {dot}
        <span className="text-[10px] text-muted-foreground text-center leading-tight">{nombre}</span>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{dot}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{nombre}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface RowProps {
  alergenos: { codigo: string; nombre: string; icono?: string | null }[];
  maxVisible?: number;
}

export function AllergenIconRow({ alergenos, maxVisible = 5 }: RowProps) {
  if (!alergenos || alergenos.length === 0) return null;
  const visible = alergenos.slice(0, maxVisible);
  const extra = alergenos.length - visible.length;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {visible.map((a) => (
        <AllergenIcon key={a.codigo} codigo={a.codigo} nombre={a.nombre} icono={a.icono} size="sm" />
      ))}
      {extra > 0 && (
        <span className="w-6 h-6 rounded-full flex items-center justify-center bg-[#FEF3C7] text-[#92400E] text-[10px] font-bold ring-1 ring-[#FCD34D]/60">
          +{extra}
        </span>
      )}
    </div>
  );
}
