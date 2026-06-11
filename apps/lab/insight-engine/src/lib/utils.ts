import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── URL utilities ──────────────────────────────────────────────────────────

/**
 * Normalizes a URL to a canonical form for deduplication.
 * Mirrors the `normalize_url` PostgreSQL function in the DB.
 *
 * Examples:
 *   https://Trattoria.com/  → trattoria.com
 *   http://www.trattoria.com → trattoria.com
 *   HTTPS://TRATTORIA.COM/menu → trattoria.com/menu
 */
export function normalizeUrl(rawUrl: string): string {
  let normalized = rawUrl.trim().toLowerCase();
  normalized = normalized.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/^www\./, "");
  normalized = normalized.replace(/\/$/, "");
  return normalized;
}

/**
 * Returns true if the URL string is syntactically valid (has a valid protocol + host).
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Ensures the URL has a protocol prefix (defaults to https).
 * Useful for inputs that may omit the protocol.
 */
export function ensureProtocol(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// ── Date utilities ─────────────────────────────────────────────────────────

/**
 * Formats an ISO timestamp for display in the UI.
 */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Formats an ISO timestamp as date + time.
 */
export function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Returns a human-friendly relative time (e.g. "hace 2 horas").
 */
export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return formatDate(isoString);
}

// ── String utilities ───────────────────────────────────────────────────────

/**
 * Extracts the hostname from a URL for compact display.
 */
export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Truncates text to a maximum length with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}
