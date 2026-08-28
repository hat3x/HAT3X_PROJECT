-- Dos sellos, porque una incidencia avisa dos veces.
--
-- `notificada_en` nació como candado único contra el doble envío, y funciona
-- para la apertura. El problema aparece al cerrar: la fila sigue sellada de
-- cuando se avisó que estaba caído, así que la consulta de pendientes nunca la
-- vuelve a ver. El aviso de «ya funciona» no llegaba nunca.
--
-- Un campo no puede marcar dos eventos distintos de la misma fila. Este es el
-- segundo.

alter table incidencias
  add column recuperacion_notificada_en timestamptz;

comment on column incidencias.notificada_en is
  'Cuándo se avisó de la apertura. Candado contra el doble envío.';
comment on column incidencias.recuperacion_notificada_en is
  'Cuándo se avisó de la recuperación. El mismo candado, para el cierre.';

-- Las incidencias que ya estaban cerradas antes de esta migración se dan por
-- avisadas: nadie quiere despertarse con las recuperaciones de la semana
-- pasada por haber añadido una columna.
update incidencias
   set recuperacion_notificada_en = cerrada_en
 where cerrada_en is not null;

-- El vigía cierra incidencias todo el rato y el que avisa busca por este
-- criterio exacto cada minuto. Sin índice es un recorrido completo.
create index if not exists incidencias_recuperacion_pendiente_idx
    on incidencias (cerrada_en)
 where cerrada_en is not null and recuperacion_notificada_en is null;
