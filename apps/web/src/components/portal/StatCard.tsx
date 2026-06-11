import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtitle?: string;
  accentColor?: "primary" | "accent" | "emerald";
  className?: string;
}

const accentMap = {
  primary: { bg: "bg-primary/15", text: "text-primary", glow: "shadow-[0_0_20px_hsl(265_100%_50%/0.08)]" },
  accent: { bg: "bg-accent/15", text: "text-accent", glow: "shadow-[0_0_20px_hsl(32_100%_50%/0.08)]" },
  emerald: { bg: "bg-emerald-500/15", text: "text-emerald-400", glow: "shadow-[0_0_20px_hsl(160_100%_40%/0.08)]" },
};

const StatCard = ({ icon: Icon, label, value, subtitle, accentColor = "primary", className }: StatCardProps) => {
  const accent = accentMap[accentColor];
  return (
    <div className={cn("glass-card p-5 md:p-6 flex items-start gap-4", accent.glow, className)}>
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", accent.bg)}>
        <Icon className={cn("w-5 h-5", accent.text)} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {subtitle && <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
};

export default StatCard;
