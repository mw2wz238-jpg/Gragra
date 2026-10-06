-- Vanguard Alpha.56 - Wallet & Ledger Core Migration
-- Migration: 003_wallet_ledger
-- Created At: 2026-10-06

-- 1. Wallets table (Authoritative Balance Storage)
CREATE TABLE IF NOT EXISTS wallets (
    player_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Wallet Ledger table (Immutable Audit Log)
CREATE TABLE IF NOT EXISTS wallet_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(16) NOT NULL, -- 'CREDIT', 'DEBIT'
    amount INTEGER NOT NULL CHECK (amount > 0),
    source VARCHAR(32) NOT NULL,
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for fast lookup and transaction verification
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_player_id ON wallet_ledger(player_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_idempotency_key ON wallet_ledger(idempotency_key);
