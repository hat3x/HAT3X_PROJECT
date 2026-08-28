# Atlas 1C — Alertas, Resumen y PWA · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** que Atlas avise. Al terminar, una caída llega al móvil en segundos, se puede silenciar desde la propia notificación sin abrir la app, el Resumen enseña de un vistazo qué está roto, y la aplicación se instala en el teléfono.

**Requisito previo:** los planes [`1A · Cimientos`](./2026-08-15-atlas-1a-cimientos.md), [`1A-2 · Gestión`](./2026-08-15-atlas-1a2-gestion.md) y [`1B · Vigilancia`](./2026-08-15-atlas-1b-vigilancia.md), los tres terminados y con sus verificaciones de salida en verde.

**Arquitectura:** la Edge Function `vigia` ya calcula qué hay que notificar y lo devuelve sin enviar nada. Este bloque añade una segunda función, `avisar`, que recoge las incidencias pendientes, **las agrupa**, resuelve destinatarios y envía por push y correo. Igual que en 1B, la decisión de **qué** se envía es lógica pura sin red ni reloj; el envío es lo único que toca el mundo.

**Stack:** el de los planes anteriores, más Web Push con claves VAPID (`npm:web-push` bajo Deno), Resend para el correo, y el manifest y service worker de la PWA.

**Spec:** [`docs/superpowers/specs/2026-08-15-atlas-nucleo-monitorizacion-alertas-design.md`](../specs/2026-08-15-atlas-nucleo-monitorizacion-alertas-design.md) — secciones §7, §8.2, §8.5 y §8.7.

## Restricciones globales

Aplican las de los planes anteriores. Las propias de este:

- **Ninguna función de decisión lee la hora del sistema.** El instante entra como parámetro, igual que en 1B. Es lo que permite probar la agrupación por ventana sin esperas.
- **Una notificación que falla se registra igual.** Una suscripción push caducada debe detectarse, no perderse en silencio: cada envío escribe en `notificaciones`, con `ok = false` y su error cuando corresponde.
- **Nunca se notifica dos veces el mismo suceso.** ⚠️ *Corregido durante la ejecución:* el plan decía «la misma incidencia» y ponía `incidencias.notificada_en` como candado **único**. Es un error de diseño: una incidencia avisa **dos** veces —al abrirse y al cerrarse— y un solo campo no puede marcar dos sucesos. Con un único sello la recuperación no se enviaba jamás. Los candados son **dos**: `notificada_en` y `recuperacion_notificada_en`. Ver «Desviaciones» al final.
- **Las claves VAPID y la de Resend viven en el entorno de la Edge Function**, nunca en la base ni en el repositorio. La pública sí viaja al navegador: es su cometido.
- **El enlace de silenciar va firmado.** Es una URL que se pulsa desde una notificación, sin sesión: si no llevara firma, cualquiera que la adivinara podría silenciar tus alertas.

Y las lecciones de los planes anteriores, que vuelven a aplicar:

- **Toda tabla o columna nueva necesita su `GRANT` explícito** para `authenticated`, en la misma migración que la crea.
- **La Edge Function corre sobre Deno.** La lógica pura que comparta con la aplicación va **copiada** a `supabase/functions/`, y `src/tests/vigia/copias.test.ts` se amplía para vigilar también las copias nuevas. Una copia sincronizada a mano diverge siempre.
- **`fileParallelism: false`** ya está puesto; ningún aserto debe suponer una base vacía.
- **Aplicar las migraciones con `npx supabase migration up --local`, NO con `db reset`.** No hay `seed.sql`: un reset borra los datos reales dados de alta a mano.

## Interfaces heredadas

Del esquema (plan 1A): `incidencias`, `notificaciones`, `suscripciones_push`, `perfiles`, `permisos`, `servicios`, `proyectos`.
De la vigilancia (plan 1B): la Edge Function `vigia`, `transicion()` y su campo `notificar`, `estadoDeServicios()`, `formatearUptime()`.

---

## Tarea 1: Agrupación de avisos

**Lo que impide que Atlas sea insoportable.** Si caen cinco servicios de un proyecto a la vez, llega **una** notificación, no cinco. Lógica pura: sin red, sin base de datos, sin reloj.

**Ficheros:**
- Crear: `apps/atlas/src/lib/alertas/agrupar.ts`
- Test: `apps/atlas/src/tests/alertas/agrupar.test.ts`

**Interfaces:**
- Consume: nada.
- Produce:
  - `type SucesoAviso = { incidenciaId: string; proyectoId: string; proyectoNombre: string; servicioNombre: string; tipo: "apertura" | "recuperacion"; abiertaEn: string; causa: string | null }`
  - `type Aviso = { proyectoId: string; proyectoNombre: string; tipo: "apertura" | "recuperacion"; incidenciaIds: string[]; titulo: string; cuerpo: string }`
  - `function agrupar(sucesos: SucesoAviso[], ventanaMs: number): Aviso[]`

- [x] **Paso 1: escribir el test que falla**

