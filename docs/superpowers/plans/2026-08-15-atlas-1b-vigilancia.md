# Atlas 1B — Motor de vigilancia · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** que Atlas vigile de verdad. Al terminar, comprueba solo cada pocos minutos si los servicios responden, guarda el histórico, abre y cierra incidencias sin generar ruido, y calcula uptime real. **Todavía no avisa a nadie** — eso es el plan 1C.

**Requisito previo:** los planes [`1A · Cimientos`](./2026-08-15-atlas-1a-cimientos.md) y [`1A-2 · Gestión`](./2026-08-15-atlas-1a2-gestion.md) terminados y con sus comprobaciones de salida en verde.

**Arquitectura:** `pg_cron` dispara cada minuto dentro de Supabase, selecciona los checks que ya tocan y llama por `pg_net` a una Edge Function que ejecuta las comprobaciones en paralelo. La decisión de qué estado corresponde a cada resultado es **lógica pura, sin red y sin reloj del sistema**, así que se prueba exhaustivamente y barata.

**Stack:** el de los planes anteriores, más Edge Functions de Supabase (Deno) y las extensiones `pg_cron` y `pg_net`.

**Spec:** [`docs/superpowers/specs/2026-08-15-atlas-nucleo-monitorizacion-alertas-design.md`](../specs/2026-08-15-atlas-nucleo-monitorizacion-alertas-design.md) — secciones §4.4 y §6.

## Restricciones globales

Aplican las mismas de los planes 1A y 1A-2. Las propias de este:

- **Ninguna función de decisión lee la hora del sistema.** El instante se inyecta como parámetro. Es lo que hace que la máquina de estados sea probable de verdad, y no a base de esperas.
- **La lógica de decisión vive en `src/lib/incidencias` y no importa nada de Supabase.** La Edge Function la reutiliza; si tuviera dependencias de Node, no podría.
- **El histórico nunca miente.** Lo que se silencia es el aviso, no el registro: un fallo dentro de una ventana de mantenimiento se guarda igual en `check_resultados`.
- **La Edge Function corre sobre Deno**, no Node. Nada de `node:crypto`; las variables de entorno se leen con `Deno.env.get`, y los imports son por URL o por JSR.

## Interfaces heredadas

Del esquema (plan 1A, Tarea 5): `servicios`, `checks`, `check_resultados`, `check_agregados`, `incidencias`, `ventanas_mantenimiento`.
De la interfaz (plan 1A-2, Tarea 12): `ServicioResumen` y la ficha de proyecto, que la Tarea 7 amplía.

---

## Tarea 1: La máquina de estados

**La pieza más importante de todo el bloque 1.** Decide si un resultado abre incidencia, la cierra, o no hace nada. Un error aquí significa o bien que no te enteras de una caída, o bien que Atlas te despierta por un parpadeo de red.

Es lógica pura: sin red, sin base de datos, sin `Date.now()`.

**Ficheros:**
- Crear: `apps/atlas/src/lib/incidencias/maquina.ts`
- Test: `apps/atlas/src/tests/incidencias/maquina.test.ts`

**Interfaces:**
- Consume: nada.
- Produce:
  - `type EstadoCheck = "ok" | "degradado" | "caido" | "desconocido"`
  - `type ResultadoCheck = { ok: boolean; latenciaMs: number | null; statusCode: number | null; error: string | null }`
  - `type Contexto = { estadoActual: EstadoCheck; fallosConsecutivos: number; umbralFallos: number; umbralLatenciaMs: number | null; incidenciaAbierta: boolean; silenciado: boolean; notifica: boolean }`
  - `type Transicion = { estadoNuevo: EstadoCheck; fallosConsecutivos: number; abrirIncidencia: boolean; cerrarIncidencia: boolean; notificar: "apertura" | "recuperacion" | null }`
  - `function transicion(resultado: ResultadoCheck, ctx: Contexto): Transicion`

**Una decisión de diseño que conviene entender antes de leer el código.** El diagrama del spec §6.3 dibuja un estado intermedio «fallando» que **no se persiste**: los únicos estados que existen en la base son `ok`, `degradado`, `caido` y `desconocido`. Un check que ha fallado una o dos veces pero no ha alcanzado el umbral se representa como **`degradado`**, que es exactamente lo que significa: algo no va del todo bien, pero no es para despertarte. Así `degradado` cubre los dos casos —responde lento, o está fallando sin llegar al umbral— y la pantalla nunca miente diciendo «operativo» sobre un servicio que lleva dos fallos seguidos.

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/incidencias/maquina.test.ts
import { describe, it, expect } from "vitest";
import { transicion, type Contexto, type ResultadoCheck } from "@/lib/incidencias/maquina";

const CORRECTO: ResultadoCheck =
  { ok: true, latenciaMs: 210, statusCode: 200, error: null };
const LENTO: ResultadoCheck =
  { ok: true, latenciaMs: 4200, statusCode: 200, error: null };
const FALLO: ResultadoCheck =
  { ok: false, latenciaMs: null, statusCode: 500, error: "HTTP 500" };

function ctx(parcial: Partial<Contexto> = {}): Contexto {
  return {
    estadoActual: "ok",
    fallosConsecutivos: 0,
    umbralFallos: 3,
    umbralLatenciaMs: 2000,
    incidenciaAbierta: false,
    silenciado: false,
    notifica: true,
    ...parcial,
  };
}

describe("máquina de estados — funcionamiento normal", () => {
  it("todo bien y rápido se queda en ok, sin hacer nada", () => {
    expect(transicion(CORRECTO, ctx())).toEqual({
      estadoNuevo: "ok", fallosConsecutivos: 0,
      abrirIncidencia: false, cerrarIncidencia: false, notificar: null,
    });
  });

  it("responde bien pero lento: degradado, y NO despierta a nadie", () => {
    const t = transicion(LENTO, ctx());
    expect(t.estadoNuevo).toBe("degradado");
    expect(t.abrirIncidencia).toBe(false);
    expect(t.notificar).toBeNull();
  });

  it("sin umbral de latencia configurado, la lentitud no importa", () => {
    const t = transicion(LENTO, ctx({ umbralLatenciaMs: null }));
    expect(t.estadoNuevo).toBe("ok");
  });
});

describe("máquina de estados — la caída", () => {
  it("un fallo aislado NO abre incidencia: las redes parpadean", () => {
    const t = transicion(FALLO, ctx());
    expect(t.estadoNuevo).toBe("degradado");
    expect(t.fallosConsecutivos).toBe(1);
    expect(t.abrirIncidencia).toBe(false);
    expect(t.notificar).toBeNull();
  });

  it("el segundo fallo tampoco, con umbral 3", () => {
    const t = transicion(FALLO, ctx({ estadoActual: "degradado", fallosConsecutivos: 1 }));
    expect(t.estadoNuevo).toBe("degradado");
    expect(t.fallosConsecutivos).toBe(2);
    expect(t.abrirIncidencia).toBe(false);
  });

  it("el tercero SÍ: abre incidencia y avisa", () => {
    const t = transicion(FALLO, ctx({ estadoActual: "degradado", fallosConsecutivos: 2 }));
    expect(t).toEqual({
      estadoNuevo: "caido", fallosConsecutivos: 3,
      abrirIncidencia: true, cerrarIncidencia: false, notificar: "apertura",
    });
  });

  it("con umbral 1, el primer fallo ya abre", () => {
    const t = transicion(FALLO, ctx({ umbralFallos: 1 }));
    expect(t.abrirIncidencia).toBe(true);
    expect(t.notificar).toBe("apertura");
  });

  it("seguir caído no vuelve a abrir ni a avisar", () => {
    const t = transicion(FALLO, ctx({
      estadoActual: "caido", fallosConsecutivos: 3, incidenciaAbierta: true,
    }));
    expect(t.estadoNuevo).toBe("caido");
    expect(t.fallosConsecutivos).toBe(4);
    expect(t.abrirIncidencia).toBe(false);
    expect(t.notificar).toBeNull();
  });
});

