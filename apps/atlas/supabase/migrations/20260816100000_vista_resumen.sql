--
-- La vista elegida del Resumen se recuerda por usuario, igual que el tema y la
-- paleta: es una preferencia personal, no un ajuste del sistema.
--
-- Los GRANT no hacen falta aquí: son permisos de TABLA, y `perfiles` ya los
-- tiene desde el plan 1A. Añadir una columna no los cambia.
--

alter table perfiles
  add column vista_resumen text not null default 'control'
    check (vista_resumen in ('control', 'lista', 'oficina'));
