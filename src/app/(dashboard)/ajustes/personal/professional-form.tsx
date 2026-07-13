"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGENDA_COLORS,
  type ProfessionalInput,
} from "@/lib/validations/professional";
import { cn } from "@/lib/utils";
import type { Location, Service } from "@/types/database";

export interface ProfessionalFormDefaults {
  full_name: string;
  email: string;
  phone: string;
  location_id: string;
  color: string;
  /** Especialidades como texto separado por comas. */
  specialties: string;
  /** Ids de los servicios que presta el profesional. */
  service_ids: string[];
  active: boolean;
}

const EMPTY_DEFAULTS: ProfessionalFormDefaults = {
  full_name: "",
  email: "",
  phone: "",
  location_id: "",
  color: "#6366f1",
  specialties: "",
  service_ids: [],
  active: true,
};

interface ProfessionalFormProps {
  defaultValues?: ProfessionalFormDefaults;
  /** Sedes disponibles para asignar (del propio salón). */
  locations: Location[];
  /** Catálogo de servicios del salón para la relación N:M. */
  services: Service[];
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (input: ProfessionalInput) => void;
  onCancel: () => void;
}

/**
 * Formulario reutilizable de un profesional (crear y editar).
 *
 * Incluye el selector de sede (obligatorio), el selector múltiple de servicios
 * (relación N:M) y el color de agenda. La validación de confianza vive en el
 * Server Action; aquí solo se recogen y tipan los valores.
 */
export function ProfessionalForm({
  defaultValues = EMPTY_DEFAULTS,
  locations,
  services,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: ProfessionalFormProps): React.ReactElement {
  const [values, setValues] = useState<ProfessionalFormDefaults>(defaultValues);

  function update<K extends keyof ProfessionalFormDefaults>(
    key: K,
    value: ProfessionalFormDefaults[K],
  ): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleService(serviceId: string): void {
    setValues((prev) => ({
      ...prev,
      service_ids: prev.service_ids.includes(serviceId)
        ? prev.service_ids.filter((id) => id !== serviceId)
        : [...prev.service_ids, serviceId],
    }));
  }

  const hasLocations = locations.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({
      full_name: values.full_name,
      email: values.email,
      phone: values.phone,
      location_id: values.location_id,
      color: values.color,
      specialties: values.specialties,
      service_ids: values.service_ids,
      active: values.active,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="full_name">Nombre *</Label>
          <Input
            id="full_name"
            required
            value={values.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            placeholder="Lucía Fernández"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="location_id">Sede *</Label>
          <Select
            value={values.location_id}
            onValueChange={(value) => update("location_id", value)}
          >
            <SelectTrigger id="location_id" aria-label="Sede">
              <SelectValue placeholder="Selecciona una sede" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                  {location.active ? "" : " (inactiva)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!hasLocations ? (
            <p className="text-xs text-muted-foreground">
              Aún no hay sedes. Crea una en Ajustes → Sedes antes de dar de alta
              personal.
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="lucia@salon.com"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input
            id="phone"
            type="tel"
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="600 123 456"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="specialties">Especialidades</Label>
        <Input
          id="specialties"
          value={values.specialties}
          onChange={(e) => update("specialties", e.target.value)}
          placeholder="Color, mechas, peinados (separadas por comas)"
        />
        <p className="text-xs text-muted-foreground">
          Escribe las etiquetas separadas por comas.
        </p>
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Color de agenda *</legend>
        <div className="flex flex-wrap items-center gap-2">
          {AGENDA_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              aria-pressed={values.color.toLowerCase() === color.toLowerCase()}
              onClick={() => update("color", color)}
              className={cn(
                "h-8 w-8 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                values.color.toLowerCase() === color.toLowerCase()
                  ? "ring-2 ring-ring ring-offset-2"
                  : "border-input",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">Color personalizado</span>
            <input
              type="color"
              aria-label="Color personalizado"
              value={values.color}
              onChange={(e) => update("color", e.target.value)}
              className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Servicios que presta</legend>
        {services.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aún no hay servicios en el catálogo. Créalos en Ajustes → Servicios.
          </p>
        ) : (
          <div className="max-h-48 overflow-y-auto rounded-md border p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {services.map((service) => (
                <label
                  key={service.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={values.service_ids.includes(service.id)}
                    onChange={() => toggleService(service.id)}
                  />
                  <span>
                    {service.name}
                    {service.active ? "" : " (inactivo)"}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {values.service_ids.length} servicio(s) seleccionado(s).
        </p>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          checked={values.active}
          onChange={(e) => update("active", e.target.checked)}
        />
        Profesional activo (disponible para reservas)
      </label>

      {error !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !hasLocations}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
