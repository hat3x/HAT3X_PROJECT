import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base: radio consistente (rounded-lg = --radius), micro-interacción de
  // 200ms con easing Apple, y realce de pulsación (active:scale). transition-all
  // permite animar color, sombra y transform de forma coherente.
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 ease-apple-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
  {
    variants: {
      variant: {
        // Sólido de marca: sombra suave en reposo → glow violeta al hover.
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-brand",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground hover:border-ring/40",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/70",
        // Link: sin sombra ni pulsación; se mantiene plano.
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        // Radio heredado del base (rounded-lg) para toda la escala.
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
