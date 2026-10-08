import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameSimulation } from '../src/server/game-simulation.ts';
import { VANGUARD_WEAPONS } from '../src/shared/types.ts';

describe('Project Vanguard - Etap 2: Equipment Retention Policy', () => {
  it('TEST 1 & TEST 5: Survivor retains equipped weapon and ammo into next round', () => {
    const sim = new GameSimulation('sim_retention_01', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'SurvivorAlpha', team: 'alpha', isBot: false },
      { id: 'p2', username: 'EnemyOmega', team: 'omega', isBot: false },
    ]);

    const survivor = sim.players.get('p1');
    assert.ok(survivor);

    // Give cash and buy vanguard_rifle during initial BUY phase
    sim.economy.addCash('p1', 3000, 'TEST_CREDITS');
    const buyResult = sim.handlePlayerBuy('p1', 'vanguard_rifle');
    assert.equal(buyResult.success, true);
    assert.equal(survivor.equippedWeaponId, 'vanguard_rifle');

    // Simulate firing a few rounds (e.g. 10 shots fired)
    survivor.ammoInMag = 20;
    survivor.reserveAmmo = 60;

    // BUY -> LIVE
    sim.roundSM.advancePhase();
    assert.equal(sim.roundSM.getPhase(), 'LIVE');

    // End round with Alpha victory; survivor is alive
    sim.roundSM.advancePhase('alpha'); // LIVE -> ROUND_END
    assert.equal(sim.roundSM.getPhase(), 'ROUND_END');
    assert.equal(survivor.isAlive, true);

    sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
    assert.equal(sim.roundSM.getPhase(), 'REWARDS');

    // REWARDS -> BUY (Next Round)
    sim.roundSM.advancePhase();
    assert.equal(sim.roundSM.getPhase(), 'BUY');
    assert.equal(sim.roundSM.getRoundNumber(), 2);

    // Call resetRoundState to apply round reset
    sim['resetRoundState']();

    // Verification: Survivor must retain vanguard_rifle, magazine ammo (20), reserve ammo (60)
    assert.equal(survivor.equippedWeaponId, 'vanguard_rifle', 'Survivor must retain purchased vanguard_rifle');
    assert.equal(survivor.ammoInMag, 20, 'Survivor magazine ammo must be retained');
    assert.equal(survivor.reserveAmmo, 60, 'Survivor reserve ammo must be retained');

    sim.stopSimulation();
  });

  it('TEST 2 & TEST 3: Eliminated player resets to starter weapon (vanguard_pistol) and 0 armor', () => {
    const sim = new GameSimulation('sim_retention_02', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'KillerAlpha', team: 'alpha', isBot: false },
      { id: 'p2', username: 'VictimOmega', team: 'omega', isBot: false },
    ]);

    const victim = sim.players.get('p2');
    assert.ok(victim);

    // Give victim cash and buy vanguard_rifle and armor
    sim.economy.addCash('p2', 4000, 'TEST_CREDITS');
    sim.handlePlayerBuy('p2', 'vanguard_rifle');
    sim.handlePlayerBuy('p2', 'item_kevlar');
    assert.equal(victim.equippedWeaponId, 'vanguard_rifle');
    assert.equal(victim.armor, 100);

    // Advance to LIVE
    sim.roundSM.advancePhase();

    // Eliminate victim
    sim['eliminatePlayer'](victim, 'p1', false);
    assert.equal(victim.isAlive, false);
    assert.equal(victim.health, 0);

    // Round ends with Alpha victory
    sim.roundSM.advancePhase('alpha'); // ROUND_END
    sim.roundSM.advancePhase(); // REWARDS
    sim.roundSM.advancePhase(); // Next BUY (Round 2)
    sim['resetRoundState']();

    // Eliminated player must have reset to starter pistol, full pistol ammo, and 0 armor
    const pistol = VANGUARD_WEAPONS.vanguard_pistol;
    assert.equal(victim.isAlive, true, 'Eliminated player is respawned for new round');
    assert.equal(victim.equippedWeaponId, 'vanguard_pistol', 'Eliminated player must receive starter pistol');
    assert.equal(victim.ammoInMag, pistol.magazineSize, 'Pistol ammo magazine must be full');
    assert.equal(victim.reserveAmmo, pistol.reserveAmmo, 'Pistol reserve ammo must be full');
    assert.equal(victim.armor, 0, 'Eliminated player must start with 0 armor');

    sim.stopSimulation();
  });

  it('TEST 4: Survivor armor retention retains remaining armor value', () => {
    const sim = new GameSimulation('sim_retention_04', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'ArmorSurvivor', team: 'alpha', isBot: false },
      { id: 'p2', username: 'Enemy', team: 'omega', isBot: false },
    ]);

    const player = sim.players.get('p1');
    assert.ok(player);

    sim.economy.addCash('p1', 1000, 'TEST_CREDITS');
    sim.handlePlayerBuy('p1', 'item_kevlar');
    assert.equal(player.armor, 100);

    // Player takes damage in combat: armor reduced to 45
    player.armor = 45;
    player.health = 70;

    // Advance to next round while surviving
    sim.roundSM.advancePhase(); // LIVE
    sim.roundSM.advancePhase('alpha'); // ROUND_END
    sim.roundSM.advancePhase(); // REWARDS
    sim.roundSM.advancePhase(); // BUY (Round 2)
    sim['resetRoundState']();

    // Survivor health is restored to 100 on new round, but armor retains damaged value 45
    assert.equal(player.health, 100);
    assert.equal(player.armor, 45, 'Survivor must retain existing armor value');

    sim.stopSimulation();
  });

  it('TEST 6: Multi-round continuity over 3+ consecutive rounds with survival & elimination', () => {
    const sim = new GameSimulation('sim_retention_06', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'Player1', team: 'alpha', isBot: false },
      { id: 'p2', username: 'Player2', team: 'omega', isBot: false },
    ]);

    const p1 = sim.players.get('p1');
    const p2 = sim.players.get('p2');

    // === ROUND 1 ===
    // p1 buys vanguard_smg
    sim.economy.addCash('p1', 2000, 'CREDITS');
    sim.handlePlayerBuy('p1', 'vanguard_smg');
    assert.equal(p1.equippedWeaponId, 'vanguard_smg');

    // p2 is eliminated
    sim.roundSM.advancePhase(); // LIVE
    sim['eliminatePlayer'](p2, 'p1', false); // automatically advances LIVE -> ROUND_END
    sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
    sim.roundSM.advancePhase(); // REWARDS -> BUY Round 2
    sim['resetRoundState']();

    // Round 2 start state
    assert.equal(p1.equippedWeaponId, 'vanguard_smg', 'R2: p1 survived, retains vanguard_smg');
    assert.equal(p2.equippedWeaponId, 'vanguard_pistol', 'R2: p2 died, reset to vanguard_pistol');
    assert.equal(p2.armor, 0);

    // === ROUND 2 ===
    // p2 buys vanguard_shotgun, p1 gets eliminated
    sim.economy.addCash('p2', 2500, 'CREDITS');
    sim.handlePlayerBuy('p2', 'vanguard_shotgun');
    assert.equal(p2.equippedWeaponId, 'vanguard_shotgun');

    sim.roundSM.advancePhase(); // BUY -> LIVE
    sim['eliminatePlayer'](p1, 'p2', false); // automatically advances LIVE -> ROUND_END
    sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
    sim.roundSM.advancePhase(); // REWARDS -> BUY Round 3
    sim['resetRoundState']();

    // Round 3 start state
    assert.equal(p1.equippedWeaponId, 'vanguard_pistol', 'R3: p1 died in R2, reset to vanguard_pistol');
    assert.equal(p1.armor, 0);
    assert.equal(p2.equippedWeaponId, 'vanguard_shotgun', 'R3: p2 survived R2, retains vanguard_shotgun');

    // === ROUND 3 ===
    // Both survive (time expired)
    sim.roundSM.advancePhase(); // LIVE
    sim.roundSM.advancePhase('omega'); // ROUND_END
    sim.roundSM.advancePhase(); // REWARDS
    sim.roundSM.advancePhase(); // BUY Round 4
    sim['resetRoundState']();

    assert.equal(p1.equippedWeaponId, 'vanguard_pistol', 'R4: p1 survived R3 with pistol');
    assert.equal(p2.equippedWeaponId, 'vanguard_shotgun', 'R4: p2 survived R3 with shotgun');

    sim.stopSimulation();
  });

  it('TEST 7: Dropped weapons and utility from previous round are completely cleared', () => {
    const sim = new GameSimulation('sim_retention_07', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'Player1', team: 'alpha', isBot: false },
      { id: 'p2', username: 'Player2', team: 'omega', isBot: false },
    ]);

    sim.roundSM.advancePhase(); // LIVE

    // p1 drops weapon during combat
    sim.handleDropWeapon('p1');
    assert.ok(sim.droppedWeapons.size > 0, 'Dropped weapon exists on floor');

    // p2 is eliminated, creating another weapon drop
    const p2 = sim.players.get('p2');
    sim['eliminatePlayer'](p2, 'p1', false);
    assert.equal(sim.droppedWeapons.size, 2, 'Two dropped weapons exist');

    // Round ends & resets to new round
    sim.roundSM.advancePhase('alpha'); // ROUND_END
    sim.roundSM.advancePhase(); // REWARDS
    sim.roundSM.advancePhase(); // BUY
    sim['resetRoundState']();

    assert.equal(sim.droppedWeapons.size, 0, 'All dropped weapons must be purged on round reset');

    sim.stopSimulation();
  });

  it('TEST 8: Economy regression - buy validation and pricing remain authoritative and unchanged', () => {
    const sim = new GameSimulation('sim_retention_08', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'Player1', team: 'alpha', isBot: false },
    ]);

    const p1 = sim.players.get('p1');
    assert.ok(p1);
    assert.equal(p1.cash, 800);

    // Attempting to buy $2900 rifle with only $800 fails
    const failBuy = sim.handlePlayerBuy('p1', 'vanguard_rifle');
    assert.equal(failBuy.success, false);
    assert.equal(failBuy.reason, 'INSUFFICIENT_FUNDS');
    assert.equal(p1.equippedWeaponId, 'vanguard_rifle'); // default initial loadout

    // Buying $500 pistol works
    const buyPistol = sim.handlePlayerBuy('p1', 'vanguard_pistol');
    assert.equal(buyPistol.success, true);
    assert.equal(p1.cash, 300);
    assert.equal(p1.equippedWeaponId, 'vanguard_pistol');

    sim.stopSimulation();
  });

  it('TEST 9: State broadcast preserves authoritative equipment snapshot for client reconciliation', () => {
    const sim = new GameSimulation('sim_retention_09', 'COMPETITIVE');
    sim.initPlayers([
      { id: 'p1', username: 'Player1', team: 'alpha', isBot: false },
    ]);

    let capturedSnapshot = null;
    sim.onBroadcast((snapshot) => {
      capturedSnapshot = snapshot;
    });

    sim.economy.addCash('p1', 3000, 'TEST');
    sim.handlePlayerBuy('p1', 'vanguard_rifle');
    sim.handlePlayerBuy('p1', 'item_kevlar');

    // Trigger state broadcast
    sim['broadcastState']();

    assert.ok(capturedSnapshot);
    const pSnapshot = capturedSnapshot.players.find((p) => p.id === 'p1');
    assert.ok(pSnapshot);
    assert.equal(pSnapshot.equippedWeaponId, 'vanguard_rifle');
    assert.equal(pSnapshot.armor, 100);
    assert.equal(pSnapshot.health, 100);
    assert.equal(pSnapshot.isAlive, true);

    sim.stopSimulation();
  });
});
