"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addVisitNote,
  signVisitNote,
  updateVisitNote,
} from "@/app/(dashboard)/customers/visit-note-actions";
import {
  fetchVisitsWithNotes,
  visitNoteKeys,
} from "@/lib/queries/visit-notes";

/** Devuelve todas las visitas del paciente con su nota clínica (si existe). */
export function useVisitsWithNotes(salonId: string, customerId: string) {
  return useQuery({
    queryKey: visitNoteKeys.patient(salonId, customerId),
    queryFn: () => fetchVisitsWithNotes(salonId, customerId),
  });
}

/** Crea una nueva nota clínica en una visita sin nota. */
export function useAddVisitNote(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      visitId,
      content,
    }: {
      visitId: string;
      content: string;
    }) =>
      addVisitNote(customerId, visitId, content).then((r) => {
        if (!r.ok) throw new Error(r.error);
        return r.data;
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: visitNoteKeys.patient(salonId, customerId),
      });
    },
  });
}

/** Actualiza el contenido de una nota clínica no firmada. */
export function useUpdateVisitNote(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      visitId,
      content,
    }: {
      visitId: string;
      content: string;
    }) =>
      updateVisitNote(customerId, visitId, content).then((r) => {
        if (!r.ok) throw new Error(r.error);
        return r.data;
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: visitNoteKeys.patient(salonId, customerId),
      });
    },
  });
}

/** Firma una nota clínica (irreversible — trigger de inmutabilidad en BD). */
export function useSignVisitNote(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visitId: string) =>
      signVisitNote(customerId, visitId).then((r) => {
        if (!r.ok) throw new Error(r.error);
        return r.data;
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: visitNoteKeys.patient(salonId, customerId),
      });
    },
  });
}
