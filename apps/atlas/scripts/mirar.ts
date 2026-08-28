//
// Temporal: abre una pantalla con sesión de propietario y la fotografía.
//
//   npx tsx scripts/prueba-descubridor.ts --sesion > cookie.txt
//   npx tsx scripts/mirar.ts /ajustes/descubridor salida.png cookie.txt
//
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const RUTA = process.argv[2] ?? "/";
const SALIDA = process.argv[3] ?? "pantalla.png";
const COOKIE = process.argv[4] ?? "/tmp/atlas-cookie.txt";
const BASE = "http://localhost:3010";

async function main() {
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({
    viewport: { width: 1280, height: 900 },
  });

  // La sesión de Supabase viaja en varias cookies troceadas. Se meten tal cual
  // las escribió el cliente de servidor, sin intentar entender su formato.
  const cookies = readFileSync(COOKIE, "utf8")
    .trim()
    .split("; ")
    .map((par) => {
      const corte = par.indexOf("=");
      return {
        name: par.slice(0, corte),
        value: par.slice(corte + 1),
        domain: "localhost",
        path: "/",
      };
    });
  await contexto.addCookies(cookies);

  const pagina = await contexto.newPage();
  const respuesta = await pagina.goto(`${BASE}${RUTA}`, {
    waitUntil: "networkidle",
  });
  console.log(`${RUTA} → ${respuesta?.status()} · ${pagina.url()}`);
  await pagina.screenshot({ path: SALIDA, fullPage: true });
  console.log(`imagen en ${SALIDA}`);

  await navegador.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
