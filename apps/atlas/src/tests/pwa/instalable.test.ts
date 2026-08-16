import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

//
// Que Atlas se instale depende de cuatro piezas sueltas que nadie compila
// juntas: el manifiesto, los iconos, el service worker y el matcher del
// middleware. Ninguna tiene tipos, ninguna la revisa el build — un manifiesto
// con una coma de más o un icono que no es PNG fallan en silencio, y lo único
// que se nota es que el navegador no ofrece instalar. Esto lo hace ruidoso.
//

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type Icono = { src: string; sizes: string; type: string; purpose: string };
type Manifiesto = {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  icons: Icono[];
};

describe("manifiesto", () => {
  const manifiesto = JSON.parse(leer("public/manifest.webmanifest")) as Manifiesto;

  it("lleva lo que el navegador exige para ofrecer instalar", () => {
    expect(manifiesto.name).toBeTruthy();
    // Es el que sale bajo el icono en el escritorio: si es largo, se corta.
    expect(manifiesto.short_name.length).toBeLessThanOrEqual(12);
    expect(manifiesto.start_url).toBe("/");
    // Con "browser" se instala, pero abre con la barra de direcciones encima.
    expect(manifiesto.display).toBe("standalone");
  });

  it("trae los dos tamaños de icono y uno recortable", () => {
    const medidas = manifiesto.icons.map((i) => i.sizes);
    expect(medidas).toContain("192x192");
    expect(medidas).toContain("512x512");
    // Sin `maskable`, Android mete el icono entero dentro de un círculo blanco.
    expect(manifiesto.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it.each([192, 512])("el icono de %ix%i existe y es un PNG de ese tamaño", (lado) => {
    const declarado = manifiesto.icons.find((i) => i.sizes === `${lado}x${lado}`);
    expect(declarado).toBeDefined();

    const bytes = readFileSync(resolve(RAIZ, "public", declarado!.src.slice(1)));
    expect(bytes.subarray(0, 8)).toEqual(FIRMA_PNG);
    // Ancho y alto del IHDR, que arranca justo tras la firma y su cabecera.
    expect(bytes.readUInt32BE(16)).toBe(lado);
    expect(bytes.readUInt32BE(20)).toBe(lado);
  });
});

describe("service worker", () => {
  const sw = leer("public/sw.js");

  it.each(["install", "activate", "push", "notificationclick", "fetch"])(
    "atiende el evento %s",
    (evento) => {
      expect(sw).toContain(`addEventListener("${evento}"`);
    }
  );

  it("respeta el contrato del aviso que manda la Edge Function", () => {
    // Los tres campos de AvisoEnviable en supabase/functions/avisar/correo.ts.
    for (const campo of ["titulo", "cuerpo", "url"]) expect(sw).toContain(campo);
  });

  it("no cachea la API", () => {
    // Servir un /api viejo desde caché es peor que fallar: enseñaría un estado
    // «ok» de hace horas sobre un servicio que ahora mismo está caído.
    expect(sw).toContain('.startsWith("/api/")');
  });
});

describe("matcher del middleware", () => {
  // Next exige que el matcher sea un literal dentro de middleware.ts, así que no
  // se puede importar: se lee del fuente, como copias.test.ts con las copias.
  const encontrado = /matcher:\s*\[\s*"([^"]+)"/.exec(
    leer("src/middleware.ts").replace(/\s*\n\s*/g, "")
  );
  if (!encontrado) throw new Error("no se encontró el matcher en middleware.ts");
  // En el fuente los escapes van dobles porque viven dentro de una cadena.
  const patron = new RegExp(`^${encontrado[1]!.replace(/\\\\/g, "\\")}$`);

  it.each(["/", "/panel", "/alertas", "/proyectos/biodental", "/ajustes"])(
    "vigila %s",
    (ruta) => expect(patron.test(ruta)).toBe(true)
  );

  // Sin sesión el guardia contesta 307 a todo lo que vigila. Un 307 donde el
  // navegador espera JSON o JavaScript es exactamente «Atlas no se instala».
  it.each([
    "/manifest.webmanifest",
    "/sw.js",
    "/iconos/atlas-192.png",
    "/iconos/atlas-512.png",
    "/favicon.ico",
  ])("deja pasar %s", (ruta) => expect(patron.test(ruta)).toBe(false));
});
