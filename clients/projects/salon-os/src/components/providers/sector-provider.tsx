"use client";

import { createContext, useContext, useMemo } from "react";

import { sectorTerms, type SectorTerms } from "@/lib/sector/registry";
import type { SalonSector } from "@/types/database";

interface SectorContextValue {
  sector: SalonSector;
  terms: SectorTerms;
}

const DEFAULT: SectorContextValue = {
  sector: "peluqueria",
  terms: sectorTerms("peluqueria"),
};

const SectorContext = createContext<SectorContextValue>(DEFAULT);

export function SectorProvider({
  sector,
  children,
}: {
  sector: SalonSector;
  children: React.ReactNode;
}): React.ReactElement {
  const value = useMemo<SectorContextValue>(
    () => ({ sector, terms: sectorTerms(sector) }),
    [sector],
  );
  return <SectorContext.Provider value={value}>{children}</SectorContext.Provider>;
}

export function useSector(): SalonSector {
  return useContext(SectorContext).sector;
}

export function useTerms(): SectorTerms {
  return useContext(SectorContext).terms;
}
