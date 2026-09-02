# Salón OS — Roadmap del módulo de odontología

Plan de trabajo derivado del análisis competitivo del 2026-08-27 (mercado dental
español e internacional: Gesden, Clinic Cloud, Dentalink, DriCloud, XDentalCloud,
Open Dental, Dentrix Ascend, Curve, CareStack).

Este documento **no implementa nada por sí mismo**, igual que
[`roadmap-productizacion.md`](./roadmap-productizacion.md): fija el "qué", el "por qué"
y el orden, para que cada plan de fase en `docs/superpowers/plans/` lo herede en lugar
de re-decidirlo.

## Diagnóstico en una línea

El núcleo clínico ya está construido y es competitivo. Lo que falta se agrupa en tres
familias, y ninguna es clínica:

1. **Puente con el hardware** — el software no habla con el equipo de rayos ni con el escáner.
2. **Cumplimiento normativo** — firma, receta, trazabilidad y Verifactu.
3. **Circuito del dinero** — mutuas, aceptación de presupuestos, huecos perdidos.

## Línea de salida (ya construido, no re-hacer)

| Área | Dónde vive |
|---|---|
| Odontograma por diente FDI y superficie, con evolución | `odontogram_findings`, `/odontograma`, `src/lib/dental/catalog.ts` |
| Periodontograma por diente y por sitio | `perio_exam` · `perio_tooth` · `perio_site`, `/periodontograma` |
| Planes de tratamiento con fases e ítems | `treatment_plan` · `plan_phase` · `plan_item` |
| Historia clínica y notas de evolución | `clinical_records`, `visit_notes`, `/expediente` |
| Imágenes de paciente (7 modalidades + metadatos DICOM) | `patient_images`, bucket `patient-media` |
| Consentimientos con plantilla versionada | `consents` (9 tipos, incl. `rgpd`) |
| Ortodoncia: visitas, plan de pagos, laboratorio | `ortho_visit`, `ortho_payment_plan`, `ortho_installment`, `lab_order` |
| Mutuas: aseguradora, póliza y tarifa | `insurer`, `customer_insurance`, `insurer_service_price` |
| Almacén con lote y caducidad | `stock_movement`, `service_material` |
| Agenda con horario de clínica ∩ profesional | `salon_opening_hours`, `professional_schedules`, `src/lib/booking/` |
| Caja, facturación, arqueo, fichaje | `/tpv`, `/facturacion`, `/arqueo`, `/fichaje` |
| Reserva online, recordatorios, recall, recepcionista de voz | `/reservar`, `/recordatorios`, `src/lib/queries/recall.ts`, `/api/reception/*` |

## Convenciones que heredan TODAS las fases

Heredadas de los planes de ortodoncia y agenda; no repetirlas en cada plan de fase,
solo referenciar esta sección.

- Repo propio: `clients/projects/salon-os`. Rama por fase: `hat3x/HAT3X-0XX`.
- Toda tabla nueva lleva `salon_id` + RLS (`app.user_salon_ids()`, `app.has_salon_role()`).
  El aislamiento se comprueba también **a mano** en cualquier código que use el cliente admin.
- Sector gate: `salon.sector !== "odontologia"` en cada server action, y `SectorGate` en el
  layout de la ruta. RLS comprueba tenant, **no** sector.
- **RSC boundary:** los componentes cliente NUNCA importan de `@/lib/salon`. El `salonId` se
  resuelve en la server page y baja como prop.
- Dinero en céntimos. Fechas ISO `YYYY-MM-DD`. Instantes en UTC ISO-8601.
- Etiquetas de UI en español; enums y label maps en `src/lib/dental/*`, nunca en componentes.
- Migraciones por Supabase Management API (project-ref `jztoyekixcziaicrnlce`):
  `POST /v1/projects/{ref}/database/migrations`, `Content-Type: application/json`,
  cuerpo `{"query": "<SQL>", "name": "<nombre>"}`. **No** acepta SQL en crudo con
  `application/sql` — devuelve `400 Invalid input: expected object, received undefined`.
  Los planes de fase antiguos dicen lo contrario: están desactualizados.
- Verde obligatorio antes de desplegar: `npx tsc --noEmit` = 0 y suite Vitest completa.
- **Regla nueva de este roadmap:** todo lo que restrinja disponibilidad o cumplimiento
  **falla en cerrado**. Precedente: el horario de clínica fallaba en abierto y dejó dar citas
  fuera de horario (ver `src/tests/integration/booking-salon-hours-fail-closed.test.ts`).

