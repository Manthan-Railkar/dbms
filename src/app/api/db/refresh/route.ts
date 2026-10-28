import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDbPool, ensureDatabaseInitialized } from '@/lib/db';

async function performRefresh() {
  await ensureDatabaseInitialized();
  const pool = getDbPool();
  const schemaPath = path.join(process.cwd(), 'database', 'schema.mysql.sql');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Execute schema creation in MySQL
  await pool.query(schemaSql);

  // Fetch summary counts
  const countQuery = `
    SELECT 
      (SELECT COUNT(*) FROM tournaments) AS tournaments,
      (SELECT COUNT(*) FROM venues) AS venues,
      (SELECT COUNT(*) FROM teams) AS teams,
      (SELECT COUNT(*) FROM players) AS players,
      (SELECT COUNT(*) FROM matches) AS matches,
      (SELECT COUNT(*) FROM innings) AS innings;
  `;
  const [counts]: any = await pool.query(countQuery);

  return {
    success: true,
    message: 'MySQL Database successfully refreshed! All 11 tables are initialized and ready for live scoring.',
    counts: counts && counts.length > 0 ? counts[0] : {}
  };
}

export async function POST() {
  try {
    const result = await performRefresh();
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('MySQL Database refresh failed:', err);
    const msg = err instanceof Error ? err.message : 'Unknown database error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await performRefresh();
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('MySQL Database refresh failed:', err);
    const msg = err instanceof Error ? err.message : 'Unknown database error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
