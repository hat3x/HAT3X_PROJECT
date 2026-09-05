import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().default(null);

export const orthoFichaSchema = z.object({
  malocclusionClass: z.enum(["I", "II-1", "II-2", "III"]).nullable().default(null),
  crowdingUpper: z.enum(["ninguno", "leve", "moderado", "severo"]).nullable().default(null),
  crowdingLower: z.enum(["ninguno", "leve", "moderado", "severo"]).nullable().default(null),
  diastema: z.boolean().default(false),
  diastemaNote: optionalText(500),
  crossbite: z.enum(["ninguna", "anterior", "posterior"]).nullable().default(null),
  overjetMm: z.number().min(-20).max(40).nullable().default(null),
  overbiteMm: z.number().min(-20).max(40).nullable().default(null),
  openBite: z.boolean().default(false),
  diagnosisNotes: optionalText(4000),
});

export const orthoTreatmentSchema = z.object({
  applianceType: z
    .enum(["brackets_metalicos", "brackets_esteticos", "alineadores", "ortopedia"])
    .nullable()
    .default(null),
  arch: z.enum(["superior", "inferior", "ambas"]).nullable().default(null),
  estimatedMonths: z.number().int().min(1).max(120).nullable().default(null),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida").nullable().default(null),
  status: z.enum(["activo", "retencion", "finalizado", "cancelado"]).nullable().default(null),
  objectives: optionalText(4000),
  alignerTotal: z.number().int().min(1).max(120).nullable().default(null),
});

export const orthoDataSchema = z.object({
  ficha: orthoFichaSchema,
  treatment: orthoTreatmentSchema,
});

export type OrthoDataInput = z.input<typeof orthoDataSchema>;
export type OrthoDataValues = z.output<typeof orthoDataSchema>;

export const orthoVisitActionsSchema = z.object({
  wireChange: z.boolean().default(false),
  wireDetail: optionalText(300),
  ligatures: z.boolean().default(false),
  elastics: z.boolean().default(false),
  elasticsDetail: optionalText(300),
  alignerDelivered: z.number().int().min(0).max(200).nullable().default(null),
});

export const orthoVisitSchema = z.object({
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  appointmentId: z.string().uuid().nullable().default(null),
  actions: orthoVisitActionsSchema,
  notes: optionalText(4000),
  nextStep: optionalText(1000),
});

export type OrthoVisitInput = z.input<typeof orthoVisitSchema>;
export type OrthoVisitValues = z.output<typeof orthoVisitSchema>;
