//
// Prueba de humo contra la app de verdad: `npm run humo`.
//
// Los 460 tests van contra funciones y contra la base. Ninguno abre la app
// servida, y por ese hueco se colaron a la vez cuatro rutas dando 404 con la
// batería entera en verde. Esto lo cierra: entra con sesión real —contraseña y
// segundo factor— y comprueba que cada pantalla responde, que ningún <script>
// que pide da 404 (eso es lo que el navegador convierte en ChunkLoadError) y
// que los datos que deben salir salen.
//
// Crea dos usuarios de prueba —propietario y colaborador— y los borra al
// terminar. No toca ninguna cuenta real. Solo desarrollo local: las claves de
// abajo son las que Supabase pone por defecto y salen en `supabase status`,
// iguales en cualquier máquina.
//
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import pg from "pg";

const API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const PUERTO = process.argv[2] ?? "3010";
const BASE = `http://localhost:${PUERTO}`;
const CORREO = "humo@atlas.test";
const CORREO_COLABORADOR = "humo-colaborador@atlas.test";
const CLAVE = "contrasena-de-prueba";

/** base32 → bytes: así viene la semilla del segundo factor. */
function deBase32(s) {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) {
    const i = alfabeto.indexOf(c);
    if (i >= 0) bits += i.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** TOTP de 6 dígitos, SHA-1, paso de 30 s: lo que espera Supabase. */
function totp(semilla) {
  const contador = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(contador / 2 ** 32), 0);
  buf.writeUInt32BE(contador >>> 0, 4);
  const h = createHmac("sha1", deBase32(semilla)).update(buf).digest();
  const d = h[h.length - 1] & 0xf;
  const cod = ((h[d] & 0x7f) << 24) | (h[d + 1] << 16) | (h[d + 2] << 8) | h[d + 3];
  return String(cod % 1_000_000).padStart(6, "0");
}

const admin = createClient(API, SERVICE, { auth: { persistSession: false } });
const db = new pg.Client(URL_PG);
let idUsuario = "";
let idColaborador = "";
let fallos = 0;

async function limpiar() {
  try {
    for (const id of [idUsuario, idColaborador]) {
      if (id) {
        await db.query(`DELETE FROM perfiles WHERE id = $1`, [id]);
        await admin.auth.admin.deleteUser(id);
      }
    }
    await db.end();
  } catch {
    // Limpiar es cortesía: si falla, no debe tapar el resultado de la prueba.
  }
}

// Da de alta un usuario, le hace pasar sesión con contraseña y segundo
// factor, y devuelve la cookie con la que se puede pedir cualquier pantalla
// como si fuera él. Se usa dos veces: una para el propietario (dueño de las
// pruebas de arriba) y otra para el colaborador de la comprobación de abajo,
// porque llegar a la pantalla protegida exige pasar el mismo guardia de
// `src/middleware.ts` para los dos — sin el segundo factor superado, el
// guardia redirige a /verificar antes de que la pantalla llegue a decidir
// nada por su cuenta.
async function entrarConSegundoFactor(correo, propietario) {
  const alta = await admin.auth.admin.createUser({
    email: correo,
    password: CLAVE,
    email_confirm: true,
  });
  if (alta.error) throw alta.error;
  const idUsuarioNuevo = alta.data.user.id;

  await db.query(
    `INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1,'Humo',$2)
     ON CONFLICT (id) DO NOTHING`,
    [idUsuarioNuevo, propietario]
  );

  // El cliente de servidor deja la sesión en las mismas cookies que espera
  // Next: así no hay que adivinar su formato.
  const galletas = new Map();
  const sb = createServerClient(API, ANON, {
    cookies: {
      getAll: () => [...galletas].map(([name, value]) => ({ name, value })),
      setAll: (l) => l.forEach(({ name, value }) => galletas.set(name, value)),
    },
  });

  const entrada = await sb.auth.signInWithPassword({ email: correo, password: CLAVE });
  if (entrada.error) throw entrada.error;

  const inscrito = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "humo" });
  if (inscrito.error) throw inscrito.error;
  const reto = await sb.auth.mfa.challenge({ factorId: inscrito.data.id });
  if (reto.error) throw reto.error;
  const ok2fa = await sb.auth.mfa.verify({
    factorId: inscrito.data.id,
    challengeId: reto.data.id,
    code: totp(inscrito.data.totp.secret),
  });
  if (ok2fa.error) throw ok2fa.error;

  const cookie = [...galletas].map(([n, v]) => `${n}=${v}`).join("; ");
  return { idUsuario: idUsuarioNuevo, cookie };
}

