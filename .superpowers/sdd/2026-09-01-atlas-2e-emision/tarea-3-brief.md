## Tarea 3: La firma y la puerta de emisión

**Ficheros:**
- Crear: `apps/atlas/src/lib/facturas/firma.ts`
- Crear: `apps/atlas/src/lib/facturas/ajustes-emision.ts`
- Test: `apps/atlas/src/tests/facturas/firma.test.ts`, `apps/atlas/src/tests/db/ajustes-emision.test.ts`

**Interfaces (produce):**
```ts
// firma.ts (node:crypto; solo servidor)
function firmar(cadena: string, clavePrivadaPem: string): string          // ECDSA P-256 / SHA-256, base64 (DER)
function verificarFirma(cadena: string, firmaB64: string, clavePublicaPem: string): boolean
function clavePublicaDe(clavePrivadaPem: string): string
function generarClavePem(): { privada: string; publica: string }          // para el alta y los tests
// ajustes-emision.ts
type AjustesEmision = { razonSocial: string; cif: string; direccion: string; credencialFirmaId: string; validadoGestoria: boolean }
const PROVEEDOR_FIRMA = "AEAT"; const ETIQUETA_FIRMA = "firma";
async function ajustesDeEmision(sb): Promise<{ ok: true; ajustes: AjustesEmision } | { ok: false; error: string }>
```
Sigue el patrón de `lib/descubrir/ajustes.ts`: cada fallo dice qué falta y dónde ponerlo («Falta el CIF del emisor: rellénalo en Ajustes → Economía»; «No hay en el llavero una credencial AEAT / firma: genérala en Ajustes → Economía»). Implementación de `firma.ts` con `crypto.generateKeyPairSync("ec", { namedCurve: "P-256", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } })`, `crypto.sign("sha256", Buffer.from(cadena, "utf8"), pem).toString("base64")`, `crypto.verify(...)`, y `crypto.createPublicKey(privadaPem).export({ type: "spki", format: "pem" })`.

**Tests:** firma/verificación con clave generada; firma alterada no verifica; cadena alterada no verifica; la pública derivada verifica. `ajustesDeEmision`: con la fila vacía → el error nombra el CIF (el primer campo que falta, en orden razón social → CIF → dirección); con datos pero sin credencial → el error nombra el llavero; con todo (el test guarda una credencial `AEAT/firma` con `escribirCredencial` y la borra después, y restaura los campos fiscales que hubiera) → `ok` con `credencialFirmaId`. Un colaborador → error de permiso (no de configuración).

- [ ] Pasos: tests rojos → implementar → verde → `tsc` 0 → commit `feat(atlas): la firma y la puerta de emision`.

---

