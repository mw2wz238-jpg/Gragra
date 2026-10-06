-- Vanguard Alpha.59 - Inventory Items Migration
-- Migration: 004_inventory_items
-- Created At: 2026-10-06

-- 1. Inventory Items table (Authoritative Items & Loadout)
CREATE TABLE IF NOT EXISTS inventory_items (
    instance_id VARCHAR(128) PRIMARY KEY,
    player_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type VARCHAR(16) NOT NULL CHECK (item_type IN ('SKIN', 'CRATE')),
    item_id VARCHAR(64) NOT NULL,
    weapon_id VARCHAR(64),
    source VARCHAR(32) NOT NULL DEFAULT 'DEFAULT',
    is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
    acquired_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance and loadout lookups
CREATE INDEX IF NOT EXISTS idx_inventory_items_player_id ON inventory_items(player_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_player_type ON inventory_items(player_id, item_type);

-- Constraint: A player can only have one skin equipped per weapon
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_items_equipped ON inventory_items(player_id, weapon_id) WHERE (is_equipped = TRUE AND item_type = 'SKIN');
