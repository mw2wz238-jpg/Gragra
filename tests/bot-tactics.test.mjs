import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameSimulation } from '../src/server/game-simulation.ts';

describe('Vanguard 5v5 Bot Tactics & Economy Auto-Equipment (Phases 10, 14, 24)', () => {
  it('should auto-equip bots during BUY phase round reset based on available cash', () => {
    const sim = new GameSimulation('sim_bot_eco_01', 'COMPETITIVE', 'industrial_zone');
    sim.initPlayers([
      { id: 'player_human', username: 'HumanCmd', team: 'alpha', isBot: false },
      { id: 'bot_alpha_1', username: 'Vanguard-Ghost', team: 'alpha', isBot: true },
    ]);

    // Give bot $3500
    const bot = sim.players.get('bot_alpha_1');
    assert.ok(bot);
    sim.economy.addCash(bot.id, 2700, 'TEST_BONUS'); // 800 + 2700 = 3500
    assert.equal(sim.economy.getBalance(bot.id), 3500);

    // Advance to LIVE then simulate round end & reset to BUY
    sim.roundSM.advancePhase(); // BUY -> LIVE
    sim.roundSM.advancePhase('alpha'); // LIVE -> ROUND_END
    sim.roundSM.advancePhase(); // ROUND_END -> REWARDS
    sim.roundSM.advancePhase(); // REWARDS -> BUY
    sim['resetRoundState']();

    // Bot should have auto-purchased rifle and armor
    assert.equal(bot.equippedWeaponId, 'vanguard_rifle');
    assert.equal(bot.armor, 100);
    assert.ok(bot.cash < 3500, 'Bot should have spent cash on loadout');

    sim.stopSimulation();
  });

  it('should trigger bomb defusal when Omega defender bot reaches planted bomb', () => {
    const sim = new GameSimulation('sim_bot_defuse_01', 'COMPETITIVE', 'industrial_zone');
    sim.initPlayers([
      { id: 'bot_omega_1', username: 'Apex-Shadow', team: 'omega', isBot: true },
    ]);

    sim.roundSM.advancePhase(); // BUY -> LIVE

    const plantPos = [20, 0.5, 18];
    sim.bombState = {
      isPlanted: true,
      plantedAt: Date.now(),
      site: 'bombsite_a',
      position: plantPos,
      isDefused: false,
      isExploded: false,
      plantedBy: 'attacker_dummy',
    };

    const defenderBot = sim.players.get('bot_omega_1');
    assert.ok(defenderBot);
    // Position bot close to bomb
    defenderBot.position = [20.5, 0.5, 18.2];

    // Tick simulation step
    sim['stepBots']();

    assert.equal(sim.bombState.isDefused, true, 'Defender bot must defuse the planted bomb');
    assert.equal(sim.bombState.defusedBy, defenderBot.id);

    sim.stopSimulation();
  });
});