describe("máquina de estados — la recuperación", () => {
  it("volver a responder cierra la incidencia y avisa", () => {
    const t = transicion(CORRECTO, ctx({
      estadoActual: "caido", fallosConsecutivos: 5, incidenciaAbierta: true,
    }));
    expect(t).toEqual({
      estadoNuevo: "ok", fallosConsecutivos: 0,
      abrirIncidencia: false, cerrarIncidencia: true, notificar: "recuperacion",
    });
  });

  it("recuperarse lento deja el estado en degradado, pero cierra igual", () => {
    const t = transicion(LENTO, ctx({
      estadoActual: "caido", fallosConsecutivos: 5, incidenciaAbierta: true,
    }));
    expect(t.estadoNuevo).toBe("degradado");
    expect(t.cerrarIncidencia).toBe(true);
    expect(t.notificar).toBe("recuperacion");
  });

  it("recuperarse de un bache sin incidencia abierta no avisa de nada", () => {
    const t = transicion(CORRECTO, ctx({
      estadoActual: "degradado", fallosConsecutivos: 2, incidenciaAbierta: false,
    }));
    expect(t.estadoNuevo).toBe("ok");
    expect(t.fallosConsecutivos).toBe(0);
    expect(t.cerrarIncidencia).toBe(false);
    expect(t.notificar).toBeNull();
  });
});

describe("máquina de estados — silencios", () => {
  it("silenciado: la incidencia se abre igual, pero NO se avisa", () => {
    const t = transicion(FALLO, ctx({
      estadoActual: "degradado", fallosConsecutivos: 2, silenciado: true,
    }));
    // El histórico nunca miente: lo que se silencia es el aviso.
    expect(t.abrirIncidencia).toBe(true);
    expect(t.estadoNuevo).toBe("caido");
    expect(t.notificar).toBeNull();
  });

  it("silenciado: la recuperación tampoco avisa", () => {
    const t = transicion(CORRECTO, ctx({
      estadoActual: "caido", fallosConsecutivos: 3,
      incidenciaAbierta: true, silenciado: true,
    }));
    expect(t.cerrarIncidencia).toBe(true);
    expect(t.notificar).toBeNull();
  });

  it("con notifica=false el check vigila y pinta, pero jamás avisa", () => {
    const t = transicion(FALLO, ctx({
      estadoActual: "degradado", fallosConsecutivos: 2, notifica: false,
    }));
    expect(t.abrirIncidencia).toBe(true);
    expect(t.notificar).toBeNull();
  });
});

