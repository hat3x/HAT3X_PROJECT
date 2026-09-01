## Tarea 4: Emitir, anular, rectificar

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/emision.ts`
- Test: `apps/atlas/src/tests/db/emision.test.ts`

**Interfaces (produce):**
```ts
type EntradaBorrador = { clienteId: string; serie: string; fechaEmision: string; fechaVencimiento?: string | null; ivaTipo: number; lineas: EntradaLinea[]; notas?: string | null }
async function crearBorrador(sb, e: EntradaBorrador): Promise<Ok & { id?: string }>        // origen 'atlas', estado 'borrador', numero null, tipo_factura 'F1'
async function guardarBorrador(sb, id, e: EntradaBorrador): Promise<Ok>                    // reemplaza líneas; solo si sigue borrador
async function borrarBorrador(sb, id): Promise<Ok>
async function emitir(sb, id, ahoraMs): Promise<Ok & { numero?: number }>
async function anular(sb, id, motivo: string): Promise<Ok>
async function rectificar(sb, id, ahoraMs): Promise<Ok & { id?: string }>                 // crea borrador R1 en serie 'R' con las líneas en negativo y rectifica_a; NO emite (el propietario revisa y emite)
async function eslabonesDeLaCadena(sb): Promise<Eslabon[]>                                 // emitidas+anuladas de Atlas ordenadas por huella_gen_en, con el CIF del emisor de ajustes
async function registrarEvento(sb, tipo, detalle: Record<string, unknown>, facturaId?: string | null): Promise<void>
```

**`emitir` en detalle:** `ajustesDeEmision` (si falla, devuelve su error) → `obtenerFactura` (borrador de Atlas con líneas; si no, error) → `usarCredencial(sb, credencialFirmaId, \`firma factura ${id}\`)` **una vez** → bucle (máximo 3): `rpc atlas_siguiente_emision(serie)` → `genEn = instanteMadrid(ahoraMs)` → `registro = { nifEmisor: cif, numSerie: numSerie(serie, numero), fechaExpedicion, tipoFactura, cuotaTotalCentimos: aCentimos(ivaCuota), importeTotalCentimos: aCentimos(total), huellaAnterior: punta, genEn }` → `huella = await huellaDe(registro)` → `firma = firmar(cadenaCanonica(registro), pem)` → `rpc atlas_emitir_factura(...)`; si `reintentar`, repite con `numero`/`punta` devueltos; al tercer reintento, error «La cadena se movió tres veces seguidas; inténtalo de nuevo.» Comentarios: por qué existe el bucle (§7.2) y por qué la clave se abre una vez por emisión (una fila en `credencial_usos` por firma, §7.3). **`rectificar`:** `registrarEvento("rectificacion", { original: id }, nuevoId)`.

**Tests** (propietario y colaborador reales; series propias `'TE4'` y las rectificativas en `'R'` limpiadas por `rectifica_a` de esa serie; datos fiscales y credencial preparados en `beforeAll` y restaurados/borrados en `afterAll`; punta de la cadena guardada y restaurada; limpieza de emitidas con `disable trigger` como en la tarea 1):
- crear borrador → sin número, origen atlas; guardar cambia líneas; un colaborador no crea.
- emitir sin CIF → error que nombra el CIF; con todo → `ok`, `numero` 1, `huella` de 64 hex, `firma` verificable con la pública derivada, evento `emision`, y `credencial_usos` con una fila nueva.
- **dos emisiones simultáneas** (`Promise.all([emitir(a), emitir(b)])`) → números 2 y 3 (en cualquier orden), y `verificarCadena(await eslabonesDeLaCadena(sb))` → `ok`.
- **sin huecos:** emitir (4), anular, emitir → 5; la anulada sigue en la cadena y la cadena verifica.
- rectificar → borrador `R1`, serie `R`, líneas negativas, `rectifica_a`; emitirlo → entra en la cadena con `TipoFactura=R1`.
- una emitida no se puede `guardarBorrador` ni `borrarBorrador` (mensaje claro, sin excepción).

- [ ] Pasos: rojo → implementar → verde dos veces → `tsc` 0 → commit `feat(atlas): emitir, anular y rectificar — la aplicacion calcula, la base garantiza`.

---

