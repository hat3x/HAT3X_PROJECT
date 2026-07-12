"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Search, Users } from "lucide-react";

import { CustomerForm } from "@/app/(dashboard)/customers/customer-form";
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

  return (
    <main className="container py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Fichas y historial de visitas de tu salón
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

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, email o teléfono…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar clientes"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Alta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-destructive">
                  {error instanceof Error ? error.message : "Error al cargar"}
                </TableCell>
              </TableRow>
            ) : !customers || customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center">
                  <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {search.trim() === ""
                      ? "Aún no hay clientes. Crea el primero."
                      : "Ningún cliente coincide con la búsqueda."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="hover:underline"
                    >
                      {customer.full_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(customer.created_at)}
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
