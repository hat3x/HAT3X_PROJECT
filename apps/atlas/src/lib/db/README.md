# Reglas de acceso a datos

1. **Los contratos SIEMPRE se leen de la vista `contratos_visibles`, nunca de la
   tabla `contratos`.** La tabla tiene la lectura revocada para el rol
   `authenticated`; la vista es la que decide qué filas se ven y anula
   `cuota_mensual` y `notas` cuando quien consulta no es propietario. Leer de la
   tabla desde la aplicación fallará con «permission denied», y así debe ser.

2. Las escrituras sobre `contratos` van a la tabla y solo las permite el
   propietario.

3. **Ningún módulo de este directorio se importa desde un componente
   `"use client"`.** Arrastran `next/headers` y rompen la compilación. El rol y
   los permisos se calculan en el componente de servidor y se pasan como props.

## Por qué la vista no es `security_invoker`

Parece la opción natural, pero no funciona: una vista con privilegios del
invocador heredaría el veto de lectura de la tabla, y el editor no vería **ni
siquiera las filas sin importe**. La vista usa privilegios del definidor
(comportamiento por defecto) y aplica ella misma las dos reglas: qué filas se
ven (`atlas_ve_proyecto`) y qué columnas se anulan (`atlas_es_propietario`).

## Permisos de tabla y RLS son cosas distintas

RLS filtra **filas**; antes hace falta `GRANT` sobre la **tabla**. Las tablas
creadas por migraciones propias no lo reciben solas — se conceden explícitamente
en `20260815100300_rls.sql`. Si añades una tabla nueva y olvidas el `GRANT`, el
síntoma es `permission denied for table …`, no una lista vacía.
