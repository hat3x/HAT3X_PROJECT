"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  CalendarHeart,
  ClipboardList,
  Gift,
  Mail,
  Pencil,
  Phone,
  Sparkles,
  Stethoscope,
  Trash2,
  TrendingUp,
} from "lucide-react";

import { CustomerAvatar } from "@/app/(dashboard)/customers/customer-avatar";
import { CustomerForm } from "@/app/(dashboard)/customers/customer-form";
import { ClinicalRecordCard } from "@/app/(dashboard)/customers/[id]/clinical-record-card";
import { InsuranceCard } from "@/app/(dashboard)/customers/[id]/insurance-card";
import { VisitNotesCard } from "@/app/(dashboard)/customers/[id]/visit-notes-card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCustomer,
  useCustomerVisits,
  useDeleteCustomer,
  useUpdateCustomer,
} from "@/hooks/use-customers";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { Customer, SalonSector } from "@/types/database";

interface CustomerDetailViewProps {
  salonId: string;
  customerId: string;
  initialCustomer: Customer;
  /**
   * Si el salón tiene contratado el add-on de fidelización. Resuelto en servidor
   * (`activeSalonHasFeature("loyalty")`). Cuando es `false` ocultamos el acceso a
   * la ficha de fidelización: sin add-on, esa ruta redirige y `lookupByQr` da 403.
   */
  loyaltyEnabled: boolean;
  /** Sector del salón activo (null si no pudo resolverse). Gate de UI para ficha clínica. */
  salonSector: SalonSector | null;
}

