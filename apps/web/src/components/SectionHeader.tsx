import { ReactNode } from "react";

interface SectionHeaderProps {
  badge?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
  align?: "left" | "center";
}

const SectionHeader = ({ badge, title, subtitle, children, className = "", align = "center" }: SectionHeaderProps) =>
<div className={`${align === "center" ? "text-center" : "text-left"} mb-12 md:mb-16 ${className}`}>
    {badge &&
  <span className="inline-block text-xs font-semibold tracking-widest uppercase bg-primary/15 px-4 py-1.5 rounded-full mb-4 text-accent">
        {badge}
      </span>
  }
    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground leading-tight">{title}</h2>
    {subtitle &&
  <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">{subtitle}</p>
  }
    {children}
  </div>;


export default SectionHeader;