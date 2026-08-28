import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItemAllergen {
  codigo: string;
  nombre: string;
  icono?: string | null;
}

export interface CartItem {
  /** Cart key: productoId for normal items, `${productoId}::${variant}` for variants. */
  id: string;
  /** Real menu_productos.id used when sending the order to the backend. */
  productoId: string;
  /** Optional variant key (e.g. 'quijote' | 'sancho'). */
  variant?: string;
  /** Human-readable variant label shown in the cart (e.g. 'Jarra Quijote'). */
  variantLabel?: string;
  nombre: string;
  /** Número del producto en la carta (ej. "13", "B5"). Se muestra en cesta y chat. */
  numero?: string | null;
  precio: number;
  cantidad: number;
  foto_url: string | null;
  contiene_alcohol?: boolean;
  alergenos?: CartItemAllergen[];
  /** Para MontyRuedas: montaditos que la componen (ej. "#86 Hot dog…"). Se envía a cocina en `variante`. */
  componentes?: string[];
  /** Fuerza el destino de la línea (caja/cocina). Si no se indica, se decide por la categoría. */
  destino?: 'bebidas' | 'cocina';
  /** Promo compuesta: ración incluida que debe llegar A COCINA como línea aparte a 0€. */
  extraCocina?: { producto_id: string; label?: string | null };
}

interface CartStore {
  items: CartItem[];
  localId: string | null;
  mesaId: string | null;
  sessionId: string;
  addItem: (product: Omit<CartItem, 'cantidad'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, cantidad: number) => void;
  clearCart: () => void;
  setLocal: (localId: string, mesaId: string) => void;
  total: () => number;
  itemCount: () => number;
  hasAlcohol: () => boolean;
}

const getSessionId = () => {
  let id = sessionStorage.getItem('montaditos_session');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('montaditos_session', id);
  }
  return id;
};

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
  items: [],
  localId: null,
  mesaId: null,
  sessionId: getSessionId(),
  addItem: (product) => {
    set((state) => {
      const existing = state.items.find((i) => i.id === product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id === product.id ? { ...i, cantidad: i.cantidad + 1 } : i
          ),
        };
      }
      return { items: [...state.items, { ...product, cantidad: 1 }] };
    });
  },
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  updateQuantity: (id, cantidad) => {
    if (cantidad <= 0) {
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    } else {
      set((s) => ({
        items: s.items.map((i) => (i.id === id ? { ...i, cantidad } : i)),
      }));
    }
  },
  clearCart: () => set({ items: [] }),
  setLocal: (localId, mesaId) => set({ localId, mesaId }),
  total: () => get().items.reduce((sum, i) => sum + i.precio * i.cantidad, 0),
  itemCount: () => get().items.reduce((sum, i) => sum + i.cantidad, 0),
  hasAlcohol: () => get().items.some((i) => i.contiene_alcohol),
    }),
    {
      name: 'monty-cart',
      // Persistimos solo el contenido del carrito; sessionId se regenera por sesión.
      partialize: (state) => ({
        items: state.items,
        localId: state.localId,
        mesaId: state.mesaId,
      }),
    }
  )
);

// Alcohol age-gate store (sólo se muestra una vez por sesión)
interface AgeGateStore {
  acknowledged: boolean;
  pending: Omit<CartItem, 'cantidad'> | null;
  request: (product: Omit<CartItem, 'cantidad'>) => void;
  confirm: () => void;
  cancel: () => void;
}

const ACK_KEY = 'monty-alcohol-ack';

export const useAgeGate = create<AgeGateStore>((set, get) => ({
  acknowledged: sessionStorage.getItem(ACK_KEY) === '1',
  pending: null,
  request: (product) => {
    if (get().acknowledged) {
      useCartStore.getState().addItem(product);
    } else {
      set({ pending: product });
    }
  },
  confirm: () => {
    sessionStorage.setItem(ACK_KEY, '1');
    const pending = get().pending;
    if (pending) useCartStore.getState().addItem(pending);
    set({ acknowledged: true, pending: null });
  },
  cancel: () => set({ pending: null }),
}));
