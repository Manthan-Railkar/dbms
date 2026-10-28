import { NextResponse } from 'next/server';
import { getDbPool, ensureDatabaseInitialized } from '@/lib/db';

export async function POST(request: Request) {
  await ensureDatabaseInitialized();
  const pool = getDbPool();
  const conn = await pool.getConnection();

  try {
    const body = await request.json();
    const {
      inning_id,
      over_no,
      ball_no,
      batter_id,
      bowler_id,
      runs_scored,
      extra_runs,
      extra_type,
      wicket_fallen,
      wicket_type,
      dismissed_player_id,
      is_legal_delivery,
      total_runs,
      total_wickets,
      overs,
    } = body;

    const numInning = typeof inning_id === 'number' ? inning_id : parseInt(inning_id, 10) || 1;
    const numOver = typeof over_no === 'number' ? over_no : parseInt(over_no, 10) || 0;
    const numBall = typeof ball_no === 'number' ? ball_no : parseInt(ball_no, 10) || 1;
    const numRunsScored = typeof runs_scored === 'number' ? runs_scored : parseInt(runs_scored, 10) || 0;
    const numExtraRuns = typeof extra_runs === 'number' ? extra_runs : parseInt(extra_runs, 10) || 0;

    await conn.beginTransaction();

    // 1. Fetch Inning to get match_id and validate existence
    const [innRows]: any = await conn.execute(
      'SELECT match_id, batting_team_id, bowling_team_id FROM innings WHERE inning_id = ? LIMIT 1',
      [numInning]
    );

    if (!innRows || innRows.length === 0) {
      await conn.rollback();
      return NextResponse.json({ success: false, error: 'Inning not found' }, { status: 404 });
    }

    const matchId = Number(innRows[0].match_id);
    const battingTeamId = Number(innRows[0].batting_team_id);
    const bowlingTeamId = Number(innRows[0].bowling_team_id);

    // 2. Resolve batter_id
    let parsedBatter = parseInt(String(batter_id || '').replace(/\D/g, ''), 10);
    let resolvedBatterId: number;

    const [batterCheck]: any = !isNaN(parsedBatter)
      ? await conn.execute('SELECT player_id FROM players WHERE player_id = ? LIMIT 1', [parsedBatter])
      : [[]];

    if (batterCheck && batterCheck.length > 0) {
      resolvedBatterId = Number(batterCheck[0].player_id);
    } else {
      const [fallbackBatter]: any = await conn.execute(
        'SELECT player_id FROM players WHERE team_id = ? LIMIT 1',
        [battingTeamId]
      );
      if (fallbackBatter && fallbackBatter.length > 0) {
        resolvedBatterId = Number(fallbackBatter[0].player_id);
      } else {
        const [insP]: any = await conn.execute(
          "INSERT INTO players (name, role, team_id) VALUES ('Batter', 'Batter', ?)",
          [battingTeamId]
        );
        resolvedBatterId = Number(insP.insertId);
      }
    }

    // 3. Resolve bowler_id
    let parsedBowler = parseInt(String(bowler_id || '').replace(/\D/g, ''), 10);
    let resolvedBowlerId: number;

    const [bowlerCheck]: any = !isNaN(parsedBowler)
      ? await conn.execute('SELECT player_id FROM players WHERE player_id = ? LIMIT 1', [parsedBowler])
      : [[]];

    if (bowlerCheck && bowlerCheck.length > 0) {
      resolvedBowlerId = Number(bowlerCheck[0].player_id);
    } else {
      const [fallbackBowler]: any = await conn.execute(
        'SELECT player_id FROM players WHERE team_id = ? LIMIT 1',
        [bowlingTeamId]
      );
      if (fallbackBowler && fallbackBowler.length > 0) {
        resolvedBowlerId = Number(fallbackBowler[0].player_id);
      } else {
        const [insP]: any = await conn.execute(
          "INSERT INTO players (name, role, team_id) VALUES ('Bowler', 'Bowler', ?)",
          [bowlingTeamId]
        );
        resolvedBowlerId = Number(insP.insertId);
      }
    }

    // 4. Resolve dismissal & wicket
    let resolvedDismissedId: number | null = null;
    let wType: string | null = null;

    if (wicket_fallen) {
      let parsedDismissed = parseInt(String(dismissed_player_id || '').replace(/\D/g, ''), 10);
      resolvedDismissedId = resolvedBatterId;
      if (!isNaN(parsedDismissed) && parsedDismissed > 0) {
        const [dCheck]: any = await conn.execute(
          'SELECT player_id FROM players WHERE player_id = ? LIMIT 1',
          [parsedDismissed]
        );
        if (dCheck && dCheck.length > 0) {
          resolvedDismissedId = Number(dCheck[0].player_id);
        }
      }
      const validTypes = [
        'Bowled',
        'Caught',
        'LBW',
        'Run out',
        'Stumped',
        'Hit wicket',
        'Retired hurt',
        'Obstructing the field',
      ];
      wType =
        validTypes.find((t) => t.toLowerCase() === (wicket_type || '').toLowerCase()) || 'Bowled';
    }

    // 5. Extra type check
    let eType: string | null = null;
    if (extra_type) {
      const et = extra_type.toLowerCase();
      if (et.includes('wide') || extra_type === 'WD') eType = 'Wide';
      else if (et.includes('no') || extra_type === 'NB') eType = 'No-ball';
      else if (et.includes('leg')) eType = 'Leg-bye';
      else if (et.includes('bye') || extra_type === 'B') eType = 'Bye';
      else if (et.includes('penalty')) eType = 'Penalty';
    }

    const isLegal =
      is_legal_delivery !== undefined
        ? Boolean(is_legal_delivery)
        : !eType || (eType !== 'Wide' && eType !== 'No-ball');

    // 6. Insert into ball_events
    const [ballIns]: any = await conn.execute(
      `INSERT INTO ball_events (
        inning_id, over_no, ball_no, batter_id, bowler_id,
        runs_scored, extra_runs, extra_type, wicket_fallen,
        wicket_type, dismissed_player_id, is_legal_delivery
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        numInning,
        numOver,
        numBall,
        resolvedBatterId,
        resolvedBowlerId,
        numRunsScored,
        numExtraRuns,
        eType,
        wicket_fallen ? 1 : 0,
        wType,
        resolvedDismissedId,
        isLegal ? 1 : 0,
      ]
    );

    const ballId = Number(ballIns.insertId);

    // 7. Update innings runs, wickets, overs
    if (total_runs !== undefined || total_wickets !== undefined || overs !== undefined) {
      const numRuns = typeof total_runs === 'number' ? total_runs : parseInt(total_runs, 10) || 0;
      const numWickets =
        typeof total_wickets === 'number' ? total_wickets : parseInt(total_wickets, 10) || 0;
      const numOvers = typeof overs === 'number' ? overs : parseFloat(overs) || 0.0;

      await conn.execute(
        'UPDATE innings SET runs = ?, wickets = ?, overs = ? WHERE inning_id = ?',
        [numRuns, numWickets, numOvers, numInning]
      );
    }

    // 8. Update / Upsert batting_scorecard
    const addedRuns = numRunsScored;
    const facedBall = isLegal ? 1 : eType === 'No-ball' && numRunsScored > 0 ? 1 : 0;
    const isFour = numRunsScored === 4 ? 1 : 0;
    const isSix = numRunsScored === 6 ? 1 : 0;

    const [bCardRows]: any = await conn.execute(
      'SELECT scorecard_id, runs, balls_faced, fours, sixes FROM batting_scorecard WHERE inning_id = ? AND player_id = ? LIMIT 1',
      [numInning, resolvedBatterId]
    );

    if (bCardRows && bCardRows.length > 0) {
      const row = bCardRows[0];
      const newRuns = Number(row.runs) + addedRuns;
      const newBalls = Number(row.balls_faced) + facedBall;
      const sr = newBalls > 0 ? parseFloat(((newRuns / newBalls) * 100).toFixed(2)) : 0;
      const isOutVal = wicket_fallen && resolvedDismissedId === resolvedBatterId;

      await conn.execute(
        `UPDATE batting_scorecard 
         SET runs = ?, balls_faced = ?, fours = fours + ?, sixes = sixes + ?, strike_rate = ?, is_out = ?, dismissal_type = COALESCE(?, dismissal_type)
         WHERE scorecard_id = ?`,
        [newRuns, newBalls, isFour, isSix, sr, isOutVal ? 1 : 0, isOutVal ? wType : null, row.scorecard_id]
      );
    } else {
      const sr = facedBall > 0 ? parseFloat(((addedRuns / facedBall) * 100).toFixed(2)) : 0;
      const isOutVal = wicket_fallen && resolvedDismissedId === resolvedBatterId;

      await conn.execute(
        `INSERT INTO batting_scorecard (match_id, inning_id, player_id, runs, balls_faced, fours, sixes, strike_rate, is_out, dismissal_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           runs = runs + VALUES(runs),
           balls_faced = balls_faced + VALUES(balls_faced),
           fours = fours + VALUES(fours),
           sixes = sixes + VALUES(sixes),
           strike_rate = VALUES(strike_rate),
           is_out = VALUES(is_out),
           dismissal_type = VALUES(dismissal_type)`,
        [matchId, numInning, resolvedBatterId, addedRuns, facedBall, isFour, isSix, sr, isOutVal ? 1 : 0, isOutVal ? wType : null]
      );
    }

    // 9. Update / Upsert bowling_scorecard
    const bowlerRuns = numRunsScored + (eType === 'Wide' || eType === 'No-ball' ? numExtraRuns : 0);
    const bowlerWicket = wicket_fallen && wType !== 'Run out' ? 1 : 0;

    const [bwCardRows]: any = await conn.execute(
      'SELECT scorecard_id, overs, wickets, runs_conceded FROM bowling_scorecard WHERE inning_id = ? AND player_id = ? LIMIT 1',
      [numInning, resolvedBowlerId]
    );

    if (bwCardRows && bwCardRows.length > 0) {
      const row = bwCardRows[0];
      const curOversStr = String(row.overs || '0.0');
      const curParts = curOversStr.split('.');
      const curBalls = parseInt(curParts[0] || '0', 10) * 6 + parseInt(curParts[1] || '0', 10);
      const nextBalls = isLegal ? curBalls + 1 : curBalls;
      const nextOvers = parseFloat(`${Math.floor(nextBalls / 6)}.${nextBalls % 6}`);
      const nextRuns = Number(row.runs_conceded) + bowlerRuns;
      const nextWickets = Number(row.wickets) + bowlerWicket;
      const econ = nextBalls > 0 ? parseFloat((nextRuns / (nextBalls / 6)).toFixed(2)) : 0;

      await conn.execute(
        `UPDATE bowling_scorecard 
         SET overs = ?, runs_conceded = ?, wickets = ?, economy_rate = ? 
         WHERE scorecard_id = ?`,
        [nextOvers, nextRuns, nextWickets, econ, row.scorecard_id]
      );
    } else {
      const nextBalls = isLegal ? 1 : 0;
      const nextOvers = isLegal ? 0.1 : 0.0;
      const econ = nextBalls > 0 ? parseFloat((bowlerRuns * 6).toFixed(2)) : 0;

      await conn.execute(
        `INSERT INTO bowling_scorecard (match_id, inning_id, player_id, overs, maidens, wickets, runs_conceded, economy_rate)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           overs = VALUES(overs),
           runs_conceded = runs_conceded + VALUES(runs_conceded),
           wickets = wickets + VALUES(wickets),
           economy_rate = VALUES(economy_rate)`,
        [matchId, numInning, resolvedBowlerId, nextOvers, bowlerWicket, bowlerRuns, econ]
      );
    }

    await conn.commit();

    return NextResponse.json({
      success: true,
      ballId,
    });
  } catch (err: unknown) {
    await conn.rollback();
    console.error('Error in MySQL ball API route:', err);
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    conn.release();
  }
}
