# Task 6 — Report: `/ortodoncia` en subsecciones por pill-tabs

## ui-ux-pro-max — invocación y aplicación

Invoqué la skill `ui-ux-pro-max:ui-ux-pro-max` (herramienta Skill) antes de tocar el JSX, tal
como exige el brief. Su guía está orientada principalmente a producto móvil (React
Native/iOS/Android), pero la tabla de reglas por prioridad (Accessibility, Touch &
Interaction, Style Selection, Layout & Responsive, Animation, Navigation Patterns) sigue
siendo aplicable a una barra de tabs web. Como el componente `PillTabs` (Task 1,
`src/components/ui/pill-tabs.tsx`) ya existe y su propio comentario dice explícitamente
"Mismo patrón visual que el conmutador día/semana/mes de la agenda", la decisión de diseño
correcta — y la que aplica la regla de **consistencia/style-match** de la skill — era
reutilizarlo tal cual, sin crear una variante nueva ni tocar sus estilos.

Verifiqué contra el checklist antes de dar por bueno el resultado:
- **Navigation / nav-state-active**: el pill activo ya usa `bg-primary` + `border-primary`
  + `shadow-sm` frente a `border-border text-muted-foreground` en los inactivos — estado
  activo inequívoco, no depende solo del color (también cambia fondo/borde/sombra).
- **Accessibility**: `PillTabs` ya expone `role="tablist"` / `role="tab"` /
  `aria-selected`; añadí `ariaLabel="Secciones de ortodoncia"` para que el `tablist` tenga
  nombre accesible (regla `aria-labels`).
- **Layout & spacing**: mantuve el ritmo `space-y-6` que ya usa el resto del componente
  (regla `spacing-scale` / 4-8pt rhythm) tanto en el contenedor exterior como dentro de la
  pestaña "Ficha y tratamiento" (que agrupa 3 bloques).
- **Animation**: `PillTabs` ya anima con `transition-all duration-200 ease-apple-out`
  (dentro del rango 150-300ms recomendado) — no había que tocar nada ahí.
- **Touch target**: los pills (`px-3.5 py-1.5 text-sm`) son consistentes con el resto de la
  UI de escritorio del proyecto (mismo patrón que el switcher día/semana/mes); no se
  modificó `PillTabs` porque está fuera del alcance de esta tarea (ya construido en Task 1
  y reutilizado en más de un sitio).
- **Consistency**: cero componentes de tabs nuevos — un único primitivo reutilizado en toda
  la vista.

No ejecuté el script CLI de búsqueda (`search.py`) porque la tarea no requería elegir
paleta/tipografía/estilo nuevos — es una reestructuración de una vista existente que
consume un componente de tabs ya aprobado y usado en producción (agenda). La guía relevante
se aplicó directamente desde el Quick Reference de la skill.

## Troceado de bloques

Archivo: `src/components/dental/ortodoncia-view.tsx`.

| Pestaña (`id`) | Contenido movido | Cambios en props/lógica |
|---|---|---|
| `ficha` (default) | Card "Ficha ortodóncica" completa + Card "Tratamiento" completa + `<div className="flex items-center gap-3">` del botón "Guardar ficha y tratamiento" (con el `span` de error) | Ninguno — todo envuelto en un `<div className="space-y-6">` interior para mantener el ritmo visual entre las 3 piezas |
| `seguimiento` | `<OrthoVisitsCard visits={...} onAdd={...} onDelete={...} adding={...} />` | Ninguno |
| `consentimiento` | Card "Consentimiento de ortodoncia" completa (botón crear + `<ConsentList>`) | Ninguno |
| `pago` | `<OrthoPaymentPlanCard salonId={salonId} customerId={customerId} />` | Ninguno |
| `radiografias` | `<OrthoImagingCard salonId={salonId} customerId={customerId} />` (pestaña nueva, componente ya existente de Task 5) | N/A — pestaña nueva, no había bloque previo |

