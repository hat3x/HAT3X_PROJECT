import { describe, it, expect } from "vitest";
import { decidirRuta, type EstadoSesion } from "@/lib/auth/guardia";

const sinSesion: EstadoSesion = {
  haySesion: false, nivelActual: null, nivelExigido: null,
};
// Ha entrado con contraseña y NO tiene segundo factor dado de alta.
const sinFactor: EstadoSesion = {
  haySesion: true, nivelActual: "aal1", nivelExigido: "aal1",
};
// Tiene factor dado de alta pero aún no ha metido el código de esta sesión.
const factorPendiente: EstadoSesion = {
  haySesion: true, nivelActual: "aal1", nivelExigido: "aal2",
};
const dentro: EstadoSesion = {
  haySesion: true, nivelActual: "aal2", nivelExigido: "aal2",
};

describe("guardia de acceso", () => {
  it("sin sesión manda al login", () => {
    expect(decidirRuta(sinSesion, "/clientes")).toBe("/login");
  });

  it("sin sesión deja pasar al propio login", () => {
    expect(decidirRuta(sinSesion, "/login")).toBeNull();
  });

  it("con contraseña pero sin segundo factor obliga a darlo de alta", () => {
    expect(decidirRuta(sinFactor, "/clientes")).toBe("/alta-2fa");
  });

  it("no rebota en bucle dentro de la propia alta de segundo factor", () => {
    expect(decidirRuta(sinFactor, "/alta-2fa")).toBeNull();
  });

  it("con factor dado de alta pero sin verificar esta sesión, pide el código", () => {
    expect(decidirRuta(factorPendiente, "/clientes")).toBe("/verificar");
  });

  it("no rebota en bucle dentro de la propia verificación", () => {
    expect(decidirRuta(factorPendiente, "/verificar")).toBeNull();
  });

  it("ya verificado pasa a cualquier sitio", () => {
    expect(decidirRuta(dentro, "/clientes")).toBeNull();
    expect(decidirRuta(dentro, "/ajustes/credenciales")).toBeNull();
  });

  it("ya verificado no se queda en las pantallas de entrada", () => {
    expect(decidirRuta(dentro, "/login")).toBe("/");
    expect(decidirRuta(dentro, "/verificar")).toBe("/");
    expect(decidirRuta(dentro, "/alta-2fa")).toBe("/");
  });

  it("quien no ha verificado NO llega a las credenciales aunque escriba la URL", () => {
    expect(decidirRuta(sinFactor, "/ajustes/credenciales")).toBe("/alta-2fa");
    expect(decidirRuta(factorPendiente, "/ajustes/credenciales")).toBe("/verificar");
  });
});
