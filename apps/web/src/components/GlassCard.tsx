import { forwardRef, ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  highlight?: boolean;
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, className, highlight = false }, ref) => (
    <div
      ref={ref}
      className={cn(
        highlight ? "glass-card-highlight" : "glass-card",
        "p-6 md:p-8 transition-all duration-300",
        "hover:shadow-[0_8px_40px_hsl(265_100%_50%/0.12)] hover:border-primary/25",
        highlight && "hover:shadow-[0_8px_40px_hsl(265_100%_50%/0.22)] hover:border-primary/50",
        className
      )}
    >
      {children}
    </div>
  )
);
GlassCard.displayName = "GlassCard";

export default GlassCard;
