import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "default" | "purple" | "orange";
}

const StatCard = ({ title, value, subtitle, icon: Icon, variant = "default" }: StatCardProps) => {
  const borderAccent =
    variant === "purple"
      ? "border-primary/15 hover:border-primary/30"
      : variant === "orange"
      ? "border-accent/15 hover:border-accent/30"
      : "border-border hover:border-primary/20";

  const iconBg =
    variant === "purple"
      ? "gradient-purple"
      : variant === "orange"
      ? "gradient-orange"
      : "bg-muted/60";

  const iconText = variant === "default" ? "text-muted-foreground" : "text-primary-foreground";

  const glowClass = variant === "purple" ? "glow-purple" : variant === "orange" ? "glow-orange" : "";

  return (
    <div className={`card-premium p-6 ${borderAccent} ${glowClass}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-display font-bold text-foreground tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconText}`} />
        </div>
      </div>
    </div>
  );
};

export default StatCard;
