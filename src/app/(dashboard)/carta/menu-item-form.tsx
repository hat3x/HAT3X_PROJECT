"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useMenuCategories, useSaveMenuProduct, useStations } from "@/hooks/use-menu";
import type { MenuProductInput } from "@/lib/validations/menu";
import type { Allergen, Product } from "@/types/database";

/** Tipos de IVA vigentes en España (porcentaje); orden pedido en el brief. */
const VAT_RATES = [10, 21, 4, 0] as const;

/**
 * Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011).
 * Exportado para que `carta-view.tsx` muestre el mismo texto en la tabla de
 * productos, sin duplicar las 14 etiquetas.
 */
export const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: "Gluten",
  crustaceos: "Crustáceos",
  huevos: "Huevos",
  pescado: "Pescado",
  cacahuetes: "Cacahuetes",
  soja: "Soja",
  lacteos: "Lácteos",
  frutos_cascara: "Frutos de cáscara",
  apio: "Apio",
  mostaza: "Mostaza",
  sesamo: "Sésamo",
  sulfitos: "Sulfitos",
  altramuces: "Altramuces",
  moluscos: "Moluscos",
};
const ALLERGEN_ORDER = Object.keys(ALLERGEN_LABELS) as Allergen[];

/** Sentinela de "sin selección" — Radix `Select.Item` no admite `value=""`. */
const NONE = "__none__";

interface MenuItemFormProps {
  salonId: string;
  /** Producto a editar; `undefined`/`null` (por defecto) = alta de un producto nuevo. */
  product?: Product | null;
  /** Se invoca tras guardar con éxito (p. ej. para cerrar el diálogo contenedor). */
  onSaved?: () => void;
}

/** Céntimos → cadena de euros con coma decimal, para precargar el campo de precio. */
function centsToEuroString(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Formulario de un producto de la carta (crear y editar).
 *
 * El precio se teclea en EUROS (con coma o punto decimal) y se convierte a
 * céntimos justo antes de guardar — `Math.round(Number(valor.replace(",",
 * ".")) * 100)`, la misma fórmula que fija el contrato de este formulario.
 * El payload de `useSaveMenuProduct().mutate` es PLANO, con los nombres de
 * `MenuProductInput` (name, priceCents, vatRate, categoryId, stationId,
 * allergens, isCombo, imageUrl) más un `id` opcional que decide alta vs
 * edición — igual que `ProductForm`/`ServiceForm` construyen su payload.
 */
export function MenuItemForm({
  salonId,
  product = null,
  onSaved,
}: MenuItemFormProps): React.ReactElement {
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(
    product !== null ? centsToEuroString(product.price_cents) : "",
  );
  const [vatRate, setVatRate] = useState(String(product?.vat_rate ?? 10));
  const [categoryId, setCategoryId] = useState(product?.category_id ?? NONE);
  const [stationId, setStationId] = useState(product?.station_id ?? NONE);
  const [allergens, setAllergens] = useState<Allergen[]>(product?.allergens ?? []);
  const [isCombo, setIsCombo] = useState(product?.is_combo ?? false);
  const [formError, setFormError] = useState<string | null>(null);

  const categoriesQuery = useMenuCategories(salonId);
  const stationsQuery = useStations(salonId);
  const saveMutation = useSaveMenuProduct(salonId);

  const categories = categoriesQuery.data ?? [];
  const stations = stationsQuery.data ?? [];

  function toggleAllergen(allergen: Allergen, checked: boolean): void {
    setAllergens((prev) =>
      checked ? [...prev, allergen] : prev.filter((a) => a !== allergen),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    if (trimmedName === "") {
      setFormError("El nombre es obligatorio.");
      return;
    }

    const priceCents = Math.round(Number(price.replace(",", ".")) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setFormError("Introduce un precio válido.");
      return;
    }

    const payload: MenuProductInput & { id?: string } = {
      name: trimmedName,
      priceCents,
      vatRate: Number(vatRate),
      categoryId: categoryId === NONE ? null : categoryId,
      stationId: stationId === NONE ? null : stationId,
      allergens,
      isCombo,
      imageUrl: product?.image_url ?? null,
    };
    if (product !== null) {
      payload.id = product.id;
    }

    saveMutation.mutate(payload, {
      onSuccess: () => {
        onSaved?.();
      },
    });
  }

  const errorMessage =
    formError ?? (saveMutation.isError ? saveMutation.error.message : null);

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="menu-item-name">Nombre *</Label>
          <Input
            id="menu-item-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Caña"
            maxLength={200}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="menu-item-price">Precio (€) *</Label>
          <Input
            id="menu-item-price"
            inputMode="decimal"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="1,80"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="menu-item-vat">IVA</Label>
          <Select value={vatRate} onValueChange={(value) => setVatRate(value)}>
            <SelectTrigger id="menu-item-vat">
              <SelectValue placeholder="IVA" />
            </SelectTrigger>
            <SelectContent>
              {VAT_RATES.map((rate) => (
                <SelectItem key={rate} value={String(rate)}>
                  {rate}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="menu-item-category">Categoría</Label>
          <Select value={categoryId} onValueChange={(value) => setCategoryId(value)}>
            <SelectTrigger id="menu-item-category">
              <SelectValue placeholder="Sin categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin categoría</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="menu-item-station">Estación</Label>
          <Select value={stationId} onValueChange={(value) => setStationId(value)}>
            <SelectTrigger id="menu-item-station">
              <SelectValue placeholder="Sin estación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin estación</SelectItem>
              {stations.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="grid gap-3 rounded-lg border border-border/70 p-4">
        <legend className="px-1.5 text-sm font-medium">Alérgenos</legend>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {ALLERGEN_ORDER.map((allergen) => (
            <label
              key={allergen}
              htmlFor={`allergen-${allergen}`}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                id={`allergen-${allergen}`}
                checked={allergens.includes(allergen)}
                onCheckedChange={(checked) => toggleAllergen(allergen, checked === true)}
              />
              {ALLERGEN_LABELS[allergen]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5 text-sm">
        <span>
          Es combo
          <span className="block text-xs font-normal text-muted-foreground">
            Se compone de otros productos (gestiona sus piezas en la pestaña Combos).
          </span>
        </span>
        <Switch checked={isCombo} onCheckedChange={(checked) => setIsCombo(checked)} />
      </label>

      {errorMessage !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