Cambios adicionales:
- Imports nuevos: `PillTabs` de `@/components/ui/pill-tabs`, `OrthoImagingCard` de
  `@/components/dental/ortho-imaging-card`.
- `const [tab, setTab] = useState<string>("ficha");` añadido junto a los demás `useState`
  del componente (sin reordenar los existentes).
- `const ORTHO_TABS = [...] as const;` definida a nivel de módulo, justo antes de
  `export function OrtodonciaView`.
- El `<div className="space-y-6">` raíz ahora contiene: `<PillTabs .../>` + los 5 bloques
  condicionales `{tab === "..." && (...)}`, en el mismo orden que las pestañas.

## Confirmación: lógica intacta

Todo el bloque de estado y hooks al inicio del componente (`dataQuery`, `visitsQuery`,
`consentsQuery`, `saveData`, `addVisit`, `deleteVisit`, `createConsent`, `ficha`,
`treatment`, el `useEffect` de sincronización, `handleSaveData`) permanece exactamente
donde estaba, sin tocar. Solo se añadió `const [tab, setTab] = useState...` a continuación
de los `useState` existentes.

Para verificarlo de forma objetiva ejecuté `git diff -w` (diff insensible a espacios) sobre
el fichero: las únicas líneas `+`/`-` que aparecen son las 2 líneas de import, la constante
`ORTHO_TABS`, la línea `const [tab, setTab]`, la apertura `<PillTabs .../>`, y las 5
aperturas/cierres `{tab === "..." && ( ... )}`. Ningún prop, handler, className ni texto de
los bloques movidos aparece en el diff — confirma que el contenido interno de cada bloque
es byte-idéntico al original, solo cambió su indentación y su envoltura condicional.

`OrthoVisitsCard` (el sub-componente de la timeline de visitas, definido después de
`OrtodonciaView`) no se tocó en absoluto.

## Resultado de `tsc`

```
npx tsc --noEmit
```
→ **0 errores**.

## Self-review

- Los 5 `id` de `ORTHO_TABS` coinciden exactamente con los usados en las condiciones
  `tab === "..."` (ficha, seguimiento, consentimiento, pago, radiografias).
- `tab` por defecto es `"ficha"`, como pide el brief.
- Los imports de `Card`, `CardHeader`, `CardTitle`, `CardContent` se siguen usando (en la
  pestaña ficha y en la de consentimiento), no quedaron huérfanos.
- No se importó nada sin usar ni se dejó nada importado de más.
- El RSC boundary se mantiene: el fichero sigue sin importar `@/lib/salon`; `salonId` y
  `customerId` siguen llegando por props del componente `"use client"`, igual que antes.
- `npm run lint` no está configurado en este proyecto (pide setup interactivo la primera
  vez, `next lint` sin config previa) — no es una regresión introducida por esta tarea, ya
  era así antes del cambio; no lo configuré por estar fuera de alcance.

## Concerns

- No pude ejecutar `npm run dev` + navegación real en `/ortodoncia` para el check visual
  manual que sugiere el Step 2 del brief (conmutación de las 5 pestañas, que "Radiografías"
  suba/lista imágenes y PDF) por no disponer de un flujo de browser/autenticación en este
  entorno de agente. Mitigado con: (a) `tsc --noEmit` limpio, (b) diff insensible a
  espacios que prueba que cada bloque JSX movido es idéntico byte a byte al original en
  props/contenido, y (c) lectura de `PillTabs`/`OrthoImagingCard` para confirmar que sus
  interfaces (`tabs`/`active`/`onChange`/`ariaLabel`, `salonId`/`customerId`) coinciden
  exactamente con cómo se invocan. Recomiendo que alguien con acceso a un salón real
  confirme visualmente antes de cerrar Fase 3.
- `eslint` global (`npx eslint`) falla por falta de config de proyecto (usa `next lint`,
  que pide setup interactivo) — no se pudo correr un lint automatizado sobre el fichero;
  no es un problema introducido por esta tarea.
