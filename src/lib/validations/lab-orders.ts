import { z } from "zod";

export const createLabOrderSchema = z.object({
  kind: z.enum(["modelo", "retenedor", "alineadores", "ortopedia", "otro"]),
  labName: z.string().trim().max(200).nullable().default(null),
  sentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  notes: z.string().trim().max(2000).nullable().default(null),
});

export type CreateLabOrderInput = z.input<typeof createLabOrderSchema>;

export const markLabDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
});

export type MarkLabDateInput = z.input<typeof markLabDateSchema>;
