## Tarea 7: El documento con QR, la exportación y el presupuesto mensual

**Ficheros:**
- Crear: `apps/atlas/src/lib/facturas/qr.ts` (pura: `urlQr({ nif, numSerie, fechaEmision, totalCentimos })` → `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu?nif=…&numserie=…&fecha=dd-mm-aaaa&importe=123.45`, con `encodeURIComponent`; test)
- Crear: `apps/atlas/src/components/facturas/Qr.tsx` (`"use client"`, `QRCodeSVG` de `qrcode.react`, `level="M"`, 128 px)
- Crear: `apps/atlas/src/app/facturas/[id]/imprimir/page.tsx` (página imprimible A4 con CSS propio en la página, mismo estilo que `clients/projects/biodental/facturacion/presupuesto-2026-08.html`; emisor desde `ajustes_economia`; cliente; líneas; base/IVA/total; `serie-numero`; fecha; huella completa en pie pequeño; QR; si es borrador, marca de agua «BORRADOR — sin validez»; si anulada, «ANULADA»; si rectificativa, «Rectifica a …»)
- Crear: `apps/atlas/src/app/api/facturas/exportar/route.ts` (propietario con sesión; JSON `{ emisor, generadoEn, eslabones: Eslabon[], eventos }`; evento `exportacion`; colaborador → 403)
- Crear: `apps/atlas/src/app/clientes/[slug]/presupuesto/page.tsx` (imprimible; mes por `?mes=`; líneas = contratos activos del cliente en ese mes, `cuota_mensual` como línea por proyecto y cada `addon` como línea informativa de 0 €; total; leyenda «Este documento no tiene validez fiscal»; nota «Actividad del periodo: pendiente de los conectores»)
- Modificar: fichas de cliente (enlace «Presupuesto del mes») y de factura (enlace «Imprimir»); `scripts/humo.mjs` con `/dinero/facturas/nueva` (`exige: ["Nueva factura"]`)
- Tests: `src/tests/facturas/qr.test.ts`; `src/tests/api/exportar.test.ts`

- [ ] Pasos: tests → código → `tsc` 0 → `npm run build` → commit `feat(atlas): el documento imprimible con QR, la exportacion y el presupuesto mensual`.

---

