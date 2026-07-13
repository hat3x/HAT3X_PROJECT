"use client";

import { useState } from "react";
import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";

import {
  ProductForm,
  type ProductFormDefaults,
} from "@/app/(dashboard)/products/product-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateProduct,
  useDeleteProduct,
  useProducts,
  useUpdateProduct,
} from "@/hooks/use-products";
import { formatMoney } from "@/lib/format";
import type { Product } from "@/types/database";

interface ProductsViewProps {
  salonId: string;
}

/** Convierte una fila de producto en los valores por defecto del formulario. */
function toFormDefaults(product: Product): ProductFormDefaults {
  return {
    name: product.name,
    description: product.description ?? "",
    price: (product.price_cents / 100).toFixed(2).replace(".", ","),
    vat_rate: String(product.vat_rate),
    stock: product.stock === null ? "" : String(product.stock),
    active: product.active,
  };
}

export function ProductsView({ salonId }: ProductsViewProps): React.ReactElement {
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const { data: products, isPending, isError, error } = useProducts(
    salonId,
    search,
    includeInactive,
  );
  const createMutation = useCreateProduct(salonId);
  const updateMutation = useUpdateProduct(salonId, editing?.id ?? "");
  const deleteMutation = useDeleteProduct(salonId);

  return (
    <main className="container py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
          <p className="text-muted-foreground">
            Catálogo de productos a la venta en tu salón
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo producto
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo producto</DialogTitle>
              <DialogDescription>
                Añade un producto al catálogo del salón.
              </DialogDescription>
            </DialogHeader>
            <ProductForm
              submitLabel="Crear producto"
              pending={createMutation.isPending}
              error={
                createMutation.error instanceof Error
                  ? createMutation.error.message
                  : null
              }
              onCancel={() => setCreateOpen(false)}
              onSubmit={(input) => {
                createMutation.mutate(input, {
                  onSuccess: () => setCreateOpen(false),
                });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o descripción…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar productos"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Mostrar inactivos
        </label>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">IVA</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[1%] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-destructive">
                  {error instanceof Error ? error.message : "Error al cargar"}
                </TableCell>
              </TableRow>
            ) : !products || products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {search.trim() === ""
                      ? "Aún no hay productos. Crea el primero."
                      : "Ningún producto coincide con la búsqueda."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">
                    {product.name}
                    {product.description !== null ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {product.description}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(product.price_cents, product.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {product.vat_rate}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {product.stock === null ? "—" : product.stock}
                  </TableCell>
                  <TableCell>
                    {product.active ? (
                      <Badge variant="secondary">Activo</Badge>
                    ) : (
                      <Badge variant="outline">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Diálogo de edición */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            updateMutation.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar producto</DialogTitle>
            <DialogDescription>
              Actualiza los datos del producto.
            </DialogDescription>
          </DialogHeader>
          {editing !== null ? (
            <ProductForm
              key={editing.id}
              defaultValues={toFormDefaults(editing)}
              submitLabel="Guardar cambios"
              pending={updateMutation.isPending}
              error={
                updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : null
              }
              onCancel={() => setEditing(null)}
              onSubmit={(input) => {
                updateMutation.mutate(input, {
                  onSuccess: () => setEditing(null),
                });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación de borrado */}
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
              ¿Seguro que quieres eliminar «{deleting?.name}»? Esta acción no se
              puede deshacer.
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
                if (deleting === null) {
                  return;
                }
                deleteMutation.mutate(deleting.id, {
                  onSuccess: () => setDeleting(null),
                });
              }}
            >
              {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
