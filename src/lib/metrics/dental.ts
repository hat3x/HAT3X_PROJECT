/**
 * Indicadores propios de una clínica dental (B5).
 *
 * `/analitica` cuenta hoy lo que cuenta un comercio: facturación, tickets,
 * ticket medio, métodos de pago. Un director de clínica mira otras cosas —y los
 * datos ya están en la base, solo que nadie los suma.
 *
 * Aquí vive la parte delicada, que no es la aritmética sino las DEFINICIONES:
 * qué cuenta como aceptado y sobre qué se divide. Un indicador con el
 * denominador equivocado no es impreciso: hace tomar decisiones al revés.
 */

/** Recuento de planes por estado, tal y como los agrupa Postgres. */
export interface TreatmentPlanStatusCounts {
  draft: number;
  proposed: number;
  accepted: number;
  in_progress: number;
  completed: number;
  cancelled: number;
}

export interface AcceptanceRate {
  /** Planes que llegaron a presentarse al paciente (todos menos borradores). */
  presented: number;
  /** Los que el paciente aceptó, se hayan ejecutado ya o no. */
  accepted: number;
  /** Los que se rechazaron o se anularon. */
  rejected: number;
  /** Presentados que siguen sin respuesta: la cifra sobre la que se actúa. */
  pending: number;
  /** `accepted / presented`, o `null` si no se presentó ninguno. */
  rate: number | null;
}

/**
 * Tasa de aceptación de presupuestos — el indicador número uno del sector.
 *
 * Dos decisiones sostienen que el número signifique algo:
 *
 * 1. **Aceptado incluye `in_progress` y `completed`.** Un plan aceptado no se
 *    queda en `accepted`: avanza en cuanto se empieza a ejecutar. Contar solo
 *    `accepted` le daría la peor tasa a la clínica que mejor termina sus
 *    tratamientos, que es exactamente la lectura contraria a la realidad.
 *
 * 2. **El borrador no entra en el denominador.** No se ha presentado a nadie;
 *    meterlo como "propuesto y no aceptado" penaliza preparar planes con calma.
 *
 * `proposed` se reporta aparte como `pending`: "aún no ha contestado" no es
 * "dijo que no", y mezclarlos borra la única lista sobre la que se puede
 * actuar hoy —a quién hay que llamar—.
 */
export function computeAcceptanceRate(counts: TreatmentPlanStatusCounts): AcceptanceRate {
  const accepted = counts.accepted + counts.in_progress + counts.completed;
  const rejected = counts.cancelled;
  const pending = counts.proposed;
  const presented = accepted + rejected + pending;
  return {
    presented,
    accepted,
    rejected,
    pending,
    // Nulo, no cero: cero por ciento significa "los presentamos y nos dijeron
    // que no". La ausencia de datos no es un mal resultado, es ninguno.
    rate: presented === 0 ? null : accepted / presented,
  };
}

export interface AppointmentOutcomeCounts {
  noShow: number;
  completed: number;
  cancelled: number;
  pending: number;
}

/**
 * Tasa de ausencias, sobre las citas que YA PASARON.
 *
 * Dos exclusiones deliberadas del denominador:
 *
 * · **Las pendientes.** Con la agenda futura dentro, el porcentaje baja solo
 *   por tener el año lleno: un número que mejora sin que nadie haga nada mejor.
 *
 * · **Las canceladas.** Quien avisa libera el hueco y quien no aparece lo
 *   quema; no son el mismo hecho. Meterlas juntas diluye la ausencia y castiga
 *   al paciente que hizo lo correcto.
 *
 * Queda `noShow / (noShow + completed)`: de las citas que llegaron a su hora,
 * cuántas se quedaron sin nadie en el sillón.
 */
export function computeNoShowRate(counts: AppointmentOutcomeCounts): number | null {
  const attended = counts.noShow + counts.completed;
  return attended === 0 ? null : counts.noShow / attended;
}
