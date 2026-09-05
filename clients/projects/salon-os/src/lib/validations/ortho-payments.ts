import { z } from "zod";

export const createOrthoPlanSchema = z
  .object({
    totalCents: z.number().int().min(1),
    downPaymentCents: z.number().int().min(0),
    installmentCount: z.number().int().min(1).max(120),
    dayOfMonth: z.number().int().min(1).max(31),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .refine((v) => v.downPaymentCents <= v.totalCents, {
    message: "La entrada no puede superar el total",
    path: ["downPaymentCents"],
  })
  .refine((v) => v.totalCents - v.downPaymentCents >= v.installmentCount, {
    message: "El importe a financiar es menor que el número de cuotas",
    path: ["installmentCount"],
  });

export type CreateOrthoPlanInput = z.input<typeof createOrthoPlanSchema>;
export type CreateOrthoPlanValues = z.output<typeof createOrthoPlanSchema>;

export const payInstallmentSchema = z.object({
  method: z.enum(["efectivo", "tarjeta", "transferencia", "otro"]),
});

export type PayInstallmentInput = z.input<typeof payInstallmentSchema>;