Tamaños: **S** ≈ 1 semana · **M** ≈ 2-3 semanas · **L** ≈ 4-6 semanas · **XL** ≈ 8+ semanas.
Orientativos, para ordenar, no para comprometer fecha con cliente.

---

# BLOQUE A — Bloqueantes

Sin esto no se entra en clínicas nuevas, o se queda la clínica expuesta ante una
inspección. Es el bloque que decide si el módulo se puede vender.

## A1 · Captura de radiología desde el equipo — **L**

**Qué.** Que el dentista dispare la radiografía desde la ficha del paciente y la imagen
aterrice en `patient_images` sin pasar por el explorador de archivos.

**Por qué.** Es el gesto que se repite decenas de veces al día. Las comparativas españolas
marcan radiografía digital en **todas** las soluciones analizadas. Sin esto, la clínica deja
abierto el software del fabricante en paralelo y Salón OS queda de segunda pantalla — y la
demo se pierde con el módulo clínico ya construido.

**Principio de diseño: el equipo lo elige cada clínica, no nosotros.**
Salón OS es producto, no una instalación a medida para Biodental. Atarse a un fabricante
dejaría fuera a cualquier clínica con otro equipo, que son casi todas. Por eso **no hay
fabricante piloto**: hay una capa de adaptadores y una configuración por salón.

Y no hace falta elegir marca para empezar, porque **TWAIN es un estándar, no una marca**:
Carestream (CS1000/1200/1500), Vatech, Dürr VistaScan y los sensores de terceros bajo Planmeca
Romexis exponen driver TWAIN. La regla del sector es que cualquier sensor con driver TWAIN
funciona con cualquier software que acepte TWAIN. Una integración cubre lo que veinte
integraciones por marca cubrirían.

**Alcance técnico.**
- Agente local (servicio Windows) que hace de puente: la web no puede hablar con un sensor USB.
  Expone `localhost` con WebSocket, la SPA se conecta y recibe la imagen.
- **Registro de adaptadores**, con un contrato común (`capturar(peticion) → imagen + metadatos`).
  El agente descubre qué adaptadores hay disponibles en ese PC y los reporta; la clínica elige.
  Orden de construcción, de universal a específico:
  1. **Carpeta vigilada** — funciona con CUALQUIER equipo capaz de exportar a disco, incluidos
     ortopantomógrafos y escáneres. Es el suelo: ninguna clínica se queda fuera.
  2. **TWAIN** — la mayoría de sensores intraorales. Es el caso normal.
  3. **DICOM** (worklist / Storage SCP) — ortopantomógrafos y CBCT de gama alta.
  4. **SDK de fabricante** — solo donde compense. Aporta captura multiplexada y metadatos del
     sensor que TWAIN pierde; es mejora, no requisito de entrada.
- **Configuración por salón**, tabla `salon_imaging_device`: `salon_id`, `name` (como lo llama
  la clínica: "sensor del gabinete 2"), `adapter` (`carpeta` | `twain` | `dicom` | `sdk`),
  `settings` jsonb con lo propio de cada adaptador (ruta vigilada, nombre de la fuente TWAIN,
  AE title…), `modality` por defecto y `active`. Varios equipos por clínica: un sensor por
  gabinete y un OPG compartido es lo normal.
- Emparejamiento: la petición lleva `customer_id` + `fdi_code` + `modality`; el agente devuelve
  el binario y la fila se crea con `taken_at`, `taken_by` y `device` ya rellenos.
- `dicom_metadata` ya existe en el esquema: poblarlo de verdad, no dejarlo en `null`.
- Subida al bucket `patient-media` con path `{salon_id}/{customer_id}/{file}` (ya definido).

**Depende de.** Nada. Es la raíz de las dependencias del roadmap.

**Hecho cuando.** Desde `/odontograma`, con un paciente y un diente seleccionados, se dispara
una periapical en el equipo que esa clínica tenga configurado y aparece en su ficha en menos de
cinco segundos, sin intervención manual.

**Riesgo, y cómo se acota.** Es la única fase con componente instalable, y la única que no se
puede verificar del todo sin hardware delante. Se parte en dos para que la falta de un equipo
concreto no bloquee nada:

- **A1a — agente, contrato de adaptadores, carpeta vigilada y configuración por salón.**
  Se construye y se prueba **entera sin hardware**: la carpeta vigilada se testea dejando
  ficheros en un directorio. Es la mayor parte del trabajo.
- **A1b — adaptadores TWAIN y DICOM.** Requieren un equipo real para validar. Se cierran
  cuando haya acceso a uno.

**Los equipos de Biodental — lo que dijo la clínica y lo que dice la máquina.** No
coinciden, y hasta resolverlo no se puede dar de alta ningún equipo:

