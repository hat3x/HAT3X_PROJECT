/**
 * Quién entra a cada sección de Ajustes.
 *
 * ── EL CASO QUE LO MOTIVA ───────────────────────────────────────────────────
 * Kristel, higienista de Biodental, no podía entrar a Ajustes. El área entera
 * estaba cerrada a owner/manager, y eso metía en el mismo saco cosas que sí son
 * suyas —su propio horario— con cosas que no debe ver nadie más que la dueña.
 *
 * ── EL CRITERIO ─────────────────────────────────────────────────────────────
 * A `staff` se le abre solo lo que no puede hacer daño ni revelar nada:
 * apariencia (una preferencia de su pantalla), horarios (el SUYO) y gabinetes
 * (operativa del día). Todo lo demás sigue igual que estaba.
 *
 * Fuera queda lo que toca dinero, lo que define el negocio y, sobre todo,
 * `personal`: ahí se reparten los roles, y dárselo a staff sería permitir que
 * cualquiera se ascienda a dueño.
 *
 * `equipos` también queda fuera pese a sonar inofensivo — es donde se configura
 * el sensor de rayos, y tocarlo por error deja a la clínica sin radiografías.
 *
 * ── SE DENIEGA POR DEFECTO ──────────────────────────────────────────────────
 * La tabla dice quién SÍ entra. Una sección que no aparezca queda cerrada para
 * todo el mundo, incluido el dueño: si mañana alguien añade una pantalla y
 * olvida declararla aquí, el fallo es "no se ve", no "lo ve cualquiera".
 */

import type { MemberRole } from "@/types/database";

/** Las secciones de /ajustes, en el orden en que salen en el menú. */
export const ALL_SETTINGS_SECTIONS = [
  "sedes",
  "servicios",
  "mutuas",
  "gabinetes",
  "equipos",
  "personal",
  "horarios",
  "datos",
  "fiscal",
  "marca",
  "apariencia",
  "complementos",
] as const;

export type SettingsSection = (typeof ALL_SETTINGS_SECTIONS)[number];

/**
 * Roles que pueden entrar a cada sección.
 *
 * Se declara sección por sección, y no como "staff puede X" al revés, para que
 * añadir una pantalla obligue a decidir explícitamente quién la ve.
 */
const SECTION_ROLES: Record<SettingsSection, readonly MemberRole[]> = {
  // Estructura y dinero del negocio: sin cambios.
  sedes: ["owner", "manager"],
  servicios: ["owner", "manager"],
  mutuas: ["owner", "manager"],
  datos: ["owner", "manager"],
  fiscal: ["owner", "manager"],
  marca: ["owner", "manager"],
  complementos: ["owner", "manager"],
  // Reparto de roles: el más delicado de todos.
  personal: ["owner", "manager"],
  // Configuración del sensor de rayos: romperlo deja la clínica sin imágenes.
  equipos: ["owner", "manager"],

  // ── Lo que se abre a staff ────────────────────────────────────────────────
  /** Sillones de la clínica: operativa del día, sin dinero ni datos de nadie. */
  gabinetes: ["owner", "manager", "staff"],
  /** Horarios. OJO: staff solo ve el suyo — ver `canManageSalonSchedule`. */
  horarios: ["owner", "manager", "staff"],
  /** Tema claro/oscuro: una preferencia de su propia pantalla. */
  apariencia: ["owner", "manager", "staff"],
};

/** `true` si ese rol puede abrir esa sección. Deniega lo que no reconoce. */
export function canAccessSettingsSection(
  section: SettingsSection,
  role: MemberRole | null | undefined,
): boolean {
  if (role === null || role === undefined) return false;
  const permitidos = SECTION_ROLES[section];
  // Una sección que no esté en la tabla no existe a efectos de permisos.
  if (permitidos === undefined) return false;
  return permitidos.includes(role);
}

/** Las secciones que ese rol puede abrir, en el orden del menú. */
export function accessibleSettingsSections(
  role: MemberRole | null | undefined,
): SettingsSection[] {
  return ALL_SETTINGS_SECTIONS.filter((section) => canAccessSettingsSection(section, role));
}

/**
 * `true` si ese rol puede entrar al área de ajustes.
 *
 * Se deriva de las secciones en vez de ser una lista aparte: así no puede
 * quedarse desincronizada: quien no tenga ni una sección, no entra.
 */
export function canEnterSettings(role: MemberRole | null | undefined): boolean {
  return accessibleSettingsSections(role).length > 0;
}

/**
 * `true` si ese rol puede tocar el horario de la CLÍNICA (el semanal y los días
 * sueltos), no solo el suyo.
 *
 * Es la mitad importante de "horarios, pero solo el suyo": staff entra a la
 * sección, pero abrir o cerrar la clínica afecta a la agenda de todo el mundo.
 */
export function canManageSalonSchedule(role: MemberRole | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

/**
 * `true` si ese rol puede editar el horario de ESE profesional.
 *
 * ── LA MITAD QUE DE VERDAD PROTEGE ──────────────────────────────────────────
 * Ocultar en la pantalla los profesionales que no son tuyos es cosmética:
 * quien sepa mandar una petición a mano puede pedir cualquier id. Esta es la
 * comprobación que se hace en el servidor, y la que decide.
 *
 * Owner y manager editan el de cualquiera —es su trabajo—. `staff` solo el
 * suyo, y para eso hace falta que su usuario esté vinculado a un profesional
 * (`professionals.user_id`). Si no lo está, no edita ninguno: sin vínculo no
 * hay forma de saber cuál es "el suyo", y adivinarlo sería peor que negarlo.
 */
export function canEditProfessionalSchedule(
  role: MemberRole | null | undefined,
  ownProfessionalId: string | null,
  targetProfessionalId: string,
): boolean {
  if (role === "owner" || role === "manager") return true;
  if (role !== "staff") return false;
  if (ownProfessionalId === null) return false;
  return ownProfessionalId === targetProfessionalId;
}
