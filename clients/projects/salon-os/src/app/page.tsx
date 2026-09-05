import Link from "next/link";

import { KairosMark } from "@/components/brand/kairos-mark";
import { Button } from "@/components/ui/button";

export default function HomePage(): React.ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-brand">
        <KairosMark className="h-8 w-8" title="Kairos" />
      </span>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Kairos</h1>
        <p className="text-lg text-muted-foreground">Cada cliente, en su momento.</p>
      </div>
      <p className="max-w-md text-center text-muted-foreground">
        Gestión para negocios de cita previa: agenda, fichas, cobros y
        fidelización en un solo lugar.
      </p>
      <Button asChild>
        <Link href="/login">Iniciar sesión</Link>
      </Button>
    </main>
  );
}
