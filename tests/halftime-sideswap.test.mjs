import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameSimulation } from '../src/server/game-simulation.ts';
import { RoundStateMachine } from '../src/shared/state-machine.ts';
import { VanguardEconomy } from '../src/server/economy.ts';
import { VANGUARD_WEAPONS } from '../src/shared/types.ts';

describe('Project Vanguard - Etap 4: Halftime & Side Swap (24-Round Competitive Standard)', () => {
  it('should identify first half (R1-R12) and second half (R13-R24) correctly in RoundStateMachine', () => {
    const rsm = new RoundStateMachine(24, 13);
    assert.equal(rsm.getMaxRounds(), 24);
    assert.equal(rsm.getTargetWins(), 13);
    assert.equal(rsm.getHalftimeRound(), 12);
    assert.equal(rsm.isSecondHalf(), false);

    // Cycle through 12 rounds
    for (let r = 1; r <= 12; r++) {
      assert.equal(rsm.getRoundNumber(), r);
      assert.equal(rsm.isSecondHalf(), false, `Round ${r} must be first half`);
      assert.equal(rsm.isHalftimeRound(), false, `Round ${r} is not halftime start`);
      rsm.advancePhase(); // BUY -> LIVE
      rsm.advancePhase('alpha'); // LIVE -> ROUND_END
      rsm.advancePhase(); // ROUND_END -> REWARDS
      rsm.advancePhase(); // REWARDS -> BUY (next round)
    }

    // Now at Round 13 (start of second half)
    assert.equal(rsm.getRoundNumber(), 13);
    assert.equal(rsm.isSecondHalf(), true, 'Round 13 must be second half');
    assert.equal(rsm.isHalftimeRound(), true, 'Round 13 must be halftime round');

    // Advance to Round 14
    rsm.advancePhase(); // BUY -> LIVE
    rsm.advancePhase('omega'); // LIVE -> ROUND_END
    rsm.advancePhase(); // ROUND_END -> REWARDS
    rsm.advancePhase(); // REWARDS -> BUY (Round 14)

    assert.equal(rsm.getRoundNumber(), 14);
    assert.equal(rsm.isSecondHalf(), true);
    assert.equal(rsm.isHalftimeRound(), false);
  });

  it('should preserve scores across Halftime transition (SCORE !== ROLE)', () => {
    const sim = new GameSimulation('sim_halftime_scores_01', 'COMPETITIVE', 'industrial_zone');
    sim.initPlayers([
      { id: 'p_alpha_1', username: 'AlphaLead', team: 'alpha', isBot: false },
      { id: 'p_omega_1', username: 'OmegaLead', team: 'omega', isBot: false },
    ]);

    // Simulate Alpha winning 8 rounds and Omega winning 4 rounds (total 12 rounds)
    for (let r = 1; r <= 8; r++) {
      sim.roundSM.advancePhase(); // BUY -> LIVE
      sim['endRound']('alpha', 'Attackers eliminated');
      sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
      sim.roundSM.advancePhase(); // REWARDS -> BUY
      sim['resetRoundState']();
    }
    for (let r = 9; r <= 12; r++) {
      sim.roundSM.advancePhase(); // BUY -> LIVE
      sim['endRound']('omega', 'Time expired');
      sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
      sim.roundSM.advancePhase(); // REWARDS -> BUY
      sim['resetRoundState']();
    }

    // We are now at Round 13
    assert.equal(sim.roundSM.getRoundNumber(), 13);
    const scores = sim.roundSM.getScores();
    assert.equal(scores.alpha, 8, 'Alpha score must remain 8 after halftime');
    assert.equal(scores.omega, 4, 'Omega score must remain 4 after halftime');
    assert.equal(sim.getAttackingTeam(), 'omega', 'Omega must be attacking team in second half');
    assert.equal(sim.getDefendingTeam(), 'alpha', 'Alpha must be defending team in second half');

    sim.stopSimulation();
  });

  it('should reset player wallets and team loss streaks at Halftime (Round 13)', () => {
    const sim = new GameSimulation('sim_halftime_eco_01', 'COMPETITIVE', 'industrial_zone');
    sim.initPlayers([
      { id: 'p_alpha_1', username: 'AlphaRich', team: 'alpha', isBot: false },
      { id: 'p_omega_1', username: 'OmegaPoor', team: 'omega', isBot: false },
    ]);

    // Give players rich wallet & build loss streaks in first half
    sim.economy.addCash('p_alpha_1', 12000, 'TEST_CREDIT');
    sim.economy.addCash('p_omega_1', 8000, 'TEST_CREDIT');

    // Simulate 12 rounds to reach round 13
    for (let r = 1; r <= 12; r++) {
      sim.roundSM.advancePhase(); // BUY -> LIVE
      sim['endRound']('alpha', 'Attackers eliminated');
      sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
      sim.roundSM.advancePhase(); // REWARDS -> BUY
      sim['resetRoundState']();
    }

    assert.equal(sim.roundSM.getRoundNumber(), 13);

    // In Round 13 (second pistol round), both wallets must reset to $800 and loss streaks to 0
    const alphaPlayer = sim.players.get('p_alpha_1');
    const omegaPlayer = sim.players.get('p_omega_1');
    assert.ok(alphaPlayer && omegaPlayer);

    assert.equal(alphaPlayer.cash, 800, 'Alpha player cash must reset to 800 at Halftime');
    assert.equal(omegaPlayer.cash, 800, 'Omega player cash must reset to 800 at Halftime');
    assert.equal(sim.economy.getBalance('p_alpha_1'), 800);
    assert.equal(sim.economy.getBalance('p_omega_1'), 800);

    const streaks = sim.economy.getLossStreaks();
    assert.equal(streaks.alpha, 0, 'Alpha loss streak must be 0 after halftime');
    assert.equal(streaks.omega, 0, 'Omega loss streak must be 0 after halftime');

    sim.stopSimulation();
  });

  it('should clear equipment retention at Halftime: all players start Round 13 with starter pistol and 0 armor', () => {
    const sim = new GameSimulation('sim_halftime_equip_01', 'COMPETITIVE', 'industrial_zone');
    sim.initPlayers([
      { id: 'p_alpha_1', username: 'AlphaRifleSurvivor', team: 'alpha', isBot: false },
      { id: 'p_omega_1', username: 'OmegaRifleSurvivor', team: 'omega', isBot: false },
    ]);

    // Fast-forward to Round 12
    for (let r = 1; r < 12; r++) {
      sim.roundSM.advancePhase(); // BUY -> LIVE
      sim['endRound']('alpha', 'Attackers eliminated');
      sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
      sim.roundSM.advancePhase(); // REWARDS -> BUY
      sim['resetRoundState']();
    }

    assert.equal(sim.roundSM.getRoundNumber(), 12);

    // Equip heavy loadouts for Round 12
    const pAlpha = sim.players.get('p_alpha_1');
    const pOmega = sim.players.get('p_omega_1');
    assert.ok(pAlpha && pOmega);

    pAlpha.equippedWeaponId = 'vanguard_sniper';
    pAlpha.ammoInMag = 5;
    pAlpha.reserveAmmo = 20;
    pAlpha.armor = 100;
    pAlpha.isAlive = true;

    pOmega.equippedWeaponId = 'vanguard_rifle';
    pOmega.ammoInMag = 30;
    pOmega.reserveAmmo = 90;
    pOmega.armor = 100;
    pOmega.isAlive = true;

    // Advance Round 12 to completion and trigger Round 13 reset
    sim.roundSM.advancePhase(); // BUY -> LIVE
    sim['endRound']('alpha', 'Attackers eliminated');
    sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
    sim.roundSM.advancePhase(); // REWARDS -> BUY (Round 13)
    sim['resetRoundState']();

    assert.equal(sim.roundSM.getRoundNumber(), 13);

    // Even though both players survived Round 12, Halftime clears equipment retention!
    assert.equal(pAlpha.equippedWeaponId, 'vanguard_pistol', 'Alpha must start R13 with default pistol');
    assert.equal(pAlpha.ammoInMag, VANGUARD_WEAPONS.vanguard_pistol.magazineSize);
    assert.equal(pAlpha.reserveAmmo, VANGUARD_WEAPONS.vanguard_pistol.reserveAmmo);
    assert.equal(pAlpha.armor, 0, 'Alpha must start R13 with 0 armor');

    assert.equal(pOmega.equippedWeaponId, 'vanguard_pistol', 'Omega must start R13 with default pistol');
    assert.equal(pOmega.ammoInMag, VANGUARD_WEAPONS.vanguard_pistol.magazineSize);
    assert.equal(pOmega.reserveAmmo, VANGUARD_WEAPONS.vanguard_pistol.reserveAmmo);
    assert.equal(pOmega.armor, 0, 'Omega must start R13 with 0 armor');

    sim.stopSimulation();
  });

  it('should swap team spawn locations in second half (Omega spawns at Alpha spawns, Alpha at Omega spawns)', () => {
    const sim = new GameSimulation('sim_halftime_spawns_01', 'COMPETITIVE', 'industrial_zone');
    sim.initPlayers([
      { id: 'p_alpha_1', username: 'AlphaPlayer', team: 'alpha', isBot: false },
      { id: 'p_omega_1', username: 'OmegaPlayer', team: 'omega', isBot: false },
    ]);

    const alphaSpawns = sim.mapDefinition.teamSpawns.alpha;
    const omegaSpawns = sim.mapDefinition.teamSpawns.omega;

    // In Round 1 (First Half):
    const pAlphaR1 = sim.players.get('p_alpha_1');
    const pOmegaR1 = sim.players.get('p_omega_1');
    assert.ok(pAlphaR1 && pOmegaR1);

    const distAlphaToAlphaSpawn = Math.hypot(pAlphaR1.position[0] - alphaSpawns[0].position[0], pAlphaR1.position[2] - alphaSpawns[0].position[2]);
    const distOmegaToOmegaSpawn = Math.hypot(pOmegaR1.position[0] - omegaSpawns[0].position[0], pOmegaR1.position[2] - omegaSpawns[0].position[2]);

    assert.ok(distAlphaToAlphaSpawn < 3.0, 'In Round 1, Alpha must spawn near alpha team spawn');
    assert.ok(distOmegaToOmegaSpawn < 3.0, 'In Round 1, Omega must spawn near omega team spawn');

    // Simulate to Round 13 (Second Half)
    for (let r = 1; r <= 12; r++) {
      sim.roundSM.advancePhase(); // BUY -> LIVE
      sim['endRound']('alpha', 'Attackers eliminated');
      sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
      sim.roundSM.advancePhase(); // REWARDS -> BUY
      sim['resetRoundState']();
    }

    assert.equal(sim.roundSM.getRoundNumber(), 13);

    // In Round 13 (Second Half):
    // Alpha (now Defenders) spawns at omegaSpawns
    // Omega (now Attackers) spawns at alphaSpawns
    const distAlphaToOmegaSpawn = Math.hypot(pAlphaR1.position[0] - omegaSpawns[0].position[0], pAlphaR1.position[2] - omegaSpawns[0].position[2]);
    const distOmegaToAlphaSpawn = Math.hypot(pOmegaR1.position[0] - alphaSpawns[0].position[0], pOmegaR1.position[2] - alphaSpawns[0].position[2]);

    assert.ok(distAlphaToOmegaSpawn < 3.0, 'In Round 13, Alpha (Defenders) must spawn at defender spawn');
    assert.ok(distOmegaToAlphaSpawn < 3.0, 'In Round 13, Omega (Attackers) must spawn at attacker spawn');

    sim.stopSimulation();
  });

  it('should enforce role-based bomb planting & defusing in Second Half (Omega plants, Alpha defuses)', () => {
    const sim = new GameSimulation('sim_halftime_bomb_01', 'COMPETITIVE', 'industrial_zone');
    sim.initPlayers([
      { id: 'p_alpha_1', username: 'AlphaDef', team: 'alpha', isBot: false },
      { id: 'p_omega_1', username: 'OmegaAtk', team: 'omega', isBot: false },
    ]);

    // Advance to Round 13
    for (let r = 1; r <= 12; r++) {
      sim.roundSM.advancePhase(); // BUY -> LIVE
      sim['endRound']('alpha', 'Attackers eliminated');
      sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
      sim.roundSM.advancePhase(); // REWARDS -> BUY
      sim['resetRoundState']();
    }

    assert.equal(sim.roundSM.getRoundNumber(), 13);
    sim.roundSM.advancePhase(); // BUY -> LIVE

    const pAlpha = sim.players.get('p_alpha_1');
    const pOmega = sim.players.get('p_omega_1');
    assert.ok(pAlpha && pOmega);

    // Position players at bombsite_a
    const siteA = sim.mapDefinition.objectives[0];
    pAlpha.position = [siteA.position[0], siteA.position[1], siteA.position[2]];
    pOmega.position = [siteA.position[0], siteA.position[1], siteA.position[2]];

    // 1. Alpha (now Defenders) CANNOT plant in second half
    const alphaPlant = sim.handlePlantBomb('p_alpha_1', 'bombsite_a');
    assert.equal(alphaPlant, false, 'Alpha (Defenders) must NOT be allowed to plant bomb in second half');
    assert.equal(sim.bombState.isPlanted, false);

    // 2. Omega (now Attackers) CAN plant in second half
    const omegaPlant = sim.handlePlantBomb('p_omega_1', 'bombsite_a');
    assert.equal(omegaPlant, true, 'Omega (Attackers) MUST be allowed to plant bomb in second half');
    assert.equal(sim.bombState.isPlanted, true);
    assert.equal(sim.bombState.plantedBy, 'p_omega_1');

    // 3. Omega (Attackers) CANNOT defuse their own bomb
    const omegaDefuse = sim.handleDefuseBomb('p_omega_1');
    assert.equal(omegaDefuse, false, 'Omega (Attackers) must NOT be allowed to defuse in second half');

    // 4. Alpha (Defenders) CAN defuse the bomb in second half
    const alphaDefuse = sim.handleDefuseBomb('p_alpha_1');
    assert.equal(alphaDefuse, true, 'Alpha (Defenders) MUST be allowed to defuse bomb in second half');
    assert.equal(sim.bombState.isDefused, true);

    // Round should be won by Alpha with reason 'Bomb defused'
    assert.deepEqual(sim.getLastRoundResult(), {
      winner: 'alpha',
      reason: 'Bomb defused',
    });

    sim.stopSimulation();
  });

  it('should correctly attribute Second Half elimination reasons and detonation victory', () => {
    const sim = new GameSimulation('sim_halftime_elim_01', 'COMPETITIVE', 'industrial_zone');
    sim.initPlayers([
      { id: 'p_alpha_1', username: 'AlphaDef', team: 'alpha', isBot: false },
      { id: 'p_omega_1', username: 'OmegaAtk', team: 'omega', isBot: false },
    ]);

    // Advance to Round 13
    for (let r = 1; r <= 12; r++) {
      sim.roundSM.advancePhase(); // BUY -> LIVE
      sim['endRound']('alpha', 'Attackers eliminated');
      sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
      sim.roundSM.advancePhase(); // REWARDS -> BUY
      sim['resetRoundState']();
    }

    assert.equal(sim.roundSM.getRoundNumber(), 13);
    sim.roundSM.advancePhase(); // BUY -> LIVE

    // In Round 13: Alpha is defenders, Omega is attackers
    // If Alpha (defenders) is eliminated, Omega (attackers) wins with 'Defenders eliminated'
    const pAlpha = sim.players.get('p_alpha_1');
    assert.ok(pAlpha);
    pAlpha.isAlive = false;
    pAlpha.health = 0;

    sim['oneSecondTick']();

    assert.deepEqual(sim.getLastRoundResult(), {
      winner: 'omega',
      reason: 'Defenders eliminated',
    });

    sim.stopSimulation();
  });

  it('should broadcast attackingTeam and authoritative telemetry in SNAPSHOT after side swap', (t, done) => {
    const sim = new GameSimulation('sim_halftime_snap_01', 'COMPETITIVE', 'industrial_zone');
    sim.initPlayers([
      { id: 'p_alpha_1', username: 'AlphaP', team: 'alpha', isBot: false },
      { id: 'p_omega_1', username: 'OmegaP', team: 'omega', isBot: false },
    ]);

    // Advance to Round 13
    for (let r = 1; r <= 12; r++) {
      sim.roundSM.advancePhase(); // BUY -> LIVE
      sim['endRound']('alpha', 'Attackers eliminated');
      sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
      sim.roundSM.advancePhase(); // REWARDS -> BUY
      sim['resetRoundState']();
    }

    assert.equal(sim.roundSM.getRoundNumber(), 13);

    sim.onStateBroadcast((snapshot) => {
      assert.equal(snapshot.round, 13);
      assert.equal(snapshot.attackingTeam, 'omega');
      assert.equal(snapshot.scores.alpha, 12);
      assert.equal(snapshot.scores.omega, 0);
      assert.equal(snapshot.lossStreaks.alpha, 0);
      assert.equal(snapshot.lossStreaks.omega, 0);
      sim.stopSimulation();
      done();
    });

    sim['broadcastState']();
  });
});
