"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Plus, Search, Users } from "lucide-react";

import { CustomerForm } from "@/app/(dashboard)/customers/customer-form";
import { CustomerAvatar } from "@/app/(dashboard)/customers/customer-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCreateCustomer, useCustomers } from "@/hooks/use-customers";
import { formatDate } from "@/lib/format";

interface CustomersViewProps {
  salonId: string;
}

export function CustomersView({ salonId }: CustomersViewProps): React.ReactElement {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: customers, isPending, isError, error } = useCustomers(
    salonId,
    search,
  );
  const createMutation = useCreateCustomer(salonId);

  const hasResults = !isPending && !isError && !!customers && customers.length > 0;

  return (
    <main className="container py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Fichas y historial de visitas de tu salón
            {hasResults ? (
              <span className="ml-2 text-foreground/70">
                · {customers.length}{" "}
                {customers.length === 1 ? "cliente" : "clientes"}
              </span>
            ) : null}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo cliente
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo cliente</DialogTitle>
              <DialogDescription>
                Añade una ficha a la base de clientes del salón.
              </DialogDescription>
            </DialogHeader>
            <CustomerForm
              submitLabel="Crear cliente"
              pending={createMutation.isPending}
              error={
                createMutation.error instanceof Error
                  ? createMutation.error.message
                  : null
              }
              onCancel={() => setDialogOpen(false)}
              onSubmit={(input) => {
                createMutation.mutate(input, {
                  onSuccess: () => setDialogOpen(false),
                });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative mb-5 max-w-sm animate-fade-up [animation-delay:60ms]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, email o teléfono…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar clientes"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 shadow-sm animate-fade-up [animation-delay:120ms]">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead className="w-10" aria-label="Acciones" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index} className="hover:bg-transparent">
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))
            ) : isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-14 text-center">
                  <p className="text-sm text-destructive">
                    {error instanceof Error ? error.message : "Error al cargar"}
                  </p>
                </TableCell>
              </TableRow>
            ) : !customers || customers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-16">
                  <div className="mx-auto flex max-w-xs flex-col items-center text-center">
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-inset ring-primary/10">
                      <Users className="h-6 w-6" />
                    </span>
                    <p className="font-medium">
                      {search.trim() === ""
                        ? "Aún no hay clientes"
                        : "Sin coincidencias"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {search.trim() === ""
                        ? "Crea la primera ficha para empezar a registrar visitas."
                        : "Ningún cliente coincide con tu búsqueda. Prueba con otro término."}
                    </p>
                    {search.trim() === "" ? (
                      <Button
                        className="mt-5"
                        variant="outline"
                        onClick={() => setDialogOpen(true)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Nuevo cliente
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id} className="group">
                  <TableCell className="pl-4 font-medium">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CustomerAvatar name={customer.full_name} />
                      <span className="transition-colors group-hover:text-primary">
                        {customer.full_name}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {customer.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatDate(customer.created_at)}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
