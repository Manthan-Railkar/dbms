import { NextResponse } from 'next/server';
import { getDbPool, ensureDatabaseInitialized } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { inning_id, previous_runs, previous_wickets, previous_overs } = body;

    const numInning = typeof inning_id === 'number' ? inning_id : parseInt(inning_id, 10) || 1;

    await ensureDatabaseInitialized();
    const pool = getDbPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // Find the latest ball for this innings
      const [latestBalls]: any = await conn.execute(
        'SELECT ball_id, batter_id, bowler_id, runs_scored, extra_runs, extra_type, wicket_fallen, is_legal_delivery FROM ball_events WHERE inning_id = ? ORDER BY ball_id DESC LIMIT 1',
        [numInning]
      );

      if (latestBalls && latestBalls.length > 0) {
        const lastBall = latestBalls[0];
        await conn.execute('DELETE FROM ball_events WHERE ball_id = ?', [lastBall.ball_id]);

        // Revert batter scorecard
        const isLegal = Boolean(lastBall.is_legal_delivery);
        const ballFaced = isLegal ? 1 : 0;
        const runsScored = Number(lastBall.runs_scored) || 0;
        const isFour = runsScored === 4 ? 1 : 0;
        const isSix = runsScored === 6 ? 1 : 0;

        await conn.execute(
          `UPDATE batting_scorecard 
           SET runs = GREATEST(0, runs - ?),
               balls_faced = GREATEST(0, balls_faced - ?),
               fours = GREATEST(0, fours - ?),
               sixes = GREATEST(0, sixes - ?),
               is_out = CASE WHEN ? = 1 THEN 0 ELSE is_out END
           WHERE inning_id = ? AND player_id = ?`,
          [runsScored, ballFaced, isFour, isSix, lastBall.wicket_fallen ? 1 : 0, numInning, lastBall.batter_id]
        );

        // Revert bowler scorecard
        const bowlerRuns = runsScored + (lastBall.extra_type === 'Wide' || lastBall.extra_type === 'No-ball' ? Number(lastBall.extra_runs) || 1 : 0);
        const bowlerWicket = lastBall.wicket_fallen ? 1 : 0;

        await conn.execute(
          `UPDATE bowling_scorecard 
           SET runs_conceded = GREATEST(0, runs_conceded - ?),
               wickets = GREATEST(0, wickets - ?)
           WHERE inning_id = ? AND player_id = ?`,
          [bowlerRuns, bowlerWicket, numInning, lastBall.bowler_id]
        );
      }

      // Revert innings values
      if (previous_runs !== undefined || previous_wickets !== undefined || previous_overs !== undefined) {
        const r = typeof previous_runs === 'number' ? previous_runs : parseInt(previous_runs, 10) || 0;
        const w = typeof previous_wickets === 'number' ? previous_wickets : parseInt(previous_wickets, 10) || 0;
        const o = typeof previous_overs === 'number' ? previous_overs : parseFloat(previous_overs) || 0.0;

        await conn.execute(
          'UPDATE innings SET runs = ?, wickets = ?, overs = ? WHERE inning_id = ?',
          [r, w, o, numInning]
        );
      }

      await conn.commit();
      return NextResponse.json({ success: true });
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (err: any) {
    console.error('Error in MySQL undo API route:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Undo failed' }, { status: 500 });
  }
}
