"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, ReceiptText } from "lucide-react";

import { cn } from "@/lib/utils";

interface TabItem {
  href: string;
  label: string;
  icon: typeof FileText;
}

const TAB_ITEMS: readonly TabItem[] = [
  { href: "/facturacion/facturas", label: "Facturas", icon: FileText },
  { href: "/facturacion/tickets", label: "Tickets / Ventas", icon: ReceiptText },
];

/**
 * Pestañas entre las secciones de facturación.
 *
 * Reutiliza el MISMO lenguaje visual que la navegación de /ajustes (píldoras con
 * acento suave, `aria-current` y realce del icono en activo) pero como fila
 * horizontal en cabecera en lugar de barra lateral. En pantallas estrechas la fila
 * se desplaza horizontalmente sin romper el layout.
 *
 * Se usan enlaces con `aria-current="page"` (no roles ARIA de tab) porque cada
 * pestaña es una ruta navegable real, igual que en el resto del panel.
 */
export function FacturacionTabs(): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Secciones de facturación"
      className="-mx-4 mb-8 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      {TAB_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group flex shrink-0 items-center gap-2.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 ease-apple-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "bg-accent text-accent-foreground shadow-xs"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0 transition-colors duration-200 ease-apple-out",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
