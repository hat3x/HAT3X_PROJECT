import { useState } from 'react';
import { Crown, Scissors, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Benefit {
  key: string;
  label: string;
  limit: number;
  used: boolean;
  used_at: string | null;
}

interface PremiumData {
  is_premium: boolean;
  plan: string;
  subscription_id: string;
  benefits: Benefit[];
}

interface Props {
  premium: PremiumData;
  locationId: string;
}

const PLAN_LABELS: Record<string, string> = {
  MEN_19: 'Club Caballero 19€/mes',
  LADIES_59: 'Club Señora 59€/mes',
};

function BenefitIcon({ benefitKey }: { benefitKey: string }) {
  if (benefitKey === 'monthly_cut') return <Scissors className="h-5 w-5 text-primary shrink-0" />;
  return <Sparkles className="h-5 w-5 text-primary shrink-0" />;
}

export default function PremiumClubSection({ premium, locationId }: Props) {
  const [benefits, setBenefits] = useState<Benefit[]>(premium.benefits);
  const [loading, setLoading] = useState<string | null>(null);

  if (!premium.is_premium) return null;

  const planLabel = PLAN_LABELS[premium.plan] ?? premium.plan;

  const handleMarkAsUsed = async (benefit: Benefit) => {
    if (benefit.used || loading) return;
    setLoading(benefit.key);

    try {
      const { data, error } = await supabase.functions.invoke('use-club-benefit', {
        body: {
          subscription_id: premium.subscription_id,
          benefit_key: benefit.key,
          location_id: locationId,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setBenefits((prev) =>
        prev.map((b) =>
          b.key === benefit.key
            ? { ...b, used: true, used_at: new Date().toISOString() }
            : b
        )
      );
    } catch (err: any) {
      toast({
        title: 'Error al marcar beneficio',
        description: err.message || 'No se pudo marcar como usado',
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="w-full max-w-sm mt-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Crown className="h-5 w-5 text-primary" />
        <h2 className="text-base font-bold text-foreground">Club Premium</h2>
        <Badge className="ml-auto bg-primary/10 text-primary border-primary/20 text-xs font-semibold">
          {planLabel}
        </Badge>
      </div>

      {/* Benefits */}
      <div className="rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
        {benefits.map((benefit) => (
          <div key={benefit.key} className="flex items-center gap-3 p-3">
            <BenefitIcon benefitKey={benefit.key} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">{benefit.label}</p>
              {benefit.used && benefit.used_at && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(benefit.used_at), "d MMM yyyy", { locale: es })}
                </p>
              )}
            </div>
            {benefit.used ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-success shrink-0">
                <CheckCircle2 className="h-4 w-4" />
                Usado ✓
              </span>
            ) : (
              <Button
                size="sm"
                className="h-8 px-3 text-xs font-semibold gradient-gold text-primary-foreground shadow-gold shrink-0"
                disabled={loading === benefit.key}
                onClick={() => handleMarkAsUsed(benefit)}
              >
                {loading === benefit.key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  'Marcar usado'
                )}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
