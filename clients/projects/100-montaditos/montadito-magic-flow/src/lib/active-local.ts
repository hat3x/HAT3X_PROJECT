import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ActiveLocal = {
  id: string;
  nombre: string;
  ciudad: string;
  direccion: string | null;
};

type State = {
  local: ActiveLocal | null;
  setLocal: (l: ActiveLocal | null) => void;
  clear: () => void;
};

export const useActiveLocal = create<State>()(
  persist(
    (set) => ({
      local: null,
      setLocal: (l) => set({ local: l }),
      clear: () => set({ local: null }),
    }),
    { name: 'monty-active-local' }
  )
);

// Haversine distance in meters
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
