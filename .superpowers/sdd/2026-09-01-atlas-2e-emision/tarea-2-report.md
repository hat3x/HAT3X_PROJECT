# Tarea 2 — Informe

**Estado:** completa. Los cinco pasos del brief se siguieron en orden (rojo confirmado antes de escribir la implementación); el código y los tests se transcribieron tal cual venían en el brief, sin ajustes.

**Commit:** `f7d1fa7` — feat(atlas): la huella del registro de alta, con los vectores de la AEAT
(2 files changed, 154 insertions(+): `apps/atlas/src/lib/facturas/huella.ts`, `apps/atlas/src/tests/facturas/huella.test.ts`)

**Línea de tests:**
```
Test Files  1 passed (1)
     Tests  12 passed (12)
```

**tsc:**
```
$ npx tsc --noEmit
EXIT:0
```

**Dudas:** ninguna. Los dos vectores H1/H2 de la AEAT pasaron a la primera sin tocar el código del brief. No se tocó `supabase/` ni `src/tests/esquema/`; el `git status` previo al commit mostraba únicamente los dos ficheros de esta tarea como añadidos (más una migración ajena, sin stagear, del agente paralelo).

## Ronda de arreglo 1

**Commit:** `9fab37b` — fix(atlas): huella — engines node>=20, JSDoc de orden de verificarCadena, test de recorte con los cinco campos

**Cambios (los tres Menores, un fichero cada uno):**
1. `apps/atlas/package.json`: añadido `"engines": { "node": ">=20" }` entre `scripts` y `dependencies`. JSON no admite comentarios, así que la razón queda aquí: `huella.ts` depende de `globalThis.crypto.subtle` (Web Crypto), disponible de forma estable en Node desde la v20; el paquete no fijaba versión mínima.
2. `src/lib/facturas/huella.ts`: el JSDoc de `verificarCadena` ahora documenta que `eslabones` debe venir ordenado por `genEn` (fecha de generación), que la función no reordena ni asume nada sobre el orden de llegada, y que un array desordenado se informa como rotura de cadena igual que una huella manipulada.
3. `src/tests/facturas/huella.test.ts`: nuevo test «recorta espacios de los cinco campos de texto, no solo el NIF», que construye un registro encadenado (basado en V2, con `huellaAnterior` real) y comprueba el recorte en los cinco campos de texto de `cadenaCanonica`: `nifEmisor`, `numSerie`, `fechaExpedicion`, `huellaAnterior` y `genEn`.

**Línea de tests:**
```
Test Files  2 passed (2)
     Tests  19 passed (19)
```
(13 en `huella.test.ts`, propias de esta tarea; 6 en `firma.test.ts`, de otra tarea del plan — no tocado aquí. Nota: `firma.test.ts` mostró un fallo puntual, no reproducible, al correr junto a `huella.test.ts` con una key de firma generada al azar; confirmado como preexistente e independiente de estos cambios — pasa de forma estable en 5 repeticiones tras el fix y también pasaba antes de él con el mismo par de ficheros.)

**tsc:**
```
$ npx tsc --noEmit
EXIT:0
```

**Dudas:** ninguna.
