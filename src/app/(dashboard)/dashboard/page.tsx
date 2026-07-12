import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Panel",
};

export default async function DashboardPage(): Promise<React.ReactElement> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defensa en profundidad: el middleware ya redirige, pero verificamos aquí.
  if (user === null) {
    redirect("/login");
  }

  return (
    <main className="container py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Panel</h1>
          <p className="text-muted-foreground">Sesión iniciada como {user.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <Button variant="outline" type="submit">
            Cerrar sesión
          </Button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Citas</CardTitle>
            <CardDescription>Agenda del día</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Próximamente</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Clientes</CardTitle>
            <CardDescription>Base de clientes</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Próximamente</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Servicios</CardTitle>
            <CardDescription>Catálogo y precios</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Próximamente</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
