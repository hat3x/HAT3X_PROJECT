# Output Demo — Onboarding NovaMed

**Skill invocado:** `/onboarding-hat3x`
**Input:** `onboarding/examples/input-demo.json`
**Fecha de ejecución:** 2026-04-01T10:30:00Z
**Agente:** onboarding-coordinator v1.0

---

## STATUS DE EJECUCIÓN

```
STATUS: COMPLETE

FILES_CREATED:
- onboarding/clients/novamed/2026-04/00_metadata.json
- onboarding/clients/novamed/2026-04/01_carta_bienvenida.md
- onboarding/clients/novamed/2026-04/02_resumen_ejecutivo.md
- onboarding/clients/novamed/2026-04/03_roadmap_proyecto.md
- onboarding/clients/novamed/2026-04/04_propuesta_presupuesto.md
- onboarding/clients/novamed/2026-04/05_contrato_base.md
- onboarding/clients/novamed/2026-04/06_guia_portal_cliente.md
- onboarding/clients/novamed/2026-04/07_acceso_portal_cliente.md
- onboarding/clients/novamed/2026-04/08_checklist_arranque_interno.md
- onboarding/clients/novamed/2026-04/09_indice_paquete_onboarding.md

FILES_CREATED: 10

ASSUMPTIONS:
1. CLIENT_SLUG tomado de `cliente.nombre_slug`: "novamed"
2. YYYY-MM derivado de `comercial.fecha_inicio` (2026-04-15): carpeta "2026-04"
3. `portal_cliente.provisioned: false` → documento 07 incluye nota de pendiente de provisión
   con fecha estimada 2026-04-17. Placeholder {{TEMP_PASSWORD_PLACEHOLDER}} mantenido visible.
4. `branding.color_scheme: "hat3x_default"` — no afecta a plantillas Markdown; ignorado.
5. Las fechas de hitos intermedios del roadmap (H1 a H4) se marcaron como {{PENDIENTE_CONFIRMAR}}
   ya que el input no las provee. Se definirán en kickoff del 2026-04-15.
6. El desglose económico por fase se marcó como {{PENDIENTE_CONFIRMAR}} ya que el input
   solo provee el total y los hitos de facturación, no el desglose por fase.

MISSING_DATA:
- Ningún campo required del schema está ausente en este input.
- Campos opcionales no provistos (impacto menor, registrados para transparencia):
  * `proyecto.riesgos_conocidos` → incluido en el input. Sin impacto.
  * Desglose de precio por fase → marcado como {{PENDIENTE_CONFIRMAR}} en 04_propuesta y 03_roadmap.
    Acción: completar en kickoff y actualizar los documentos.
  * Hitos de fechas intermedias (H1-H4) → marcados como {{PENDIENTE_CONFIRMAR}}.
    Acción: definir en kickoff y actualizar 03_roadmap.

WARNINGS:
1. CONTRATO (05): Documento generado como BORRADOR. La leyenda de borrador ha sido
   verificada como presente al inicio y al final del documento. NO enviar sin revisión
   de asesoría jurídica. El campo `legal.propiedad_intelectual` estaba provisto en el
   input y se ha incorporado literalmente — verificar con asesoría.
2. PORTAL (07): Acceso no provisionado. El documento 07 incluye nota visible de
   "pendiente de provisión" con fecha estimada 2026-04-17. Provisionar antes de enviar
   el paquete o enviar el paquete con esta nota explícita.
3. CHECKLIST INTERNO (08): Este documento NO debe incluirse en el paquete enviado
   al cliente. Es solo para uso interno del equipo HAT3X.

NEXT_STEP:
1. Revisar los documentos generados en onboarding/clients/novamed/2026-04/
   — especialmente 05_contrato_base.md con asesoría legal.
2. Provisionar acceso al portal para novamed@novamed.es antes del 2026-04-17.
   Enviar credenciales reales a María García López por canal seguro (no email plano).
   Actualizar 07_acceso_portal_cliente.md con credenciales reales una vez provisionado.
3. Definir desglose económico por fase y fechas de hitos intermedios en kickoff
   del 2026-04-15. Actualizar 03_roadmap_proyecto.md y 04_propuesta_presupuesto.md.
4. Enviar paquete al cliente (documentos 01 a 07 y 09). Excluir 08_checklist_arranque_interno.
5. Programar kickoff con Javier Martínez Ruiz para la semana del 2026-04-15.
6. Actualizar memoria/clientes.md con el registro de NovaMed.
```

---

## Fragmento de 01_carta_bienvenida.md Generado

```markdown
# Carta de Bienvenida — Automatización de Historiales Clínicos

**Fecha:** 2026-04-15
**Para:** María García López — NovaMed
**De:** [Responsable HAT3X] — HAT3X

---

Estimada María García López,

El proyecto **Automatización de Historiales Clínicos** arranca hoy. Este paquete de onboarding
recoge todo lo que necesitas para comenzar con claridad: el alcance acordado, el plan de
ejecución, los documentos contractuales y las instrucciones de acceso al portal de seguimiento.
...
```

---

## Contenido de 00_metadata.json Generado

```json
{
  "generated_at": "2026-04-01T10:30:00Z",
  "generated_by": "onboarding-hat3x skill v1.0",
  "client_slug": "novamed",
  "client_name": "NovaMed",
  "client_name_legal": "NovaMed Solutions S.L.",
  "project_name": "Automatización de Historiales Clínicos",
  "period": "2026-04",
  "templates_used": [
    "01_carta_bienvenida",
    "02_resumen_ejecutivo",
    "03_roadmap_proyecto",
    "04_propuesta_presupuesto",
    "05_contrato_base",
    "06_guia_portal_cliente",
    "07_acceso_portal_cliente",
    "08_checklist_arranque_interno",
    "09_indice_paquete_onboarding"
  ],
  "missing_data": [],
  "assumptions": [
    "CLIENT_SLUG desde nombre_slug del input: novamed",
    "YYYY-MM desde fecha_inicio: 2026-04",
    "portal_cliente.provisioned: false — nota de pendiente incluida en documento 07",
    "Fechas de hitos intermedios marcadas como PENDIENTE_CONFIRMAR",
    "Desglose económico por fase marcado como PENDIENTE_CONFIRMAR"
  ],
  "portal_provisioned": false,
  "portal_estimated_provision": "2026-04-17",
  "contract_status": "BORRADOR — pendiente revisión legal",
  "package_ready_for_client": true,
  "blocking_issues": [],
  "files_output_path": "onboarding/clients/novamed/2026-04/"
}
```

---

## Notas de Interpretación

- `STATUS: COMPLETE` indica que todos los documentos se generaron. No garantiza que el paquete esté listo para enviar.
- `package_ready_for_client: true` en este caso porque no hay MISSING_DATA en campos obligatorios. Los PENDING son campos opcionales o definibles en kickoff.
- El contrato siempre requiere revisión legal independientemente del STATUS.
- Los documentos con `{{PENDIENTE_CONFIRMAR}}` son válidos para enviar al cliente con la nota de que se completarán en kickoff.
