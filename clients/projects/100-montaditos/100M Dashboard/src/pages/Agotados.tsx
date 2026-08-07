import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Ban, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { StaffHeader } from "@/components/StaffHeader";
import { useStaffLocal } from "@/lib/staff-local";
import { MONTADITO_IMAGES_BY_NUMERO } from "@/lib/product-images";
import { getDrinkImage } from "@/lib/drink-image";
import { INGREDIENTE_IMAGES } from "@/lib/ingrediente-images";

interface Ingrediente {
  id: string;
  nombre: string;
  tipo: "ingrediente" | "pan";
}
interface ProdSuelto {
  id: string;
  numero: string | null;
  nombre: string;
  seccion: string; // Aperitivos | Raciones | Bebidas | Cookies
}

// Categorías de menu_productos que se marcan a nivel de producto entero.
const CATS_PRODUCTO = ["Aperitivos", "Raciones", "Bebidas"];
// Las cookies son montaditos #68-70 pero se gestionan como producto completo.
const COOKIE_NUMEROS = new Set(["68", "69", "70"]);

const norm = (s: string) => (s || "").toLowerCase();
const normNoAcc = (s: string) => norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
// Salsas: detectadas por nombre (no hay tipo 'salsa' en BD). Empieza por "salsa" o
// está en la lista de salsas sin esa palabra. Guacamole NO es salsa (es ingrediente).
const SALSA_EXTRA = new Set(["mojo picon", "mayonesa", "ketchup", "mostaza", "mostaza y miel", "cheddar"]);
const isSalsa = (nombre: string) => {
  const n = normNoAcc(nombre);
  return n.startsWith("salsa") || SALSA_EXTRA.has(n);
};

// Las gildas se gestionan por variante (boquerón/anchoa) como "productos" en Aperitivos.
const GILDA_VARIANT_IMG: Record<string, string> = {
  "Gilda boquerón": "/assets/img/aperitivos/gilda-boqueron.png",
  "Gilda anchoa": "/assets/img/aperitivos/gilda-anchoa.png",
};
const isGildaVariant = (nombre: string) => nombre in GILDA_VARIANT_IMG;

// Secciones por INGREDIENTE (marca local_ingredientes_agotados)
const ING_SECTIONS: { key: string; emoji: string; title: string; filter: (i: Ingrediente) => boolean }[] = [
  { key: "pan", emoji: "🥖", title: "Panes", filter: (i) => i.tipo === "pan" },
  { key: "salsa", emoji: "🥫", title: "Salsas", filter: (i) => i.tipo === "ingrediente" && isSalsa(i.nombre) },
  { key: "ing", emoji: "🧀", title: "Ingredientes", filter: (i) => i.tipo === "ingrediente" && !isSalsa(i.nombre) && !isGildaVariant(i.nombre) },
];

// Secciones por PRODUCTO (marca local_productos_agotados)
const PROD_SECTIONS: { key: string; emoji: string; title: string }[] = [
  { key: "Aperitivos", emoji: "🍢", title: "Aperitivos" },
  { key: "Raciones", emoji: "🍟", title: "Raciones" },
  { key: "Bebidas", emoji: "🍺", title: "Bebidas" },
  { key: "Cookies", emoji: "🍪", title: "Cookies" },
];

