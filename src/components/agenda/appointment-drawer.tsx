"use client";

import { useEffect, useRef, useState } from "react";
import {
  Ban,
  Bell,
  Check,
  CreditCard,
  Phone,
  RotateCcw,
  Scissors,
  StickyNote,
  Trash2,
  User,
  UserX,
  X,
} from "lucide-react";

import { AppointmentStatusBadge } from "@/components/appointments/appointment-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice, formatSlotTime } from "@/lib/booking/format";
import { cn } from "@/lib/utils";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";

/*
 * Salon OS — panel de detalle de cita (drawer lateral).
 * ------------------------------------------------------------------
 * Porta `.drawer`/`.scrim`/`.dr-head`/`.dr-body`/`.dr-actions` del mockup
 * aprobado (docs/superpowers/reference/2026-08-12-agenda-mockup.html):
 * panel fijo a la derecha (400px, max-w-92vw) + velo de fondo, con
 * transición de deslizamiento al abrir/cerrar, cierre con Esc y con click
 * en el velo. Añade "No presentado" y "Borrar" — acciones pedidas por el
 * spec de Fase 3 que no estaban en el mockup original.
 *
 * Puramente presentacional: el padre posee los datos y las mutaciones
 * (queries, TanStack Query, Supabase); este componente solo renderiza y
 * llama a los callbacks recibidos por props. No importa `@/lib/salon`
 * (límite RSC — ver docs/reference_salonos_rsc_boundary).
 */

interface AppointmentDrawerProps {
  /** Cita a mostrar. `null` → panel cerrado/vacío. */
  appointment: AppointmentWithDetails | null;
  open: boolean;
  onClose: () => void;
  timezone: string;
  /** Enlace "Ver ficha" del cliente. `null` → oculta el botón. */
  patientHref: string | null;
  /** Enlace "Cobrar en TPV", p. ej. `/tpv?appointment=<id>`. */
  payHref: string;
  /** Gate de rol para el botón "Borrar". */
  canDelete: boolean;
  /** Deshabilita los botones de estado (primario, no presentado, cancelar) mientras hay una mutación de estado en curso. */
  statusPending: boolean;
  /** Deshabilita "Guardar" mientras se guardan las notas. */
  notesPending: boolean;
  /** Deshabilita "Enviar recordatorio" mientras se envía. */
  reminderPending: boolean;
  /** Resultado del último recordatorio enviado para ESTA cita. */
  reminderMessage: { message: string; isError: boolean } | null;
  onConfirm: (id: string) => void;
  onComplete: (id: string) => void;
  onNoShow: (id: string) => void;
  onReschedule: (appointment: AppointmentWithDetails) => void;
  onSendReminder: (id: string) => void;
  onCancel: (appointment: AppointmentWithDetails) => void;
  onDelete: (appointment: AppointmentWithDetails) => void;
  onSaveNotes: (id: string, notes: string) => void;
}

