import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";

// En la build de pruebas (VITE_HASH_ROUTER=1) usa HashRouter para funcionar en cualquier subcarpeta.
const Router = import.meta.env.VITE_HASH_ROUTER === '1' ? HashRouter : BrowserRouter;
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import ClientApp from "./pages/ClientApp";
import NotFound from "./pages/NotFound";
import { EuromaniaScreen } from "@/components/client/EuromaniaScreen";
import { MantenimientoScreen } from "@/components/client/MantenimientoScreen";

const queryClient = new QueryClient();

// 0 = domingo, 3 = miércoles
const isEuromaniaDay = () => {
  const d = new Date().getDay();
  // Euromanía activa los DOMINGOS y MIÉRCOLES.
  return d === 0 || d === 3;
};

// Estado del interruptor de mantenimiento (columna `en_mantenimiento` en `locales`).
// null = aún cargando · false = operativa · true = en mantenimiento (con su mensaje)
type MaintState = { on: boolean; msg: string | null };

const App = () => {
  // Un redirect de Apple Pay (/?pago=ok&...) debe procesar el ticket aunque sea
  // día Euromania o haya mantenimiento — si no, el pedido queda sin confirmar.
  const isPaymentReturn = new URLSearchParams(window.location.search).get('pago') === 'ok';
  // Build de pruebas LOCAL únicamente (VITE_MAINTENANCE_TEST=1): ignora el mantenimiento
  // y la pantalla de Euromanía de producción para poder ver la carta real sin reabrir
  // la web a clientes ni depender de qué día de la semana se haga la prueba.
  const skipMaintenance = isPaymentReturn || import.meta.env.VITE_MAINTENANCE_TEST === '1';

  // Interruptor de mantenimiento desde la BD. Se resuelve a "operativa" ante
  // cualquier error o tardanza (fail-open): un fallo nunca debe cerrar la tienda.
  const [maint, setMaint] = useState<MaintState | null>(skipMaintenance ? { on: false, msg: null } : null);

  useEffect(() => {
    if (skipMaintenance) return; // el retorno de pago / build de pruebas no espera a nada
    let cancel = false;
    const failOpen = setTimeout(() => { if (!cancel) setMaint({ on: false, msg: null }); }, 2500);

    supabase
      .from('locales')
      .select('mensaje_mantenimiento')
      .eq('activo', true)
      .eq('en_mantenimiento', true)
      .limit(1)
      .then(({ data, error }) => {
        if (cancel) return;
        clearTimeout(failOpen);
        if (error || !data || data.length === 0) {
          setMaint({ on: false, msg: null });
        } else {
          setMaint({ on: true, msg: (data[0] as { mensaje_mantenimiento: string | null }).mensaje_mantenimiento });
        }
      }, () => { if (!cancel) { clearTimeout(failOpen); setMaint({ on: false, msg: null }); } });

    return () => { cancel = true; clearTimeout(failOpen); };
  }, [isPaymentReturn]);

  // ── Autocorrección del "congelado de pulsaciones" ──────────────────────────
  // Bug conocido de Radix (Dialog/Select/Popover): al cerrarse o desmontarse un
  // modal mientras transiciona, a veces deja `pointer-events: none` PEGADO en
  // <body>. Eso bloquea TODAS las pulsaciones (pero deja hacer scroll y volver
  // atrás) hasta recargar. En esta app hay cientos de diálogos (cada ProductCard
  // monta varios) + el aviso de alcohol que cierra un modal y abre otro en el
  // mismo instante, así que el bug se dispara cada vez más. Este guardián detecta
  // ese estado atascado (pointer-events:none SIN ningún modal realmente abierto)
  // y lo limpia solo, sin que el cliente tenga que recargar.
  useEffect(() => {
    const anyOverlayOpen = () =>
      !!document.querySelector(
        '[role="dialog"][data-state="open"],' +
        '[role="alertdialog"][data-state="open"],' +
        '[role="menu"][data-state="open"],' +
        '[data-radix-popper-content-wrapper]',
      );
    const isStuck = () =>
      document.body.style.pointerEvents === 'none' && !anyOverlayOpen();
    const clearStuck = () => { document.body.style.pointerEvents = ''; };

    // Recuperación instantánea en cuanto el cliente intenta pulsar.
    const onPointer = () => { if (isStuck()) clearStuck(); };
    window.addEventListener('pointerdown', onPointer, true);

    // Red de seguridad: exige 2 lecturas seguidas "atascadas" (~700 ms) para no
    // limpiar durante la apertura legítima de un modal (que monta su contenido
    // en el mismo frame en que pone el pointer-events:none).
    let stuck = 0;
    const interval = window.setInterval(() => {
      if (isStuck()) { if (++stuck >= 2) { clearStuck(); stuck = 0; } }
      else stuck = 0;
    }, 350);

    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.clearInterval(interval);
    };
  }, []);

  // Mientras se comprueba el mantenimiento, fondo neutro (evita parpadeo tienda→cartel).
  if (maint === null) {
    return <div className="fixed inset-0 bg-background" />;
  }
  if (maint.on && !isPaymentReturn) {
    return <MantenimientoScreen mensaje={maint.msg} />;
  }
  if (isEuromaniaDay() && !isPaymentReturn && !skipMaintenance) {
    return <EuromaniaScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <Router>
          <Routes>
            <Route path="/" element={<ClientApp />} />
            <Route path="/menu" element={<ClientApp />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
