/**
 * `PerioHistory` — lista de exploraciones periodontales de un paciente.
 *
 * Componente presentacional puro (sin hooks de red): recibe `PerioExam[]`
 * ya cargado (por `usePerioExams` en el caller) y solo ordena/renderiza.
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PerioHistory } from "@/components/dental/perio-history";
import type { PerioExam } from "@/types/database";

afterEach(() => {
  cleanup();
});

/** Exploración de ejemplo (perio_exam) con overrides. */
function exam(overrides: Partial<PerioExam>): PerioExam {
  return {
    id: "exam-1",
    salon_id: "salon-1",
    customer_id: "customer-1",
    examiner_id: null,
    notes: null,
    signed: false,
    signed_at: null,
    signed_by: null,
    created_by: null,
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("PerioHistory · lista y selección", () => {
  it("renderiza una fila por exploración, más recientes primero", () => {
    const exams: PerioExam[] = [
      exam({ id: "old", created_at: "2026-01-01T10:00:00.000Z", signed: true }),
      exam({ id: "new", created_at: "2026-06-15T09:00:00.000Z", signed: false }),
    ];

    render(createElement(PerioHistory, { exams, onSelect: vi.fn() }));

    const rows = screen.getAllByRole("button");
    expect(rows).toHaveLength(2);
    // La más reciente (junio) aparece primero.
    expect(rows[0]).toHaveTextContent(/jun/i);
    expect(rows[1]).toHaveTextContent(/ene/i);
  });

  it("distingue Firmada / Borrador según `signed`", () => {
    const exams: PerioExam[] = [
      exam({ id: "signed-exam", signed: true }),
      exam({ id: "draft-exam", created_at: "2026-02-01T10:00:00.000Z", signed: false }),
    ];

    render(createElement(PerioHistory, { exams, onSelect: vi.fn() }));

    expect(screen.getByText("Firmada")).toBeInTheDocument();
    expect(screen.getByText("Borrador")).toBeInTheDocument();
  });

  it("al hacer click en una fila, llama onSelect con el id de esa exploración", () => {
    const onSelect = vi.fn();
    const exams: PerioExam[] = [
      exam({ id: "exam-a", created_at: "2026-01-01T10:00:00.000Z" }),
      exam({ id: "exam-b", created_at: "2026-03-01T10:00:00.000Z" }),
    ];

    render(createElement(PerioHistory, { exams, onSelect }));

    const rows = screen.getAllByRole("button");
    fireEvent.click(rows[0] as HTMLElement); // la más reciente (exam-b) va primera

    expect(onSelect).toHaveBeenCalledWith("exam-b");
  });

  it("sin exploraciones, muestra un estado vacío y ningún botón", () => {
    render(createElement(PerioHistory, { exams: [], onSelect: vi.fn() }));

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/sin exploraciones/i)).toBeInTheDocument();
  });
});
