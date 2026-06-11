# Ejemplo de Salida — Skill onboarding-hat3x

Este documento muestra cómo debe verse el STATUS devuelto por el skill tras una ejecución exitosa. Usado como referencia para validar el formato de salida.

---

## Caso: NovaMed — Automatización de Historiales Clínicos

**Input usado:** `onboarding/examples/input-demo.json`
**Fecha de ejecución:** 2026-04-01
**Ejecutado por:** onboarding-hat3x skill

---

## STATUS DE SALIDA

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
- La fecha de inicio (2026-04-15) se usó como referencia para YYYY-MM → carpeta 2026-04.
- El campo `branding.color_scheme` no se usa en plantillas Markdown; ignorado sin impacto.
- `portal_cliente.provisioned: false` → documento 07 incluye nota de pendiente de provisión;
  placeholder {{TEMP_PASSWORD_PLACEHOLDER}} mantenido visible con nota explicativa.
- El alcance excluido ("soporte post-go-live prolongado más de 3 meses") se tomó literalmente del input.
- La jurisdicción "España — Madrid" se aplicó al contrato base; pendiente confirmación de asesoría legal.

MISSING_DATA:
- `legal.confidencialidad`: no especificada en input → se usó cláusula estándar de la plantilla base
  con placeholder {{CONFIDENCIALIDAD}}. Acción: confirmar términos específicos antes de firma.
- `legal.propiedad_intelectual`: no especificada en input → se usó cláusula estándar de la plantilla
  base con placeholder {{PROPIEDAD_INTELECTUAL}}. Acción: confirmar términos antes de firma.
- `cliente.telefono`: no provisto en input → {{PENDIENTE_CONFIRMAR}} en contrato (cláusula de partes).

WARNINGS:
- El contrato base (05) es un borrador. La leyenda de borrador ha sido verificada como presente.
  NO enviar sin revisión de asesoría jurídica.
- El portal no está provisionado. El documento 07 incluye nota de pendiente. Provisionar antes de
  enviar el paquete al cliente o enviar explícitamente como "acceso pendiente".

NEXT_STEP:
1. Revisar MISSING_DATA con el equipo legal → completar {{CONFIDENCIALIDAD}} y
   {{PROPIEDAD_INTELECTUAL}} antes de enviar el contrato al cliente.
2. Provisionar acceso al portal para novamed@novamed.es → actualizar documento 07 con credenciales
   reales (enviadas por canal seguro, NO por email plano).
3. Completar {{CLIENTE_TELEFONO}} en contrato → confirmar con NovaMed.
4. Enviar paquete de onboarding al cliente (excepto 08_checklist_arranque_interno, que es interno).
5. Programar kickoff con {{RESPONSABLE_CLIENTE}} para la semana del 2026-04-15.
```

---

## Contenido de 00_metadata.json Generado

```json
{
  "generated_at": "2026-04-01T10:30:00Z",
  "generated_by": "onboarding-hat3x skill v1.0",
  "client_slug": "novamed",
  "client_name": "NovaMed",
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
  "missing_data": [
    "legal.confidencialidad",
    "legal.propiedad_intelectual",
    "cliente.telefono"
  ],
  "assumptions": [
    "YYYY-MM derivado de fecha_inicio",
    "portal_cliente.provisioned: false — documento 07 con nota de pendiente",
    "Cláusulas legales estándar aplicadas para campos no especificados"
  ],
  "portal_provisioned": false,
  "contract_status": "BORRADOR — pendiente revisión legal",
  "package_ready_for_client": false,
  "blocking_issues": []
}
```

---

## Notas sobre este Ejemplo

- `package_ready_for_client: false` porque hay MISSING_DATA que afectan al contrato
- Cuando MISSING_DATA esté vacío y el portal provisionado → `package_ready_for_client: true`
- El STATUS COMPLETE indica que los archivos se generaron; no implica que el paquete está listo para enviar
- La diferencia entre COMPLETE y PARTIAL: COMPLETE = todos los documentos generados (aunque con placeholders pendientes); PARTIAL = algún documento no pudo generarse
