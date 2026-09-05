/**
 * Lista de trabajo DICOM (Modality Worklist) — las citas vistas por el equipo.
 *
 * ── LO QUE HACE ESTE MÓDULO ─────────────────────────────────────────────────
 * Convierte una cita de Kairos en el registro que ImageSensor espera recibir
 * cuando abre su lista de trabajo. Es la mitad de ida del viaje: la de vuelta
 * es la imagen, que regresa con estos mismos identificadores dentro.
 *
 * ── LOS CAMPOS NO SON NEGOCIABLES ───────────────────────────────────────────
 * Salen de `MWLQueryCriteriaItem.xml` del propio equipo. Lo que sobre lo
 * ignora, pero si falta lo que usa para identificar al paciente, la radiografía
 * vuelve huérfana y alguien tiene que asignarla a mano.
 *
 * ── DÓNDE SE VALIDA ─────────────────────────────────────────────────────────
 * Aquí, y en cerrado. Un `AccessionNumber` demasiado largo o un UID mal formado
 * no se recortan por lo bajines: se rechazan. El equipo los descartaría en
 * silencio, que es la peor forma de fallar — la cita simplemente no aparece y
 * nadie sabe por qué.
 */

import {
  formatDicomDate,
  formatDicomPersonName,
  formatDicomTime,
  formatPatientCode,
} from "./identity";

/** Longitud máxima de un UID en DICOM (VR = UI). */
export const DICOM_UID_MAX = 64;

/** `AccNumSupportChar_RIS` del equipo. */
const ACCESSION_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;

/** Juego de caracteres declarado. El equipo trabaja en UTF-8. */
const CHARACTER_SET = "ISO_IR 192";

// ---------------------------------------------------------------------------
// Identificadores de estudio
// ---------------------------------------------------------------------------

/**
 * `true` si la cadena es un UID DICOM bien formado.
 *
 * Las reglas son del estándar (PS3.5 §9.1): componentes numéricos separados por
 * puntos, sin ceros a la izquierda —salvo el componente "0" a secas—, y como
 * mucho 64 caracteres.
 */
export function isValidDicomUid(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > DICOM_UID_MAX) return false;
  return value.split(".").every((componente) => /^(0|[1-9][0-9]*)$/.test(componente));
}

/**
 * Convierte un UUID en un UID DICOM de la rama `2.25`.
 *
 * ── POR QUÉ ESTA RAMA ───────────────────────────────────────────────────────
 * Un UID tiene que ser único en el mundo, no solo en nuestra base. Lo ortodoxo
 * es registrar una raíz OID propia ante la autoridad correspondiente, papeleo
 * que no hemos hecho. El estándar prevé exactamente este caso: `2.25` seguido
 * del UUID leído como un entero decimal de 128 bits (DICOM PS3.5 anexo B.2,
 * que remite a ISO/IEC 9834-8). Sale único sin registrar nada.
 *
 * Se hace con BigInt a propósito: 128 bits no caben en un `number` de
 * JavaScript, y con aritmética normal los UID saldrían redondeados —o sea,
 * repetidos— para valores altos.
 */
export function dicomUidFromUuid(uuid: string): string {
  const hex = String(uuid).replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new TypeError(`No es un UUID: ${uuid}`);
  }
  return `2.25.${BigInt(`0x${hex}`).toString(10)}`;
}

// ---------------------------------------------------------------------------
// Edad
// ---------------------------------------------------------------------------

/**
 * Edad en formato AS de DICOM: tres dígitos y una unidad, p. ej. `048Y`.
 *
 * Se calcula a la fecha de la CITA y no a la de hoy. Un informe que se imprime
 * meses después tiene que decir la edad que el paciente tenía cuando se le hizo
 * la radiografía, que es el dato clínicamente relevante.
 */
function formatDicomAge(birthDate: Date | string | null | undefined, at: Date): string {
  if (birthDate === null || birthDate === undefined) return "";
  const nacimiento = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(nacimiento.getTime())) return "";

  let anios = at.getUTCFullYear() - nacimiento.getUTCFullYear();
  const mes = at.getUTCMonth() - nacimiento.getUTCMonth();
  // Si el cumpleaños de este año aún no ha llegado, todavía tiene un año menos.
  if (mes < 0 || (mes === 0 && at.getUTCDate() < nacimiento.getUTCDate())) {
    anios -= 1;
  }
  if (anios < 0 || anios > 999) return "";
  return `${String(anios).padStart(3, "0")}Y`;
}

// ---------------------------------------------------------------------------
// El registro
// ---------------------------------------------------------------------------

/** Lo que hace falta saber de una cita para publicarla en la lista. */
export interface WorklistOrderInput {
  /** Número de petición, corto. Debe cumplir `AccNumSupportChar_RIS`. */
  accession: string;
  /** UID del estudio. Único en el mundo; ver `dicomUidFromUuid`. */
  studyInstanceUid: string;
  /** `customers.patient_code`. */
  patientCode: number;
  patientFullName: string;
  patientBirthDate: string | Date | null;
  /** Instante de la cita, tal cual está en la base (UTC). */
  scheduledAt: string | Date;
  /** Zona horaria del salón: la hora se publica en hora local. */
  timeZone: string;
  /** Modalidad DICOM. `IO` = intraoral; `PX` = panorámica. */
  modality: string;
  /** AE Title del equipo al que va dirigida la cita. */
  stationAeTitle: string;
  procedureDescription: string | null;
  performingPhysician: string | null;
}

