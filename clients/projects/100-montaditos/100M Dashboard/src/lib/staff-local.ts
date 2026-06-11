import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StaffLocal = {
  id: string;
  nombre: string;
  ciudad: string | null;
};

type State = {
  local: StaffLocal | null;
  setLocal: (l: StaffLocal | null) => void;
  clear: () => void;
};

export const useStaffLocal = create<State>()(
  persist(
    (set) => ({
      local: null,
      setLocal: (l) => set({ local: l }),
      clear: () => set({ local: null }),
    }),
    { name: "staff-active-local" },
  ),
);
