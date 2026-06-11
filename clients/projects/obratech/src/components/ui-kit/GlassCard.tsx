import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  children: React.ReactNode;
}

export const GlassCard = ({ hover = false, className, children, ...props }: GlassCardProps) => (
  <div className={cn(hover ? "glass-card-hover" : "glass-card", "p-5", className)} {...props}>
    {children}
  </div>
);
