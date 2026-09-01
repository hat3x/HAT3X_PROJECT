# SDD ledger — plan: docs/superpowers/plans/2026-09-01-atlas-2e-emision.md

Spec: docs/superpowers/specs/2026-08-29-atlas-bloque-2-economia-design.md (§3.2, §4.1, §4.2, §4.7, §7, §9, §11, §12).
Rama: feature/atlas. Plan en e6b08c9. Briefs extraídos por «Tarea N».
Contexto: el usuario reafirmó «sigue» tras mi aviso de que 2E estaba bloqueado por
los datos fiscales y la gestoría; se construye con la puerta de emisión y el
aviso `validado_gestoria`. Los vectores de la huella son los del documento de
la AEAT v0.1.2 y los verifiqué con node:crypto antes de escribir el plan.

## Barrido previo

| Par | Produce / consume | Hallazgo |
|---|---|---|
| T1 ↔ T4 | RPC `atlas_emitir_factura(p_factura,p_numero,p_huella_anterior,p_huella,p_firma,p_gen_en)` / bucle de `emitir` | firmas coinciden; el bucle reintenta con `numero`/`punta` que la RPC devuelve |
| T1 ↔ T1 | disparador: `numero` de un borrador solo con `atlas.emitiendo='si'` / la RPC lo fija con `set_config(..., true)` antes del update | coherente; `current_setting(..., true)` no lanza si no existe |
| T1 ↔ T2 | `p_huella ~ '^[0-9A-F]{64}$'` / `huellaDe` devuelve hex mayúsculas | coherente |
| T2 ↔ T4/T5 | `RegistroAlta` con `cuotaTotalCentimos`/`importeTotalCentimos` / `emitir` convierte `ivaCuota`/`total` (números de `Factura`) con `aCentimos` | coherente |
| T3 ↔ T4 | `ajustesDeEmision` devuelve `credencialFirmaId`; `usarCredencial` devuelve el PEM | coherente |
| T1 ↔ tests | limpiar emitidas exige `disable trigger` en tests | regla escrita en T1 y T4 |
| T5 ↔ 2C/2B | rama `{"cadena": true}` en `avisar`, tipo `cadena` en `notificaciones` | el check se recrea en T1 |

| Tarea | Consistencia interna | Hallazgo |
|---|---|---|
| T1 | `atlas_siguiente_emision` en SQL con `where atlas_es_propietario()` devuelve 0 filas al colaborador; la RPC de emisión lo llama como definer (propietario ya comprobado) | ok; el test del colaborador espera `ok:false` por la comprobación previa |
| T1 | el `select numero, punta into sig, punta_actual from atlas_siguiente_emision(f.serie)` dentro de la RPC: el `where atlas_es_propietario()` sigue siendo cierto (mismo auth.uid) | ok |
| T2 | `instanteMadrid`: `Math.floor(ms/1000)*1000` descarta milisegundos para que el desfase sea entero | ok; test con instantes exactos |
| T4 | «numeración sin huecos»: anular no libera número; el siguiente es max+1 sobre emitidas+anuladas | coherente con `atlas_siguiente_emision` (`estado <> 'borrador'`) |
| T7 | `qrcode.react` ya es dependencia (`alta-2fa`) | ok |

Ruling 1: las tareas 3–8 llevan interfaz y comportamiento, no código transcrito; cada brief nombra su fichero modelo. El implementador es sonnet como mínimo.
Ruling 2: la limpieza de emitidas en tests usa `alter table facturas disable trigger facturas_inmutables` (y el de líneas) SOLO dentro de la limpieza de tests, con comentario; la alternativa —no poder limpiar— envenena la serie de prueba para siempre.

## Tarea 1
- BASE: e6b08c9

## Tarea 2
- BASE: e6b08c9 (en paralelo con la 1; ficheros disjuntos: lib/facturas/huella.ts y su test)
- Tarea 1: implementada por a3a5c04069995c052 (cf6a4ac). 10/10 x2; suite 777/777; tsc 0. Desviaciones: la limpieza apaga también factura_eventos_inmutables; adaptador tipado para null. Aviso: punta tipada string pero puede ser null.
- Tarea 2: implementada por a636922ec56f56a49 (f7d1fa7). 12/12; tsc 0; vectores AEAT sin ajustes. HEAD cf6a4ac. Revisiones 1 y 2 en marcha.

