/**
 * Cliente del agente local de captura, lado navegador (A1a).
 */

export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentError";
  }
}

export interface CaptureFromAgentInput {
  port: number;
  token: string;
  deviceId: string;
  customerId: string;
  modality: string;
  fdiCode?: number;
}

export interface AgentImage {
  filename: string;
  mime: string;
  bytes: Uint8Array;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** El agente siempre escucha en el bucle local; nunca en una IP de la red. */
function agentUrl(port: number, path: string): string {
  return `http://127.0.0.1:${port}${path}`;
}

/**
 * ¿Hay agente en este ordenador?
 *
 * NO lanza nunca. La sonda corre al abrir la ficha del paciente, y la mayoría de
 * clínicas todavía no tienen agente instalado: si esto reventara, rompería la
 * pantalla precisamente a quien no ha contratado la función.
 */
export async function probeAgent(port: number, fetchImpl?: FetchLike): Promise<boolean> {
  const doFetch = fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  if (doFetch === undefined) return false;

  try {
    const res = await doFetch(agentUrl(port, "/health"), { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Lee el `error` que manda el agente, si viene. */
async function agentMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Pide una captura al agente y devuelve los bytes.
 *
 * Los bytes vuelven AQUÍ, al navegador, y desde aquí se suben a Salón OS con la
 * sesión que ya está abierta. Por eso el agente no necesita credenciales: ver
 * `agent/src/index.ts`.
 *
 * Cada error del agente se traduce a algo accionable. "Failed to fetch" no le
 * dice nada a quien está en el mostrador; "no encuentro el agente en este
 * ordenador" sí.
 */
export async function captureFromAgent(
  input: CaptureFromAgentInput,
  fetchImpl?: FetchLike,
): Promise<AgentImage> {
  const doFetch = fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  if (doFetch === undefined) {
    throw new AgentError("Este navegador no puede hablar con el agente.");
  }

  let res: Response;
  try {
    res = await doFetch(agentUrl(input.port, "/capture"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "capture",
        token: input.token,
        deviceId: input.deviceId,
        customerId: input.customerId,
        modality: input.modality,
        ...(input.fdiCode === undefined ? {} : { fdiCode: input.fdiCode }),
      }),
    });
  } catch {
    // Aquí caen tanto "no está instalado" como "está parado" o "el cortafuegos
    // lo bloquea". Desde el navegador no se distinguen, y para quien atiende la
    // acción es la misma: mirar el agente de este ordenador.
    throw new AgentError(
      "No encuentro el agente de captura en este ordenador. Comprueba que está instalado y en marcha.",
    );
  }

  if (!res.ok) {
    const detail = await agentMessage(res);
    switch (res.status) {
      case 401:
        throw new AgentError(
          "El agente de este ordenador no está emparejado con esta clínica. Revisa el token de la instalación.",
        );
      case 403:
        throw new AgentError(
          "El agente no acepta peticiones desde esta dirección. Revisa los orígenes permitidos de su configuración.",
        );
      case 404:
        throw new AgentError(
          "Ese equipo no está configurado en este ordenador. Puede que la captura haya que hacerla desde otro puesto.",
        );
      case 501:
        // El mensaje del agente ya nombra el adaptador que falta.
        throw new AgentError(detail ?? "Ese tipo de equipo todavía no está disponible.");
      default:
        // 502 y demás: el agente sabe por qué falló mejor que nosotros.
        throw new AgentError(detail ?? "No se pudo capturar la imagen.");
    }
  }

  const body = (await res.json()) as Partial<{
    filename: string;
    mime: string;
    base64: string;
  }>;

  if (typeof body.base64 !== "string" || body.base64.length === 0) {
    // Un 200 sin imagen archivaría una radiografía de cero bytes en la ficha.
    throw new AgentError("El agente respondió sin imagen. Repite la captura.");
  }

  return {
    filename: body.filename ?? "captura",
    mime: body.mime ?? "application/octet-stream",
    bytes: decodeBase64(body.base64),
  };
}