```ts
// src/tests/alertas/agrupar.test.ts
import { describe, it, expect } from "vitest";
import { agrupar, type SucesoAviso } from "@/lib/alertas/agrupar";

const VENTANA = 2 * 60 * 1000; // 2 minutos

function suceso(parcial: Partial<SucesoAviso> = {}): SucesoAviso {
  return {
    incidenciaId: "i1",
    proyectoId: "p1",
    proyectoNombre: "Recepcionista Sara",
    servicioNombre: "Agente Retell",
    tipo: "apertura",
    abiertaEn: "2026-08-16T10:00:00.000Z",
    causa: "HTTP 500",
    ...parcial,
  };
}

describe("agrupación de avisos", () => {
  it("sin sucesos no hay avisos", () => {
    expect(agrupar([], VENTANA)).toEqual([]);
  });

  it("un solo servicio caído da un aviso con su nombre y su causa", () => {
    const [aviso] = agrupar([suceso()], VENTANA);
    expect(aviso!.titulo).toBe("Recepcionista Sara: Agente Retell caído");
    expect(aviso!.cuerpo).toBe("HTTP 500");
    expect(aviso!.incidenciaIds).toEqual(["i1"]);
  });

  it("cinco servicios del mismo proyecto en la ventana dan UN aviso", () => {
    // Los instantes se construyen sumando a una base, no formateando segundos a
    // mano: «10:00:60» no es una hora válida y `new Date` devuelve NaN.
    const base = Date.parse("2026-08-16T10:00:00.000Z");
    const sucesos = ["a", "b", "c", "d", "e"].map((n, i) =>
      suceso({
        incidenciaId: n,
        servicioNombre: `Servicio ${n}`,
        abiertaEn: new Date(base + i * 20_000).toISOString(),
      })
    );
    const avisos = agrupar(sucesos, VENTANA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.titulo).toBe("Recepcionista Sara: 5 servicios caídos");
    expect(avisos[0]!.incidenciaIds).toHaveLength(5);
  });

  // La ventana se mide desde el PRIMERO del grupo, no desde el anterior. Si se
  // midiera en cadena, una caída lenta iría absorbiendo sucesos sin fin.
  it("la ventana se mide desde el primero del grupo, no en cadena", () => {
    const avisos = agrupar(
      [
        suceso({ incidenciaId: "i1", abiertaEn: "2026-08-16T10:00:00.000Z" }),
        suceso({ incidenciaId: "i2", abiertaEn: "2026-08-16T10:01:30.000Z" }),
        suceso({ incidenciaId: "i3", abiertaEn: "2026-08-16T10:03:00.000Z" }),
      ],
      VENTANA
    );
    expect(avisos).toHaveLength(2);
    expect(avisos[0]!.incidenciaIds).toEqual(["i1", "i2"]);
    expect(avisos[1]!.incidenciaIds).toEqual(["i3"]);
  });

  it("dos proyectos distintos dan dos avisos aunque caigan a la vez", () => {
    const avisos = agrupar(
      [
        suceso(),
        suceso({ incidenciaId: "i2", proyectoId: "p2", proyectoNombre: "Kairos" }),
      ],
      VENTANA
    );
    expect(avisos).toHaveLength(2);
  });

  it("fuera de la ventana son avisos separados", () => {
    const avisos = agrupar(
      [
        suceso({ incidenciaId: "i1", abiertaEn: "2026-08-16T10:00:00.000Z" }),
        suceso({ incidenciaId: "i2", abiertaEn: "2026-08-16T10:05:00.000Z" }),
      ],
      VENTANA
    );
    expect(avisos).toHaveLength(2);
  });

  it("aperturas y recuperaciones no se mezclan nunca", () => {
    const avisos = agrupar(
      [suceso(), suceso({ incidenciaId: "i2", tipo: "recuperacion" })],
      VENTANA
    );
    expect(avisos).toHaveLength(2);
    expect(avisos.map((a) => a.tipo).sort()).toEqual(["apertura", "recuperacion"]);
  });

  it("la recuperación se lee como buena noticia", () => {
    const [aviso] = agrupar([suceso({ tipo: "recuperacion" })], VENTANA);
    expect(aviso!.titulo).toBe("Recepcionista Sara: Agente Retell recuperado");
  });

  it("varias recuperaciones también se agrupan", () => {
    const avisos = agrupar(
      [
        suceso({ incidenciaId: "i1", tipo: "recuperacion" }),
        suceso({ incidenciaId: "i2", tipo: "recuperacion", servicioNombre: "n8n" }),
      ],
      VENTANA
    );
    expect(avisos[0]!.titulo).toBe("Recepcionista Sara: 2 servicios recuperados");
  });

  it("sin causa el cuerpo lo dice, en vez de quedarse vacío", () => {
    const [aviso] = agrupar([suceso({ causa: null })], VENTANA);
    expect(aviso!.cuerpo).toBe("Sin detalle del error");
  });

  it("agrupado, el cuerpo enumera los servicios", () => {
    const avisos = agrupar(
      [
        suceso({ incidenciaId: "i1", servicioNombre: "Agente Retell" }),
        suceso({ incidenciaId: "i2", servicioNombre: "n8n 02-crear-cita" }),
      ],
      VENTANA
    );
    expect(avisos[0]!.cuerpo).toBe("Agente Retell, n8n 02-crear-cita");
  });

  // El orden de llegada no debe cambiar el resultado: los sucesos vienen de una
  // consulta y su orden no está garantizado.
  it("el resultado no depende del orden de entrada", () => {
    const a = suceso({ incidenciaId: "i1", abiertaEn: "2026-08-16T10:00:00.000Z" });
    const b = suceso({ incidenciaId: "i2", abiertaEn: "2026-08-16T10:00:30.000Z" });
    expect(agrupar([a, b], VENTANA)).toEqual(agrupar([b, a], VENTANA));
  });
});
```

- [x] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/alertas/agrupar.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/alertas/agrupar"».

- [x] **Paso 3: implementar**

```ts
// src/lib/alertas/agrupar.ts
//
// Decide cuántas notificaciones salen de un puñado de incidencias. Es lo que
// separa una herramienta útil de una que acabas silenciando.
//
// Lógica pura: sin red, sin base de datos, sin reloj. No importa NADA, porque la
// Edge Function `avisar` la reutiliza sobre Deno.

export type SucesoAviso = {
  incidenciaId: string;
  proyectoId: string;
  proyectoNombre: string;
  servicioNombre: string;
  tipo: "apertura" | "recuperacion";
  /** ISO 8601 */
  abiertaEn: string;
  causa: string | null;
};

export type Aviso = {
  proyectoId: string;
  proyectoNombre: string;
  tipo: "apertura" | "recuperacion";
  incidenciaIds: string[];
  titulo: string;
  cuerpo: string;
};

function redactar(grupo: SucesoAviso[]): { titulo: string; cuerpo: string } {
  const primero = grupo[0]!;
  const participio = primero.tipo === "apertura" ? "caído" : "recuperado";

  if (grupo.length === 1) {
    return {
      titulo: `${primero.proyectoNombre}: ${primero.servicioNombre} ${participio}`,
      cuerpo:
        primero.tipo === "apertura"
          ? (primero.causa ?? "Sin detalle del error")
          : "Vuelve a responder",
    };
  }

  const plural = primero.tipo === "apertura" ? "caídos" : "recuperados";
  return {
    titulo: `${primero.proyectoNombre}: ${grupo.length} servicios ${plural}`,
    cuerpo: grupo.map((s) => s.servicioNombre).join(", "),
  };
}

/**
 * Agrupa por proyecto y tipo, dentro de una ventana temporal. Aperturas y
 * recuperaciones nunca se mezclan: son noticias opuestas y juntarlas produciría
 * un mensaje incomprensible.
 */
export function agrupar(sucesos: SucesoAviso[], ventanaMs: number): Aviso[] {
  // Se ordena por instante para que el resultado no dependa del orden en que
  // los devolvió la consulta.
  const ordenados = [...sucesos].sort((a, b) => a.abiertaEn.localeCompare(b.abiertaEn));

  const grupos: SucesoAviso[][] = [];

  for (const s of ordenados) {
    const grupo = grupos.find((g) => {
      const cabeza = g[0]!;
      return (
        cabeza.proyectoId === s.proyectoId &&
        cabeza.tipo === s.tipo &&
        new Date(s.abiertaEn).getTime() - new Date(cabeza.abiertaEn).getTime() <=
          ventanaMs
      );
    });
    if (grupo) grupo.push(s);
    else grupos.push([s]);
  }

  return grupos.map((g) => {
    const cabeza = g[0]!;
    return {
      proyectoId: cabeza.proyectoId,
      proyectoNombre: cabeza.proyectoNombre,
      tipo: cabeza.tipo,
      incidenciaIds: g.map((s) => s.incidenciaId),
      ...redactar(g),
    };
  });
}
```

- [x] **Paso 4: ejecutar y exigir cobertura total**

Ejecuta: `npx vitest run src/tests/alertas/ --coverage.enabled --coverage.include="src/lib/alertas/**" --coverage.thresholds.lines=100 --coverage.thresholds.branches=100`
Esperado: PASA, 11 tests, `agrupar.ts` al **100 %** de líneas y ramas. Como la máquina de estados: aquí no se admite una rama sin probar.

- [x] **Paso 5: commit**

```bash
git add src/lib/alertas src/tests/alertas
git commit -m "feat(atlas): agrupacion de avisos por proyecto y ventana"
```

---

## Tarea 2: Destinatarios

Quién recibe qué. El propietario recibe todo, siempre; los demás, solo lo de los proyectos sobre los que tienen permiso.

**Ficheros:**
- Crear: `apps/atlas/src/lib/alertas/destinatarios.ts`
- Test: `apps/atlas/src/tests/alertas/destinatarios.test.ts`

**Interfaces:**
- Consume: `Sb` de `@/lib/db/clientes`.
- Produce:
  - `type Persona = { id: string; esPropietario: boolean; proyectos: string[] }`
  - `function quienRecibe(proyectoId: string, personas: Persona[]): string[]`
  - `async function cargarPersonas(sb: Sb): Promise<Persona[]>`

