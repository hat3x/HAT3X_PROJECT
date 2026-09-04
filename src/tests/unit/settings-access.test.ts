/**
 * Quién entra a cada sección de Ajustes.
 *
 * ── EL CASO QUE LO MOTIVA ───────────────────────────────────────────────────
 * Kristel, higienista de Biodental, no podía entrar a Ajustes: el área entera
 * estaba cerrada a owner/manager. Pero hay cosas ahí dentro que son suyas —su
 * propio horario— y otras que no tienen nada de sensible, como el tema claro
 * u oscuro.
 *
 * ── EL CRITERIO ─────────────────────────────────────────────────────────────
 * Se abre a `staff` lo que no puede hacer daño ni revelar nada:
 *
 *   · apariencia → una preferencia visual de su propia pantalla;
 *   · horarios   → PERO solo el suyo, nunca el de la clínica ni el de otros;
 *   · gabinetes  → operativo del día a día, sin dinero ni datos de nadie.
 *
 * Queda fuera todo lo que toca dinero (servicios y sus precios, fiscal,
 * mutuas, complementos), la estructura del negocio (sedes, datos, marca) y —
 * sobre todo— `personal`, que es donde se reparten los roles: dar eso a staff
 * sería dejar que cualquiera se ascienda a dueño.
 *
 * `equipos` también queda fuera aunque suene inofensivo: es donde se configura
 * el sensor de rayos, y tocarlo por error deja a la clínica sin radiografías.
 */
import { describe, it, expect } from "vitest";

import {
  ALL_SETTINGS_SECTIONS,
  accessibleSettingsSections,
  canAccessSettingsSection,
  canEditProfessionalSchedule,
  canEnterSettings,
  canManageSalonSchedule,
  type SettingsSection,
} from "@/lib/settings/access";
import type { MemberRole } from "@/types/database";

const STAFF_PERMITIDAS: SettingsSection[] = ["apariencia", "horarios", "gabinetes"];

describe("canAccessSettingsSection", () => {
  it("owner y manager siguen entrando a TODO, como hasta ahora", () => {
    // Esta funcionalidad AÑADE permisos a staff; no puede quitarle ninguno a
    // quien ya los tenía.
    for (const rol of ["owner", "manager"] as MemberRole[]) {
      for (const seccion of ALL_SETTINGS_SECTIONS) {
        expect(canAccessSettingsSection(seccion, rol), `${rol} → ${seccion}`).toBe(true);
      }
    }
  });

  it("staff entra exactamente a las tres secciones inofensivas", () => {
    for (const seccion of STAFF_PERMITIDAS) {
      expect(canAccessSettingsSection(seccion, "staff"), seccion).toBe(true);
    }
  });

  it("staff NO entra a nada mas", () => {
    const prohibidas = ALL_SETTINGS_SECTIONS.filter((s) => !STAFF_PERMITIDAS.includes(s));
    for (const seccion of prohibidas) {
      expect(canAccessSettingsSection(seccion, "staff"), seccion).toBe(false);
    }
  });

  it("staff NO llega a personal: ahi se reparten los roles", () => {
    // El más importante de la lista. Con acceso aquí, cualquiera se asciende.
    expect(canAccessSettingsSection("personal", "staff")).toBe(false);
  });

  it("staff NO llega a lo que toca dinero", () => {
    for (const seccion of ["servicios", "fiscal", "mutuas", "complementos"] as SettingsSection[]) {
      expect(canAccessSettingsSection(seccion, "staff"), seccion).toBe(false);
    }
  });

  it("sin rol no se entra a ningun sitio", () => {
    for (const seccion of ALL_SETTINGS_SECTIONS) {
      expect(canAccessSettingsSection(seccion, null), seccion).toBe(false);
      expect(canAccessSettingsSection(seccion, undefined), seccion).toBe(false);
    }
  });

  it("una seccion desconocida se deniega, no se permite por defecto", () => {
    // Si mañana alguien añade una sección y olvida declararla aquí, que quede
    // cerrada. Lo contrario es abrir un agujero por descuido.
    expect(canAccessSettingsSection("inventada" as SettingsSection, "staff")).toBe(false);
    expect(canAccessSettingsSection("inventada" as SettingsSection, "owner")).toBe(false);
  });
});

