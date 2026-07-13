"use client";

import { useState, type FormEvent } from "react";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceInput } from "@/lib/validations/service";

export interface ServiceFormDefaults {
  name: string;
  category: string;
  description: string;
  /** Minutos como cadena para casar con el estado de los inputs. */
  application_min: string;
  exposure_min: string;
  post_exposure_min: string;
  /** Precio en euros (cadena; se convierte a céntimos al validar). */
  price: string;
  active: boolean;
}

const EMPTY_DEFAULTS: ServiceFormDefaults = {
  name: "",
  category: "",
  description: "",
  application_min: "",
  exposure_min: "",
  post_exposure_min: "",
  price: "",
  active: true,
};

interface ServiceFormProps {
  defaultValues?: ServiceFormDefaults;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (input: ServiceInput) => void;
  onCancel: () => void;
}

/** Convierte una cadena de minutos a entero; 0 si no es un número válido. */
function toMinutes(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Formulario reutilizable de un servicio (crear y editar).
 *
 * Modelo de 3 fases: la aplicación es obligatoria (≥ 1 min) y las otras dos
 * fases son opcionales (default 0). La duración total se calcula en vivo a
 * partir de las tres fases; en la base de datos es una columna generada, por
 * lo que aquí es solo informativa.
 */
export function ServiceForm({
  defaultValues = EMPTY_DEFAULTS,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: ServiceFormProps): React.ReactElement {
  const [values, setValues] = useState<ServiceFormDefaults>(defaultValues);

  function update<K extends keyof ServiceFormDefaults>(
    key: K,
    value: ServiceFormDefaults[K],
  ): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const totalMinutes =
    toMinutes(values.application_min) +
    toMinutes(values.exposure_min) +
    toMinutes(values.post_exposure_min);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({
      name: values.name,
      category: values.category,
      description: values.description,
      application_min: values.application_min,
      exposure_min: values.exposure_min,
      post_exposure_min: values.post_exposure_min,
      price: values.price,
      active: values.active,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="name">Nombre *</Label>
          <Input
            id="name"
            required
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Corte y peinado"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="category">Categoría</Label>
          <Input
            id="category"
            value={values.category}
            onChange={(e) => update("category", e.target.value)}
            placeholder="Peluquería, color, uñas…"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Detalles del servicio, incluye/excluye, notas…"
        />
      </div>

      <fieldset className="grid gap-3 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">Duración por fases</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="application_min">Aplicación (min) *</Label>
            <Input
              id="application_min"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              value={values.application_min}
              onChange={(e) => update("application_min", e.target.value)}
              placeholder="30"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="exposure_min">Exposición (min)</Label>
            <Input
              id="exposure_min"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values.exposure_min}
              onChange={(e) => update("exposure_min", e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="post_exposure_min">Posterior (min)</Label>
            <Input
              id="post_exposure_min"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values.post_exposure_min}
              onChange={(e) => update("post_exposure_min", e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          aria-live="polite"
        >
          <Clock className="h-4 w-4" />
          Duración total:{" "}
          <span className="font-semibold text-foreground">
            {totalMinutes} min
          </span>
        </p>
      </fieldset>

      <div className="grid gap-2 sm:max-w-[12rem]">
        <Label htmlFor="price">Precio (€) *</Label>
        <Input
          id="price"
          type="text"
          inputMode="decimal"
          required
          value={values.price}
          onChange={(e) => update("price", e.target.value)}
          placeholder="25,00"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          checked={values.active}
          onChange={(e) => update("active", e.target.checked)}
        />
        Servicio activo (visible para reservas)
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
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
