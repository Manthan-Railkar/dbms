import { NextResponse } from 'next/server';
import { getDbPool, ensureDatabaseInitialized } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      match_id,
      inning_no = 2,
      batting_team_id,
      bowling_team_id,
      batting_team_name,
      bowling_team_name,
      striker_id,
      non_striker_id,
      bowler_id,
    } = body;

    const numMatchId = typeof match_id === 'number' ? match_id : parseInt(match_id, 10);
    if (!numMatchId || isNaN(numMatchId)) {
      return NextResponse.json({ success: false, error: 'Valid match_id is required' }, { status: 400 });
    }

    await ensureDatabaseInitialized();
    const pool = getDbPool();

    // 1. Fetch match to determine teams
    const [matchRows]: any = await pool.query(
      'SELECT match_id, team1_id, team2_id FROM matches WHERE match_id = ? LIMIT 1',
      [numMatchId]
    );

    if (!matchRows || matchRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Match not found' }, { status: 404 });
    }

    const match = matchRows[0];

    // 2. Resolve batting and bowling team IDs
    let batId = batting_team_id ? parseInt(batting_team_id, 10) : null;
    let bowlId = bowling_team_id ? parseInt(bowling_team_id, 10) : null;

    if (!batId && batting_team_name) {
      const [batRows]: any = await pool.query(
        'SELECT team_id FROM teams WHERE (name = ? OR LOWER(name) = LOWER(?)) AND team_id IN (?, ?) LIMIT 1',
        [batting_team_name.trim(), batting_team_name.trim(), match.team1_id, match.team2_id]
      );
      if (batRows && batRows.length > 0) batId = Number(batRows[0].team_id);
    }

    if (!batId) {
      // Invert from Innings 1
      const [inn1]: any = await pool.query(
        'SELECT batting_team_id, bowling_team_id FROM innings WHERE match_id = ? AND inning_no = 1 LIMIT 1',
        [numMatchId]
      );
      if (inn1 && inn1.length > 0) {
        batId = Number(inn1[0].bowling_team_id);
        bowlId = Number(inn1[0].batting_team_id);
      } else {
        batId = Number(match.team2_id);
        bowlId = Number(match.team1_id);
      }
    }

    if (!bowlId) {
      bowlId = batId === Number(match.team1_id) ? Number(match.team2_id) : Number(match.team1_id);
    }

    // 3. Insert Innings 2 (or find if already exists)
    const [existing]: any = await pool.query(
      'SELECT inning_id FROM innings WHERE match_id = ? AND inning_no = ? LIMIT 1',
      [numMatchId, inning_no]
    );

    let inningId: number;
    if (existing && existing.length > 0) {
      inningId = Number(existing[0].inning_id);
    } else {
      const [insRes]: any = await pool.execute(
        `INSERT INTO innings (match_id, inning_no, batting_team_id, bowling_team_id, runs, wickets, overs, status)
         VALUES (?, ?, ?, ?, 0, 0, 0.0, 'LIVE')`,
        [numMatchId, inning_no, batId, bowlId]
      );
      inningId = Number(insRes.insertId);
    }

    // 4. Initialize scorecard for openers & opening bowler if provided
    if (striker_id && non_striker_id) {
      const sId = parseInt(String(striker_id).replace(/\D/g, ''), 10);
      const nsId = parseInt(String(non_striker_id).replace(/\D/g, ''), 10);
      if (!isNaN(sId) && !isNaN(nsId)) {
        await pool.execute(
          `INSERT INTO batting_scorecard (match_id, inning_id, player_id, runs, balls_faced, fours, sixes, strike_rate)
           VALUES (?, ?, ?, 0, 0, 0, 0, 0.00)
           ON DUPLICATE KEY UPDATE runs = runs`,
          [numMatchId, inningId, sId]
        );
        await pool.execute(
          `INSERT INTO batting_scorecard (match_id, inning_id, player_id, runs, balls_faced, fours, sixes, strike_rate)
           VALUES (?, ?, ?, 0, 0, 0, 0, 0.00)
           ON DUPLICATE KEY UPDATE runs = runs`,
          [numMatchId, inningId, nsId]
        );
      }
    }

    if (bowler_id) {
      const bwId = parseInt(String(bowler_id).replace(/\D/g, ''), 10);
      if (!isNaN(bwId)) {
        await pool.execute(
          `INSERT INTO bowling_scorecard (match_id, inning_id, player_id, overs, maidens, wickets, runs_conceded, economy_rate)
           VALUES (?, ?, ?, 0.0, 0, 0, 0, 0.00)
           ON DUPLICATE KEY UPDATE runs_conceded = runs_conceded`,
          [numMatchId, inningId, bwId]
        );
      }
    }

    return NextResponse.json({
      success: true,
      inningId,
      inningNo: inning_no,
      battingTeamId: batId,
      bowlingTeamId: bowlId,
    });
  } catch (err: unknown) {
    console.error('Error starting new inning in MySQL:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
