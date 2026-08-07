import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Loader2, Plus, Check, ShoppingBag, Minus, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCartStore, useAgeGate } from '@/lib/cart-store';
import { useAgotados } from '@/hooks/use-agotados';
import { getDrinkImage } from '@/lib/drink-image';
import { PRODUCT_IMAGES, MONTADITO_IMAGES_BY_NUMERO } from '@/lib/product-images';
import { Monty } from './Monty';
import { getRueda, ruedaComponentes, ruedaAgotada, compLabel, type RuedaMontadito } from '@/lib/ruedas';
import { isDesayunoTime, DESAYUNO_SECTIONS, DESAYUNO_PRODUCT_IMAGES } from '@/lib/desayunos';
import { RuedaGourmetDialog } from './RuedaGourmetDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import jarraQuijoteImg from '@/assets/drinks/jarra-quijote.png';
import jarraSanchoImg from '@/assets/drinks/jarra-sancho.png';
import jarraQuijoteLadronVeranoImg from '@/assets/drinks/jarra-quijote-ladron-verano.png';
import jarraSanchoLadronVeranoImg from '@/assets/drinks/jarra-sancho-ladron-verano.png';
import jarraQuijoteLadronManzanasImg from '@/assets/drinks/jarra-quijote-ladron-manzanas.png';
import jarraSanchoLadronManzanasImg from '@/assets/drinks/jarra-sancho-ladron-manzanas.png';

type Msg = { role: 'user' | 'assistant'; content: string };

type Product = {
  id: string;
  nombre: string;
  precio: number;
  foto_url: string | null;
  numero?: string | null;
  contiene_alcohol?: boolean;
  seccion?: string | null;
};

