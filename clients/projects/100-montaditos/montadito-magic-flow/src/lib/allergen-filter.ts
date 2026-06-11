import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AllergenFilterStore {
  excluded: string[]; // códigos de alérgenos a excluir
  hideMode: 'warn' | 'hide'; // mostrar advertencia o ocultar
  toggle: (codigo: string) => void;
  clear: () => void;
  setHideMode: (mode: 'warn' | 'hide') => void;
}

export const useAllergenFilter = create<AllergenFilterStore>()(
  persist(
    (set) => ({
      excluded: [],
      hideMode: 'warn',
      toggle: (codigo) =>
        set((s) => ({
          excluded: s.excluded.includes(codigo)
            ? s.excluded.filter((c) => c !== codigo)
            : [...s.excluded, codigo],
        })),
      clear: () => set({ excluded: [] }),
      setHideMode: (mode) => set({ hideMode: mode }),
    }),
    {
      name: 'monty-allergen-filter',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
