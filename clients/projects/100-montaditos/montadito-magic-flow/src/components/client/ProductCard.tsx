import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, AlertCircle } from 'lucide-react';
import { useCartStore, useAgeGate } from '@/lib/cart-store';
import { useAllergenFilter } from '@/lib/allergen-filter';
import { getDrinkIcon } from '@/lib/drink-icon';
import { getDrinkImage } from '@/lib/drink-image';
import jarraQuijoteImg from '@/assets/drinks/jarra-quijote.png';
import jarraSanchoImg from '@/assets/drinks/jarra-sancho.png';
import jarraQuijoteLadronVeranoImg from '@/assets/drinks/jarra-quijote-ladron-verano.png';
import jarraSanchoLadronVeranoImg from '@/assets/drinks/jarra-sancho-ladron-verano.png';
import jarraQuijoteLadronManzanasImg from '@/assets/drinks/jarra-quijote-ladron-manzanas.png';
import jarraSanchoLadronManzanasImg from '@/assets/drinks/jarra-sancho-ladron-manzanas.png';
import { PRODUCT_IMAGES, MONTADITO_IMAGES_BY_NUMERO } from '@/lib/product-images';
import { AllergenIcon } from './AllergenIcon';
import { AllergenLegalNotice } from './AllergenLegalNotice';
import type { ProductAllergen } from '@/hooks/use-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface Product {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  foto_url: string | null;
  destacado: boolean;
  nuevo: boolean;
  numero?: string | null;
  tipo_pan?: string | null;
  seccion?: string | null;
  contiene_alcohol?: boolean;
  alergenos?: ProductAllergen[];
}

interface Props {
  product: Product;
  index: number;
  variant?: 'default' | 'drink';
  hideAllergens?: boolean;
}

const BREAD_BADGES: Record<string, string> = {
  '100M':        'bg-muted text-muted-foreground border-border',
  'Chapata':     'bg-[#8B5A2B]/15 text-[#C8956D] border-[#A0522D]/40',
  'Brioche':     'bg-amber-400/15 text-amber-400 border-amber-500/40',
  'Tortilla':    'bg-orange-400/15 text-orange-300 border-orange-400/40',
  'Mini Burger': 'bg-red-500/15 text-red-400 border-red-500/40',
  'Empotraíto':  'bg-[#6B8E23]/20 text-[#9CB071] border-[#6B8E23]/50',
};

const JARRA_SECTIONS = new Set(['Jarras Heladas', 'Cerveza Premium']);
const SANCHO_EXTRA = 0.5; // Sancho cuesta 0.50€ más que Quijote (Cerveza Premium: 2€/2.50€ · Jarras Heladas: 1.50€/2€)

