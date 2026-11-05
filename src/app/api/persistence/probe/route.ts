import { NextResponse } from 'next/server';
import { probePersistenceWrite } from '@/server/persistence';

export const runtime = 'nodejs';

/**
 * Gate A / MV-AUD-002 — authenticated operators and readiness checks can prove a real
 * write→read→delete round-trip. Never treat env presence alone as hosted durability.
 */
export async function GET() {
  const probe = await probePersistenceWrite();
  return NextResponse.json(
    {
      status: probe.ok ? 'ok' : 'failed',
      ...probe,
    },
    { status: probe.ok ? 200 : 503 },
  );
}
