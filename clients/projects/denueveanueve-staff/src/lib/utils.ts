import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Salón OS almacena los precios en céntimos (price_cents / amount_cents).
// Este helper los muestra siempre en euros con el formato español (1.234,50 €).
const EUR_FORMATTER = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

export function formatEuros(cents: number | null | undefined): string {
  return EUR_FORMATTER.format((cents ?? 0) / 100);
}
