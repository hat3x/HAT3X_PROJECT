"use client";

import { useEffect, useState } from "react";
import { Layers, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";

import { ALLERGEN_LABELS, MenuItemForm } from "@/app/(dashboard)/carta/menu-item-form";
import { CategoryForm } from "@/app/(dashboard)/carta/category-form";
import { CsvImportDialog } from "@/app/(dashboard)/carta/csv-import-dialog";
import { ModifierGroupForm } from "@/app/(dashboard)/carta/modifier-group-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useComboComponents,
  useCreateCategory,
  useCreateStation,
  useDeleteCategory,
  useDeleteMenuProduct,
  useDeleteStation,
  useMenuCategories,
  useMenuProducts,
  useModifierGroups,
  useProductModifierGroups,
  useSaveCombo,
  useSetProductModifierGroups,
  useStations,
} from "@/hooks/use-menu";
import { formatMoney } from "@/lib/format";
import type { MenuCategory, ModifierGroup, Product, Station } from "@/types/database";

interface CartaViewProps {
  salonId: string;
}

/**
 * Backoffice de la carta (restauración): 4 pestañas —Categorías, Productos,
 * Modificadores, Combos— más el importador CSV. Cada pestaña lista con su
 * hook de lectura de `@/hooks/use-menu` y abre el formulario correspondiente
 * en un `Dialog`, siguiendo el mismo patrón (Table + Dialog crear/editar +
 * Dialog de confirmación de borrado) que `products/products-view.tsx`.
 */
