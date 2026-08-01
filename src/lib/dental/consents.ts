/**
 * Lógica pura de consentimientos informados + imágenes/radiografías (odontología).
 *
 * Espejo conceptual de `treatment.ts`/`perio.ts`: sin IO, solo etiquetas de
 * display, el catálogo de plantillas de consentimiento (español) y los guards
 * de la pequeña máquina de estados de `consents.status` (`pending → signed →
 * revoked`), que ESPEJA el trigger `consents_guard_signed` de la migración
 * `20260801110000_consents_images.sql`:
 *   - `pending` es el único estado desde el que se puede FIRMAR.
 *   - `signed` es el único estado desde el que se puede REVOCAR.
 *   - `revoked` es terminal (inmutable en BD).
 */
import type { ConsentStatus, ConsentType, ImageModality } from "@/types/database";

// ---------------------------------------------------------------------------
// Catálogos de valores (para tests e iteración exhaustiva)
// ---------------------------------------------------------------------------

export const CONSENT_TYPES: readonly ConsentType[] = [
  "general",
  "endodoncia",
  "exodoncia",
  "implante",
  "ortodoncia",
  "anestesia",
  "periodoncia",
  "blanqueamiento",
  "rgpd",
];

export const CONSENT_STATUSES: readonly ConsentStatus[] = ["pending", "signed", "revoked"];

export const IMAGE_MODALITIES: readonly ImageModality[] = [
  "periapical",
  "bitewing",
  "panoramic",
  "cbct",
  "cefalometrica",
  "foto_intraoral",
  "scan_stl",
];