describe("accessibleSettingsSections", () => {
  it("devuelve las tres de staff, en el orden del menu", () => {
    expect(accessibleSettingsSections("staff")).toEqual(["gabinetes", "horarios", "apariencia"]);
  });

  it("devuelve todas para owner", () => {
    expect(accessibleSettingsSections("owner")).toEqual([...ALL_SETTINGS_SECTIONS]);
  });

  it("sin rol, ninguna", () => {
    expect(accessibleSettingsSections(null)).toEqual([]);
  });
});

describe("canEnterSettings", () => {
  it("staff YA puede entrar al area de ajustes", () => {
    // Este es el fallo que reporto Kristel: el area entera la rebotaba.
    expect(canEnterSettings("staff")).toBe(true);
  });

  it("owner y manager tambien, claro", () => {
    expect(canEnterSettings("owner")).toBe(true);
    expect(canEnterSettings("manager")).toBe(true);
  });

  it("sin rol, no", () => {
    expect(canEnterSettings(null)).toBe(false);
    expect(canEnterSettings(undefined)).toBe(false);
  });

  it("se deriva de las secciones: quien no tiene ninguna, no entra", () => {
    // No es una lista aparte que pueda quedarse desincronizada.
    for (const rol of ["owner", "manager", "staff"] as MemberRole[]) {
      expect(canEnterSettings(rol)).toBe(accessibleSettingsSections(rol).length > 0);
    }
  });
});

describe("canManageSalonSchedule", () => {
  it("el horario de la CLINICA solo lo tocan owner y manager", () => {
    // Kristel entra a Horarios, pero abrir o cerrar la clínica afecta a todo el
    // mundo. Ella solo edita el suyo.
    expect(canManageSalonSchedule("owner")).toBe(true);
    expect(canManageSalonSchedule("manager")).toBe(true);
  });

  it("staff NO toca el horario de la clinica", () => {
    expect(canManageSalonSchedule("staff")).toBe(false);
  });

  it("sin rol, no", () => {
    expect(canManageSalonSchedule(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// "Horarios, pero solo el suyo"
// ---------------------------------------------------------------------------

describe("canEditProfessionalSchedule", () => {
  const KRISTEL = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const NICOLAS = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  it("owner y manager editan el horario de cualquiera", () => {
    for (const rol of ["owner", "manager"] as MemberRole[]) {
      expect(canEditProfessionalSchedule(rol, null, NICOLAS), rol).toBe(true);
      expect(canEditProfessionalSchedule(rol, KRISTEL, NICOLAS), rol).toBe(true);
    }
  });

  it("staff edita el SUYO", () => {
    expect(canEditProfessionalSchedule("staff", KRISTEL, KRISTEL)).toBe(true);
  });

  it("staff NO edita el de otro", () => {
    // El caso que importa: aunque la pantalla no se lo ofrezca, alguien puede
    // mandar la petición a mano con otro id. Esto es lo que lo para.
    expect(canEditProfessionalSchedule("staff", KRISTEL, NICOLAS)).toBe(false);
  });

  it("staff sin profesional vinculado no edita ninguno", () => {
    // Sin vínculo no hay forma de saber cuál es "el suyo". Adivinarlo sería
    // peor que negarlo.
    expect(canEditProfessionalSchedule("staff", null, KRISTEL)).toBe(false);
  });

  it("sin rol, nada", () => {
    expect(canEditProfessionalSchedule(null, KRISTEL, KRISTEL)).toBe(false);
    expect(canEditProfessionalSchedule(undefined, KRISTEL, KRISTEL)).toBe(false);
  });
});
