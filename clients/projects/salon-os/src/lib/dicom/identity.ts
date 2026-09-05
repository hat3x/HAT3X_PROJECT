/**
 * Identidad DICOM — cómo se nombra a un paciente de Kairos en el equipo de rayos.
 *
 * ── EL VIAJE QUE HAY QUE PROTEGER ───────────────────────────────────────────
 * Kairos publica la lista de trabajo (Modality Worklist). El equipo la lee, el
 * profesional elige al paciente, dispara, y la imagen vuelve con el mismo
 * identificador dentro del DICOM. Ese identificador es lo único que garantiza
 * que la radiografía acabe en la ficha correcta.
 *
 * Por eso este módulo no adivina nada: o produce algo válido, o falla; y al
 * volver, o reconoce el identificador, o devuelve `null` para que alguien lo
 * asigne a mano. Una radiografía sin asignar es un incordio; una radiografía en
 * la ficha equivocada es un problema clínico.
 *
 * ── LOS LÍMITES SON DEL EQUIPO, NO NUESTROS ─────────────────────────────────
 * Todo lo de aquí sale de la configuración real de ImageSensor 3.0.2.8 en
 * Biodental (`App\Conf\AppSetting.xml`). No son cifras redondas elegidas por
 * gusto: son lo que el equipo acepta.
 */

/** `PatientNameLen` del equipo. Un nombre más largo lo rechaza. */
export const DICOM_PATIENT_NAME_MAX = 30;

/** Ancho al que se rellena el código de paciente. Ver `formatPatientCode`. */
const PATIENT_CODE_WIDTH = 10;

/** `PIDSupportChar`/`PIDSupportChar_RIS` no admiten más de 20 caracteres. */
const PATIENT_CODE_MAX_WIDTH = 20;

// ---------------------------------------------------------------------------
// Código de paciente
// ---------------------------------------------------------------------------

/**
 * Convierte el número corto de paciente en el `PatientID` que viaja en DICOM.
 *
 * ── POR QUÉ NO SE USA EL UUID ───────────────────────────────────────────────
 * Lo natural sería mandar `customers.id`, pero un UUID son 36 caracteres y el
 * equipo corta en 20 (`PIDSupportChar_RIS`). Se rechazaría, y encima en
 * silencio: el paciente simplemente no aparecería en la lista.
 *
 * ── POR QUÉ DIEZ DÍGITOS Y NO OTRA COSA ─────────────────────────────────────
 * El equipo valida el ID con DOS patrones distintos según de dónde venga:
 *
 *   por lista de trabajo → ^[a-zA-Z0-9_-]{3,20}$
 *   tecleado a mano      → ^[0-9]{10,20}$
 *
 * Solo dígitos, y al menos diez, satisface los dos a la vez. Así el mismo
 * identificador sirve tanto si llega solo como si alguien lo escribe buscando
 * un paciente — y no hay dos formatos que mantener sincronizados.
 */
export function formatPatientCode(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError(
      `El número de paciente debe ser un entero mayor que 0; recibido: ${sequence}`,
    );
  }
  const digits = String(sequence);
  if (digits.length > PATIENT_CODE_MAX_WIDTH) {
    throw new RangeError(
      `El número de paciente no cabe en ${PATIENT_CODE_MAX_WIDTH} dígitos: ${sequence}`,
    );
  }
  return digits.padStart(PATIENT_CODE_WIDTH, "0");
}

/**
 * `true` si la cadena es un código de paciente de los que emite Kairos.
 *
 * Deliberadamente estricto: solo dígitos, entre 10 y 20, y que no sea todo
 * ceros. Cuando vuelve una imagen, esto decide si nos fiamos del identificador
 * o si la mandamos a la bandeja de "sin asignar".
 */
export function isValidPatientCode(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (!/^[0-9]{10,20}$/.test(value)) return false;
  // Todo ceros no es el paciente 0: es un campo sin rellenar que alguien dejó
  // pasar. Tratarlo como válido sería asignar imágenes a un paciente inventado.
  return /[1-9]/.test(value);
}

