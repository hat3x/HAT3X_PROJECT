import { Loader2, MapPin, Navigation, Search, X, Pin, Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import {
  ActiveLocal,
  formatDistance,
  haversineMeters,
  useActiveLocal,
} from '@/lib/active-local';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import logo from '@/assets/logo-100montaditos.png';

type LocalRow = {
  id: string;
  nombre: string;
  ciudad: string;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  activo: boolean;
};

type Step = 'choose' | 'gps' | 'search' | 'confirm';
type Mode = 'gps' | 'search';

interface Props {
  onSelected?: () => void;
  embedded?: boolean; // shown as a "change local" sheet vs initial gate
}

export function LocalSelector({ onSelected, embedded }: Props) {
  const setLocal = useActiveLocal((s) => s.setLocal);
  const [step, setStep] = useState<Step>('choose');
  const [mode, setMode] = useState<Mode>('gps');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [locales, setLocales] = useState<LocalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<LocalRow | null>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch locales depending on mode
  useEffect(() => {
    if (step !== 'gps' && step !== 'search') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from('locales')
        .select('id, nombre, ciudad, direccion, lat, lng, activo')
        .eq('activo', true);
      if (step === 'search' && debounced) {
        q = q.or(
          `nombre.ilike.%${debounced}%,ciudad.ilike.%${debounced}%,direccion.ilike.%${debounced}%`
        );
      }
      const { data, error } = await q.limit(50);
      if (!cancelled) {
        if (error) console.error(error);
        setLocales((data as any) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, debounced]);

  // GPS request
  const requestGps = () => {
    setStep('gps');
    setMode('gps');
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError('Tu dispositivo no soporta geolocalización');
      setStep('search');
      setMode('search');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        console.warn('GPS denegado', err);
        setGpsError('Sin acceso a tu ubicación');
        setStep('search');
        setMode('search');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Auto-select if user is within 100m of one local
  useEffect(() => {
    if (mode !== 'gps' || !coords || locales.length === 0) return;
    const withDist = locales
      .filter((l) => l.lat != null && l.lng != null)
      .map((l) => ({
        l,
        d: haversineMeters(coords.lat, coords.lng, l.lat as number, l.lng as number),
      }))
      .sort((a, b) => a.d - b.d);
    if (withDist[0] && withDist[0].d < 100 && !pendingConfirm) {
      setPendingConfirm(withDist[0].l);
    }
  }, [mode, coords, locales, pendingConfirm]);

  const sortedLocales = useMemo(() => {
    if (mode === 'gps' && coords) {
      return [...locales]
        .map((l) => ({
          l,
          d:
            l.lat != null && l.lng != null
              ? haversineMeters(coords.lat, coords.lng, l.lat, l.lng)
              : Infinity,
        }))
        .sort((a, b) => a.d - b.d);
    }
    return locales.map((l) => ({ l, d: Infinity }));
  }, [locales, coords, mode]);

  const confirm = (row: LocalRow) => {
    const active: ActiveLocal = {
      id: row.id,
      nombre: row.nombre,
      ciudad: row.ciudad,
      direccion: row.direccion,
    };
    setLocal(active);
    onSelected?.();
  };

  // -------- UI --------

  if (step === 'choose') {
    return (
      <Shell embedded={embedded}>
        <div className="flex flex-col items-center text-center gap-8 max-w-sm mx-auto pt-4">
          <img src={logo} alt="100 Montaditos" className="h-24" />
          <div>
            <h1 className="font-display text-3xl font-black leading-tight">
              ¿En qué <span className="text-primary italic">100 Montaditos</span> estás?
            </h1>
            <p className="text-muted-foreground mt-3 text-sm">
              Selecciona el local para ver la carta y hacer tu pedido.
            </p>
          </div>

          <div className="w-full flex flex-col gap-3">
            <Button
              size="lg"
              className="h-14 text-base font-semibold"
              onClick={requestGps}
            >
              <Navigation className="w-5 h-5 mr-2" />
              Usar mi ubicación
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 text-base font-semibold"
              onClick={() => {
                setMode('search');
                setStep('search');
              }}
            >
              <Search className="w-5 h-5 mr-2" />
              Buscar mi local
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell embedded={embedded}>
      <div className="max-w-lg mx-auto w-full">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setStep('choose')}
            className="p-2 rounded-full hover:bg-surface"
            aria-label="Volver"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="font-display text-xl font-bold">
            {mode === 'gps' ? 'Locales cercanos' : 'Buscar local'}
          </h2>
        </div>

        {mode === 'search' && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ciudad, calle o nombre del local..."
              className="pl-10 h-12"
            />
          </div>
        )}

        {mode === 'gps' && !coords && !gpsError && (
          <div className="flex flex-col items-center justify-center py-16 gap-6">
            <div className="relative w-32 h-32">
              <motion.div
                className="absolute inset-0 rounded-full bg-primary/30"
                animate={{ scale: [1, 2], opacity: [0.6, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
              />
              <motion.div
                className="absolute inset-0 rounded-full bg-primary/30"
                animate={{ scale: [1, 2], opacity: [0.6, 0] }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: 'easeOut',
                  delay: 0.6,
                }}
              />
              <div className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                <Navigation className="w-7 h-7" />
              </div>
            </div>
            <p className="text-muted-foreground text-sm">Buscando locales cercanos...</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {sortedLocales.map(({ l, d }) => {
            const here = d < 100;
            return (
              <li key={l.id}>
                <button
                  onClick={() => setPendingConfirm(l)}
                  className={`w-full text-left p-4 rounded-xl bg-surface hover:bg-surface-elevated transition-all border-2 ${
                    pendingConfirm?.id === l.id
                      ? 'border-primary'
                      : 'border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{l.nombre}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {l.direccion} · {l.ciudad}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {mode === 'gps' && d !== Infinity && (
                        <span className="text-xs font-bold text-primary">
                          {formatDistance(d)}
                        </span>
                      )}
                      {here && (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-500 px-2 py-0.5 rounded-full">
                          Estás aquí
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
          {!loading && sortedLocales.length === 0 && (
            <li className="text-center text-sm text-muted-foreground py-8">
              No se han encontrado locales.
            </li>
          )}
        </ul>
      </div>

      {/* Confirm modal */}
      <AnimatePresence>
        {pendingConfirm && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPendingConfirm(null)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="bg-card w-full max-w-sm rounded-2xl p-6 border border-border"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 text-primary mx-auto mb-4">
                <MapPin className="w-7 h-7" />
              </div>
              <p className="text-center text-sm text-muted-foreground mb-1">
                Parece que estás en
              </p>
              <h3 className="font-display text-2xl font-black text-center">
                {pendingConfirm.nombre}
              </h3>
              <p className="text-center text-sm text-muted-foreground mt-1">
                {pendingConfirm.direccion}
              </p>
              <div className="flex flex-col gap-2 mt-6">
                <Button
                  size="lg"
                  className="h-12"
                  onClick={() => confirm(pendingConfirm)}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Sí, estoy aquí
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-12"
                  onClick={() => setPendingConfirm(null)}
                >
                  Cambiar local
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}

function Shell({
  children,
  embedded,
}: {
  children: React.ReactNode;
  embedded?: boolean;
}) {
  return (
    <div
      className={
        embedded
          ? 'p-6'
          : 'min-h-screen bg-background px-4 py-8 flex flex-col'
      }
    >
      {children}
    </div>
  );
}
