"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  ClipboardList,
  Mail,
  Pencil,
  Phone,
  Trash2,
  TrendingUp,
} from "lucide-react";

import { CustomerForm } from "@/app/(dashboard)/customers/customer-form";
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
import type { Customer } from "@/types/database";

interface CustomerDetailViewProps {
  salonId: string;
  customerId: string;
  initialCustomer: Customer;
}

export function CustomerDetailView({
  salonId,
  customerId,
  initialCustomer,
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
        className="mb-6 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Volver a clientes
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {record.full_name}
          </h1>
          <p className="text-muted-foreground">
            Cliente desde {formatDate(record.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Button>
          <Button variant="outline" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar
          </Button>
        </div>
      </div>

      {visitStats !== null ? (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-4 text-center">
            <ClipboardList className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
            <p className="text-2xl font-bold">{visitStats.count}</p>
            <p className="text-xs text-muted-foreground">
              {visitStats.count === 1 ? "visita" : "visitas"}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <TrendingUp className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
            <p className="text-2xl font-bold">
              {formatMoney(visitStats.totalCents, visitStats.currency)}
            </p>
            <p className="text-xs text-muted-foreground">total gastado</p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <CalendarClock className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-semibold">
              {visitStats.lastVisitedAt !== null
                ? formatDate(visitStats.lastVisitedAt)
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">última visita</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Datos de contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{record.email ?? "Sin email"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{record.phone ?? "Sin teléfono"}</span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <span>
                {record.birth_date !== null
                  ? formatDate(record.birth_date)
                  : "Sin fecha de nacimiento"}
              </span>
            </div>
            <div>
              <Badge variant={record.marketing_consent ? "default" : "secondary"}>
                {record.marketing_consent
                  ? "Acepta marketing"
                  : "Sin consentimiento de marketing"}
              </Badge>
            </div>
            {record.notes !== null && record.notes !== "" ? (
              <div className="border-t pt-3">
                <p className="mb-1 font-medium">Notas</p>
                <p className="whitespace-pre-wrap text-muted-foreground">
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
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : visitsQuery.isError ? (
              <p className="text-sm text-destructive">
                {visitsQuery.error instanceof Error
                  ? visitsQuery.error.message
                  : "Error al cargar el historial"}
              </p>
            ) : visitsQuery.data.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Este cliente aún no tiene visitas registradas.
              </p>
            ) : (
              <ol className="relative space-y-6 border-l pl-6">
                {visitsQuery.data.map((visit) => (
                  <li key={visit.id} className="relative">
                    <span className="absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{visit.service_name}</p>
                      <p className="text-sm font-medium">
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