/** El número que hay detrás del código, o `null` si la cadena no es un código. */
export function parsePatientCode(value: unknown): number | null {
  if (!isValidPatientCode(value)) return null;
  const n = Number(value as string);
  return Number.isSafeInteger(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Nombre
// ---------------------------------------------------------------------------

/**
 * Caracteres que DICOM se reserva y que, dentro de un nombre, lo romperían:
 *   `^` separa componentes (apellido^nombre^…)
 *   `\` separa valores múltiples
 *   `=` separa las representaciones alfabética, ideográfica y fonética
 * Se sustituyen por un espacio, no se borran, para no pegar dos palabras.
 */
const DICOM_RESERVED = /[\^\\=]/g;

/** Caracteres que el equipo no admite en un nombre (`PatientNameSupport`). */
const NAME_NOT_ALLOWED = /[^\p{L}\p{M}\p{Nl}.\d\s()·_-]/gu;

/**
 * Prepara un nombre de Kairos para viajar como `PatientName` (VR = PN).
 *
 * ── LA DECISIÓN DE FONDO: NO SE PARTE EL NOMBRE ─────────────────────────────
 * DICOM estructura el nombre en componentes (apellidos^nombre^…) y la tentación
 * es partir `full_name` por el primer espacio. En español eso falla más de lo
 * que acierta: "Yolanda García del Valle" no tiene una frontera detectable, y
 * un corte mal puesto sale en la pantalla del equipo como si fuera otra
 * persona — que es exactamente el error que este módulo existe para evitar.
 *
 * Así que el nombre entero va al primer componente. El equipo muestra ese
 * componente (`NamePartInList=0`), de modo que en su lista se lee tal cual está
 * escrito en Kairos. Menos "correcto" en teoría; inequívoco en la práctica.
 *
 * Devuelve cadena vacía si no hay nombre: `PatientName` es tipo 2 en DICOM, o
 * sea obligatorio que el campo esté pero permitido que vaya vacío.
 */
export function formatDicomPersonName(fullName: string | null | undefined): string {
  if (typeof fullName !== "string") return "";

  const limpio = fullName
    .replace(DICOM_RESERVED, " ")
    .replace(NAME_NOT_ALLOWED, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (limpio.length <= DICOM_PATIENT_NAME_MAX) return limpio;

  // Recorte por palabra entera: "María del Carmen Fernández" se lee; "María del
  // Carmen Fernández de la To" parece un fallo del sistema.
  const corte = limpio.slice(0, DICOM_PATIENT_NAME_MAX + 1);
  const ultimoEspacio = corte.lastIndexOf(" ");
  if (ultimoEspacio > 0) return corte.slice(0, ultimoEspacio);

  // Una sola palabra más larga que el límite: no hay por dónde cortar bien, así
  // que se corta y ya. Es preferible a mandar algo que el equipo rechace.
  return limpio.slice(0, DICOM_PATIENT_NAME_MAX);
}

// ---------------------------------------------------------------------------
// Fechas y horas
// ---------------------------------------------------------------------------

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Fecha en formato DA de DICOM: `YYYYMMDD`.
 *
 * Se lee en UTC a propósito. Las fechas que pasan por aquí son de calendario
 * —fecha de nacimiento, día de la cita—, no instantes: `birth_date` es un
 * `date` de Postgres y llega como "1999-10-02", que `new Date()` interpreta
 * como medianoche UTC. Leerla en la zona local la correría un día hacia atrás
 * en cualquier huso al oeste de Greenwich.
 */
export function formatDicomDate(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (d === null) return "";
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Hora en formato TM de DICOM: `HHMMSS`, en la zona horaria de la CLÍNICA.
 *
 * Aquí sí importa el huso, y por eso se pide explícito. Una cita de las 10:00
 * en Madrid vive en la base como 08:00 UTC; el equipo está en la consulta y
 * tiene que leer `100000`. Mandar la hora UTC pondría las citas dos horas antes
 * en la pantalla del aparato, y en verano y en invierno de forma distinta.
 */
export function formatDicomTime(
  value: Date | string | null | undefined,
  timeZone: string,
): string {
  const d = toDate(value);
  if (d === null) return "";

  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);

  const buscar = (tipo: "hour" | "minute" | "second"): string =>
    partes.find((p) => p.type === tipo)?.value.padStart(2, "0") ?? "00";

  return `${buscar("hour")}${buscar("minute")}${buscar("second")}`;
}