describe("máquina de estados — primer contacto", () => {
  it("desde desconocido, un resultado correcto pasa a ok", () => {
    const t = transicion(CORRECTO, ctx({ estadoActual: "desconocido" }));
    expect(t.estadoNuevo).toBe("ok");
  });

  it("desde desconocido, un fallo empieza a contar sin abrir nada", () => {
    const t = transicion(FALLO, ctx({ estadoActual: "desconocido" }));
    expect(t.estadoNuevo).toBe("degradado");
    expect(t.fallosConsecutivos).toBe(1);
    expect(t.abrirIncidencia).toBe(false);
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/incidencias/maquina.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/incidencias/maquina"».

- [ ] **Paso 3: implementar**

```ts
// src/lib/incidencias/maquina.ts
//
// Decide qué hacer con el resultado de un check. Lógica pura: sin red, sin base
// de datos, sin reloj del sistema. Es lo que hace que Atlas sea útil en lugar de
// insoportable, así que es también lo más probado del proyecto.

export type EstadoCheck = "ok" | "degradado" | "caido" | "desconocido";

export type ResultadoCheck = {
  ok: boolean;
  latenciaMs: number | null;
  statusCode: number | null;
  error: string | null;
};

export type Contexto = {
  estadoActual: EstadoCheck;
  fallosConsecutivos: number;
  /** Fallos seguidos necesarios para dar el servicio por caído. */
  umbralFallos: number;
  /** Por encima de esta latencia se considera degradado. null = no se mira. */
  umbralLatenciaMs: number | null;
  incidenciaAbierta: boolean;
  /** Ventana de mantenimiento activa o incidencia silenciada. */
  silenciado: boolean;
  /** Ajuste del propio check: si es false, nunca notifica. */
  notifica: boolean;
};

export type Transicion = {
  estadoNuevo: EstadoCheck;
  fallosConsecutivos: number;
  abrirIncidencia: boolean;
  cerrarIncidencia: boolean;
  notificar: "apertura" | "recuperacion" | null;
};

export function transicion(
  resultado: ResultadoCheck,
  ctx: Contexto
): Transicion {
  // Silenciado o con las notificaciones apagadas: todo se registra igual, pero
  // no sale ningún aviso. El histórico nunca miente.
  const puedeAvisar = ctx.notifica && !ctx.silenciado;

  if (resultado.ok) {
    const lento =
      ctx.umbralLatenciaMs !== null &&
      resultado.latenciaMs !== null &&
      resultado.latenciaMs > ctx.umbralLatenciaMs;

    const cerrar = ctx.incidenciaAbierta;
    return {
      estadoNuevo: lento ? "degradado" : "ok",
      fallosConsecutivos: 0,
      abrirIncidencia: false,
      cerrarIncidencia: cerrar,
      notificar: cerrar && puedeAvisar ? "recuperacion" : null,
    };
  }

  const fallos = ctx.fallosConsecutivos + 1;
  const alcanzaUmbral = fallos >= ctx.umbralFallos;

  // Solo se abre cuando se cruza el umbral Y no había ya una incidencia viva.
  // Sin esta segunda condición, un servicio caído abriría una incidencia nueva
  // en cada comprobación.
  const abrir = alcanzaUmbral && !ctx.incidenciaAbierta;

  return {
    estadoNuevo: alcanzaUmbral ? "caido" : "degradado",
    fallosConsecutivos: fallos,
    abrirIncidencia: abrir,
    cerrarIncidencia: false,
    notificar: abrir && puedeAvisar ? "apertura" : null,
  };
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/incidencias/maquina.test.ts`
Esperado: PASA, 15 tests.

- [ ] **Paso 5: exigir cobertura total en este módulo**

Ejecuta: `npm run test:coverage`
Esperado: `src/lib/incidencias/maquina.ts` al **100 %** de líneas y ramas. Si no llega, falta un caso: esta función no admite ramas sin probar.

- [ ] **Paso 6: commit**

```bash
git add src/lib/incidencias src/tests/incidencias
git commit -m "feat(atlas): maquina de estados de incidencias"
```

---

## Tarea 2: Evaluación de respuestas HTTP

Distingue «el servidor contesta» de «la aplicación funciona». Lógica pura, separada del `fetch` para poder probar los casos sin levantar servidores.

**Ficheros:**
- Crear: `apps/atlas/src/lib/incidencias/evaluar.ts`
- Test: `apps/atlas/src/tests/incidencias/evaluar.test.ts`

**Interfaces:**
- Consume: nada.
- Produce:
  - `type Esperado = { esperaStatus: number[]; esperaTexto: string | null }`
  - `type Respuesta = { statusCode: number; cuerpo: string }`
  - `type Veredicto = { ok: boolean; error: string | null }`
  - `function evaluarHttp(respuesta: Respuesta, esperado: Esperado): Veredicto`
  - `function evaluarCaducidad(diasRestantes: number, umbralDias: number): Veredicto`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/incidencias/evaluar.test.ts
import { describe, it, expect } from "vitest";
import { evaluarHttp, evaluarCaducidad } from "@/lib/incidencias/evaluar";

describe("evaluación HTTP", () => {
  it("acepta el código esperado", () => {
    expect(evaluarHttp({ statusCode: 200, cuerpo: "" }, { esperaStatus: [200], esperaTexto: null }))
      .toEqual({ ok: true, error: null });
  });

  it("acepta cualquiera de los códigos de la lista", () => {
    const esperado = { esperaStatus: [200, 204, 301], esperaTexto: null };
    for (const statusCode of [200, 204, 301]) {
      expect(evaluarHttp({ statusCode, cuerpo: "" }, esperado).ok, String(statusCode)).toBe(true);
    }
  });

  it("rechaza un código fuera de la lista, diciendo cuál llegó", () => {
    const r = evaluarHttp({ statusCode: 500, cuerpo: "" }, { esperaStatus: [200], esperaTexto: null });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("HTTP 500 (se esperaba 200)");
  });

  it("una web rota puede devolver 200: por eso existe el texto esperado", () => {
    const r = evaluarHttp(
      { statusCode: 200, cuerpo: "<h1>Application error</h1>" },
      { esperaStatus: [200], esperaTexto: "Reservar cita" }
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe("La respuesta no contiene «Reservar cita»");
  });

  it("acepta cuando el texto esperado sí aparece", () => {
    expect(evaluarHttp(
      { statusCode: 200, cuerpo: "<button>Reservar cita</button>" },
      { esperaStatus: [200], esperaTexto: "Reservar cita" }
    )).toEqual({ ok: true, error: null });
  });

  it("el código manda sobre el texto: si el código falla, ese es el error", () => {
    const r = evaluarHttp(
      { statusCode: 503, cuerpo: "" },
      { esperaStatus: [200], esperaTexto: "Reservar cita" }
    );
    expect(r.error).toBe("HTTP 503 (se esperaba 200)");
  });

  it("sin lista de códigos esperados, acepta cualquier 2xx", () => {
    expect(evaluarHttp({ statusCode: 204, cuerpo: "" }, { esperaStatus: [], esperaTexto: null }).ok)
      .toBe(true);
    expect(evaluarHttp({ statusCode: 404, cuerpo: "" }, { esperaStatus: [], esperaTexto: null }).ok)
      .toBe(false);
  });
});

describe("evaluación de caducidad", () => {
  it("con margen de sobra está bien", () => {
    expect(evaluarCaducidad(214, 30)).toEqual({ ok: true, error: null });
  });

  it("por debajo del umbral avisa, diciendo cuántos días quedan", () => {
    const r = evaluarCaducidad(12, 30);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Caduca en 12 días");
  });

  it("justo en el umbral todavía está bien", () => {
    expect(evaluarCaducidad(30, 30).ok).toBe(true);
  });

  it("ya caducado lo dice, sin días negativos", () => {
    expect(evaluarCaducidad(0, 30).error).toBe("Ya ha caducado");
    expect(evaluarCaducidad(-5, 30).error).toBe("Ya ha caducado");
  });

  it("queda un solo día: singular", () => {
    expect(evaluarCaducidad(1, 30).error).toBe("Caduca en 1 día");
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/incidencias/evaluar.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/incidencias/evaluar"».

- [ ] **Paso 3: implementar**

```ts
// src/lib/incidencias/evaluar.ts
//
// Decide si una respuesta cuenta como buena. Separado del fetch a propósito:
// así se prueban todos los casos sin levantar ningún servidor.

export type Esperado = {
  esperaStatus: number[];
  esperaTexto: string | null;
};

export type Respuesta = {
  statusCode: number;
  cuerpo: string;
};

export type Veredicto = { ok: boolean; error: string | null };

export function evaluarHttp(respuesta: Respuesta, esperado: Esperado): Veredicto {
  const { statusCode, cuerpo } = respuesta;

  if (esperado.esperaStatus.length > 0) {
    if (!esperado.esperaStatus.includes(statusCode)) {
      return {
        ok: false,
        error: `HTTP ${statusCode} (se esperaba ${esperado.esperaStatus.join(" o ")})`,
      };
    }
  } else if (statusCode < 200 || statusCode >= 300) {
    return { ok: false, error: `HTTP ${statusCode} (se esperaba 2xx)` };
  }

  // El código correcto no basta: una aplicación rota devuelve 200 con una página
  // de error. Esto es lo que distingue «responde» de «funciona».
  if (esperado.esperaTexto !== null && !cuerpo.includes(esperado.esperaTexto)) {
    return { ok: false, error: `La respuesta no contiene «${esperado.esperaTexto}»` };
  }

  return { ok: true, error: null };
}

export function evaluarCaducidad(
  diasRestantes: number,
  umbralDias: number
): Veredicto {
  if (diasRestantes <= 0) return { ok: false, error: "Ya ha caducado" };
  if (diasRestantes >= umbralDias) return { ok: true, error: null };
  const plural = diasRestantes === 1 ? "día" : "días";
  return { ok: false, error: `Caduca en ${diasRestantes} ${plural}` };
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/incidencias/evaluar.test.ts`
Esperado: PASA, 12 tests.

- [ ] **Paso 5: commit**

```bash
git add src/lib/incidencias/evaluar.ts src/tests/incidencias/evaluar.test.ts
git commit -m "feat(atlas): evaluacion de respuestas HTTP y caducidades"
```

---

## Tarea 3: Cálculo de uptime

Combina el detalle reciente con los agregados antiguos. Lo delicado: **la cifra no puede cambiar cuando los datos se consolidan**. Si el uptime de 30 días salta al purgar el detalle, nadie volverá a fiarse del número.

**Ficheros:**
- Crear: `apps/atlas/src/lib/uptime/calcular.ts`
- Test: `apps/atlas/src/tests/uptime/calcular.test.ts`

**Interfaces:**
- Consume: nada.
- Produce:
  - `type Muestra = { ok: boolean }`
  - `type Agregado = { total: number; ok: number }`
  - `function calcularUptime(detalle: Muestra[], agregados: Agregado[]): number | null`
  - `function formatearUptime(porcentaje: number | null): string`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/uptime/calcular.test.ts
import { describe, it, expect } from "vitest";
import { calcularUptime, formatearUptime } from "@/lib/uptime/calcular";

describe("cálculo de uptime", () => {
  it("sin datos devuelve null, no 0 ni 100", () => {
    // Un servicio recién dado de alta no está «caído al 0 %» ni «perfecto»:
    // es que no se sabe. Mentir aquí destruye la confianza en la cifra.
    expect(calcularUptime([], [])).toBeNull();
  });

  it("todo correcto es 100", () => {
    expect(calcularUptime([{ ok: true }, { ok: true }], [])).toBe(100);
  });

  it("todo mal es 0", () => {
    expect(calcularUptime([{ ok: false }, { ok: false }], [])).toBe(0);
  });

  it("mezcla detalle y agregados en una sola cifra", () => {
    // 2 de 2 en detalle + 96 de 100 agregados = 98 de 102
    const r = calcularUptime([{ ok: true }, { ok: true }], [{ total: 100, ok: 96 }]);
    expect(r).toBeCloseTo(96.1, 1);
  });

  it("la cifra NO cambia al consolidar los mismos datos", () => {
    const detalle = [
      { ok: true }, { ok: true }, { ok: false }, { ok: true }, { ok: true },
      { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true },
    ];
    const antes = calcularUptime(detalle, []);
    // Los mismos diez resultados, ya consolidados en un agregado.
    const despues = calcularUptime([], [{ total: 10, ok: 9 }]);
    expect(despues).toBe(antes);
  });

  it("redondea a un decimal", () => {
    expect(calcularUptime([], [{ total: 1000, ok: 972 }])).toBe(97.2);
    expect(calcularUptime([], [{ total: 3, ok: 2 }])).toBe(66.7);
  });

  it("ignora agregados vacíos en lugar de dividir entre cero", () => {
    expect(calcularUptime([{ ok: true }], [{ total: 0, ok: 0 }])).toBe(100);
  });
});

describe("formato de uptime", () => {
  it("muestra el porcentaje con coma decimal, a la española", () => {
    expect(formatearUptime(97.2)).toBe("97,2 %");
  });

  it("el 100 se muestra entero, sin decimal inútil", () => {
    expect(formatearUptime(100)).toBe("100 %");
  });

  it("sin datos lo dice, en vez de inventarse un número", () => {
    expect(formatearUptime(null)).toBe("sin datos");
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/uptime/calcular.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/uptime/calcular"».

- [ ] **Paso 3: implementar**

```ts
// src/lib/uptime/calcular.ts

export type Muestra = { ok: boolean };
export type Agregado = { total: number; ok: number };

/**
 * Une el detalle reciente (7 días) con los agregados antiguos. La clave es que
 * ambos aportan al MISMO par de contadores: así la cifra no salta cuando la
 * tarea de retención consolida el detalle en agregados.
 *
 * Devuelve null cuando no hay ninguna muestra: un servicio recién dado de alta
 * no está al 0 % ni al 100 %, es que no se sabe.
 */
export function calcularUptime(
  detalle: Muestra[],
  agregados: Agregado[]
): number | null {
  let total = detalle.length;
  let correctos = detalle.filter((m) => m.ok).length;

  for (const a of agregados) {
    total += a.total;
    correctos += a.ok;
  }

  if (total === 0) return null;
  return Math.round((correctos / total) * 1000) / 10;
}

export function formatearUptime(porcentaje: number | null): string {
  if (porcentaje === null) return "sin datos";
  const texto = Number.isInteger(porcentaje)
    ? String(porcentaje)
    : porcentaje.toFixed(1).replace(".", ",");
  return `${texto} %`;
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/uptime/calcular.test.ts`
Esperado: PASA, 10 tests.

- [ ] **Paso 5: commit**

```bash
git add src/lib/uptime src/tests/uptime
git commit -m "feat(atlas): calculo de uptime estable ante la consolidacion"
```

---

## Tarea 4: La Edge Function «vigía»

Ejecuta las comprobaciones y aplica la máquina de estados. Corre sobre **Deno**, no Node.

**Ficheros:**
- Crear: `apps/atlas/supabase/functions/vigia/comprobar.ts`, `apps/atlas/supabase/functions/vigia/index.ts`
- Copiar: `apps/atlas/supabase/functions/vigia/maquina.ts`, `apps/atlas/supabase/functions/vigia/evaluar.ts`
- Test: `apps/atlas/src/tests/vigia/comprobar.test.ts`

**Interfaces:**
- Consume: `transicion` (Tarea 1), `evaluarHttp` (Tarea 2), tablas `checks`, `check_resultados`, `incidencias`, `ventanas_mantenimiento`.
- Produce:
  - `type DefinicionCheck = { id: string; servicioId: string; tipo: "http" | "ssl" | "dns" | "tcp"; url: string | null; metodo: string; cabeceras: Record<string, string> | null; cuerpo: string | null; esperaStatus: number[]; esperaTexto: string | null; timeoutMs: number }`
  - `async function comprobar(def: DefinicionCheck, buscar: typeof fetch): Promise<ResultadoCheck>`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/vigia/comprobar.test.ts
import { describe, it, expect } from "vitest";
import { comprobar, type DefinicionCheck } from "../../../supabase/functions/vigia/comprobar";

function def(parcial: Partial<DefinicionCheck> = {}): DefinicionCheck {
  return {
    id: "c1",
    servicioId: "s1",
    tipo: "http",
    url: "https://ejemplo.test/salud",
    metodo: "GET",
    cabeceras: null,
    cuerpo: null,
    esperaStatus: [200],
    esperaTexto: null,
    timeoutMs: 5000,
    ...parcial,
  };
}

describe("comprobación HTTP", () => {
  it("una respuesta correcta da ok, con su latencia", async () => {
    const falso: typeof fetch = async () => new Response("todo bien", { status: 200 });
    const r = await comprobar(def(), falso);
    expect(r.ok).toBe(true);
    expect(r.statusCode).toBe(200);
    expect(r.latenciaMs).toBeGreaterThanOrEqual(0);
    expect(r.error).toBeNull();
  });

  it("un 500 da fallo, con el código en el error", async () => {
    const falso: typeof fetch = async () => new Response("", { status: 500 });
    const r = await comprobar(def(), falso);
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(500);
    expect(r.error).toBe("HTTP 500 (se esperaba 200)");
  });

  it("un 200 sin el texto esperado también es fallo", async () => {
    const falso: typeof fetch = async () =>
      new Response("<h1>Application error</h1>", { status: 200 });
    const r = await comprobar(def({ esperaTexto: "Reservar cita" }), falso);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("La respuesta no contiene «Reservar cita»");
  });

  it("un fallo de red se recoge como error, no revienta", async () => {
    const falso: typeof fetch = async () => { throw new TypeError("fetch failed"); };
    const r = await comprobar(def(), falso);
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBeNull();
    expect(r.error).toContain("fetch failed");
  });

  it("un timeout se distingue de cualquier otro error", async () => {
    const falso: typeof fetch = async (_url, init) =>
      new Promise((_resolver, rechazar) => {
        init?.signal?.addEventListener("abort", () =>
          rechazar(new DOMException("The operation was aborted.", "AbortError"))
        );
      });
    const r = await comprobar(def({ timeoutMs: 50 }), falso);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Tiempo de espera agotado (50 ms)");
  });

  it("un check http sin URL es un error de configuración, no una caída", async () => {
    const falso: typeof fetch = async () => new Response("", { status: 200 });
    const r = await comprobar(def({ url: null }), falso);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("El check no tiene URL configurada");
  });

  it("envía el método y las cabeceras configurados", async () => {
    let visto: { metodo?: string; cabecera?: string | null } = {};
    const falso: typeof fetch = async (_url, init) => {
      visto = {
        metodo: init?.method,
        cabecera: new Headers(init?.headers).get("x-atlas"),
      };
      return new Response("", { status: 200 });
    };
    await comprobar(def({ metodo: "POST", cabeceras: { "x-atlas": "1" } }), falso);
    expect(visto.metodo).toBe("POST");
    expect(visto.cabecera).toBe("1");
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/vigia/comprobar.test.ts`
Esperado: FALLA con módulo no resuelto.

- [ ] **Paso 3: copiar la lógica compartida a la carpeta de la función**

La Edge Function no puede importar de `src/lib`: Deno no resuelve el alias `@/` de Next, y el despliegue solo sube `supabase/functions`.

```bash
cp src/lib/incidencias/maquina.ts  supabase/functions/vigia/maquina.ts
cp src/lib/incidencias/evaluar.ts  supabase/functions/vigia/evaluar.ts
```

Añade a **cada copia** exactamente estas tres líneas al principio:

```ts
// COPIA de src/lib/incidencias/<fichero>.ts — NO editar aquí.
// Si cambias el original, vuelve a copiarlo.
// La comprobación de salida nº 3 verifica que no diverjan.
```

- [ ] **Paso 4: implementar la comprobación**

```ts
// supabase/functions/vigia/comprobar.ts
//
// Ejecuta un check. Recibe `fetch` como parámetro para poder probarlo sin red.
// Sin dependencias de Node ni de Deno: código estándar que corre en ambos.

import { evaluarHttp } from "./evaluar.ts";

export type ResultadoCheck = {
  ok: boolean;
  latenciaMs: number | null;
  statusCode: number | null;
  error: string | null;
};

export type DefinicionCheck = {
  id: string;
  servicioId: string;
  tipo: "http" | "ssl" | "dns" | "tcp";
  url: string | null;
  metodo: string;
  cabeceras: Record<string, string> | null;
  cuerpo: string | null;
  esperaStatus: number[];
  esperaTexto: string | null;
  timeoutMs: number;
};

export async function comprobar(
  def: DefinicionCheck,
  buscar: typeof fetch
): Promise<ResultadoCheck> {
  if (!def.url) {
    // Distinto de una caída: el servicio puede estar perfectamente y ser Atlas
    // quien está mal configurado. El mensaje lo deja claro.
    return {
      ok: false, latenciaMs: null, statusCode: null,
      error: "El check no tiene URL configurada",
    };
  }

  const abortador = new AbortController();
  const temporizador = setTimeout(() => abortador.abort(), def.timeoutMs);
  const inicio = performance.now();

  try {
    const respuesta = await buscar(def.url, {
      method: def.metodo,
      headers: def.cabeceras ?? undefined,
      body: def.cuerpo ?? undefined,
      signal: abortador.signal,
      redirect: "follow",
    });
    const latenciaMs = Math.round(performance.now() - inicio);

    // Solo se lee el cuerpo si hace falta comprobar un texto: descargar
    // megabytes de HTML cada cinco minutos, por doce proyectos, no es gratis.
    const cuerpo = def.esperaTexto !== null ? await respuesta.text() : "";

    const veredicto = evaluarHttp(
      { statusCode: respuesta.status, cuerpo },
      { esperaStatus: def.esperaStatus, esperaTexto: def.esperaTexto }
    );

    return {
      ok: veredicto.ok,
      latenciaMs,
      statusCode: respuesta.status,
      error: veredicto.error,
    };
  } catch (e: unknown) {
    const esAborto = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      latenciaMs: null,
      statusCode: null,
      error: esAborto
        ? `Tiempo de espera agotado (${def.timeoutMs} ms)`
        : `Error de red: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    clearTimeout(temporizador);
  }
}
```

- [ ] **Paso 5: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/vigia/comprobar.test.ts`
Esperado: PASA, 7 tests.

- [ ] **Paso 6: escribir la función**

```ts
// supabase/functions/vigia/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { comprobar, type DefinicionCheck } from "./comprobar.ts";
import { transicion, type EstadoCheck } from "./maquina.ts";

const TAMANO_LOTE = 50;

Deno.serve(async (peticion: Request) => {
  // Solo la puede invocar pg_net con la service_role key.
  const autorizacion = peticion.headers.get("Authorization");
  const esperado = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (autorizacion !== esperado) {
    return new Response("No autorizado", { status: 401 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const ahora = new Date().toISOString();

  // Los checks que ya tocan, según su intervalo.
  const { data: pendientes, error } = await sb
    .from("checks")
    .select(`id, servicio_id, tipo, url, metodo, cabeceras, cuerpo,
             espera_status, espera_texto, timeout_ms, intervalo_s,
             umbral_fallos, umbral_latencia_ms, notifica,
             estado, fallos_consecutivos,
             servicios!inner(proyecto_id)`)
    .eq("activo", true)
    .lte("proximo_check_en", ahora)
    .limit(TAMANO_LOTE);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const resultados = await Promise.all(
    (pendientes ?? []).map((fila) => procesar(sb, fila, ahora))
  );

  // Latido para el vigilante externo: si deja de llegar, alguien avisa de que
  // Atlas se ha quedado ciego. Es el único fallo que no puede detectar solo.
  const latido = Deno.env.get("ATLAS_LATIDO_URL");
  if (latido) {
    await fetch(latido).catch(() => {
      // Que el vigilante externo esté caído no debe tumbar la vigilancia.
    });
  }

  return Response.json({
    comprobados: resultados.length,
    incidenciasAbiertas: resultados.filter((r) => r.abrio).length,
    incidenciasCerradas: resultados.filter((r) => r.cerro).length,
  });
});

// deno-lint-ignore no-explicit-any
async function procesar(sb: any, fila: any, ahora: string) {
  const def: DefinicionCheck = {
    id: fila.id,
    servicioId: fila.servicio_id,
    tipo: fila.tipo,
    url: fila.url,
    metodo: fila.metodo,
    cabeceras: fila.cabeceras,
    cuerpo: fila.cuerpo,
    esperaStatus: fila.espera_status ?? [],
    esperaTexto: fila.espera_texto,
    timeoutMs: fila.timeout_ms,
  };

  const resultado = await comprobar(def, fetch);

  // ¿Está silenciado? Dos motivos: ventana de mantenimiento del proyecto, o
  // incidencia silenciada a mano.
  const [{ data: ventana }, { data: incidencia }] = await Promise.all([
    sb.from("ventanas_mantenimiento")
      .select("id")
      .eq("proyecto_id", fila.servicios.proyecto_id)
      .lte("desde", ahora).gte("hasta", ahora)
      .maybeSingle(),
    sb.from("incidencias")
      .select("id, silenciada_hasta")
      .eq("check_id", fila.id)
      .is("cerrada_en", null)
      .maybeSingle(),
  ]);

  const silenciadaHasta = incidencia?.silenciada_hasta as string | null | undefined;
  const silenciado =
    ventana !== null || (silenciadaHasta != null && silenciadaHasta > ahora);

  const t = transicion(resultado, {
    estadoActual: fila.estado as EstadoCheck,
    fallosConsecutivos: fila.fallos_consecutivos,
    umbralFallos: fila.umbral_fallos,
    umbralLatenciaMs: fila.umbral_latencia_ms,
    incidenciaAbierta: incidencia != null,
    silenciado,
    notifica: fila.notifica,
  });

  const proximo = new Date(
    new Date(ahora).getTime() + fila.intervalo_s * 1000
  ).toISOString();

  await Promise.all([
    sb.from("check_resultados").insert({
      check_id: fila.id,
      ts: ahora,
      ok: resultado.ok,
      latencia_ms: resultado.latenciaMs,
      status_code: resultado.statusCode,
      error: resultado.error,
    }),
    sb.from("checks").update({
      estado: t.estadoNuevo,
      fallos_consecutivos: t.fallosConsecutivos,
      ultimo_check_en: ahora,
      proximo_check_en: proximo,
    }).eq("id", fila.id),
  ]);

  if (t.abrirIncidencia) {
    await sb.from("incidencias").insert({
      servicio_id: fila.servicio_id,
      check_id: fila.id,
      abierta_en: ahora,
      severidad: "critica",
      causa: resultado.error,
      ultimo_error: resultado.error,
    });
  }
  if (t.cerrarIncidencia && incidencia) {
    await sb.from("incidencias")
      .update({ cerrada_en: ahora })
      .eq("id", incidencia.id);
  }

  // `t.notificar` todavía no se envía: el envío llega en el plan 1C. Aquí solo
  // se devuelve para que el resumen de la invocación lo refleje.
  return { abrio: t.abrirIncidencia, cerro: t.cerrarIncidencia, avisar: t.notificar };
}
```

- [ ] **Paso 7: comprobar que la función sirve en local**

```bash
npx supabase functions serve vigia --no-verify-jwt
```

En otra terminal:

```bash
CLAVE=$(npx supabase status -o json | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).SERVICE_ROLE_KEY")
curl -s -X POST http://127.0.0.1:54321/functions/v1/vigia -H "Authorization: Bearer $CLAVE"
```

Esperado: `{"comprobados":0,"incidenciasAbiertas":0,"incidenciasCerradas":0}` si no hay checks dados de alta.

- [ ] **Paso 8: commit**

```bash
git add supabase/functions src/tests/vigia
git commit -m "feat(atlas): Edge Function vigia — ejecuta checks y aplica la maquina"
```

---

## Tarea 5: El planificador — pg_cron y pg_net

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260815110000_planificador.sql`
- Test: `apps/atlas/src/tests/esquema/planificador.test.ts`

**Interfaces:**
- Consume: la Edge Function `vigia` (Tarea 4), tabla `checks`.
- Produce: función `atlas_disparar_vigia()` y las tareas de `cron` llamadas `atlas-vigia` y `atlas-retencion`.

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/esquema/planificador.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: URL_PG });
  await db.connect();
});
afterAll(async () => { await db.end(); });

describe("planificador", () => {
  it("las extensiones necesarias están instaladas", async () => {
    const { rows } = await db.query(
      `SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pg_net')`
    );
    expect(rows.map((r) => r.extname).sort()).toEqual(["pg_cron", "pg_net"]);
  });

  it("hay una tarea programada cada minuto", async () => {
    const { rows } = await db.query(
      `SELECT schedule, active FROM cron.job WHERE jobname = 'atlas-vigia'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].schedule).toBe("* * * * *");
    expect(rows[0].active).toBe(true);
  });

  it("existe la tarea diaria de retención", async () => {
    const { rows } = await db.query(
      `SELECT schedule FROM cron.job WHERE jobname = 'atlas-retencion'`
    );
    expect(rows).toHaveLength(1);
  });

  it("el índice que consulta el planificador existe y filtra por activo", async () => {
    const { rows } = await db.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'checks_pendientes'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain("proximo_check_en");
    expect(rows[0].indexdef).toContain("WHERE activo");
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/esquema/planificador.test.ts`
Esperado: FALLA — las extensiones no están y `cron.job` no existe.

- [ ] **Paso 3: escribir la migración**

```sql
-- supabase/migrations/20260815110000_planificador.sql
--
-- El planificador vive DENTRO de Supabase, no en Vercel: así no depende de que
-- una función de Vercel esté despierta, y esquiva el límite de una ejecución
-- diaria del plan Hobby.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- La URL y la clave se guardan como ajustes de la base para no incrustarlas en
-- la definición de la tarea. Se fijan UNA vez, tras desplegar:
--   alter database postgres set app.atlas_funciones_url = 'https://xxxx.supabase.co/functions/v1';
--   alter database postgres set app.atlas_service_key   = '<service_role key>';
create or replace function atlas_disparar_vigia() returns void
language plpgsql security definer set search_path = public as $$
declare
  url   text := current_setting('app.atlas_funciones_url', true);
  clave text := current_setting('app.atlas_service_key', true);
begin
  if url is null or clave is null then
    raise warning 'atlas: faltan app.atlas_funciones_url o app.atlas_service_key; no se dispara el vigia';
    return;
  end if;

  -- Salida rápida: si no hay ningún check que toque, no se gasta una invocación.
  if not exists (select 1 from checks where activo and proximo_check_en <= now()) then
    return;
  end if;

  perform net.http_post(
    url     := url || '/vigia',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || clave),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end $$;

select cron.schedule('atlas-vigia', '* * * * *', $$select atlas_disparar_vigia()$$);

-- La retención se programa aquí y su función se implementa en la Tarea 6.
-- A las 04:17 y no en punto a propósito: los minutos redondos concentran carga
-- de tareas programadas en cualquier sistema.
select cron.schedule('atlas-retencion', '17 4 * * *', $$select atlas_consolidar_retencion()$$);
```

- [ ] **Paso 4: aplicar y comprobar**

Ejecuta: `npx supabase db reset && npx vitest run src/tests/esquema/planificador.test.ts`
Esperado: PASA, 4 tests. La tarea `atlas-retencion` queda programada aunque la función que llama todavía no exista; se crea en la tarea siguiente.

- [ ] **Paso 5: commit**

```bash
git add supabase/migrations src/tests/esquema/planificador.test.ts
git commit -m "feat(atlas): planificador con pg_cron y pg_net"
```

---

## Tarea 6: Retención por capas

Sin esto, `check_resultados` agota los 500 MB del plan gratuito en unos meses, y arreglarlo entonces es una migración dolorosa con la base ya llena.

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260815110100_retencion.sql`
- Test: `apps/atlas/src/tests/esquema/retencion.test.ts`

**Interfaces:**
- Consume: `check_resultados`, `check_agregados`.
- Produce: función `atlas_consolidar_retencion()`, ya programada por la Tarea 5.

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/esquema/retencion.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let db: Client;
let idCheck = "";

beforeAll(async () => {
  db = new Client({ connectionString: URL_PG });
  await db.connect();

  const { rows: [p] } = await db.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Ret','ret','interno') RETURNING id`
  );
  const { rows: [s] } = await db.query(
    `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1,'S','api') RETURNING id`,
    [p.id]
  );
  const { rows: [c] } = await db.query(
    `INSERT INTO checks (servicio_id, tipo, url)
     VALUES ($1,'http','https://ejemplo.test') RETURNING id`, [s.id]
  );
  idCheck = c.id;
});

afterAll(async () => {
  await db.query(`DELETE FROM proyectos WHERE slug = 'ret'`);
  await db.end();
});

describe("retención por capas", () => {
  it("consolida en agregados horarios lo que pasa de 7 días y borra el detalle", async () => {
    // 10 resultados de hace 10 días, dentro de la misma hora: 9 correctos, 1 no.
    for (let i = 0; i < 10; i++) {
      await db.query(
        `INSERT INTO check_resultados (check_id, ts, ok, latencia_ms)
         VALUES ($1, date_trunc('hour', now() - interval '10 days')
                     + ($2 || ' seconds')::interval, $3, $4)`,
        [idCheck, i * 60, i !== 3, 100 + i]
      );
    }
    // Y 5 recientes, que NO deben tocarse.
    for (let i = 0; i < 5; i++) {
      await db.query(
        `INSERT INTO check_resultados (check_id, ts, ok, latencia_ms)
         VALUES ($1, now() - interval '1 hour', true, 200)`, [idCheck]
      );
    }

    await db.query(`SELECT atlas_consolidar_retencion()`);

    const { rows: agregados } = await db.query(
      `SELECT total, ok, latencia_p50 FROM check_agregados
       WHERE check_id = $1 AND granularidad = 'hora'`, [idCheck]
    );
    expect(agregados).toHaveLength(1);
    expect(agregados[0].total).toBe(10);
    expect(agregados[0].ok).toBe(9);
    expect(agregados[0].latencia_p50).toBeGreaterThan(0);

    const { rows: detalle } = await db.query(
      `SELECT count(*)::int AS n FROM check_resultados WHERE check_id = $1`, [idCheck]
    );
    expect(detalle[0].n).toBe(5);   // solo quedan los recientes
  });

  it("es idempotente: relanzarla no duplica ni altera los agregados", async () => {
    const antes = await db.query(
      `SELECT total, ok FROM check_agregados WHERE check_id=$1 AND granularidad='hora'`,
      [idCheck]
    );
    await db.query(`SELECT atlas_consolidar_retencion()`);
    await db.query(`SELECT atlas_consolidar_retencion()`);
    const despues = await db.query(
      `SELECT total, ok FROM check_agregados WHERE check_id=$1 AND granularidad='hora'`,
      [idCheck]
    );
    expect(despues.rows).toEqual(antes.rows);
  });

  it("colapsa los agregados horarios de más de 90 días en diarios", async () => {
    await db.query(
      `INSERT INTO check_agregados (check_id, bucket, granularidad, total, ok, latencia_p50)
       VALUES ($1, date_trunc('hour', now() - interval '100 days'), 'hora', 12, 12, 150),
              ($1, date_trunc('hour', now() - interval '100 days') + interval '1 hour',
               'hora', 12, 10, 160)`,
      [idCheck]
    );
    await db.query(`SELECT atlas_consolidar_retencion()`);

    const { rows: diarios } = await db.query(
      `SELECT total, ok FROM check_agregados
       WHERE check_id=$1 AND granularidad='dia'`, [idCheck]
    );
    expect(diarios).toHaveLength(1);
    expect(diarios[0].total).toBe(24);
    expect(diarios[0].ok).toBe(22);

    const { rows: viejosHorarios } = await db.query(
      `SELECT count(*)::int AS n FROM check_agregados
       WHERE check_id=$1 AND granularidad='hora'
         AND bucket < now() - interval '90 days'`, [idCheck]
    );
    expect(viejosHorarios[0].n).toBe(0);
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/esquema/retencion.test.ts`
Esperado: FALLA con «function atlas_consolidar_retencion() does not exist».

- [ ] **Paso 3: escribir la migración**

```sql
-- supabase/migrations/20260815110100_retencion.sql
--
-- Tres capas:
--   0-7 días   → cada resultado individual, en check_resultados
--   7-90 días  → un agregado por hora
--   >90 días   → un agregado por día, sin caducidad
--
-- La cifra de uptime NO cambia al consolidar: detalle y agregados alimentan los
-- mismos contadores (ver src/lib/uptime/calcular.ts).

create or replace function atlas_consolidar_retencion() returns void
language plpgsql security definer set search_path = public as $$
begin
  -- 1) Detalle de más de 7 días → agregados horarios.
  insert into check_agregados (check_id, bucket, granularidad, total, ok,
                               latencia_p50, latencia_p95)
  select
    check_id,
    date_trunc('hour', ts) as bucket,
    'hora',
    count(*)::int,
    count(*) filter (where ok)::int,
    percentile_disc(0.50) within group (order by latencia_ms)::int,
    percentile_disc(0.95) within group (order by latencia_ms)::int
  from check_resultados
  where ts < now() - interval '7 days'
  group by check_id, date_trunc('hour', ts)
  -- Idempotente: relanzarla sobre datos ya consolidados no cambia nada.
  on conflict (check_id, bucket, granularidad) do nothing;

  delete from check_resultados where ts < now() - interval '7 days';

  -- 2) Agregados horarios de más de 90 días → diarios.
  insert into check_agregados (check_id, bucket, granularidad, total, ok,
                               latencia_p50, latencia_p95)
  select
    check_id,
    date_trunc('day', bucket) as bucket,
    'dia',
    sum(total)::int,
    sum(ok)::int,
    -- Media ponderada de las medianas horarias: no es el percentil exacto del
    -- día, y es honesto decirlo. A 90 días vista, la tendencia basta.
    (sum(coalesce(latencia_p50, 0) * total) / nullif(sum(total), 0))::int,
    max(latencia_p95)::int
  from check_agregados
  where granularidad = 'hora' and bucket < now() - interval '90 days'
  group by check_id, date_trunc('day', bucket)
  on conflict (check_id, bucket, granularidad) do nothing;

  delete from check_agregados
  where granularidad = 'hora' and bucket < now() - interval '90 days';
end $$;
```

- [ ] **Paso 4: aplicar y comprobar**

Ejecuta: `npx supabase db reset && npx vitest run src/tests/esquema/retencion.test.ts`
Esperado: PASA, 3 tests.

- [ ] **Paso 5: commit**

```bash
git add supabase/migrations src/tests/esquema/retencion.test.ts
git commit -m "feat(atlas): retencion por capas con consolidacion idempotente"
```

---

## Tarea 7: Estados reales en la interfaz

Conecta lo que el motor produce con lo que la ficha de proyecto muestra. Hasta ahora todos los servicios salían como «sin datos».

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/servicios-estado.ts`
- Modificar: `apps/atlas/src/lib/db/proyectos.ts`, `apps/atlas/src/app/proyectos/[slug]/page.tsx`
- Test: `apps/atlas/src/tests/db/servicios-estado.test.ts`

**Interfaces:**
- Consume: `EstadoCheck` (Tarea 1), `formatearUptime` (Tarea 3), `Distintivo` (plan 1A-2, Tarea 10).
- Produce:
  - `type EstadoDeCheck = { estado: EstadoCheck; uptime: number | null; ultimoError: string | null }`
  - `function peorEstado(estados: EstadoCheck[]): EstadoCheck`
  - `function resumirServicio(checks: EstadoDeCheck[]): { estado: EstadoCheck; uptime30d: number | null; ultimoError: string | null }`
  - `ServicioResumen` amplía con `estado`, `uptime30d` y `ultimoError`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/db/servicios-estado.test.ts
import { describe, it, expect } from "vitest";
import { peorEstado, resumirServicio } from "@/lib/db/servicios-estado";

describe("estado de un servicio con varios checks", () => {
  it("un servicio sin checks está en desconocido", () => {
    expect(peorEstado([])).toBe("desconocido");
  });

  it("todos correctos: ok", () => {
    expect(peorEstado(["ok", "ok"])).toBe("ok");
  });

  it("manda el peor: un caído tiñe todo el servicio", () => {
    expect(peorEstado(["ok", "degradado", "caido"])).toBe("caido");
  });

  it("degradado gana a ok", () => {
    expect(peorEstado(["ok", "degradado"])).toBe("degradado");
  });

  it("desconocido no empeora a un caído real", () => {
    // Un check sin datos no debe rebajar un servicio que sabemos caído.
    expect(peorEstado(["caido", "desconocido"])).toBe("caido");
  });

  it("desconocido sí gana a ok: hay algo sin comprobar", () => {
    expect(peorEstado(["ok", "desconocido"])).toBe("desconocido");
  });
});

describe("resumen de servicio", () => {
  it("promedia el uptime de todos sus checks", () => {
    const r = resumirServicio([
      { estado: "ok", uptime: 100, ultimoError: null },
      { estado: "ok", uptime: 98, ultimoError: null },
    ]);
    expect(r.uptime30d).toBe(99);
  });

  it("ignora los checks sin datos al promediar", () => {
    const r = resumirServicio([
      { estado: "ok", uptime: 98, ultimoError: null },
      { estado: "desconocido", uptime: null, ultimoError: null },
    ]);
    expect(r.uptime30d).toBe(98);
  });

  it("sin ningún dato el uptime es null, no 0", () => {
    const r = resumirServicio([{ estado: "desconocido", uptime: null, ultimoError: null }]);
    expect(r.uptime30d).toBeNull();
  });

  it("muestra el error del check en peor estado", () => {
    const r = resumirServicio([
      { estado: "ok", uptime: 100, ultimoError: null },
      { estado: "caido", uptime: 90, ultimoError: "HTTP 500" },
    ]);
    expect(r.estado).toBe("caido");
    expect(r.ultimoError).toBe("HTTP 500");
  });
});
```

- [ ] **Paso 2: ejecutarlo y comprobar que falla**

Ejecuta: `npx vitest run src/tests/db/servicios-estado.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/db/servicios-estado"».

- [ ] **Paso 3: implementar**

```ts
// src/lib/db/servicios-estado.ts
import type { EstadoCheck } from "@/lib/incidencias/maquina";

// Cuanto mayor el número, peor. `desconocido` está por encima de `ok` porque
// «no lo sé» es peor noticia que «va bien», pero por debajo de los problemas
// confirmados: un check sin datos no debe rebajar un servicio que sabemos caído.
const GRAVEDAD: Record<EstadoCheck, number> = {
  ok: 0,
  desconocido: 1,
  degradado: 2,
  caido: 3,
};

export function peorEstado(estados: EstadoCheck[]): EstadoCheck {
  if (estados.length === 0) return "desconocido";
  return estados.reduce((peor, actual) =>
    GRAVEDAD[actual] > GRAVEDAD[peor] ? actual : peor
  );
}

export type EstadoDeCheck = {
  estado: EstadoCheck;
  uptime: number | null;
  ultimoError: string | null;
};

export function resumirServicio(checks: EstadoDeCheck[]): {
  estado: EstadoCheck;
  uptime30d: number | null;
  ultimoError: string | null;
} {
  const estado = peorEstado(checks.map((c) => c.estado));

  const conDatos = checks.filter((c) => c.uptime !== null);
  const uptime30d = conDatos.length === 0
    ? null
    : Math.round(
        (conDatos.reduce((suma, c) => suma + (c.uptime ?? 0), 0) / conDatos.length) * 10
      ) / 10;

  const culpable = checks.find((c) => c.estado === estado && c.ultimoError !== null);

  return { estado, uptime30d, ultimoError: culpable?.ultimoError ?? null };
}
```

- [ ] **Paso 4: ejecutar y comprobar que pasa**

Ejecuta: `npx vitest run src/tests/db/servicios-estado.test.ts`
Esperado: PASA, 10 tests.

- [ ] **Paso 5: enseñarlo en la ficha de proyecto**

Añade al principio de `src/app/proyectos/[slug]/page.tsx`:

```tsx
import { formatearUptime } from "@/lib/uptime/calcular";
import type { EstadoCheck } from "@/lib/incidencias/maquina";

const TEXTO_ESTADO: Record<EstadoCheck, string> = {
  ok: "Operativo",
  degradado: "Degradado",
  caido: "Caído",
  desconocido: "Sin datos",
};
```

Y en el listado de servicios, sustituye el distintivo fijo por el real:

```tsx
{/* ANTES — todos los servicios salían igual:
      <Distintivo estado="desconocido" texto="Sin datos" />               */}
<Distintivo estado={s.estado} texto={TEXTO_ESTADO[s.estado]} />
{s.uptime30d !== null && (
  <span className="text-xs tabular-nums" style={{ color: "var(--texto-tenue)" }}>
    {formatearUptime(s.uptime30d)}
  </span>
)}
{s.ultimoError && (
  <span className="text-xs" style={{ color: "var(--estado-caido)" }}>
    {s.ultimoError}
  </span>
)}
```

- [ ] **Paso 6: build y commit**

```bash
npm test && npm run typecheck && npm run build
git add src/lib/db/servicios-estado.ts src/lib/db/proyectos.ts src/app/proyectos src/tests
git commit -m "feat(atlas): estados y uptime reales en la ficha de proyecto"
```

---

## Verificación de salida del plan 1B

- [ ] **1. Toda la batería en verde**

Ejecuta: `npx supabase db reset && npm test`
Esperado: PASA. A los 91 tests de 1A y 1A-2 se suman 61: máquina (15), evaluación (12), uptime (10), comprobación (7), planificador (4), retención (3), estado de servicios (10) — **152 en total**.

- [ ] **2. Cobertura total en las dos piezas críticas**

Ejecuta: `npm run test:coverage`
Esperado: `src/lib/incidencias/maquina.ts` y `src/lib/uptime/calcular.ts` al **100 %** de líneas y ramas. El resto de `src/lib`, por encima del 80 %.

- [ ] **3. Las copias de la Edge Function están sincronizadas**

```bash
diff <(tail -n +4 supabase/functions/vigia/maquina.ts) src/lib/incidencias/maquina.ts && \
diff <(tail -n +4 supabase/functions/vigia/evaluar.ts) src/lib/incidencias/evaluar.ts && \
echo "sincronizadas" || echo "DESINCRONIZADAS — vuelve a copiarlas"
```
Esperado: `sincronizadas`. El `tail -n +4` salta la cabecera de tres líneas que advierte de que son copias.

- [ ] **4. El build pasa**

Ejecuta: `npm run typecheck && npm run build`
Esperado: sin errores.

- [ ] **5. Prueba de extremo a extremo, a mano**

Con Supabase local levantado y la función servida:
1. Da de alta un proyecto, un servicio y un check `http` apuntando a `https://example.com`, con `intervalo_s = 60`.
2. Invoca el vigía a mano y comprueba que aparece una fila en `check_resultados` y que `checks.estado` pasa a `ok`.
3. Cambia la URL del check a `https://example.com/no-existe-jamas`, dejando `espera_status = {200}`.
4. Invócalo **tres veces**, poniendo `proximo_check_en = now()` entre invocaciones. Comprueba que tras la primera y la segunda el estado es `degradado` **sin fila en `incidencias`**, y que tras la tercera aparece una incidencia con `cerrada_en` a `null`.
5. Devuelve la URL a la buena, invócalo otra vez y comprueba que la incidencia se cierra.

Este recorrido es el corazón del producto. Si funciona, el motor está bien.

---

## Autorrevisión del plan

**Cobertura del spec.** Implementa §6 completo salvo lo que se dice abajo (flujo, checks `http`, máquina de estados, granularidad, vigilante externo) y §4.4 completo (retención por capas). §7 (alertas) es el plan 1C: aquí `transicion` ya devuelve `notificar`, pero nadie lo envía todavía.

**Un hueco declarado, no un olvido.** Los tipos de check `ssl`, `dns` y `tcp` existen en el esquema y `evaluarCaducidad` sabe juzgarlos, pero **la recolección de sus datos no se implementa en este plan**: leer un certificado o resolver un registro DNS exige acceso a sockets desde Deno y merece su propia tarea. Al terminar 1B, un check de esos tipos se comprobará como si fuera `http` y dará un error de configuración. Si eso molesta antes de que llegue su tarea, lo honesto es dejarlos desactivados (`checks.activo = false`) en lugar de que ensucien el panel.

**Placeholders.** Ninguno.

**Consistencia de tipos.** `EstadoCheck`, `ResultadoCheck`, `Contexto` y `Transicion` se definen en `src/lib/incidencias/maquina.ts` y se copian literalmente a `supabase/functions/vigia/maquina.ts`; la comprobación nº 3 verifica que no diverjan. `ResultadoCheck` se redeclara en `comprobar.ts` con la misma forma exacta porque la Edge Function no puede importar del alias `@/`. `Veredicto` vive en `evaluar.ts`. `EstadoDeCheck` vive en `servicios-estado.ts`.

**Una duplicación consciente.** Las copias de `maquina.ts` y `evaluar.ts` en `supabase/functions/` son duplicación real, y la duplicación se desincroniza. La comprobación nº 3 la detecta, pero no la impide. Si al ejecutarlo resulta molesto, la salida limpia es un paso de compilación que las genere; no lo incluyo ahora porque añade complejidad de herramientas a cambio de resolver un problema que todavía no ha dolido.

**Dependencias entre tareas.** 1 → 4; 2 → 4; 4 → 5 → 6; 1 y 3 → 7. Las tareas 1, 2 y 3 son lógica pura y pueden hacerse en cualquier orden entre ellas.