type FlyingItem = {
  id: number;
  product: Product;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-menu`;
const TYPEWRITER_CPS = 150;
const JARRA_SECTIONS = new Set(['Jarras Heladas', 'Cerveza Premium']);
const SANCHO_EXTRA = 0.5; // Cambio de carta jul-2026: Sancho cuesta 0,50€ más que Quijote
const CAFE_TIPOS = ['Solo', 'Cortado', 'Con leche', 'Bombón'] as const;
// Variantes que dependen de un ingrediente concreto (si falta, se desactiva la opción).
const ALITAS_VARIANT_ING: Record<string, string> = { bbq: 'Salsa BBQ', brava: 'Salsa brava' };
const NACHOS_VARIANT_ING: Record<string, string> = { bacon: 'Bacon ahumado', guacamole: 'Guacamole' };
const GILDA_VARIANT_ING: Record<string, string> = { boqueron: 'Gilda boquerón', anchoa: 'Gilda anchoa' };

const SUGGESTIONS = [
  '¿Qué montaditos de pollo tenéis?',
  'Soy alérgico al huevo, ¿qué puedo pedir?',
  'Recomiéndame algo picante',
  'Opciones vegetarianas',
];

// Normalises a product name for fuzzy matching
function normalizeName(s: string) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

const isJarraProduct = (p: Product) =>
  (!!p.seccion && JARRA_SECTIONS.has(p.seccion)) || normalizeName(p.nombre).includes('jarra');

const isGildaProduct = (p: Product) => {
  const n = normalizeName(p.nombre);
  return n === 'gildas' || n === 'gilda';
};

const isNachosProduct = (p: Product) => normalizeName(p.nombre) === 'nachos';

const isAlitasProduct = (p: Product) => normalizeName(p.nombre) === 'alitas de pollo';

const isCafeProduct = (p: Product) => normalizeName(p.nombre) === 'cafe';

const isAceitunaProduct = (p: Product) => normalizeName(p.nombre) === 'aceitunas';

function parseMessage(raw: string): { text: string; productNames: string[]; banners: string[] } {
  const productNames: string[] = [];
  const banners: string[] = [];
  const text = raw
    .replace(/\[\[add:([^\]]+)\]\]/g, (_, name) => {
      productNames.push(name.trim());
      return '';
    })
    .replace(/\[\[banner:([^\]]+)\]\]/g, (_, key) => {
      banners.push(key.trim().toLowerCase());
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const seen = new Set<string>();
  const unique = productNames.filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { text, productNames: unique, banners: Array.from(new Set(banners)) };
}

// Banners que Monty puede mostrar al recomendar desayunos/promociones.
const BANNER_IMAGES: Record<string, { src: string; caption: string }> = {
  'desayuno-dulce': { src: '/assets/img/montaditos/montycookie-doble-chocolate-y-sirope-de-caramelo-toffee.png', caption: 'Pídelo en la sección Desayunos (10:00–12:00)' },
  'desayuno-clasico': { src: '/assets/img/desayunos/desayuno-clasico.png', caption: 'Pídelo en la sección Desayunos (10:00–12:00)' },
  'promo-salseo': { src: '/assets/img/promos/salseo.jpg', caption: 'Pídela en la sección Promociones' },
};

function findProduct(name: string, products: Product[] | undefined): Product | null {
  if (!products) return null;
  const target = name.trim().toLowerCase();

  const numMatch = target.match(/^#?(\d+)(?:\s|$)/);
  if (numMatch) {
    const byNum = products.find((p) => p.numero === numMatch[1]);
    if (byNum) return byNum;
  }

  return (
    products.find((p) => p.nombre.toLowerCase() === target) ||
    products.find((p) => p.nombre.toLowerCase().includes(target)) ||
    products.find((p) => target.includes(p.nombre.toLowerCase())) ||
    null
  );
}

// Un producto de desayuno (tostadas/croissant/bollería) se identifica por su sección.
function esDesayuno(product: Product): boolean {
  return !!product.seccion && (DESAYUNO_SECTIONS as readonly string[]).includes(product.seccion);
}
// La promo compuesta (Salséo) tampoco se añade desde el chat.
function esPromo(product: Product): boolean {
  return product.seccion === 'Promociones';
}

function resolveProductImage(product: Product): string | null {
  if (DESAYUNO_PRODUCT_IMAGES[product.nombre]) return DESAYUNO_PRODUCT_IMAGES[product.nombre];
  const rueda = getRueda(product.numero);
  if (rueda?.img) return rueda.img;
  if (product.numero && MONTADITO_IMAGES_BY_NUMERO[product.numero]) {
    return MONTADITO_IMAGES_BY_NUMERO[product.numero];
  }
  return getDrinkImage(product.nombre, product.foto_url);
}

// ─── Product chip rendered below AI messages ─────────────────────────────────

interface ProductChipProps {
  product: Product;
  onAdd: (product: Product, originRect: DOMRect) => void;
  agotado?: boolean;
}

function ProductChip({ product, onAdd, agotado = false }: ProductChipProps) {
  const [added, setAdded] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const imageSrc = resolveProductImage(product);

  const handleClick = () => {
    if (agotado) return; // producto agotado: no se puede añadir desde el chat
    if (!ref.current) return;
    onAdd(product, ref.current.getBoundingClientRect());
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <motion.button
      ref={ref}
      onClick={handleClick}
      whileTap={agotado ? undefined : { scale: 0.96 }}
      className={`group flex items-center gap-3 w-full p-2 pr-3 rounded-2xl bg-background border transition-colors text-left ${
        agotado ? 'border-destructive/40 opacity-60' : 'border-border hover:border-primary/60 hover:bg-primary/5'
      }`}
    >
      <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-muted shrink-0">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={product.nombre}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg">🥖</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-foreground truncate">
          {product.numero && (
            <span className="text-muted-foreground font-mono mr-1">#{product.numero}</span>
          )}
          {product.nombre}
        </p>
        <p className="text-[11px] text-muted-foreground">{product.precio.toFixed(2)}€</p>
      </div>
      {agotado ? (
        <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-destructive">
          Agotado
        </span>
      ) : (
        <span
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
            added
              ? 'bg-accent text-accent-foreground'
              : 'bg-primary text-primary-foreground group-hover:bg-primary/90'
          }`}
        >
          {added ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </span>
      )}
    </motion.button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MenuChatBot() {
  const [open, setOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [flying, setFlying] = useState<FlyingItem[]>([]);
  const [cartPulse, setCartPulse] = useState(false);

  // Variant dialog state
  const [pendingVariantProduct, setPendingVariantProduct] = useState<Product | null>(null);
  const [jarraOpen, setJarraOpen] = useState(false);
  const [gildaOpen, setGildaOpen] = useState(false);
  const [nachosOpen, setNachosOpen] = useState(false);
  const [alitasOpen, setAlitasOpen] = useState(false);
  const [cafeOpen, setCafeOpen] = useState(false);
  const [cafeDescafeinado, setCafeDescafeinado] = useState(false);
  const [aceitunaOpen, setAceitunaOpen] = useState(false);
  const [ruedaOpen, setRuedaOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const cartIconRef = useRef<HTMLButtonElement>(null);
  const flyingIdRef = useRef(0);
  const pendingRectRef = useRef<DOMRect | null>(null);

  const addItem = useCartStore((s) => s.addItem);
  const { isProductoAgotado, isIngredienteAgotado } = useAgotados();

  // Agotado efectivo: marcado/ingrediente, o todas las variantes agotadas (alitas/nachos).
  const productoEfectivoAgotado = (product: Product) => {
    if (isProductoAgotado(product.id)) return true;
    const ruedaDef = getRueda(product.numero);
    if (ruedaDef) return ruedaAgotada(ruedaDef, ruedaMontaditos, isProductoAgotado);
    const n = normalizeName(product.nombre);
    if (n === 'alitas de pollo') return Object.values(ALITAS_VARIANT_ING).every(isIngredienteAgotado);
    if (n === 'nachos') return Object.values(NACHOS_VARIANT_ING).every(isIngredienteAgotado);
    if (n === 'gildas' || n === 'gilda') return Object.values(GILDA_VARIANT_ING).every(isIngredienteAgotado);
    return false;
  };
  const itemCount = useCartStore((s) => s.itemCount);
  const cartItems = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const cartTotal = useCartStore((s) => s.total);
  const requestAlcohol = useAgeGate((s) => s.request);

  const fullTextRef = useRef<string>('');
  const revealedRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: products } = useQuery({
    queryKey: ['all-products-chatbot'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_productos')
        .select('id, nombre, precio, foto_url, numero, contiene_alcohol, seccion')
        .eq('disponible', true);
      if (error) throw error;
      return data as Product[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Montaditos (para resolver los componentes de las MontyRuedas).
  const ruedaMontaditos: RuedaMontadito[] = (products ?? []).map((p) => ({ id: p.id, numero: p.numero ?? null, nombre: p.nombre }));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // ── Typewriter helpers ────────────────────────────────────────────────────

  const startTypewriter = () => {
    if (intervalRef.current) return;
    const tickMs = 1000 / TYPEWRITER_CPS;
    intervalRef.current = window.setInterval(() => {
      if (revealedRef.current >= fullTextRef.current.length) return;
      revealedRef.current = Math.min(revealedRef.current + 1, fullTextRef.current.length);
      const visible = fullTextRef.current.slice(0, revealedRef.current);
      setMessages((prev) =>
        prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: visible } : m))
      );
    }, tickMs);
  };

  const stopTypewriter = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const flushTypewriter = async () => {
    while (revealedRef.current < fullTextRef.current.length) {
      await new Promise((r) => setTimeout(r, 30));
    }
    stopTypewriter();
  };

  // ── Flying cart animation ─────────────────────────────────────────────────

  const triggerFlyingAnimation = (imgUrl: string | null, nombre: string, originRect: DOMRect) => {
    const cartRect = cartIconRef.current?.getBoundingClientRect();
    if (!cartRect) return;
    const id = ++flyingIdRef.current;
    setFlying((prev) => [
      ...prev,
      {
        id,
        product: { id: '', nombre, precio: 0, foto_url: imgUrl },
        fromX: originRect.left,
        fromY: originRect.top,
        toX: cartRect.left + cartRect.width / 2 - 20,
        toY: cartRect.top + cartRect.height / 2 - 20,
      },
    ]);
    setTimeout(() => {
      setCartPulse(true);
      setTimeout(() => setCartPulse(false), 400);
    }, 650);
    setTimeout(() => {
      setFlying((prev) => prev.filter((f) => f.id !== id));
    }, 900);
  };

  // ── Variant add helpers ───────────────────────────────────────────────────

  const getJarraImgs = (p: Product) => {
    const n = normalizeName(p.nombre);
    if (n.includes('ladron de verano') || n.includes('tinto de verano'))
      return { q: jarraQuijoteLadronVeranoImg, s: jarraSanchoLadronVeranoImg };
    if (n.includes('ladron de manzana'))
      return { q: jarraQuijoteLadronManzanasImg, s: jarraSanchoLadronManzanasImg };
    return { q: jarraQuijoteImg, s: jarraSanchoImg };
  };

  const addJarraVariant = (size: 'quijote' | 'sancho') => {
    if (!pendingVariantProduct) return;
    const p = pendingVariantProduct;
    const label = size === 'quijote' ? 'Jarra Quijote' : 'Jarra Sancho';
    const precio = size === 'quijote' ? p.precio : p.precio + SANCHO_EXTRA;
    const { q, s } = getJarraImgs(p);
    const img = size === 'quijote' ? q : s;
    const payload = {
      id: `${p.id}::${size}`,
      productoId: p.id,
      variant: size,
      variantLabel: label,
      nombre: `${p.nombre} · ${label}`,
      precio,
      foto_url: img,
      contiene_alcohol: !!p.contiene_alcohol,
    };
    if (p.contiene_alcohol) {
      requestAlcohol(payload);
    } else {
      addItem(payload);
    }
    pendingRectRef.current && triggerFlyingAnimation(img, payload.nombre, pendingRectRef.current);
    toast.success(`${payload.nombre} añadido al carrito`);
    setJarraOpen(false);
    setPendingVariantProduct(null);
  };

  const addGildaVariant = (tipo: 'boqueron' | 'anchoa') => {
    if (!pendingVariantProduct) return;
    if (isIngredienteAgotado(GILDA_VARIANT_ING[tipo])) return;
    const p = pendingVariantProduct;
    const label = tipo === 'boqueron' ? 'Boquerón' : 'Anchoa';
    const img = tipo === 'boqueron' ? PRODUCT_IMAGES._gildaBoqueron : PRODUCT_IMAGES._gildaAnchoa;
    const nombre = tipo === 'boqueron' ? 'Gilda de boquerón' : 'Gilda de anchoa';
    const payload = {
      id: `${p.id}::${tipo}`,
      productoId: p.id,
      variant: tipo,
      variantLabel: label,
      nombre,
      precio: p.precio,
      foto_url: img,
      contiene_alcohol: false,
    };
    addItem(payload);
    pendingRectRef.current && triggerFlyingAnimation(img, nombre, pendingRectRef.current);
    toast.success(`${nombre} añadida al carrito`);
    setGildaOpen(false);
    setPendingVariantProduct(null);
  };

  const addNachosVariant = (salsa: 'bacon' | 'guacamole') => {
    if (!pendingVariantProduct) return;
    if (isIngredienteAgotado(NACHOS_VARIANT_ING[salsa])) return;
    const p = pendingVariantProduct;
    const label = salsa === 'bacon' ? 'Cheddar y bacon ahumado' : 'Cheddar y guacamole';
    const img = salsa === 'bacon' ? PRODUCT_IMAGES._nachosBacon : PRODUCT_IMAGES._nachosGuaca;
    const nombre = `Nachos · ${label}`;
    const payload = {
      id: `${p.id}::${salsa}`,
      productoId: p.id,
      variant: salsa,
      variantLabel: label,
      nombre,
      precio: p.precio,
      foto_url: img,
      contiene_alcohol: false,
    };
    addItem(payload);
    pendingRectRef.current && triggerFlyingAnimation(img, nombre, pendingRectRef.current);
    toast.success('Nachos añadidos al carrito');
    setNachosOpen(false);
    setPendingVariantProduct(null);
  };

  const addAlitasVariant = (sabor: 'bbq' | 'brava') => {
    if (!pendingVariantProduct) return;
    if (isIngredienteAgotado(ALITAS_VARIANT_ING[sabor])) return;
    const p = pendingVariantProduct;
    const label = sabor === 'bbq' ? 'BBQ' : 'Brava';
    const img = sabor === 'bbq' ? PRODUCT_IMAGES._alitasBbq : PRODUCT_IMAGES._alitasBrava;
    const nombre = `Alitas de pollo · ${label}`;
    const payload = {
      id: `${p.id}::${sabor}`,
      productoId: p.id,
      variant: sabor,
      variantLabel: label,
      nombre,
      precio: p.precio,
      foto_url: img,
      contiene_alcohol: false,
    };
    addItem(payload);
    pendingRectRef.current && triggerFlyingAnimation(img, nombre, pendingRectRef.current);
    toast.success(`Alitas ${label} añadidas al carrito`);
    setAlitasOpen(false);
    setPendingVariantProduct(null);
  };

  const addCafeVariant = (tipo: typeof CAFE_TIPOS[number]) => {
    if (!pendingVariantProduct) return;
    const p = pendingVariantProduct;
    const label = cafeDescafeinado ? `${tipo} descafeinado` : tipo;
    const img = resolveProductImage(p);
    const nombre = `Café · ${label}`;
    const payload = {
      id: `${p.id}::${tipo.toLowerCase().replace(/\s+/g, '-')}${cafeDescafeinado ? '-descaf' : ''}`,
      productoId: p.id,
      variant: tipo,
      variantLabel: label,
      nombre,
      precio: p.precio,
      foto_url: img,
      contiene_alcohol: false,
    };
    addItem(payload);
    pendingRectRef.current && triggerFlyingAnimation(img, nombre, pendingRectRef.current);
    toast.success(`${nombre} añadido al carrito`);
    setCafeOpen(false);
    setCafeDescafeinado(false);
    setPendingVariantProduct(null);
  };

  const addAceitunaVariant = (tipo: 'abuela' | 'manzanilla') => {
    if (!pendingVariantProduct) return;
    const p = pendingVariantProduct;
    const label = tipo === 'abuela' ? 'De la abuela' : 'Manzanilla';
    const nombre = tipo === 'abuela' ? 'Aceitunas de la abuela' : 'Aceitunas manzanilla';
    const img = resolveProductImage(p);
    const payload = {
      id: `${p.id}::${tipo}`,
      productoId: p.id,
      variant: tipo,
      variantLabel: label,
      nombre,
      precio: p.precio,
      foto_url: img,
      contiene_alcohol: false,
    };
    addItem(payload);
    pendingRectRef.current && triggerFlyingAnimation(img, nombre, pendingRectRef.current);
    toast.success(`${nombre} añadidas al carrito`);
    setAceitunaOpen(false);
    setPendingVariantProduct(null);
  };

  // Añade una MontyRueda (con sus montaditos en `componentes`) con animación.
  const addRuedaToCart = (product: Product, cartId: string, componentes: string[], originRect: DOMRect | null) => {
    const resolvedImage = resolveProductImage(product);
    const payload = {
      id: cartId,
      productoId: product.id,
      nombre: product.nombre,
      precio: product.precio,
      foto_url: resolvedImage,
      componentes,
    };
    const cartRect = cartIconRef.current?.getBoundingClientRect();
    if (cartRect && originRect) {
      const id = ++flyingIdRef.current;
      setFlying((prev) => [
        ...prev,
        {
          id,
          product: { ...product, foto_url: resolvedImage },
          fromX: originRect.left,
          fromY: originRect.top,
          toX: cartRect.left + cartRect.width / 2 - 20,
          toY: cartRect.top + cartRect.height / 2 - 20,
        },
      ]);
      setTimeout(() => {
        addItem(payload);
        setCartPulse(true);
        setTimeout(() => setCartPulse(false), 400);
      }, 650);
      setTimeout(() => setFlying((prev) => prev.filter((f) => f.id !== id)), 900);
    } else {
      addItem(payload);
    }
    toast.success(`${product.nombre} añadida al carrito`);
  };

  // ── Main add handler (checks for variants first) ──────────────────────────

  const handleAddProduct = (product: Product, originRect: DOMRect) => {
    if (productoEfectivoAgotado(product)) {
      toast.error('Ese producto está agotado ahora mismo');
      return;
    }
    // Desayunos: solo 10:00–12:00 y siempre desde su sección (hay que elegir pan/mermelada/zumo).
    if (esDesayuno(product)) {
      toast(isDesayunoTime() ? 'Elígelo en la sección Desayunos' : 'Los desayunos solo se piden de 10:00 a 12:00');
      return;
    }
    if (esPromo(product)) {
      toast('Añade la promo desde la sección Promociones');
      return;
    }
    if (isJarraProduct(product)) {
      setPendingVariantProduct(product);
      pendingRectRef.current = originRect;
      setJarraOpen(true);
      return;
    }
    if (isGildaProduct(product)) {
      setPendingVariantProduct(product);
      pendingRectRef.current = originRect;
      setGildaOpen(true);
      return;
    }
    if (isNachosProduct(product)) {
      setPendingVariantProduct(product);
      pendingRectRef.current = originRect;
      setNachosOpen(true);
      return;
    }
    if (isAlitasProduct(product)) {
      setPendingVariantProduct(product);
      pendingRectRef.current = originRect;
      setAlitasOpen(true);
      return;
    }
    if (isCafeProduct(product)) {
      setPendingVariantProduct(product);
      pendingRectRef.current = originRect;
      setCafeOpen(true);
      return;
    }
    if (isAceitunaProduct(product)) {
      setPendingVariantProduct(product);
      pendingRectRef.current = originRect;
      setAceitunaOpen(true);
      return;
    }
    const ruedaDef = getRueda(product.numero);
    if (ruedaDef) {
      if (ruedaDef.selectCount) {
        // MontyRueda Gourmets: abrir selector "elige 5".
        setPendingVariantProduct(product);
        pendingRectRef.current = originRect;
        setRuedaOpen(true);
        return;
      }
      // Rueda fija: añadir con sus montaditos como componentes.
      addRuedaToCart(product, product.id, ruedaComponentes(ruedaDef, ruedaMontaditos).map(compLabel), originRect);
      return;
    }

    const resolvedImage = resolveProductImage(product);
    const cartRect = cartIconRef.current?.getBoundingClientRect();
    if (cartRect) {
      const id = ++flyingIdRef.current;
      setFlying((prev) => [
        ...prev,
        {
          id,
          product: { ...product, foto_url: resolvedImage },
          fromX: originRect.left,
          fromY: originRect.top,
          toX: cartRect.left + cartRect.width / 2 - 20,
          toY: cartRect.top + cartRect.height / 2 - 20,
        },
      ]);
      setTimeout(() => {
        addItem({
          id: product.id,
          productoId: product.id,
          nombre: product.nombre,
          numero: product.numero ?? null,
          precio: product.precio,
          foto_url: resolvedImage,
        });
        setCartPulse(true);
        setTimeout(() => setCartPulse(false), 400);
      }, 650);
      setTimeout(() => {
        setFlying((prev) => prev.filter((f) => f.id !== id));
      }, 900);
    } else {
      addItem({
        id: product.id,
        productoId: product.id,
        nombre: product.nombre,
        numero: product.numero ?? null,
        precio: product.precio,
        foto_url: resolvedImage,
      });
    }

    toast.success(`${product.nombre} añadido al carrito`);
  };

  // ── Send message ──────────────────────────────────────────────────────────

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Msg = { role: 'user', content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        signal: abortRef.current.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: newMessages, session_id: sessionStorage.getItem('montaditos_session') }),
      });

      if (resp.status === 429) {
        toast.error('Demasiadas peticiones, espera un momento.');
        setLoading(false);
        return;
      }
      if (resp.status === 402) {
        toast.error('Servicio IA temporalmente no disponible.');
        setLoading(false);
        return;
      }
      if (!resp.ok || !resp.body) throw new Error('Error en la respuesta');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamDone = false;

      fullTextRef.current = '';
      revealedRef.current = 0;
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
      startTypewriter();

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') {
            streamDone = true;
            break;
          }
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) fullTextRef.current += content;
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      await flushTypewriter();
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        stopTypewriter();
        setMessages((prev) => prev.slice(0, -1));
      } else {
        console.error(err);
        toast.error('Error al conectar con el asistente');
        stopTypewriter();
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setLoading(false);
    }
  };

  const isStreamingLast = (idx: number) =>
    idx === messages.length - 1 &&
    messages[idx].role === 'assistant' &&
    revealedRef.current < fullTextRef.current.length;

  const jarraImgs = pendingVariantProduct ? getJarraImgs(pendingVariantProduct) : { q: jarraQuijoteImg, s: jarraSanchoImg };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating Monty button */}
      <div className="fixed bottom-5 left-4 z-40 flex items-end gap-2">
        <motion.button
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          onClick={() => setOpen(true)}
          className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 shadow-xl flex items-center justify-center border-2 border-primary/30"
          aria-label="Habla con Monty"
        >
          <Monty pose="waving" size={56} animate="float" />
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent border-2 border-background animate-pulse" />
        </motion.button>

        <motion.div
          initial={{ opacity: 0, x: -10, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ delay: 0.4, type: 'spring' }}
          onClick={() => setOpen(true)}
          className="relative mb-2 cursor-pointer bg-background border border-primary/30 shadow-lg rounded-2xl rounded-bl-sm px-3 py-2 max-w-[170px]"
        >
          <span className="absolute -left-1.5 bottom-2 w-3 h-3 bg-background border-l border-b border-primary/30 rotate-45" />
          <p className="text-[11px] font-bold text-foreground leading-tight">
            ¡Hola! Soy <span className="text-primary">Monty</span> 🥖
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            ¡Yo te ayudo a elegir!
          </p>
        </motion.div>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] h-[85vh] max-w-lg mx-auto border-t border-border"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 flex items-center justify-center overflow-hidden">
                    <Monty pose="waving" size={40} animate="none" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-foreground text-sm">
                      Monty · Asistente del menú
                    </h3>
                    <p className="text-[10px] text-muted-foreground">¡Yo te ayudo a elegir!</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <motion.button
                    ref={cartIconRef}
                    onClick={() => setCartOpen((v) => !v)}
                    animate={cartPulse ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className={`relative w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                      cartOpen
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-gradient-to-br from-primary/20 to-primary/5 border-primary/40 text-primary'
                    }`}
                    aria-label="Carrito"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <AnimatePresence>
                      {itemCount() > 0 && (
                        <motion.span
                          key={itemCount()}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center border border-background"
                        >
                          {itemCount()}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>

                  <button
                    onClick={() => setOpen(false)}
                    className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-foreground" />
                  </button>
                </div>
              </div>

              {/* Mini cart panel */}
              <AnimatePresence initial={false}>
                {cartOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden border-b border-border bg-muted/40"
                  >
                    <div className="p-3 max-h-[40vh] overflow-y-auto">
                      {cartItems.length === 0 ? (
                        <div className="text-center py-6">
                          <ShoppingBag className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                          <p className="text-xs text-muted-foreground">
                            Tu cesta está vacía. ¡Pídeme una recomendación!
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-2 px-1">
                            <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                              Tu cesta
                            </p>
                            <p className="text-xs font-bold text-primary">
                              {cartTotal().toFixed(2)}€
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            {cartItems.map((item) => {
                              const img = getDrinkImage(item.nombre, item.foto_url);
                              return (
                                <motion.div
                                  key={item.id}
                                  layout
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: 10 }}
                                  className="flex items-center gap-2 p-1.5 rounded-xl bg-background border border-border"
                                >
                                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                                    {img ? (
                                      <img
                                        src={img}
                                        alt={item.nombre}
                                        className="w-full h-full object-contain"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <span className="text-base">🥖</span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-bold text-foreground truncate leading-tight">
                                      {item.nombre}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {(item.precio * item.cantidad).toFixed(2)}€
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => updateQuantity(item.id, item.cantidad - 1)}
                                      className="w-6 h-6 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center"
                                      aria-label="Quitar uno"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <span className="text-xs font-bold w-4 text-center">
                                      {item.cantidad}
                                    </span>
                                    <button
                                      onClick={() => updateQuantity(item.id, item.cantidad + 1)}
                                      className="w-6 h-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center"
                                      aria-label="Añadir uno"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => removeItem(item.id)}
                                      className="w-6 h-6 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center ml-0.5"
                                      aria-label="Eliminar"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="space-y-3">
                    <div className="text-center py-4">
                      <div className="flex justify-center mb-2">
                        <Monty pose="waving" size={96} animate="float" />
                      </div>
                      <h4 className="font-display font-bold text-foreground">
                        ¡Hola! Soy Monty 🥖
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 px-4">
                        Pregúntame por ingredientes, alérgenos o pídeme una recomendación
                      </p>
                    </div>
                    <div className="space-y-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="w-full text-left px-3 py-2.5 text-xs rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-foreground"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => {
                  if (m.role === 'user') {
                    return (
                      <div key={i} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm bg-primary text-primary-foreground rounded-br-sm">
                          {m.content}
                        </div>
                      </div>
                    );
                  }

                  const { text, productNames, banners } = parseMessage(m.content);
                  const stillStreaming = isStreamingLast(i);
                  const matchedProducts = productNames
                    .map((n) => findProduct(n, products))
                    .filter((p): p is Product => p !== null)
                    // Desayunos y promo NO se añaden desde el chat (requieren elegir opciones en su sección).
                    .filter((p) => !esDesayuno(p) && !esPromo(p));
                  const matchedBanners = banners.map((b) => BANNER_IMAGES[b]).filter(Boolean);

                  return (
                    <div key={i} className="flex flex-col items-start gap-2 max-w-[90%]">
                      {(text || stillStreaming) && (
                        <div className="rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm bg-muted text-foreground">
                          {text ? (
                            <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-strong:text-foreground prose-headings:text-foreground text-foreground">
                              <ReactMarkdown>{text}</ReactMarkdown>
                            </div>
                          ) : (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                        </div>
                      )}

                      {!stillStreaming && matchedProducts.length > 0 && (
                        <div className="flex flex-col gap-1.5 w-full">
                          {matchedProducts.map((p) => (
                            <ProductChip key={p.id} product={p} onAdd={handleAddProduct} agotado={productoEfectivoAgotado(p)} />
                          ))}
                        </div>
                      )}

                      {!stillStreaming && matchedBanners.length > 0 && (
                        <div className="flex flex-col gap-2 w-full">
                          {matchedBanners.map((b, bi) => (
                            <div key={bi} className="w-full">
                              <img src={b!.src} alt="" className="w-full h-auto rounded-2xl" loading="lazy" />
                              <p className="text-[11px] text-muted-foreground mt-1 text-center">{b!.caption}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="p-3 border-t border-border flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe tu pregunta..."
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 text-sm rounded-full bg-muted border-0 focus:outline-none focus:ring-2 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 shrink-0"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Flying items layer */}
      <AnimatePresence>
        {flying.map((f) => (
          <motion.div
            key={f.id}
            initial={{ x: f.fromX, y: f.fromY, scale: 1, opacity: 1 }}
            animate={{ x: f.toX, y: f.toY, scale: 0.3, opacity: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.5, 0, 0.75, 0] }}
            className="fixed top-0 left-0 z-[60] w-10 h-10 rounded-full overflow-hidden shadow-2xl ring-2 ring-primary pointer-events-none bg-background"
          >
            {f.product.foto_url ? (
              <img
                src={f.product.foto_url}
                alt=""
                className="w-full h-full object-contain"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-base bg-muted">
                🥖
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── Jarra variant dialog ────────────────────────────────────────────── */}
      <Dialog
        open={jarraOpen}
        onOpenChange={(v) => {
          setJarraOpen(v);
          if (!v) setPendingVariantProduct(null);
        }}
      >
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">¿Qué jarra prefieres?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              {pendingVariantProduct?.nombre}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => addJarraVariant('quijote')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
            >
              <img
                src={jarraImgs.q}
                alt="Jarra Quijote"
                className="h-24 w-auto object-contain"
              />
              <span className="font-display font-bold text-base text-foreground">Quijote</span>
              <span className="text-xs text-muted-foreground">Tamaño estándar</span>
              <span className="text-lg font-black text-gold mt-1">
                {pendingVariantProduct?.precio.toFixed(2) ?? '—'} €
              </span>
            </button>
            <button
              onClick={() => addJarraVariant('sancho')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
            >
              <img
                src={jarraImgs.s}
                alt="Jarra Sancho"
                className="h-24 w-auto object-contain"
              />
              <span className="font-display font-bold text-base text-foreground">Sancho</span>
              <span className="text-xs text-muted-foreground">Tamaño grande</span>
              <span className="text-lg font-black text-gold mt-1">
                {pendingVariantProduct
                  ? (pendingVariantProduct.precio + SANCHO_EXTRA).toFixed(2)
                  : '—'}{' '}
                €
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Gilda variant dialog ────────────────────────────────────────────── */}
      <Dialog
        open={gildaOpen}
        onOpenChange={(v) => {
          setGildaOpen(v);
          if (!v) setPendingVariantProduct(null);
        }}
      >
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">¿Qué gilda prefieres?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              Elige el sabor de tu gilda
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => addGildaVariant('boqueron')}
              disabled={isIngredienteAgotado(GILDA_VARIANT_ING.boqueron)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 transition-all ${isIngredienteAgotado(GILDA_VARIANT_ING.boqueron) ? 'border-destructive/40 opacity-50' : 'border-border hover:border-primary hover:bg-primary/5 active:scale-95'}`}
            >
              <img
                src={PRODUCT_IMAGES._gildaBoqueron}
                alt="Gilda de boquerón"
                className="h-24 w-auto object-contain"
                loading="lazy"
              />
              <span className="font-display font-bold text-base text-foreground">Boquerón</span>
              {isIngredienteAgotado(GILDA_VARIANT_ING.boqueron) ? (
                <span className="text-[11px] font-black uppercase text-destructive mt-1">Agotado</span>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground text-center">Suave y fresco</span>
                  <span className="text-lg font-black text-gold mt-1">
                    {pendingVariantProduct?.precio.toFixed(2) ?? '—'} €
                  </span>
                </>
              )}
            </button>
            <button
              onClick={() => addGildaVariant('anchoa')}
              disabled={isIngredienteAgotado(GILDA_VARIANT_ING.anchoa)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 transition-all ${isIngredienteAgotado(GILDA_VARIANT_ING.anchoa) ? 'border-destructive/40 opacity-50' : 'border-border hover:border-primary hover:bg-primary/5 active:scale-95'}`}
            >
              <img
                src={PRODUCT_IMAGES._gildaAnchoa}
                alt="Gilda de anchoa"
                className="h-24 w-auto object-contain"
                loading="lazy"
              />
              <span className="font-display font-bold text-base text-foreground">Anchoa</span>
              {isIngredienteAgotado(GILDA_VARIANT_ING.anchoa) ? (
                <span className="text-[11px] font-black uppercase text-destructive mt-1">Agotado</span>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground text-center">Intenso y curado</span>
                  <span className="text-lg font-black text-gold mt-1">
                    {pendingVariantProduct?.precio.toFixed(2) ?? '—'} €
                  </span>
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Nachos variant dialog ───────────────────────────────────────────── */}
      <Dialog
        open={nachosOpen}
        onOpenChange={(v) => {
          setNachosOpen(v);
          if (!v) setPendingVariantProduct(null);
        }}
      >
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">¿Con qué salsa?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              Elige la salsa para tus nachos
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => addNachosVariant('bacon')}
              disabled={isIngredienteAgotado(NACHOS_VARIANT_ING.bacon)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 transition-all ${isIngredienteAgotado(NACHOS_VARIANT_ING.bacon) ? 'border-destructive/40 opacity-50' : 'border-border hover:border-primary hover:bg-primary/5 active:scale-95'}`}
            >
              <img
                src={PRODUCT_IMAGES._nachosBacon}
                alt="Nachos cheddar y bacon"
                className="h-24 w-auto object-contain"
                loading="lazy"
              />
              <span className="font-display font-bold text-sm text-foreground text-center">
                Cheddar y bacon ahumado
              </span>
              <span className="text-lg font-black text-gold mt-1">
                {pendingVariantProduct?.precio.toFixed(2) ?? '—'} €
              </span>
            </button>
            <button
              onClick={() => addNachosVariant('guacamole')}
              disabled={isIngredienteAgotado(NACHOS_VARIANT_ING.guacamole)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 transition-all ${isIngredienteAgotado(NACHOS_VARIANT_ING.guacamole) ? 'border-destructive/40 opacity-50' : 'border-border hover:border-primary hover:bg-primary/5 active:scale-95'}`}
            >
              <img
                src={PRODUCT_IMAGES._nachosGuaca}
                alt="Nachos cheddar y guacamole"
                className="h-24 w-auto object-contain"
                loading="lazy"
              />
              <span className="font-display font-bold text-sm text-foreground text-center">
                Cheddar y guacamole
              </span>
              <span className="text-lg font-black text-gold mt-1">
                {pendingVariantProduct?.precio.toFixed(2) ?? '—'} €
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Alitas variant dialog ───────────────────────────────────────────── */}
      <Dialog
        open={alitasOpen}
        onOpenChange={(v) => {
          setAlitasOpen(v);
          if (!v) setPendingVariantProduct(null);
        }}
      >
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">¿Qué sabor?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              Elige el sabor para tus alitas
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => addAlitasVariant('bbq')}
              disabled={isIngredienteAgotado(ALITAS_VARIANT_ING.bbq)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 transition-all ${isIngredienteAgotado(ALITAS_VARIANT_ING.bbq) ? 'border-destructive/40 opacity-50' : 'border-border hover:border-primary hover:bg-primary/5 active:scale-95'}`}
            >
              <img
                src={PRODUCT_IMAGES._alitasBbq}
                alt="Alitas BBQ"
                className="h-24 w-auto object-contain"
                loading="lazy"
              />
              <span className="font-display font-bold text-base text-foreground">Sabor BBQ</span>
              <span className="text-xs text-muted-foreground text-center">Ahumado y dulce</span>
              <span className="text-lg font-black text-gold mt-1">
                {pendingVariantProduct?.precio.toFixed(2) ?? '—'} €
              </span>
            </button>
            <button
              onClick={() => addAlitasVariant('brava')}
              disabled={isIngredienteAgotado(ALITAS_VARIANT_ING.brava)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 transition-all ${isIngredienteAgotado(ALITAS_VARIANT_ING.brava) ? 'border-destructive/40 opacity-50' : 'border-border hover:border-primary hover:bg-primary/5 active:scale-95'}`}
            >
              <img
                src={PRODUCT_IMAGES._alitasBrava}
                alt="Alitas Brava"
                className="h-24 w-auto object-contain"
                loading="lazy"
              />
              <span className="font-display font-bold text-base text-foreground">Sabor Brava</span>
              <span className="text-xs text-muted-foreground text-center">Picante e intenso</span>
              <span className="text-lg font-black text-gold mt-1">
                {pendingVariantProduct?.precio.toFixed(2) ?? '—'} €
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Café variant dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={cafeOpen}
        onOpenChange={(v) => {
          setCafeOpen(v);
          if (!v) {
            setPendingVariantProduct(null);
            setCafeDescafeinado(false);
          }
        }}
      >
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">¿Cómo te gusta el café?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              Elige el tipo · {pendingVariantProduct?.precio.toFixed(2) ?? '—'} €
            </DialogDescription>
          </DialogHeader>
          <label
            className={`flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-all cursor-pointer ${cafeDescafeinado ? 'border-primary bg-primary/5' : 'border-border'}`}
          >
            <span className="font-display font-bold text-sm text-foreground">Descafeinado</span>
            <Switch checked={cafeDescafeinado} onCheckedChange={setCafeDescafeinado} />
          </label>
          <div className="grid grid-cols-2 gap-3 pt-1">
            {CAFE_TIPOS.map((tipo) => (
              <button
                key={tipo}
                onClick={() => addCafeVariant(tipo)}
                className="flex flex-col items-center justify-center gap-1 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95 min-h-[64px]"
              >
                <span className="font-display font-bold text-sm text-foreground text-center">{tipo}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Aceitunas variant dialog ─────────────────────────────────────────── */}
      <Dialog
        open={aceitunaOpen}
        onOpenChange={(v) => {
          setAceitunaOpen(v);
          if (!v) setPendingVariantProduct(null);
        }}
      >
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">¿Qué aceitunas prefieres?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              Elige el tipo · {pendingVariantProduct?.precio.toFixed(2) ?? '—'} €
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => addAceitunaVariant('abuela')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
            >
              <span className="font-display font-bold text-base text-foreground text-center">De la abuela</span>
            </button>
            <button
              onClick={() => addAceitunaVariant('manzanilla')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
            >
              <span className="font-display font-bold text-base text-foreground text-center">Manzanilla</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── MontyRueda Gourmets: selector "elige 5" ──────────────────────────── */}
      {pendingVariantProduct && getRueda(pendingVariantProduct.numero)?.selectCount && (
        <RuedaGourmetDialog
          open={ruedaOpen}
          onOpenChange={(v) => {
            setRuedaOpen(v);
            if (!v) setPendingVariantProduct(null);
          }}
          nombre={pendingVariantProduct.nombre}
          precio={pendingVariantProduct.precio}
          need={getRueda(pendingVariantProduct.numero)!.selectCount!}
          comps={ruedaComponentes(getRueda(pendingVariantProduct.numero)!, ruedaMontaditos)}
          isProductoAgotado={isProductoAgotado}
          onConfirm={(selected) => {
            const p = pendingVariantProduct;
            addRuedaToCart(
              p,
              `${p.id}::${selected.map((m) => m.id).sort().join('-')}`,
              selected.map(compLabel),
              pendingRectRef.current,
            );
            setRuedaOpen(false);
            setPendingVariantProduct(null);
          }}
        />
      )}
    </>
  );
}
