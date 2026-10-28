-- ============================================================================
-- LIVE CRICKET SCORE TRACKER - MySQL TRIGGERS
-- Database-level business logic enforcement & automated score synchronization
-- ============================================================================

USE `cricket_tracker`;

DELIMITER $$

-- ----------------------------------------------------------------------------
-- Trigger 1: Auto-update Innings Score on New Delivery
-- Whenever a ball event is inserted, automatically increments team runs & wickets
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS `trg_after_ball_insert_innings`$$

CREATE TRIGGER `trg_after_ball_insert_innings`
AFTER INSERT ON `ball_events`
FOR EACH ROW
BEGIN
    UPDATE `innings`
    SET `runs` = `runs` + NEW.runs_scored + NEW.extra_runs,
        `wickets` = `wickets` + (CASE WHEN NEW.wicket_fallen = 1 THEN 1 ELSE 0 END),
        `legal_balls` = `legal_balls` + (CASE WHEN NEW.is_legal_delivery = 1 THEN 1 ELSE 0 END)
    WHERE `inning_id` = NEW.inning_id;
END$$

-- ----------------------------------------------------------------------------
-- Trigger 2: Auto-revert Innings Score on Delivery Deletion (Undo)
-- Whenever a ball is undone/deleted, automatically decrements runs & wickets
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS `trg_after_ball_delete_innings`$$

CREATE TRIGGER `trg_after_ball_delete_innings`
AFTER DELETE ON `ball_events`
FOR EACH ROW
BEGIN
    UPDATE `innings`
    SET `runs` = GREATEST(0, CAST(`runs` AS SIGNED) - (OLD.runs_scored + OLD.extra_runs)),
        `wickets` = GREATEST(0, CAST(`wickets` AS SIGNED) - (CASE WHEN OLD.wicket_fallen = 1 THEN 1 ELSE 0 END)),
        `legal_balls` = GREATEST(0, CAST(`legal_balls` AS SIGNED) - (CASE WHEN OLD.is_legal_delivery = 1 THEN 1 ELSE 0 END))
    WHERE `inning_id` = OLD.inning_id;
END$$

-- ----------------------------------------------------------------------------
-- Trigger 3: Prevent Matches between the same team
-- Ensures Team 1 and Team 2 are distinct before fixture creation
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS `trg_before_match_insert_distinct_teams`$$

CREATE TRIGGER `trg_before_match_insert_distinct_teams`
BEFORE INSERT ON `matches`
FOR EACH ROW
BEGIN
    IF NEW.team1_id = NEW.team2_id THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Integrity Error: Team 1 and Team 2 cannot be the same team';
    END IF;
END$$

-- ----------------------------------------------------------------------------
-- Trigger 4: Prevent Innings between the same team
-- Ensures batting team and bowling team are distinct
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS `trg_before_innings_insert_distinct_teams`$$

CREATE TRIGGER `trg_before_innings_insert_distinct_teams`
BEFORE INSERT ON `innings`
FOR EACH ROW
BEGIN
    IF NEW.batting_team_id = NEW.bowling_team_id THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Integrity Error: Batting team and Bowling team cannot be the same';
    END IF;
END$$

-- ----------------------------------------------------------------------------
-- Trigger 5: Auto-calculate Batter Strike Rate on Scorecard Update
-- Automatically computes (runs / balls_faced) * 100 on every batter score change
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS `trg_before_batting_scorecard_update_sr`$$

CREATE TRIGGER `trg_before_batting_scorecard_update_sr`
BEFORE UPDATE ON `batting_scorecard`
FOR EACH ROW
BEGIN
    IF NEW.balls_faced > 0 THEN
        SET NEW.strike_rate = ROUND((CAST(NEW.runs AS DECIMAL(7,2)) / NEW.balls_faced) * 100, 2);
    ELSE
        SET NEW.strike_rate = 0.00;
    END IF;
END$$

DELIMITER ;