- [x] **Paso 1: escribir el test que falla**

```ts
// src/tests/alertas/destinatarios.test.ts
import { describe, it, expect } from "vitest";
import { quienRecibe, type Persona } from "@/lib/alertas/destinatarios";

const duenyo: Persona = { id: "u-duenyo", esPropietario: true, proyectos: [] };
const editor: Persona = { id: "u-editor", esPropietario: false, proyectos: ["p1"] };
const ajeno: Persona = { id: "u-ajeno", esPropietario: false, proyectos: ["p2"] };

describe("destinatarios de un aviso", () => {
  it("el propietario lo recibe todo, aunque no tenga permisos por proyecto", () => {
    expect(quienRecibe("p1", [duenyo])).toEqual(["u-duenyo"]);
    expect(quienRecibe("p9", [duenyo])).toEqual(["u-duenyo"]);
  });

  it("quien tiene permiso sobre el proyecto lo recibe", () => {
    expect(quienRecibe("p1", [editor])).toEqual(["u-editor"]);
  });

  it("quien no tiene permiso NO lo recibe", () => {
    expect(quienRecibe("p1", [ajeno])).toEqual([]);
  });

  it("no duplica al propietario que además tiene permiso explícito", () => {
    const duenyoConPermiso: Persona = { ...duenyo, proyectos: ["p1"] };
    expect(quienRecibe("p1", [duenyoConPermiso])).toEqual(["u-duenyo"]);
  });

  it("sin nadie configurado no revienta: devuelve lista vacía", () => {
    expect(quienRecibe("p1", [])).toEqual([]);
  });

  it("mezcla: solo el propietario y quien tiene permiso", () => {
    expect(quienRecibe("p1", [duenyo, editor, ajeno]).sort()).toEqual([
      "u-duenyo",
      "u-editor",
    ]);
  });
});
```

- [x] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/alertas/destinatarios.test.ts`
Esperado: FALLA por módulo no resuelto.

- [x] **Paso 3: implementar**

```ts
// src/lib/alertas/destinatarios.ts
import type { Sb } from "@/lib/db/clientes";

export type Persona = {
  id: string;
  esPropietario: boolean;
  /** Proyectos sobre los que tiene permiso, sea editor o lector. */
  proyectos: string[];
};

/**
 * Quién debe enterarse de lo que pasa en un proyecto. El propietario siempre:
 * es su negocio. Los demás, solo lo suyo — recibir alertas de proyectos que no
 * puedes ni abrir es ruido, y además filtra qué clientes hay.
 */
export function quienRecibe(proyectoId: string, personas: Persona[]): string[] {
  return personas
    .filter((p) => p.esPropietario || p.proyectos.includes(proyectoId))
    .map((p) => p.id);
}

export async function cargarPersonas(sb: Sb): Promise<Persona[]> {
  const { data, error } = await sb
    .from("perfiles")
    .select("id, es_propietario, permisos(proyecto_id)");
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    esPropietario: p.es_propietario,
    proyectos: (p.permisos ?? []).map((q) => q.proyecto_id),
  }));
}
```

- [x] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/alertas/destinatarios.test.ts`
Esperado: PASA, 6 tests.

- [x] **Paso 5: commit**

```bash
git add src/lib/alertas/destinatarios.ts src/tests/alertas/destinatarios.test.ts
git commit -m "feat(atlas): destinatarios de alertas por permiso de proyecto"
```

---

## Tarea 3: Firma del enlace de silenciar

Un enlace que se pulsa desde una notificación, **sin sesión**. Si no fuera firmado, cualquiera que adivinase un identificador podría silenciar tus alertas.

**Ficheros:**
- Crear: `apps/atlas/src/lib/alertas/firma.ts`
- Test: `apps/atlas/src/tests/alertas/firma.test.ts`

**Interfaces:**
- Consume: WebCrypto (`crypto.subtle`), igual que `lib/cripto/cifrado.ts` — para que la Edge Function pueda reutilizarlo bajo Deno.
- Produce:
  - `type CargaSilencio = { incidenciaId: string; hasta: string; expira: number }`
  - `async function firmar(carga: CargaSilencio, claveB64: string): Promise<string>`
  - `async function verificar(token: string, claveB64: string, ahoraMs: number): Promise<CargaSilencio | null>`

- [x] **Paso 1: escribir el test que falla**

```ts
// src/tests/alertas/firma.test.ts
import { describe, it, expect } from "vitest";
import { firmar, verificar, type CargaSilencio } from "@/lib/alertas/firma";

// 32 bytes exactos. Clave de pruebas: no abre nada real.
const CLAVE = Buffer.from("clave-de-32-bytes-para-pruebas!!").toString("base64");
const AHORA = 1_760_000_000_000;

const carga: CargaSilencio = {
  incidenciaId: "11111111-1111-1111-1111-111111111111",
  hasta: "2026-08-16T14:00:00.000Z",
  expira: AHORA + 86_400_000,
};

describe("firma del enlace de silenciar", () => {
  it("lo que firma se puede verificar", async () => {
    const token = await firmar(carga, CLAVE);
    expect(await verificar(token, CLAVE, AHORA)).toEqual(carga);
  });

  it("un token manipulado no cuela", async () => {
    const token = await firmar(carga, CLAVE);
    const roto = token.slice(0, -4) + "AAAA";
    expect(await verificar(roto, CLAVE, AHORA)).toBeNull();
  });

  it("cambiar la incidencia invalida la firma", async () => {
    const token = await firmar(carga, CLAVE);
    const sello = token.split(".")[1]!;
    const otroCuerpo = Buffer.from(
      JSON.stringify({ ...carga, incidenciaId: "22222222-2222-2222-2222-222222222222" })
    ).toString("base64url");
    expect(await verificar(`${otroCuerpo}.${sello}`, CLAVE, AHORA)).toBeNull();
  });

  it("con otra clave no vale", async () => {
    const token = await firmar(carga, CLAVE);
    const otra = Buffer.from("otra-clave-de-32-bytes-distinta!").toString("base64");
    expect(await verificar(token, otra, AHORA)).toBeNull();
  });

  it("caducado no vale: un enlace de hace un mes no puede seguir sirviendo", async () => {
    const token = await firmar(carga, CLAVE);
    expect(await verificar(token, CLAVE, carga.expira + 1)).toBeNull();
  });

  it("justo en el instante de caducidad todavía vale", async () => {
    const token = await firmar(carga, CLAVE);
    expect(await verificar(token, CLAVE, carga.expira)).toEqual(carga);
  });

  it("basura no revienta: devuelve null", async () => {
    for (const basura of ["", "sin-punto", "a.b", "...."]) {
      expect(await verificar(basura, CLAVE, AHORA), basura).toBeNull();
    }
  });
});
```

- [x] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/alertas/firma.test.ts`
Esperado: FALLA por módulo no resuelto.

- [x] **Paso 3: implementar**

```ts
// src/lib/alertas/firma.ts
//
// HMAC-SHA256 sobre WebCrypto, no sobre node:crypto: la Edge Function que
// genera los enlaces corre en Deno.
//
// No es un JWT a propósito: no hace falta una librería ni un formato con
// opciones, y el `alg: none` de JWT ha causado suficientes disgustos.

export type CargaSilencio = {
  incidenciaId: string;
  /** ISO 8601, o "infinity" para «hasta resolver». */
  hasta: string;
  /** Instante de caducidad del enlace, en ms desde epoch. */
  expira: number;
};

