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
});
