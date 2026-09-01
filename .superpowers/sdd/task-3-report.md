# Task 3 Report — Resolve tenant sector server-side (`src/lib/salon.ts`)

## Scope
Repo: `clients/projects/salon-os` (nested git repo, branch `hat3x/HAT3X-035`, unchanged).
File touched: `src/lib/salon.ts` (only file — verified via `git status --short` before and after).

## Exact edits

### 1. Import `SalonSector`
```diff
-import type { MemberRole, SalonFeature } from "@/types/database";
+import type { MemberRole, SalonFeature, SalonSector } from "@/types/database";
```

### 2. `ActiveSalon` interface — added `sector` field
```diff
 export interface ActiveSalon {
   id: string;
   name: string;
   slug: string;
   timezone: string;
+  sector: SalonSector;
 }
```

### 3. `getActiveSalon()` — extended select, updated doc comment
```diff
-/** Resuelve id, nombre, slug y timezone del salón activo del usuario. */
+/** Resuelve id, nombre, slug, timezone y sector del salón activo del usuario. */
 export async function getActiveSalon(): Promise<ActiveSalon | null> {
   const salonId = await getActiveSalonId();
   if (salonId === null) return null;

   const supabase = createClient();
   const { data, error } = await supabase
     .from("salons")
-    .select("id, name, slug, timezone")
+    .select("id, name, slug, timezone, sector")
     .eq("id", salonId)
     .maybeSingle();

   if (error !== null) throw new Error(`No se pudo cargar el salón: ${error.message}`);
   return data ?? null;
 }
```
Supabase's generated types infer the returned `data` shape from the select string against the `salons` table `Row` type (`src/types/database.ts`), where `sector: SalonSector` is non-optional (NOT NULL). No manual cast was needed — `data ?? null` already type-checks as `ActiveSalon | null` because `sector` is now part of both the query and the `Row` type.

### 4. New export `getActiveSalonSector()`
```ts
/** Sector del salón activo (o null si no hay salón). */
export async function getActiveSalonSector(): Promise<SalonSector | null> {
  const salon = await getActiveSalon();
  return salon?.sector ?? null;
}
```
Added directly after `getActiveSalon()`, before the `activeSalonHasFeature` JSDoc block — matches brief exactly (verbatim).

## Full diff
```diff
diff --git a/src/lib/salon.ts b/src/lib/salon.ts
index b706da8..fb308e8 100644
--- a/src/lib/salon.ts
+++ b/src/lib/salon.ts
@@ -4,13 +4,14 @@ import {
 } from "@/lib/salon-feature-flags";
 import { salonFeatureFlags, salonHasFeature } from "@/lib/salon-features";
 import { createClient } from "@/lib/supabase/server";
-import type { MemberRole, SalonFeature } from "@/types/database";
+import type { MemberRole, SalonFeature, SalonSector } from "@/types/database";
 
 export interface ActiveSalon {
   id: string;
   name: string;
   slug: string;
   timezone: string;
+  sector: SalonSector;
 }
 
 export interface ActiveMembership {
@@ -103,7 +104,7 @@ export async function getActiveSalonId(): Promise<string | null> {
   return data?.salon_id ?? null;
 }
 
-/** Resuelve id, nombre, slug y timezone del salón activo del usuario. */
+/** Resuelve id, nombre, slug, timezone y sector del salón activo del usuario. */
 export async function getActiveSalon(): Promise<ActiveSalon | null> {
   const salonId = await getActiveSalonId();
   if (salonId === null) return null;
@@ -111,7 +112,7 @@ export async function getActiveSalon(): Promise<ActiveSalon | null> {
   const supabase = createClient();
   const { data, error } = await supabase
     .from("salons")
-    .select("id, name, slug, timezone")
+    .select("id, name, slug, timezone, sector")
     .eq("id", salonId)
     .maybeSingle();
 
@@ -119,6 +120,12 @@ export async function getActiveSalon(): Promise<ActiveSalon | null> {
   return data ?? null;
 }
 
+/** Sector del salón activo (o null si no hay salón). */
+export async function getActiveSalonSector(): Promise<SalonSector | null> {
+  const salon = await getActiveSalon();
+  return salon?.sector ?? null;
+}
+
 /**
  * ¿El salón activo del usuario tiene contratado Y activo el add-on `feature`?
  *
```
(10 insertions, 3 deletions, 1 file changed)

## tsc result
Command: `npx tsc --noEmit -p tsconfig.json` (run from `clients/projects/salon-os`).
Result: **exit 0** (no output, no errors).

## Self-review
- **Scope discipline:** only `src/lib/salon.ts` was modified. Confirmed via `git status --short` before commit — single file listed (`M src/lib/salon.ts`).
- **Type safety / no `any`:** no `any` introduced. `SalonSector` imported as a type-only import alongside the existing `MemberRole, SalonFeature` type-only import (consistent with existing style, no new import statement added).
- **Non-null correctness:** brief states `salons.sector` is `NOT NULL` in the DB. Confirmed independently: `src/types/database.ts` defines `SalonSector = "peluqueria" | "odontologia" | "restauracion"` (line 89) and the `salons` table `Row` type has `sector: SalonSector` as a required (non-optional) field (line 108), while `Insert`/`Update` variants have it optional (`sector?:`, lines 125/142) — consistent with a NOT NULL column. This means `ActiveSalon.sector` being non-optional (`sector: SalonSector`, not `sector?: SalonSector | null`) is correct and matches the brief's instruction.
- **`getActiveSalonSector` null semantics:** returns `null` only when `getActiveSalon()` itself returns `null` (no session / no salon membership) — the `salon?.sector ?? null` is defensive but structurally redundant with the NOT NULL guarantee (if `salon` is non-null, `salon.sector` is always a valid `SalonSector`, never null/undefined at the type level). This matches the brief's exact requested snippet verbatim, so no deviation was taken.
- **Callers unaffected:** searched all 42 files importing `@/lib/salon` under `clients/projects/salon-os/src` — none currently destructure or reference `.sector` off an `ActiveSalon` result, so widening `ActiveSalon` and the select string is purely additive and non-breaking for existing call sites. `tsc --noEmit` across the whole project (not just the touched file) confirms no downstream breakage.
- **No new tests added:** brief explicitly specifies no test for this task; verification is via `tsc` exit code only, as instructed.
- **Doc comment updated:** the JSDoc on `getActiveSalon()` was updated to mention "sector" in the enumerated fields, keeping documentation in sync with the new return shape (not explicitly required by the brief, but consistent with existing doc quality in the file and low-risk).

No concerns identified. Implementation matches the brief's Step 2 code block verbatim, and Steps 1, 3, 4 were followed in order.

## Commit
```
commit 500c5f8b26b34a22b4103ed3935998c8e309a2cd (branch hat3x/HAT3X-035)
feat(salon-os): resolve active salon sector server-side

1 file changed, 10 insertions(+), 3 deletions(-)
```
Command used (adapted for cwd already inside the nested repo, equivalent to the brief's repo-root-relative path):
```bash
cd clients/projects/salon-os
git add src/lib/salon.ts
git commit -m "feat(salon-os): resolve active salon sector server-side"
```
