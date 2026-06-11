import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { ClientHeader } from '@/components/client/ClientHeader';
import { LocalSelector } from '@/components/client/LocalSelector';
import { useActiveLocal } from '@/lib/active-local';
import { CategoryGrid } from '@/components/client/CategoryGrid';
import { SectionTabs } from '@/components/client/SectionTabs';
import { ProductCard } from '@/components/client/ProductCard';
import { CartSheet } from '@/components/client/CartSheet';
import { AlcoholWarningSheet } from '@/components/client/AlcoholWarningSheet';
import { AllergenFilterSheet } from '@/components/client/AllergenFilterSheet';
import { AllergenLegalNoticeFloat } from '@/components/client/AllergenLegalNotice';
import { OrderTracking } from '@/components/client/OrderTracking';
import { MenuChatBot } from '@/components/client/MenuChatBot';
import { WelcomeScreen } from '@/components/client/WelcomeScreen';
import { MontyLoader } from '@/components/client/MontyLoader';
import { useCategories, useProducts } from '@/hooks/use-menu';
import { useAllergens } from '@/hooks/use-allergens';
import { useCartStore } from '@/lib/cart-store';
import { useAllergenFilter } from '@/lib/allergen-filter';
import { supabase } from '@/integrations/supabase/client';
import { EmbeddedCheckout } from '@/components/client/EmbeddedCheckout';
import { toast } from 'sonner';
import { registerPushServiceWorker, usePushSubscription } from '@/hooks/use-push-notifications';

const WELCOME_KEY = 'monty-welcome-seen';
const ACTIVE_ORDER_KEY = 'monty-active-order';
const BEBIDAS_CATEGORY_NAME = 'Bebidas';
const INITIAL_STAFF_STATUS = 'pendiente_pago' as const;

const MONTADITO_SECTIONS = [
  'De la casa',
  'Clásicos',
  'Imprescindibles',
  'Especiales',
  'MontyCookie',
  'MontyDinas',
  'MontyPerros',
  'MontyBurgers',
  'MontyPizzas',
  'MontyGourmet',
] as const;

const BEBIDAS_SECTIONS = [
  'Clásicas',
  'Energéticas',
  'Tardeo Chill',
  'Tardeo Premium',
  'Jarras Heladas',
  'Cerveza Premium',
  'Cerveza en Botella',
  'Vino',
  'Café e Infusiones',
] as const;

const APERITIVOS_SECTIONS = [
  'Aperitivos',
  'Para picar',
] as const;



type ActiveOrder = {
  pedidoId: string;
  numeroPedido: number;
  hasCocina: boolean;
  hasBebidas: boolean;
  sessionId?: string;
  total?: number;
};

const loadActiveOrder = (): ActiveOrder | null => {
  try {
    const raw = localStorage.getItem(ACTIVE_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.pedidoId && parsed?.numeroPedido) {
      return {
        pedidoId: parsed.pedidoId,
        numeroPedido: parsed.numeroPedido,
        hasCocina: parsed.hasCocina ?? true,
        hasBebidas: parsed.hasBebidas ?? false,
        sessionId: parsed.sessionId,
        total: parsed.total,
      };
    }
    if (parsed?.cocina || parsed?.bebidas) {
      const ref = parsed.cocina || parsed.bebidas;
      return {
        pedidoId: ref.pedidoId,
        numeroPedido: ref.numeroPedido,
        hasCocina: !!parsed.cocina,
        hasBebidas: !!parsed.bebidas,
        sessionId: ref.sessionId,
      };
    }
    return null;
  } catch {
    return null;
  }
};

