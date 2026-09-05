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
import { Textarea } from "@/components/ui/textarea";
import type { ProductInput } from "@/lib/validations/product";

/** Tipos de IVA vigentes en España (porcentaje). */
const VAT_RATES = ["21", "10", "4", "0"] as const;

export interface ProductFormDefaults {
  name: string;
  description: string;
  /** Precio en euros como texto (p. ej. "12,50"). */
  price: string;
  /** Tipo de IVA en porcentaje como texto (p. ej. "21"). */
  vat_rate: string;
  /** Stock como texto; vacío = producto no inventariado. */
  stock: string;
  /** Mínimo de reposición como texto; vacío = 0 (sin umbral especial). */
  min_stock: string;
  /** Unidad de medida (p. ej. "unidad", "ml", "ampolla"); vacío = "unidad". */
  unit: string;
  active: boolean;
}

const EMPTY_DEFAULTS: ProductFormDefaults = {
  name: "",
  description: "",
  price: "",
  vat_rate: "21",
  stock: "",
  min_stock: "0",
  unit: "unidad",
  active: true,
};

interface ProductFormProps {
  defaultValues?: ProductFormDefaults;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (input: ProductInput) => void;
  onCancel: () => void;
}

/**
 * Formulario reutilizable del catálogo de productos (crear y editar).
 * Mantiene su propio estado y delega la persistencia en el padre.
 */
export function ProductForm({
  defaultValues = EMPTY_DEFAULTS,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: ProductFormProps): React.ReactElement {
  const [values, setValues] = useState<ProductFormDefaults>(defaultValues);
  // El stock se controla con un interruptor: activo → inventariado.
  const [trackStock, setTrackStock] = useState<boolean>(
    defaultValues.stock !== "",
  );

  function update<K extends keyof ProductFormDefaults>(
    key: K,
    value: ProductFormDefaults[K],
  ): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({
      name: values.name,
      description: values.description,
      price: values.price,
      vat_rate: values.vat_rate,
      // Si no se controla stock, se envía "" → null en el esquema.
      stock: trackStock ? values.stock : "",
      // Mínimo/unidad solo tienen sentido si se controla stock; si no, van al
      // valor por defecto del esquema ("" → 0 / "unidad").
      min_stock: trackStock ? values.min_stock : "",
      unit: trackStock ? values.unit : "",
      active: values.active,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Nombre *</Label>
        <Input
          id="name"
          required
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Champú hidratante 250 ml"
          maxLength={120}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Detalles, formato, marca…"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="price">Precio (€) *</Label>
          <Input
            id="price"
            required
            inputMode="decimal"
            value={values.price}
            onChange={(e) => update("price", e.target.value)}
            placeholder="12,50"
          />
          <p className="text-xs text-muted-foreground">Precio con IVA incluido.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="vat_rate">IVA</Label>
          <Select
            value={values.vat_rate}
            onValueChange={(value) => update("vat_rate", value)}
          >
            <SelectTrigger id="vat_rate">
              <SelectValue placeholder="Tipo de IVA" />
            </SelectTrigger>
            <SelectContent>
              {VAT_RATES.map((rate) => (
                <SelectItem key={rate} value={rate}>
                  {rate}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="grid gap-3 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">
          Inventario{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={trackStock}
            onChange={(e) => setTrackStock(e.target.checked)}
          />
          Controlar stock de este producto
        </label>
        {trackStock ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="stock">Unidades en stock</Label>
              <Input
                id="stock"
                inputMode="numeric"
                value={values.stock}
                onChange={(e) => update("stock", e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="min_stock">Mínimo de reposición</Label>
              <Input
                id="min_stock"
                inputMode="numeric"
                value={values.min_stock}
                onChange={(e) => update("min_stock", e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="unit">Unidad</Label>
              <Input
                id="unit"
                value={values.unit}
                onChange={(e) => update("unit", e.target.value)}
                placeholder="unidad, ml, ampolla…"
                maxLength={20}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Sin control de stock: el producto siempre estará disponible para
            vender.
          </p>
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          checked={values.active}
          onChange={(e) => update("active", e.target.checked)}
        />
        Producto activo (disponible en el TPV)
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
