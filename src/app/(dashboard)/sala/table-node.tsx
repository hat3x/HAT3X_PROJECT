"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { clampPosition } from "@/lib/restauracion/tables";
import { cn } from "@/lib/utils";
import type { DiningTable } from "@/types/database";

export type TableTone = "free" | "busy" | "bill" | "cleaning";

const TONE_CLASSES: Record<TableTone, string> = {
  free: "border-success/40 bg-success/10 text-success",
  busy: "border-primary/40 bg-primary/10 text-primary",
  bill: "border-warning/40 bg-warning/10 text-warning",
  cleaning: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

interface TableNodeProps {
  table: DiningTable;
  tone: TableTone;
  /** Modo edición del plano (Task 7): habilita el arrastre y desactiva la
   * selección por click (en edición, tocar una mesa no debe abrir su panel). */
  editable: boolean;
  onSelect: () => void;
  /** Llamado al soltar tras arrastrar, con la nueva posición en % [0,100]
   * ya acotada (`clampPosition`). Solo se dispara en modo edición. */
  onDragEnd?: (pos: { posX: number; posY: number }) => void;
}

/**
 * Nodo de mesa del plano de sala (Task 7): pinta el nombre y el rango de
 * comensales de la mesa, coloreado según `tone` (derivado de `tableTone`,
 * `@/lib/restauracion/tables`, Task 3). Se posiciona en `%` de `pos_x`/`pos_y`
 * dentro del lienzo `position:relative` del padre (`sala-view.tsx`) — el
 * PROPIO nodo calcula su `left`/`top`, así el padre solo necesita listar las
 * mesas de la zona activa.
 *
 * Arrastre: eventos de puntero nativos (`onPointerDown/Move/Up`, sin
 * librería) SOLO cuando `editable`. Mientras se arrastra, la posición visual
 * sigue al puntero en estado local (`dragPos`) calculada contra el
 * `getBoundingClientRect()` del contenedor padre; al soltar, `onDragEnd`
 * entrega la posición final acotada y el padre decide cuándo persistirla
 * (`useSaveTablePosition`) — este componente NUNCA llama a la mutación
 * directamente, mismo reparto de responsabilidades que `TablePanel`.
 */
export function TableNode({
  table,
  tone,
  editable,
  onSelect,
  onDragEnd,
}: TableNodeProps): React.ReactElement {
  const ref = useRef<HTMLButtonElement>(null);
  const draggingRef = useRef(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!editable) return;
    draggingRef.current = true;
    // jsdom (entorno de test) no implementa la captura de puntero — se
    // comprueba el método antes de llamarlo para no romper `table-node.test.tsx`
    // (mismo motivo por el que `image-gallery.tsx` evita el `Select` de Radix
    // en su filtro: `hasPointerCapture`/`setPointerCapture` no existen en jsdom).
    if (typeof ref.current?.setPointerCapture === "function") {
      ref.current.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!editable || !draggingRef.current) return;
    const canvas = ref.current?.parentElement;
    if (canvas === null || canvas === undefined) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    setDragPos({
      x: clampPosition(((event.clientX - rect.left) / rect.width) * 100),
      y: clampPosition(((event.clientY - rect.top) / rect.height) * 100),
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!editable || !draggingRef.current) return;
    draggingRef.current = false;
    if (typeof ref.current?.releasePointerCapture === "function") {
      ref.current.releasePointerCapture(event.pointerId);
    }
    if (dragPos !== null) {
      onDragEnd?.({ posX: dragPos.x, posY: dragPos.y });
    }
    setDragPos(null);
  }

  function handleClick(): void {
    if (editable) return;
    onSelect();
  }

  const posX = dragPos?.x ?? table.pos_x;
  const posY = dragPos?.y ?? table.pos_y;

  return (
    <button
      ref={ref}
      type="button"
      data-tone={tone}
      aria-label={table.name}
      className={cn(
        "absolute flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 touch-none flex-col items-center justify-center gap-0.5 rounded-2xl border-2 text-sm font-semibold shadow-sm transition-colors duration-150 ease-apple-out",
        editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        TONE_CLASSES[tone],
      )}
      style={{ left: `${posX}%`, top: `${posY}%` }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <span className="max-w-[4.25rem] truncate px-1">{table.name}</span>
      <span className="text-xs font-normal opacity-80">
        {table.capacity_min}-{table.capacity_max}
      </span>
    </button>
  );
}