export function CustomerDetailView({
  salonId,
  customerId,
  initialCustomer,
  loyaltyEnabled,
  salonSector,
}: CustomerDetailViewProps): React.ReactElement {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: customer } = useCustomer(salonId, customerId, initialCustomer);
  const visitsQuery = useCustomerVisits(salonId, customerId);
  const updateMutation = useUpdateCustomer(salonId, customerId);
  const deleteMutation = useDeleteCustomer(salonId);

  // `initialCustomer` garantiza que nunca sea undefined tras la hidratación.
  const record = customer ?? initialCustomer;

  const visitStats = useMemo(() => {
    const visits = visitsQuery.data;
    if (!visits || visits.length === 0) return null;
    const totalCents = visits.reduce((acc, v) => acc + v.amount_cents, 0);
    return {
      count: visits.length,
      totalCents,
      currency: visits[0]?.currency ?? "EUR",
      lastVisitedAt: visits[0]?.visited_at ?? null,
    };
  }, [visitsQuery.data]);

  return (
    <main className="container py-10">
      <Link
        href="/customers"
        className="group mb-6 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Volver a clientes
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4 animate-fade-up">
        <div className="flex items-center gap-4">
          <CustomerAvatar name={record.full_name} size="lg" />
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">
              {record.full_name}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <CalendarHeart className="h-4 w-4" />
              Cliente desde {formatDate(record.created_at)}
              {record.marketing_consent ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                  <Sparkles className="h-3 w-3" />
                  Marketing
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {salonSector === "odontologia" ? (
            <Button variant="outline" asChild>
              <Link href={`/odontograma?paciente=${customerId}`}>
                <Stethoscope className="mr-2 h-4 w-4" aria-hidden="true" />
                Ver odontograma
              </Link>
            </Button>
          ) : null}
          {loyaltyEnabled ? (
            <Button variant="outline" asChild>
              <Link href={`/customers/${customerId}/loyalty`}>
                <Gift className="mr-2 h-4 w-4" aria-hidden="true" />
                Fidelización
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar
          </Button>
        </div>
      </div>

      {visitStats !== null ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3 animate-fade-up [animation-delay:80ms]">
          <div className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <ClipboardList className="h-4.5 w-4.5" />
            </span>
            <p className="text-2xl font-bold tabular-nums">{visitStats.count}</p>
            <p className="text-xs text-muted-foreground">
              {visitStats.count === 1 ? "visita registrada" : "visitas registradas"}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <TrendingUp className="h-4.5 w-4.5" />
            </span>
            <p className="text-2xl font-bold tabular-nums">
              {formatMoney(visitStats.totalCents, visitStats.currency)}
            </p>
            <p className="text-xs text-muted-foreground">total gastado</p>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
            <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <CalendarClock className="h-4.5 w-4.5" />
            </span>
            <p className="text-2xl font-bold tabular-nums">
              {visitStats.lastVisitedAt !== null
                ? formatDate(visitStats.lastVisitedAt)
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">última visita</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3 animate-fade-up [animation-delay:160ms]">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Datos de contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center gap-3 rounded-lg py-2">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              {record.email !== null ? (
                <a
                  href={`mailto:${record.email}`}
                  className="truncate transition-colors hover:text-primary"
                >
                  {record.email}
                </a>
              ) : (
                <span className="text-muted-foreground">Sin email</span>
              )}
            </div>
            <div className="flex items-center gap-3 rounded-lg py-2">
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              {record.phone !== null ? (
                <a
                  href={`tel:${record.phone}`}
                  className="tabular-nums transition-colors hover:text-primary"
                >
                  {record.phone}
                </a>
              ) : (
                <span className="text-muted-foreground">Sin teléfono</span>
              )}
            </div>
            <div className="flex items-center gap-3 rounded-lg py-2">
              <CalendarHeart className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className={record.birth_date === null ? "text-muted-foreground" : ""}>
                {record.birth_date !== null
                  ? formatDate(record.birth_date)
                  : "Sin fecha de nacimiento"}
              </span>
            </div>
            <div className="pt-2">
              <Badge variant={record.marketing_consent ? "default" : "secondary"}>
                {record.marketing_consent
                  ? "Acepta marketing"
                  : "Sin consentimiento de marketing"}
              </Badge>
            </div>
            {record.notes !== null && record.notes !== "" ? (
              <div className="mt-3 rounded-lg border bg-muted/40 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Notas
                </p>
                <p className="whitespace-pre-wrap text-foreground/90">
                  {record.notes}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Historial de visitas</CardTitle>
            <CardDescription>
              Servicios realizados, del más reciente al más antiguo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {visitsQuery.isPending ? (
              <div className="space-y-6 border-l pl-6">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between gap-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-3 w-52" />
                  </div>
                ))}
              </div>
            ) : visitsQuery.isError ? (
              <p className="py-6 text-center text-sm text-destructive">
                {visitsQuery.error instanceof Error
                  ? visitsQuery.error.message
                  : "Error al cargar el historial"}
              </p>
            ) : visitsQuery.data.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-inset ring-primary/10">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <p className="font-medium">Sin visitas todavía</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Cuando este cliente reciba un servicio, su historial aparecerá
                  aquí.
                </p>
              </div>
            ) : (
              <ol className="relative space-y-6 border-l border-border pl-6">
                {visitsQuery.data.map((visit) => (
                  <li key={visit.id} className="relative">
                    <span className="absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary ring-2 ring-primary/20" />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{visit.service_name}</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(visit.amount_cents, visit.currency)}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(visit.visited_at)}
                      {visit.professional !== null
                        ? ` · ${visit.professional.full_name}`
                        : ""}
                    </p>
                    {visit.notes !== null && visit.notes !== "" ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {visit.notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notas clínicas de visita — visible en todos los sectores */}
      <div className="mt-6 grid gap-6 animate-fade-up [animation-delay:240ms]">
        <VisitNotesCard salonId={salonId} customerId={customerId} />
      </div>

      {/* Ficha clínica — solo visible en salones con sector odontología */}
      {salonSector === "odontologia" ? (
        <div className="mt-6 grid gap-6 animate-fade-up [animation-delay:320ms]">
          <ClinicalRecordCard salonId={salonId} customerId={customerId} />
        </div>
      ) : null}

      {/* Seguro / Mutua — solo visible en salones con sector odontología */}
      {salonSector === "odontologia" ? (
        <div className="mt-6 grid gap-6 animate-fade-up [animation-delay:360ms]">
          <InsuranceCard salonId={salonId} customerId={customerId} />
        </div>
      ) : null}

      {/* Diálogo de edición */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
            <DialogDescription>
              Actualiza los datos de la ficha.
            </DialogDescription>
          </DialogHeader>
          <CustomerForm
            defaultValues={{
              full_name: record.full_name,
              email: record.email ?? "",
              phone: record.phone ?? "",
              birth_date: record.birth_date ?? "",
              notes: record.notes ?? "",
              marketing_consent: record.marketing_consent,
              tax_id: record.tax_id ?? "",
              address: record.address ?? "",
            }}
            submitLabel="Guardar cambios"
            pending={updateMutation.isPending}
            error={
              updateMutation.error instanceof Error
                ? updateMutation.error.message
                : null
            }
            onCancel={() => setEditOpen(false)}
            onSubmit={(input) => {
              updateMutation.mutate(input, {
                onSuccess: () => setEditOpen(false),
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación de borrado */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar cliente</DialogTitle>
            <DialogDescription>
              Se eliminará la ficha de {record.full_name}. Esta acción no se
              puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.error instanceof Error ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteMutation.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                deleteMutation.mutate(customerId, {
                  onSuccess: () => {
                    router.push("/customers");
                    router.refresh();
                  },
                });
              }}
            >
              {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
