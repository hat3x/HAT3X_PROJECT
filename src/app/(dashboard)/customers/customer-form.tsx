"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CustomerInput } from "@/lib/validations/customer";

export interface CustomerFormDefaults {
  full_name: string;
  email: string;
  phone: string;
  birth_date: string;
  notes: string;
  marketing_consent: boolean;
}

const EMPTY_DEFAULTS: CustomerFormDefaults = {
  full_name: "",
  email: "",
  phone: "",
  birth_date: "",
  notes: "",
  marketing_consent: false,
};

interface CustomerFormProps {
  defaultValues?: CustomerFormDefaults;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (input: CustomerInput) => void;
  onCancel: () => void;
}

/**
 * Formulario reutilizable de la ficha de cliente (crear y editar).
 * Mantiene su propio estado y delega la persistencia en el padre.
 */
export function CustomerForm({
  defaultValues = EMPTY_DEFAULTS,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: CustomerFormProps): React.ReactElement {
  const [values, setValues] = useState<CustomerFormDefaults>(defaultValues);

  function update<K extends keyof CustomerFormDefaults>(
    key: K,
    value: CustomerFormDefaults[K],
  ): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({
      full_name: values.full_name,
      email: values.email,
      phone: values.phone,
      birth_date: values.birth_date,
      notes: values.notes,
      marketing_consent: values.marketing_consent,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="full_name">Nombre completo *</Label>
        <Input
          id="full_name"
          required
          value={values.full_name}
          onChange={(e) => update("full_name", e.target.value)}
          placeholder="Ana García"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="ana@email.com"
          />
        </div>
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
      </div>

      <div className="grid gap-2">
        <Label htmlFor="birth_date">Fecha de nacimiento</Label>
        <Input
          id="birth_date"
          type="date"
          value={values.birth_date}
          onChange={(e) => update("birth_date", e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea
          id="notes"
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Alergias, preferencias, observaciones…"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          checked={values.marketing_consent}
          onChange={(e) => update("marketing_consent", e.target.checked)}
        />
        Consiente comunicaciones de marketing
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