| Fuente | Fecha | Sensor intraoral | Panorámico |
|---|---|---|---|
| Nadia, de palabra | 2026-08-28 | Owandy / QuickVision | Gendex / VixWin |
| Diagnóstico sobre el PC de rayos (3ª pasada) | 2026-08-31 | **ImageSensor 3.0.2.8** + detector de red **Vieworks** — es lo que usan a diario | Gendex VixWin Platinum, con las imágenes en `C:\VXIMAGES`**`old`** — tiene toda la pinta de estar **retirado** |

**Manda la máquina.** Dar de alta un equipo con la carpeta del sistema retirado se
guarda sin protestar y falla el día que alguien dispara con el paciente en el
sillón: la captura vigila un directorio donde ya no aparece nada y vence a los 30
segundos. Un dato de configuración equivocado no da la cara al escribirlo, sino en
el peor momento posible.

**Lo único que falta para desbloquear A1 en Biodental:** dónde deja ImageSensor las
imágenes y cómo identifica al paciente. Es justo lo que la 3ª pasada del
diagnóstico va a buscar (`agent/tools/diagnostico-kairos-3-UNICO.bat`, se ejecuta en
el PC de rayos y deja `diagnostico-kairos-3.txt` en el Escritorio). **Su resultado no
consta en el repositorio**: o no se ha llegado a ejecutar, o el fichero no volvió.

Con esa ruta, el panorámico entra por **carpeta vigilada**, que es el adaptador ya
construido y probado de punta a punta —botón en la ficha, agente, subida—, sin tocar
A1b.

El nodo de recepción DICOM que se vio en la configuración del equipo (`XP-STR-SCP`,
`192.168.0.1:104`) sigue **sin habilitar**. En las notas no consta a cuál de los dos
aparatos pertenece esa pantalla, así que no se da por sabido.

TWAIN es Windows y captura de imagen suelta: es el suelo del producto, no el techo. Los SDK de
fabricante entran después, uno a uno y solo donde haya clientes que lo pidan.

**Estado (2026-08-28).** A1a construida casi entera:

| Pieza | Dónde | Estado |
|---|---|---|
| Protocolo navegador↔agente (orígenes + mensaje de captura) | `src/lib/imaging/protocol.ts` | ✅ con tests |
| Decisiones de carpeta vigilada (candidato, nuevo, volcado terminado) | `src/lib/imaging/watched-folder.ts` | ✅ con tests |
| Cliente del agente y traducción de errores | `src/lib/imaging/agent-client.ts` | ✅ con tests |
| Configuración de equipos por salón | `salon_imaging_device` + `src/lib/validations/imaging-device.ts` | ✅ migración aplicada |
| Acciones y pantalla *Ajustes → Equipos* | `src/app/(dashboard)/ajustes/equipos/` | ✅ con tests |
| Agente local (servidor, config, captura por carpeta) | `agent/` | ✅ compila; sin probar contra un equipo real |

**Última milla — cerrada el 2026-08-28:**

| Pieza | Dónde | Decisión |
|---|---|---|
| Token de emparejamiento | `salons.settings->imaging_agent` | Se comprobó que no se filtra: la RLS de `salons` solo deja leer a los miembros, y la RPC pública `get_salon_branding` no devuelve `settings`. Quien puede leerlo es quien está autorizado a radiografiar. |
| Escritura del token | RPC `set_salon_imaging_agent` | **Nunca un update directo.** Fusiona con `\|\|` para no pisar `single_resource` —que en Biodental impide dos pacientes en el mismo hueco— y solo puede tocar la clave `imaging_agent`. |
| Generación del token | `src/lib/imaging/pairing.ts` | 32 bytes de `crypto.getRandomValues` en base64url. Valida alfabeto además de longitud: el fallo real no es un ataque, es un copiado a medias con un espacio dentro. |
| Sección de emparejamiento | *Ajustes → Equipos de imagen* | El token no se enseña de entrada, y se avisa de que regenerarlo deja fuera a los agentes ya instalados. |
| Botón de capturar | `components/dental/capture-button.tsx` | **Si no hay agente, no se pinta nada.** Ni en gris ni con aviso: un botón permanentemente deshabilitado en cada ficha es ruido que alguien acabará pulsando. Reutiliza la misma Server Action que la subida manual, para que la imagen entre al expediente por una sola ruta. |

**Lo único que falta de A1a: probarlo contra un equipo real.** Nada de esto ha visto todavía una
radiografía de verdad. Para eso está `agent/tools/diagnostico-kairos.bat`, que recoge del PC de
la clínica la versión de Windows, los drivers TWAIN y su arquitectura, y el software de imagen
instalado — sin que nadie tenga que entrar en ese ordenador.