export default function Agotados() {
  const localId = useStaffLocal((s) => s.local?.id ?? null);
  const [q, setQ] = useState("");

  const ingsQ = useQuery({
    queryKey: ["ag-ingredientes"],
    queryFn: async () => {
      const { data } = await supabase.from("ingredientes").select("id, nombre, tipo").order("nombre");
      return (data ?? []) as Ingrediente[];
    },
  });

  const prodsQ = useQuery({
    queryKey: ["ag-productos-sueltos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("menu_productos")
        .select("id, numero, nombre, disponible, menu_categorias(nombre)")
        .eq("disponible", true);
      const out: ProdSuelto[] = [];
      for (const p of (data ?? []) as any[]) {
        const cat = p.menu_categorias?.nombre;
        if (CATS_PRODUCTO.includes(cat)) {
          // La "Gildas" se gestiona por variante (boquerón/anchoa), no como producto único.
          if (cat === "Aperitivos" && (p.nombre ?? "").toLowerCase() === "gildas") continue;
          out.push({ id: p.id, numero: p.numero, nombre: p.nombre, seccion: cat });
        } else if (cat === "Montaditos" && COOKIE_NUMEROS.has(String(p.numero))) {
          out.push({ id: p.id, numero: p.numero, nombre: p.nombre, seccion: "Cookies" });
        }
      }
      return out;
    },
  });

  const agIngQ = useQuery({
    queryKey: ["ag-local-ings", localId],
    enabled: !!localId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase.from("local_ingredientes_agotados").select("ingrediente_id").eq("local_id", localId);
      return new Set<string>(((data ?? []) as any[]).map((r) => r.ingrediente_id));
    },
  });

  const agProdQ = useQuery({
    queryKey: ["ag-local-prods", localId],
    enabled: !!localId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase.from("local_productos_agotados").select("producto_id").eq("local_id", localId);
      return new Set<string>(((data ?? []) as any[]).map((r) => r.producto_id));
    },
  });

  const agIng = agIngQ.data ?? new Set<string>();
  const agProd = agProdQ.data ?? new Set<string>();

  const toggleIng = async (id: string) => {
    if (!localId) return;
    const isAg = agIng.has(id);
    const { error } = isAg
      ? await supabase.from("local_ingredientes_agotados").delete().eq("local_id", localId).eq("ingrediente_id", id)
      : await supabase.from("local_ingredientes_agotados").insert({ local_id: localId, ingrediente_id: id });
    if (error) toast.error("Error: " + error.message);
    else agIngQ.refetch();
  };

  const toggleProd = async (id: string) => {
    if (!localId) return;
    const isAg = agProd.has(id);
    const { error } = isAg
      ? await supabase.from("local_productos_agotados").delete().eq("local_id", localId).eq("producto_id", id)
      : await supabase.from("local_productos_agotados").insert({ local_id: localId, producto_id: id });
    if (error) toast.error("Error: " + error.message);
    else agProdQ.refetch();
  };

  const match = (s: string) => !q || norm(s).includes(norm(q));
  const totalAgotados = agIng.size + agProd.size;

  const Chip = ({ activo, label, img, onClick }: { activo: boolean; label: string; img?: string | null; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition-colors ${
        activo
          ? "border-destructive/60 bg-destructive/15 text-destructive"
          : "border-border bg-card hover:bg-muted"
      }`}
    >
      {img ? (
        <img src={img} alt="" className="w-9 h-9 object-contain shrink-0" loading="lazy" />
      ) : (
        <span className="w-9 h-9 shrink-0 rounded-lg bg-muted/40" aria-hidden />
      )}
      <span className={`flex-1 min-w-0 truncate ${activo ? "font-semibold line-through" : "font-medium"}`}>{label}</span>
      {activo ? <Ban className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
    </button>
  );

  // Imagen de un producto (cookies por número, aperitivos/raciones/bebidas por nombre).
  const productImg = (p: ProdSuelto): string | null =>
    (p.numero ? MONTADITO_IMAGES_BY_NUMERO[p.numero] : undefined) ?? getDrinkImage(p.nombre) ?? null;

  const SectionHeader = ({ emoji, title }: { emoji: string; title: string }) => (
    <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
      <span aria-hidden className="text-base">{emoji}</span> {title}
    </h2>
  );

  const ings = ingsQ.data ?? [];
  const prods = prodsQ.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title="Agotados" subtitle="Marca lo que se ha acabado; desaparece de la app del cliente" />
      <main className="mx-auto max-w-[1100px] space-y-6 p-6">
        {!localId && (
          <div className="rounded-md border border-amber-500/50 bg-amber-50/40 p-4 text-sm">
            Selecciona un local para gestionar los agotados.
          </div>
        )}

        <div className="sticky top-[73px] z-20 -mx-6 bg-background/90 px-6 py-2 backdrop-blur">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar pan, salsa, ingrediente o producto…"
              className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-base outline-none focus:border-primary"
            />
          </div>
          {totalAgotados > 0 && <p className="mt-2 text-xs text-destructive">{totalAgotados} agotado(s) ahora mismo</p>}
        </div>

        {/* Secciones por ingrediente */}
        {ING_SECTIONS.map((sec) => {
          const list = ings.filter((i) => sec.filter(i) && match(i.nombre));
          if (list.length === 0) return null;
          return (
            <section key={sec.key}>
              <SectionHeader emoji={sec.emoji} title={sec.title} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {list.map((i) => (
                  <Chip key={i.id} activo={agIng.has(i.id)} label={i.nombre} img={INGREDIENTE_IMAGES[i.nombre] ?? null} onClick={() => toggleIng(i.id)} />
                ))}
              </div>
            </section>
          );
        })}

        {/* Secciones por producto */}
        {PROD_SECTIONS.map((sec) => {
          const list = prods.filter((p) => p.seccion === sec.key && (match(p.nombre) || match(p.numero ?? "")));
          // En Aperitivos, las gildas se gestionan como 2 variantes (boquerón/anchoa).
          const gildaVars =
            sec.key === "Aperitivos"
              ? ings.filter((i) => isGildaVariant(i.nombre) && match(i.nombre))
              : [];
          if (list.length === 0 && gildaVars.length === 0) return null;
          return (
            <section key={sec.key}>
              <SectionHeader emoji={sec.emoji} title={sec.title} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {list.map((p) => (
                  <Chip
                    key={p.id}
                    activo={agProd.has(p.id)}
                    label={`${p.numero ? p.numero + " · " : ""}${p.nombre}`}
                    img={productImg(p)}
                    onClick={() => toggleProd(p.id)}
                  />
                ))}
                {gildaVars.map((i) => (
                  <Chip
                    key={i.id}
                    activo={agIng.has(i.id)}
                    label={i.nombre}
                    img={GILDA_VARIANT_IMG[i.nombre]}
                    onClick={() => toggleIng(i.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {(ingsQ.isLoading || prodsQ.isLoading) && (
          <p className="text-center text-sm text-muted-foreground">Cargando…</p>
        )}
      </main>
    </div>
  );
}
