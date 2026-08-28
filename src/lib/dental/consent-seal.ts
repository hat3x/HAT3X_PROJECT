/**
 * Sellado del consentimiento firmado — USO EXCLUSIVO DE SERVIDOR.
 *
 * A2 del roadmap de odontología. Ata la firma al TEXTO EXACTO que el paciente
 * tenía delante, para poder responder a la única pregunta que importa cuando un
 * consentimiento se discute: ¿esto es lo que firmó?
 *
 * Por qué en el servidor y no en el navegador: quien firma controla su
 * navegador, así que una huella calculada allí no prueba nada frente a un
 * tercero. Este módulo importa `node:crypto` a propósito — hace de barrera: no
 * se puede importar desde un componente cliente ni por descuido.
 */
import { createHash } from "node:crypto";

/** Contenido sellado: lo que el paciente leyó cuando firmó. */
export interface ConsentSealInput {
  /** Título del consentimiento (`consents.title`). */
  title: string;
  /** Texto exacto de la plantilla firmada (`consents.body`). */
  body: string | null;
  /** Versión de plantilla vigente al firmar (`consents.template_version`). */
  templateVersion: string;
}

/** Estado del sello de un consentimiento. */
export type ConsentSealVerdict =
  /** Todavía no se ha firmado. */
  | "sin_firma"
  /** La firma corresponde al texto guardado. */
  | "valida"
  /** El texto cambió después de firmar: la firma ya no ampara este documento. */
  | "plantilla_cambiada";

/**
 * Serializa los campos SIN AMBIGÜEDAD, prefijando cada uno con su longitud.
 *
 * Concatenar a secas abriría una colisión trivial: `title="ab" body="c"` y
 * `title="a" body="bc"` producirían la misma cadena y, por tanto, la misma
 * huella — dos consentimientos distintos, indistinguibles. El prefijo de
 * longitud hace imposible mover el corte entre campos.
 *
 * `null` se codifica como `-1`, distinto de la cadena vacía (`0`): "sin cuerpo"
 * y "cuerpo vacío" no son el mismo documento.
 */
function canonicalize(input: ConsentSealInput): string {
  const field = (value: string | null): string =>
    value === null ? "-1:" : `${value.length}:${value}`;

  return [field(input.title), field(input.body), field(input.templateVersion)].join("");
}

/**
 * Huella SHA-256 (hex) del contenido del consentimiento.
 *
 * Es lo que se guarda en `consents.signature_hash` al firmar, y lo que se
 * recalcula después para comprobar que el texto no ha cambiado.
 */
export function consentFingerprint(input: ConsentSealInput): string {
  return createHash("sha256").update(canonicalize(input), "utf8").digest("hex");
}

/**
 * Compara el sello guardado con el contenido actual del consentimiento.
 *
 * La usan la ficha del paciente y el generador del PDF: un consentimiento cuyo
 * texto se editó después de firmarse debe aparecer marcado, nunca como firmado
 * a secas.
 */
export function verifyConsentSeal(
  consent: ConsentSealInput & { signatureHash: string | null },
): ConsentSealVerdict {
  if (consent.signatureHash === null) return "sin_firma";
  return consentFingerprint(consent) === consent.signatureHash
    ? "valida"
    : "plantilla_cambiada";
}