---

## A2 · Firma biométrica del consentimiento — **S**

**Qué.** Capturar una firma real sobre el consentimiento, no el nombre tecleado.

**Por qué.** Hoy `consents.signed_by_patient` es un `text` donde se escribe el nombre. Eso es
una anotación, no una firma, y el consentimiento informado es justo el documento que acaba en
un juzgado. Es la exposición legal más barata de cerrar de todo el roadmap.

**Alcance técnico.**
- Captura en tableta con `<canvas>` + Pointer Events: trazo, presión y tiempos.
- Sellar la firma contra el contenido exacto: hash de `body` + `template_version` + instante,
  guardados junto al trazo. Si el texto cambia después, la firma deja de validar.
- Generar el PDF firmado y guardarlo en `document_uri` (el campo ya existe).
- Columnas nuevas en `consents`: `signature_path`, `signature_hash`, `signed_ip`, `signed_device`.
- **No** tocar `body` ni `template_version`: la parte difícil ya está bien resuelta.

**Depende de.** Nada.

**Hecho cuando.** Un consentimiento de implante se firma en tableta, el PDF resultante incluye
el trazo y el sello, y modificar la plantilla después deja el consentimiento marcado como
"firmado sobre otra versión".

**Estado (2026-08-28): ✅ construida.** `src/lib/dental/signature.ts` (trazo),
`consent-seal.ts` (sello SHA-256 con serialización por longitudes), `consent-pdf.ts` (documento
archivado, con `pdf-lib`), `components/dental/signature-pad.tsx` (lienzo con Pointer Events) y
`signConsent` reescrita: exige trazo, sella con el contenido leído de BD y archiva trazo y PDF
ANTES de marcar nada. Migración `20260828100000_consent_signature.sql` **aplicada**.

Queda una decisión pequeña de UI: **cómo se etiquetan los 62 consentimientos firmados con el
modelo viejo**. Son distinguibles por `signature_path is null` y hay índice para ello; la
propuesta es "firmado sin trazo (anterior a la firma manuscrita)", que es la verdad y es más
útil que aparentar que son equivalentes.

---

## A3 · Trazabilidad de implantes y esterilización — **M**

**Qué.** Poder responder «este implante, con este UDI y este lote, se colocó a esta persona en
el 46 el día X», y «este instrumental se esterilizó en este ciclo, y con él se trató a estos
pacientes».

**Por qué.** El Reglamento (UE) 2017/745 exige identificador único **UDI** y seguimiento
individual de cada producto sanitario implantable, registrado en EUDAMED. La normativa española
de esterilización, vigente desde 2021, exige trazabilidad completa del material. Sin esto,
**ninguna clínica que ponga implantes puede usar Salón OS como sistema único** — y son las que
más facturan.

**Alcance técnico.**
- `implant_placement`: `salon_id`, `customer_id`, `fdi_code`, `udi`, `lot`, `ref`, `brand`,
  `diameter_mm`, `length_mm`, `placed_at`, `placed_by`, `appointment_id`, `plan_item_id`.
- `sterilization_cycle`: `salon_id`, `autoclave_id`, `cycle_number`, `program`, `started_at`,
  `result` (`ok` | `fallido`), `operator_id`, `ticket_path` (foto o impresión del ciclo).
- `sterilization_use`: enlaza ciclo ↔ `appointment_id`, que es lo que cierra la trazabilidad
  hacia el paciente.
- Lectura de UDI por cámara (GS1 DataMatrix) para no teclear el identificador a mano.
- Reutilizar `stock_movement.lot` / `.expiry`, que ya existen: son media pieza, falta el enlace
  al acto clínico.
- Informe exportable por paciente y por lote (lo que pide una inspección o una alerta sanitaria).

**Depende de.** Nada, pero se apoya en `plan_item` para ligar el implante al tratamiento.

**Hecho cuando.** Desde la ficha de un paciente se ve qué implantes lleva con su UDI, y desde un
lote se listan todos los pacientes afectados.

**Estado (2026-08-30): a medias, y con lo esencial en pie.**

