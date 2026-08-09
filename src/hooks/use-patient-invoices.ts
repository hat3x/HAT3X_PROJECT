"use client";

import { useQuery } from "@tanstack/react-query";

import {
  fetchPatientInvoices,
  patientInvoiceKeys,
} from "@/lib/queries/patient-invoices";

/** Facturas/tickets generados en Kairos (TPV) para un paciente (solo lectura). */
export function usePatientInvoices(salonId: string, customerId: string) {
  return useQuery({
    queryKey: patientInvoiceKeys.patient(salonId, customerId),
    queryFn: () => fetchPatientInvoices(salonId, customerId),
  });
}
