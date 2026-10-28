import { NextResponse } from 'next/server';
import { getDbPool, ensureDatabaseInitialized } from '@/lib/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

function normalizeRole(role?: string): 'Batter' | 'Bowler' | 'All-rounder' | 'Wicketkeeper' {
  if (!role) return 'Batter';
  const lower = role.toLowerCase();
  if (lower.includes('bowl')) return 'Bowler';
  if (lower.includes('all') || lower.includes('round')) return 'All-rounder';
  if (lower.includes('keep') || lower.includes('wk')) return 'Wicketkeeper';
  return 'Batter';
}

export async function POST(request: Request) {
  await ensureDatabaseInitialized();
  const pool = getDbPool();
  const conn = await pool.getConnection();

  try {
    const body = await request.json();
    const {
      tournament_name,
      tournament_format,
      venue_name,
      venue_city,
      match_date,
      toss_winner_id,
      toss_decision,
      toss_result,
      team1_name,
      team1_city,
      team1_players = [],
      team2_name,
      team2_city,
      team2_players = [],
      striker: clientStriker,
      non_striker: clientNonStriker,
      bowler: clientBowler,
    } = body;

    await conn.beginTransaction();

    // 1. Resolve / Create Tournament
    let resolvedTournamentId: number;
    const tourName = (tournament_name || 'SPIT Premier League 2026').trim().slice(0, 150);
    const tourFormat = tournament_format === 'ODI' ? 'ODI' : tournament_format === 'Test' ? 'Test' : 'T20';

    const [tourRows]: any = await conn.execute(
      'SELECT tournament_id FROM tournaments WHERE name = ? LIMIT 1',
      [tourName]
    );

    if (tourRows && tourRows.length > 0) {
      resolvedTournamentId = Number(tourRows[0].tournament_id);
    } else {
      const [insTour]: any = await conn.execute(
        'INSERT INTO tournaments (name, format, start_date) VALUES (?, ?, CURRENT_DATE)',
        [tourName, tourFormat]
      );
      resolvedTournamentId = Number(insTour.insertId);
    }

    // 2. Resolve / Create Venue
    let resolvedVenueId: number;
    const vName = (venue_name || 'Wankhede Stadium').trim().slice(0, 150);
    const vCity = (venue_city || 'Mumbai').trim().slice(0, 100);

    const [venueRows]: any = await conn.execute(
      'SELECT venue_id FROM venues WHERE name = ? LIMIT 1',
      [vName]
    );

    if (venueRows && venueRows.length > 0) {
      resolvedVenueId = Number(venueRows[0].venue_id);
    } else {
      const [insVenue]: any = await conn.execute(
        'INSERT INTO venues (name, city, seating_capacity) VALUES (?, ?, 35000)',
        [vName, vCity]
      );
      resolvedVenueId = Number(insVenue.insertId);
    }

    // 3. Resolve / Create Teams
    const t1CleanName = (team1_name || 'Team 1').trim().slice(0, 120);
    const t1City = (team1_city || 'City 1').trim().slice(0, 100);

    let t1DbId: number;
    const [t1Rows]: any = await conn.execute('SELECT team_id FROM teams WHERE name = ? LIMIT 1', [t1CleanName]);
    if (t1Rows && t1Rows.length > 0) {
      t1DbId = Number(t1Rows[0].team_id);
    } else {
      const [insT1]: any = await conn.execute(
        'INSERT INTO teams (name, city) VALUES (?, ?)',
        [t1CleanName, t1City]
      );
      t1DbId = Number(insT1.insertId);
    }

    let t2CleanName = (team2_name || 'Team 2').trim().slice(0, 120);
    if (t2CleanName === t1CleanName) {
      t2CleanName = `${t2CleanName} (Opponent)`;
    }
    const t2City = (team2_city || 'City 2').trim().slice(0, 100);

    let t2DbId: number;
    const [t2Rows]: any = await conn.execute('SELECT team_id FROM teams WHERE name = ? LIMIT 1', [t2CleanName]);
    if (t2Rows && t2Rows.length > 0) {
      t2DbId = Number(t2Rows[0].team_id);
    } else {
      const [insT2]: any = await conn.execute(
        'INSERT INTO teams (name, city) VALUES (?, ?)',
        [t2CleanName, t2City]
      );
      t2DbId = Number(insT2.insertId);
    }

    // 4. Synchronize Players for Team 1
    const playerMapping: Record<string, { player_id: number; name: string; role: string }> = {};
    const team1DbPlayers: Array<{ player_id: number; name: string; role: string }> = [];

    for (const p of team1_players) {
      if (!p || !p.name) continue;
      const pName = (p.name || 'Player').trim().slice(0, 120);
      const role = normalizeRole(p.role);
      const batStyle = (p.battingStyle || 'Right-hand bat').slice(0, 50);
      const bowlStyle = (p.bowlingStyle || 'Right-arm medium').slice(0, 50);

      const [pRows]: any = await conn.execute(
        'SELECT player_id, name, role FROM players WHERE team_id = ? AND name = ? LIMIT 1',
        [t1DbId, pName]
      );

      let dbP: { player_id: number; name: string; role: string };
      if (pRows && pRows.length > 0) {
        dbP = {
          player_id: Number(pRows[0].player_id),
          name: pRows[0].name,
          role: pRows[0].role,
        };
      } else {
        const [insP]: any = await conn.execute(
          'INSERT INTO players (name, role, batting_style, bowling_style, team_id) VALUES (?, ?, ?, ?, ?)',
          [pName, role, batStyle, bowlStyle, t1DbId]
        );
        dbP = {
          player_id: Number(insP.insertId),
          name: pName,
          role,
        };
      }
      if (p.id) playerMapping[p.id] = dbP;
      team1DbPlayers.push(dbP);
    }

    // 5. Synchronize Players for Team 2
    const team2DbPlayers: Array<{ player_id: number; name: string; role: string }> = [];

    for (const p of team2_players) {
      if (!p || !p.name) continue;
      const pName = (p.name || 'Player').trim().slice(0, 120);
      const role = normalizeRole(p.role);
      const batStyle = (p.battingStyle || 'Right-hand bat').slice(0, 50);
      const bowlStyle = (p.bowlingStyle || 'Right-arm medium').slice(0, 50);

      const [pRows]: any = await conn.execute(
        'SELECT player_id, name, role FROM players WHERE team_id = ? AND name = ? LIMIT 1',
        [t2DbId, pName]
      );

      let dbP: { player_id: number; name: string; role: string };
      if (pRows && pRows.length > 0) {
        dbP = {
          player_id: Number(pRows[0].player_id),
          name: pRows[0].name,
          role: pRows[0].role,
        };
      } else {
        const [insP]: any = await conn.execute(
          'INSERT INTO players (name, role, batting_style, bowling_style, team_id) VALUES (?, ?, ?, ?, ?)',
          [pName, role, batStyle, bowlStyle, t2DbId]
        );
        dbP = {
          player_id: Number(insP.insertId),
          name: pName,
          role,
        };
      }
      if (p.id) playerMapping[p.id] = dbP;
      team2DbPlayers.push(dbP);
    }

    // Set captains for teams if players exist
    if (team1DbPlayers.length > 0) {
      await conn.execute('UPDATE teams SET captain_id = ? WHERE team_id = ?', [
        team1DbPlayers[0].player_id,
        t1DbId,
      ]);
    }
    if (team2DbPlayers.length > 0) {
      await conn.execute('UPDATE teams SET captain_id = ? WHERE team_id = ?', [
        team2DbPlayers[0].player_id,
        t2DbId,
      ]);
    }

    // 6. Determine Toss & Batting/Bowling Teams
    const isTeam1TossWinner = toss_winner_id === 'team-1' || toss_winner_id === t1DbId;
    const tossWinnerDbId = isTeam1TossWinner ? t1DbId : t2DbId;
    const decision = toss_decision === 'Field' ? 'Field' : 'Bat';

    let batTeamDbId = tossWinnerDbId;
    if (decision === 'Field') {
      batTeamDbId = tossWinnerDbId === t1DbId ? t2DbId : t1DbId;
    }
    const bowlTeamDbId = batTeamDbId === t1DbId ? t2DbId : t1DbId;

    const defaultTossResult = `${tossWinnerDbId === t1DbId ? t1CleanName : t2CleanName} won the toss and elected to ${decision}`;

    // 7. Insert Match Record
    const [matchIns]: any = await conn.execute(
      `INSERT INTO matches (
        tournament_id, match_date, status, team1_id, team2_id, venue_id, 
        toss_winner_id, toss_decision, toss_result
      ) VALUES (?, ?, 'Live', ?, ?, ?, ?, ?, ?)`,
      [
        resolvedTournamentId,
        match_date ? new Date(match_date) : new Date(),
        t1DbId,
        t2DbId,
        resolvedVenueId,
        tossWinnerDbId,
        decision,
        toss_result || defaultTossResult,
      ]
    );

    const matchId = Number(matchIns.insertId);

    // 8. Insert 1st Innings Record
    const [inningIns]: any = await conn.execute(
      `INSERT INTO innings (
        match_id, inning_no, batting_team_id, bowling_team_id, runs, wickets, overs, status
      ) VALUES (?, 1, ?, ?, 0, 0, 0.0, 'LIVE')`,
      [matchId, batTeamDbId, bowlTeamDbId]
    );

    const inningId = Number(inningIns.insertId);

    // 9. Map Striker, Non-Striker, and Bowler
    const battingPlayers = batTeamDbId === t1DbId ? team1DbPlayers : team2DbPlayers;
    const bowlingPlayers = bowlTeamDbId === t1DbId ? team1DbPlayers : team2DbPlayers;

    const allSyncedIds = new Set([
      ...battingPlayers.map((p) => p.player_id),
      ...bowlingPlayers.map((p) => p.player_id),
    ]);

    const resolvedStriker =
      (clientStriker?.id && playerMapping[clientStriker.id]) ||
      battingPlayers.find((p) => p.name.toLowerCase() === (clientStriker?.name || '').toLowerCase()) ||
      battingPlayers[0] ||
      null;

    const resolvedNonStriker =
      (clientNonStriker?.id && playerMapping[clientNonStriker.id]) ||
      battingPlayers.find(
        (p) =>
          p.name.toLowerCase() === (clientNonStriker?.name || '').toLowerCase() &&
          p.player_id !== resolvedStriker?.player_id
      ) ||
      battingPlayers.find((p) => p.player_id !== resolvedStriker?.player_id) ||
      null;

    const resolvedBowler =
      (clientBowler?.id && playerMapping[clientBowler.id]) ||
      bowlingPlayers.find((p) => p.name.toLowerCase() === (clientBowler?.name || '').toLowerCase()) ||
      bowlingPlayers[0] ||
      null;

    // 10. Initialize Batting & Bowling Scorecard Entries
    if (resolvedStriker && allSyncedIds.has(resolvedStriker.player_id)) {
      await conn.execute(
        `INSERT INTO batting_scorecard (match_id, inning_id, player_id, runs, balls_faced, fours, sixes, strike_rate)
         VALUES (?, ?, ?, 0, 0, 0, 0, 0.00)
         ON DUPLICATE KEY UPDATE runs = runs`,
        [matchId, inningId, resolvedStriker.player_id]
      );
    }

    if (
      resolvedNonStriker &&
      resolvedNonStriker.player_id !== resolvedStriker?.player_id &&
      allSyncedIds.has(resolvedNonStriker.player_id)
    ) {
      await conn.execute(
        `INSERT INTO batting_scorecard (match_id, inning_id, player_id, runs, balls_faced, fours, sixes, strike_rate)
         VALUES (?, ?, ?, 0, 0, 0, 0, 0.00)
         ON DUPLICATE KEY UPDATE runs = runs`,
        [matchId, inningId, resolvedNonStriker.player_id]
      );
    }

    if (resolvedBowler && allSyncedIds.has(resolvedBowler.player_id)) {
      await conn.execute(
        `INSERT INTO bowling_scorecard (match_id, inning_id, player_id, overs, maidens, wickets, runs_conceded, economy_rate)
         VALUES (?, ?, ?, 0.0, 0, 0, 0, 0.00)
         ON DUPLICATE KEY UPDATE runs_conceded = runs_conceded`,
        [matchId, inningId, resolvedBowler.player_id]
      );
    }

    await conn.commit();

    return NextResponse.json(
      {
        success: true,
        matchId,
        inningId,
        tournamentId: resolvedTournamentId,
        venueId: resolvedVenueId,
        team1Id: t1DbId,
        team2Id: t2DbId,
        striker: resolvedStriker,
        nonStriker: resolvedNonStriker,
        bowler: resolvedBowler,
        battingSquad: battingPlayers,
        bowlingSquad: bowlingPlayers,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    await conn.rollback();
    console.error('Match creation error in MySQL:', err);
    const msg = err instanceof Error ? err.message : 'Failed to create match';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}