| Pieza | Dónde | Estado |
|---|---|---|
| Lector de UDI GS1 (paréntesis y crudo, fechas, AI desconocidos) | `src/lib/dental/udi.ts` | ✅ 14 tests |
| Tablas + RLS (`implant_placement`, `sterilization_cycle`, `sterilization_use`) | migración `20260829110000` | ✅ aplicada |
| Validación del registro | `src/lib/validations/implant.ts` | ✅ 8 tests |
| Acción de registro con puerta de sector | `expediente/implant-actions.ts` | ✅ 8 tests |
| Consultas por paciente y **por lote** | `src/lib/queries/implants.ts` | ✅ 4 tests |
| Lista de implantes (ficha y alerta) | `components/dental/implant-list.tsx` | ✅ 7 tests |
| **Buscar por lote** → pacientes + teléfono marcable | `/expediente/lotes` | ✅ |
| Formulario de alta desde la ficha, con cámara | — | ⛔ pendiente |
| Ciclos de esterilización (alta y enlace a cita) | — | ⛔ pendiente |
| Informe exportable | — | ⛔ pendiente |

Decisiones que sostienen que el registro sirva:

- **El lector falla en cerrado.** Un GTIN a medias o una caducidad imposible se rechazan en vez
  de guardarse: en la ficha parecerían un dato bueno y fallarían el día que se buscan. Los AI que
  no interpretamos se conservan, y `udi_raw` guarda el código tal cual.
- **Día `00` es fin de mes** (regla GS1). Leerlo literal da una fecha inválida o el último día del
  mes anterior.
- **`customer_id` es `ON DELETE RESTRICT` y no hay política de `DELETE`.** Una trazabilidad que
  desaparece al borrar la ficha no es trazabilidad; corregir un error es un `UPDATE`, con rastro.
- **Un lote vacío no consulta.** Un `eq` con cadena vacía podría devolver media clínica y hacer
  creer que la alerta afecta a todos.
- **La búsqueda por lote trae teléfono marcable.** Lo siguiente que ocurre tras mirar esa lista es
  una llamada.

---

## A4 · Receta electrónica privada homologada (SREP) — **M**

**Qué.** Que la receta emitida desde Salón OS se pueda dispensar en farmacia.

**Por qué.** `prescription` emite hoy un documento propio. El Sistema Español de Receta
Electrónica Privada, regulado por los Consejos Generales de Médicos, Farmacéuticos, Dentistas y
Podólogos, exige software **homologado** para garantizar trazabilidad y unicidad frente a
falsificación. Sin homologación, la receta es papel con membrete y el dentista prescribe fuera
del sistema — llevándose el registro con él.

**Alcance técnico.**
- Integración con el nodo SREP: firma del prescriptor con certificado colegial, envío y
  recepción del identificador único de receta.
- Validar la colegiación del prescriptor: columna nueva en `professionals`.
- `prescription.status` pasa de `draft | issued` a incluir los estados del sistema
  (`dispensada`, `caducada`, `anulada`).
- Catálogo de medicamentos con código nacional (nomenclátor), en vez de texto libre.

**Depende de.** Nada técnico, pero **sí de un trámite externo**: la homologación no es código y
tiene plazos propios. Arrancar el expediente al inicio del bloque, aunque el código venga después.

**Hecho cuando.** Una receta emitida en Salón OS se dispensa en una farmacia real.

---

## A5 · Verifactu — **M**

**Qué.** Reponer el cumplimiento de facturación que se retiró en
`20260724120000_remove_verifactu.sql` (2026-07-24).

**Por qué.** El Real Decreto-ley 15/2025 aplazó la entrada en vigor: **1 de enero de 2027** para
sociedades y **1 de julio de 2027** para autónomos y profesionales. Retirarlo entonces fue
defendible; olvidarlo no lo es. Las clínicas dentales aparecen señaladas de forma explícita en
las guías del regulador porque emiten factura simplificada en volumen.

**Alcance técnico.**
- Registro de facturación encadenado e inalterable: huella de la factura anterior en cada
  registro (la parte que obliga a repensar el esquema de facturas).
- Código QR obligatorio en la factura.
- Remisión a la AEAT, o modo "no verificable" con registro conservado, según elija el cliente.
- Recuperar lo que se pueda del código retirado en lugar de partir de cero: revisar el diff de
  esa migración antes de diseñar.

**Depende de.** Nada.

**Cuándo.** No por prioridad, por calendario: **planificado en Q4 2026, entregado antes de
enero de 2027**. Si se retrasa más allá, el módulo de facturación deja de ser vendible.

---

# BLOQUE B — Operativas

Con el bloque A se entra en la clínica. Con el B se queda: es lo que decide si el
personal lo usa todo el día o vuelve a la hoja de cálculo.

## B1 · Circuito completo de mutuas — **L**

**Qué.** Todo lo que hay entre la tarifa y el cobro.

