## Tarea 6: Las pantallas de emisión

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/acciones-emision.ts` (`crearBorradorAccion`, `guardarBorradorAccion`, `borrarBorradorAccion`, `emitirAccion` (pasa `Date.now()`), `anularAccion`, `rectificarAccion`, `marcarValidadoGestoria`, `generarClaveFirmaAccion`)
- Crear: `apps/atlas/src/components/dinero/FormBorrador.tsx` (cliente, fecha, vencimiento, IVA, líneas dinámicas con concepto/cantidad/precio/proyecto; céntimos por `aCentimos`; sin líneas → error)
- Crear: `apps/atlas/src/components/dinero/AccionesFactura.tsx` (Emitir con `confirm()` que enseña serie y avisa de que es irreversible; Anular con motivo; Rectificar; Imprimir como enlace)
- Crear: `apps/atlas/src/app/dinero/facturas/nueva/page.tsx`, `apps/atlas/src/app/dinero/facturas/[id]/page.tsx` (borrador editable; emitida: solo lectura con huella, firma recortada, eventos)
- Modificar: `apps/atlas/src/app/dinero/page.tsx` (botón «Nueva factura», estado y enlace por fila, aviso «Pendiente de validar por la gestoría» mientras `validado_gestoria` sea falso, con botón para marcarlo)
- Modificar: `apps/atlas/src/app/ajustes/economia/page.tsx` + `FormEconomia` (botón «Generar clave de firma» → `generarClaveFirmaAccion`: `generarClavePem` + `escribirCredencial` (`AEAT`/`firma`, global) + evento `config_fiscal`; deshabilitado si ya existe, con «Rotar» que crea otra y deja evento); `escribirAjustes` deja evento `config_fiscal` cuando cambian razón social/CIF/dirección (con `registrarEvento`)
- Tests: `src/tests/componentes/form-borrador.test.tsx`, `src/tests/componentes/acciones-factura.test.tsx`

- [ ] Pasos: tests → componentes → pantallas → `tsc` 0, suite, `npm run build` con las rutas nuevas → commit `feat(atlas): borradores, emision, anulacion y rectificativa en pantalla`.

---

