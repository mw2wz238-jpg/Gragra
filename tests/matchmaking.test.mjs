import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MatchmakingEngine } from '../src/server/matchmaking.ts';

describe('Vanguard Server Matchmaking Engine (Phases 27, 28, 29 & 30)', () => {
  it('should enqueue a player and generate a unique ticket', () => {
    const mm = new MatchmakingEngine();
    const ticket = mm.enqueue('p1', 'party1', 'TestSoldier', 'COMPETITIVE', 1250);

    assert.ok(ticket.ticketId);
    assert.equal(ticket.playerId, 'p1');
    assert.equal(ticket.mode, 'COMPETITIVE');

    const status = mm.getQueueStatus('p1');
    assert.equal(status.inQueue, true);
    assert.equal(status.ticket?.ticketId, ticket.ticketId);
    assert.equal(status.match, undefined);

    mm.stopMatchmakingLoop();
  });

  it('should prevent duplicate queue entries for the same player', () => {
    const mm = new MatchmakingEngine();
    const ticket1 = mm.enqueue('p1', 'party1', 'TestSoldier', 'COMPETITIVE', 1250);
    const ticket2 = mm.enqueue('p1', 'party1', 'TestSoldier', 'COMPETITIVE', 1250);

    assert.equal(ticket1.ticketId, ticket2.ticketId);
    assert.equal(mm.getQueueStatus('p1').playersInQueue, 1);

    mm.stopMatchmakingLoop();
  });

  it('should dequeue players safely upon cancellation', () => {
    const mm = new MatchmakingEngine();
    mm.enqueue('p1', 'party1', 'TestSoldier', 'COMPETITIVE', 1250);
    assert.equal(mm.getQueueStatus('p1').inQueue, true);

    const dequeued = mm.dequeue('p1');
    assert.equal(dequeued, true);
    assert.equal(mm.getQueueStatus('p1').inQueue, false);

    mm.stopMatchmakingLoop();
  });

  it('should return server-authoritative match details once match is evaluated', () => {
    const mm = new MatchmakingEngine();
    
    // Enqueue player
    const ticket = mm.enqueue('p_auth_01', 'party_solo', 'VanguardLeader', 'COMPETITIVE', 1284);
    
    // Verify status before match evaluation
    const statusBefore = mm.getQueueStatus('p_auth_01');
    assert.equal(statusBefore.inQueue, true);
    assert.equal(statusBefore.match, undefined);

    // Force match creation directly to simulate evaluation
    mm.createMatch('COMPETITIVE', [ticket]);

    // Verify status after match evaluation
    const statusAfter = mm.getQueueStatus('p_auth_01');
    assert.equal(statusAfter.inQueue, false);
    assert.ok(statusAfter.match);
    assert.ok(statusAfter.match.matchId);
    assert.equal(statusAfter.match.mapId, 'industrial_zone');
    assert.equal(statusAfter.match.mode, 'COMPETITIVE');
    
    // Dynamic team resolution
    assert.equal(statusAfter.match.assignedTeam, 'alpha');

    mm.stopMatchmakingLoop();
  });

  it('should dynamically assign team depending on team distribution', () => {
    const mm = new MatchmakingEngine();
    const t1 = mm.enqueue('p_alpha', 'party1', 'ATK_Spec', 'COMPETITIVE', 1200);
    const t2 = mm.enqueue('p_omega', 'party2', 'DEF_Spec', 'COMPETITIVE', 1200);

    mm.createMatch('COMPETITIVE', [t1, t2]);

    const s1 = mm.getQueueStatus('p_alpha');
    const s2 = mm.getQueueStatus('p_omega');

    assert.equal(s1.match?.assignedTeam, 'alpha');
    assert.equal(s2.match?.assignedTeam, 'omega');

    mm.stopMatchmakingLoop();
  });
});