**Por qué.** `insurer_service_price` resuelve el precio. Falta el trabajo real: autorización
previa (Adeslas las emite con **90 días** de validez), acto ligado a esa autorización, remesa a
la compañía, conciliación del cobro y copago del paciente. Adeslas, Sanitas, DKV, Asisa y Mapfre
exigen a sus clínicas de cuadro facturación electrónica y autorizaciones digitales. Para una
clínica de cuadro esto **no es un módulo: es la mitad de sus ingresos**.

**Alcance técnico.**
- `insurance_authorization`: `insurer_id`, `customer_id`, `code`, `issued_at`, `expires_at`,
  `status`, servicios cubiertos.
- `plan_item.authorization_id` — el acto queda ligado a su autorización.
- `insurance_batch` (remesa) + `insurance_batch_line`: agrupación mensual por compañía.
- Conciliación: importe facturado vs. importe abonado, con diferencia y motivo.
- Copago: separar en la factura la parte de la compañía de la del paciente.
- **Informe clave:** actos aprobados y ejecutados que nadie ha facturado. Es dinero perdido
  que hoy nadie ve.

**Depende de.** Nada, pero conviene después de A5 para no rehacer la facturación dos veces.

---

## B2 · Gabinete como recurso y estado de llegada — **M**

**Qué.** Que la agenda sepa en qué sillón se atiende y que la recepción sepa quién ha llegado.

**Por qué.** Los estados de cita son hoy `pending · confirmed · completed · cancelled · no_show`:
no existe «ha llegado» ni «está en el gabinete», así que la recepción no sabe quién espera ni
desde cuándo. Y el gabinete no existe como recurso: en Biodental está resuelto con
`settings.single_resource = true`, que bloquea el hueco para **toda** la clínica. Sirve para una
consulta de un sillón y se rompe en cuanto haya dos ocupados a la vez.

**Alcance técnico.**
- `operatory` (gabinete): `salon_id`, `name`, `active`. `appointments.operatory_id`.
- El motor de disponibilidad pasa a intersectar **tres** cosas: horario de clínica ∩ horario del
  profesional ∩ gabinete libre. Toca `src/lib/booking/availability.ts` y
  `loadProfessionalDayInputs` en `src/lib/booking/server.ts`.
- Retirar `single_resource` una vez migrado Biodental, no antes.
- Ampliar `appointment_status` con `arrived` e `in_chair`, con instante de cada transición para
  poder medir espera real.
- Vista de sala de espera en `/day-panel`: quién espera, desde cuándo, en qué gabinete.

**Depende de.** Nada. **Cuidado:** toca el motor de disponibilidad, que es lo que usa la
recepcionista de voz. Cobertura de test antes de tocarlo.

---

## B3 · Lista de espera — **S**

**Qué.** Cubrir el hueco que deja una cancelación.

**Por qué.** Cuando cae una cita de las nueve de la mañana, hoy nadie sabe a quién llamar y el
hueco se pierde. **Es la carencia con mejor retorno por euro invertido de todo el roadmap:**
pacientes, teléfonos, recall y canal de WhatsApp ya están construidos.

**Alcance técnico.**
- `waitlist_entry`: `customer_id`, `service_id`, `professional_id` (o `any`), disponibilidad del
  paciente (franjas y días), `priority`, `expires_at`.
- Al cancelar una cita, buscar candidatos que encajen en el hueco liberado y proponerlos ordenados.
- Aviso por WhatsApp con confirmación en un toque, reutilizando `/recordatorios`.
- Métrica de cierre: huecos liberados vs. huecos recuperados.

**Depende de.** Nada. Candidata a ir en paralelo con A1, que es larga.

**Estado (2026-08-28): a medias.** Construido y con tests: el emparejamiento
(`src/lib/booking/waitlist.ts`), la validación (`src/lib/validations/waitlist.ts`) y las acciones
(`appointments/waitlist-actions.ts`). Migración `20260828120000_waitlist.sql` **aplicada**.

Dos decisiones tomadas al construirlo, por si conviene revisarlas:

- **Sin gate de sector.** Un hueco perdido lo es igual en una peluquería, y la tabla no tiene
  nada dental. Limitarlo a odontología habría sido regalar la función al resto de sectores.
- **`staff` puede apuntar gente.** Es operativa de mostrador; exigir owner/manager obligaría a
  molestar a la dueña cada vez que alguien dice "avísame si sale algo".

Falta: pantalla de lista de espera, enganchar la búsqueda de candidatos a la cancelación de una
cita, y el aviso por WhatsApp con confirmación en un toque.

---

## B4 · Laboratorio con caso digital — **M**

**Qué.** Convertir `lab_order` en un módulo de verdad.

