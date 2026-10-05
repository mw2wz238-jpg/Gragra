import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { VanguardEconomy } from '../src/server/economy.ts';

describe('Vanguard Server-Authoritative Economy (Sections 9 & 12)', () => {
  it('should initialize player with $800 starting cash', () => {
    const eco = new VanguardEconomy(800);
    eco.initPlayer('p1');
    assert.equal(eco.getBalance('p1'), 800);
  });

  it('should process legal weapon purchase and deduct balance atomically', () => {
    const eco = new VanguardEconomy(800);
    eco.initPlayer('p1');

    // Attempt to buy $500 pistol during BUY phase
    const res = eco.executePurchase('p1', 'vanguard_pistol', true);
    assert.equal(res.success, true);
    assert.equal(res.balanceAfter, 300);
    assert.equal(eco.getBalance('p1'), 300);
  });

  it('should reject purchase if funds are insufficient', () => {
    const eco = new VanguardEconomy(800);
    eco.initPlayer('p1');

    // Attempt to buy $2900 rifle with only $800
    const res = eco.executePurchase('p1', 'vanguard_rifle', true);
    assert.equal(res.success, false);
    assert.equal(res.reason, 'INSUFFICIENT_FUNDS');
    assert.equal(eco.getBalance('p1'), 800);
  });

  it('should reject purchases when buy phase is inactive', () => {
    const eco = new VanguardEconomy(5000);
    eco.initPlayer('p1');

    const res = eco.executePurchase('p1', 'vanguard_rifle', false); // isBuyPhase = false
    assert.equal(res.success, false);
    assert.equal(res.reason, 'BUY_PHASE_INACTIVE');
    assert.equal(eco.getBalance('p1'), 5000);
  });

  it('should award kill bounties based on weapon category ($300 rifle, $900 shotgun)', () => {
    const eco = new VanguardEconomy(800);
    eco.initPlayer('p1');

    // Rifle kill
    const bountyRifle = eco.awardKill('p1', 'vanguard_rifle');
    assert.equal(bountyRifle, 300);
    assert.equal(eco.getBalance('p1'), 1100);

    // Shotgun kill
    const bountyShotgun = eco.awardKill('p1', 'vanguard_shotgun');
    assert.equal(bountyShotgun, 900);
    assert.equal(eco.getBalance('p1'), 2000);
  });

  it('should scale loss streaks accurately: $1400 -> $1900 -> $2400 -> $2900 -> $3400 (max)', () => {
    const eco = new VanguardEconomy(0);
    eco.initPlayer('alpha1');
    eco.initPlayer('omega1');

    const roster = [
      { id: 'alpha1', team: 'alpha' },
      { id: 'omega1', team: 'omega' },
    ];

    // Round 1: Alpha wins, Omega loses (loss streak 1 = $1400)
    const r1 = eco.settleRound('alpha', roster);
    assert.equal(r1.alphaReward, 3250);
    assert.equal(r1.omegaReward, 1400);

    // Round 2: Alpha wins again, Omega loss streak 2 = $1900
    const r2 = eco.settleRound('alpha', roster);
    assert.equal(r2.omegaReward, 1900);

    // Round 3: Alpha wins, Omega loss streak 3 = $2400
    const r3 = eco.settleRound('alpha', roster);
    assert.equal(r3.omegaReward, 2400);

    // Round 4: Alpha wins, Omega loss streak 4 = $2900
    const r4 = eco.settleRound('alpha', roster);
    assert.equal(r4.omegaReward, 2900);

    // Round 5: Alpha wins, Omega loss streak 5 = $3400 (max cap)
    const r5 = eco.settleRound('alpha', roster);
    assert.equal(r5.omegaReward, 3400);

    // Round 6: Alpha wins, streak capped at 4 ($3400)
    const r6 = eco.settleRound('alpha', roster);
    assert.equal(r6.omegaReward, 3400);
  });
});
