"use client";

import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Lock,
  Pencil,
  Plus,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddVisitNote,
  useSignVisitNote,
  useUpdateVisitNote,
  useVisitsWithNotes,
} from "@/hooks/use-visit-notes";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { VisitWithNote } from "@/lib/queries/visit-notes";

// ---------------------------------------------------------------------------
// Inline add-note form
// ---------------------------------------------------------------------------

interface AddNoteFormProps {
  visitId: string;
  salonId: string;
  customerId: string;
  onClose: () => void;
}

function AddNoteForm({ visitId, salonId, customerId, onClose }: AddNoteFormProps) {
  const [content, setContent] = useState("");
  const mutation = useAddVisitNote(salonId, customerId);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (content.trim() === "") return;
    mutation.mutate({ visitId, content }, { onSuccess: onClose });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`note-add-${visitId}`} className="text-xs text-muted-foreground">
          Nota clínica
        </Label>
        <Textarea
          id={`note-add-${visitId}`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Describe la evolución, tratamiento realizado, observaciones para la próxima visita…"
          rows={3}
          disabled={mutation.isPending}
          maxLength={8000}
          className="resize-none text-sm"
          autoFocus
        />
      </div>
      {mutation.error instanceof Error ? (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {mutation.error.message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={mutation.isPending || content.trim() === ""}
        >
          {mutation.isPending ? "Guardando…" : "Guardar nota"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Single visit row with note management
// ---------------------------------------------------------------------------

interface VisitRowProps {
  visit: VisitWithNote;
  salonId: string;
  customerId: string;
}

function VisitRow({ visit, salonId, customerId }: VisitRowProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [editContent, setEditContent] = useState(visit.note?.content ?? "");

  const updateMutation = useUpdateVisitNote(salonId, customerId);
  const signMutation = useSignVisitNote(salonId, customerId);

  const note = visit.note;
  const isSigned = note?.signed === true;

  const dotClass = isSigned
    ? "bg-green-500 ring-green-200 dark:ring-green-900"
    : note !== null
      ? "bg-primary ring-primary/20"
      : "bg-muted-foreground/30 ring-muted/10";

  function handleUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (editContent.trim() === "") return;
    updateMutation.mutate(
      { visitId: visit.id, content: editContent },
      { onSuccess: () => setEditOpen(false) },
    );
  }

  return (
    <li className="relative">
      {/* Timeline dot — green for signed, primary for unsigned note, muted for no note */}
      <span
        className={`absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-background ring-2 ${dotClass}`}
      />

      {/* Visit header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{visit.service_name}</p>
        <p className="tabular-nums text-xs text-muted-foreground">
          {formatMoney(visit.amount_cents, visit.currency)}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {formatDateTime(visit.visited_at)}
        {visit.professional !== null ? ` · ${visit.professional.full_name}` : ""}
      </p>

      {/* Note area */}
      {note === null ? (
        addOpen ? (
          <AddNoteForm
            visitId={visit.id}
            salonId={salonId}
            customerId={customerId}
            onClose={() => setAddOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-2 flex items-center gap-1 rounded text-xs text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir nota clínica
          </button>
        )
      ) : isSigned ? (
        /* Signed note — strictly read-only */
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-900/40 dark:bg-green-950/20">
          <div className="mb-2 flex items-center gap-1.5">
            <Lock className="h-3 w-3 shrink-0 text-green-600 dark:text-green-400" />
            <span className="text-xs font-medium text-green-700 dark:text-green-400">
              Firmada
              {note.signed_at !== null
                ? ` el ${formatDateTime(note.signed_at)}`
                : ""}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground/90">
            {note.content}
          </p>
        </div>
      ) : (
        /* Unsigned note — editable and signable */
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="whitespace-pre-wrap text-sm text-foreground/90">
              {note.content}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => {
                setEditContent(note.content);
                setEditOpen(true);
              }}
            >
              <Pencil className="h-3 w-3" />
              Editar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/30"
              onClick={() => setSignOpen(true)}
            >
              <CheckCircle2 className="h-3 w-3" />
              Firmar
            </Button>
          </div>
        </div>
      )}

      {/* ── Edit dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar nota clínica</DialogTitle>
            <DialogDescription>
              {visit.service_name} · {formatDateTime(visit.visited_at)}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor={`note-edit-${visit.id}`}>Nota</Label>
              <Textarea
                id={`note-edit-${visit.id}`}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={6}
                disabled={updateMutation.isPending}
                maxLength={8000}
              />
            </div>
            {updateMutation.error instanceof Error ? (
              <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {updateMutation.error.message}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={updateMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  updateMutation.isPending || editContent.trim() === ""
                }
              >
                {updateMutation.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Sign confirmation dialog ── */}
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Firmar nota clínica</DialogTitle>
            <DialogDescription>
              Una vez firmada, la nota queda inamovible: no podrá editarse ni
              eliminarse. Esta acción es irreversible.
            </DialogDescription>
          </DialogHeader>
          {note !== null && !isSigned ? (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="whitespace-pre-wrap">{note.content}</p>
            </div>
          ) : null}
          {signMutation.error instanceof Error ? (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {signMutation.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSignOpen(false)}
              disabled={signMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              disabled={signMutation.isPending}
              onClick={() =>
                signMutation.mutate(visit.id, {
                  onSuccess: () => setSignOpen(false),
                })
              }
            >
              {signMutation.isPending ? "Firmando…" : "Firmar nota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Public card component
// ---------------------------------------------------------------------------

interface VisitNotesCardProps {
  salonId: string;
  customerId: string;
}

export function VisitNotesCard({ salonId, customerId }: VisitNotesCardProps) {
  const query = useVisitsWithNotes(salonId, customerId);

  const totalNotes = query.data?.filter((v) => v.note !== null).length ?? 0;
  const signedCount =
    query.data?.filter((v) => v.note?.signed === true).length ?? 0;

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Notas clínicas
            {totalNotes > 0 ? (
              <Badge variant="secondary" className="font-normal">
                {totalNotes}
                {signedCount > 0
                  ? ` · ${signedCount} firmada${signedCount !== 1 ? "s" : ""}`
                  : ""}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            Registro clínico por visita, de la más reciente a la más antigua.
            Las notas firmadas son inamovibles.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {query.isPending ? (
          <div className="space-y-6 border-l pl-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-3 w-52" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            {query.error instanceof Error
              ? query.error.message
              : "Error al cargar las notas"}
          </p>
        ) : query.data.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-inset ring-primary/10">
              <FileText className="h-5 w-5" />
            </span>
            <p className="font-medium">Sin visitas registradas</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Las notas clínicas aparecerán aquí una vez que se registren
              visitas para este cliente.
            </p>
          </div>
        ) : (
          <ol className="relative space-y-6 border-l border-border pl-6">
            {query.data.map((visit) => (
              <VisitRow
                key={visit.id}
                visit={visit}
                salonId={salonId}
                customerId={customerId}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