export function ProductCard({ product, index, variant = 'default', hideAllergens = false }: Props) {
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const items = useCartStore((s) => s.items);
  const cantidadEnCarrito = items
    .filter((i) => i.productoId === product.id)
    .reduce((sum, i) => sum + i.cantidad, 0);
  const requestAlcohol = useAgeGate((s) => s.request);
  const excluded = useAllergenFilter((s) => s.excluded);
  const hideMode = useAllergenFilter((s) => s.hideMode);
  const [detailOpen, setDetailOpen] = useState(false);
  const [jarraOpen, setJarraOpen] = useState(false);
  const [gildaOpen, setGildaOpen] = useState(false);
  const [nachosOpen, setNachosOpen] = useState(false);
  const [alitasOpen, setAlitasOpen] = useState(false);


  const num = product.numero ?? null;
  const rest = product.nombre;
  const productImage = variant === 'drink'
    ? getDrinkImage(product.nombre, product.foto_url)
    : ((num ? MONTADITO_IMAGES_BY_NUMERO[num] : undefined) ?? PRODUCT_IMAGES[product.nombre] ?? product.foto_url);
  const drinkIcon = variant === 'drink' && !productImage ? getDrinkIcon(product.nombre) : null;
  const breadBadgeClass = product.tipo_pan ? BREAD_BADGES[product.tipo_pan] ?? 'bg-muted text-muted-foreground border-border' : null;

  const isJarra = !!product.seccion && JARRA_SECTIONS.has(product.seccion);

  const precioQuijote = product.precio;
  const precioSancho = product.precio + SANCHO_EXTRA;
  const productName = product.nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const isLadronDeVerano = productName.includes('ladron de verano') || productName.includes('tinto de verano');
  const isLadronDeManzanas = productName.includes('ladron de manzana');
  const isGilda = productName === 'gildas' || productName === 'gilda';
  const isNachos = productName === 'nachos';
  const isAlitas = productName === 'alitas de pollo';

  const gildaBoqueronImage = PRODUCT_IMAGES._gildaBoqueron;
  const gildaAnchoaImage = PRODUCT_IMAGES._gildaAnchoa;
  const nachosBaconImage = PRODUCT_IMAGES._nachosBacon;
  const nachosGuacamoleImage = PRODUCT_IMAGES._nachosGuaca;

  const jarraQuijoteOptionImg = isLadronDeVerano
    ? jarraQuijoteLadronVeranoImg
    : isLadronDeManzanas
      ? jarraQuijoteLadronManzanasImg
      : jarraQuijoteImg;
  const jarraSanchoOptionImg = isLadronDeVerano
    ? jarraSanchoLadronVeranoImg
    : isLadronDeManzanas
      ? jarraSanchoLadronManzanasImg
      : jarraSanchoImg;

  const alergenos = hideAllergens ? [] : (product.alergenos ?? []);
  const matchedExcluded = alergenos.filter((a) => excluded.includes(a.codigo));
  const hasExcluded = matchedExcluded.length > 0;

  if (hasExcluded && hideMode === 'hide') return null;

  const mappedAlergenos = alergenos.map((a) => ({ codigo: a.codigo, nombre: a.nombre, icono: a.icono }));

  const buildVariantPayload = (
    variant: string,
    variantLabel: string,
    nombre: string,
    foto_url: string | undefined | null,
    precio: number = product.precio,
  ) => ({
    id: `${product.id}::${variant}`,
    productoId: product.id,
    variant,
    variantLabel,
    nombre,
    precio,
    foto_url: foto_url ?? null,
    contiene_alcohol: !!product.contiene_alcohol,
    alergenos: mappedAlergenos,
  });

  const buildPayload = (jarra?: 'quijote' | 'sancho') => {
    if (jarra) {
      const label = jarra === 'quijote' ? 'Jarra Quijote' : 'Jarra Sancho';
      return buildVariantPayload(jarra, label, `${product.nombre} · ${label}`, productImage ?? product.foto_url, jarra === 'quijote' ? precioQuijote : precioSancho);
    }
    return {
      id: product.id,
      productoId: product.id,
      nombre: product.nombre,
      precio: product.precio,
      foto_url: productImage ?? product.foto_url,
      contiene_alcohol: !!product.contiene_alcohol,
      alergenos: mappedAlergenos,
    };
  };

  const buildGildaPayload = (tipo: 'boqueron' | 'anchoa') =>
    buildVariantPayload(
      tipo,
      tipo === 'boqueron' ? 'Boquerón' : 'Anchoa',
      `Gilda de ${tipo === 'boqueron' ? 'boquerón' : 'anchoa'}`,
      tipo === 'boqueron' ? gildaBoqueronImage : gildaAnchoaImage,
    );

  const addJarraVariant = (jarra: 'quijote' | 'sancho') => {
    const payload = buildPayload(jarra);
    if (product.contiene_alcohol) requestAlcohol(payload);
    else addItem(payload);
    setJarraOpen(false);
  };

  const addGildaVariant = (tipo: 'boqueron' | 'anchoa') => {
    const payload = buildGildaPayload(tipo);
    if (product.contiene_alcohol) requestAlcohol(payload);
    else addItem(payload);
    setGildaOpen(false);
  };

  const buildNachosPayload = (salsa: 'bacon' | 'guacamole') => {
    const label = salsa === 'bacon' ? 'Cheddar y bacon ahumado' : 'Cheddar y guacamole';
    return buildVariantPayload(salsa, label, `Nachos · ${label}`, salsa === 'bacon' ? nachosBaconImage : nachosGuacamoleImage);
  };

  const addNachosVariant = (salsa: 'bacon' | 'guacamole') => {
    const payload = buildNachosPayload(salsa);
    if (product.contiene_alcohol) requestAlcohol(payload);
    else addItem(payload);
    setNachosOpen(false);
  };

  const alitasBbqImage = PRODUCT_IMAGES._alitasBbq;
  const alitasBravaImage = PRODUCT_IMAGES._alitasBrava;

  const buildAlitasPayload = (sabor: 'bbq' | 'brava') =>
    buildVariantPayload(
      sabor,
      sabor === 'bbq' ? 'BBQ' : 'Brava',
      `Alitas de pollo · ${sabor === 'bbq' ? 'BBQ' : 'Brava'}`,
      sabor === 'bbq' ? alitasBbqImage : alitasBravaImage,
    );

  const addAlitasVariant = (sabor: 'bbq' | 'brava') => {
    const payload = buildAlitasPayload(sabor);
    if (product.contiene_alcohol) requestAlcohol(payload);
    else addItem(payload);
    setAlitasOpen(false);
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isJarra) {
      setJarraOpen(true);
      return;
    }
    if (isGilda) {
      setGildaOpen(true);
      return;
    }
    if (isNachos) {
      setNachosOpen(true);
      return;
    }
    if (isAlitas) {
      setAlitasOpen(true);
      return;
    }


    const payload = buildPayload();
    if (product.contiene_alcohol) {
      requestAlcohol(payload);
    } else {
      addItem(payload);
    }
  };


  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.02, duration: 0.3 }}
        whileTap={{ scale: 0.98 }}
        className={`relative glass-card flex items-center gap-3 p-3 cursor-pointer group ${hasExcluded ? 'ring-1 ring-destructive/40' : ''}`}
        onClick={() => setDetailOpen(true)}
      >
        {productImage && (
          <span className="relative w-12 h-12 rounded-xl bg-card overflow-visible shrink-0 shadow-sm border border-border-subtle">
            <img src={productImage} alt={product.nombre} className="w-full h-full object-contain rounded-xl overflow-hidden" loading="lazy" />
            {num && productImage?.startsWith('/assets/img/montaditos/') && (
              <span className="absolute -bottom-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full bg-muted/90 text-muted-foreground text-[9px] font-semibold flex items-center justify-center border border-border leading-none">
                {num}
              </span>
            )}
          </span>
        )}

        {drinkIcon && (
          <span
            className={`w-12 h-12 rounded-xl ${drinkIcon.bg} flex items-center justify-center text-2xl shrink-0 shadow-sm`}
            aria-hidden
          >
            {drinkIcon.emoji}
          </span>
        )}

        {!productImage && !drinkIcon && num && (
          <span className="w-8 h-8 rounded-lg bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0">
            {num}
          </span>
        )}

        {!num && product.nuevo && (
          <span className="px-1.5 py-0.5 bg-accent text-accent-foreground text-[9px] font-bold uppercase tracking-wider rounded shrink-0">
            Nuevo
          </span>
        )}

        <div className="flex-1 min-w-0">
          <h3 className="font-display text-sm font-bold text-foreground leading-tight truncate">
            {rest}
          </h3>
          {breadBadgeClass && (
            <span className={`inline-block mt-1 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded border ${breadBadgeClass}`}>
              Pan {product.tipo_pan}
            </span>
          )}
          {product.descripcion && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {product.descripcion}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-gold whitespace-nowrap">
            {isJarra
              ? `${precioQuijote.toFixed(2)} / ${precioSancho.toFixed(2)} €`
              : `${product.precio.toFixed(2)} €`}
          </span>
          <AnimatePresence mode="wait" initial={false}>
            {cantidadEnCarrito === 0 || isJarra || isGilda || isNachos || isAlitas ? (
              <motion.button
                key="add"
                type="button"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                whileTap={{ scale: 0.85 }}
                onClick={handleAdd}
                aria-label={isJarra ? 'Elegir tamaño de jarra' : isGilda ? 'Elegir tipo de gilda' : isNachos ? 'Elegir salsa de nachos' : isAlitas ? 'Elegir sabor de alitas' : 'Añadir al carrito'}
                className="relative w-8 h-8 rounded-full bg-primary flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity"
              >
                <Plus className="w-4 h-4 text-primary-foreground" />
                {(isJarra || isGilda || isNachos || isAlitas) && cantidadEnCarrito > 0 && (

                  <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {cantidadEnCarrito}
                  </span>
                )}
              </motion.button>


            ) : (
              <motion.div
                key="stepper"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 bg-primary/10 border border-primary/40 rounded-full p-0.5"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateQuantity(product.id, cantidadEnCarrito - 1);
                  }}
                  aria-label="Quitar uno"
                  className="w-7 h-7 rounded-full bg-surface-elevated flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Minus className="w-3.5 h-3.5 text-foreground" />
                </button>
                <span className="min-w-[1.25rem] text-center text-sm font-bold text-foreground tabular-nums">
                  {cantidadEnCarrito}
                </span>
                <button
                  type="button"
                  onClick={handleAdd}
                  aria-label="Añadir uno más"
                  className="w-7 h-7 rounded-full bg-primary flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Plus className="w-3.5 h-3.5 text-primary-foreground" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {hasExcluded && (
          <div className="absolute inset-0 rounded-[inherit] bg-destructive/30 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <span className="bg-destructive text-destructive-foreground text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
              <AlertCircle className="w-3.5 h-3.5" />
              Contiene alérgenos seleccionados
            </span>
          </div>
        )}
      </motion.div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-sm rounded-2xl p-0 gap-0 overflow-hidden max-h-[85vh] border-border-subtle">
          {/* Imagen principal — ocupa la parte superior del modal */}
          <div className="relative flex items-center justify-center bg-gradient-to-b from-secondary/60 to-muted/30 pt-6 pb-4 px-6">
            {/* Zona suave circular/beige detrás de la imagen */}
            <div className="absolute w-56 h-56 rounded-full bg-[#F5F0E0]/80 blur-xl" />
            {productImage ? (
              <img
                src={productImage}
                alt={product.nombre}
                className="relative z-10 h-44 sm:h-52 w-auto object-contain drop-shadow-lg"
                loading="lazy"
              />
            ) : num ? (
              <span className="relative z-10 w-32 h-32 rounded-2xl bg-card flex items-center justify-center text-4xl font-black text-accent shadow-gold">
                {num}
              </span>
            ) : (
              <span className="relative z-10 w-32 h-32 rounded-2xl bg-card flex items-center justify-center text-4xl shadow-gold">
                🍽️
              </span>
            )}
          </div>

          {/* Contenido textual */}
          <div className="px-5 pb-5 pt-2 max-h-[55vh] overflow-y-auto">
            {breadBadgeClass && (
              <span className={`inline-block mb-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${breadBadgeClass}`}>
                Pan {product.tipo_pan}
              </span>
            )}

            <h2 className="font-display text-2xl sm:text-[1.75rem] font-black text-foreground leading-tight">
              {rest}
            </h2>

            {product.descripcion && (
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {product.descripcion}
              </p>
            )}

            {alergenos.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <h4 className="font-display text-sm font-bold mb-3 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  Alérgenos
                </h4>
                <div className="flex flex-wrap gap-3">
                  {alergenos.map((a) => (
                    <AllergenIcon
                      key={a.codigo}
                      codigo={a.codigo}
                      nombre={a.nombre}
                      icono={a.icono}
                      size="md"
                      showLabel
                    />
                  ))}
                </div>
                <div className="mt-3">
                  <AllergenLegalNotice variant="short" />
                </div>
              </div>
            )}
          </div>

          {/* Footer fijo: precio + botón Añadir */}
          <div className="px-5 py-4 border-t border-border-subtle bg-card flex items-center justify-between gap-3">
            <span className="text-xl font-black text-gold whitespace-nowrap">
              {isJarra
                ? `${precioQuijote.toFixed(2)} / ${precioSancho.toFixed(2)} €`
                : `${product.precio.toFixed(2)} €`}
            </span>
            <button
              onClick={(e) => {
                handleAdd(e);
                setDetailOpen(false);
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-primary active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4" />
              {isJarra ? 'Elegir tamaño' : isGilda || isNachos || isAlitas ? 'Elegir' : 'Añadir'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={jarraOpen} onOpenChange={setJarraOpen}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">¿Qué jarra prefieres?</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              {product.nombre}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => addJarraVariant('quijote')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
            >
              <img src={jarraQuijoteOptionImg} alt="Jarra Quijote" className="h-24 w-auto object-contain" />
              <span className="font-display font-bold text-base text-foreground">Quijote</span>
              <span className="text-xs text-muted-foreground">Tamaño estándar</span>
              <span className="text-lg font-black text-gold mt-1">{precioQuijote.toFixed(2)} €</span>
            </button>
            <button
              onClick={() => addJarraVariant('sancho')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
            >
              <img src={jarraSanchoOptionImg} alt="Jarra Sancho" className="h-24 w-auto object-contain" />
              <span className="font-display font-bold text-base text-foreground">Sancho</span>
              <span className="text-xs text-muted-foreground">Tamaño grande</span>
              <span className="text-lg font-black text-gold mt-1">{precioSancho.toFixed(2)} €</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={gildaOpen} onOpenChange={setGildaOpen}>
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
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
            >
              <img src={gildaBoqueronImage} alt="Gilda de boquerón" className="h-24 w-auto object-contain" loading="lazy" />
              <span className="font-display font-bold text-base text-foreground">Boquerón</span>
              <span className="text-xs text-muted-foreground text-center">Suave y fresco</span>
              <span className="text-lg font-black text-gold mt-1">{product.precio.toFixed(2)} €</span>
            </button>
            <button
              onClick={() => addGildaVariant('anchoa')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
            >
              <img src={gildaAnchoaImage} alt="Gilda de anchoa" className="h-24 w-auto object-contain" loading="lazy" />
              <span className="font-display font-bold text-base text-foreground">Anchoa</span>
              <span className="text-xs text-muted-foreground text-center">Intenso y curado</span>
              <span className="text-lg font-black text-gold mt-1">{product.precio.toFixed(2)} €</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={nachosOpen} onOpenChange={setNachosOpen}>
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
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
            >
              <img src={nachosBaconImage} alt="Nachos con cheddar y bacon ahumado" className="h-24 w-auto object-contain" loading="lazy" />
              <span className="font-display font-bold text-base text-foreground text-center">Cheddar y bacon ahumado</span>
              <span className="text-lg font-black text-gold mt-1">{product.precio.toFixed(2)} €</span>
            </button>
            <button
              onClick={() => addNachosVariant('guacamole')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
            >
              <img src={nachosGuacamoleImage} alt="Nachos con cheddar y guacamole" className="h-24 w-auto object-contain" loading="lazy" />
              <span className="font-display font-bold text-base text-foreground text-center">Cheddar y guacamole</span>
              <span className="text-lg font-black text-gold mt-1">{product.precio.toFixed(2)} €</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={alitasOpen} onOpenChange={setAlitasOpen}>
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
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
            >
              <img src={alitasBbqImage} alt="Alitas BBQ" className="h-24 w-auto object-contain" loading="lazy" />
              <span className="font-display font-bold text-base text-foreground text-center">Sabor BBQ</span>
              <span className="text-xs text-muted-foreground text-center">Ahumado y dulce</span>
              <span className="text-lg font-black text-gold mt-1">{product.precio.toFixed(2)} €</span>
            </button>
            <button
              onClick={() => addAlitasVariant('brava')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
            >
              <img src={alitasBravaImage} alt="Alitas Brava" className="h-24 w-auto object-contain" loading="lazy" />
              <span className="font-display font-bold text-base text-foreground text-center">Sabor Brava</span>
              <span className="text-xs text-muted-foreground text-center">Picante e intenso</span>
              <span className="text-lg font-black text-gold mt-1">{product.precio.toFixed(2)} €</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>


  );
}

