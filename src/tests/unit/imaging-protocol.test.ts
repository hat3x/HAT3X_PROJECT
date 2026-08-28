/**
 * Protocolo entre el navegador y el agente local de captura (A1a).
 *
 * El agente corre en el PC de la clínica y abre un servidor en `localhost` para
 * que la ficha del paciente pueda pedirle una radiografía. Eso tiene una
 * consecuencia incómoda: **cualquier página abierta en ese ordenador puede
 * conectarse a localhost**. Sin cerrarlo, una web cualquiera que la recepcionista
 * tenga abierta podría disparar radiografías o leerse las imágenes recién
 * capturadas.
 *
 * Se cierra con dos llaves, y los tests de aquí son esas dos llaves:
 *   1. `isAllowedOrigin` — solo hablan con el agente los orígenes de la lista.
 *   2. El token de emparejamiento, que viaja en cada mensaje.
 *
 * El caso que de verdad importa es el de la comparación por prefijo: es el fallo
 * clásico de las listas de orígenes y no lo detecta ninguna prueba manual.
 */
import { describe, it, expect } from "vitest";

import { captureRequestSchema, isAllowedOrigin } from "@/lib/imaging/protocol";

const PERMITIDOS = ["https://kairosmanager.app", "http://localhost:3000"];

describe("isAllowedOrigin", () => {
  it("acepta un origen que está en la lista, exacto", () => {
    expect(isAllowedOrigin("https://kairosmanager.app", PERMITIDOS)).toBe(true);
  });

  it("rechaza un dominio que solo EMPIEZA igual", () => {
    // El fallo clásico: con `startsWith` esto pasaría, y quien registre
    // kairosmanager.app.example.com se queda hablando con el agente.
    expect(isAllowedOrigin("https://kairosmanager.app.example.com", PERMITIDOS)).toBe(false);
  });

  it("rechaza un subdominio que no está listado", () => {
    expect(isAllowedOrigin("https://pruebas.kairosmanager.app", PERMITIDOS)).toBe(false);
  });

  it("distingue el esquema: http no vale por https", () => {
    expect(isAllowedOrigin("http://kairosmanager.app", PERMITIDOS)).toBe(false);
  });

  it("distingue el puerto", () => {
    expect(isAllowedOrigin("http://localhost:5173", PERMITIDOS)).toBe(false);
    expect(isAllowedOrigin("http://localhost:3000", PERMITIDOS)).toBe(true);
  });

  it("rechaza la ausencia de origen", () => {
    // Una petición sin cabecera Origin no tiene detrás una pestaña legítima;
    // ante la duda, no.
    expect(isAllowedOrigin(null, PERMITIDOS)).toBe(false);
    expect(isAllowedOrigin(undefined, PERMITIDOS)).toBe(false);
    expect(isAllowedOrigin("", PERMITIDOS)).toBe(false);
  });

  it("rechaza cuando la lista está vacía: sin emparejar no se habla con nadie", () => {
    expect(isAllowedOrigin("https://kairosmanager.app", [])).toBe(false);
  });
});

describe("captureRequestSchema", () => {
  const peticion = {
    type: "capture",
    token: "a".repeat(32),
    deviceId: "11111111-1111-1111-1111-111111111111",
    customerId: "22222222-2222-2222-2222-222222222222",
    modality: "periapical",
    fdiCode: 46,
  };

  it("acepta una petición completa", () => {
    expect(captureRequestSchema.safeParse(peticion).success).toBe(true);
  });

  it("el diente es opcional: una panorámica no es de un diente concreto", () => {
    const { fdiCode: _omitido, ...sinDiente } = peticion;
    expect(
      captureRequestSchema.safeParse({ ...sinDiente, modality: "panoramic" }).success,
    ).toBe(true);
  });

  it("exige token: sin emparejar no se captura", () => {
    const { token: _omitido, ...sinToken } = peticion;
    expect(captureRequestSchema.safeParse(sinToken).success).toBe(false);
  });

  it("rechaza un token demasiado corto para ser un secreto", () => {
    expect(captureRequestSchema.safeParse({ ...peticion, token: "1234" }).success).toBe(false);
  });

  it("rechaza un código FDI que no existe", () => {
    // 46 sí (molar inferior derecho); 99 no es ningún diente.
    expect(captureRequestSchema.safeParse({ ...peticion, fdiCode: 99 }).success).toBe(false);
  });

  it("rechaza una modalidad fuera del catálogo clínico", () => {
    expect(captureRequestSchema.safeParse({ ...peticion, modality: "selfie" }).success).toBe(false);
  });

  it("rechaza claves de más: el mensaje es cerrado", () => {
    expect(
      captureRequestSchema.safeParse({ ...peticion, uploadTo: "https://otro-sitio" }).success,
    ).toBe(false);
  });
});
