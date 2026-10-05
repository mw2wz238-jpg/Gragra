-- Vanguard Alpha.53 - Add match_id for persistent idempotency
-- Migration: 002_add_match_id
-- Created At: 2026-10-05

ALTER TABLE match_history ADD COLUMN match_id VARCHAR(64);

-- Update existing records if any (not likely in this environment)
UPDATE match_history SET match_id = id::text WHERE match_id IS NULL;

-- Make it unique per player to prevent double rewards across restarts
ALTER TABLE match_history ADD CONSTRAINT unique_player_match UNIQUE (player_id, match_id);
