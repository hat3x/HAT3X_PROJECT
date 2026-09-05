/**
 * seed-demo-data.ts — Datos operativos del salón demo (sub-4), SIN efectos.
 * ---------------------------------------------------------------------------
 * Catálogo declarativo y PURO de la configuración operativa del salón demo
 * ("Bella Studio"): sedes, profesionales, servicios (modelo de 3 fases), productos
 * retail y horarios de apertura. `scripts/seed-demo-salon.ts` lo consume para
 * SEMBRARLO de forma additiva e idempotente; los tests lo importan para verificar
 * sus invariantes SIN base de datos ni cliente Supabase.
 *
 * REGLA DE ORO: este módulo NO importa nada en runtime (solo datos y funciones
 * puras). Así puede importarse desde un test de Vitest o desde el propio seed sin
 * arrastrar el cliente admin ni el arranque del script. Toda la aritmética de
 * dinero va en CÉNTIMOS enteros (invariante de dinero del esquema).
 *
 * Invariantes del modelo de 3 fases de un servicio (ver
 * `20260713000000_services_phase_duration.sql`):
 *   · application_min      ≥ 1  (fase 1 — el profesional está OCUPADO).
 *   · exposure_min         ≥ 0  (fase 2 — procesado; el profesional está LIBRE).
 *   · post_exposure_min    ≥ 0  (fase 3 — aclarado/secado; profesional OCUPADO).
 *   · duración total (suma) ∈ [5, 600]  (columna generada; el CHECK la exige).
 */

// ───────────────────────────────────────────────────────────────────────────
// Constantes de calendario.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Días de apertura L–S (Lunes … Sábado). Convención del esquema
 * (`professional_schedules.weekday`): 0 = domingo … 6 = sábado, igual que
 * `Date.getUTCDay()`. El salón demo abre de lunes a sábado y cierra los domingos.
 */
export const DEMO_OPEN_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6];

/** Límites del CHECK de duración total de un servicio (minutos). */
export const SERVICE_MIN_TOTAL_MINUTES = 5;
export const SERVICE_MAX_TOTAL_MINUTES = 600;

// ───────────────────────────────────────────────────────────────────────────
// Sedes (locations).
// ───────────────────────────────────────────────────────────────────────────

/** Una sede física del salón demo, con su horario de apertura L–S. */
export interface DemoLocation {
  /** Slug único por salón (`^[a-z0-9]+(-[a-z0-9]+)*$`). */
  slug: string;
  name: string;
  address: string;
  phone: string;
  /** Hora de apertura local del salón (`HH:MM`), inicio de la jornada L–S. */
  openStart: string;
  /** Hora de cierre local del salón (`HH:MM`), fin de la jornada L–S. */
  openEnd: string;
}

/**
 * Dos sedes en Madrid (el mandato pide 1–2). "Centro" es la sede insignia (misma
 * dirección visible que el salón); "Norte" es la segunda sede con horario propio.
 */
