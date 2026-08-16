//
// Envío por correo, vía Resend. Recibe `fetch` como parámetro para poder
// probarlo sin red, igual que `comprobar.ts` en el vigía.
//
// Va en su propio fichero, separado de `push.ts`, por una razón práctica: el
// push necesita `npm:web-push`, y vite —que es quien ejecuta los tests— no sabe
// resolver especificadores `npm:`. Juntos, este código no se podría probar.
//

export type AvisoEnviable = {
  titulo: string;
  cuerpo: string;
  url: string;
};

export type Resultado = { ok: boolean; error: string | null };

export async function enviarCorreo(
  destino: string,
  aviso: AvisoEnviable,
  apiKey: string,
  buscar: typeof fetch
): Promise<Resultado> {
  // Sin clave o sin destino no se intenta nada, y se dice por qué. Queda escrito
  // en `notificaciones` con ok=false: un canal sin configurar tiene que verse,
  // no fingir que funciona.
  if (apiKey === "") {
    return { ok: false, error: "Correo sin configurar: falta RESEND_API_KEY." };
  }
  if (destino === "") {
    return { ok: false, error: "El destinatario no tiene correo." };
  }

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