function aBase64Url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const normal = texto.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function clave(claveB64: string): Promise<CryptoKey> {
  const bruta = deBase64Url(claveB64);
  return crypto.subtle.importKey("raw", bruta, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function firmar(carga: CargaSilencio, claveB64: string): Promise<string> {
  const cuerpo = aBase64Url(new TextEncoder().encode(JSON.stringify(carga)));
  const sello = await crypto.subtle.sign(
    "HMAC",
    await clave(claveB64),
    new TextEncoder().encode(cuerpo)
  );
  return `${cuerpo}.${aBase64Url(new Uint8Array(sello))}`;
}

export async function verificar(
  token: string,
  claveB64: string,
  ahoraMs: number
): Promise<CargaSilencio | null> {
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [cuerpo, sello] = partes as [string, string];
  if (cuerpo === "" || sello === "") return null;

  try {
    // `crypto.subtle.verify` compara en tiempo constante; hacerlo a mano con
    // `===` filtraría información por el tiempo de respuesta.
    const valido = await crypto.subtle.verify(
      "HMAC",
      await clave(claveB64),
      deBase64Url(sello),
      new TextEncoder().encode(cuerpo)
    );
    if (!valido) return null;

    const carga = JSON.parse(new TextDecoder().decode(deBase64Url(cuerpo)));
    if (typeof carga?.expira !== "number" || ahoraMs > carga.expira) return null;
    return carga as CargaSilencio;
  } catch {
    // Base64 malformado, JSON roto: no cuela y no revienta.
    return null;
  }
}
```

- [x] **Paso 4: ejecutar y exigir cobertura total**

Ejecuta: `npx vitest run src/tests/alertas/firma.test.ts --coverage.enabled --coverage.include="src/lib/alertas/firma.ts" --coverage.thresholds.lines=100`
Esperado: PASA, 7 tests, al 100 %.

- [x] **Paso 5: commit**

```bash
git add src/lib/alertas/firma.ts src/tests/alertas/firma.test.ts
git commit -m "feat(atlas): enlaces de silenciar firmados con HMAC"
```

---

## Tarea 4: Suscripción push desde el navegador

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/acciones-push.ts`, `apps/atlas/src/components/ajustes/Dispositivos.tsx`, `apps/atlas/src/app/ajustes/notificaciones/page.tsx`
- Modificar: `apps/atlas/src/app/ajustes/page.tsx`
- Test: `apps/atlas/src/tests/componentes/dispositivos.test.tsx`

**Interfaces:**
- Consume: `clienteServidor`, `obtenerPerfil`.
- Produce:
  - `async function registrarDispositivo(sus: { endpoint: string; p256dh: string; auth: string; dispositivo: string | null }): Promise<Ok>`
  - `async function olvidarDispositivo(endpoint: string): Promise<Ok>`
  - componente `<Dispositivos suscritos={Suscrito[]} clavePublica={string} soportado={boolean} />`

- [x] **Paso 1: escribir el test que falla**

```tsx
// src/tests/componentes/dispositivos.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dispositivos } from "@/components/ajustes/Dispositivos";

const registrar = vi.fn(async (_s: unknown) => ({ ok: true }));
const olvidar = vi.fn(async (_e: unknown) => ({ ok: true }));
vi.mock("@/lib/db/acciones-push", () => ({
  registrarDispositivo: (s: unknown) => registrar(s),
  olvidarDispositivo: (e: unknown) => olvidar(e),
}));

const SUSCRITOS = [
  { endpoint: "https://push.ejemplo.test/abc", dispositivo: "Chrome en Windows" },
];

beforeEach(() => {
  registrar.mockClear();
  olvidar.mockClear();
});

describe("dispositivos para notificaciones", () => {
  it("enumera los dispositivos ya registrados", () => {
    render(<Dispositivos suscritos={SUSCRITOS} clavePublica="BKxx" soportado />);
    expect(screen.getByText("Chrome en Windows")).toBeInTheDocument();
  });

  it("sin ninguno, lo dice", () => {
    render(<Dispositivos suscritos={[]} clavePublica="BKxx" soportado />);
    expect(screen.getByText(/ning[úu]n dispositivo/i)).toBeInTheDocument();
  });

  it("olvidar un dispositivo lo retira", async () => {
    render(<Dispositivos suscritos={SUSCRITOS} clavePublica="BKxx" soportado />);
    await userEvent.click(screen.getByRole("button", { name: /olvidar/i }));
    expect(olvidar).toHaveBeenCalledWith("https://push.ejemplo.test/abc");
  });

  // En iOS el push solo existe si la app está en la pantalla de inicio. Decirlo
  // es la diferencia entre «no funciona» y «ya sé por qué no me llega».
  it("si no hay soporte, explica el caso de iOS y no ofrece activar", () => {
    render(<Dispositivos suscritos={[]} clavePublica="BKxx" soportado={false} />);
    expect(screen.getByText(/pantalla de inicio/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /activar/i })).not.toBeInTheDocument();
  });

  it("con soporte, ofrece activarlas", () => {
    render(<Dispositivos suscritos={[]} clavePublica="BKxx" soportado />);
    expect(screen.getByRole("button", { name: /activar/i })).toBeInTheDocument();
  });
});
```

- [x] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/componentes/dispositivos.test.tsx`
Esperado: FALLA por módulo no resuelto.

- [x] **Paso 3: la acción de servidor**

```ts
// src/lib/db/acciones-push.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";

export type Ok = { ok: true } | { ok: false; error: string };

const RUTA = "/ajustes/notificaciones";

export async function registrarDispositivo(sus: {
  endpoint: string;
  p256dh: string;
  auth: string;
  dispositivo: string | null;
}): Promise<Ok> {
  const sb = await clienteServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "No hay sesión." };

  // `endpoint` es único: si el navegador renueva la suscripción del mismo
  // dispositivo, se actualiza en vez de acumular filas muertas.
  const { error } = await sb.from("suscripciones_push").upsert(
    {
      usuario_id: user.id,
      endpoint: sus.endpoint,
      p256dh: sus.p256dh,
      auth: sus.auth,
      dispositivo: sus.dispositivo,
    },
    { onConflict: "endpoint" }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(RUTA);
  return { ok: true };
}

export async function olvidarDispositivo(endpoint: string): Promise<Ok> {
  const sb = await clienteServidor();
  const { error } = await sb.from("suscripciones_push").delete().eq("endpoint", endpoint);
  if (error) return { ok: false, error: error.message };

  revalidatePath(RUTA);
  return { ok: true };
}
```

- [x] **Paso 4: el componente**

```tsx
// src/components/ajustes/Dispositivos.tsx
"use client";
import { useState, useTransition } from "react";
import { BellRing, Smartphone } from "lucide-react";
import { registrarDispositivo, olvidarDispositivo } from "@/lib/db/acciones-push";

export type Suscrito = { endpoint: string; dispositivo: string | null };

/** La clave VAPID pública viaja en base64url y el navegador la quiere en bytes. */
function aBytes(base64url: string): Uint8Array {
  const normal = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

export function Dispositivos({
  suscritos,
  clavePublica,
  soportado,
}: {
  suscritos: Suscrito[];
  clavePublica: string;
  soportado: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function activar() {
    setError(null);
    empezar(async () => {
      try {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") {
          setError("El navegador ha denegado el permiso.");
          return;
        }
        const registro = await navigator.serviceWorker.ready;
        const sus = await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: aBytes(clavePublica),
        });
        const json = sus.toJSON();
        const r = await registrarDispositivo({
          endpoint: sus.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          dispositivo: navigator.userAgent.slice(0, 120),
        });
        if (!r.ok) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function olvidar(endpoint: string) {
    setError(null);
    empezar(async () => {
      const r = await olvidarDispositivo(endpoint);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {!soportado ? (
        <div className="cristal flex items-start gap-3 p-3 text-sm">
          <Smartphone size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p style={{ color: "var(--texto-tenue)" }}>
            Este navegador no admite notificaciones push. En iPhone y iPad solo
            funcionan si añades Atlas a la <strong>pantalla de inicio</strong>:
            pulsa Compartir y luego «Añadir a inicio». Es una limitación de Apple,
            no de Atlas.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={activar}
          disabled={pendiente}
          className="cristal-denso inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <BellRing size={15} aria-hidden="true" />
          {pendiente ? "Activando…" : "Activar en este dispositivo"}
        </button>
      )}

      <div className="cristal cristal-denso overflow-hidden">
        {suscritos.length === 0 ? (
          <p className="p-6 text-center text-sm" style={{ color: "var(--texto-tenue)" }}>
            No hay ningún dispositivo registrado.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
            {suscritos.map((s) => (
              <li key={s.endpoint} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="flex-1 truncate">
                  {s.dispositivo ?? "Dispositivo sin nombre"}
                </span>
                <button
                  type="button"
                  onClick={() => olvidar(s.endpoint)}
                  disabled={pendiente}
                  className="rounded-lg px-2 py-1 text-xs opacity-70 hover:opacity-100 disabled:opacity-30"
                >
                  Olvidar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
```

- [x] **Paso 5: la pantalla**

```tsx
// src/app/ajustes/notificaciones/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { Dispositivos } from "@/components/ajustes/Dispositivos";

export default async function PaginaNotificaciones() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil) redirect("/login");

  const { data } = await sb
    .from("suscripciones_push")
    .select("endpoint, dispositivo")
    .eq("usuario_id", perfil.id);

  // La pública es pública: su cometido es viajar al navegador. La privada vive
  // en el entorno de la Edge Function y no aparece por aquí.
  const clavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLICA ?? "";

  return (
    <section className="max-w-3xl space-y-4">
      <header>
        <Link
          href="/ajustes"
          className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          Ajustes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Notificaciones</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Cada dispositivo se registra por separado. Recibirás avisos de los
          proyectos a los que tengas acceso.
        </p>
      </header>

      <Dispositivos
        suscritos={data ?? []}
        clavePublica={clavePublica}
        soportado={clavePublica !== ""}
      />
    </section>
  );
}
```

Y añade la entrada a `SECCIONES` en `src/app/ajustes/page.tsx`, con `BellRing` importado de `lucide-react`:

```tsx
{
  href: "/ajustes/notificaciones",
  titulo: "Notificaciones",
  descripcion: "Dispositivos donde quieres recibir los avisos.",
  Icono: BellRing,
  soloPropietario: false,
},
```

- [x] **Paso 6: ejecutar, build y commit**

```bash
npm test && npm run typecheck && npm run build
git add src/lib/db/acciones-push.ts src/components/ajustes/Dispositivos.tsx src/app/ajustes src/tests
git commit -m "feat(atlas): registro de dispositivos para push"
```

---

## Tarea 5: La Edge Function «avisar»

Recoge lo pendiente, agrupa, resuelve destinatarios y envía. Corre sobre **Deno**.

**Ficheros:**
- Crear: `apps/atlas/supabase/functions/avisar/index.ts`, `apps/atlas/supabase/functions/avisar/enviar.ts`
- Copiar: `apps/atlas/supabase/functions/avisar/agrupar.ts`, `apps/atlas/supabase/functions/avisar/firma.ts`
- Crear: `apps/atlas/supabase/migrations/20260816100000_avisar.sql`
- Modificar: `apps/atlas/src/tests/vigia/copias.test.ts`
- Test: `apps/atlas/src/tests/avisar/enviar.test.ts`

**Interfaces:**
- Consume: `agrupar` (Tarea 1), `firmar` (Tarea 3), tablas `incidencias`, `suscripciones_push`, `notificaciones`.
- Produce:
  - `type AvisoEnviable = { titulo: string; cuerpo: string; url: string }`
  - `async function enviarPush(sus, aviso, claves): Promise<{ ok: boolean; error: string | null; caducada: boolean }>`
  - `async function enviarEmail(destino, aviso, apiKey, buscar): Promise<{ ok: boolean; error: string | null }>`

- [x] **Paso 1: escribir el test que falla**

```ts
// src/tests/avisar/enviar.test.ts
import { describe, it, expect } from "vitest";
import {
  enviarEmail,
  type AvisoEnviable,
} from "../../../supabase/functions/avisar/enviar";

const aviso: AvisoEnviable = {
  titulo: "Recepcionista Sara: Agente Retell caído",
  cuerpo: "HTTP 500",
  url: "https://atlas.hat3x.test/proyectos/recepcionista-sara",
};

describe("envío de correo", () => {
  it("manda el aviso y devuelve ok", async () => {
    let visto: { url?: string; cuerpo?: Record<string, unknown> } = {};
    const falso: typeof fetch = async (url, init) => {
      visto = { url: String(url), cuerpo: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ id: "e1" }), { status: 200 });
    };
    const r = await enviarEmail("jose@ejemplo.test", aviso, "re_prueba", falso);
    expect(r.ok).toBe(true);
    expect(visto.url).toContain("resend.com");
    expect(visto.cuerpo?.subject).toBe(aviso.titulo);
  });

  it("un rechazo del proveedor se recoge, no revienta", async () => {
    const falso: typeof fetch = async () =>
      new Response(JSON.stringify({ message: "clave no válida" }), { status: 401 });
    const r = await enviarEmail("jose@ejemplo.test", aviso, "re_mala", falso);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("401");
  });

  it("un fallo de red también", async () => {
    const falso: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const r = await enviarEmail("jose@ejemplo.test", aviso, "re_prueba", falso);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("fetch failed");
  });

  it("el cuerpo del correo lleva el enlace: sin él, el aviso no sirve de nada", async () => {
    let cuerpo: Record<string, unknown> = {};
    const falso: typeof fetch = async (_url, init) => {
      cuerpo = JSON.parse(String(init?.body));
      return new Response("{}", { status: 200 });
    };
    await enviarEmail("jose@ejemplo.test", aviso, "re_prueba", falso);
    expect(String(cuerpo.text)).toContain(aviso.url);
  });
});
```

- [x] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/avisar/enviar.test.ts`
Esperado: FALLA por módulo no resuelto.

- [x] **Paso 3: copiar la lógica compartida**

```bash
for f in agrupar firma; do
  { printf '// COPIA de src/lib/alertas/%s.ts — NO editar aquí.\n// Si cambias el original, vuelve a copiarlo.\n// El test copias.test.ts falla si divergen.\n' "$f"; \
    cat "src/lib/alertas/$f.ts"; } > "supabase/functions/avisar/$f.ts"
done
```

Ambos módulos deben tener **cero imports**, o no servirán en Deno. El test del paso 6 lo comprueba.

- [x] **Paso 4: implementar el envío**

```ts
// supabase/functions/avisar/enviar.ts
//
// Lo único de este bloque que toca el mundo. `enviarEmail` recibe `fetch` como
// parámetro para poder probarlo sin red, igual que `comprobar.ts` en el plan 1B.
import webpush from "npm:web-push@3.6.7";

export type AvisoEnviable = {
  titulo: string;
  cuerpo: string;
  url: string;
};

export type Suscripcion = { endpoint: string; p256dh: string; auth: string };

export type ClavesVapid = { publica: string; privada: string; contacto: string };

export async function enviarPush(
  sus: Suscripcion,
  aviso: AvisoEnviable,
  claves: ClavesVapid
): Promise<{ ok: boolean; error: string | null; caducada: boolean }> {
  webpush.setVapidDetails(claves.contacto, claves.publica, claves.privada);
  try {
    await webpush.sendNotification(
      { endpoint: sus.endpoint, keys: { p256dh: sus.p256dh, auth: sus.auth } },
      JSON.stringify(aviso)
    );
    return { ok: true, error: null, caducada: false };
  } catch (e: unknown) {
    // 404 y 410 significan que el navegador tiró la suscripción. No es un fallo
    // pasajero: hay que borrarla o se reintentará para siempre.
    const codigo = (e as { statusCode?: number }).statusCode;
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      caducada: codigo === 404 || codigo === 410,
    };
  }
}

export async function enviarEmail(
  destino: string,
  aviso: AvisoEnviable,
  apiKey: string,
  buscar: typeof fetch
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const respuesta = await buscar("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Atlas <atlas@hat3x.com>",
        to: destino,
        subject: aviso.titulo,
        text: `${aviso.cuerpo}\n\n${aviso.url}`,
      }),
    });
    if (!respuesta.ok) return { ok: false, error: `HTTP ${respuesta.status}` };
    return { ok: true, error: null };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [x] **Paso 5: la función**

```ts
// supabase/functions/avisar/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { agrupar, type SucesoAviso } from "./agrupar.ts";
import { enviarPush, enviarEmail } from "./enviar.ts";

const VENTANA_MS = 2 * 60 * 1000;

Deno.serve(async (peticion: Request) => {
  const autorizacion = peticion.headers.get("Authorization");
  if (autorizacion !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("No autorizado", { status: 401 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const ahora = new Date().toISOString();

  // Pendientes de notificar. `notificada_en` es el candado contra el doble
  // envío si pg_net reintenta.
  const { data: pendientes, error } = await sb
    .from("incidencias")
    .select(
      `id, abierta_en, cerrada_en, causa, silenciada_hasta,
       servicios!inner(nombre, proyectos!inner(id, nombre, slug))`
    )
    .is("notificada_en", null)
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Silenciadas: se sellan para que no vuelvan, pero NO se envían. Lo que se
  // calla es el aviso, nunca el registro.
  const enviables = (pendientes ?? []).filter(
    (i) => !i.silenciada_hasta || i.silenciada_hasta <= ahora
  );

  const sucesos: SucesoAviso[] = enviables.map((i) => ({
    incidenciaId: i.id,
    proyectoId: i.servicios.proyectos.id,
    proyectoNombre: i.servicios.proyectos.nombre,
    servicioNombre: i.servicios.nombre,
    tipo: i.cerrada_en ? "recuperacion" : "apertura",
    abiertaEn: i.cerrada_en ?? i.abierta_en,
    causa: i.causa,
  }));

  const avisos = agrupar(sucesos, VENTANA_MS);
  let enviadas = 0;
  for (const aviso of avisos) enviadas += await repartir(sb, aviso, ahora);

  // Todas las pendientes quedan selladas, enviadas o no.
  const ids = (pendientes ?? []).map((i) => i.id);
  if (ids.length > 0) {
    await sb.from("incidencias").update({ notificada_en: ahora }).in("id", ids);
  }

  return Response.json({ avisos: avisos.length, notificaciones: enviadas });
});
```

`repartir()` resuelve destinatarios con `quienRecibe`, firma el enlace de silenciar con `firmar`, envía por los dos canales y **registra cada intento en `notificaciones`**, incluidos los fallos. Sigue el mismo patrón que `procesar()` en `vigia/index.ts`: consultas en paralelo, errores recogidos y nunca lanzados. Cuando `enviarPush` devuelve `caducada: true`, borra esa fila de `suscripciones_push`: no es un fallo pasajero.

- [x] **Paso 6: ampliar el test de copias**

En `src/tests/vigia/copias.test.ts`, cambia la tabla de casos para cubrir las cuatro copias:

```ts
describe.each([
  ["vigia", "incidencias", "maquina"],
  ["vigia", "incidencias", "evaluar"],
  ["avisar", "alertas", "agrupar"],
  ["avisar", "alertas", "firma"],
])("copia de %s/%s.ts para Deno", (funcion, carpeta, nombre) => {
  const original = leer(`src/lib/${carpeta}/${nombre}.ts`);
  const copia = leer(`supabase/functions/${funcion}/${nombre}.ts`);
  // …los tres `it` de siempre
});
```

- [x] **Paso 7: programar la tarea**

```sql
-- supabase/migrations/20260816100000_avisar.sql
create or replace function atlas_disparar_avisos() returns void
language plpgsql security definer set search_path = public as $$
declare
  url   text := current_setting('app.atlas_funciones_url', true);
  clave text := current_setting('app.atlas_service_key', true);
begin
  if url is null or clave is null then
    raise warning 'atlas: faltan los ajustes; no se disparan los avisos';
    return;
  end if;
  if not exists (select 1 from incidencias where notificada_en is null) then
    return;
  end if;
  perform net.http_post(
    url     := url || '/avisar',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer ' || clave),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000);
end $$;

select cron.schedule('atlas-avisos', '* * * * *', $$select atlas_disparar_avisos()$$);
```

Aplícala con `npx supabase migration up --local`. **No uses `db reset`.**

- [x] **Paso 8: comprobar de punta a punta**

No basta con el caso vacío. Da de alta un check que falle, deja que `vigia` abra la incidencia, invoca `avisar` y comprueba en la base que hay filas en `notificaciones` y que `incidencias.notificada_en` quedó sellada. **Repite la invocación: no debe enviarse nada la segunda vez.**

- [x] **Paso 9: commit**

```bash
git add supabase/functions/avisar supabase/migrations src/tests
git commit -m "feat(atlas): Edge Function avisar — push y correo agrupados"
```

---

## Tarea 6: Silenciar desde la notificación

**Ficheros:**
- Crear: `apps/atlas/src/app/api/silenciar/route.ts`
- Test: `apps/atlas/src/tests/api/silenciar.test.ts`

**Interfaces:**
- Consume: `verificar` (Tarea 3).
- Produce: `GET /api/silenciar?t=<token>` → escribe `incidencias.silenciada_hasta` y devuelve una página de confirmación.

Puntos que el implementador no debe pasar por alto, y que el test debe cubrir:

- **Sin sesión**: se llega desde una notificación del sistema. La firma es la única autorización, y por eso caduca en 24 horas.
- **Escribe con `service_role`**, no con el cliente de sesión: no hay sesión que valga.
- **Idempotente**: pulsar dos veces el mismo enlace deja el mismo resultado.
- Un token inválido o caducado devuelve **410**, no 500 ni una traza.
- La respuesta es **HTML**, no JSON: la abre un navegador, no un programa.

- [x] **Commit**

```bash
git add src/app/api/silenciar src/tests/api
git commit -m "feat(atlas): silenciar una incidencia desde la notificacion"
```

---

## Tarea 7: Resumen — las tres vistas

La pantalla que abre Atlas. Hoy `src/app/page.tsx` es un marcador de posición.

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/resumen.ts`, `apps/atlas/src/components/resumen/Conmutador.tsx`, `SalaDeControl.tsx`, `VistaLista.tsx`, `VistaOficina.tsx`
- Crear: `apps/atlas/supabase/migrations/20260816100100_vista_resumen.sql`
- Modificar: `apps/atlas/src/app/page.tsx`
- Test: `apps/atlas/src/tests/db/resumen.test.ts`, `apps/atlas/src/tests/componentes/resumen.test.tsx`

**Interfaces:**
- Consume: `estadoDeServicios` (1B), `formatearUptime`, `Distintivo`, `Portada`.
- Produce:
  - `type FilaResumen = { proyecto: ProyectoResumen; estado: EstadoCheck; serviciosOk: number; serviciosTotal: number; uptime30d: number | null; peorError: string | null; cuota: number | null }`
  - `function ordenarPorGravedad(filas: FilaResumen[]): FilaResumen[]`
  - `async function cargarResumen(sb: Sb): Promise<{ filas: FilaResumen[]; contadores: { proyectos: number; ok: number; degradados: number; caidos: number; uptimeMedio: number | null } }>`

Lo que no puede fallar, y por tanto lleva test propio:

- **Lo roto sube solo.** `ordenarPorGravedad` pone primero lo caído, luego lo degradado, luego lo desconocido, y lo que va bien al final. A igualdad de estado, por nombre. Es lógica pura y va al 100 %.
- **Los importes solo los ve el propietario**, igual que en el resto de la aplicación. El gating se resuelve en servidor y viaja como prop.
- **La vista elegida se recuerda por usuario**: columna nueva `perfiles.vista_resumen text not null default 'control' check (vista_resumen in ('control','lista','oficina'))`. Migración con su `GRANT`, como todas.
- El conmutador **no cambia de página**, cambia de representación: es estado de cliente, no una ruta distinta.
- **Ningún estado se comunica solo con color** (§8.6 del spec): cada semáforo lleva etiqueta o icono.

En la vista **Oficina**, este bloque construye solo el plano: cada sala es un proyecto y se pinta entera del color de su peor servicio. Los agentes moviéndose por las salas son del bloque 6.

- [x] **Commit**

```bash
git add src/lib/db/resumen.ts src/components/resumen src/app/page.tsx supabase/migrations src/tests
git commit -m "feat(atlas): resumen con sus tres vistas y conmutador"
```

---

## Tarea 8: Alertas — el historial

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/alertas.ts`, `apps/atlas/src/app/alertas/page.tsx`, `apps/atlas/src/components/alertas/FiltrosAlertas.tsx`
- Test: `apps/atlas/src/tests/db/alertas.test.ts`

Historial de incidencias con filtros por proyecto, cliente, severidad y rango de fechas, más lo que está silenciado ahora mismo. La barra lateral ya enlaza `/alertas` desde el plan 1A-2 y **hoy da 404**: esta tarea lo cierra.

Detalles con consecuencias:

- **Duración de cada incidencia**: `cerrada_en - abierta_en`, y «en curso» si sigue abierta. Es el dato que de verdad se mira.
- Las incidencias de proyectos sobre los que no tienes permiso **no aparecen**. Lo garantiza RLS; el test lo comprueba con un usuario editor, no suponiéndolo.
- Los filtros van en la URL (`?proyecto=…&severidad=…`), no en estado de cliente: un filtro que no se puede compartir por enlace es la mitad de útil.

- [x] **Commit**

```bash
git add src/lib/db/alertas.ts src/app/alertas src/components/alertas src/tests
git commit -m "feat(atlas): historial de alertas con filtros"
```

---

## Tarea 9: PWA

**Ficheros:**
- Crear: `apps/atlas/public/manifest.webmanifest`, `apps/atlas/public/sw.js`, `apps/atlas/src/components/marco/RegistrarSW.tsx`, iconos en `apps/atlas/public/iconos/`
- Modificar: `apps/atlas/src/app/layout.tsx`

Tres cosas y ninguna más:

1. **Manifest e iconos** para que se instale. `display: standalone`, `theme_color` tomado del token de la paleta por defecto.
2. **Service worker** que (a) recibe los eventos `push` y muestra la notificación con sus acciones de silenciar, (b) abre la URL correcta al pulsarla, y (c) cachea el último estado conocido para que la app abra y enseñe algo sin conexión.
3. **Instalación guiada en iOS**, donde añadir a la pantalla de inicio no es una comodidad sino el **requisito** para que exista el push.

El service worker es el único fichero del proyecto que no pasa por TypeScript ni por el bundler. Va en `public/` a propósito: un service worker tiene que servirse desde la raíz del sitio para poder controlar todas las rutas.

El contrato del evento `push` es **exactamente** `AvisoEnviable` — `{ titulo, cuerpo, url }`. Si cambia en `enviar.ts`, cambia aquí.

- [x] **Commit**

```bash
git add public src/components/marco/RegistrarSW.tsx src/app/layout.tsx
git commit -m "feat(atlas): PWA instalable con push y cache offline"
```

---

## Verificación de salida del plan 1C

Ejecutada el **2026-08-16**. Resultados reales anotados bajo cada punto.

- [x] **1. Toda la batería en verde**

Ejecuta: `npm test`
Esperado: los 291 tests de los planes anteriores más los de este, todos pasando.

→ **449 tests en 46 ficheros, todos en verde.**

- [x] **2. Cobertura**

Ejecuta: `npm run test:coverage`
Esperado: `src/lib/**` por encima del 80 %; `src/lib/alertas/**` al **100 %** de líneas y ramas, como `incidencias` y `uptime`.

→ **89,43 % de líneas y 91,02 % de funciones** en el conjunto. `alertas/**` al **100 %** en los cuatro módulos: `agrupar`, `firma`, `destinatarios` y `pendientes`.

- [x] **3. Las copias para Deno no divergen**

Ejecuta: `npx vitest run src/tests/vigia/copias.test.ts`
Esperado: PASA con las **cuatro** copias.

→ PASA con **cinco**: se añadió `pendientes.ts` al arreglar la recuperación. 15 tests.

- [x] **4. Ningún secreto llega al navegador**

```bash
npm run build
grep -rl "VAPID_PRIVADA\|RESEND_API_KEY\|ATLAS_MASTER_KEY\|ATLAS_FIRMA_KEY" .next/static && echo "FUGA" || echo "limpio"
```
Esperado: `limpio`. La VAPID **pública** sí puede aparecer: es su cometido.

→ `limpio`. Y se añadió la comprobación que faltaba: este `grep` busca los **nombres**, que es lo barato de comprobar y lo que menos importa. Se comprobó además que ninguno de los cuatro **valores** de `.env.local` aparece en los 11 ficheros de `.next/static`. También limpio.

- [x] **5. La prueba que de verdad importa**

Con un check apuntando a algo que puedas tirar a mano:

1. Tira el servicio y espera a que se abran las incidencias.
2. **Debe llegar una sola notificación al móvil**, aunque caigan varios servicios del mismo proyecto.
3. Púlsala: debe abrir la ficha del proyecto.
4. Usa la acción de silenciar 1 hora **desde la notificación**, sin abrir la app.
5. Levanta el servicio: debe llegar la recuperación.
6. Vuelve a invocar `avisar` a mano: **no debe llegar nada repetido**.

Si algo de esto falla, no está terminado, por muy verde que esté la batería.

→ **Este punto encontró cuatro fallos con la batería entera en verde.** Está detallado en «Desviaciones», pero el resumen es que el aviso de recuperación no llegaba nunca y el push no salía. Tras arreglarlo, el ciclo completo contra la base local y las Edge Functions reales:

| Paso | Resultado |
|---|---|
| Caída de 2 servicios del mismo proyecto → `vigia` | 2 incidencias abiertas |
| `avisar` | **1 aviso** agrupado, 1 push con `ok = true` |
| Servicio levantado → `vigia` | 2 incidencias cerradas |
| `avisar` | **1 aviso de recuperación**, 1 push con `ok = true` |
| `avisar` otra vez | `{avisos: 0, notificaciones: 0}` |
| Enlace firmado de silenciar, **sin sesión** | HTTP 200, `silenciada_hasta` grabado |
| El mismo enlace con un carácter cambiado | HTTP 410 |

Los pasos 2 y 3 —que la notificación *aparezca* en la pantalla y que al pulsarla abra la ficha— son los únicos que no se pueden automatizar: hay que verlos. El envío llegó a FCM con `ok = true` y `suscripciones_push.ultima_ok_en` quedó grabado, así que lo que falta por confirmar a ojo es el tramo del navegador.

El correo quedó registrado como `ok = false` con el motivo `«Correo sin configurar: falta RESEND_API_KEY»`, que es el comportamiento correcto y no un fallo: falta esa clave por dar de alta.

---

## Desviaciones durante la ejecución

Lo que el plan decía y no funcionaba, o no contemplaba. Anotado el **2026-08-16**.

### 1. Un candado no basta: la recuperación no llegaba nunca

**Qué decía el plan.** «`incidencias.notificada_en` es el candado.» La Tarea 5 lo implementaba con `.is("notificada_en", null)`.

**Qué pasaba.** Una incidencia avisa dos veces en su vida. Al abrirse, `avisar` la envía y sella `notificada_en`. Al cerrarse, la fila **sigue sellada**, así que la consulta de pendientes no vuelve a verla: el `tipo: i.cerrada_en ? "recuperacion" : "apertura"` que el propio plan escribía era código inalcanzable. La caída llegaba; el «ya funciona», nunca.

**Cómo se arregló.** Migración `20260816120000_sello_recuperacion.sql` con `recuperacion_notificada_en`, más un módulo nuevo, `src/lib/alertas/pendientes.ts`, que decide qué se envía y qué campo se sella. Al 100 % de líneas y ramas, sin imports, con su copia vigilada para Deno. La decisión estaba antes embebida en un filtro de PostgREST, donde ninguna prueba podía alcanzarla — que es precisamente por qué el fallo sobrevivió a 435 tests en verde.

Dos casos que el plan tampoco contemplaba y que el módulo ahora resuelve:

- Una incidencia que se abre y se cierra **entre dos pasadas** no debe avisar su recuperación: decir «ya funciona» de algo que nadie sabía roto desconcierta más que informar. Se sella y se calla.
- Una silenciada se sella igual aunque no se envíe. Lo que se calla es el aviso, nunca el registro.

### 2. Tres cosas que solo se ven ejecutando

- **`VAPID_PUBLICA` frente a `NEXT_PUBLIC_VAPID_PUBLICA`.** La Edge Function lee el nombre a secas; el navegador solo ve las variables con prefijo. Estaba solo la segunda, así que cada envío se registraba como «Push sin configurar». La clave pública tiene que estar **dos veces con el mismo valor**, y no pasa nada: no es un secreto.
- **`ATLAS_URL_PUBLICA` no existía.** El código cae a `http://localhost:3010` y el servidor escucha en el 3000: los enlaces de las notificaciones no abrían nada.
- **`suscripciones_push.ultima_ok_en` no se escribía jamás**, pese a existir para saber si una suscripción sigue viva.

`.env.example` tenía 4 de las 10 variables. Ahora están las diez, con el porqué de cada una.

### 3. El `matcher` del middleware se comía la PWA (Tarea 9)

Excluía `manifest.json`, pero el fichero se llama `manifest.webmanifest`; y `sw.js` no estaba excluido en absoluto. Sin sesión, el guardia respondía **307** a los dos, y el navegador recibía una redirección donde esperaba JSON o JavaScript: Atlas no se instalaba y no había push. Comprobado contra el servidor real, antes `307` y ahora `200` con sus tipos de contenido. Lo vigila `src/tests/pwa/instalable.test.ts`, que extrae el literal del `matcher` del fuente —Next exige que lo sea— y comprueba que las páginas entran y estos ficheros no.

### 4. Iconos generados, no traídos

El plan pedía «iconos en `public/iconos/`» sin decir de dónde. Se generan por cálculo con `scripts/iconos.mjs` (`npm run iconos`), sin dependencias: así se sabe qué hay dentro de cada byte y se pueden rehacer. Regenerarlos produce ficheros idénticos, comprobado por checksum.

### 5. Un `.env` a la vista de git

No es del plan, pero salió al commitear: `.gitignore` decía `.env*.local`, que **no** cubre `.env.local.bak`. Una copia del entorno —con la clave maestra, la de firma, la privada de VAPID y la `service_role`— aparecía en `git status` esperando a un `git add -A`. Nunca llegó a commitearse (`git log --all -- 'apps/atlas/.env*'` está vacío). Ahora es `.env*` con `!.env.example`.

---

## Autorrevisión del plan

**Cobertura del spec.** Implementa §7 completo (canales, qué se notifica, control del ruido, destinatarios), §8.2 completo (las tres vistas y el conmutador), §8.5 en su parte de Alertas y de notificaciones en Ajustes, y §8.7 completo (PWA). Con esto queda cerrado el **bloque 1** del mapa de §12.

**Lo que deliberadamente no lleva.** No hay motor de reglas configurable: el spec lo descarta en §7.2 y sigue siendo la decisión correcta — es un producto en sí mismo y no aporta nada hasta que existan conectores funcionales (bloque 3). El resumen diario opcional de §7.2 se deja fuera por la misma razón por la que el spec lo marca como opcional: es una tarea de cron más, trivial de añadir después, y no cambia ninguna decisión de diseño.

**Placeholders.** Las tareas 6 a 9 describen el comportamiento exigido y los ficheros, pero no traen el código completo, a diferencia de las cinco primeras. Es deliberado y conviene saberlo antes de empezar: son pantallas cuyo diseño concreto se decide mejor viéndolas, y los planes anteriores demostraron que el código de interfaz escrito a ciegas se acaba reescribiendo igual. **Lo que sí está cerrado en ellas es lo que no se puede improvisar**: el orden por gravedad, el gating de importes, la idempotencia del enlace de silenciar, el código 410, y el contrato del evento `push`.

**Consistencia de tipos.** `Ok` mantiene la forma de los planes anteriores. `EstadoCheck` viene siempre de `@/lib/incidencias/maquina`. `AvisoEnviable` es el contrato entre `index.ts` y `enviar.ts` y es también, palabra por palabra, lo que el service worker recibe en el evento `push`: si cambia uno, cambian los tres.

**Dependencias entre tareas.** 1, 2 y 3 son independientes entre sí y no dependen de nada. 4 necesita la clave pública de 3 pero puede escribirse antes. 5 necesita 1, 2 y 3. 6 necesita 3. 7 y 8 no dependen de las alertas y podrían ir primero si se quiere ver algo en pantalla antes. 9 debe ir después de 4, porque el service worker es lo que recibe el push.

**Una decisión que conviene revisar al ejecutar.** La ventana de agrupación son 2 minutos fijos, del spec. Con `intervalo_s` por defecto en 300, dos servicios del mismo proyecto que caigan en comprobaciones distintas pueden quedar fuera de la ventana y generar dos avisos. Si al usarlo resulta molesto, la ventana debería pasar a ser algo más larga que el intervalo de comprobación más frecuente — pero conviene medirlo antes de tocarlo, no suponerlo.
