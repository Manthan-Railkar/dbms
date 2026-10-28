import { NextResponse } from 'next/server';
import { getDbPool, ensureDatabaseInitialized } from '@/lib/db';

export async function GET() {
  try {
    await ensureDatabaseInitialized();
    const pool = getDbPool();

    // Query all matches with tournament, teams, venue, and winner
    const [matches]: any = await pool.query(`
      SELECT 
        m.match_id,
        tr.name AS tournament_name,
        t1.name AS team1_name,
        t1.city AS team1_city,
        t2.name AS team2_name,
        t2.city AS team2_city,
        v.name AS venue_name,
        v.city AS venue_city,
        m.match_date,
        m.status,
        COALESCE(w.name, '') AS winner_name,
        m.toss_result
      FROM matches m
      JOIN tournaments tr ON m.tournament_id = tr.tournament_id
      JOIN teams t1 ON m.team1_id = t1.team_id
      JOIN teams t2 ON m.team2_id = t2.team_id
      JOIN venues v ON m.venue_id = v.venue_id
      LEFT JOIN teams w ON m.winner_id = w.team_id
      ORDER BY m.match_id DESC;
    `);

    // Fetch innings for all matches
    const [allInnings]: any = await pool.query(`
      SELECT 
        i.match_id,
        i.inning_no,
        i.batting_team_id,
        t.name AS batting_team,
        i.runs,
        i.wickets,
        i.overs
      FROM innings i
      LEFT JOIN teams t ON i.batting_team_id = t.team_id
      ORDER BY i.match_id DESC, i.inning_no ASC;
    `);

    const inningsByMatch: Record<number, any[]> = {};
    for (const inn of allInnings || []) {
      const mid = Number(inn.match_id);
      if (!inningsByMatch[mid]) inningsByMatch[mid] = [];
      inningsByMatch[mid].push({
        inning_no: inn.inning_no,
        batting_team_id: inn.batting_team_id,
        batting_team: inn.batting_team || 'Batting Team',
        runs: Number(inn.runs) || 0,
        wickets: Number(inn.wickets) || 0,
        overs: String(inn.overs || '0.0'),
      });
    }

    const formattedMatches = (matches || []).map((m: any) => ({
      match_id: m.match_id,
      tournament_name: m.tournament_name || 'SPIT Premier League 2026',
      team1_name: m.team1_name || 'Team 1',
      team1_city: m.team1_city || '',
      team2_name: m.team2_name || 'Team 2',
      team2_city: m.team2_city || '',
      venue_name: m.venue_name || 'Wankhede Stadium',
      venue_city: m.venue_city || 'Mumbai',
      match_date: m.match_date,
      status: m.status || 'Live',
      winner_name: m.winner_name || '',
      toss_result: m.toss_result,
      innings: inningsByMatch[m.match_id] || [],
    }));

    return NextResponse.json({
      success: true,
      matches: formattedMatches,
    });
  } catch (err: unknown) {
    console.error('Error in MySQL match list API route:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg, matches: [] }, { status: 500 });
  }
}
