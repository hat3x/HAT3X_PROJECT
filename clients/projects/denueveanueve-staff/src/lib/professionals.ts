// Capa de datos de PROFESIONALES (personal del salón) — parte PURA y testeable. Al igual que
// `appointments.ts`, este módulo NO importa el cliente de Supabase, NO toca la red ni el DOM:
// toda la entrada llega por argumento. Aquí vive únicamente la lógica DETERMINISTA de:
//   1) declarar el SELECT de PostgREST con el embed de servicios vía la tabla puente,
//   2) mapear la fila cruda al modelo de vista (aplanando professional_services → services),
//   3) normalizar/ordenar (nombre con collation ES, deduplicar servicios, iniciales,
//      color de texto legible para el avatar).
//
// ⛔ SOLO LECTURA. Esta capa NO da de alta, edita ni borra personal: el ABM del personal vive
// en el panel de Salón OS. Aquí solo se LISTAN los profesionales del salón. La consulta real
// (I/O) vive en `professionals-queries.ts`; el cableado con React Query y el salon_id resuelto
// en runtime, en `hooks/use-professionals.ts`. Separar la parte pura permite testearla sin
// mocks de red (mismo patrón que appointments.ts vs appointments-queries.ts).

/**
 * SELECT de PostgREST para el listado de personal: una sola consulta que EMBEBE (join) los
 * servicios que presta cada profesional a través de la tabla puente `professional_services`.
 * Un único viaje ⇒ sin patrón N+1 (no se consulta servicio a servicio por profesional).
 *
 * El embed interno se desambigua con el NOMBRE de la FK
 * (`services!professional_services_service_id_fkey`) porque `professional_services` referencia
 * a `services` con una clave compuesta `(service_id, salon_id)`; nombrar la FK hace la
 * resolución estable ante regeneraciones de tipos. La relación padre `professional_services`
 * no necesita hint: hay una única FK de la puente hacia `professionals`.
 *
 * Tipado como `string` (sin `as const`) a propósito: evita que supabase-js intente inferir el
 * tipo parseando el literal; el tipo del resultado se fija con `.returns<ProfessionalRow[]>()`.
 */
export const PROFESSIONALS_SELECT: string = `
  id,
  salon_id,
  full_name,
  active,
  color,
  specialties,
  user_id,
  professional_services (
    service:services!professional_services_service_id_fkey ( id, name, active )
  )
`;

/** Servicio embebido (solo los campos usados por la UI: id + nombre + activo). */
export interface ProfessionalServiceRef {
  id: string;
  name: string;
  active: boolean;
}

/** Fila de la tabla puente tal cual la devuelve el embed (servicio-a-uno, defensivo con null). */
export interface ProfessionalServiceEmbedRow {
  service: ProfessionalServiceRef | null;
}

/**
 * Fila CRUDA de la consulta (forma exacta de `PROFESSIONALS_SELECT`). `professional_services`
 * es un array (to-many); `specialties`/`professional_services` se tipan como `| null` de
 * forma defensiva por si el embed llegara vacío/oculto.
 */
export interface ProfessionalRow {
  id: string;
  salon_id: string;
  full_name: string;
  active: boolean;
  color: string | null;
  specialties: string[] | null;
  /** Vínculo cuenta↔ficha: null si la ficha aún no está ligada a ninguna cuenta. */
  user_id: string | null;
  professional_services: ProfessionalServiceEmbedRow[] | null;
}

/** Modelo de vista normalizado (camelCase, embeds aplanados) que consume la UI. */
export interface ProfessionalListItem {
  id: string;
  salonId: string;
  fullName: string;
  active: boolean;
  color: string | null;
  specialties: string[];
  /** Vínculo cuenta↔ficha (columna `user_id`): null si la ficha no está ligada a ninguna cuenta. */
  userId: string | null;
  /** Servicios que presta, DEDUPLICADOS por id y ORDENADOS por nombre (collation ES). */
  services: ProfessionalServiceRef[];
}

/**
 * Deduplica servicios por `id` (un profesional podría aparecer enlazado dos veces a un mismo
 * servicio ante datos inconsistentes) y los ordena por nombre con collation española, de modo
 * que las etiquetas se pintan siempre en el mismo orden estable.
 */
export function dedupeServices(services: ProfessionalServiceRef[]): ProfessionalServiceRef[] {
  const byId = new Map<string, ProfessionalServiceRef>();
  for (const s of services) {
    if (!byId.has(s.id)) byId.set(s.id, s);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

/** Mapea una fila cruda al modelo de vista. Puro y null-safe con los embeds. */
export function mapProfessionalRow(row: ProfessionalRow): ProfessionalListItem {
  const services = dedupeServices(
    (row.professional_services ?? [])
      .map((link) => link.service)
      .filter((s): s is ProfessionalServiceRef => s != null),
  );
  return {
    id: row.id,
    salonId: row.salon_id,
    fullName: row.full_name,
    active: row.active,
    color: row.color ?? null,
    specialties: row.specialties ?? [],
    userId: row.user_id,
    services,
  };
}

/** Mapea un lote de filas crudas (tolera null/undefined ⇒ lista vacía). */
export function mapProfessionalRows(
  rows: ProfessionalRow[] | null | undefined,
): ProfessionalListItem[] {
  return (rows ?? []).map(mapProfessionalRow);
}

/**
 * Comparador por `full_name` con collation ES (respeta acentos y ñ), con desempate estable por
 * `id`. Se compara con `localeCompare` en lugar de lexicográficamente para ordenar bien nombres
 * acentuados que el `ORDER BY` de Postgres podría ordenar según otra collation.
 */
export function compareByFullName(a: ProfessionalListItem, b: ProfessionalListItem): number {
  const byName = a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' });
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Ordena por `full_name` ascendente devolviendo un ARRAY NUEVO (no muta la entrada). */
export function sortByFullName(items: ProfessionalListItem[]): ProfessionalListItem[] {
  return [...items].sort(compareByFullName);
}

/**
 * Iniciales para el avatar: primera letra del primer y del último token del nombre (una sola
 * si es un único token). Ante un nombre vacío devuelve «?». Solo presentación.
 */
export function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const DARK_TEXT = '#111827';
const LIGHT_TEXT = '#ffffff';

/** Convierte un hex (`#rgb` o `#rrggbb`) a RGB 0-255. Devuelve null si el hex es inválido. */
function hexToRgb(hex: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const int = Number.parseInt(h, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/**
 * Color de texto legible (oscuro vs blanco) para pintar las iniciales SOBRE el `color` propio
 * del profesional, elegido según la LUMINANCIA relativa (fórmula WCAG 2.x con canales
 * linealizados). Así el avatar mantiene contraste suficiente sea cual sea el color asignado en
 * Salón OS. Ante un hex ausente/inválido devuelve texto oscuro por defecto.
 */
export function readableTextColor(hex: string | null | undefined): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return DARK_TEXT;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Umbral ~0.179: cruce clásico que maximiza el contraste al elegir texto negro/blanco.
  return luminance > 0.179 ? DARK_TEXT : LIGHT_TEXT;
}
