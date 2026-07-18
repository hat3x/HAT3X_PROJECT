/**
 * Aislamiento del AUTOSERVICIO de CITAS (FASE 3): una persona registrada en la app de
 * cliente solo puede VER SUS PROPIAS citas (las de su/s ficha/s), nunca las de otro
 * cliente ni las de otro salón, y NUNCA puede ESCRIBIR citas desde el navegador
 * (reservar/cancelar es operativa de staff o de una RPC controlada, no una política
 * SELF de escritura).
 *
 * Este test cubre el CONTRATO RLS a nivel de FUENTE (leyendo las migraciones): la
 * garantía vive en Postgres (defensa en profundidad) y aquí se ancla al PREDICADO real
 * —la política SELF acotada por app.user_customer_ids(), de SOLO LECTURA, `to
 * authenticated`— de modo que una regresión (p. ej. abrir escritura al cliente, o
 * exponer la tabla a anon) rompa este test en CI, no solo el guardián en deploy.
 *
 * No hay plano de "comportamiento" porque en ESTE repo no existe aún un lector de citas
 * de cara al cliente (`fetchAppointments` de @/lib/queries/appointments es de STAFF:
 * acota por salon_id para la agenda del dashboard). La app de cliente de FASE 3 va
 * aparte; su lectura se apoyará DIRECTAMENTE en esta política RLS.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

const selfSql = readFileSync(
  join(migrationsDir, "20260719100000_rls_self_appointments.sql"),
  "utf8",
);
const baseRlsSql = readFileSync(
  join(migrationsDir, "20260711100100_rls_policies.sql"),
  "utf8",
);
const tenantIntegritySql = readFileSync(
  join(migrationsDir, "20260712120000_tenant_integrity.sql"),
  "utf8",
);

// Sentencias `create policy … ;` de TODAS las migraciones del repo. Escanear un único
// archivo no basta: una política de escritura del cliente sobre citas introducida en
// CUALQUIER migración futura debe ser detectable aquí (no solo en esta).
const allPolicyStmts = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .flatMap(
    (f) => readFileSync(join(migrationsDir, f), "utf8").match(/create policy[\s\S]*?;/gi) ?? [],
  );

describe("contrato RLS SELF de citas (defensa en profundidad)", () => {
  it("existe la política SELF de SELECT acotada por app.user_customer_ids()", () => {
    expect(selfSql).toMatch(
      /create policy "self_select_own_appointments"\s*on public\.appointments for select to authenticated\s*using \(customer_id in \(select app\.user_customer_ids\(\)\)\)/,
    );
  });

  it("la política SELF se concede a 'authenticated', nunca a anon/public", () => {
    const selfPolicies = selfSql.match(/create policy "self_[^"]+"[\s\S]*?;/g) ?? [];
    expect(selfPolicies.length).toBeGreaterThanOrEqual(1);
    for (const policy of selfPolicies) {
      expect(policy).toContain("to authenticated");
      expect(policy).not.toMatch(/to (anon|public)/);
    }
  });

  it("la barrera de STAFF sigue intacta (members_select_appointments por user_salon_ids)", () => {
    // La política SELF CONVIVE (OR) con la de staff sin tocarla; si esta desapareciera,
    // el aislamiento multi-tenant del dashboard estaría roto.
    expect(baseRlsSql).toMatch(
      /create policy "members_select_appointments"\s*on public\.appointments for select to authenticated\s*using \(salon_id in \(select app\.user_salon_ids\(\)\)\)/,
    );
  });

  it("NINGUNA migración concede al cliente escritura de citas (self write)", () => {
    // Una política de autoservicio SIEMPRE se acota con app.user_customer_ids(); si
    // además es sobre `on public.appointments` y NO es `for select`, es una escritura
    // del cliente sobre citas — prohibida. Se busca en TODAS las migraciones.
    const appointmentSelfPolicies = allPolicyStmts.filter(
      (p) => /on public\.appointments/i.test(p) && /user_customer_ids/i.test(p),
    );
    // No vacío: el escaneo del corpus SÍ ve la política SELF de citas. Si el glob se
    // rompiera, esto lo delataría en vez de pasar en falso.
    expect(appointmentSelfPolicies.length).toBeGreaterThanOrEqual(1);
    // Y TODAS ellas son de solo lectura: ninguna escritura del cliente sobre citas.
    const selfWritePolicies = appointmentSelfPolicies.filter((p) => !/for\s+select/i.test(p));
    expect(selfWritePolicies).toEqual([]);
  });

  it("el guardián de aserción veta la escritura SELF y la exposición a anon/public", () => {
    // Se ancla a los PREDICADOS reales del guardián, no a texto decorativo: si alguien
    // los cambiara, el test cae junto con la garantía en deploy.
    expect(selfSql).toMatch(
      /tablename = 'appointments'[\s\S]*?cmd <> 'SELECT'[\s\S]*?user_customer_ids/,
    );
    expect(selfSql).toContain("política(s) de escritura SELF");
    expect(selfSql).toMatch(
      /tablename = 'appointments'[\s\S]*?roles && array\['anon', 'public'\]/,
    );
  });

  it("la FK COMPUESTA (customer_id, salon_id) ata la cita al salón de su ficha", () => {
    // Fundamento de seguridad: por qué basta acotar por customer_id. La cita y su
    // customer comparten SIEMPRE salón (lo garantiza la BD), así que `customer_id in
    // (mis fichas)` no puede exponer una cita de otro salón.
    expect(tenantIntegritySql).toMatch(
      /appointments_customer_id_fkey\s*foreign key \(customer_id, salon_id\)\s*references public\.customers \(id, salon_id\)/,
    );
  });
});
