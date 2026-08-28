import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PAIRING_TOKEN_MIN_LENGTH } from "@/lib/imaging/protocol";

/**
 * Configuración local del agente.
 *
 * ── LA DECISIÓN IMPORTANTE: LA LISTA DE EQUIPOS VIVE AQUÍ ───────────────────
 * El navegador manda un `deviceId` y nada más. NUNCA manda una ruta.
 *
 * Podría parecer más cómodo que el navegador enviara la carpeta a vigilar —ya
 * la conoce, la ha leído de `salon_imaging_device`— pero eso convertiría al
 * agente en un lector de ficheros a la carta: cualquiera que consiguiera hablar
 * con el puerto podría pedirle el contenido de cualquier carpeta del ordenador.
 * Con la lista aquí, lo peor que puede obtener es una imagen de una de las
 * carpetas que la propia clínica configuró.
 *
 * El instalador escribe este fichero a partir de lo que la clínica declaró en
 * Ajustes → Equipos de imagen. Reconciliar ambos lados es cosa del instalador,
 * no del agente en caliente.
 */

export interface AgentDevice {
  /** Debe coincidir con `salon_imaging_device.id` en Salón OS. */
  id: string;
  adapter: "carpeta" | "twain" | "dicom" | "sdk";
  settings: Record<string, unknown>;
}

export interface AgentConfig {
  /** Puerto local. Solo escucha en 127.0.0.1. */
  port: number;
  /** Secreto compartido con el panel, generado por el instalador. */
  pairingToken: string;
  /** Orígenes que pueden hablar con el agente. Comparación exacta. */
  allowedOrigins: string[];
  devices: AgentDevice[];
}

const DEFAULT_PORT = 7345;

/** Error de configuración: se distingue para poder decir qué hay que arreglar. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function assertConfig(value: unknown): asserts value is AgentConfig {
  if (typeof value !== "object" || value === null) {
    throw new ConfigError("agent.config.json no contiene un objeto.");
  }
  const config = value as Record<string, unknown>;

  if (
    typeof config.pairingToken !== "string" ||
    config.pairingToken.length < PAIRING_TOKEN_MIN_LENGTH
  ) {
    throw new ConfigError(
      `Falta "pairingToken" o es más corto de ${PAIRING_TOKEN_MIN_LENGTH} caracteres.`,
    );
  }

  if (!Array.isArray(config.allowedOrigins) || config.allowedOrigins.length === 0) {
    // Sin orígenes no hay con quién emparejar. Arrancar "abierto" sería lo
    // contrario de lo que queremos: el agente no atiende a nadie hasta que
    // alguien diga a quién.
    throw new ConfigError('Falta "allowedOrigins": el agente no atiende a nadie sin lista.');
  }

  if (!Array.isArray(config.devices)) {
    throw new ConfigError('Falta "devices".');
  }
}

/**
 * Carga `agent.config.json` de junto al ejecutable.
 *
 * Falla en cerrado: si el fichero no existe, no es JSON o le falta algo
 * esencial, el agente NO arranca. Un agente a medio configurar que acepta
 * conexiones es peor que un agente que no está.
 */
export async function loadConfig(path?: string): Promise<AgentConfig> {
  const here = dirname(fileURLToPath(import.meta.url));
  const configPath = path ?? resolve(here, "..", "agent.config.json");

  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch {
    throw new ConfigError(
      `No encuentro la configuración en ${configPath}. Copia agent.config.example.json y rellénalo.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(`${configPath} no es JSON válido.`);
  }

  assertConfig(parsed);

  return {
    port: typeof (parsed as { port?: unknown }).port === "number"
      ? (parsed as { port: number }).port
      : DEFAULT_PORT,
    pairingToken: parsed.pairingToken,
    allowedOrigins: parsed.allowedOrigins,
    devices: parsed.devices,
  };
}

/** Busca un equipo por id. `undefined` si el panel pide uno que aquí no está. */
export function findDevice(config: AgentConfig, deviceId: string): AgentDevice | undefined {
  return config.devices.find((device) => device.id === deviceId);
}
