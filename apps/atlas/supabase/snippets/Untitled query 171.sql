delete from proyectos where slug like '%prueba-migracion'
   or slug in ('proy-vigia-prueba','proy-e2e-silenciar');
delete from clientes where slug like '%prueba-migracion';
