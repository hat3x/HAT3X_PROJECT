import { describe, it, expect } from "vitest";
import {
  enviarCorreo,
  type AvisoEnviable,
} from "../../../supabase/functions/avisar/correo";

const aviso: AvisoEnviable = {
  titulo: "Recepcionista Sara: Agente Retell caído",
  cuerpo: "HTTP 500",
  url: "https://atlas.hat3x.test/proyectos/recepcionista-sara",
};

// Clave inventada: no es una clave real de Resend.
const CLAVE = "re_prueba";

describe("envío de correo", () => {
  it("manda el aviso y devuelve ok", async () => {
    let visto: { url?: string; cuerpo?: Record<string, unknown> } = {};
    const falso: typeof fetch = async (url, init) => {
      visto = { url: String(url), cuerpo: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ id: "e1" }), { status: 200 });
    };
    const r = await enviarCorreo("jose@ejemplo.test", aviso, CLAVE, falso);

    expect(r.ok).toBe(true);
    expect(r.error).toBeNull();
    expect(visto.url).toContain("resend.com");
    expect(visto.cuerpo?.subject).toBe(aviso.titulo);
    expect(visto.cuerpo?.to).toBe("jose@ejemplo.test");
  });

  // Sin el enlace, el aviso obliga a ir a buscar el problema a mano.
  it("el cuerpo lleva el enlace al proyecto", async () => {
    let cuerpo: Record<string, unknown> = {};
    const falso: typeof fetch = async (_url, init) => {
      cuerpo = JSON.parse(String(init?.body));
      return new Response("{}", { status: 200 });
    };
    await enviarCorreo("jose@ejemplo.test", aviso, CLAVE, falso);
    expect(String(cuerpo.text)).toContain(aviso.url);
    expect(String(cuerpo.text)).toContain(aviso.cuerpo);
  });

  it("va autenticado con la clave", async () => {
    let cabecera: string | null = null;
    const falso: typeof fetch = async (_url, init) => {
      cabecera = new Headers(init?.headers).get("Authorization");
      return new Response("{}", { status: 200 });
    };
    await enviarCorreo("jose@ejemplo.test", aviso, CLAVE, falso);
    expect(cabecera).toBe(`Bearer ${CLAVE}`);
  });

  it("un rechazo del proveedor se recoge, no revienta", async () => {
    const falso: typeof fetch = async () =>
      new Response(JSON.stringify({ message: "clave no válida" }), { status: 401 });
    const r = await enviarCorreo("jose@ejemplo.test", aviso, "re_mala", falso);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("401");
  });

  it("un fallo de red también", async () => {
    const falso: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const r = await enviarCorreo("jose@ejemplo.test", aviso, CLAVE, falso);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("fetch failed");
  });

  // Mientras no haya clave de Resend configurada, el correo no debe intentarse
  // ni fingir que salió: se dice por qué, y queda escrito en `notificaciones`.
  it("sin clave configurada lo dice, y no llama a nadie", async () => {
    let llamado = false;
    const falso: typeof fetch = async () => {
      llamado = true;
      return new Response("{}", { status: 200 });
    };
    const r = await enviarCorreo("jose@ejemplo.test", aviso, "", falso);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/sin configurar/i);
    expect(llamado).toBe(false);
  });

  it("sin destino tampoco intenta nada", async () => {
    let llamado = false;
    const falso: typeof fetch = async () => {
      llamado = true;
      return new Response("{}", { status: 200 });
    };
    const r = await enviarCorreo("", aviso, CLAVE, falso);

    expect(r.ok).toBe(false);
    expect(llamado).toBe(false);
  });
});
