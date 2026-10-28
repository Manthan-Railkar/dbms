import { NextResponse } from 'next/server';
import { getDbPool, ensureDatabaseInitialized } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const matchId = parseInt(id, 10);

    if (isNaN(matchId)) {
      return NextResponse.json({ success: false, error: 'Invalid match ID' }, { status: 400 });
    }

    await ensureDatabaseInitialized();
    const pool = getDbPool();

    // 1. Fetch match record
    const [matchRows]: any = await pool.query(
      'SELECT * FROM matches WHERE match_id = ? LIMIT 1',
      [matchId]
    );
    if (!matchRows || matchRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Match not found' }, { status: 404 });
    }
    const match = matchRows[0];

    // 2. Fetch tournament, teams, venue
    const [tourRows]: any = await pool.query(
      'SELECT * FROM tournaments WHERE tournament_id = ? LIMIT 1',
      [match.tournament_id]
    );
    const tournament = tourRows && tourRows.length > 0 ? tourRows[0] : null;

    const [t1Rows]: any = await pool.query(
      'SELECT * FROM teams WHERE team_id = ? LIMIT 1',
      [match.team1_id]
    );
    const team1 = t1Rows && t1Rows.length > 0 ? t1Rows[0] : null;
    if (team1) {
      const [t1p]: any = await pool.query(
        'SELECT * FROM players WHERE team_id = ? ORDER BY player_id',
        [match.team1_id]
      );
      team1.players = t1p || [];
    }

    const [t2Rows]: any = await pool.query(
      'SELECT * FROM teams WHERE team_id = ? LIMIT 1',
      [match.team2_id]
    );
    const team2 = t2Rows && t2Rows.length > 0 ? t2Rows[0] : null;
    if (team2) {
      const [t2p]: any = await pool.query(
        'SELECT * FROM players WHERE team_id = ? ORDER BY player_id',
        [match.team2_id]
      );
      team2.players = t2p || [];
    }

    const [venueRows]: any = await pool.query(
      'SELECT * FROM venues WHERE venue_id = ? LIMIT 1',
      [match.venue_id]
    );
    const venue = venueRows && venueRows.length > 0 ? venueRows[0] : null;

    // 3. Fetch all innings for this match
    const [innRows]: any = await pool.query(
      `SELECT i.*, 
              COALESCE(bt.name, 'Batting Team') AS batting_team_name, 
              COALESCE(bwt.name, 'Bowling Team') AS bowling_team_name
       FROM innings i
       LEFT JOIN teams bt ON i.batting_team_id = bt.team_id
       LEFT JOIN teams bwt ON i.bowling_team_id = bwt.team_id
       WHERE i.match_id = ?
       ORDER BY i.inning_no ASC`,
      [matchId]
    );

    const allInnings = innRows || [];
    const activeInning = allInnings.length > 0 ? allInnings[allInnings.length - 1] : null;

    // Helper to format an innings scorecard snapshot
    const formatInningsSnapshot = async (innRow: any) => {
      if (!innRow) return null;
      const innId = innRow.inning_id;

      // Batters
      const [bCards]: any = await pool.query(
        `SELECT b.*, p.name AS player_name, p.role AS player_role
         FROM batting_scorecard b
         JOIN players p ON b.player_id = p.player_id
         WHERE b.inning_id = ?
         ORDER BY b.scorecard_id ASC`,
        [innId]
      );

      // Bowlers
      const [bwCards]: any = await pool.query(
        `SELECT bw.*, p.name AS player_name
         FROM bowling_scorecard bw
         JOIN players p ON bw.player_id = p.player_id
         WHERE bw.inning_id = ?
         ORDER BY bw.scorecard_id ASC`,
        [innId]
      );

      // Ball events to extract extras and fall of wickets
      const [ballsRes]: any = await pool.query(
        `SELECT b.*, p.name AS batter_name
         FROM ball_events b
         LEFT JOIN players p ON b.dismissed_player_id = p.player_id
         WHERE b.inning_id = ?
         ORDER BY b.ball_id ASC`,
        [innId]
      );

      let wides = 0;
      let noBalls = 0;
      let byes = 0;
      let legByes = 0;
      const fow: Array<{ wicketNo: number; score: number; over: string; batterName: string }> = [];
      let runningRuns = 0;
      let runningWickets = 0;

      for (const b of ballsRes || []) {
        runningRuns += (Number(b.runs_scored) || 0) + (Number(b.extra_runs) || 0);
        if (b.extra_type === 'Wide') wides += Number(b.extra_runs) || 1;
        else if (b.extra_type === 'No-ball') noBalls += Number(b.extra_runs) || 1;
        else if (b.extra_type === 'Bye') byes += Number(b.extra_runs) || 0;
        else if (b.extra_type === 'Leg-bye') legByes += Number(b.extra_runs) || 0;

        if (b.wicket_fallen) {
          runningWickets += 1;
          fow.push({
            wicketNo: runningWickets,
            score: runningRuns,
            over: `${b.over_no}.${b.ball_no}`,
            batterName: b.batter_name || 'Batter',
          });
        }
      }

      const totalExtras = wides + noBalls + byes + legByes;
      const oversVal = parseFloat(innRow.overs) || 0;
      const ballsCount = Math.floor(oversVal) * 6 + Math.round((oversVal % 1) * 10);
      const rr = ballsCount > 0 ? ((Number(innRow.runs) / ballsCount) * 6).toFixed(2) : '0.00';

      return {
        inningNo: innRow.inning_no,
        teamName: innRow.batting_team_name,
        totalRuns: Number(innRow.runs) || 0,
        totalWickets: Number(innRow.wickets) || 0,
        oversFormatted: String(innRow.overs || '0.0'),
        runRate: rr,
        batters: (bCards || []).map((b: any) => ({
          id: String(b.player_id),
          name: b.player_name,
          dismissal: b.is_out ? (b.dismissal_type || 'out') : 'not out',
          runs: Number(b.runs) || 0,
          balls: Number(b.balls_faced) || 0,
          fours: Number(b.fours) || 0,
          sixes: Number(b.sixes) || 0,
          strikeRate: String(b.strike_rate || '0.00'),
        })),
        bowlers: (bwCards || []).map((bw: any) => ({
          id: String(bw.player_id),
          name: bw.player_name,
          overs: String(bw.overs || '0.0'),
          maidens: Number(bw.maidens) || 0,
          runs: Number(bw.runs_conceded) || 0,
          wickets: Number(bw.wickets) || 0,
          economy: String(bw.economy_rate || '0.00'),
        })),
        extras: {
          wides,
          noBalls,
          byes,
          legByes,
          total: totalExtras,
        },
        didNotBat: [],
        fallOfWickets: fow,
      };
    };

    const inn1Row = allInnings.find((i: any) => Number(i.inning_no) === 1);
    const inn2Row = allInnings.find((i: any) => Number(i.inning_no) === 2);

    const innings1Data = await formatInningsSnapshot(inn1Row);
    const innings2Data = await formatInningsSnapshot(inn2Row);

    // 4. Fetch balls for active inning
    let ballEvents: any[] = [];
    if (activeInning) {
      const [balls]: any = await pool.query(
        'SELECT * FROM ball_events WHERE inning_id = ? ORDER BY ball_id ASC',
        [activeInning.inning_id]
      );
      ballEvents = balls || [];
    }

    // Resolve Batting & Bowling Teams for active inning
    const battingTeam = activeInning?.batting_team_id === team1?.team_id ? team1 : team2;
    const bowlingTeam = activeInning?.bowling_team_id === team1?.team_id ? team1 : team2;

    const battingSquad = battingTeam?.players || [];
    const bowlingSquad = bowlingTeam?.players || [];

    // Resolve on-crease players for active inning
    let striker: any = null;
    let nonStriker: any = null;
    let bowler: any = null;

    if (activeInning) {
      const [bCards]: any = await pool.query(
        `SELECT b.*, p.player_id, p.name, p.role
         FROM batting_scorecard b
         JOIN players p ON b.player_id = p.player_id
         WHERE b.inning_id = ?
         ORDER BY b.scorecard_id ASC`,
        [activeInning.inning_id]
      );

      if (bCards && bCards.length >= 2) {
        striker = { player_id: bCards[0].player_id, name: bCards[0].name, role: bCards[0].role };
        nonStriker = { player_id: bCards[1].player_id, name: bCards[1].name, role: bCards[1].role };
      } else if (bCards && bCards.length === 1) {
        striker = { player_id: bCards[0].player_id, name: bCards[0].name, role: bCards[0].role };
        nonStriker =
          battingSquad.find((p: any) => p.player_id !== striker?.player_id) || battingSquad[1];
      } else {
        striker = battingSquad[0] || null;
        nonStriker = battingSquad[1] || null;
      }

      const [bwCards]: any = await pool.query(
        `SELECT bw.*, p.player_id, p.name, p.role
         FROM bowling_scorecard bw
         JOIN players p ON bw.player_id = p.player_id
         WHERE bw.inning_id = ?
         ORDER BY bw.scorecard_id ASC`,
        [activeInning.inning_id]
      );

      bowler =
        bwCards && bwCards.length > 0
          ? { player_id: bwCards[0].player_id, name: bwCards[0].name, role: bwCards[0].role }
          : bowlingSquad.find((p: any) => p.role === 'Bowler') || bowlingSquad[0] || null;
    }

    return NextResponse.json({
      success: true,
      match,
      tournament,
      team1,
      team2,
      venue,
      allInnings,
      activeInning,
      innings1Data,
      innings2Data,
      ballEvents,
      battingTeam,
      bowlingTeam,
      battingSquad: battingSquad.filter(
        (p: any) => p.player_id !== striker?.player_id && p.player_id !== nonStriker?.player_id
      ),
      bowlingSquad,
      striker,
      nonStriker,
      bowler,
    });
  } catch (err: unknown) {
    console.error('Error fetching match details from MySQL:', err);
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