## Tarea 3
- BASE: cf6a4ac (en paralelo con las revisiones de 1 y 2; ficheros disjuntos)
- Tarea 1: revisión — cumplimiento ✅; 3 Importantes (I1 un borrador puede pasar a emitida fuera de la RPC; I2 series compartidas entre externas y Atlas bloquean el correlativo; I3 una línea de emitida se puede mover a un borrador) + 7 Menores, entre ellos M7 HEREDADO DEL BLOQUE 1: `perfiles_propio` + grant update sin restricción de columnas → un colaborador puede ponerse `es_propietario = true`.
Ruling 3: todo se arregla en una migración NUEVA `20260901101000_emision_cierres.sql` (la aplicada no se toca): I1 (estado y columnas de cadena de un borrador solo con atlas.emitiendo), I3 (factura_id de una línea no cambia), I2 (tabla `series_facturas(serie pk, origen)` alimentada por trigger al insertar: una serie es de un solo origen), M1 (cobrada_en no en anuladas; fecha_vencimiento inmutable; notas editable), M4 (p_firma/p_gen_en not null en la RPC), M5 (eventos insertables por PostgREST solo de tipos exportacion/config_fiscal), M7 (trigger en perfiles: `es_propietario` solo lo cambia un propietario), y M3/M6 en el test (disable trigger dentro de una transacción; tests que faltan). M2 pasa a regla para la tarea 4: ningún evento apunta a un borrador. Coste si me equivoco: una migración más; nada de esto se puede dejar en una cadena fiscal.
- Tarea 2: revisión — cumplimiento ✅; 3 Menores (engines en package.json; JSDoc de verificarCadena sobre el orden; test de recorte para los cinco campos). Ronda 1/5.
- Tarea 3: implementada por ab455cca013e0074f (52690ec). Suite 790/790; tsc 0. Desviación aceptada (Ruling 4): con la fila vacía el primer error nombra la razón social, que es el orden documentado; leerAjustes gana validado_gestoria. Revisión pendiente.

## Tarea 4
- BASE: 52690ec (en paralelo con las rondas de 1 y 2; ficheros disjuntos)
- Docker Desktop estaba parado: la suite de la tarea 4 no se pudo verificar de entrada. Lanzado; se reintenta.
- Revisiones despachadas: ronda 1 de tarea 1, ronda 1 de tarea 2, y tarea 4 (implementada en ef04569, sin informe: el agente se cortó por 429).
- BLOQUEO DE ENTORNO (no de código): Windows reservó el rango TCP 54278-54377 al
  reiniciar, y el 54322 (Postgres de Supabase local) cae dentro. `supabase start`
  falla con «ports are not available … bind: forbidden». Diagnóstico verificado:
  `netsh interface ipv4 show excludedportrange` lista el rango; el contenedor
  respondía por dentro (`pg_isready` ok) pero `docker port` no publicaba nada;
  nadie escucha en 54322. Arreglo: reiniciar el servicio `winnat` COMO
  ADMINISTRADOR (`Restart-Service winnat -Force`) y luego `npx supabase start`.
  Sin admin no se puede; queda para el usuario.
- Consecuencia: no se pueden ejecutar los tests que tocan la base. Lo verificado
  hasta aquí por revisión de código sigue en pie; lo que NO se ha verificado
  ejecutando es la suite de la tarea 4 (ef04569).
- Tarea 1: ronda 1 re-revisada — 9/9 ADDRESSED, 4 desviaciones justificadas, sin
  roturas. complete (cf6a4ac, b378a29).
- Tarea 2: ronda 1 aplicada (9fab37b), 19/19. complete (f7d1fa7, 9fab37b).
- Tarea 4: revisión — cumplimiento ✅ con 2 desviaciones justificadas (las líneas
  de la rectificativa no pueden ser negativas por el check del 2A: el signo vive
  en R1 y se aplica al construir el registro AEAT; y el evento `rectificacion`
  no se inserta porque la política M5 solo deja `exportacion`/`config_fiscal`
  desde PostgREST y el brief global prohíbe eventos sobre borradores). Calidad
  aprobada con 6 Menores.
Ruling 5: los Menores 1 (registrarEvento admite un borrador → lo haría
imborrable), 2 (guardarBorrador no compensa si falla el insert de líneas) y 4
(usarCredencial lanza en vez de devolver Ok) se arreglan; el 3 (la suite asume
cadena vacía) y el 5 (comentario inexacto) también, por baratos. El 6 —no
existe camino que escriba el evento `rectificacion`— SE APARCA con puntero: si
la gestoría lo exige, es una RPC nueva; hoy la trazabilidad está en
`rectifica_a` más el evento `emision` de la rectificativa.