export function CartaView({ salonId }: CartaViewProps): React.ReactElement {
  return (
    <main className="container py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Carta</h1>
          <p className="text-muted-foreground">
            Categorías, productos, modificadores y combos de tu carta.
          </p>
        </div>
        <CsvImportDialog salonId={salonId} />
      </div>

      <Tabs defaultValue="categorias">
        <TabsList>
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="modificadores">Modificadores</TabsTrigger>
          <TabsTrigger value="combos">Combos</TabsTrigger>
        </TabsList>

        <TabsContent value="categorias">
          <div className="grid gap-6 lg:grid-cols-2">
            <CategoriesSection salonId={salonId} />
            <StationsSection salonId={salonId} />
          </div>
        </TabsContent>

        <TabsContent value="productos">
          <ProductsSection salonId={salonId} />
        </TabsContent>

        <TabsContent value="modificadores">
          <ModifiersSection salonId={salonId} />
        </TabsContent>

        <TabsContent value="combos">
          <CombosSection salonId={salonId} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Categorías / Estaciones — misma forma (nombre + orden), comparten
// `CategoryForm`; cada sección es su propia tarjeta con lista + alta + borrado.
// ─────────────────────────────────────────────────────────────────────────────

function CategoriesSection({ salonId }: { salonId: string }): React.ReactElement {
  const categoriesQuery = useMenuCategories(salonId);
  const createMutation = useCreateCategory(salonId);
  const deleteMutation = useDeleteCategory(salonId);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<MenuCategory | null>(null);

  const categories = categoriesQuery.data ?? [];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Categorías</h2>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Nueva
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva categoría</DialogTitle>
                <DialogDescription>Añade una categoría a la carta.</DialogDescription>
              </DialogHeader>
              <CategoryForm
                idPrefix="category"
                entityLabel="categoría"
                submitLabel="Crear categoría"
                pending={createMutation.isPending}
                error={
                  createMutation.error instanceof Error ? createMutation.error.message : null
                }
                onCancel={() => setCreateOpen(false)}
                onSubmit={(input) =>
                  createMutation.mutate(input, { onSuccess: () => setCreateOpen(false) })
                }
              />
            </DialogContent>
          </Dialog>
        </div>

        {categoriesQuery.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay categorías.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {categories.map((category) => (
              <li
                key={category.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span>{category.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${category.name}`}
                  onClick={() => setDeleting(category)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            deleteMutation.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar categoría</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres eliminar «{deleting?.name}»? Los productos de esta
              categoría quedarán sin categoría.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.error instanceof Error ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteMutation.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleting === null) return;
                deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
              }}
            >
              {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StationsSection({ salonId }: { salonId: string }): React.ReactElement {
  const stationsQuery = useStations(salonId);
  const createMutation = useCreateStation(salonId);
  const deleteMutation = useDeleteStation(salonId);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<Station | null>(null);

  const stations = stationsQuery.data ?? [];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Estaciones</h2>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Nueva
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva estación</DialogTitle>
                <DialogDescription>
                  Añade un punto de producción (cocina, barra, plancha…).
                </DialogDescription>
              </DialogHeader>
              <CategoryForm
                idPrefix="station"
                entityLabel="estación"
                submitLabel="Crear estación"
                pending={createMutation.isPending}
                error={
                  createMutation.error instanceof Error ? createMutation.error.message : null
                }
                onCancel={() => setCreateOpen(false)}
                onSubmit={(input) =>
                  createMutation.mutate(input, { onSuccess: () => setCreateOpen(false) })
                }
              />
            </DialogContent>
          </Dialog>
        </div>

        {stationsQuery.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : stations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay estaciones.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {stations.map((station) => (
              <li
                key={station.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span>{station.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${station.name}`}
                  onClick={() => setDeleting(station)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            deleteMutation.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar estación</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres eliminar «{deleting?.name}»? Los productos de esta
              estación quedarán sin estación.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.error instanceof Error ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteMutation.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleting === null) return;
                deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
              }}
            >
              {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Productos — tabla con alta/edición (`MenuItemForm`), borrado y el selector
// de grupos de modificadores por producto (`ProductModifierGroupsDialog`).
// ─────────────────────────────────────────────────────────────────────────────

function ProductsSection({ salonId }: { salonId: string }): React.ReactElement {
  const productsQuery = useMenuProducts(salonId);
  const categoriesQuery = useMenuCategories(salonId);
  const stationsQuery = useStations(salonId);
  const deleteMutation = useDeleteMenuProduct(salonId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [modifiersFor, setModifiersFor] = useState<Product | null>(null);

  const products = productsQuery.data ?? [];
  const categoryNameById = new Map(
    (categoriesQuery.data ?? []).map((category) => [category.id, category.name]),
  );
  const stationNameById = new Map(
    (stationsQuery.data ?? []).map((station) => [station.id, station.name]),
  );

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Productos</h2>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Nuevo producto
            </Button>
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nuevo producto</DialogTitle>
                <DialogDescription>Añade un producto a la carta.</DialogDescription>
              </DialogHeader>
              <MenuItemForm salonId={salonId} onSaved={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {productsQuery.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : products.length === 0 ? (
          <div className="py-10 text-center">
            <UtensilsCrossed className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Aún no hay productos. Crea el primero o importa un CSV.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Estación</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="w-[1%] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">
                    {product.name}
                    {product.allergens.length > 0 ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {product.allergens.map((allergen) => ALLERGEN_LABELS[allergen]).join(", ")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(product.price_cents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {product.vat_rate}%
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.category_id !== null
                      ? categoryNameById.get(product.category_id) ?? "—"
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.station_id !== null
                      ? stationNameById.get(product.station_id) ?? "—"
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {product.is_combo ? (
                      <Badge variant="secondary">Combo</Badge>
                    ) : (
                      <Badge variant="outline">Simple</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Modificadores de ${product.name}`}
                        onClick={() => setModifiersFor(product)}
                      >
                        <Layers className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${product.name}`}
                        onClick={() => setEditing(product)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar ${product.name}`}
                        onClick={() => setDeleting(product)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar producto</DialogTitle>
            <DialogDescription>Actualiza los datos del producto.</DialogDescription>
          </DialogHeader>
          {editing !== null ? (
            <MenuItemForm
              key={editing.id}
              salonId={salonId}
              product={editing}
              onSaved={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            deleteMutation.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar producto</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres eliminar «{deleting?.name}»? Esta acción no se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.error instanceof Error ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteMutation.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleting === null) return;
                deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
              }}
            >
              {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductModifierGroupsDialog
        salonId={salonId}
        product={modifiersFor}
        onClose={() => setModifiersFor(null)}
      />
    </Card>
  );
}

/**
 * Selector de grupos de modificadores de UN producto. `setProductModifierGroups`
 * (Server Action) SIEMPRE reemplaza la asignación completa — por eso precarga
 * la asignación actual vía `useProductModifierGroups` antes de dejar guardar,
 * igual que `ModifierGroupForm` precarga las opciones al editar un grupo.
 */
function ProductModifierGroupsDialog({
  salonId,
  product,
  onClose,
}: {
  salonId: string;
  product: Product | null;
  onClose: () => void;
}): React.ReactElement {
  const groupsQuery = useModifierGroups(salonId);
  const assignedQuery = useProductModifierGroups(salonId, product?.id ?? null);
  const setMutation = useSetProductModifierGroups(salonId);
  const [selected, setSelected] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (product === null) {
      setReady(false);
      return;
    }
    if (assignedQuery.data !== undefined) {
      setSelected(assignedQuery.data);
      setReady(true);
    }
  }, [product, assignedQuery.data]);

  const groups = groupsQuery.data ?? [];

  function toggle(groupId: string, checked: boolean): void {
    setSelected((prev) => (checked ? [...prev, groupId] : prev.filter((id) => id !== groupId)));
  }

  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modificadores de {product?.name}</DialogTitle>
          <DialogDescription>
            Elige los grupos de modificadores que se ofrecen con este producto.
          </DialogDescription>
        </DialogHeader>

        {!ready ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay grupos de modificadores. Créalos en la pestaña Modificadores.
          </p>
        ) : (
          <ul className="grid gap-2">
            {groups.map((group) => (
              <li key={group.id}>
                <label className="flex items-center gap-2 text-sm" htmlFor={`pmg-${group.id}`}>
                  <Checkbox
                    id={`pmg-${group.id}`}
                    checked={selected.includes(group.id)}
                    onCheckedChange={(checked) => toggle(group.id, checked === true)}
                  />
                  {group.name}
                </label>
              </li>
            ))}
          </ul>
        )}

        {setMutation.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {setMutation.error.message}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={setMutation.isPending}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={setMutation.isPending || !ready}
            onClick={() => {
              if (product === null) return;
              setMutation.mutate(
                { productId: product.id, groupIds: selected },
                { onSuccess: onClose },
              );
            }}
          >
            {setMutation.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modificadores — lista de grupos con alta/edición (`ModifierGroupForm`). No
// hay borrado de grupo: no existe todavía una Server Action `deleteModifierGroup`
// (fuera del alcance de esta tarea de UI; ver informe).
// ─────────────────────────────────────────────────────────────────────────────

function ModifiersSection({ salonId }: { salonId: string }): React.ReactElement {
  const groupsQuery = useModifierGroups(salonId);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ModifierGroup | null>(null);

  const groups = groupsQuery.data ?? [];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Grupos de modificadores</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Nuevo grupo
          </Button>
        </div>

        {groupsQuery.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay grupos de modificadores.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Mín.</TableHead>
                <TableHead className="text-right">Máx.</TableHead>
                <TableHead>Obligatorio</TableHead>
                <TableHead className="w-[1%] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{group.min_select}</TableCell>
                  <TableCell className="text-right tabular-nums">{group.max_select}</TableCell>
                  <TableCell>
                    {group.required ? (
                      <Badge variant="secondary">Sí</Badge>
                    ) : (
                      <Badge variant="outline">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${group.name}`}
                      onClick={() => setEditing(group)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo grupo de modificadores</DialogTitle>
            <DialogDescription>
              Define sus opciones y cuántas puede elegir el cliente.
            </DialogDescription>
          </DialogHeader>
          <ModifierGroupForm
            salonId={salonId}
            onCancel={() => setCreateOpen(false)}
            onSaved={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar grupo</DialogTitle>
            <DialogDescription>
              Guardar reemplaza TODAS las opciones del grupo por las de este formulario.
            </DialogDescription>
          </DialogHeader>
          {editing !== null ? (
            <ModifierGroupForm
              key={editing.id}
              salonId={salonId}
              group={editing}
              onCancel={() => setEditing(null)}
              onSaved={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Combos — elige un producto marcado como combo y define de qué piezas se
// compone (`ComboEditor`), con ruteo por estación opcional por pieza.
// ─────────────────────────────────────────────────────────────────────────────

function CombosSection({ salonId }: { salonId: string }): React.ReactElement {
  const productsQuery = useMenuProducts(salonId);
  const [comboProductId, setComboProductId] = useState<string | null>(null);

  const products = productsQuery.data ?? [];
  const combos = products.filter((product) => product.is_combo);
  const pieces = products.filter((product) => !product.is_combo);

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="mb-2 text-lg font-semibold">Combos</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Marca un producto como combo desde la pestaña Productos y define aquí de qué
          piezas se compone.
        </p>

        {productsQuery.isPending ? (
          <Skeleton className="h-10 w-full max-w-sm" />
        ) : combos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay ningún producto marcado como combo.
          </p>
        ) : (
          <div className="grid gap-2 sm:max-w-sm">
            <Select value={comboProductId ?? ""} onValueChange={(value) => setComboProductId(value)}>
              <SelectTrigger aria-label="Elige un combo">
                <SelectValue placeholder="Elige un combo" />
              </SelectTrigger>
              <SelectContent>
                {combos.map((combo) => (
                  <SelectItem key={combo.id} value={combo.id}>
                    {combo.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {comboProductId !== null ? (
          <ComboEditor
            key={comboProductId}
            salonId={salonId}
            comboProductId={comboProductId}
            pieces={pieces}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

interface PieceRow {
  componentProductId: string;
  qty: string;
  stationIdOverride: string;
}

/** Sentinela de "usar la estación por defecto del producto" para el override por pieza. */
const COMBO_STATION_DEFAULT = "__default__";

function ComboEditor({
  salonId,
  comboProductId,
  pieces,
}: {
  salonId: string;
  comboProductId: string;
  pieces: Product[];
}): React.ReactElement {
  const componentsQuery = useComboComponents(salonId, comboProductId);
  const stationsQuery = useStations(salonId);
  const saveMutation = useSaveCombo(salonId);
  const [rows, setRows] = useState<PieceRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready || componentsQuery.data === undefined) return;
    setRows(
      componentsQuery.data.map((piece) => ({
        componentProductId: piece.component_product_id,
        qty: String(piece.qty),
        stationIdOverride: piece.station_id_override ?? COMBO_STATION_DEFAULT,
      })),
    );
    setReady(true);
  }, [ready, componentsQuery.data]);

  const stations = stationsQuery.data ?? [];

  function updateRow(index: number, patch: Partial<PieceRow>): void {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number): void {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave(): void {
    const validPieces = rows
      .filter((row) => row.componentProductId !== "")
      .map((row) => ({
        componentProductId: row.componentProductId,
        qty: Math.max(1, Number.parseInt(row.qty, 10) || 1),
        stationIdOverride:
          row.stationIdOverride === COMBO_STATION_DEFAULT ? null : row.stationIdOverride,
      }));
    saveMutation.mutate({ comboProductId, pieces: validPieces });
  }

  if (!ready) {
    return <p className="mt-4 text-sm text-muted-foreground">Cargando piezas…</p>;
  }

  return (
    <div className="mt-4 grid gap-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este combo no tiene piezas todavía.</p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row, index) => (
            <li key={index} className="grid grid-cols-[1fr_5rem_10rem_auto] items-center gap-2">
              <Select
                value={row.componentProductId}
                onValueChange={(value) => updateRow(index, { componentProductId: value })}
              >
                <SelectTrigger aria-label={`Producto de la pieza ${index + 1}`}>
                  <SelectValue placeholder="Producto" />
                </SelectTrigger>
                <SelectContent>
                  {pieces.map((piece) => (
                    <SelectItem key={piece.id} value={piece.id}>
                      {piece.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={row.qty}
                onChange={(e) => updateRow(index, { qty: e.target.value })}
                aria-label={`Cantidad de la pieza ${index + 1}`}
              />
              <Select
                value={row.stationIdOverride}
                onValueChange={(value) => updateRow(index, { stationIdOverride: value })}
              >
                <SelectTrigger aria-label={`Estación de la pieza ${index + 1}`}>
                  <SelectValue placeholder="Estación por defecto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={COMBO_STATION_DEFAULT}>Estación por defecto</SelectItem>
                  {stations.map((station) => (
                    <SelectItem key={station.id} value={station.id}>
                      {station.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quitar la pieza ${index + 1}`}
                onClick={() => removeRow(index)}
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
        onClick={() =>
          setRows((prev) => [
            ...prev,
            { componentProductId: "", qty: "1", stationIdOverride: COMBO_STATION_DEFAULT },
          ])
        }
      >
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        Añadir pieza
      </Button>

      {saveMutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {saveMutation.error.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Guardando…" : "Guardar piezas"}
        </Button>
      </div>
    </div>
  );
}
