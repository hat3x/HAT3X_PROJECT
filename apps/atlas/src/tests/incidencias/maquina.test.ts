import { describe, it, expect } from "vitest";
import {
  transicion,
  type Contexto,
  type ResultadoCheck,
} from "@/lib/incidencias/maquina";

const CORRECTO: ResultadoCheck = {
  ok: true,
  latenciaMs: 210,
  statusCode: 200,
  error: null,
};
const LENTO: ResultadoCheck = {
  ok: true,
  latenciaMs: 4200,
  statusCode: 200,
  error: null,
};
const FALLO: ResultadoCheck = {
  ok: false,
  latenciaMs: null,
  statusCode: 500,
  error: "HTTP 500",
};

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
      estadoNuevo: "ok",
      fallosConsecutivos: 0,
      abrirIncidencia: false,
      cerrarIncidencia: false,
      notificar: null,
    });
  });

  it("responde bien pero lento: degradado, y NO despierta a nadie", () => {
    const t = transicion(LENTO, ctx());
    expect(t.estadoNuevo).toBe("degradado");
    expect(t.abrirIncidencia).toBe(false);
    expect(t.notificar).toBeNull();
  });

  it("sin umbral de latencia configurado, la lentitud no importa", () => {
    expect(transicion(LENTO, ctx({ umbralLatenciaMs: null })).estadoNuevo).toBe("ok");
  });

  // Si el check responde bien pero no mide la latencia, no hay nada que comparar.
  it("sin latencia medida tampoco se considera lento", () => {
    const sinLatencia: ResultadoCheck = { ...CORRECTO, latenciaMs: null };
    expect(transicion(sinLatencia, ctx()).estadoNuevo).toBe("ok");
  });

  it("justo en el umbral de latencia todavía es ok: se degrada al superarlo", () => {
    const justo: ResultadoCheck = { ...CORRECTO, latenciaMs: 2000 };
    expect(transicion(justo, ctx()).estadoNuevo).toBe("ok");
    const pasado: ResultadoCheck = { ...CORRECTO, latenciaMs: 2001 };
    expect(transicion(pasado, ctx()).estadoNuevo).toBe("degradado");
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
      estadoNuevo: "caido",
      fallosConsecutivos: 3,
      abrirIncidencia: true,
      cerrarIncidencia: false,
      notificar: "apertura",
    });
  });

  it("con umbral 1, el primer fallo ya abre", () => {
    const t = transicion(FALLO, ctx({ umbralFallos: 1 }));
    expect(t.abrirIncidencia).toBe(true);
    expect(t.notificar).toBe("apertura");
  });

  it("seguir caído no vuelve a abrir ni a avisar", () => {
    const t = transicion(
      FALLO,
      ctx({ estadoActual: "caido", fallosConsecutivos: 3, incidenciaAbierta: true })
    );
    expect(t.estadoNuevo).toBe("caido");
    expect(t.fallosConsecutivos).toBe(4);
    expect(t.abrirIncidencia).toBe(false);
    expect(t.notificar).toBeNull();
  });
});

describe("máquina de estados — la recuperación", () => {
  it("volver a responder cierra la incidencia y avisa", () => {
    const t = transicion(
      CORRECTO,
      ctx({ estadoActual: "caido", fallosConsecutivos: 5, incidenciaAbierta: true })
    );
    expect(t).toEqual({
      estadoNuevo: "ok",
      fallosConsecutivos: 0,
      abrirIncidencia: false,
      cerrarIncidencia: true,
      notificar: "recuperacion",
    });
  });

  it("recuperarse lento deja el estado en degradado, pero cierra igual", () => {
    const t = transicion(
      LENTO,
      ctx({ estadoActual: "caido", fallosConsecutivos: 5, incidenciaAbierta: true })
    );
    expect(t.estadoNuevo).toBe("degradado");
    expect(t.cerrarIncidencia).toBe(true);
    expect(t.notificar).toBe("recuperacion");
  });

  it("recuperarse de un bache sin incidencia abierta no avisa de nada", () => {
    const t = transicion(
      CORRECTO,
      ctx({ estadoActual: "degradado", fallosConsecutivos: 2, incidenciaAbierta: false })
    );
    expect(t.estadoNuevo).toBe("ok");
    expect(t.fallosConsecutivos).toBe(0);
    expect(t.cerrarIncidencia).toBe(false);
    expect(t.notificar).toBeNull();
  });
});

describe("máquina de estados — silencios", () => {
  it("silenciado: la incidencia se abre igual, pero NO se avisa", () => {
    const t = transicion(
      FALLO,
      ctx({ estadoActual: "degradado", fallosConsecutivos: 2, silenciado: true })
    );
    // El histórico nunca miente: lo que se silencia es el aviso.
    expect(t.abrirIncidencia).toBe(true);
    expect(t.estadoNuevo).toBe("caido");
    expect(t.notificar).toBeNull();
  });

  it("silenciado: la recuperación tampoco avisa", () => {
    const t = transicion(
      CORRECTO,
      ctx({
        estadoActual: "caido",
        fallosConsecutivos: 3,
        incidenciaAbierta: true,
        silenciado: true,
      })
    );
    expect(t.cerrarIncidencia).toBe(true);
    expect(t.notificar).toBeNull();
  });

  it("con notifica=false el check vigila y pinta, pero jamás avisa", () => {
    const t = transicion(
      FALLO,
      ctx({ estadoActual: "degradado", fallosConsecutivos: 2, notifica: false })
    );
    expect(t.abrirIncidencia).toBe(true);
    expect(t.notificar).toBeNull();
  });

  it("con notifica=false la recuperación tampoco avisa", () => {
    const t = transicion(
      CORRECTO,
      ctx({
        estadoActual: "caido",
        fallosConsecutivos: 3,
        incidenciaAbierta: true,
        notifica: false,
      })
    );
    expect(t.cerrarIncidencia).toBe(true);
    expect(t.notificar).toBeNull();
  });
});

describe("máquina de estados — primer contacto", () => {
  it("desde desconocido, un resultado correcto pasa a ok", () => {
    expect(transicion(CORRECTO, ctx({ estadoActual: "desconocido" })).estadoNuevo).toBe(
      "ok"
    );
  });

  it("desde desconocido, un fallo empieza a contar sin abrir nada", () => {
    const t = transicion(FALLO, ctx({ estadoActual: "desconocido" }));
    expect(t.estadoNuevo).toBe("degradado");
    expect(t.fallosConsecutivos).toBe(1);
    expect(t.abrirIncidencia).toBe(false);
  });
});

describe("máquina de estados — casos límite del umbral", () => {
  // Si el contador viene por encima del umbral —por ejemplo, porque alguien
  // bajó el umbral con el servicio ya caído— no debe reabrir la incidencia.
  it("con la incidencia ya abierta y el contador pasado, no reabre", () => {
    const t = transicion(
      FALLO,
      ctx({
        estadoActual: "caido",
        fallosConsecutivos: 9,
        umbralFallos: 3,
        incidenciaAbierta: true,
      })
    );
    expect(t.abrirIncidencia).toBe(false);
    expect(t.estadoNuevo).toBe("caido");
  });

  // Y si NO hay incidencia abierta pero el contador ya pasó el umbral, sí abre:
  // es el caso de bajar el umbral con el servicio fallando.
  it("sin incidencia abierta y el contador pasado, abre", () => {
    const t = transicion(
      FALLO,
      ctx({ estadoActual: "degradado", fallosConsecutivos: 7, umbralFallos: 3 })
    );
    expect(t.abrirIncidencia).toBe(true);
    expect(t.notificar).toBe("apertura");
  });
});
