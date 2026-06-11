import { cn } from "@/lib/utils";

interface GlassScaffoldProps {
  children: React.ReactNode;
  className?: string;
}

export const GlassScaffold = ({ children, className }: GlassScaffoldProps) => (
  <div className={cn("glass-scaffold", className)}>
    {children}
  </div>
);
