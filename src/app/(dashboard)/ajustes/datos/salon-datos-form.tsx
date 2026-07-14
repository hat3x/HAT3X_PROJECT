"use client";

import { useState, type FormEvent } from "react";
import { Store } from "lucide-react";

import { SaveStatus } from "@/app/(dashboard)/ajustes/save-status";
import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateSalon } from "@/hooks/use-salon-settings";
import { COMMON_TIMEZONES } from "@/lib/booking/timezone";
import { salonSettingsSchema } from "@/lib/validations/salon";
import type { Salon } from "@/types/database";

interface SalonDatosFormProps {
  salon: Salon;
}

interface FormValues {
  name: string;
  timezone: string;
  phone: string;
  email: string;
  address: string;
}

function toFormValues(salon: Salon): FormValues {
  return {
    name: salon.name,
    timezone: salon.timezone,
    phone: salon.phone ?? "",
    email: salon.email ?? "",
    address: salon.address ?? "",
  };
}

/**
 * Formulario de los datos generales del salón (nombre, zona horaria y
 * contacto). Valida en cliente con el mismo esquema Zod del servidor y muestra
 * feedback de éxito/error en línea. La persistencia se delega en
 * `useUpdateSalon`.
 */
export function SalonDatosForm({ salon }: SalonDatosFormProps): React.ReactElement {
  const [values, setValues] = useState<FormValues>(() => toFormValues(salon));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const mutation = useUpdateSalon(salon.id);

  // Aseguramos que la zona actual del salón aparezca en el selector aunque no
  // esté en la lista curada; así nunca se pierde el valor persistido.
  const timezoneOptions = COMMON_TIMEZONES.includes(values.timezone)
    ? COMMON_TIMEZONES
    : [values.timezone, ...COMMON_TIMEZONES];

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]): void {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldError(null);
    setSaved(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaved(false);

    // Validación en cliente (feedback inmediato); el Server Action revalida.
    const parsed = salonSettingsSchema.safeParse(values);
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
        icon={Store}
        title="Datos del salón"
        description="Nombre, zona horaria y datos de contacto de tu salón."
      />
      <Card className="animate-fade-up [animation-delay:60ms]">
      <form onSubmit={handleSubmit}>
        <CardContent className="grid gap-5 pt-6">
          <div className="grid gap-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              required
              value={values.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Mi salón"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="timezone">Zona horaria *</Label>
            <Select
              value={values.timezone}
              onValueChange={(value) => update("timezone", value)}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Selecciona una zona horaria" />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Determina la hora local de horarios y citas.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                type="tel"
                value={values.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="600123123"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={values.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="hola@misalon.com"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="address">Dirección</Label>
            <Textarea
              id="address"
              value={values.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Calle, número, ciudad…"
            />
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
