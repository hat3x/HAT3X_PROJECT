import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// El roster (plantilla completa de agentes) vive en apps/command;
// esta ruta lo expone al navegador para que la oficina muestre a todo el equipo.
export async function GET() {
  try {
    const path = resolve(process.cwd(), '..', 'command', 'capability-map', 'roster.json');
    const roster = JSON.parse(readFileSync(path, 'utf8')) as {
      agents: Array<{ id: string; verticals: string[] }>;
    };
    const agents = roster.agents.map((a) => ({ id: a.id, verticals: a.verticals }));
    return NextResponse.json({ agents });
  } catch {
    return NextResponse.json({ agents: [] });
  }
}
