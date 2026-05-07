import { NextResponse } from 'next/server';
import { Pool } from 'pg';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env['DATABASE_URL'], max: 2 });
  }
  return _pool;
}

export async function GET() {
  try {
    await getPool().query('SELECT 1');
    return NextResponse.json({ status: 'ready' });
  } catch {
    return NextResponse.json({ status: 'not_ready', error: 'db_unreachable' }, { status: 503 });
  }
}