**Por qué.** Hoy es el nombre del laboratorio en texto libre, tres fechas y una nota. No hay
catálogo, ni coste, ni aviso de retraso, ni el caso digital que define el flujo actual.

**Alcance técnico.**
- `lab` (catálogo): nombre, contacto, plazos habituales.
- `lab_order`: `lab_id` (FK, sustituye a `lab_name` texto), `cost_cents`, `due_at`,
  `status` explícito, `plan_item_id`.
- Caso digital: adjuntar el STL exportado por iTero, TRIOS o Medit, reutilizando la modalidad
  `scan_stl` que **ya existe** en `image_modality`.
- Alerta cuando se pasa `due_at` sin `received_at`.
- Informe de coste de laboratorio por tratamiento y por mes — hoy invisible en el margen.

**Depende de.** Nada.

---

## B5 · Indicadores propios de clínica — **S**

**Qué.** Que `/analitica` deje de ser un panel de comercio.

**Por qué.** Hoy muestra facturación, tickets, ticket medio, nuevos frente a recurrentes y
métodos de pago. Un director de clínica dental mira otras cosas. **Los datos ya están: no se
están contando.**

**Alcance técnico.** Vista dental de `/analitica`, gateada por sector:
- **Tasa de aceptación de presupuestos** — `treatment_plan.status` ya distingue `proposed` de
  `accepted`. Es el KPI número uno del sector.
- **Producción por profesional y por gabinete** (este último tras B2).
- **Tratamientos propuestos sin agendar** — `plan_item.state = 'propuesto'` sin
  `scheduled_appointment_id`. Cartera de trabajo ya vendida y sin ejecutar.
- **Ausencias** — `no_show` sobre total, por profesional y franja.
- **Eficacia del recall** — avisados vs. vueltos, sobre `src/lib/queries/recall.ts`.

**Depende de.** B2 para el desglose por gabinete; el resto es inmediato.

**Estado (2026-08-29): ✅ construida, con dos recortes declarados.**

| Indicador | Estado |
|---|---|
| Tasa de aceptación de presupuestos | ✅ `salon_dental_plan_acceptance` + `computeAcceptanceRate` |
| Presupuestos esperando respuesta | ✅ se reporta aparte de los rechazados |
| Tratamientos propuestos sin agendar | ✅ `salon_dental_unscheduled_work`, valorado en euros |
| Ausencias | ✅ `salon_dental_appointment_outcomes` + `computeNoShowRate` |
| Producción por profesional | ✅ ya existía (`getRevenueByProfessional`) |
| Producción por gabinete | ⛔ espera a B2 |
| Eficacia del recall | ⛔ **no hay dato**: el recall se DERIVA de la última visita (`selectPatientsDueForRecall`) y nadie registra que se avisó a un paciente. `whatsapp_reminder_queue` guarda recordatorios de cita, que no es lo mismo. Sin registrar el aviso no hay numerador. |

Las definiciones viven en `src/lib/metrics/dental.ts`, no en SQL, porque son la
parte que decide si el número sirve — y ahí están probadas en un solo sitio:

- **Aceptado incluye `in_progress` y `completed`.** Verificado contra datos
  reales: Biodental tiene `accepted: 0` pero 38 en curso y 24 terminados. Contar
  solo `accepted` daría 0 % a una clínica con 62 planes en marcha.
- **El borrador no entra en el denominador**: no se presentó a nadie.
- **La ausencia se mide sobre citas pasadas**, excluyendo canceladas (avisar no
  es faltar) y pendientes (la agenda futura diluye sin que nadie mejore nada).
- **Una tasa sin datos es `null`, no 0 %.** "Cero por ciento" afirma que se
  presentaron y los rechazaron; es una conclusión falsa y cara.

---

# BLOQUE C — Diferenciadoras

El bloque A y el B alcanzan al mercado. Este lo adelanta.

## C1 · La recepcionista de voz, como titular — **S**

**Qué.** Sacar la recepcionista de voz de *Ajustes → Complementos* y ponerla en el centro de la
propuesta de valor.

**Por qué.** Es la pieza que Gesden, Clinic Cloud y Dentalink **no tienen**. Las comparativas
españolas marcan «asistente con IA» en dos de siete soluciones, y se refieren a un chat de texto,
no a alguien que descuelga el teléfono y consulta la agenda real.

**Alcance técnico.** Poco código, mucho producto:
- Panel de la recepcionista: llamadas atendidas, citas dadas, citas evitadas fuera de horario,
  motivos de transferencia a la clínica.
- Configuración visible por el propio salón: qué servicios puede citar, qué deriva, qué anuncia.
- Que el horario que anuncia y el que puede reservar salgan de la misma fuente — ya es así desde
  el arreglo de `salon_opening_hours`, pero conviene fijarlo con test.