/** El registro ya normalizado, con los valores tal como viajarán. */
export interface WorklistItem {
  accession: string;
  studyInstanceUid: string;
  patientId: string;
  patientName: string;
  patientBirthDate: string;
  patientSex: string;
  patientAge: string;
  scheduledDate: string;
  scheduledTime: string;
  modality: string;
  stationAeTitle: string;
  procedureDescription: string;
  performingPhysician: string;
}

/**
 * Normaliza una cita al registro de la lista de trabajo.
 *
 * Lanza si el número de petición o el UID no valen: es preferible enterarse
 * aquí, con un mensaje, que en la clínica cuando un paciente no aparezca.
 */
export function buildWorklistItem(input: WorklistOrderInput): WorklistItem {
  if (!ACCESSION_PATTERN.test(input.accession)) {
    throw new RangeError(
      `El número de petición "${input.accession}" no lo acepta el equipo: debe ser de 3 a 20 caracteres alfanuméricos, guion o guion bajo.`,
    );
  }
  if (!isValidDicomUid(input.studyInstanceUid)) {
    throw new RangeError(`El UID de estudio "${input.studyInstanceUid}" no es un UID DICOM válido.`);
  }

  const cita = input.scheduledAt instanceof Date ? input.scheduledAt : new Date(input.scheduledAt);
  if (Number.isNaN(cita.getTime())) {
    throw new RangeError(`La fecha de la cita no es válida: ${String(input.scheduledAt)}`);
  }

  return {
    accession: input.accession,
    studyInstanceUid: input.studyInstanceUid,
    patientId: formatPatientCode(input.patientCode),
    patientName: formatDicomPersonName(input.patientFullName),
    patientBirthDate: formatDicomDate(input.patientBirthDate),
    // Kairos no guarda el sexo del paciente. DICOM define PatientSex como tipo
    // 2: el campo tiene que estar, pero puede ir vacío. Rellenarlo con un valor
    // por defecto sería afirmar algo que no sabemos — el propio equipo trae 'F'
    // en su plantilla, que es justamente lo que no queremos replicar.
    patientSex: "",
    patientAge: formatDicomAge(input.patientBirthDate, cita),
    scheduledDate: formatDicomDate(cita),
    scheduledTime: formatDicomTime(cita, input.timeZone),
    modality: input.modality,
    stationAeTitle: input.stationAeTitle,
    procedureDescription: input.procedureDescription ?? "",
    // El nombre del profesional también es un PN: los mismos caracteres que
    // romperían el del paciente romperían este.
    performingPhysician: formatDicomPersonName(input.performingPhysician),
  };
}

// ---------------------------------------------------------------------------
// Traducción a etiquetas DICOM
// ---------------------------------------------------------------------------

/** Un conjunto de datos DICOM, indexado por etiqueta `ggggeeee`. */
export type DicomDataset = Record<string, string | DicomDataset[]>;

/**
 * Pasa el registro a etiquetas DICOM, que es lo que viaja por el cable.
 *
 * ── POR QUÉ TODOS LOS CAMPOS, INCLUSO LOS VACÍOS ────────────────────────────
 * En DICOM "vacío" y "ausente" no son lo mismo. Varios clientes descartan un
 * registro entero si les falta un campo que pidieron, así que se responde a
 * todo lo que el equipo consulta aunque el valor sea una cadena vacía.
 *
 * `ReferringPhysicianName` va vacío a conciencia: en una clínica dental no hay
 * médico derivante, y poner ahí al odontólogo sería confundirlo con el que
 * ejecuta —que ya viaja en `ScheduledPerformingPhysicianName`.
 */
export function worklistItemToDataset(item: WorklistItem): DicomDataset {
  return {
    "00080005": CHARACTER_SET, // SpecificCharacterSet
    "00080020": item.scheduledDate, // StudyDate
    "00080030": item.scheduledTime, // StudyTime
    "00080050": item.accession, // AccessionNumber
    "00080090": "", // ReferringPhysicianName
    "00100010": item.patientName, // PatientName
    "00100020": item.patientId, // PatientID
    "00100030": item.patientBirthDate, // PatientBirthDate
    "00100040": item.patientSex, // PatientSex
    "00101010": item.patientAge, // PatientAge
    "0020000D": item.studyInstanceUid, // StudyInstanceUID
    // ScheduledProcedureStepSequence — un solo paso por cita. Es donde el
    // equipo lee a qué estación va dirigida y con qué modalidad.
    "00400100": [
      {
        "00080060": item.modality, // Modality
        "00400001": item.stationAeTitle, // ScheduledStationAETitle
        "00400002": item.scheduledDate, // ScheduledProcedureStepStartDate
        "00400003": item.scheduledTime, // ScheduledProcedureStepStartTime
        "00400006": item.performingPhysician, // ScheduledPerformingPhysicianName
        "00400007": item.procedureDescription, // ScheduledProcedureStepDescription
      },
    ],
  };
}
