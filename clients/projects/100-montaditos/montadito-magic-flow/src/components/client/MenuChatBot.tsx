import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, Loader2, Plus, Check, ShoppingBag, Minus, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCartStore } from '@/lib/cart-store';
import { getDrinkImage } from '@/lib/drink-image';
import { Monty } from './Monty';


type Msg = { role: 'user' | 'assistant'; content: string };

type Product = {
  id: string;
  nombre: string;
  precio: number;
  foto_url: string | null;
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

const SUGGESTIONS = [
  '¿Qué montaditos de pollo tenéis?',
  'Soy alérgico al huevo, ¿qué puedo pedir?',
  'Recomiéndame algo picante',
  'Opciones vegetarianas',
];

// Extract [[add:NAME]] tokens from assistant text
function parseMessage(raw: string): { text: string; productNames: string[] } {
  const productNames: string[] = [];
  const text = raw
    .replace(/\[\[add:([^\]]+)\]\]/g, (_, name) => {
      productNames.push(name.trim());
      return '';
    })
    // collapse extra blank lines left behind
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // De-duplicate while preserving order
  const seen = new Set<string>();
  const unique = productNames.filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { text, productNames: unique };
}

function findProduct(name: string, products: Product[] | undefined): Product | null {
  if (!products) return null;
  const target = name.trim().toLowerCase();
  return (
    products.find((p) => p.nombre.toLowerCase() === target) ||
    products.find((p) => p.nombre.toLowerCase().includes(target)) ||
    products.find((p) => target.includes(p.nombre.toLowerCase())) ||
    null
  );
}

interface ProductChipProps {
  product: Product;
  onAdd: (product: Product, originRect: DOMRect) => void;
}

function ProductChip({ product, onAdd }: ProductChipProps) {
  const [added, setAdded] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const imageSrc = getDrinkImage(product.nombre, product.foto_url);

  const handleClick = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    onAdd(product, rect);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <motion.button
      ref={ref}
      onClick={handleClick}
      whileTap={{ scale: 0.96 }}
      className="group flex items-center gap-3 w-full p-2 pr-3 rounded-2xl bg-background border border-border hover:border-primary/60 hover:bg-primary/5 transition-colors text-left"
    >
      <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-muted shrink-0">
        {imageSrc ? (
          <img src={imageSrc} alt={product.nombre} className="w-full h-full object-contain" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg">🥖</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-foreground truncate">{product.nombre}</p>
        <p className="text-[11px] text-muted-foreground">{product.precio.toFixed(2)}€</p>
      </div>
      <span
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
          added
            ? 'bg-accent text-accent-foreground'
            : 'bg-primary text-primary-foreground group-hover:bg-primary/90'
        }`}
      >
        {added ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      </span>
    </motion.button>
  );
}

export function MenuChatBot() {
  const [open, setOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [flying, setFlying] = useState<FlyingItem[]>([]);
  const [cartPulse, setCartPulse] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cartIconRef = useRef<HTMLButtonElement>(null);
  const flyingIdRef = useRef(0);

  const addItem = useCartStore((s) => s.addItem);
  const itemCount = useCartStore((s) => s.itemCount);
  const cartItems = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const cartTotal = useCartStore((s) => s.total);

  const fullTextRef = useRef<string>('');
  const revealedRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: products } = useQuery({
    queryKey: ['all-products-min'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_productos')
        .select('id, nombre, precio, foto_url')
        .eq('disponible', true);
      if (error) throw error;
      return data as Product[];
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      abortRef.current?.abort();
    };
  }, []);

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

  const handleAddProduct = (product: Product, originRect: DOMRect) => {
    const resolvedImage = getDrinkImage(product.nombre, product.foto_url);
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
        precio: product.precio,
        foto_url: resolvedImage,
      });
    }

    toast.success(`${product.nombre} añadido al carrito`);
  };

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
        body: JSON.stringify({ messages: newMessages }),
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
            if (content) {
              fullTextRef.current += content;
            }
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

  // Determine if the last assistant message is still streaming (typewriter active)
  const isStreamingLast = (idx: number) =>
    idx === messages.length - 1 &&
    messages[idx].role === 'assistant' &&
    revealedRef.current < fullTextRef.current.length;

  return (
    <>
      {/* Floating Monty mascot button */}
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
                  {/* Cart bubble */}
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

              {/* Cart panel (collapsible) */}
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
                                      onClick={() =>
                                        updateQuantity(item.id, item.cantidad - 1)
                                      }
                                      className="w-6 h-6 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center"
                                      aria-label="Quitar uno"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <span className="text-xs font-bold w-4 text-center">
                                      {item.cantidad}
                                    </span>
                                    <button
                                      onClick={() =>
                                        updateQuantity(item.id, item.cantidad + 1)
                                      }
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

                  const { text, productNames } = parseMessage(m.content);
                  const stillStreaming = isStreamingLast(i);
                  const matchedProducts = productNames
                    .map((n) => findProduct(n, products))
                    .filter((p): p is Product => p !== null);

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

                      {/* Product recommendation cards — only show when streaming finished */}
                      {!stillStreaming && matchedProducts.length > 0 && (
                        <div className="flex flex-col gap-1.5 w-full">
                          {matchedProducts.map((p) => (
                            <ProductChip key={p.id} product={p} onAdd={handleAddProduct} />
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

      {/* Flying-to-cart animation layer */}
      <AnimatePresence>
        {flying.map((f) => (
          <motion.div
            key={f.id}
            initial={{ x: f.fromX, y: f.fromY, scale: 1, opacity: 1 }}
            animate={{
              x: f.toX,
              y: f.toY,
              scale: 0.3,
              opacity: 0.9,
            }}
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
    </>
  );
}
