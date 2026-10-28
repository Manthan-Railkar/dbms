import { NextResponse } from 'next/server';
import { getDbPool, ensureDatabaseInitialized } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { match_id, winner_team_name, toss_result } = body;

    const numMatchId = typeof match_id === 'number' ? match_id : parseInt(match_id, 10);
    if (!numMatchId || isNaN(numMatchId)) {
      return NextResponse.json({ success: false, error: 'Valid match_id is required' }, { status: 400 });
    }

    await ensureDatabaseInitialized();
    const pool = getDbPool();

    // 1. Fetch match to get team1_id and team2_id
    const [matchRows]: any = await pool.query(
      'SELECT match_id, team1_id, team2_id FROM matches WHERE match_id = ? LIMIT 1',
      [numMatchId]
    );

    if (!matchRows || matchRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Match not found' }, { status: 404 });
    }

    const match = matchRows[0];

    // 2. Resolve winner_id among team1 and team2
    let winnerId: number | null = null;
    if (winner_team_name && winner_team_name !== 'Tied') {
      const winnerClean = winner_team_name.trim();
      const [teamRows]: any = await pool.query(
        'SELECT team_id FROM teams WHERE (name = ? OR LOWER(name) = LOWER(?)) AND team_id IN (?, ?) LIMIT 1',
        [winnerClean, winnerClean, match.team1_id, match.team2_id]
      );
      if (teamRows && teamRows.length > 0) {
        winnerId = Number(teamRows[0].team_id);
      } else {
        const [partialRows]: any = await pool.query(
          'SELECT team_id FROM teams WHERE (name LIKE ? OR ? LIKE CONCAT("%", name, "%")) AND team_id IN (?, ?) LIMIT 1',
          [`%${winnerClean}%`, winnerClean, match.team1_id, match.team2_id]
        );
        if (partialRows && partialRows.length > 0) {
          winnerId = Number(partialRows[0].team_id);
        }
      }
    }

    // 3. Update match status to Completed
    await pool.query(
      `UPDATE matches 
       SET status = 'Completed', 
           winner_id = ?,
           toss_result = COALESCE(?, toss_result)
       WHERE match_id = ?`,
      [winnerId, toss_result || null, numMatchId]
    );

    // Also mark innings as completed
    await pool.query(
      `UPDATE innings SET status = 'COMPLETED' WHERE match_id = ?`,
      [numMatchId]
    );

    const [updatedRows]: any = await pool.query(
      'SELECT * FROM matches WHERE match_id = ?',
      [numMatchId]
    );

    return NextResponse.json({
      success: true,
      match: updatedRows[0],
    });
  } catch (err: unknown) {
    console.error('Error completing match in MySQL:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
