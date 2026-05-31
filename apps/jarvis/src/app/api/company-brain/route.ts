import { NextRequest, NextResponse } from 'next/server';
import {
  addCompanyMemory,
  readCompanyBrainContext,
  recordProjectCost,
  recordProjectRevenue,
  recordRecurringExpense,
  type AddCompanyMemoryInput,
  type RecordProjectCostInput,
  type RecordProjectRevenueInput,
  type RecordRecurringExpenseInput,
} from '@/lib/company-brain';

type BrainWriteType = 'recurring_expense' | 'project_revenue' | 'project_cost' | 'memory_note';

interface BrainWriteBody {
  type?: BrainWriteType | string;
  payload?: unknown;
}

export async function GET(): Promise<NextResponse> {
  try {
    const context = await readCompanyBrainContext();
    return NextResponse.json({ context });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/company-brain]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as BrainWriteBody;
    const payload = body.payload ?? {};

    if (body.type === 'recurring_expense') {
      const result = await recordRecurringExpense(payload as RecordRecurringExpenseInput);
      return NextResponse.json({ result });
    }
    if (body.type === 'project_revenue') {
      const result = await recordProjectRevenue(payload as RecordProjectRevenueInput);
      return NextResponse.json({ result });
    }
    if (body.type === 'project_cost') {
      const result = await recordProjectCost(payload as RecordProjectCostInput);
      return NextResponse.json({ result });
    }
    if (body.type === 'memory_note') {
      const result = await addCompanyMemory(payload as AddCompanyMemoryInput);
      return NextResponse.json({ result });
    }

    return NextResponse.json({ error: `Unsupported brain write type: ${body.type ?? 'missing'}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/company-brain]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
