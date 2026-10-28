-- ============================================================================
-- LIVE CRICKET SCORE TRACKER - MySQL 8.0+ DATABASE SCHEMA
-- Third Normal Form (3NF) compliant relational schema with 11 core tables
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `cricket_tracker`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `cricket_tracker`;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `bowling_scorecard`;
DROP TABLE IF EXISTS `batting_scorecard`;
DROP TABLE IF EXISTS `ball_events`;
DROP TABLE IF EXISTS `innings`;
DROP TABLE IF EXISTS `match_umpires`;
DROP TABLE IF EXISTS `umpires`;
DROP TABLE IF EXISTS `matches`;
DROP TABLE IF EXISTS `players`;
DROP TABLE IF EXISTS `teams`;
DROP TABLE IF EXISTS `venues`;
DROP TABLE IF EXISTS `tournaments`;

SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- 1. TOURNAMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE `tournaments` (
  `tournament_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL UNIQUE,
  `format` ENUM('T20', 'ODI', 'Test', 'OTHER') NOT NULL DEFAULT 'T20',
  `start_date` DATE NOT NULL,
  `end_date` DATE NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `chk_tournament_dates` CHECK (`end_date` IS NULL OR `end_date` >= `start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. VENUES
-- ----------------------------------------------------------------------------
CREATE TABLE `venues` (
  `venue_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `city` VARCHAR(100) NOT NULL,
  `seating_capacity` INT UNSIGNED NULL DEFAULT 35000,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_venues_city` (`city`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. TEAMS
-- ----------------------------------------------------------------------------
CREATE TABLE `teams` (
  `team_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(120) NOT NULL UNIQUE,
  `city` VARCHAR(100) NULL,
  `captain_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. PLAYERS
-- ----------------------------------------------------------------------------
CREATE TABLE `players` (
  `player_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(120) NOT NULL,
  `role` ENUM('Batter', 'Bowler', 'All-rounder', 'Wicketkeeper') NOT NULL DEFAULT 'Batter',
  `batting_style` VARCHAR(50) NULL DEFAULT 'Right-hand bat',
  `bowling_style` VARCHAR(50) NULL DEFAULT 'Right-arm medium',
  `team_id` INT UNSIGNED NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_players_team`
    FOREIGN KEY (`team_id`) REFERENCES `teams`(`team_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX `idx_players_team` (`team_id`),
  INDEX `idx_players_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add captain relationship after players table is created
ALTER TABLE `teams`
  ADD CONSTRAINT `fk_teams_captain`
  FOREIGN KEY (`captain_id`) REFERENCES `players`(`player_id`)
  ON UPDATE CASCADE ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 5. MATCHES
-- ----------------------------------------------------------------------------
CREATE TABLE `matches` (
  `match_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `tournament_id` INT UNSIGNED NOT NULL,
  `match_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `toss_winner_id` INT UNSIGNED NULL,
  `toss_decision` ENUM('Bat', 'Field') NULL,
  `toss_result` VARCHAR(255) NULL,
  `status` ENUM('Upcoming', 'Live', 'Completed', 'Abandoned') NOT NULL DEFAULT 'Upcoming',
  `team1_id` INT UNSIGNED NOT NULL,
  `team2_id` INT UNSIGNED NOT NULL,
  `winner_id` INT UNSIGNED NULL,
  `venue_id` INT UNSIGNED NOT NULL,
  `result_summary` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_matches_tournament`
    FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`tournament_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_matches_team1`
    FOREIGN KEY (`team1_id`) REFERENCES `teams`(`team_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_matches_team2`
    FOREIGN KEY (`team2_id`) REFERENCES `teams`(`team_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_matches_winner`
    FOREIGN KEY (`winner_id`) REFERENCES `teams`(`team_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_matches_toss_winner`
    FOREIGN KEY (`toss_winner_id`) REFERENCES `teams`(`team_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_matches_venue`
    FOREIGN KEY (`venue_id`) REFERENCES `venues`(`venue_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX `idx_matches_status_date` (`status`, `match_date`),
  INDEX `idx_matches_tournament` (`tournament_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. UMPIRES
-- ----------------------------------------------------------------------------
CREATE TABLE `umpires` (
  `umpire_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(120) NOT NULL,
  `certification_level` VARCHAR(80) NULL DEFAULT 'ICC Elite Panel',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. MATCH_UMPIRES
-- ----------------------------------------------------------------------------
CREATE TABLE `match_umpires` (
  `match_id` INT UNSIGNED NOT NULL,
  `umpire_id` INT UNSIGNED NOT NULL,
  `role` ENUM('On-field', 'Third Umpire', 'Match Referee', 'Reserve') NOT NULL DEFAULT 'On-field',
  PRIMARY KEY (`match_id`, `umpire_id`),
  CONSTRAINT `fk_match_umpires_match`
    FOREIGN KEY (`match_id`) REFERENCES `matches`(`match_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_match_umpires_umpire`
    FOREIGN KEY (`umpire_id`) REFERENCES `umpires`(`umpire_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. INNINGS
-- ----------------------------------------------------------------------------
CREATE TABLE `innings` (
  `inning_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `match_id` INT UNSIGNED NOT NULL,
  `inning_no` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `batting_team_id` INT UNSIGNED NOT NULL,
  `bowling_team_id` INT UNSIGNED NOT NULL,
  `runs` INT UNSIGNED NOT NULL DEFAULT 0,
  `wickets` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `overs` DECIMAL(5,1) NOT NULL DEFAULT 0.0,
  `legal_balls` INT UNSIGNED NOT NULL DEFAULT 0,
  `target_runs` INT UNSIGNED NULL,
  `status` ENUM('NOT_STARTED', 'LIVE', 'COMPLETED', 'DECLARED', 'ABANDONED') NOT NULL DEFAULT 'NOT_STARTED',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_match_inning` (`match_id`, `inning_no`),
  CONSTRAINT `fk_innings_match`
    FOREIGN KEY (`match_id`) REFERENCES `matches`(`match_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_innings_batting_team`
    FOREIGN KEY (`batting_team_id`) REFERENCES `teams`(`team_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_innings_bowling_team`
    FOREIGN KEY (`bowling_team_id`) REFERENCES `teams`(`team_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX `idx_innings_match` (`match_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. BALL_EVENTS
-- ----------------------------------------------------------------------------
CREATE TABLE `ball_events` (
  `ball_id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `inning_id` INT UNSIGNED NOT NULL,
  `over_no` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `ball_no` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `batter_id` INT UNSIGNED NOT NULL,
  `bowler_id` INT UNSIGNED NOT NULL,
  `runs_scored` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `extra_runs` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `extra_type` ENUM('Wide', 'No-ball', 'Bye', 'Leg-bye', 'Penalty') NULL DEFAULT NULL,
  `wicket_fallen` BOOLEAN NOT NULL DEFAULT FALSE,
  `wicket_type` ENUM('Bowled', 'Caught', 'LBW', 'Run out', 'Stumped', 'Hit wicket', 'Retired hurt', 'Obstructing the field') NULL DEFAULT NULL,
  `dismissed_player_id` INT UNSIGNED NULL,
  `is_legal_delivery` BOOLEAN NOT NULL DEFAULT TRUE,
  `commentary` VARCHAR(500) NULL,
  `timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_ball_events_inning`
    FOREIGN KEY (`inning_id`) REFERENCES `innings`(`inning_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_ball_batter`
    FOREIGN KEY (`batter_id`) REFERENCES `players`(`player_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_ball_bowler`
    FOREIGN KEY (`bowler_id`) REFERENCES `players`(`player_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_ball_dismissed`
    FOREIGN KEY (`dismissed_player_id`) REFERENCES `players`(`player_id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  INDEX `idx_ball_inning_over` (`inning_id`, `over_no`, `ball_no`),
  INDEX `idx_ball_batter` (`batter_id`),
  INDEX `idx_ball_bowler` (`bowler_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. BATTING_SCORECARD
-- ----------------------------------------------------------------------------
CREATE TABLE `batting_scorecard` (
  `scorecard_id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `match_id` INT UNSIGNED NOT NULL,
  `inning_id` INT UNSIGNED NOT NULL,
  `player_id` INT UNSIGNED NOT NULL,
  `runs` INT UNSIGNED NOT NULL DEFAULT 0,
  `balls_faced` INT UNSIGNED NOT NULL DEFAULT 0,
  `fours` INT UNSIGNED NOT NULL DEFAULT 0,
  `sixes` INT UNSIGNED NOT NULL DEFAULT 0,
  `strike_rate` DECIMAL(7,2) NOT NULL DEFAULT 0.00,
  `is_out` BOOLEAN NOT NULL DEFAULT FALSE,
  `dismissal_type` VARCHAR(40) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_batting_player_inning` (`inning_id`, `player_id`),
  CONSTRAINT `fk_batting_match`
    FOREIGN KEY (`match_id`) REFERENCES `matches`(`match_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_batting_inning`
    FOREIGN KEY (`inning_id`) REFERENCES `innings`(`inning_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_batting_player`
    FOREIGN KEY (`player_id`) REFERENCES `players`(`player_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX `idx_batting_match` (`match_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 11. BOWLING_SCORECARD
-- ----------------------------------------------------------------------------
CREATE TABLE `bowling_scorecard` (
  `scorecard_id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `match_id` INT UNSIGNED NOT NULL,
  `inning_id` INT UNSIGNED NOT NULL,
  `player_id` INT UNSIGNED NOT NULL,
  `overs` DECIMAL(5,1) NOT NULL DEFAULT 0.0,
  `maidens` INT UNSIGNED NOT NULL DEFAULT 0,
  `wickets` INT UNSIGNED NOT NULL DEFAULT 0,
  `runs_conceded` INT UNSIGNED NOT NULL DEFAULT 0,
  `economy_rate` DECIMAL(7,2) NOT NULL DEFAULT 0.00,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_bowling_player_inning` (`inning_id`, `player_id`),
  CONSTRAINT `fk_bowling_match`
    FOREIGN KEY (`match_id`) REFERENCES `matches`(`match_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_bowling_inning`
    FOREIGN KEY (`inning_id`) REFERENCES `innings`(`inning_id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_bowling_player`
    FOREIGN KEY (`player_id`) REFERENCES `players`(`player_id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX `idx_bowling_match` (`match_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
