import { NextResponse } from 'next/server';
import { getDbPool, ensureDatabaseInitialized } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { match_id, team1_name, team2_name, batting_team_name, bowling_team_name } = body;

    if (!match_id) {
      return NextResponse.json({ success: false, error: 'match_id is required' }, { status: 400 });
    }

    const mId = parseInt(String(match_id), 10);
    await ensureDatabaseInitialized();
    const pool = getDbPool();

    // Helper to get or insert team
    async function ensureTeamId(name: string): Promise<number | null> {
      if (!name) return null;
      const clean = name.trim().slice(0, 120);
      const [existing]: any = await pool.query(
        'SELECT team_id FROM teams WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [clean]
      );
      if (existing && existing.length > 0) {
        return Number(existing[0].team_id);
      }
      const [inserted]: any = await pool.execute(
        'INSERT INTO teams (name, city) VALUES (?, ?)',
        [clean, 'Custom']
      );
      return Number(inserted.insertId);
    }

    // 1. Fetch current match
    const [matchRows]: any = await pool.query('SELECT * FROM matches WHERE match_id = ?', [mId]);
    if (!matchRows || matchRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Match not found' }, { status: 404 });
    }
    const match = matchRows[0];

    let t1Id = match.team1_id;
    let t2Id = match.team2_id;

    if (team1_name) {
      const newT1 = await ensureTeamId(team1_name);
      if (newT1) t1Id = newT1;
    }

    if (team2_name) {
      const newT2 = await ensureTeamId(team2_name);
      if (newT2) t2Id = newT2;
    }

    // Update match team references
    await pool.query(
      'UPDATE matches SET team1_id = ?, team2_id = ? WHERE match_id = ?',
      [t1Id, t2Id, mId]
    );

    // If batting or bowling team name specified, update active inning
    if (batting_team_name || bowling_team_name) {
      const [currentInning]: any = await pool.query(
        'SELECT inning_id, inning_no FROM innings WHERE match_id = ? ORDER BY inning_no DESC LIMIT 1',
        [mId]
      );
      if (currentInning && currentInning.length > 0) {
        const innId = currentInning[0].inning_id;
        const bTeamId = batting_team_name ? await ensureTeamId(batting_team_name) : null;
        const fTeamId = bowling_team_name ? await ensureTeamId(bowling_team_name) : null;

        if (bTeamId && fTeamId) {
          await pool.query(
            'UPDATE innings SET batting_team_id = ?, bowling_team_id = ? WHERE inning_id = ?',
            [bTeamId, fTeamId, innId]
          );
        } else if (bTeamId) {
          await pool.query(
            'UPDATE innings SET batting_team_id = ? WHERE inning_id = ?',
            [bTeamId, innId]
          );
        } else if (fTeamId) {
          await pool.query(
            'UPDATE innings SET bowling_team_id = ? WHERE inning_id = ?',
            [fTeamId, innId]
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Match team names updated successfully in MySQL database',
      team1_id: t1Id,
      team2_id: t2Id,
    });
  } catch (err: unknown) {
    console.error('Error updating teams in MySQL:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
