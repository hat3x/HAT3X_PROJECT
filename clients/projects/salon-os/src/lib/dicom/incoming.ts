/**
 * La vuelta del viaje: decidir en qué ficha entra una radiografía recibida.
 *
 * ── LA ASIMETRÍA QUE LO EXPLICA TODO ────────────────────────────────────────
 * Los dos errores posibles no cuestan lo mismo, ni de lejos:
 *
 *   · dejar una radiografía sin asignar → alguien la coloca en dos clics;
 *   · ponerla en la ficha EQUIVOCADA → un dentista acaba diagnosticando sobre
 *     la boca de otra persona, y nadie se entera porque el sistema no avisó de
 *     nada.
 *
 * Con esa asimetría, la política correcta no es "acertar lo máximo posible"
 * sino "no equivocarse nunca". Este módulo empareja SOLO cuando los
 * identificadores que Kairos emitió vuelven intactos y coherentes entre sí. En
 * cuanto algo no cuadra, manda la imagen a la bandeja de sin asignar.
 *
 * ── POR QUÉ NO SE BUSCA POR NOMBRE ──────────────────────────────────────────
 * Sería fácil añadir "y si no, busca un paciente que se llame igual". No se
 * hace. En cualquier clínica hay dos García Fernández, y un empate resuelto por
 * parecido es exactamente el fallo que este módulo existe para impedir.
 */

import { parsePatientCode } from "./identity";

/** Las etiquetas que interesan de la imagen recibida, ya extraídas. */
export interface IncomingDicomTags {
  /** (0010,0020) PatientID. */
  patientId: string;
  /** (0008,0050) AccessionNumber. */
  accessionNumber: string;
  /** (0020,000D) StudyInstanceUID. */
  studyInstanceUid: string;
}

/** Una petición que Kairos publicó y que puede reclamar esta imagen. */
export interface KnownOrder {
  id: string;
  salonId: string;
  customerId: string;
  accession: number;
  patientCode: number;
  studyInstanceUid: string;
}

/** Por qué una imagen se queda sin asignar. El motivo se le enseña a la clínica. */
export type UnassignedReason =
  /** No traía identificador de paciente, o no tenía la forma de los nuestros. */
  | "sin-identificador"
  /** Traía un código válido pero no corresponde a ningún paciente del salón. */
  | "paciente-desconocido"
  /**
   * Los identificadores se contradicen: p. ej. la petición dice un paciente y
   * la imagen dice otro. Es el caso GRAVE, y por eso tiene motivo propio.
   */
  | "identificadores-incoherentes";

export type IncomingMatch =
  | { kind: "order"; orderId: string; customerId: string }
  | { kind: "patient"; customerId: string }
  | { kind: "unassigned"; reason: UnassignedReason };

/** Cómo resolver un código de paciente cuando no hay petición que valga. */
export interface MatchOptions {
  /** Devuelve el `customer_id` de ese código dentro del salón, o `null`. */
  resolvePatientCode?: (code: number) => string | null;
}

/**
 * Lee una etiqueta DICOM de un conjunto de datos.
 *
 * Devuelve siempre una cadena, nunca `undefined`: en DICOM los valores se
 * rellenan hasta longitud par con un espacio o un byte nulo, así que hay que
 * recortarlos antes de comparar — un `"0000004321 "` que no se recorte no
 * casaría con `"0000004321"` y la imagen se quedaría sin asignar sin motivo.
 */
export function readDicomTag(dataset: Record<string, unknown>, tag: string): string {
  const buscado = tag.toUpperCase();
  for (const [clave, valor] of Object.entries(dataset)) {
    if (clave.toUpperCase() !== buscado) continue;
    if (typeof valor !== "string") return "";
    // \0 es el relleno de los campos binarios; el espacio, el de los de texto.
    return valor.replace(/\0/g, "").trim();
  }
  return "";
}

/**
 * Decide el destino de una imagen recién llegada.
 *
 * El orden importa. Primero se busca la petición, porque es la vía con más
 * garantías: la emitió Kairos entera y se puede comprobar consigo misma. Solo
 * si no hay petición se acepta un código de paciente suelto, que es el caso de
 * quien radiografía sin pasar por la lista.
 */
export function matchIncomingImage(
  tags: IncomingDicomTags,
  openOrders: readonly KnownOrder[],
  options: MatchOptions = {},
): IncomingMatch {
  const patientId = tags.patientId.trim();
  const accession = tags.accessionNumber.trim();
  const studyUid = tags.studyInstanceUid.trim();

  // ── Vía 1: la petición ────────────────────────────────────────────────────
  const codigoPeticion = parsePatientCode(accession);
  if (codigoPeticion !== null) {
    const peticion = openOrders.find((o) => o.accession === codigoPeticion);
    if (peticion !== undefined) {
      // La petición existe. Ahora se comprueba que la imagen siga hablando del
      // MISMO paciente y del MISMO estudio. Si no, alguien cambió algo a mano
      // en el equipo después de elegir de la lista, y ahí ya no sabemos de
      // quién es esta radiografía. Preferimos decirlo a adivinarlo.
      const mismoPaciente = patientId === "" || parsePatientCode(patientId) === peticion.patientCode;
      const mismoEstudio = studyUid === "" || studyUid === peticion.studyInstanceUid;

      if (mismoPaciente && mismoEstudio) {
        return { kind: "order", orderId: peticion.id, customerId: peticion.customerId };
      }
      return { kind: "unassigned", reason: "identificadores-incoherentes" };
    }
  }

  // ── Vía 2: el código de paciente suelto ───────────────────────────────────
  // `parsePatientCode` ya devuelve null si la cadena no tiene la forma de
  // nuestros códigos, así que no hace falta validarla antes. Aquí hubo esa
  // comprobación de más: una prueba de mutación la destapó al poder borrarla
  // sin que fallara ningún test, que es como se ve una rama que nunca decide
  // nada.
  const codigo = parsePatientCode(patientId);
  if (codigo === null || options.resolvePatientCode === undefined) {
    return { kind: "unassigned", reason: "sin-identificador" };
  }

  const customerId = options.resolvePatientCode(codigo);
  if (customerId === null) {
    return { kind: "unassigned", reason: "paciente-desconocido" };
  }

  return { kind: "patient", customerId };
}