try {
  await db.connect();

  // Restos de una ejecución anterior que se cortara a medias.
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO || u.email === CORREO_COLABORADOR) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  const sesion = await entrarConSegundoFactor(CORREO, true);
  idUsuario = sesion.idUsuario;
  const cookie = sesion.cookie;

  const { rows: clientes } = await db.query(`SELECT nombre FROM clientes ORDER BY nombre`);
  const { rows: proyectos } = await db.query(`SELECT nombre FROM proyectos ORDER BY nombre`);

  // Las fichas se prueban con el cliente y el proyecto que MÁS servicios tienen:
  // son las que de verdad pintan algo, y por tanto las que pueden romperse.
  const { rows: fichaCliente } = await db.query(
    `SELECT c.slug, c.nombre, count(s.id) AS n FROM clientes c
       JOIN servicios s ON s.cliente_id = c.id
      GROUP BY c.slug, c.nombre ORDER BY n DESC LIMIT 1`
  );
  const { rows: fichaProyecto } = await db.query(
    `SELECT p.slug, p.nombre, count(s.id) AS n FROM proyectos p
       JOIN servicios s ON s.proyecto_id = p.id
      GROUP BY p.slug, p.nombre ORDER BY n DESC LIMIT 1`
  );

  const PANTALLAS = [
    { ruta: "/", exige: proyectos.slice(0, 2).map((p) => p.nombre) },
    { ruta: "/clientes", exige: clientes.slice(0, 3).map((c) => c.nombre) },
    { ruta: "/proyectos", exige: proyectos.slice(0, 3).map((p) => p.nombre) },
    { ruta: "/alertas", exige: [] },
    // `exige` con contenido y no vacío: la pantalla se pinta desde tablas que
    // al principio estarán vacías, y un 200 con el cuerpo en blanco sería
    // indistinguible de una que funciona.
    { ruta: "/dinero", exige: ["Dinero", "Coste de estructura"] },
    // Se exige el texto de los tres desgloses: la pantalla se pinta entera
    // desde tablas que estaran vacias al principio, y un 200 con el cuerpo en
    // blanco seria indistinguible de una que funciona.
    { ruta: "/dinero/gastos", exige: ["Por plataforma", "Por cliente", "Por proyecto"] },
    { ruta: "/dinero/cobro", exige: ["Cobro"] },
    { ruta: "/ajustes", exige: [] },
    { ruta: "/ajustes/apariencia", exige: [] },
    { ruta: "/ajustes/notificaciones", exige: [] },
    { ruta: "/ajustes/usuarios", exige: [] },
    { ruta: "/ajustes/credenciales", exige: [] },
    // `exige` con contenido y no vacío: esta pantalla se pinta entera desde una
    // tabla que casi siempre estará vacía, y un 200 con el cuerpo en blanco
    // sería indistinguible de una que funciona.
    { ruta: "/ajustes/descubridor", exige: ["Descubridor"] },
  ];

  // Una ficha que carga pero no lista los servicios es justo el fallo que no se
  // ve desde fuera: responde 200, se ve bien y está mintiendo.
  for (const c of fichaCliente) {
    const { rows: suyos } = await db.query(
      `SELECT s.nombre FROM servicios s JOIN clientes cl ON cl.id = s.cliente_id
        WHERE cl.slug = $1 ORDER BY s.nombre LIMIT 3`,
      [c.slug]
    );
    PANTALLAS.push({
      ruta: `/clientes/${c.slug}`,
      exige: [c.nombre, ...suyos.map((s) => s.nombre)],
    });
  }
  for (const p of fichaProyecto) {
    const { rows: suyos } = await db.query(
      `SELECT s.nombre FROM servicios s JOIN proyectos pr ON pr.id = s.proyecto_id
        WHERE pr.slug = $1 ORDER BY s.nombre LIMIT 3`,
      [p.slug]
    );
    PANTALLAS.push({
      ruta: `/proyectos/${p.slug}`,
      exige: [p.nombre, ...suyos.map((s) => s.nombre)],
    });
  }

  console.log(`Atlas en ${BASE} — sesión con segundo factor superada\n`);

  for (const { ruta, exige } of PANTALLAS) {
    const notas = [];
    try {
      const res = await fetch(`${BASE}${ruta}`, { headers: { cookie } });
      const html = await res.text();

      if (res.status !== 200) notas.push(`HTTP ${res.status}`);

      // Un <script> que da 404 es exactamente lo que el navegador convierte en
      // ChunkLoadError al navegar. Es el síntoma que hay que cazar aquí.
      const scripts = [...html.matchAll(/src="(\/_next\/[^"]+\.js)"/g)].map((m) => m[1]);
      for (const s of scripts) {
        const q = await fetch(`${BASE}${s}`, { method: "HEAD" });
        if (!q.ok) notas.push(`script ${q.status}: ${s}`);
      }

      const texto = html
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (texto.length < 120) notas.push("página en blanco");

      const faltan = exige.filter((n) => !html.includes(n));
      if (faltan.length) notas.push(`no salen: ${faltan.join(", ")}`);

      const marca = notas.length ? "x" : "ok";
      const resumen = notas.length
        ? notas.join(" | ")
        : `${scripts.length} scripts${exige.length ? `, ${exige.length} datos` : ""}`;
      console.log(`  ${marca.padEnd(3)} ${ruta.padEnd(26)} ${resumen}`);
      if (notas.length) fallos++;
    } catch (e) {
      console.log(`  x   ${ruta.padEnd(26)} ${e.message}`);
      fallos++;
    }
  }

  // /dinero a un colaborador tiene que dar 404. Está en la lista de
  // verificación del plan y nada más lo comprobaba: un test de función no
  // sirve aquí porque lo que hay que probar es el guardia de la RUTA servida
  // —`notFound()` en `src/app/dinero/page.tsx`, detrás del middleware de
  // sesión y segundo factor de verdad—, no una llamada aislada a
  // `obtenerPerfil`. Usuario aparte y con su propio segundo factor: el
  // guardia de `src/middleware.ts` exige aal2 para cualquier pantalla, así
  // que sin repetir el alta de MFA la petición ni llegaría a la página.
  console.log("");
  {
    const colaborador = await entrarConSegundoFactor(CORREO_COLABORADOR, false);
    idColaborador = colaborador.idUsuario;
    const res = await fetch(`${BASE}/dinero`, { headers: { cookie: colaborador.cookie } });
    const bien = res.status === 404;
    console.log(
      `  ${(bien ? "ok" : "x").padEnd(3)} ${"/dinero (colaborador)".padEnd(26)} ${res.status}`
    );
    if (!bien) fallos++;
  }

  // Estas tres tienen que servirse sin sesión, o la aplicación no se instala.
  console.log("");
  for (const ruta of ["/manifest.webmanifest", "/sw.js", "/iconos/atlas-192.png"]) {
    const res = await fetch(`${BASE}${ruta}`);
    const bien = res.status === 200;
    console.log(`  ${(bien ? "ok" : "x").padEnd(3)} ${ruta.padEnd(26)} ${res.status}`);
    if (!bien) fallos++;
  }

  console.log(fallos ? `\n${fallos} pantallas con problemas.` : "\nTodo responde y trae datos.");
} finally {
  await limpiar();
}

process.exit(fallos ? 1 : 0);