const ClientApp = () => {
  const [searchParams] = useSearchParams();
  const localSlugFromUrl = searchParams.get('local');
  const mesaNum = searchParams.get('mesa');

  const activeLocal = useActiveLocal((s) => s.local);
  const setActiveLocal = useActiveLocal((s) => s.setLocal);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [showLocalSelector, setShowLocalSelector] = useState(false);
  const [orderState, setOrderState] = useState<ActiveOrder | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<ActiveOrder | null>(null);
  const [resumableOrder, setResumableOrder] = useState<ActiveOrder | null>(null);
  const [recovering, setRecovering] = useState(() => !!loadActiveOrder()?.pedidoId);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const { data: allAllergens = [] } = useAllergens();
  const excluded = useAllergenFilter((s) => s.excluded);
  const toggleExcluded = useAllergenFilter((s) => s.toggle);

  // Refs para el handler de back button (evita closures obsoletos)
  const pendingCheckoutRef = useRef<ActiveOrder | null>(pendingCheckout);
  const activeCategoryRef = useRef<string | null>(activeCategory);
  const activeSectionRef = useRef<string | null>(activeSection);
  const handlePaymentCancelRef = useRef<() => void>(() => {});
  useEffect(() => { pendingCheckoutRef.current = pendingCheckout; }, [pendingCheckout]);
  useEffect(() => { activeCategoryRef.current = activeCategory; }, [activeCategory]);
  useEffect(() => { activeSectionRef.current = activeSection; }, [activeSection]);

  // Botón atrás del móvil — mapea a navegación interna
  // Siempre hay una entrada en el historial para interceptar el back.
  // Después de cada navegación se re-inserta la guardia para que el
  // siguiente back también sea interceptado (sin esto, solo funciona una vez).
  useEffect(() => {
    window.history.pushState({ step: 'root' }, '');

    const onPopState = () => {
      if (pendingCheckoutRef.current) {
        // Opción A: volver al menú con el pedido recuperable, sin cancelar
        setResumableOrder(pendingCheckoutRef.current);
        setPendingCheckout(null);
        setActiveCategory(null);
        setActiveSection(null);
        window.history.pushState({ step: 'root' }, '');
      } else if (activeSectionRef.current) {
        setActiveSection(null);
        window.history.pushState({ step: 'category' }, '');
      } else if (activeCategoryRef.current) {
        setActiveCategory(null);
        window.history.pushState({ step: 'root' }, '');
      } else {
        window.history.pushState({ step: 'root' }, '');
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => { registerPushServiceWorker(); }, []);

  // Recuperar sesión al arrancar: verificar en DB el estado real del pedido guardado
  useEffect(() => {
    const saved = loadActiveOrder();
    if (!saved?.pedidoId) { setRecovering(false); return; }

    supabase
      .from('pedidos')
      .select('estado')
      .eq('id', saved.pedidoId)
      .maybeSingle()
      .then(({ data: pedido }) => {
        if (!pedido || pedido.estado === 'cancelado' || pedido.estado === 'entregado') {
          localStorage.removeItem(ACTIVE_ORDER_KEY);
        } else if (pedido.estado === 'pendiente_pago') {
          setResumableOrder(saved);
        } else {
          // en_preparacion, listo → mostrar seguimiento
          setOrderState(saved);
        }
      })
      .catch(() => {
        // Sin red: mostrar banner recuperable para no perder el pedido
        setResumableOrder(saved);
      })
      .finally(() => setRecovering(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If a `local` slug is provided in the URL (e.g. QR), bind that local automatically.
  useEffect(() => {
    if (!localSlugFromUrl) return;
    if (activeLocal) return;
    (async () => {
      const { data } = await supabase
        .from('locales')
        .select('id, nombre, ciudad, direccion')
        .eq('slug', localSlugFromUrl)
        .eq('activo', true)
        .maybeSingle();
      if (data) setActiveLocal(data as any);
    })();
  }, [localSlugFromUrl, activeLocal, setActiveLocal]);

  useEffect(() => {
    if (!activeLocal) return;
    if (!localStorage.getItem(WELCOME_KEY)) {
      setWelcomeOpen(true);
    }
  }, [activeLocal]);

  // Al volver de Stripe Checkout, mostrar feedback y restaurar el seguimiento del pedido.
  useEffect(() => {
    const pago = searchParams.get('pago');
    if (!pago) return;
    if (pago === 'ok') {
      toast.success('¡Pago realizado con éxito!');
      const saved = loadActiveOrder();
      if (saved) setOrderState(saved);
    } else if (pago === 'cancel') {
      toast.error('Pago cancelado');
      localStorage.removeItem(ACTIVE_ORDER_KEY);
    }
    // limpiar query params
    window.history.replaceState({}, '', window.location.pathname);
  }, [searchParams]);

  const closeWelcome = () => {
    localStorage.setItem(WELCOME_KEY, '1');
    setWelcomeOpen(false);
  };

  const { subscribe } = usePushSubscription();

  const { data: categories = [], isLoading: loadingCategories } = useCategories();
  const { data: products = [] } = useProducts(activeCategory || undefined);
  const cart = useCartStore();

  const selectedCategory = categories.find((c: any) => c.id === activeCategory);


  const showLoader = loadingCategories && !welcomeOpen && !!activeLocal;

  const handleCheckout = useCallback(async (ageVerified: boolean) => {
    if (cart.items.length === 0) return;
    if (isCheckingOut) return;
    if (!activeLocal) {
      toast.error('Selecciona un local primero');
      setShowLocalSelector(true);
      return;
    }

    setIsCheckingOut(true);
    try {
      const localId = activeLocal.id;
      const sessionId = cart.sessionId?.trim();
      if (!sessionId) throw new Error('Sesión de pedido no disponible');
      // Fetch categories for items in cart to split Bebidas vs cocina with the exact shared rule.
      const productIds = Array.from(new Set(cart.items.map((i) => i.productoId)));
      const { data: prodCats, error: prodErr } = await supabase
        .from('menu_productos')
        .select('id, categoria_id, menu_categorias(nombre)')
        .in('id', productIds);
      if (prodErr) throw prodErr;

      const isBebida = (productoId: string) => {
        const p = prodCats?.find((x) => x.id === productoId);
        return (p?.menu_categorias as any)?.nombre === BEBIDAS_CATEGORY_NAME;
      };

      const hasBebidas = cart.items.some((i) => isBebida(i.productoId));
      const hasCocina = cart.items.some((i) => !isBebida(i.productoId));

      // Determinar estados iniciales según las partes del pedido
      const total = cart.items.reduce((s, i) => s + i.precio * i.cantidad, 0);
      const { data: pedido, error: pErr } = await supabase
        .from('pedidos')
        .insert({
          local_id: localId,
          numero_pedido: 0,
          total,
          session_id: sessionId,
          estado: INITIAL_STAFF_STATUS,
          tipo: hasCocina && hasBebidas ? 'mixto' : (hasBebidas ? 'bebidas' : 'cocina'),
          estado_cocina: hasCocina ? INITIAL_STAFF_STATUS : null,
          estado_bebidas: hasBebidas ? INITIAL_STAFF_STATUS : null,
          edad_verificada_cliente: ageVerified,
        } as any)
        .select()
        .setHeader('x-session-id', sessionId)
        .single();
      if (pErr) throw pErr;

      const itemRows = cart.items.map((item) => ({
        pedido_id: pedido.id,
        producto_id: item.productoId,
        cantidad: item.cantidad,
        precio_unitario: item.precio,
        destino: isBebida(item.productoId) ? 'bebidas' : 'cocina',
      }));

      const { error: iErr } = await supabase
        .from('pedido_items')
        .insert(itemRows as any)
        .setHeader('x-session-id', sessionId);
      if (iErr) throw iErr;

      const newOrder: ActiveOrder = {
        pedidoId: pedido.id,
        numeroPedido: pedido.numero_pedido,
        hasCocina,
        hasBebidas,
        sessionId,
        total,
      };

      // Persistimos para soportar recarga durante el pago
      localStorage.setItem(ACTIVE_ORDER_KEY, JSON.stringify(newOrder));
      cart.clearCart();
      setCartOpen(false);
      setPendingCheckout(newOrder);
      subscribe(sessionId, pedido.id).catch(() => {});

    } catch (err) {
      console.error('[checkout error]', err);
      const detail =
        err instanceof Error ? err.message : JSON.stringify(err);
      toast.error(`Error al crear el pedido: ${detail}`);
    } finally {
      setIsCheckingOut(false);
    }
  }, [cart, activeLocal, isCheckingOut]);

  const handlePaymentSuccess = useCallback(() => {
    if (!pendingCheckout) return;
    setOrderState(pendingCheckout);
    setPendingCheckout(null);
  }, [pendingCheckout]);

  const handlePaymentCancel = useCallback(async () => {
    if (pendingCheckout?.pedidoId && pendingCheckout?.sessionId) {
      try {
        await supabase.rpc('cancel_own_pending_order', { _pedido_id: pendingCheckout.pedidoId } as any)
          .setHeader('x-session-id', pendingCheckout.sessionId);
      } catch (e) { console.error(e); }
    }
    localStorage.removeItem(ACTIVE_ORDER_KEY);
    setPendingCheckout(null);
  }, [pendingCheckout]);

  // Mantener ref siempre actualizado con la versión más reciente
  useEffect(() => { handlePaymentCancelRef.current = handlePaymentCancel; });

  const handlePaymentBackToMenu = useCallback(() => {
    if (pendingCheckout) {
      setResumableOrder(pendingCheckout);
      setPendingCheckout(null);
    }
  }, [pendingCheckout]);

  const handleCancelResumable = useCallback(async () => {
    if (resumableOrder?.pedidoId && resumableOrder?.sessionId) {
      try {
        await supabase.rpc('cancel_own_pending_order', { _pedido_id: resumableOrder.pedidoId } as any)
          .setHeader('x-session-id', resumableOrder.sessionId);
      } catch (e) { console.error(e); }
    }
    localStorage.removeItem(ACTIVE_ORDER_KEY);
    setResumableOrder(null);
  }, [resumableOrder]);

  const handleRetryFromTracking = useCallback(() => {
    if (orderState) setPendingCheckout(orderState);
  }, [orderState]);

  const handleOrderComplete = useCallback(() => {
    localStorage.removeItem(ACTIVE_ORDER_KEY);
    setOrderState(null);
  }, []);

  if (recovering) {
    return <MontyLoader />;
  }

  if (pendingCheckout) {
    return (
      <EmbeddedCheckout
        pedidoId={pendingCheckout.pedidoId}
        sessionId={pendingCheckout.sessionId ?? ''}
        numeroPedido={pendingCheckout.numeroPedido}
        total={pendingCheckout.total ?? 0}
        onSuccess={handlePaymentSuccess}
        onCancel={handlePaymentBackToMenu}
      />
    );
  }

  if (orderState) {
    return (
      <OrderTracking
        pedidoId={orderState.pedidoId}
        numeroPedido={orderState.numeroPedido}
        hasCocina={orderState.hasCocina}
        hasBebidas={orderState.hasBebidas}
        sessionId={orderState.sessionId}
        onNewOrder={handleOrderComplete}
        onRetryPayment={handleRetryFromTracking}
      />
    );
  }

  // Gate: no local activo => pantalla de selección obligatoria
  if (!activeLocal) {
    return <LocalSelector />;
  }

  return (
    <div className="min-h-screen bg-background">
      <ClientHeader
        localName={activeLocal.nombre}
        mesa={mesaNum ? parseInt(mesaNum) : undefined}
        onCartClick={() => setCartOpen(true)}
        onChangeLocal={() => setShowLocalSelector(true)}
        onFilterClick={() => setFilterOpen(true)}
      />

      {resumableOrder && (
        <div className="px-4 pt-3 pb-1 max-w-lg mx-auto">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Pedido #{resumableOrder.numeroPedido} pendiente de pago
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Tu pedido sigue reservado. ¿Quieres completar el pago?
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setPendingCheckout(resumableOrder)}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Pagar
              </button>
              <button
                onClick={handleCancelResumable}
                className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {excluded.length > 0 && (
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
              Excluyendo:
            </span>
            {excluded.map((code) => {
              const a = allAllergens.find((x) => x.codigo === code);
              if (!a) return null;
              return (
                <button
                  key={code}
                  onClick={() => toggleExcluded(code)}
                  className="flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full bg-destructive/15 border border-destructive/40 text-destructive text-[11px] font-semibold"
                >
                  <span aria-hidden>{a.icono}</span>
                  {a.nombre}
                  <X className="w-3 h-3" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!activeCategory ? (
        <>
          <div className="px-4 pt-6 pb-6 max-w-lg mx-auto text-center">
            <h2 className="font-display text-3xl font-black leading-tight text-foreground">
              ¿Qué te <span className="text-primary italic">apetece</span> hoy?
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Elige una sección para empezar
            </p>
          </div>
          <div className="pb-8">
            <CategoryGrid categories={categories} onSelect={setActiveCategory} />
          </div>
        </>
      ) : (
        <>
          <div className="px-4 pt-6 pb-2 max-w-lg mx-auto flex items-center gap-3">
            <button
              onClick={() => { setActiveCategory(null); setActiveSection(null); }}
              className="shrink-0 w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-lg hover:bg-surface-elevated transition-colors"
              aria-label="Volver"
            >
              ←
            </button>
            <h2 className="font-display text-2xl font-black leading-tight text-foreground">
              {selectedCategory?.nombre ?? 'Menú'}
            </h2>
          </div>

          {(() => {
            const isMontaditos = selectedCategory?.nombre === 'Montaditos';
            const isBebidas = selectedCategory?.nombre === 'Bebidas';
            const isAperitivos = selectedCategory?.nombre === 'Aperitivos';
            const sectionList: readonly string[] | null = isMontaditos
              ? MONTADITO_SECTIONS
              : isBebidas
              ? BEBIDAS_SECTIONS
              : isAperitivos
              ? APERITIVOS_SECTIONS
              : null;
            const isDrink = isBebidas;


            if (!sectionList) {
              return (
                <div className="px-4 pb-32 max-w-lg mx-auto">

                  <div className="flex flex-col gap-2">
                    {products.map((product, i) => (
                      <ProductCard key={product.id} product={product as any} index={i} />
                    ))}
                  </div>
                </div>
              );
            }

            const available = sectionList.filter((s) =>
              (products as any[]).some((p) => p.seccion === s)
            );
            const grouped = sectionList
              .filter((sec) => !activeSection || sec === activeSection)
              .map((sec) => ({
                sec,
                items: (products as any[])
                  .filter((p) => p.seccion === sec)
                  .sort((a, b) => {
                    const na = parseInt((a.numero ?? '0').replace(/\D/g, '')) || 0;
                    const nb = parseInt((b.numero ?? '0').replace(/\D/g, '')) || 0;
                    return na - nb;
                  }),
              }))
              .filter((g) => g.items.length > 0);
            const sinSeccion = (products as any[]).filter((p) => !p.seccion);
            let idx = 0;
            return (
              <>
                <div className="px-4 pb-3 max-w-lg mx-auto">
                  <SectionTabs
                    sections={available}
                    active={activeSection}
                    onSelect={setActiveSection}
                  />
                </div>
                <div className="px-4 pb-32 max-w-lg mx-auto">
                  <div className="flex flex-col gap-6">
                    {grouped.map((g) => (
                      <section key={g.sec}>
                        {!activeSection && (
                          <h3 className="font-display text-base font-black uppercase tracking-wider text-primary mb-2 pl-1 border-l-4 border-primary">
                            <span className="pl-2">{g.sec}</span>
                          </h3>
                        )}
                        <div className="flex flex-col gap-2">
                          {g.items.map((p) => (
                            <ProductCard
                              key={p.id}
                              product={p}
                              index={idx++}
                              variant={isDrink ? 'drink' : 'default'}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                    {(!activeSection) && sinSeccion.length > 0 && (
                      <section>
                        <h3 className="font-display text-base font-black uppercase tracking-wider text-muted-foreground mb-2 pl-1 border-l-4 border-border">
                          <span className="pl-2">Otros</span>
                        </h3>
                        <div className="flex flex-col gap-2">
                          {sinSeccion.map((p) => (
                            <ProductCard
                              key={p.id}
                              product={p}
                              index={idx++}
                              variant={isDrink ? 'drink' : 'default'}
                            />
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </>
            );
          })()}

        </>
      )}

      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={handleCheckout}
        isCheckingOut={isCheckingOut}
      />

      <AllergenLegalNoticeFloat />

      <AllergenFilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} />

      <MenuChatBot />
      <AlcoholWarningSheet />

      <WelcomeScreen open={welcomeOpen} onClose={closeWelcome} />
      {showLoader && <MontyLoader message="Preparando el menú" />}

      {showLocalSelector && (
        <div className="fixed inset-0 z-40 bg-background overflow-y-auto">
          <LocalSelector onSelected={() => setShowLocalSelector(false)} />
        </div>
      )}
    </div>
  );
};

export default ClientApp;
