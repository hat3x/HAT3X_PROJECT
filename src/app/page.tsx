import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage(): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">Salon OS</h1>
      <p className="max-w-md text-center text-muted-foreground">
        Sistema de gestión integral para salones de belleza: citas, clientes,
        servicios y equipo en un solo lugar.
      </p>
      <Button asChild>
        <Link href="/login">Iniciar sesión</Link>
      </Button>
    </main>
  );
}
