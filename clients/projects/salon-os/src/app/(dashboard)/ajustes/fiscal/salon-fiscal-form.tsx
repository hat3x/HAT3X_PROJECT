"use client";

import { useState, type FormEvent } from "react";
import { Receipt } from "lucide-react";

import { SaveStatus } from "@/app/(dashboard)/ajustes/save-status";
import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateSalonFiscal } from "@/hooks/use-salon-settings";
import { salonFiscalSchema } from "@/lib/validations/salon-fiscal";
import type { Salon } from "@/types/database";

interface SalonFiscalFormProps {
  salon: Salon;
}

interface FormValues {
  tax_id: string;
  legal_name: string;
  fiscal_address: string;
}

function toFormValues(salon: Salon): FormValues {
  return {
    tax_id: salon.tax_id ?? "",
    legal_name: salon.legal_name ?? "",
    fiscal_address: salon.fiscal_address ?? "",
  };
}

/**
 * Formulario de los datos fiscales del salón (emisor de facturas): NIF/CIF,
 * razón social y domicilio fiscal. Valida en cliente con el mismo esquema Zod
 * del servidor y muestra feedback de éxito/error en línea. La persistencia se
 * delega en `useUpdateSalonFiscal`.
 *
 * Mismo layout que el formulario de datos generales para mantener la coherencia
 * visual de la sección de ajustes.
 */
export function SalonFiscalForm({
  salon,
}: SalonFiscalFormProps): React.ReactElement {
  const [values, setValues] = useState<FormValues>(() => toFormValues(salon));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const mutation = useUpdateSalonFiscal(salon.id);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]): void {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldError(null);
    setSaved(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaved(false);

    // Validación en cliente (feedback inmediato); el Server Action revalida.
    const parsed = salonFiscalSchema.safeParse(values);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Datos no válidos");
      return;
    }
    setFieldError(null);

    mutation.mutate(values, {
      onSuccess: () => setSaved(true),
    });
  }

  const errorMessage =
    fieldError ?? (mutation.isError ? mutation.error.message : null);

  return (
    <div>
      <SectionHeader
        icon={Receipt}
        title="Datos fiscales"
        description="Identificación fiscal del salón como emisor de facturas. Aparecerán en las facturas completas que emitas."
      />
      <Card className="animate-fade-up [animation-delay:60ms]">
      <form onSubmit={handleSubmit}>
        <CardContent className="grid gap-5 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="tax_id">NIF / CIF</Label>
              <Input
                id="tax_id"
                value={values.tax_id}
                onChange={(e) => update("tax_id", e.target.value)}
                placeholder="B12345678"
                autoComplete="off"
                inputMode="text"
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground">
                Admite prefijo de país para IVA intracomunitario (p. ej.
                ES B12345678).
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="legal_name">Razón social</Label>
              <Input
                id="legal_name"
                value={values.legal_name}
                onChange={(e) => update("legal_name", e.target.value)}
                placeholder="Mi Salón, S.L."
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                Nombre jurídico; puede diferir del nombre comercial.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fiscal_address">Domicilio fiscal</Label>
            <Textarea
              id="fiscal_address"
              value={values.fiscal_address}
              onChange={(e) => update("fiscal_address", e.target.value)}
              placeholder="Calle, número, código postal, ciudad, provincia…"
            />
            <p className="text-xs text-muted-foreground">
              Tal como debe figurar en factura; puede diferir de la dirección de
              la sede física.
            </p>
          </div>

          <SaveStatus error={errorMessage} saved={saved} />
        </CardContent>

        <CardFooter className="justify-end border-t border-border/60 pt-6">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </CardFooter>
      </form>
      </Card>
    </div>
  );
}