export function AppointmentDrawer({
  appointment,
  open,
  onClose,
  timezone,
  patientHref,
  payHref,
  canDelete,
  statusPending,
  notesPending,
  reminderPending,
  reminderMessage,
  onConfirm,
  onComplete,
  onNoShow,
  onReschedule,
  onSendReminder,
  onCancel,
  onDelete,
  onSaveNotes,
}: AppointmentDrawerProps): React.ReactElement {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const wasNotesPending = useRef(false);

  // La cita mostrada cambió (otra cita, o se reabrió el panel): el editor
  // de notas vuelve siempre a modo lectura con el valor actual.
  useEffect(() => {
    setIsEditingNotes(false);
    setNoteDraft(appointment?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment?.id]);

  // Guardado terminado (pending true → false): vuelve a modo lectura. Mientras
  // está en curso el editor se queda abierto con "Guardar" deshabilitado.
  useEffect(() => {
    if (wasNotesPending.current && !notesPending) {
      setIsEditingNotes(false);
    }
    wasNotesPending.current = notesPending;
  }, [notesPending]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const isOpen = open && appointment !== null;

  return (
    <>
      {/* Velo de fondo */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-foreground/25 backdrop-blur-sm transition-opacity duration-200",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de la cita"
        aria-hidden={!isOpen}
        className={cn(
          // Mismo z-index que el velo: al ir DESPUÉS en el DOM ya queda por
          // encima (orden de pintado entre hermanos con igual z-index).
          "fixed right-0 top-0 z-40 flex h-full w-[400px] max-w-[92vw] flex-col border-l border-border bg-card shadow-xl transition-transform duration-200 ease-apple-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {appointment !== null ? (
          <>
            <DrawerHeader
              appointment={appointment}
              timezone={timezone}
              patientHref={patientHref}
              onClose={onClose}
            />

            <div className="flex-1 overflow-y-auto px-5 py-1">
              <DrawerField
                icon={<Scissors className="h-4 w-4" />}
                label="Servicio"
                value={
                  <>
                    {appointment.service?.name ?? "—"}
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatPrice(appointment.price_cents, appointment.currency)}
                    </span>
                  </>
                }
              />
              <DrawerField
                icon={<User className="h-4 w-4" />}
                label="Profesional"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          appointment.professional?.color ?? "hsl(var(--muted-foreground))",
                      }}
                    />
                    {appointment.professional?.full_name ?? "Sin profesional"}
                  </span>
                }
              />
              <DrawerField
                icon={<Phone className="h-4 w-4" />}
                label="Teléfono"
                value={
                  appointment.customer?.phone ? (
                    <a
                      href={`tel:${appointment.customer.phone.replace(/\s+/g, "")}`}
                      className="text-primary hover:underline"
                    >
                      {appointment.customer.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Sin teléfono</span>
                  )
                }
              />
              {appointment.status === "cancelled" ? (
                <DrawerField
                  icon={<Ban className="h-4 w-4" />}
                  label="Motivo de cancelación"
                  value={
                    appointment.cancelled_reason ?? (
                      <span className="text-muted-foreground">Sin motivo especificado</span>
                    )
                  }
                />
              ) : null}

              <NotesField
                appointment={appointment}
                isEditing={isEditingNotes}
                draft={noteDraft}
                notesPending={notesPending}
                onStartEdit={() => {
                  setNoteDraft(appointment.notes ?? "");
                  setIsEditingNotes(true);
                }}
                onChangeDraft={setNoteDraft}
                onCancelEdit={() => {
                  setIsEditingNotes(false);
                  setNoteDraft(appointment.notes ?? "");
                }}
                onSave={() => onSaveNotes(appointment.id, noteDraft.trim())}
              />
            </div>

            <DrawerActions
              appointment={appointment}
              payHref={payHref}
              canDelete={canDelete}
              statusPending={statusPending}
              reminderPending={reminderPending}
              reminderMessage={reminderMessage}
              onConfirm={onConfirm}
              onComplete={onComplete}
              onNoShow={onNoShow}
              onReschedule={onReschedule}
              onSendReminder={onSendReminder}
              onCancel={onCancel}
              onDelete={onDelete}
            />
          </>
        ) : null}
      </aside>
    </>
  );
}

// ── Cabecera ──────────────────────────────────────────────────────────────

interface DrawerHeaderProps {
  appointment: AppointmentWithDetails;
  timezone: string;
  patientHref: string | null;
  onClose: () => void;
}

