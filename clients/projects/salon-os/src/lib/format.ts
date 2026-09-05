import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/** Formatea un importe en céntimos a moneda local (por defecto EUR). */
export function formatMoney(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Formatea una fecha ISO (o `YYYY-MM-DD`) como "12 jul 2026". */
export function formatDate(iso: string): string {
  return format(parseISO(iso), "d MMM yyyy", { locale: es });
}

/** Formatea una fecha-hora ISO como "12 jul 2026, 10:00". */
export function formatDateTime(iso: string): string {
  return format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: es });
}
