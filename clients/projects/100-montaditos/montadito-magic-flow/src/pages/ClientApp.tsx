import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { ClientHeader } from '@/components/client/ClientHeader';
import { LocalSelector } from '@/components/client/LocalSelector';
import { useActiveLocal } from '@/lib/active-local';
import { CategoryGrid } from '@/components/client/CategoryGrid';
import { DesayunoCard } from '@/components/client/DesayunoCard';
import { PromoCard } from '@/components/client/PromoCard';
import { PromoComboCard } from '@/components/client/PromoComboCard';
import { COMBOS_5E, COMBO5_COCINA_PRODUCT_ID } from '@/lib/promos-5e';
import { DESAYUNO_VIEW_SECTIONS, isDesayunoTime, DESAYUNO_COMBOS, DESAYUNO_COCINA_PRODUCT_ID } from '@/lib/desayunos';
import { DesayunoComboCard } from '@/components/client/DesayunoComboCard';
import { SECTION_IMAGES } from '@/lib/section-images';
import { useQuery } from '@tanstack/react-query';
import { PROMO_NACHOS_PRODUCT_ID } from '@/lib/promo';
import { isCocinaOpen } from '@/lib/kitchen-hours';
import { SectionTabs } from '@/components/client/SectionTabs';
import { ProductCard } from '@/components/client/ProductCard';
import { MontyRuedaCard } from '@/components/client/MontyRuedaCard';
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
import { useLocalRestricciones, buildRestriccionFilter } from '@/hooks/use-local-restricciones';
import { useAgotados } from '@/hooks/use-agotados';
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
  // Jarras y cervezas arriba del todo
  'Jarras Heladas',
  'Cerveza Premium',
  'Cerveza en Botella',
  // Luego las bebidas clásicas
  'Clásicas',
  // Resto
  'Energéticas',
  'Tardeo Chill',
  'Tardeo Premium',
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
    // Only pedidoId is required — numeroPedido can be 0 when the DB trigger hasn't fired yet
    if (parsed?.pedidoId) {
      return {
        pedidoId: parsed.pedidoId,
        numeroPedido: parsed.numeroPedido ?? 0,
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

  // Escape hatch: /?reset=1 limpia localStorage y recarga.
  // Útil cuando el app queda bloqueado por un pedido corrupto en storage.
  if (searchParams.get('reset') === '1') {
    localStorage.removeItem(ACTIVE_ORDER_KEY);
    window.location.replace(window.location.pathname);
    return null;
  }

  const localSlugFromUrl = searchParams.get('local');
  const mesaNum = searchParams.get('mesa');

  const activeLocal = useActiveLocal((s) => s.local);
  const setActiveLocal = useActiveLocal((s) => s.setLocal);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [promo5eOpen, setPromo5eOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [showLocalSelector, setShowLocalSelector] = useState(false);
  const [orderState, setOrderState] = useState<ActiveOrder | null>(() => {
    // Recuperación síncrona en el primer render para evitar flash de LocalSelector
    // cuando iOS borra localStorage tras el redirect cross-domain de Apple Pay.
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('pago') !== 'ok') return null;
    const saved = loadActiveOrder();
    if (saved) return saved;
    const pid = urlParams.get('pid');
    const num = urlParams.get('num');
    const sid = urlParams.get('sid');
    if (!pid || num === null) return null;
    const recovered: ActiveOrder = {
      pedidoId: pid,
      numeroPedido: parseInt(num, 10),
      hasCocina: urlParams.get('cocina') !== '0',
      hasBebidas: urlParams.get('bebidas') === '1',
      sessionId: sid ?? undefined,
    };
    localStorage.setItem(ACTIVE_ORDER_KEY, JSON.stringify(recovered));
    return recovered;
  });
  const [pendingCheckout, setPendingCheckout] = useState<ActiveOrder | null>(null);
  const [resumableOrder, setResumableOrder] = useState<ActiveOrder | null>(null);
  // Si venimos del redirect de Apple Pay (/?pago=ok), empezamos sin recovering
  // para que MontyLoader NUNCA bloquee la pantalla. El efecto pago=ok restaura el pedido.
  const [recovering, setRecovering] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('pago') === 'ok') return false;
    return !!loadActiveOrder()?.pedidoId;
  });
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

  // Salvaguarda anti-congelado: a veces Radix deja `pointer-events:none` en <body>
  // al cerrar un diálogo/sheet (bug conocido) y bloquea toda la pantalla hasta recargar.
  // Lo limpiamos automáticamente cuando ya no hay ningún overlay abierto.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.body.style.pointerEvents === 'none') {
        const overlayOpen = document.querySelector(
          '[data-state="open"][role="dialog"],[data-state="open"][role="alertdialog"],[data-radix-popper-content-wrapper]',
        );
        if (!overlayOpen) document.body.style.pointerEvents = '';
      }
    }, 400);
    return () => clearInterval(id);
  }, []);

  // Recuperar sesión al arrancar: verificar en DB el estado real del pedido guardado
  useEffect(() => {
    const saved = loadActiveOrder();
    if (!saved?.pedidoId) { setRecovering(false); return; }

    // Venimos del redirect de Apple Pay / Google Pay (/?pago=ok).
    // Llamamos confirm-payment para que el pedido salga de pendiente_pago inmediatamente
    // sin depender del timing del webhook de Stripe.
    const params = new URLSearchParams(window.location.search);
    if (params.get('pago') === 'ok') {
      const paymentIntentId = params.get('payment_intent');
      if (paymentIntentId && saved.pedidoId && saved.sessionId) {
        supabase.functions.invoke('confirm-payment', {
          body: { pedido_id: saved.pedidoId, session_id: saved.sessionId, payment_intent_id: paymentIntentId },
        }).catch((e) => console.error('[confirm-payment redirect]', e));
      }
      setOrderState(saved);
      setRecovering(false);
      return;
    }

    // Timeout de seguridad: si la query DB tarda más de 5 s, mostramos el
    // pedido igualmente. Evita la pantalla beige infinita por red lenta.
    const safetyTimer = window.setTimeout(() => {
      setOrderState(saved);
      setRecovering(false);
    }, 5000);

    (async () => {
      try {
        // RLS exige la cabecera de sesión: sin ella la lectura devuelve 0 filas
        // y el pedido (¡ya pagado!) se interpretaba como inexistente y se borraba.
        const { data: pedido, error } = await supabase
          .from('pedidos')
          .select('estado')
          .eq('id', saved.pedidoId)
          .setHeader('x-session-id', saved.sessionId ?? '')
          .maybeSingle();
        // Regla de oro: NUNCA borrar el pedido local ante una lectura ambigua
        // (error de red / RLS). Solo se descarta ante un estado terminal explícito.
        if (error || !pedido) {
          setOrderState(saved);
        } else if (pedido.estado === 'cancelado' || pedido.estado === 'entregado') {
          localStorage.removeItem(ACTIVE_ORDER_KEY);
        } else if (pedido.estado === 'pendiente_pago') {
          // Con activeLocal null (iOS borró localStorage tras redirect Apple Pay),
          // ir directo a OrderTracking evita quedarse bloqueado en LocalSelector.
          // OrderTracking muestra "Pago pendiente" + botón "Reintentar pago".
          if (!activeLocal) {
            setOrderState(saved);
          } else {
            setResumableOrder(saved);
          }
        } else {
          setOrderState(saved);
        }
      } catch {
        // Sin red: mostrar seguimiento (OrderTracking se autocorrige al reconectar)
        setOrderState(saved);
      } finally {
        window.clearTimeout(safetyTimer);
        setRecovering(false);
      }
    })();
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

  // Al volver de Stripe (Apple Pay redirect), mostrar feedback y restaurar el pedido.
  useEffect(() => {
    const pago = searchParams.get('pago');
    if (!pago) return;
    if (pago === 'ok') {
      toast.success('¡Pago realizado con éxito!');

      // Stripe añade payment_intent al return_url en redirects (Apple Pay, Google Pay).
      // Lo usamos para llamar confirm-payment inmediatamente y sacar el pedido de
      // pendiente_pago sin esperar al webhook — esto soluciona la pantalla en blanco.
      const paymentIntentId = searchParams.get('payment_intent');
      const pidFromUrl = searchParams.get('pid');
      const sidFromUrl = searchParams.get('sid');
      if (paymentIntentId && pidFromUrl && sidFromUrl) {
        supabase.functions.invoke('confirm-payment', {
          body: { pedido_id: pidFromUrl, session_id: sidFromUrl, payment_intent_id: paymentIntentId },
        }).catch((e) => console.error('[confirm-payment redirect]', e));
      }

      const saved = loadActiveOrder();
      if (saved) {
        setOrderState(saved);
      } else {
        // Fallback: iOS Safari a veces borra localStorage durante el redirect cross-domain.
        // Recuperamos desde los params que EmbeddedCheckout codificó en el return_url.
        const numFromUrl = searchParams.get('num');
        const cocinaFromUrl = searchParams.get('cocina');
        const bebidasFromUrl = searchParams.get('bebidas');
        if (pidFromUrl && numFromUrl !== null) {
          const recovered: ActiveOrder = {
            pedidoId: pidFromUrl,
            numeroPedido: parseInt(numFromUrl, 10),
            hasCocina: cocinaFromUrl !== '0',
            hasBebidas: bebidasFromUrl === '1',
            sessionId: sidFromUrl ?? undefined,
          };
          localStorage.setItem(ACTIVE_ORDER_KEY, JSON.stringify(recovered));
          setOrderState(recovered);
        }
      }
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
  const { data: rawProducts = [] } = useProducts(activeCategory || undefined);
  // Montaditos (para resolver los componentes de las MontyRuedas). Misma queryKey
  // que cuando la categoría activa es Montaditos → react-query lo deduplica.
  const montaditosCatId = (categories as any[]).find((c) => c.nombre === 'Montaditos')?.id;
  const { data: allMontaditos = [] } = useProducts(montaditosCatId);
  const ruedaMontaditos = (allMontaditos as any[]).map((p) => ({ id: p.id, numero: p.numero ?? null, nombre: p.nombre }));
  const { data: restricciones = [] } = useLocalRestricciones();
  const { isProductoAllowed, isSeccionAllowed: isSeccionAllowedDB } = buildRestriccionFilter(restricciones);
  const { isProductoAgotado, isIngredienteAgotado } = useAgotados();

  // Café e Infusiones ya no tiene restricción horaria: visible todo el día en Bebidas.
  const isSeccionAllowed = isSeccionAllowedDB;

  // Productos internos (combos de desayuno, marcador de cocina y nachos de la promo):
  // deben existir y ser legibles (disponible=true) pero NO mostrarse como tarjetas del menú.
  const INTERNAL_HIDDEN_IDS = new Set([
    DESAYUNO_COMBOS.clasico.productoId,
    DESAYUNO_COMBOS.dulce.productoId,
    DESAYUNO_COCINA_PRODUCT_ID,
    PROMO_NACHOS_PRODUCT_ID,
    COMBO5_COCINA_PRODUCT_ID,
  ]);
  const products = (rawProducts as any[]).filter((p) => {
    if (INTERNAL_HIDDEN_IDS.has(p.id)) return false;
    if (!isProductoAllowed(p.id)) return false;
    return true;
  });
  const cart = useCartStore();

  const selectedCategory = categories.find((c: any) => c.id === activeCategory);

  // Secciones especiales: Desayunos (banner arriba, 10:00–12:00) y Promociones (banner abajo, solo si hay promos).
  const desayunoCat = (categories as any[]).find((c) => c.nombre === 'Desayunos');
  const promoCat = (categories as any[]).find((c) => c.nombre === 'Promociones');
  const { data: promoProducts = [] } = useProducts(promoCat?.id ?? '00000000-0000-0000-0000-000000000000');
  // Ración interna "Nachos Salséo Guacamole" (oculta del menú). Si existe, la promo añade su línea a cocina.
  const { data: nachosId = null } = useQuery({
    queryKey: ['promo-nachos', PROMO_NACHOS_PRODUCT_ID],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('menu_productos')
        .select('id')
        .eq('id', PROMO_NACHOS_PRODUCT_ID)
        .maybeSingle();
      return (data as any)?.id ?? null;
    },
  });
  // MontyCookies (68–70) para el Desayuno Dulce.
  const gourmets = (ruedaMontaditos as any[]).filter((m) => {
    const n = parseInt((m.numero ?? '').toString(), 10);
    return n >= 68 && n <= 70;
  });
  // ¿Existen en BD los 3 productos internos del combo desayuno? (si no, los banners son solo visuales).
  const { data: comboReady = false } = useQuery({
    queryKey: ['desayuno-combos-ready'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const ids = [DESAYUNO_COMBOS.clasico.productoId, DESAYUNO_COMBOS.dulce.productoId, DESAYUNO_COCINA_PRODUCT_ID];
      const { data } = await supabase.from('menu_productos').select('id').in('id', ids);
      return (data?.length ?? 0) === 3;
    },
  });
  // Promociones y Desayunos ACTIVOS. Desayunos solo aparece 10:00–12:00 (isDesayunoTime).
  const DESAYUNOS_ON = true;
  const PROMOS_ON = true;
  const showDesayunos = isDesayunoTime() && !!desayunoCat && DESAYUNOS_ON;
  const hasPromos = (promoProducts as any[]).some((p) => !INTERNAL_HIDDEN_IDS.has(p.id)) && PROMOS_ON;
  const gridCategories = (categories as any[]).filter((c) => c.nombre !== 'Desayunos' && c.nombre !== 'Promociones');


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
        .select('id, nombre, categoria_id, menu_categorias(nombre)')
        .in('id', productIds);
      if (prodErr) throw prodErr;

      // Normalize a string: remove diacritics, lowercase, trim
      const norm = (s: string) =>
        s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

      // Aperitivos servidos en barra — matched by substring to be resilient to
      // exact DB name variants (e.g. "Gilda boqueron" / "Gilda anchoa" / "Gildas")
      const isAperitivoBarra = (nombre: string) => {
        const n = norm(nombre);
        return n.includes('aceituna') || n.includes('gilda') || n.includes('cucurucho');
      };

      const isBebida = (productoId: string) => {
        const p = prodCats?.find((x) => x.id === productoId);
        if ((p?.menu_categorias as any)?.nombre === BEBIDAS_CATEGORY_NAME) return true;
        if (p?.nombre && isAperitivoBarra(p.nombre)) return true;
        return false;
      };

      // Destino efectivo de cada línea: override explícito (promos) o por categoría.
      const lineDestino = (i: typeof cart.items[number]): 'bebidas' | 'cocina' =>
        i.destino ?? (isBebida(i.productoId) ? 'bebidas' : 'cocina');

      const hasBebidas = cart.items.some((i) => lineDestino(i) === 'bebidas');
      const hasCocina = cart.items.some((i) => lineDestino(i) === 'cocina' || !!i.extraCocina);

      // Horario de cocina: si está cerrada, no se puede crear un pedido con comida de cocina.
      if (hasCocina && !isCocinaOpen()) {
        toast.error('La cocina está cerrada ahora mismo. Solo puedes pedir bebidas y aperitivos de barra (aceitunas, gildas, cucurucho).');
        setIsCheckingOut(false);
        return;
      }

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

      const itemRows = cart.items.flatMap((item) => {
        // Combos con línea aparte de cocina (extraCocina): ambas líneas comparten
        // combo_grupo para que caja/histórico las muestren AGRUPADAS como 1 ticket,
        // sin romper el ruteo por destino (comida→cocina, café/zumo→barra).
        const grupo = item.extraCocina ? item.id : null;
        // La comida del combo va SOLO en la línea de cocina. En la línea de barra
        // (bebidas) se excluye para que el barista vea únicamente café/zumo y no se
        // duplique la comida (que ya aparece en la línea de cocina).
        const mainComps = item.extraCocina?.label
          ? (item.componentes ?? []).filter((c) => c !== item.extraCocina!.label)
          : item.componentes;
        const rows: any[] = [{
          pedido_id: pedido.id,
          producto_id: item.productoId,
          cantidad: item.cantidad,
          precio_unitario: item.precio,
          destino: lineDestino(item),
          // Tamaño/variante elegido (ej. "Jarra Quijote") o, en MontyRuedas/promos,
          // los componentes (uno por línea: montaditos o jarras) para caja/cocina.
          variante: (mainComps && mainComps.length
            ? mainComps.join('\n')
            : item.variantLabel) ?? null,
          combo_grupo: grupo,
        }];
        // Promo/combo compuesto: comida/ración incluida que va a COCINA como línea aparte a 0€.
        if (item.extraCocina) {
          rows.push({
            pedido_id: pedido.id,
            producto_id: item.extraCocina.producto_id,
            cantidad: item.cantidad,
            precio_unitario: 0, // incluida en el combo (el trigger la fija al base 0)
            destino: 'cocina',
            variante: item.extraCocina.label ?? null,
            combo_grupo: grupo,
          });
        }
        return rows;
      });

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
        hasCocina={pendingCheckout.hasCocina}
        hasBebidas={pendingCheckout.hasBebidas}
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
        onHome={() => { setActiveCategory(null); setActiveSection(null); setPromo5eOpen(false); setCartOpen(false); setFilterOpen(false); }}
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
          <div className="px-4 pt-2 pb-3 max-w-lg mx-auto text-center">
            <h2 className="font-display text-xl font-black leading-tight text-foreground whitespace-nowrap">
              ¿Qué te <span className="text-primary italic">apetece</span> hoy?
            </h2>
          </div>
          <div className="pb-28 flex flex-col gap-3">
            {/* 10:00–12:00: Desayunos arriba */}
            {showDesayunos && desayunoCat && (
              <div className="px-4 max-w-lg mx-auto w-full">
                <button
                  onClick={() => setActiveCategory(desayunoCat.id)}
                  className="block w-full max-w-xs mx-auto active:scale-[0.98] transition-transform"
                >
                  <img src={SECTION_IMAGES['Desayunos']} alt="Desayunos" className="w-full h-auto" />
                </button>
              </div>
            )}
            {/* Promociones ARRIBA solo cuando NO hay desayunos (fuera de 10–12) */}
            {hasPromos && promoCat && !showDesayunos && (
              <div className="px-4 max-w-lg mx-auto w-full">
                <button
                  onClick={() => setActiveCategory(promoCat.id)}
                  className="block w-full max-w-xs mx-auto active:scale-[0.98] transition-transform"
                >
                  <img src={SECTION_IMAGES['Promociones'] ?? promoCat.imagen_url} alt="Promociones" className="w-full h-auto" />
                </button>
              </div>
            )}
            <CategoryGrid categories={gridCategories} onSelect={setActiveCategory} />
            {/* Promociones ABAJO cuando hay desayunos (10–12). El pb-28 deja hueco para Monty. */}
            {hasPromos && promoCat && showDesayunos && (
              <div className="px-4 max-w-lg mx-auto w-full">
                <button
                  onClick={() => setActiveCategory(promoCat.id)}
                  className="block w-full max-w-xs mx-auto active:scale-[0.98] transition-transform"
                >
                  <img src={SECTION_IMAGES['Promociones'] ?? promoCat.imagen_url} alt="Promociones" className="w-full h-auto" />
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="px-4 pt-6 pb-2 max-w-lg mx-auto flex items-center gap-3">
            <button
              onClick={() => { setActiveCategory(null); setActiveSection(null); setPromo5eOpen(false); }}
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
            const isDesayunos = selectedCategory?.nombre === 'Desayunos';
            const isPromociones = selectedCategory?.nombre === 'Promociones';
            const sectionList: readonly string[] | null = isMontaditos
              ? MONTADITO_SECTIONS
              : isBebidas
              ? BEBIDAS_SECTIONS
              : isAperitivos
              ? APERITIVOS_SECTIONS
              : isDesayunos
              ? DESAYUNO_VIEW_SECTIONS
              : null;
            const isDrink = isBebidas;


            const isMontyAhorro = selectedCategory?.nombre === 'MontyRuedas';

            if (!sectionList) {
              return (
                <div className="px-4 pb-32 max-w-lg mx-auto">
                  {isPromociones ? (
                    promo5eOpen ? (
                      <div className="rounded-3xl border-2 border-primary/15 bg-primary/[0.04] p-3">
                        <div className="flex items-center gap-2 mb-3">
                          <button
                            onClick={() => setPromo5eOpen(false)}
                            className="shrink-0 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-sm hover:bg-surface-elevated transition-colors"
                            aria-label="Volver a Promociones"
                          >
                            ←
                          </button>
                          <span className="font-display text-sm font-black uppercase tracking-wider text-primary">Promos 5€</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 items-stretch">
                          {products.map((product, i) =>
                            COMBOS_5E[product.id] ? (
                              <PromoComboCard key={product.id} product={product as any} def={COMBOS_5E[product.id]} index={i} />
                            ) : (
                              <PromoCard key={product.id} product={product as any} index={i} nachosId={nachosId} />
                            ),
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPromo5eOpen(true)}
                        className="block w-full active:scale-[0.98] transition-transform"
                      >
                        <img
                          src="/assets/img/promos/promociones-5e-header.png"
                          alt="Promociones 5€"
                          className="w-full h-auto rounded-2xl"
                          loading="lazy"
                        />
                      </button>
                    )
                  ) : (
                    <div className="flex flex-col gap-2">
                      {products.map((product, i) =>
                        isMontyAhorro ? (
                          <MontyRuedaCard
                            key={product.id}
                            product={product as any}
                            montaditos={ruedaMontaditos}
                            isProductoAgotado={isProductoAgotado}
                            index={i}
                          />
                        ) : (
                          <ProductCard key={product.id} product={product as any} index={i} hideAllergens={isMontyAhorro} agotado={isProductoAgotado(product.id)} isIngredienteAgotado={isIngredienteAgotado} />
                        ),
                      )}
                    </div>
                  )}
                </div>
              );
            }

            const available = sectionList.filter((s) =>
              isSeccionAllowed(s) &&
              (products as any[]).some((p) => p.seccion === s)
            );
            const grouped = sectionList
              .filter((sec) => isSeccionAllowed(sec) && (!activeSection || sec === activeSection))
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
                {isDesayunos && (
                  <div className="px-4 pt-1 pb-3 max-w-lg mx-auto w-full flex flex-col gap-3">
                    <DesayunoComboCard tipo="dulce" gourmets={gourmets} isProductoAgotado={isProductoAgotado} ready={comboReady || import.meta.env.VITE_DESAYUNO_TEST === '1'} index={0} />
                    <DesayunoComboCard tipo="clasico" ready={comboReady || import.meta.env.VITE_DESAYUNO_TEST === '1'} index={1} />
                  </div>
                )}
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
                          {g.items.map((p) =>
                            isDesayunos ? (
                              <DesayunoCard key={p.id} product={p} index={idx++} />
                            ) : (
                              <ProductCard
                                key={p.id}
                                product={p}
                                index={idx++}
                                variant={isDrink ? 'drink' : 'default'}
                                agotado={isProductoAgotado(p.id)}
                                isIngredienteAgotado={isIngredienteAgotado}
                              />
                            ),
                          )}
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
                              agotado={isProductoAgotado(p.id)}
                              isIngredienteAgotado={isIngredienteAgotado}
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
