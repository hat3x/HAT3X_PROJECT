//
// Genera los iconos de la PWA. Se ejecuta a mano: `npm run iconos`.
//
// Los dibuja por cálculo en vez de traer binarios de origen desconocido al
// repositorio: así se sabe exactamente qué hay dentro y se puede rehacer.
// Sin dependencias — zlib de Node y aritmética.
//
// El dibujo: degradado zafiro en diagonal y una montaña blanca. Atlas sostiene
// el mundo; una montaña es lo más parecido que se puede rasterizar sin fuentes.
//
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = TABLA_CRC[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const suma = Buffer.alloc(4);
  suma.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, suma]);
}

/** PNG de color verdadero con canal alfa (RGBA, 8 bits por canal). */
function png(lado, pixeles) {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera[8] = 8; // bits por canal
  cabecera[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", cabecera),
    trozo("IDAT", deflateSync(pixeles, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

function color(x, y, lado) {
  const u = x / lado;
  const v = y / lado;

  // Montaña: dos laderas que se cruzan, con la cumbre algo desplazada.
  const ladera = Math.abs(u - 0.46) * 1.35;
  if (v > 0.24 + ladera && v < 0.78) return [255, 255, 255];

  // Degradado en diagonal con los colores de la paleta Zafiro.
  const t = (u + v) / 2;
  return [0, Math.round(0x71 + (0xc7 - 0x71) * t), Math.round(0xe3 + (0xbe - 0xe3) * t)];
}

function dibujar(lado) {
  // Cada fila lleva delante un byte de filtro, que se deja en 0 (ninguno).
  const datos = Buffer.alloc(lado * (lado * 4 + 1));
  let i = 0;

  for (let y = 0; y < lado; y++) {
    datos[i++] = 0;
    for (let x = 0; x < lado; x++) {
      const [r, g, b] = color(x, y, lado);
      datos[i++] = r;
      datos[i++] = g;
      datos[i++] = b;
      datos[i++] = 255;
    }
  }
  return datos;
}

mkdirSync(resolve(RAIZ, "public/iconos"), { recursive: true });

for (const lado of [192, 512]) {
  const ruta = resolve(RAIZ, `public/iconos/atlas-${lado}.png`);
  writeFileSync(ruta, png(lado, dibujar(lado)));
  process.stdout.write(`icono de ${lado}x${lado} escrito\n`);
}