**Depende de.** Nada.

---

## C2 · IA sobre la radiografía — **M**

**Qué.** Integrar detección asistida (Pearl, Overjet, Diagnocat o Allisone) sobre las imágenes.

**Por qué.** Los propios fabricantes venden como resultado principal la **aceptación del
tratamiento**, no el diagnóstico: convierten un hallazgo en algo que el paciente entiende
mirando la pantalla. Es la mejor palanca comercial del roadmap.

**Alcance técnico.**
- Envío de la imagen al proveedor y vuelta con hallazgos anotados.
- Mapear el hallazgo del proveedor a `odontogram_findings` como **propuesta**, nunca como
  diagnóstico automático: lo confirma el profesional.
- Guardar proveedor, versión de modelo y confianza junto al hallazgo, para poder auditar.
- Consentimiento del paciente para el tratamiento automatizado de su imagen (RGPD).

**Depende de.** **A1.** Sin captura no hay volumen de imágenes que analizar. Va detrás por
dependencia, no por importancia.

---

## C3 · Presupuesto que se vende solo — **M**

**Qué.** Que el paciente reciba, entienda, firme y pague su plan desde el móvil.

**Por qué.** El odontograma es la mejor herramienta comercial de una clínica y hoy no sale del
software. La financiación integrada es lo que convierte un plan de cuatro mil euros en un plan
aceptado.

**Alcance técnico.**
- Vista pública del plan por enlace firmado y caducable, con el odontograma renderizado y el
  desglose por fases.
- Aceptación con firma (reutiliza **A2**) y estado que vuelve a `treatment_plan.status`.
- Pago o señal en línea, y financiación (Cofidis, Sequra, Aplazame, Pepper) como opción en el
  propio presupuesto.
- Extensión natural: que la cuenta de paciente que ya existe muestre **su plan**, no solo su cita.

**Depende de.** A2 para la firma.

---

# Orden vigente

Secuencia propuesta. Las fases de una misma línea pueden ir en paralelo si hay manos.

```
Q3 2026   A1a agente + adaptadores + carpeta ─┐   (larga; NO necesita hardware)
          A2 firma  ·  B3 lista de espera     │   (cortas, en paralelo)
          A4 SREP: abrir expediente ──────────┼─→ (trámite externo, plazo propio)
                                              │
Q4 2026   A1b TWAIN + DICOM ──────────────────┤   (cuando haya un equipo real delante)
          A3 trazabilidad  ·  B2 gabinetes    │
          A5 Verifactu ────────────────────────→  entregado antes de 2027-01-01
                                              │
Q1 2027   B1 mutuas  ·  B5 indicadores        │
          C2 IA radiografía ←──────────────────┘  (desbloqueada por A1)
          C1 recepcionista  ·  B4 laboratorio
          C3 presupuesto ← (A2)
```

**Ruta crítica:** A1a → A1b → C2. Es la cadena más larga y la que más valor comercial libera.
**Fecha dura:** A5 antes del 1 de enero de 2027.
**Trámite externo:** A4 depende de un tercero; abrirlo pronto aunque el código vaya después.
**Único punto que depende de hardware ajeno:** A1b. Todo lo demás se construye y se verifica
sin salir del repo — y A1a, que es el grueso de A1, también.

## Cómo empezar cada fase

Este documento es el "qué". Cada fase necesita su plan task-by-task en
`docs/superpowers/plans/AAAA-MM-DD-<fase>.md`, siguiendo el formato de
`2026-08-11-modulo-ortodoncia-fase1.md`: objetivo, arquitectura, constraints heredados de este
roadmap (por referencia, sin repetirlos) y tareas con test primero.

## Fuera de alcance

Decisiones tomadas para acotar. Revisar solo si un cliente lo pide y paga:

- **CAD/CAM y diseño de prótesis** — es el terreno de 3Shape y Exocad, no de un sistema de gestión.
- **Cefalometría y planificación quirúrgica 3D** — software especializado; integrar, nunca construir.
- **Visor DICOM completo** — mostrar la imagen sí, replicar un visor radiológico no.
- **Contabilidad y nóminas** — se exporta al gestor, no se construye.
- **Historia clínica interoperable con el sistema público** — no aplica a clínica privada dental.

---

*Fuente del análisis competitivo: informe del 2026-08-27, con inventario leído del esquema
(65 migraciones) y contraste con las guías comparativas del sector español e internacional.
Las carencias y su clasificación salen de ahí; la secuencia y el alcance técnico son de este
documento.*
