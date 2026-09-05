"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CategoryInput } from "@/lib/validations/menu";

export interface CategoryFormDefaults {
  name: string;
  /** Orden como cadena para casar con el estado de los inputs. */
  sortOrder: string;
}

const EMPTY_DEFAULTS: CategoryFormDefaults = { name: "", sortOrder: "0" };

interface CategoryFormProps {
  /** Prefijo de `id` único — evita colisiones si categoría y estación coexisten en el DOM. */
  idPrefix: string;
  /** Nombre de la entidad para los textos ("categoría" | "estación"). */
  entityLabel: string;
  defaultValues?: CategoryFormDefaults;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (input: CategoryInput) => void;
  onCancel: () => void;
}

/**
 * Formulario reutilizable de categoría/estación (crear y editar).
 *
 * `menu_categories` y `stations` comparten la misma forma —nombre + orden—
 * ({@link CategoryInput}, ver `stationSchema = categorySchema` en
 * `lib/validations/menu.ts`), así que un único componente sirve para ambas
 * pestañas de `carta-view.tsx` (parametrizado por `idPrefix`/`entityLabel`).
 */
export function CategoryForm({
  idPrefix,
  entityLabel,
  defaultValues = EMPTY_DEFAULTS,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: CategoryFormProps): React.ReactElement {
  const [values, setValues] = useState<CategoryFormDefaults>(defaultValues);

  function update<K extends keyof CategoryFormDefaults>(
    key: K,
    value: CategoryFormDefaults[K],
  ): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsedOrder = Number.parseInt(values.sortOrder, 10);
    onSubmit({
      name: values.name.trim(),
      sortOrder: Number.isFinite(parsedOrder) ? parsedOrder : 0,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>Nombre de la {entityLabel} *</Label>
        <Input
          id={`${idPrefix}-name`}
          required
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder={entityLabel === "estación" ? "Cocina, Barra…" : "Bebidas, Entrantes…"}
          maxLength={120}
        />
      </div>

      <div className="grid gap-2 sm:max-w-[10rem]">
        <Label htmlFor={`${idPrefix}-sort-order`}>Orden</Label>
        <Input
          id={`${idPrefix}-sort-order`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={values.sortOrder}
          onChange={(e) => update("sortOrder", e.target.value)}
        />
      </div>

      {error !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
