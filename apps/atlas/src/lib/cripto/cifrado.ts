//
// Cifrado del llavero de Atlas. AES-256-GCM sobre WebCrypto, que existe tanto en
// Node 18+ como en Deno — la Edge Function del plan 1B necesitará descifrar y
// allí no hay `node:crypto`.
//
// La clave maestra NO vive aquí ni en la base de datos: llega como parámetro
// desde ATLAS_MASTER_KEY, variable de entorno del servidor. Recibirla en lugar
// de leerla es lo que hace este módulo probable sin tocar el entorno.

// `Uint8Array<ArrayBuffer>` y no `Uint8Array` a secas: desde TypeScript 5.7 el
// tipo es genérico sobre `ArrayBufferLike`, y WebCrypto exige que los bytes
// estén respaldados por un `ArrayBuffer` de verdad, nunca por `SharedArrayBuffer`.
export type SecretoCifrado = {
  cifrado: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  tag: Uint8Array<ArrayBuffer>;
};

const LONGITUD_IV = 12; // recomendado para GCM
const LONGITUD_TAG = 16; // 128 bits

function aBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binario = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function importarClave(claveMaestraB64: string): Promise<CryptoKey> {
  const bruta = aBytes(claveMaestraB64);
  if (bruta.length !== 32) {
    throw new Error(
      `ATLAS_MASTER_KEY debe medir exactamente 32 bytes (mide ${bruta.length}). ` +
        `Genérala con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return crypto.subtle.importKey("raw", bruta, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function cifrar(
  textoPlano: string,
  claveMaestraB64: string
): Promise<SecretoCifrado> {
  const clave = await importarClave(claveMaestraB64);
  const iv = crypto.getRandomValues(new Uint8Array(LONGITUD_IV));
  const salida = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: LONGITUD_TAG * 8 },
      clave,
      new TextEncoder().encode(textoPlano)
    )
  );
  // WebCrypto concatena la etiqueta al final del texto cifrado. Las separamos
  // porque el esquema las guarda en columnas distintas.
  return {
    cifrado: salida.slice(0, salida.length - LONGITUD_TAG),
    tag: salida.slice(salida.length - LONGITUD_TAG),
    iv,
  };
}

export async function descifrar(
  secreto: SecretoCifrado,
  claveMaestraB64: string
): Promise<string> {
  const clave = await importarClave(claveMaestraB64);
  const unido = new Uint8Array(secreto.cifrado.length + secreto.tag.length);
  unido.set(secreto.cifrado, 0);
  unido.set(secreto.tag, secreto.cifrado.length);

  const plano = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: secreto.iv, tagLength: LONGITUD_TAG * 8 },
    clave,
    unido
  );
  return new TextDecoder().decode(plano);
}

/**
 * Lo único de un secreto que puede aparecer en pantalla. Conserva el prefijo
 * (`sk_live_`, `sk_test_`…) para que se reconozca, y los cuatro últimos
 * caracteres para poder distinguir dos claves del mismo proveedor.
 */
export function enmascarar(secreto: string): string {
  if (secreto.length < 8) return "••••";
  const corte = secreto.lastIndexOf("_");
  const prefijo =
    corte > 0 && corte <= secreto.length - 5
      ? secreto.slice(0, corte + 1)
      : secreto.slice(0, 4);
  return `${prefijo}••••${secreto.slice(-4)}`;
}
