"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Upload } from "lucide-react";

import { importMenuCsv } from "@/app/(dashboard)/carta/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { menuKeys } from "@/lib/queries/menu";

const PLACEHOLDER = [
  "categoria,producto,entero,decimales,iva,estacion,alergenos,es_combo",
  "Bebidas,Caña,1,80,10,Barra,,no",
  "Entrantes,Croquetas de jamón,6,50,10,Cocina,gluten;lacteos,no",
].join("\n");

interface CsvImportDialogProps {
  salonId: string;
}

/**
 * Importador CSV de la carta: pega el texto (formato de columnas fijas
 * documentado en `lib/restauracion/csv-import.ts`), llama al Server Action
 * `importMenuCsv` directamente (patrón de `delete-invoice-button.tsx`:
 * `useTransition` + llamada async sin pasar por un hook de mutación) y
 * muestra el resultado. Categorías/estaciones nuevas se crean solas; los
 * errores de fila NO abortan el resto — se listan junto al recuento de lo
 * importado.
 */
export function CsvImportDialog({ salonId }: CsvImportDialogProps): React.ReactElement {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleImport(): void {
    setResult(null);
    startTransition(async () => {
      const response = await importMenuCsv(csv);
      if (response.ok) {
        setResult({ ok: true, message: `${response.data.created} producto(s) importado(s).` });
        void queryClient.invalidateQueries({ queryKey: menuKeys.all(salonId) });
      } else {
        setResult({ ok: false, message: response.error });
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setResult(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
          Importar CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar carta desde CSV</DialogTitle>
          <DialogDescription>
            Columnas fijas: categoría, producto, euros, céntimos, IVA, estación,
            alérgenos (separados por «;»), es combo («si»/«no»). La primera fila
            (cabecera) se ignora. Las categorías y estaciones que no existan se
            crean automáticamente.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={10}
          className="font-mono text-xs"
          aria-label="Contenido CSV a importar"
        />

        {result !== null ? (
          <p
            role={result.ok ? "status" : "alert"}
            className={
              result.ok
                ? "flex items-start gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm"
                : "text-sm text-destructive"
            }
          >
            {result.ok ? (
              <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            ) : null}
            <span>{result.message}</span>
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cerrar
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={pending || csv.trim() === ""}
          >
            {pending ? "Importando…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
