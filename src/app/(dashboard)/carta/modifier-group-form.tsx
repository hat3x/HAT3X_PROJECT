"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useModifierOptions, useSaveModifierGroup } from "@/hooks/use-menu";
import type { ModifierGroup } from "@/types/database";

/** Una opción del grupo en edición local (precio en euros como texto, coma decimal). */
interface OptionRow {
  name: string;
  priceDeltaEuros: string;
}

const EMPTY_OPTION: OptionRow = { name: "", priceDeltaEuros: "0" };

interface ModifierGroupFormProps {
  salonId: string;
  /** Grupo a editar; `undefined`/`null` (por defecto) = alta de un grupo nuevo. */
  group?: ModifierGroup | null;
  onSaved?: () => void;
  onCancel: () => void;
}

/** Céntimos → cadena de euros con coma decimal (mismo criterio que el precio del producto). */
function centsToEuroString(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Formulario de un grupo de modificadores (crear y editar) con su lista
 * dinámica de opciones (añadir/quitar filas, sin `<form>` anidado — el botón
 * "Añadir opción" es `type="button"`, igual que `ServiceMaterialSection` en
 * `ajustes/servicios/service-form.tsx`).
 *
 * `saveModifierGroup` (Server Action) SIEMPRE reemplaza las opciones del
 * grupo por las del payload — por eso, al EDITAR, este formulario precarga
 * las opciones actuales vía `useModifierOptions` antes de dejar guardar: sin
 * esa precarga, abrir "editar" y pulsar "Guardar" borraría todas las
 * opciones existentes.
 */
export function ModifierGroupForm({
  salonId,
  group = null,
  onSaved,
  onCancel,
}: ModifierGroupFormProps): React.ReactElement {
  const [name, setName] = useState(group?.name ?? "");
  const [minSelect, setMinSelect] = useState(String(group?.min_select ?? 0));
  const [maxSelect, setMaxSelect] = useState(String(group?.max_select ?? 1));
  const [required, setRequired] = useState(group?.required ?? false);
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [optionsReady, setOptionsReady] = useState(group === null);
  const [formError, setFormError] = useState<string | null>(null);

  const optionsQuery = useModifierOptions(salonId, group?.id ?? null);
  const saveMutation = useSaveModifierGroup(salonId);

  // Precarga las opciones actuales del grupo en cuanto llegan (solo una vez,
  // en edición); en alta `optionsReady` ya empieza en `true` (lista vacía).
  useEffect(() => {
    if (optionsReady || optionsQuery.data === undefined) return;
    setOptions(
      optionsQuery.data.map((m) => ({
        name: m.name,
        priceDeltaEuros: centsToEuroString(m.price_delta_cents),
      })),
    );
    setOptionsReady(true);
  }, [optionsReady, optionsQuery.data]);

  function updateOption(index: number, patch: Partial<OptionRow>): void {
    setOptions((prev) =>
      prev.map((option, i) => (i === index ? { ...option, ...patch } : option)),
    );
  }

  function removeOption(index: number): void {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    if (trimmedName === "") {
      setFormError("El nombre es obligatorio.");
      return;
    }

    const min = Number.parseInt(minSelect, 10);
    const max = Number.parseInt(maxSelect, 10);
    const safeMin = Number.isFinite(min) && min >= 0 ? min : 0;
    const safeMax = Number.isFinite(max) && max >= 1 ? max : 1;
    if (safeMin > safeMax) {
      setFormError("El mínimo no puede superar al máximo.");
      return;
    }

    const parsedOptions = options
      .map((option) => ({
        name: option.name.trim(),
        priceDeltaCents: Math.round(Number(option.priceDeltaEuros.replace(",", ".")) * 100),
      }))
      .filter((option) => option.name !== "");

    saveMutation.mutate(
      {
        id: group?.id ?? null,
        name: trimmedName,
        minSelect: safeMin,
        maxSelect: safeMax,
        required,
        modifiers: parsedOptions,
      },
      { onSuccess: () => onSaved?.() },
    );
  }

  const errorMessage =
    formError ?? (saveMutation.isError ? saveMutation.error.message : null);
  const loadingOptions = group !== null && !optionsReady;

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="modifier-group-name">Nombre *</Label>
        <Input
          id="modifier-group-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Punto de la carne, Extras…"
          maxLength={120}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="modifier-group-min">Mínimo</Label>
          <Input
            id="modifier-group-min"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={minSelect}
            onChange={(e) => setMinSelect(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="modifier-group-max">Máximo</Label>
          <Input
            id="modifier-group-max"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={maxSelect}
            onChange={(e) => setMaxSelect(e.target.value)}
          />
        </div>
        <label className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2.5 text-sm">
          Obligatorio
          <Switch checked={required} onCheckedChange={(checked) => setRequired(checked)} />
        </label>
      </div>

      <fieldset className="grid gap-3 rounded-lg border border-border/70 p-4">
        <legend className="px-1.5 text-sm font-medium">Opciones</legend>

        {loadingOptions ? (
          <p className="text-sm text-muted-foreground">Cargando opciones…</p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este grupo no tiene opciones todavía.
          </p>
        ) : (
          <ul className="grid gap-2">
            {options.map((option, index) => (
              <li key={index} className="flex items-center gap-2">
                <Input
                  aria-label={`Nombre de la opción ${index + 1}`}
                  value={option.name}
                  onChange={(e) => updateOption(index, { name: e.target.value })}
                  placeholder="Poco hecho"
                  className="flex-1"
                />
                <Input
                  inputMode="decimal"
                  aria-label={`Suplemento de la opción ${index + 1} en euros`}
                  value={option.priceDeltaEuros}
                  onChange={(e) => updateOption(index, { priceDeltaEuros: e.target.value })}
                  placeholder="0,00"
                  className="w-24"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar la opción ${index + 1}`}
                  onClick={() => removeOption(index)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => setOptions((prev) => [...prev, { ...EMPTY_OPTION }])}
          disabled={loadingOptions}
        >
          <Plus className="mr-2 h-4 w-4" />
          Añadir opción
        </Button>
      </fieldset>

      {errorMessage !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saveMutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saveMutation.isPending || loadingOptions}>
          {saveMutation.isPending ? "Guardando…" : "Guardar grupo"}
        </Button>
      </DialogFooter>
    </form>
  );
}
