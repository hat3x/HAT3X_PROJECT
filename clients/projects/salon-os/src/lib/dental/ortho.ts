/** Dominio de ortodoncia (Fase 1): tipos, valores por defecto y etiquetas ES. Puro, sin IO. */

export type MalocclusionClass = "I" | "II-1" | "II-2" | "III";
export type CrowdingLevel = "ninguno" | "leve" | "moderado" | "severo";
export type Crossbite = "ninguna" | "anterior" | "posterior";
export type ApplianceType =
  | "brackets_metalicos"
  | "brackets_esteticos"
  | "alineadores"
  | "ortopedia";
export type OrthoArch = "superior" | "inferior" | "ambas";
export type OrthoStatus = "activo" | "retencion" | "finalizado" | "cancelado";

export interface OrthoFicha {
  malocclusionClass: MalocclusionClass | null;
  crowdingUpper: CrowdingLevel | null;
  crowdingLower: CrowdingLevel | null;
  diastema: boolean;
  diastemaNote: string | null;
  crossbite: Crossbite | null;
  overjetMm: number | null;
  overbiteMm: number | null;
  openBite: boolean;
  diagnosisNotes: string | null;
}

export interface OrthoTreatment {
  applianceType: ApplianceType | null;
  arch: OrthoArch | null;
  estimatedMonths: number | null;
  startDate: string | null; // ISO "YYYY-MM-DD"
  status: OrthoStatus | null;
  objectives: string | null;
  alignerTotal: number | null;
}

export interface OrthoData {
  ficha: OrthoFicha;
  treatment: OrthoTreatment;
}

export interface OrthoVisitActions {
  wireChange: boolean;
  wireDetail: string | null;
  ligatures: boolean;
  elastics: boolean;
  elasticsDetail: string | null;
  alignerDelivered: number | null;
}

export const EMPTY_ORTHO_FICHA: OrthoFicha = {
  malocclusionClass: null,
  crowdingUpper: null,
  crowdingLower: null,
  diastema: false,
  diastemaNote: null,
  crossbite: null,
  overjetMm: null,
  overbiteMm: null,
  openBite: false,
  diagnosisNotes: null,
};

export const EMPTY_ORTHO_TREATMENT: OrthoTreatment = {
  applianceType: null,
  arch: null,
  estimatedMonths: null,
  startDate: null,
  status: null,
  objectives: null,
  alignerTotal: null,
};

export const MALOCCLUSION_CLASS_LABELS: Record<MalocclusionClass, string> = {
  I: "Clase I",
  "II-1": "Clase II división 1",
  "II-2": "Clase II división 2",
  III: "Clase III",
};

export const CROWDING_LEVEL_LABELS: Record<CrowdingLevel, string> = {
  ninguno: "Ninguno",
  leve: "Leve",
  moderado: "Moderado",
  severo: "Severo",
};

export const CROSSBITE_LABELS: Record<Crossbite, string> = {
  ninguna: "Ninguna",
  anterior: "Anterior",
  posterior: "Posterior",
};

export const APPLIANCE_TYPE_LABELS: Record<ApplianceType, string> = {
  brackets_metalicos: "Brackets metálicos",
  brackets_esteticos: "Brackets estéticos",
  alineadores: "Alineadores invisibles",
  ortopedia: "Ortopedia",
};

export const ORTHO_ARCH_LABELS: Record<OrthoArch, string> = {
  superior: "Superior",
  inferior: "Inferior",
  ambas: "Ambas",
};

export const ORTHO_STATUS_LABELS: Record<OrthoStatus, string> = {
  activo: "Activo",
  retencion: "Retención",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};
