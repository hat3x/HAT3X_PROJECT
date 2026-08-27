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

describe("rutas que el guardia no toca", () => {
  // El enlace de silenciar se pulsa desde una notificación del sistema, a veces
  // con la app cerrada y siempre sin sesión. Si el guardia lo manda a /login, el
  // botón de la notificación no sirve de nada. Su autorización es la firma.
  it("silenciar funciona sin sesión", () => {
    expect(decidirRuta(sinSesion, "/api/silenciar")).toBeNull();
  });

  it("y también con la sesión a medias", () => {
    expect(decidirRuta(sinFactor, "/api/silenciar")).toBeNull();
    expect(decidirRuta(factorPendiente, "/api/silenciar")).toBeNull();
  });

  // Con sesión tampoco puede rebotar a «/», que es lo que les pasa a las
  // pantallas de entrada: no es una pantalla, es un endpoint.
  it("y con la sesión completa tampoco rebota a la portada", () => {
    expect(decidirRuta(dentro, "/api/silenciar")).toBeNull();
  });

  // El descubridor lo despierta pg_cron a través de pg_net, que no trae cookie
  // ninguna. Sin esto el guardia lo manda a /login, pg_net recibe un 307 y la
  // pasada no ocurre NUNCA — dejando `descubrimientos` vacía, que es la señal
  // que MANTENIMIENTO.md atribuye a otra causa. Su autorización es
  // ATLAS_CRON_KEY, igual que la de silenciar es la firma del token.
  it("el descubridor entra sin sesión, que es como llega pg_cron", () => {
    expect(decidirRuta(sinSesion, "/api/descubrir")).toBeNull();
    expect(decidirRuta(sinFactor, "/api/descubrir")).toBeNull();
    expect(decidirRuta(factorPendiente, "/api/descubrir")).toBeNull();
    expect(decidirRuta(dentro, "/api/descubrir")).toBeNull();
  });

  // Que sean públicas no abre todo /api: mañana habrá endpoints que sí exijan sesión.
  it("no abre el resto de /api por el camino", () => {
    expect(decidirRuta(sinSesion, "/api/otra-cosa")).toBe("/login");
  });
});
