/**
 * Un teléfono identifica a una FAMILIA, no a una persona.
 *
 * ── DE DÓNDE SALE ESTO ──────────────────────────────────────────────────────
 * Kristel no podía poner teléfonos en las fichas: Kairos exigía "un teléfono =
 * una ficha". En una clínica eso es falso — la madre da su móvil para ella y
 * para sus dos hijos, y cada uno tiene su ficha, su odontograma y sus
 * tratamientos. En Biodental, 397 de 1.200 fichas no tienen teléfono, y 227 de
 * ellas comparten apellido con otra.
 *
 * Al permitir el teléfono repetido aparece la pregunta que antes no existía:
 * cuando llama ese número, ¿quién llama? Este módulo la responde, y cuando no
 * puede lo DICE en vez de elegir por su cuenta.
 *
 * ── POR QUÉ EL NOMBRE RESUELVE CASI TODO ────────────────────────────────────
 * Sara ya pregunta el nombre para reservar. Con teléfono + nombre, la familia
 * deja de ser ambigua sin que nadie tenga que hacer nada nuevo.
 */
import { describe, it, expect } from "vitest";

import { resolveHouseholdMatch, type HouseholdCandidate } from "@/lib/reception/household";

const MADRE: HouseholdCandidate = { id: "m", fullName: "Ana Castiella Antón" };
const HIJO: HouseholdCandidate = { id: "h", fullName: "Santiago Castiella Antón" };
const HIJA: HouseholdCandidate = { id: "j", fullName: "Lucía Castiella Antón" };

describe("resolveHouseholdMatch · sin candidatos", () => {
  it("nadie con ese telefono: no hay ficha", () => {
    expect(resolveHouseholdMatch([], { fullName: "Ana Castiella" })).toEqual({ kind: "none" });
  });
});

describe("resolveHouseholdMatch · una sola ficha", () => {
  it("una sola: esa es, sin mirar el nombre", () => {
    // El caso de siempre, el 90 % de las llamadas. No se rompe nada.
    const r = resolveHouseholdMatch([MADRE], { fullName: "cualquier cosa" });
    expect(r).toEqual({ kind: "one", customerId: "m" });
  });

  it("una sola y sin nombre: tambien vale", () => {
    expect(resolveHouseholdMatch([MADRE], {})).toEqual({ kind: "one", customerId: "m" });
  });
});

describe("resolveHouseholdMatch · varias fichas, el nombre desempata", () => {
  const familia = [MADRE, HIJO, HIJA];

  it("el nombre exacto elige a esa persona", () => {
    const r = resolveHouseholdMatch(familia, { fullName: "Santiago Castiella Antón" });
    expect(r).toEqual({ kind: "one", customerId: "h" });
  });

  it("no distingue mayusculas ni acentos: por telefono se transcribe como se oye", () => {
    // Sara transcribe lo que oye. "LUCIA CASTIELLA ANTON" es la misma persona
    // que "Lucía Castiella Antón", y tratarlas como distintas duplicaria fichas.
    const r = resolveHouseholdMatch(familia, { fullName: "LUCIA CASTIELLA ANTON" });
    expect(r).toEqual({ kind: "one", customerId: "j" });
  });

  it("aguanta espacios de mas", () => {
    const r = resolveHouseholdMatch(familia, { fullName: "  Santiago   Castiella   Antón " });
    expect(r).toEqual({ kind: "one", customerId: "h" });
  });

  it("solo el nombre de pila basta si no hay empate", () => {
    // "Soy Santiago" es como habla la gente por telefono.
    const r = resolveHouseholdMatch(familia, { fullName: "Santiago" });
    expect(r).toEqual({ kind: "one", customerId: "h" });
  });
});

describe("resolveHouseholdMatch · cuando NO se puede saber", () => {
  const familia = [MADRE, HIJO, HIJA];

  it("varias fichas y sin nombre: ambiguo, con los candidatos", () => {
    const r = resolveHouseholdMatch(familia, {});
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      expect(r.candidates.map((c) => c.id).sort()).toEqual(["h", "j", "m"]);
    }
  });

  it("un nombre que no casa con ninguno NO elige el primero", () => {
    // El fallo peligroso: reservar a nombre de otra persona de la casa.
    const r = resolveHouseholdMatch(familia, { fullName: "Pedro Gómez" });
    expect(r.kind).toBe("ambiguous");
  });

  it("un nombre que casa con VARIOS deja solo esos como candidatos", () => {
    // Padre e hijo con el mismo nombre: pasa, y hay que preguntar.
    const tocayos: HouseholdCandidate[] = [
      { id: "p", fullName: "José Martín" },
      { id: "q", fullName: "José Martín" },
      MADRE,
    ];
    const r = resolveHouseholdMatch(tocayos, { fullName: "José Martín" });
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      expect(r.candidates.map((c) => c.id).sort()).toEqual(["p", "q"]);
    }
  });

  it("un nombre de pila que casa con dos hermanos deja los dos", () => {
    const dos: HouseholdCandidate[] = [
      { id: "a", fullName: "Ana Ruiz Pérez" },
      { id: "b", fullName: "Ana Ruiz Gómez" },
    ];
    const r = resolveHouseholdMatch(dos, { fullName: "Ana" });
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.candidates).toHaveLength(2);
  });

  it("un nombre vacio no cuenta como nombre", () => {
    expect(resolveHouseholdMatch(familia, { fullName: "   " }).kind).toBe("ambiguous");
  });
});

// ---------------------------------------------------------------------------
// El nombre se compara por PALABRAS, no por subcadena
//
// Este bloque lo destapó una prueba de mutación: cambiar la comparación por un
// `includes` pasaba todos los tests anteriores. Y un `includes` casa "Ana"
// dentro de "Mariana", que es exactamente reservarle la cita a otra persona.
// ---------------------------------------------------------------------------

describe("resolveHouseholdMatch · el nombre no se compara por trozos", () => {
  it("'Ana' NO es 'Mariana'", () => {
    const casa: HouseholdCandidate[] = [
      { id: "x", fullName: "Mariana Castiella" },
      { id: "y", fullName: "Pedro Castiella" },
    ];
    const r = resolveHouseholdMatch(casa, { fullName: "Ana" });
    // Nadie se llama Ana en esa casa: hay que preguntar, no elegir a Mariana.
    expect(r.kind).toBe("ambiguous");
  });

  it("un APELLIDO solo no identifica a nadie dentro de la familia", () => {
    // Todos lo comparten: decir "Castiella" no desempata nada.
    const familia: HouseholdCandidate[] = [MADRE, HIJO];
    const r = resolveHouseholdMatch(familia, { fullName: "Castiella" });
    expect(r.kind).toBe("ambiguous");
  });

  it("el nombre tiene que empezar por el principio, no valer por el medio", () => {
    const casa: HouseholdCandidate[] = [
      { id: "x", fullName: "José Antonio Ruiz" },
      { id: "y", fullName: "Marta Ruiz" },
    ];
    // "Antonio" está en la ficha de X, pero no es como empieza su nombre.
    expect(resolveHouseholdMatch(casa, { fullName: "Antonio" }).kind).toBe("ambiguous");
    // Y por el principio sí resuelve.
    expect(resolveHouseholdMatch(casa, { fullName: "José" })).toEqual({
      kind: "one",
      customerId: "x",
    });
  });
});
