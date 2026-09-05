import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface SectionPlaceholderProps {
  title: string;
  description: string;
}

/**
 * Estado vacío reutilizable para las secciones de ajustes todavía sin
 * implementar. Cada sub-tarea posterior reemplaza la página que lo usa por
 * su contenido real.
 */
export function SectionPlaceholder({
  title,
  description,
}: SectionPlaceholderProps): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Esta sección está en construcción.
        </p>
      </CardContent>
    </Card>
  );
}