/** `true` si `value` es una modalidad de imagen válida (`public.image_modality`). */
export function isImageModality(value: string): value is ImageModality {
  return (IMAGE_MODALITIES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Etiquetas de display (español)
// ---------------------------------------------------------------------------

export const CONSENT_TYPE_LABELS: Record<ConsentType, string> = {
  general: "Consentimiento general",
  endodoncia: "Endodoncia",
  exodoncia: "Exodoncia (extracción)",
  implante: "Implante dental",
  ortodoncia: "Ortodoncia",
  anestesia: "Anestesia / sedación",
  periodoncia: "Tratamiento periodontal",
  blanqueamiento: "Blanqueamiento dental",
  rgpd: "Protección de datos (RGPD)",
};

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  pending: "Pendiente de firma",
  signed: "Firmado",
  revoked: "Revocado",
};

export const IMAGE_MODALITY_LABELS: Record<ImageModality, string> = {
  periapical: "Radiografía periapical",
  bitewing: "Radiografía de aleta de mordida",
  panoramic: "Ortopantomografía (panorámica)",
  cbct: "CBCT (TC de haz cónico)",
  cefalometrica: "Radiografía cefalométrica",
  foto_intraoral: "Fotografía intraoral",
  scan_stl: "Escaneado digital (STL)",
};

// ---------------------------------------------------------------------------
// Catálogo de plantillas de consentimiento informado (español)
// ---------------------------------------------------------------------------

/** Plantilla de un tipo de consentimiento: texto por defecto al crearlo. */
export interface ConsentTemplate {
  title: string;
  body: string;
  version: string;
}

/**
 * Catálogo de plantillas por tipo. Textos breves pero realistas de
 * consentimiento informado en español; sirven de contenido POR DEFECTO al
 * crear un consentimiento (el profesional puede sustituirlos por un texto a
 * medida vía `title`/`body` en `createConsent`). `version` espeja el default
 * `'v1'` de `consents.template_version` en BD.
 */
export const CONSENT_TEMPLATES: Record<ConsentType, ConsentTemplate> = {
  general: {
    title: "Consentimiento informado general de tratamiento odontológico",
    version: "v1",
    body:
      "Declaro que el equipo clínico me ha explicado en términos comprensibles el " +
      "diagnóstico, el tratamiento propuesto, sus objetivos, las alternativas " +
      "razonables y los riesgos generales y específicos asociados (dolor, sangrado, " +
      "infección, sensibilidad postoperatoria, reacciones alérgicas, entre otros). " +
      "He podido formular las preguntas que he considerado oportunas y estas han " +
      "sido respondidas satisfactoriamente. Entiendo que la Odontología no es una " +
      "ciencia exacta y que no se garantiza un resultado concreto. Autorizo al " +
      "equipo clínico a realizar el tratamiento descrito y las actuaciones " +
      "complementarias que, a su juicio profesional, resulten necesarias durante " +
      "el mismo. Sé que puedo revocar este consentimiento en cualquier momento " +
      "antes del inicio del tratamiento.",
  },
  endodoncia: {
    title: "Consentimiento informado — Tratamiento de endodoncia (conducto radicular)",
    version: "v1",
    body:
      "Se me ha informado de que el tratamiento consiste en la eliminación del " +
      "tejido pulpar dañado o infectado, la limpieza y conformación de los " +
      "conductos radiculares y su posterior obturación, con el objetivo de " +
      "conservar la pieza dental evitando su extracción. Entiendo los riesgos " +
      "propios del procedimiento: fractura de instrumental dentro del conducto, " +
      "perforación radicular, dolor o inflamación postoperatoria, posible " +
      "necesidad de retratamiento, cirugía apical o extracción si el tratamiento " +
      "no resulta exitoso, y que el diente puede oscurecerse u ocasionalmente " +
      "fracturarse tras el tratamiento. Se me han explicado alternativas como la " +
      "extracción de la pieza. Autorizo la realización del tratamiento de " +
      "endodoncia en la(s) pieza(s) indicada(s).",
  },
  exodoncia: {
    title: "Consentimiento informado — Exodoncia (extracción dental)",
    version: "v1",
    body:
      "Se me ha explicado que el procedimiento consiste en la extracción " +
      "quirúrgica o simple de la pieza dental indicada. Entiendo los riesgos " +
      "asociados: dolor, inflamación, sangrado, hematoma, infección, alveolitis, " +
      "lesión de dientes o restauraciones adyacentes, lesión nerviosa con " +
      "alteración transitoria o, excepcionalmente, permanente de la sensibilidad " +
      "(labio, mentón, lengua), comunicación con el seno maxilar en piezas " +
      "superiores, y fractura ósea. Se me han explicado alternativas de " +
      "tratamiento, incluida la conservación de la pieza cuando es viable. " +
      "Entiendo las instrucciones postoperatorias que debo seguir. Autorizo la " +
      "extracción de la(s) pieza(s) dental(es) indicada(s).",
  },
  implante: {
    title: "Consentimiento informado — Colocación de implante dental",
    version: "v1",
    body:
      "Se me ha informado de que el tratamiento consiste en la colocación " +
      "quirúrgica de uno o varios implantes de titanio en el hueso " +
      "maxilar/mandibular para la posterior rehabilitación protésica. Entiendo " +
      "que el éxito del implante depende de la osteointegración y de mi estado " +
      "de salud general, y que existe riesgo de fracaso, rechazo o pérdida del " +
      "implante, infección, dolor, inflamación, lesión nerviosa o sinusal, y " +
      "necesidad de procedimientos adicionales (regeneración ósea, elevación de " +
      "seno). Se me han explicado alternativas protésicas (puente, prótesis " +
      "removible). Entiendo que el tratamiento puede requerir varias fases y " +
      "visitas de mantenimiento. Autorizo la colocación del/de los implante(s) " +
      "indicado(s).",
  },
  ortodoncia: {
    title: "Consentimiento informado — Tratamiento de ortodoncia",
    version: "v1",
    body:
      "Se me ha explicado que el tratamiento tiene como objetivo corregir la " +
      "posición dental y/o la relación entre maxilares mediante aparatología " +
      "fija o removible. Entiendo los riesgos: molestias, dolor, reabsorción " +
      "radicular, recesión gingival, descalcificación del esmalte por higiene " +
      "deficiente, posible necesidad de extracciones o cirugía ortognática, " +
      "recidiva tras el tratamiento y necesidad de contención de por vida. Se me " +
      "ha informado de la duración estimada y de la importancia de acudir a los " +
      "controles periódicos y seguir las indicaciones de higiene y uso de la " +
      "aparatología. Autorizo el inicio del tratamiento de ortodoncia propuesto.",
  },
  anestesia: {
    title: "Consentimiento informado — Anestesia local / sedación",
    version: "v1",
    body:
      "Se me ha informado de que, para la realización del tratamiento, se " +
      "administrará anestesia local (y, en su caso, sedación) mediante inyección " +
      "u otra vía. Entiendo los riesgos: dolor en el punto de punción, hematoma, " +
      "lesión nerviosa transitoria o, excepcionalmente, permanente, reacción " +
      "alérgica, toxicidad sistémica, y en el caso de sedación, riesgos propios " +
      "de la misma (depresión respiratoria, reacciones adversas). He informado " +
      "al equipo clínico de mis antecedentes médicos, alergias y medicación " +
      "actual. Autorizo la administración de la anestesia/sedación necesaria " +
      "para la realización del tratamiento.",
  },
  periodoncia: {
    title: "Consentimiento informado — Tratamiento periodontal",
    version: "v1",
    body:
      "Se me ha explicado que padezco una enfermedad periodontal (gingivitis o " +
      "periodontitis) y que el tratamiento propuesto (raspado y alisado " +
      "radicular, cirugía periodontal u otros) tiene como objetivo controlar la " +
      "infección y detener la pérdida de hueso de soporte. Entiendo que la " +
      "enfermedad periodontal es crónica, que el tratamiento no revierte la " +
      "pérdida ósea ya producida, y que el éxito depende en gran medida de mi " +
      "higiene oral y de mantenimientos periódicos. Riesgos: sensibilidad " +
      "dental, recesión gingival, movilidad dental, y en casos avanzados, " +
      "posible pérdida de piezas pese al tratamiento. Autorizo el tratamiento " +
      "periodontal indicado.",
  },
  blanqueamiento: {
    title: "Consentimiento informado — Blanqueamiento dental",
    version: "v1",
    body:
      "Se me ha informado de que el tratamiento consiste en la aplicación de " +
      "agentes blanqueadores sobre el esmalte dental, en consulta y/o mediante " +
      "férulas de uso domiciliario. Entiendo que el resultado varía según cada " +
      "paciente y no es permanente, que puede producirse sensibilidad dental e " +
      "irritación gingival transitorias, y que el procedimiento no es efectivo " +
      "sobre obturaciones, coronas o carillas, que mantendrán su color original. " +
      "Se me ha informado de que el embarazo/lactancia y determinadas patologías " +
      "dentales son contraindicaciones. Autorizo la realización del tratamiento " +
      "de blanqueamiento dental.",
  },
  rgpd: {
    title: "Consentimiento informado — Protección de datos personales (RGPD)",
    version: "v1",
    body:
      "De conformidad con el Reglamento (UE) 2016/679 (RGPD) y la LOPDGDD, se me " +
      "ha informado de que mis datos personales y de salud serán tratados por el " +
      "centro con la finalidad de prestar la asistencia odontológica, gestionar " +
      "la historia clínica y cumplir con las obligaciones legales aplicables. " +
      "Mis datos no se cederán a terceros salvo obligación legal y podré " +
      "ejercer mis derechos de acceso, rectificación, supresión, oposición, " +
      "limitación y portabilidad ante el centro. Presto mi consentimiento " +
      "expreso para el tratamiento de mis datos de salud (categoría especial, " +
      "art. 9 RGPD) con la finalidad descrita.",
  },
};

/** Devuelve la plantilla de consentimiento por defecto para `type`. */
export function getConsentTemplate(type: ConsentType): ConsentTemplate {
  return CONSENT_TEMPLATES[type];
}

// ---------------------------------------------------------------------------
// Máquina de estados de consents.status (espejo del trigger de BD)
// ---------------------------------------------------------------------------

/** `true` si un consentimiento en `status` se puede FIRMAR (solo `pending`). */
export function canSignConsent(status: ConsentStatus): boolean {
  return status === "pending";
}

/** `true` si un consentimiento en `status` se puede REVOCAR (solo `signed`). */
export function canRevokeConsent(status: ConsentStatus): boolean {
  return status === "signed";
}
