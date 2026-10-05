-- Vanguard Alpha.53 - Initial Schema Migration
-- Migration: 001_initial_schema
-- Created At: 2026-10-05

-- 1. Users table (Core Identity)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Profiles table (Authoritative Stats & Leveling)
CREATE TABLE IF NOT EXISTS profiles (
    player_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    rating INTEGER DEFAULT 1200,
    rank VARCHAR(32) DEFAULT 'Recruit',
    matches INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    headshots INTEGER DEFAULT 0,
    mvps INTEGER DEFAULT 0,
    play_time_minutes INTEGER DEFAULT 0,
    equipped_weapon_id VARCHAR(64) DEFAULT 'vanguard_rifle'
);

-- 3. Match History table (Completed Match Records)
CREATE TABLE IF NOT EXISTS match_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(32) NOT NULL,
    map_id VARCHAR(64) NOT NULL,
    result VARCHAR(16) NOT NULL, -- 'VICTORY', 'DEFEAT', 'DRAW'
    score VARCHAR(32) NOT NULL,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    headshots INTEGER DEFAULT 0,
    rating_change INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_match_history_player_id ON match_history(player_id);
CREATE INDEX IF NOT EXISTS idx_match_history_timestamp ON match_history(timestamp);

