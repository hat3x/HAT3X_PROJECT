## Task 7: Pre-login sector guard (pure)

**Files:**
- Create: `src/lib/auth/sector-login.ts`
- Test: `src/tests/unit/sector-login-guard.test.ts`

**Interfaces:**
- Consumes: `SalonSector`, `SECTOR_REGISTRY`.
- Produces: `parseSectorParam(raw: string | null | undefined): SalonSector | null`; `sectorMismatchMessage(chosen: SalonSector, tenant: SalonSector): string | null`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/unit/sector-login-guard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseSectorParam, sectorMismatchMessage } from "@/lib/auth/sector-login";

describe("parseSectorParam", () => {
  it("acepta los tres sectores válidos", () => {
    expect(parseSectorParam("odontologia")).toBe("odontologia");
    expect(parseSectorParam("peluqueria")).toBe("peluqueria");
    expect(parseSectorParam("restauracion")).toBe("restauracion");
  });
  it("rechaza basura / vacío / null", () => {
    expect(parseSectorParam("dentista")).toBeNull();
    expect(parseSectorParam("")).toBeNull();
    expect(parseSectorParam(null)).toBeNull();
    expect(parseSectorParam(undefined)).toBeNull();
  });
});

describe("sectorMismatchMessage", () => {
  it("null cuando coincide", () => {
    expect(sectorMismatchMessage("odontologia", "odontologia")).toBeNull();
  });
  it("mensaje legible cuando no coincide (nombra ambos)", () => {
    const msg = sectorMismatchMessage("odontologia", "peluqueria");
    expect(msg).not.toBeNull();
    expect(msg).toContain("Peluquería");
    expect(msg).toContain("Odontología");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/unit/sector-login-guard.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/sector-login.ts`:
```ts
/**
 * Guard de sector para el login (pura). Una credencial pertenece a UN tenant y por
 * tanto a UN sector; si el usuario eligió otro sector en el picker, se rechaza con
 * mensaje legible. El aislamiento real lo da la RLS; esto es coherencia de UX.
 */
import { SECTOR_REGISTRY } from "@/lib/sector/registry";
import type { SalonSector } from "@/types/database";

const VALID: readonly SalonSector[] = ["peluqueria", "odontologia", "restauracion"];

export function parseSectorParam(raw: string | null | undefined): SalonSector | null {
  return typeof raw === "string" && (VALID as readonly string[]).includes(raw)
    ? (raw as SalonSector)
    : null;
}

export function sectorMismatchMessage(
  chosen: SalonSector,
  tenant: SalonSector,
): string | null {
  if (chosen === tenant) return null;
  return (
    `Estas credenciales son del sector ${SECTOR_REGISTRY[tenant].label}, ` +
    `no de ${SECTOR_REGISTRY[chosen].label}. Elige el sector correcto para entrar.`
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/unit/sector-login-guard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add clients/projects/salon-os/src/lib/auth/sector-login.ts clients/projects/salon-os/src/tests/unit/sector-login-guard.test.ts
git commit -m "feat(salon-os): pure pre-login sector guard (parse + mismatch)"
```

---

