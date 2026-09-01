## Task 4: SectorProvider + hooks

**Files:**
- Create: `src/components/providers/sector-provider.tsx`
- Test: `src/tests/unit/sector-provider.test.tsx`

**Interfaces:**
- Consumes: `SalonSector`, `sectorTerms`, `SectorTerms`.
- Produces: `<SectorProvider sector={SalonSector}>`; `useSector(): SalonSector`; `useTerms(): SectorTerms`. Default (no provider) = `"peluqueria"`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/sector-provider.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectorProvider, useSector, useTerms } from "@/components/providers/sector-provider";

function Probe(): React.ReactElement {
  return <span>{`${useSector()}:${useTerms().customerPlural}`}</span>;
}

describe("SectorProvider", () => {
  it("propaga el sector y su terminologia", () => {
    render(<SectorProvider sector="odontologia"><Probe /></SectorProvider>);
    expect(screen.getByText("odontologia:Pacientes")).toBeInTheDocument();
  });
  it("sin provider cae a peluqueria (back-compat)", () => {
    render(<Probe />);
    expect(screen.getByText("peluqueria:Clientes")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/unit/sector-provider.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/components/providers/sector-provider.tsx`:
```tsx
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/unit/sector-provider.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/components/providers/sector-provider.tsx clients/projects/salon-os/src/tests/unit/sector-provider.test.tsx
git commit -m "feat(salon-os): SectorProvider + useSector/useTerms"
```

---