export const DEMO_LOCATIONS: readonly DemoLocation[] = [
  {
    slug: "centro",
    name: "Bella Studio Centro",
    address: "Calle Gran Vía 28, 3.º B, 28013 Madrid, España",
    phone: "+34 910 000 001",
    openStart: "09:30",
    openEnd: "20:30",
  },
  {
    slug: "norte",
    name: "Bella Studio Norte",
    address: "Avenida de la Ilustración 12, 28035 Madrid, España",
    phone: "+34 910 000 002",
    openStart: "09:00",
    openEnd: "19:00",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Profesionales.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Un profesional del salón demo. `specialties` usa las MISMAS etiquetas que la
 * `category` de los servicios: así se deriva de forma pura qué servicios presta
 * cada profesional (`professionalCoversService`) sin una tabla de mapeo aparte.
 */
export interface DemoProfessional {
  fullName: string;
  /** Slug de su sede; debe existir en `DEMO_LOCATIONS`. */
  locationSlug: string;
  /** Categorías de servicio que domina (= etiquetas de `category`). */
  specialties: readonly string[];
  /** Color de agenda `#rrggbb` (todos con buen contraste sobre blanco). */
  color: string;
}

/**
 * Ocho profesionales con nombres realistas (el mandato pide 6–10), repartidos
 * 5/3 entre las dos sedes. Entre todos cubren las 6 categorías del catálogo (ver
 * el test de cobertura), de modo que TODO servicio es reservable.
 */
export const DEMO_PROFESSIONALS: readonly DemoProfessional[] = [
  // ── Sede Centro ──
  {
    fullName: "Lucía Fernández",
    locationSlug: "centro",
    specialties: ["Corte", "Color", "Peinado", "Tratamiento"],
    color: "#B45309",
  },
  {
    fullName: "Carlos Moreno",
    locationSlug: "centro",
    specialties: ["Corte", "Barbería"],
    color: "#1D4ED8",
  },
  {
    fullName: "Marta Sánchez",
    locationSlug: "centro",
    specialties: ["Color", "Mechas", "Tratamiento"],
    color: "#BE185D",
  },
  {
    fullName: "Javier Ruiz",
    locationSlug: "centro",
    specialties: ["Corte", "Color", "Peinado"],
    color: "#047857",
  },
  {
    fullName: "Elena Navarro",
    locationSlug: "centro",
    specialties: ["Peinado", "Tratamiento", "Corte"],
    color: "#7C3AED",
  },
  // ── Sede Norte ──
  {
    fullName: "Paula Gómez",
    locationSlug: "norte",
    specialties: ["Corte", "Color", "Mechas", "Peinado"],
    color: "#C2410C",
  },
  {
    fullName: "David Ortega",
    locationSlug: "norte",
    specialties: ["Corte", "Barbería"],
    color: "#0F766E",
  },
  {
    fullName: "Sara Molina",
    locationSlug: "norte",
    specialties: ["Color", "Mechas", "Tratamiento"],
    color: "#9333EA",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Catálogo de servicios (modelo de 3 fases + precios realistas en céntimos).
// ───────────────────────────────────────────────────────────────────────────

/** Un servicio del catálogo con su duración por fases y su PVP en céntimos. */
export interface DemoService {
  name: string;
  category: string;
  /** Fase 1: minutos de aplicación (profesional ocupado). ≥ 1. */
  applicationMin: number;
  /** Fase 2: minutos de exposición/procesado (profesional libre). ≥ 0. */
  exposureMin: number;
  /** Fase 3: minutos de post-exposición (aclarado/secado). ≥ 0. */
  postExposureMin: number;
  /** PVP en céntimos (IVA incl., como el resto del esquema de dinero). > 0. */
  priceCents: number;
}

/**
 * 23 servicios repartidos en 6 categorías (Corte, Peinado, Color, Mechas,
 * Tratamiento, Barbería). Duraciones por 3 fases coherentes con un salón real
 * (p. ej. un tinte ocupa al profesional al aplicar y al aclarar, pero lo libera
 * mientras el color "procesa") y precios de mercado en la zona de Madrid.
 */
export const DEMO_SERVICES: readonly DemoService[] = [
  // ── Corte ──
  { name: "Corte y peinado (mujer)", category: "Corte", applicationMin: 45, exposureMin: 0, postExposureMin: 0, priceCents: 2900 },
  { name: "Corte caballero", category: "Corte", applicationMin: 30, exposureMin: 0, postExposureMin: 0, priceCents: 1700 },
  { name: "Corte infantil", category: "Corte", applicationMin: 20, exposureMin: 0, postExposureMin: 0, priceCents: 1300 },
  { name: "Arreglo de flequillo", category: "Corte", applicationMin: 10, exposureMin: 0, postExposureMin: 0, priceCents: 700 },
  // ── Peinado ──
  { name: "Lavar y peinar", category: "Peinado", applicationMin: 30, exposureMin: 0, postExposureMin: 0, priceCents: 2000 },
  { name: "Peinado de fiesta", category: "Peinado", applicationMin: 45, exposureMin: 0, postExposureMin: 0, priceCents: 3800 },
  { name: "Recogido de novia", category: "Peinado", applicationMin: 60, exposureMin: 0, postExposureMin: 20, priceCents: 9500 },
  { name: "Ondas al agua", category: "Peinado", applicationMin: 35, exposureMin: 0, postExposureMin: 0, priceCents: 2800 },
  // ── Color ──
  { name: "Tinte raíz", category: "Color", applicationMin: 30, exposureMin: 25, postExposureMin: 15, priceCents: 3900 },
  { name: "Color completo", category: "Color", applicationMin: 40, exposureMin: 30, postExposureMin: 15, priceCents: 5400 },
  { name: "Baño de color", category: "Color", applicationMin: 20, exposureMin: 20, postExposureMin: 10, priceCents: 3000 },
  { name: "Corrección de color", category: "Color", applicationMin: 60, exposureMin: 45, postExposureMin: 20, priceCents: 8900 },
  // ── Mechas ──
  { name: "Mechas babylights", category: "Mechas", applicationMin: 50, exposureMin: 35, postExposureMin: 20, priceCents: 8500 },
  { name: "Balayage", category: "Mechas", applicationMin: 55, exposureMin: 40, postExposureMin: 20, priceCents: 9800 },
  { name: "Medias mechas", category: "Mechas", applicationMin: 40, exposureMin: 30, postExposureMin: 15, priceCents: 6200 },
  { name: "Mechas californianas", category: "Mechas", applicationMin: 50, exposureMin: 40, postExposureMin: 20, priceCents: 8900 },
  // ── Tratamiento ──
  { name: "Hidratación exprés", category: "Tratamiento", applicationMin: 10, exposureMin: 5, postExposureMin: 5, priceCents: 1500 },
  { name: "Tratamiento de keratina", category: "Tratamiento", applicationMin: 40, exposureMin: 40, postExposureMin: 20, priceCents: 12000 },
  { name: "Botox capilar", category: "Tratamiento", applicationMin: 45, exposureMin: 45, postExposureMin: 20, priceCents: 9000 },
  { name: "Ritual detox cuero cabelludo", category: "Tratamiento", applicationMin: 20, exposureMin: 10, postExposureMin: 5, priceCents: 2800 },
  { name: "Alisado permanente", category: "Tratamiento", applicationMin: 60, exposureMin: 60, postExposureMin: 30, priceCents: 15500 },
  // ── Barbería ──
  { name: "Arreglo de barba", category: "Barbería", applicationMin: 20, exposureMin: 0, postExposureMin: 0, priceCents: 1200 },
  { name: "Afeitado tradicional", category: "Barbería", applicationMin: 25, exposureMin: 0, postExposureMin: 0, priceCents: 1800 },
];

// ───────────────────────────────────────────────────────────────────────────
// Productos retail.
// ───────────────────────────────────────────────────────────────────────────

/** Un producto de venta (retail) del salón demo. */
export interface DemoProduct {
  name: string;
  description: string;
  /** PVP unitario en céntimos (IVA incl.). > 0. */
  priceCents: number;
  /** Tipo de IVA en porcentaje (peluquería/retail España: 21). */
  vatRate: number;
  /** Existencias iniciales (≥ 0). El salón demo lleva stock controlado. */
  stock: number;
}

/** Diez productos de peluquería con precios y stock realistas (IVA general 21 %). */
export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  { name: "Champú hidratante 300 ml", description: "Champú de uso diario para cabello seco.", priceCents: 1650, vatRate: 21, stock: 24 },
  { name: "Acondicionador reparador 300 ml", description: "Acondicionador para cabello dañado.", priceCents: 1650, vatRate: 21, stock: 20 },
  { name: "Mascarilla nutritiva 250 ml", description: "Mascarilla intensiva semanal.", priceCents: 2200, vatRate: 21, stock: 15 },
  { name: "Aceite de argán 100 ml", description: "Aceite de acabado y brillo.", priceCents: 2400, vatRate: 21, stock: 18 },
  { name: "Sérum anti-encrespamiento 100 ml", description: "Sérum de control del frizz.", priceCents: 1990, vatRate: 21, stock: 12 },
  { name: "Espuma de volumen 250 ml", description: "Espuma de fijación media con volumen.", priceCents: 1450, vatRate: 21, stock: 16 },
  { name: "Laca de fijación fuerte 400 ml", description: "Laca de fijación fuerte y larga duración.", priceCents: 1290, vatRate: 21, stock: 30 },
  { name: "Cera moldeadora mate 100 ml", description: "Cera de acabado mate para peinados con textura.", priceCents: 1390, vatRate: 21, stock: 22 },
  { name: "Protector térmico 200 ml", description: "Spray protector antes del calor.", priceCents: 1750, vatRate: 21, stock: 14 },
  { name: "Champú anticaída 250 ml", description: "Champú fortalecedor anticaída.", priceCents: 2600, vatRate: 21, stock: 10 },
];

// ───────────────────────────────────────────────────────────────────────────
// Funciones puras (reutilizadas por el seed y por los tests).
// ───────────────────────────────────────────────────────────────────────────

/** Duración total (minutos) de un servicio = suma de sus 3 fases. */
export function serviceTotalMinutes(service: DemoService): number {
  return service.applicationMin + service.exposureMin + service.postExposureMin;
}

/**
 * ¿El profesional presta el servicio? Es reservable con él si el servicio cae en
 * una de sus especialidades (`specialties` usa las mismas etiquetas que
 * `service.category`). Espejo puro de la tabla `professional_services`.
 */
export function professionalCoversService(
  professional: DemoProfessional,
  service: DemoService,
): boolean {
  return professional.specialties.includes(service.category);
}

/** Conjunto de categorías distintas presentes en el catálogo de servicios. */
export function serviceCategories(
  services: readonly DemoService[] = DEMO_SERVICES,
): string[] {
  return [...new Set(services.map((service) => service.category))];
}
