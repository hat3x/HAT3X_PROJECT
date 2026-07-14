"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify, type LocationInput } from "@/lib/validations/location";

export interface LocationFormDefaults {
  name: string;
  slug: string;
  address: string;
  phone: string;
}

const EMPTY_DEFAULTS: LocationFormDefaults = {
  name: "",
  slug: "",
  address: "",
  phone: "",
};

interface LocationFormProps {
  defaultValues?: LocationFormDefaults;
  /** En edición no autocompletamos el slug desde el nombre (evita romper enlaces). */
  autoSlug?: boolean;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (input: LocationInput) => void;
  onCancel: () => void;
}

/**
 * Formulario reutilizable de una sede (crear y editar). Mantiene su propio
 * estado y delega la persistencia en el padre.
 *
 * Al crear, el slug se autocompleta a partir del nombre mientras el usuario no
 * lo edite a mano; una vez tocado, deja de sincronizarse.
 */
export function LocationForm({
  defaultValues = EMPTY_DEFAULTS,
  autoSlug = true,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: LocationFormProps): React.ReactElement {
  const [values, setValues] = useState<LocationFormDefaults>(defaultValues);
  const [slugEdited, setSlugEdited] = useState(!autoSlug);

  function update<K extends keyof LocationFormDefaults>(
    key: K,
    value: LocationFormDefaults[K],
  ): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleNameChange(name: string): void {
    setValues((prev) => ({
      ...prev,
      name,
      slug: slugEdited ? prev.slug : slugify(name),
    }));
  }

  function handleSlugChange(slug: string): void {
    setSlugEdited(true);
    update("slug", slug);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({
      name: values.name,
      slug: values.slug,
      address: values.address,
      phone: values.phone,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 pt-1">
      <div className="grid gap-2">
        <Label htmlFor="name">Nombre de la sede *</Label>
        <Input
          id="name"
          required
          value={values.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Collado Villalba"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="slug">Identificador (slug) *</Label>
        <Input
          id="slug"
          required
          value={values.slug}
          onChange={(e) => handleSlugChange(e.target.value)}
          placeholder="collado-villalba"
          inputMode="text"
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby="slug-help"
        />
        <p id="slug-help" className="text-xs text-muted-foreground">
          Solo minúsculas, números y guiones. Único dentro del salón.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="address">Dirección</Label>
        <Textarea
          id="address"
          value={values.address}
          onChange={(e) => update("address", e.target.value)}
          placeholder="C/ Real 12, 28400 Collado Villalba, Madrid"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="phone">Teléfono</Label>
        <Input
          id="phone"
          type="tel"
          value={values.phone}
          onChange={(e) => update("phone", e.target.value)}
          placeholder="918 000 000"
        />
      </div>

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
