import mysql, { Pool, PoolConnection } from 'mysql2/promise';

let pool: Pool | null = null;
let isInitialized = false;

export function getDbPool(): Pool {
  if (pool) return pool;

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
  const database = process.env.DB_NAME || 'cricket_tracker';

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 15,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    decimalNumbers: true,
    multipleStatements: true,
  });

  return pool;
}

/**
 * Creates connection without database selected to allow creating the database if needed
 */
export async function getRootConnection(): Promise<mysql.Connection> {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';

  return await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
  });
}

/**
 * Initialize database and tables automatically on first request
 */
export async function ensureDatabaseInitialized(): Promise<boolean> {
  if (isInitialized) return true;

  try {
    const currentPool = getDbPool();
    // Test if cricket_tracker tables exist
    const [tables]: any = await currentPool.query("SHOW TABLES LIKE 'matches'");
    if (tables && tables.length > 0) {
      isInitialized = true;
      return true;
    }

    // If tables don't exist, create them
    await runSchemaInitialization();
    isInitialized = true;
    return true;
  } catch (err: any) {
    // Check if error is Unknown database 'cricket_tracker' (ER_BAD_DB_ERROR - 1049)
    if (err.code === 'ER_BAD_DB_ERROR' || err.errno === 1049) {
      try {
        const rootConn = await getRootConnection();
        await rootConn.query(
          "CREATE DATABASE IF NOT EXISTS `cricket_tracker` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        );
        await rootConn.end();
        await runSchemaInitialization();
        isInitialized = true;
        return true;
      } catch (innerErr) {
        console.error('Failed to auto-create database:', innerErr);
        return false;
      }
    }
    console.warn('Database initialization check warning:', err?.message || err);
    return false;
  }
}

async function runSchemaInitialization() {
  const p = getDbPool();

  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS tournaments (
      tournament_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL UNIQUE,
      format ENUM('T20', 'ODI', 'Test', 'OTHER') NOT NULL DEFAULT 'T20',
      start_date DATE NOT NULL,
      end_date DATE NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS venues (
      venue_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      city VARCHAR(100) NOT NULL,
      seating_capacity INT UNSIGNED NULL DEFAULT 35000,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS teams (
      team_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      city VARCHAR(100) NULL,
      captain_id INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS players (
      player_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      role ENUM('Batter', 'Bowler', 'All-rounder', 'Wicketkeeper') NOT NULL DEFAULT 'Batter',
      batting_style VARCHAR(50) NULL DEFAULT 'Right-hand bat',
      bowling_style VARCHAR(50) NULL DEFAULT 'Right-arm medium',
      team_id INT UNSIGNED NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_players_team FOREIGN KEY (team_id) REFERENCES teams(team_id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS matches (
      match_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      tournament_id INT UNSIGNED NOT NULL,
      match_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      toss_winner_id INT UNSIGNED NULL,
      toss_decision ENUM('Bat', 'Field') NULL,
      toss_result VARCHAR(255) NULL,
      status ENUM('Upcoming', 'Live', 'Completed', 'Abandoned') NOT NULL DEFAULT 'Upcoming',
      team1_id INT UNSIGNED NOT NULL,
      team2_id INT UNSIGNED NOT NULL,
      winner_id INT UNSIGNED NULL,
      venue_id INT UNSIGNED NOT NULL,
      result_summary VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_matches_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_matches_team1 FOREIGN KEY (team1_id) REFERENCES teams(team_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_matches_team2 FOREIGN KEY (team2_id) REFERENCES teams(team_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_matches_venue FOREIGN KEY (venue_id) REFERENCES venues(venue_id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS umpires (
      umpire_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      certification_level VARCHAR(80) NULL DEFAULT 'ICC Elite Panel',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS match_umpires (
      match_id INT UNSIGNED NOT NULL,
      umpire_id INT UNSIGNED NOT NULL,
      role ENUM('On-field', 'Third Umpire', 'Match Referee', 'Reserve') NOT NULL DEFAULT 'On-field',
      PRIMARY KEY (match_id, umpire_id),
      CONSTRAINT fk_match_umpires_match FOREIGN KEY (match_id) REFERENCES matches(match_id) ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT fk_match_umpires_umpire FOREIGN KEY (umpire_id) REFERENCES umpires(umpire_id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS innings (
      inning_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      match_id INT UNSIGNED NOT NULL,
      inning_no TINYINT UNSIGNED NOT NULL DEFAULT 1,
      batting_team_id INT UNSIGNED NOT NULL,
      bowling_team_id INT UNSIGNED NOT NULL,
      runs INT UNSIGNED NOT NULL DEFAULT 0,
      wickets TINYINT UNSIGNED NOT NULL DEFAULT 0,
      overs DECIMAL(5,1) NOT NULL DEFAULT 0.0,
      legal_balls INT UNSIGNED NOT NULL DEFAULT 0,
      target_runs INT UNSIGNED NULL,
      status ENUM('NOT_STARTED', 'LIVE', 'COMPLETED', 'DECLARED', 'ABANDONED') NOT NULL DEFAULT 'NOT_STARTED',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_match_inning (match_id, inning_no),
      CONSTRAINT fk_innings_match FOREIGN KEY (match_id) REFERENCES matches(match_id) ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT fk_innings_batting_team FOREIGN KEY (batting_team_id) REFERENCES teams(team_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_innings_bowling_team FOREIGN KEY (bowling_team_id) REFERENCES teams(team_id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS ball_events (
      ball_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      inning_id INT UNSIGNED NOT NULL,
      over_no SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      ball_no TINYINT UNSIGNED NOT NULL DEFAULT 1,
      batter_id INT UNSIGNED NOT NULL,
      bowler_id INT UNSIGNED NOT NULL,
      runs_scored TINYINT UNSIGNED NOT NULL DEFAULT 0,
      extra_runs TINYINT UNSIGNED NOT NULL DEFAULT 0,
      extra_type ENUM('Wide', 'No-ball', 'Bye', 'Leg-bye', 'Penalty') NULL DEFAULT NULL,
      wicket_fallen BOOLEAN NOT NULL DEFAULT FALSE,
      wicket_type ENUM('Bowled', 'Caught', 'LBW', 'Run out', 'Stumped', 'Hit wicket', 'Retired hurt', 'Obstructing the field') NULL DEFAULT NULL,
      dismissed_player_id INT UNSIGNED NULL,
      is_legal_delivery BOOLEAN NOT NULL DEFAULT TRUE,
      commentary VARCHAR(500) NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_ball_events_inning FOREIGN KEY (inning_id) REFERENCES innings(inning_id) ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT fk_ball_batter FOREIGN KEY (batter_id) REFERENCES players(player_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_ball_bowler FOREIGN KEY (bowler_id) REFERENCES players(player_id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS batting_scorecard (
      scorecard_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      match_id INT UNSIGNED NOT NULL,
      inning_id INT UNSIGNED NOT NULL,
      player_id INT UNSIGNED NOT NULL,
      runs INT UNSIGNED NOT NULL DEFAULT 0,
      balls_faced INT UNSIGNED NOT NULL DEFAULT 0,
      fours INT UNSIGNED NOT NULL DEFAULT 0,
      sixes INT UNSIGNED NOT NULL DEFAULT 0,
      strike_rate DECIMAL(7,2) NOT NULL DEFAULT 0.00,
      is_out BOOLEAN NOT NULL DEFAULT FALSE,
      dismissal_type VARCHAR(40) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_batting_player_inning (inning_id, player_id),
      CONSTRAINT fk_batting_match FOREIGN KEY (match_id) REFERENCES matches(match_id) ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT fk_batting_inning FOREIGN KEY (inning_id) REFERENCES innings(inning_id) ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT fk_batting_player FOREIGN KEY (player_id) REFERENCES players(player_id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS bowling_scorecard (
      scorecard_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      match_id INT UNSIGNED NOT NULL,
      inning_id INT UNSIGNED NOT NULL,
      player_id INT UNSIGNED NOT NULL,
      overs DECIMAL(5,1) NOT NULL DEFAULT 0.0,
      maidens INT UNSIGNED NOT NULL DEFAULT 0,
      wickets INT UNSIGNED NOT NULL DEFAULT 0,
      runs_conceded INT UNSIGNED NOT NULL DEFAULT 0,
      economy_rate DECIMAL(7,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_bowling_player_inning (inning_id, player_id),
      CONSTRAINT fk_bowling_match FOREIGN KEY (match_id) REFERENCES matches(match_id) ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT fk_bowling_inning FOREIGN KEY (inning_id) REFERENCES innings(inning_id) ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT fk_bowling_player FOREIGN KEY (player_id) REFERENCES players(player_id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
  ];

  for (const stmt of ddlStatements) {
    try {
      await p.query(stmt);
    } catch (e: any) {
      console.warn('DDL notice:', e?.message || e);
    }
  }
}
