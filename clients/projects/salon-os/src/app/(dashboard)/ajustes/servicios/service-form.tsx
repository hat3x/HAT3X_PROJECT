"use client";

import { useState, type FormEvent } from "react";
import { Clock, Plus, Trash2 } from "lucide-react";

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
import { useSector } from "@/components/providers/sector-provider";
import { useProductsWithStock } from "@/hooks/use-stock";
import {
  useAddServiceMaterial,
  useRemoveServiceMaterial,
  useServiceMaterials,
  useUpdateServiceMaterialQty,
} from "@/hooks/use-service-material";
import type { ServiceMaterialWithProduct } from "@/lib/queries/service-material";
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
  /**
   * Salón activo — junto con `serviceId`, habilita la sección de escandallo
   * de materiales. Solo tiene sentido en EDICIÓN: en alta todavía no existe
   * un `service_id` real al que enlazar `service_material`.
   */
  salonId?: string;
  /** id del servicio en edición. `undefined` en alta (oculta la sección de materiales). */
  serviceId?: string;
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
  salonId,
  serviceId,
}: ServiceFormProps): React.ReactElement {
  const [values, setValues] = useState<ServiceFormDefaults>(defaultValues);

  // El modelo de 3 fases (aplicación/exposición/posterior) es propio de peluquería
  // (tintes: aplicar → reposar → después). En el resto de sectores (p. ej. odontología)
  // solo tiene sentido una duración única del tratamiento, que se guarda en
  // application_min; exposición y posterior quedan a 0.
  const phased = useSector() === "peluqueria";

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
    <form onSubmit={handleSubmit} className="grid gap-5 pt-1">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="name">Nombre *</Label>
          <Input
            id="name"
            required
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder={phased ? "Corte y peinado" : "Limpieza dental"}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="category">Categoría</Label>
          <Input
            id="category"
            value={values.category}
            onChange={(e) => update("category", e.target.value)}
            placeholder={phased ? "Peluquería, color, uñas…" : "Odontología, estética, cirugía…"}
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

      {phased ? (
        <fieldset className="grid gap-4 rounded-lg border border-border/70 bg-muted/30 p-4">
          <legend className="px-1.5 text-sm font-medium">Duración por fases</legend>
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
            className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Clock className="h-4 w-4 text-primary" />
            Duración total:{" "}
            <span className="font-semibold text-foreground">
              {totalMinutes} min
            </span>
          </p>
        </fieldset>
      ) : (
        // Sectores no-peluquería (p. ej. odontología): duración única del tratamiento.
        <div className="grid gap-2 sm:max-w-[16rem]">
          <Label htmlFor="application_min" className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" />
            Duración del tratamiento (min) *
          </Label>
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
      )}

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

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/70 px-3 py-2.5 text-sm transition-colors duration-150 ease-apple-out hover:bg-accent/40">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input accent-primary"
          checked={values.active}
          onChange={(e) => update("active", e.target.checked)}
        />
        Servicio activo (visible para reservas)
      </label>

      {salonId !== undefined && serviceId !== undefined ? (
        <ServiceMaterialSection salonId={salonId} serviceId={serviceId} />
      ) : null}

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

// ---------------------------------------------------------------------------
// ServiceMaterialSection — escandallo (BOM) de materiales del tratamiento
// (Fase 2 del inventario). Solo se monta en EDICIÓN (necesita un service_id
// real). Vive DENTRO del <form> de ServiceForm pero NO anida un <form> propio
// (inválido en HTML): "Añadir" es un botón type="button" con su propio
// manejador, independiente del submit del formulario padre.
// ---------------------------------------------------------------------------

interface ServiceMaterialSectionProps {
  salonId: string;
  serviceId: string;
}

function ServiceMaterialSection({
  salonId,
  serviceId,
}: ServiceMaterialSectionProps): React.ReactElement {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [formError, setFormError] = useState<string | null>(null);

  const materialsQuery = useServiceMaterials(salonId, serviceId);
  const productsQuery = useProductsWithStock(salonId);
  const addMutation = useAddServiceMaterial(salonId, serviceId);
  const removeMutation = useRemoveServiceMaterial(salonId, serviceId);
  const updateQtyMutation = useUpdateServiceMaterialQty(salonId, serviceId);

  function handleAdd(): void {
    setFormError(null);

    if (productId === "") {
      setFormError("Selecciona un producto.");
      return;
    }
    const qty = Number.parseInt(quantity, 10);
    if (!Number.isInteger(qty) || qty <= 0) {
      setFormError("Introduce una cantidad válida (entero > 0).");
      return;
    }

    addMutation.mutate(
      { serviceId, productId, quantity: qty },
      {
        onSuccess: () => {
          setProductId("");
          setQuantity("1");
        },
        onError: (err: unknown) => {
          setFormError(
            err instanceof Error ? err.message : "Error al añadir el material.",
          );
        },
      },
    );
  }

  const products = productsQuery.data ?? [];
  const materials = materialsQuery.data ?? [];

  return (
    <fieldset className="grid gap-3 rounded-lg border border-border/70 bg-muted/30 p-4">
      <legend className="px-1.5 text-sm font-medium">
        Materiales que consume este tratamiento
      </legend>

      {materialsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : materialsQuery.isError ? (
        <p className="text-sm text-destructive">
          {materialsQuery.error instanceof Error
            ? materialsQuery.error.message
            : "Error al cargar el escandallo."}
        </p>
      ) : materials.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Este tratamiento no consume materiales todavía.
        </p>
      ) : (
        <ul className="divide-y rounded-md border border-border/70 bg-background text-sm">
          {materials.map((m) => (
            <MaterialRow
              key={m.id}
              material={m}
              onRemove={() => removeMutation.mutate(m.id)}
              removing={removeMutation.isPending}
              onUpdateQuantity={(qty) =>
                updateQtyMutation.mutate({ id: m.id, quantity: qty })
              }
              updating={updateQtyMutation.isPending}
            />
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_6rem_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="material-product">Producto</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger id="material-product">
              <SelectValue placeholder="Selecciona un producto" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.unit})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="material-quantity">Cantidad</Label>
          <Input
            id="material-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleAdd}
          disabled={addMutation.isPending}
        >
          <Plus className="mr-2 h-4 w-4" />
          Añadir
        </Button>
      </div>

      {formError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// MaterialRow — una línea del escandallo, con edición de cantidad inline
// (input numérico local; confirma con `onBlur` solo si el valor cambió y es
// válido, sin necesidad de un botón "guardar" aparte).
// ---------------------------------------------------------------------------

interface MaterialRowProps {
  material: ServiceMaterialWithProduct;
  onRemove: () => void;
  removing: boolean;
  onUpdateQuantity: (quantity: number) => void;
  updating: boolean;
}

function MaterialRow({
  material,
  onRemove,
  removing,
  onUpdateQuantity,
  updating,
}: MaterialRowProps): React.ReactElement {
  const [qty, setQty] = useState(material.quantity.toString());

  function commitQuantity(): void {
    const parsed = Number.parseInt(qty, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      if (parsed !== material.quantity) {
        onUpdateQuantity(parsed);
      }
    } else {
      // Valor inválido: revierte al último valor persistido en vez de dejar
      // el input en un estado que no se corresponde con la BD.
      setQty(material.quantity.toString());
    }
  }

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <span className="flex-1 truncate">{material.product.name}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        className="w-16"
        aria-label={`Cantidad de ${material.product.name}`}
        value={qty}
        disabled={updating}
        onChange={(e) => setQty(e.target.value)}
        onBlur={commitQuantity}
      />
      <span className="w-10 shrink-0 text-xs text-muted-foreground">
        {material.product.unit}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Quitar ${material.product.name} del escandallo`}
        disabled={removing}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </li>
  );
}
