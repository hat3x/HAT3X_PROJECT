import { useState, useEffect, useMemo } from 'react';
import { Clock, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatEuros } from '@/lib/utils';
import { EmptyState } from './EmptyState';

// Servicio del salón (esquema Salón OS). El precio se guarda en céntimos
// (price_cents); las categorías son un texto plano en la propia fila.
export interface SalonService {
  id: string;
  name: string;
  category: string | null;
  price_cents: number;
  duration_minutes: number | null;
}

// Bucket para los servicios sin categoría; se muestra siempre el último.
const UNCATEGORIZED = 'Otros';

interface ServiceSelectorProps {
  services: SalonService[];
  onSelect: (services: SalonService[]) => void;
  preSelectedIds?: string[];
}

export function ServiceSelector({ services, onSelect, preSelectedIds = [] }: ServiceSelectorProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, SalonService>>(new Map());
  const [initialized, setInitialized] = useState(false);

  // Pre-selecciona los servicios de la cita del día (si los hay), una sola vez.
  useEffect(() => {
    if (!initialized && services.length > 0 && preSelectedIds.length > 0) {
      const initial = new Map<string, SalonService>();
      services.forEach((s) => {
        if (preSelectedIds.includes(s.id)) initial.set(s.id, s);
      });
      if (initial.size > 0) setSelected(initial);
      setInitialized(true);
    }
  }, [services, preSelectedIds, initialized]);

  // Filtrado por nombre o categoría y agrupado por categoría, con "Otros" al final.
  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = services.filter((s) => {
      if (!term) return true;
      const category = (s.category ?? '').toLowerCase();
      return s.name.toLowerCase().includes(term) || category.includes(term);
    });

    const byCategory = new Map<string, SalonService[]>();
    filtered.forEach((s) => {
      const key = s.category?.trim() || UNCATEGORIZED;
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(s);
    });

    return Array.from(byCategory.entries())
      .sort(([a], [b]) => {
        if (a === UNCATEGORIZED) return 1;
        if (b === UNCATEGORIZED) return -1;
        return a.localeCompare(b, 'es');
      })
      .map(([name, items]) => ({ name, items }));
  }, [services, search]);

  const toggleService = (service: SalonService) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(service.id)) {
        next.delete(service.id);
      } else {
        next.set(service.id, service);
      }
      return next;
    });
  };

  const totalCents = Array.from(selected.values()).reduce((sum, s) => sum + (s.price_cents ?? 0), 0);

  return (
    <div>
      <Input
        placeholder="Buscar servicio..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Buscar servicio por nombre o categoría"
        className="mb-4 h-11 bg-card border-border text-foreground placeholder:text-muted-foreground"
      />

      {grouped.length === 0 ? (
        <EmptyState title="Sin servicios" message="No se encontraron servicios" />
      ) : (
        <div className="space-y-4">
          {grouped.map(({ name, items }) => (
            <div key={name}>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{name}</h3>
              <div className="space-y-2">
                {items.map((service) => {
                  const isSelected = selected.has(service.id);
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleService(service)}
                      aria-pressed={isSelected}
                      className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all active:scale-[0.98] ${
                        isSelected
                          ? 'bg-primary/10 border-primary'
                          : 'bg-card border-border hover:bg-secondary'
                      }`}
                    >
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{service.name}</p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-semibold text-primary">{formatEuros(service.price_cents)}</span>
                          {service.duration_minutes != null && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {service.duration_minutes} min
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
                          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                        }`}
                      >
                        {isSelected && <Check className="h-4 w-4 text-primary-foreground" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Barra fija de confirmación */}
      {selected.size > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-40 rounded-xl bg-card border border-border p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-foreground">
              {selected.size} servicio{selected.size > 1 ? 's' : ''} ·{' '}
              <span className="font-semibold text-primary">{formatEuros(totalCents)}</span>
            </p>
          </div>
          <Button
            onClick={() => onSelect(Array.from(selected.values()))}
            className="w-full h-12 gradient-gold text-primary-foreground font-semibold shadow-gold"
          >
            Continuar
          </Button>
        </div>
      )}
    </div>
  );
}
