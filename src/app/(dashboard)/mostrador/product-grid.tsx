"use client";

import { useState } from "react";
import { Package, UtensilsCrossed } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMenuCategories, useMenuProducts } from "@/hooks/use-menu";
import { formatMoney } from "@/lib/format";
import type { Product } from "@/types/database";

/** Sentinela de la pestaña "Todas" (sin filtrar por categoría). */
const ALL_CATEGORIES = "__all__";

interface ProductGridProps {
  salonId: string;
  /** productId → ids de los grupos de modificadores asignados. */
  productModifierGroupsByProduct: Map<string, string[]>;
  /** Producto SIN modificadores y sin combo: se añade directo (qty 1). */
  onAddDirect: (product: Product) => void;
  /** Producto CON modificadores o combo: abre el selector. */
  onOpenPicker: (product: Product) => void;
}

/**
 * Rejilla táctil de la carta: pestañas de categoría + botones grandes de
 * producto, filtrable por texto. Decide, por producto, si tocarlo añade
 * directo al pedido (sin grupos de modificadores y no es combo) o abre
 * `ModifierPickerDialog` — mismo patrón de botonera que `tpv/tpv-view.tsx`
 * (`CatalogButton`), adaptado a categorías de carta en vez de
 * servicios/productos.
 */
export function ProductGrid({
  salonId,
  productModifierGroupsByProduct,
  onAddDirect,
  onOpenPicker,
}: ProductGridProps): React.ReactElement {
  const categories = useMenuCategories(salonId);
  const products = useMenuProducts(salonId);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES);
  const [search, setSearch] = useState("");

  const allProducts = products.data ?? [];
  const filtered = allProducts.filter((product) => {
    const matchesCategory =
      activeCategory === ALL_CATEGORIES || product.category_id === activeCategory;
    const matchesSearch =
      search.trim() === "" || product.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  });

  function handleTap(product: Product): void {
    const groupIds = productModifierGroupsByProduct.get(product.id) ?? [];
    if (!product.is_combo && groupIds.length === 0) {
      onAddDirect(product);
    } else {
      onOpenPicker(product);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-xs sm:p-5">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar producto…"
        className="h-11 rounded-xl text-base"
        aria-label="Buscar en la carta"
      />

      {categories.isPending ? (
        <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      ) : (
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-border/70 bg-muted/50 p-1">
          <CategoryTab
            active={activeCategory === ALL_CATEGORIES}
            label="Todas"
            onClick={() => setActiveCategory(ALL_CATEGORIES)}
          />
          {(categories.data ?? []).map((category) => (
            <CategoryTab
              key={category.id}
              active={activeCategory === category.id}
              label={category.name}
              onClick={() => setActiveCategory(category.id)}
            />
          ))}
        </div>
      )}

      <div className="grid max-h-[32rem] grid-cols-2 gap-2.5 overflow-y-auto pr-0.5 sm:grid-cols-3 xl:grid-cols-4">
        {products.isPending ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))
        ) : filtered.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 py-12 text-center">
            <UtensilsCrossed className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">No hay productos en esta categoría.</p>
          </div>
        ) : (
          filtered.map((product) => (
            <ProductButton key={product.id} product={product} onClick={() => handleTap(product)} />
          ))
        )}
      </div>
    </div>
  );
}

function CategoryTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-all duration-150 ease-apple-out",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function ProductButton({
  product,
  onClick,
}: {
  product: Product;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-24 flex-col items-start justify-between overflow-hidden rounded-xl border border-border/70 bg-card p-3 text-left shadow-xs transition-all duration-200 ease-apple-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
    >
      <span className="flex w-full items-start justify-between gap-1.5">
        <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        {product.is_combo ? (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            Combo
          </span>
        ) : null}
      </span>
      <span className="w-full space-y-0.5">
        <span className="line-clamp-2 text-xs font-medium leading-tight text-foreground">
          {product.name}
        </span>
        <span className="block text-sm font-semibold tabular-nums text-foreground">
          {formatMoney(product.price_cents)}
        </span>
      </span>
    </button>
  );
}