function DrawerHeader({
  appointment,
  timezone,
  patientHref,
  onClose,
}: DrawerHeaderProps): React.ReactElement {
  const customerName = appointment.customer?.full_name ?? "Cliente";

  return (
    <div className="relative shrink-0 border-b border-border px-5 pb-3.5 pt-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-3.5 top-3.5 h-8 w-8 rounded-md"
        onClick={onClose}
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Cerrar</span>
      </Button>

      <AppointmentStatusBadge status={appointment.status} className="mb-2.5" />

      <div className="flex flex-wrap items-center gap-2 pr-9">
        <h2 className="truncate text-xl font-bold tracking-tight text-card-foreground">
          {customerName}
        </h2>
        {patientHref !== null ? (
          <a
            href={patientHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors duration-150 ease-apple-out hover:bg-primary/15"
          >
            <User className="h-3.5 w-3.5" />
            Ver ficha
          </a>
        ) : null}
      </div>

      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
        {formatSlotTime(appointment.starts_at, timezone)}–
        {formatSlotTime(appointment.ends_at, timezone)}
      </p>
    </div>
  );
}

// ── Filas de campo ───────────────────────────────────────────────────────

interface DrawerFieldProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function DrawerField({ icon, label, value }: DrawerFieldProps): React.ReactElement {
  return (
    <div className="flex gap-3 border-b border-border py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-sm font-medium text-card-foreground">{value}</div>
      </div>
    </div>
  );
}

// ── Notas (siempre visibles, editables) ──────────────────────────────────

interface NotesFieldProps {
  appointment: AppointmentWithDetails;
  isEditing: boolean;
  draft: string;
  notesPending: boolean;
  onStartEdit: () => void;
  onChangeDraft: (value: string) => void;
  onCancelEdit: () => void;
  onSave: () => void;
}

function NotesField({
  appointment,
  isEditing,
  draft,
  notesPending,
  onStartEdit,
  onChangeDraft,
  onCancelEdit,
  onSave,
}: NotesFieldProps): React.ReactElement {
  return (
    <div className="flex gap-3 border-b border-border py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <StickyNote className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Notas de la cita
          </span>
          {!isEditing ? (
            <button
              type="button"
              onClick={onStartEdit}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {appointment.notes ? "Editar" : "Añadir"}
            </button>
          ) : null}
        </div>

        {!isEditing ? (
          <p className="mt-0.5 whitespace-pre-wrap text-sm font-medium text-card-foreground">
            {appointment.notes ? (
              appointment.notes
            ) : (
              <span className="font-normal text-muted-foreground">Sin notas.</span>
            )}
          </p>
        ) : (
          <div className="mt-1.5">
            <Textarea
              autoFocus
              value={draft}
              onChange={(event) => onChangeDraft(event.target.value)}
              disabled={notesPending}
              placeholder="Escribe una nota…"
              className="min-h-[74px] text-sm"
            />
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" disabled={notesPending} onClick={onSave}>
                {notesPending ? "Guardando…" : "Guardar"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Acciones (footer) ────────────────────────────────────────────────────

interface DrawerActionsProps {
  appointment: AppointmentWithDetails;
  payHref: string;
  canDelete: boolean;
  statusPending: boolean;
  reminderPending: boolean;
  reminderMessage: { message: string; isError: boolean } | null;
  onConfirm: (id: string) => void;
  onComplete: (id: string) => void;
  onNoShow: (id: string) => void;
  onReschedule: (appointment: AppointmentWithDetails) => void;
  onSendReminder: (id: string) => void;
  onCancel: (appointment: AppointmentWithDetails) => void;
  onDelete: (appointment: AppointmentWithDetails) => void;
}

function DrawerActions({
  appointment,
  payHref,
  canDelete,
  statusPending,
  reminderPending,
  reminderMessage,
  onConfirm,
  onComplete,
  onNoShow,
  onReschedule,
  onSendReminder,
  onCancel,
  onDelete,
}: DrawerActionsProps): React.ReactElement | null {
  const { status } = appointment;
  // pending|confirmed comparten reprogramar/recordatorio/no-presentado/cancelar.
  const canTransition = status === "pending" || status === "confirmed";
  const canDeleteHere = status === "cancelled" && canDelete;
  const hasPrimary = canTransition || status === "completed";

  if (!hasPrimary && !canTransition && !canDeleteHere) return null;

  return (
    <div className="flex shrink-0 flex-col gap-2.5 border-t border-border bg-muted/40 px-5 py-3.5">
      {status === "pending" ? (
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={statusPending}
          onClick={() => onConfirm(appointment.id)}
        >
          <Check className="mr-1.5 h-4 w-4" />
          Confirmar cita
        </Button>
      ) : null}

      {status === "confirmed" ? (
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={statusPending}
          onClick={() => onComplete(appointment.id)}
        >
          <Check className="mr-1.5 h-4 w-4" />
          Marcar completada
        </Button>
      ) : null}

      {status === "completed" ? (
        <Button
          asChild
          size="lg"
          className={cn(
            "w-full bg-success text-success-foreground shadow-sm hover:bg-success/90",
            statusPending && "pointer-events-none opacity-50",
          )}
        >
          <a href={payHref} aria-disabled={statusPending}>
            <CreditCard className="mr-1.5 h-4 w-4" />
            Cobrar en TPV
          </a>
        </Button>
      ) : null}

      {canTransition ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => onReschedule(appointment)}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reprogramar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 text-xs"
            disabled={reminderPending}
            onClick={() => onSendReminder(appointment.id)}
          >
            <Bell className="mr-1.5 h-3.5 w-3.5" />
            {reminderPending ? "Enviando…" : "Enviar recordatorio"}
          </Button>
        </div>
      ) : null}

      {reminderMessage ? (
        <p
          className={cn(
            "text-xs font-medium",
            reminderMessage.isError ? "text-destructive" : "text-success",
          )}
        >
          {reminderMessage.message}
        </p>
      ) : null}

      {canTransition ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full text-muted-foreground"
          disabled={statusPending}
          onClick={() => onNoShow(appointment.id)}
        >
          <UserX className="mr-1.5 h-3.5 w-3.5" />
          No presentado
        </Button>
      ) : null}

      {canTransition || canDeleteHere ? (
        <div className="mt-0.5 border-t border-dashed border-border pt-2.5">
          {canTransition ? (
            <Button
              type="button"
              variant="outline"
              className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={statusPending}
              onClick={() => onCancel(appointment)}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancelar cita
            </Button>
          ) : null}
          {canDeleteHere ? (
            <Button
              type="button"
              variant="outline"
              className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(appointment)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Borrar
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
