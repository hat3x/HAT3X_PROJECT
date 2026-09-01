## Tarea 8: Documentación y el aviso de la gestoría

- `README.md`: emisión (flujo borrador → emitir → imprimir), cadena y verificador, exportación, presupuesto mensual; **qué está pendiente de la gestoría** (RegistroAnulacion con huella propia; lista exacta de campos del registro; formato del QR no VERI\*FACTU; texto del documento).
- `MANTENIMIENTO.md`: «una emisión dice reintentar tres veces» (otra emisión en curso; esperar), «la cadena está rota» (qué mirar: evento `anomalia`, `cadena_facturas.punta`, la exportación; nunca editar la factura: rectificar), «no se puede emitir» (la puerta: CIF, dirección, clave de firma), cómo rotar la clave de firma (nueva credencial + evento), el cron `atlas-cadena` y que pg_cron corre en UTC, y que las series de prueba de los tests (`TE1`, `TE4`, `TE5`) no son series reales.
- Commit `docs(atlas): emision — como se emite, como se vigila la cadena y que valida la gestoria`.

---

