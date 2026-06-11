import { SCORING_LABELS } from "@/constants/catalog";
import type { ScoringBreakdown as ScoringBreakdownType } from "@/types/domain";

interface ScoringBreakdownProps {
  breakdown: ScoringBreakdownType;
}

const getBarColor = (value: number) => {
  if (value >= 80) return "from-green-500/80 to-green-400/60";
  if (value >= 60) return "from-yellow-500/80 to-yellow-400/60";
  return "from-red-500/80 to-red-400/60";
};

const ScoringBreakdown = ({ breakdown }: ScoringBreakdownProps) => {
  const entries = Object.entries(breakdown) as [keyof ScoringBreakdownType, number][];

  return (
    <div className="space-y-3.5">
      {entries.map(([key, value]) => {
        const config = SCORING_LABELS[key];
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-secondary-foreground">{config.label}</span>
              <span className="text-[11px] font-semibold text-foreground tabular-nums">{value}</span>
            </div>
            <div className="h-[5px] rounded-full bg-muted/50 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${getBarColor(value)} transition-all duration-700 ease-out`}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ScoringBreakdown;
