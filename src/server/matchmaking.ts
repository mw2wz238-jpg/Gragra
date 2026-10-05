/**
 * Vanguard Server-Authoritative Matchmaking Engine
 * Phases 27, 28, 29 & 30
 */

import { getMapDefinition } from '../maps/index.ts';
import type { GameMode, MatchmakingQueueTicket, MatchSessionInfo } from '../shared/types.ts';

export class MatchmakingEngine {
  private queue: Map<string, MatchmakingQueueTicket> = new Map();
  private activeMatches: Map<string, MatchSessionInfo> = new Map();
  private matchIdCounter = 1000;
  private intervalTimer: NodeJS.Timeout | null = null;
  private onMatchFoundListeners: Array<(match: MatchSessionInfo) => void> = [];

  constructor() {
    this.startMatchmakingLoop();
  }

  public startMatchmakingLoop() {
    if (this.intervalTimer) return;
    this.intervalTimer = setInterval(() => {
      this.evaluateQueues();
    }, 1000);
  }

  public stopMatchmakingLoop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  public onMatchFound(cb: (match: MatchSessionInfo) => void) {
    this.onMatchFoundListeners.push(cb);
  }

  public enqueue(
    playerId: string,
    partyId: string,
    username: string,
    mode: GameMode,
    rating: number,
    region = 'EU',
    preferredMapId?: string
  ): MatchmakingQueueTicket {
    // If player already in queue, return existing ticket
    for (const ticket of this.queue.values()) {
      if (ticket.playerId === playerId) {
        return ticket;
      }
    }

    const ticket: MatchmakingQueueTicket = {
      ticketId: `ticket_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      playerId,
      partyId,
      username,
      mode,
      rating,
      queuedAt: Date.now(),
      region,
      preferredMapId,
    };

    this.queue.set(ticket.ticketId, ticket);
    return ticket;
  }

  public dequeue(ticketIdOrPlayerId: string): boolean {
    for (const [id, ticket] of this.queue.entries()) {
      if (id === ticketIdOrPlayerId || ticket.playerId === ticketIdOrPlayerId) {
        this.queue.delete(id);
        return true;
      }
    }
    return false;
  }

  public getQueueStatus(playerId: string): { inQueue: boolean; ticket?: MatchmakingQueueTicket; playersInQueue: number } {
    let userTicket: MatchmakingQueueTicket | undefined;
    for (const ticket of this.queue.values()) {
      if (ticket.playerId === playerId) {
        userTicket = ticket;
        break;
      }
    }

    return {
      inQueue: !!userTicket,
      ticket: userTicket,
      playersInQueue: this.queue.size,
    };
  }

  public getMatch(matchId: string): MatchSessionInfo | undefined {
    return this.activeMatches.get(matchId);
  }

  private evaluateQueues() {
    const modes: GameMode[] = ['COMPETITIVE', 'CASUAL', 'TDM', 'DEATHMATCH'];

    for (const mode of modes) {
      const modeTickets = Array.from(this.queue.values()).filter(t => t.mode === mode);
      if (modeTickets.length === 0) continue;

      // In real server, 5v5 needs 10 players; for quick prototyping or solo testing,
      // if 1 human player is waiting for > 3 seconds, match them with simulated tactical bot combatants
      // so the complete round loop can be fully played and tested!
      const requiredPlayers = mode === 'DEATHMATCH' ? 8 : 10;
      const now = Date.now();

      // Check if we have enough human players, or human player waiting >= 3 seconds
      const eligibleTickets = [...modeTickets];
      if (eligibleTickets.length >= 1) {
        const oldestTicket = eligibleTickets[0];
        const waitTimeMs = now - oldestTicket.queuedAt;

        if (eligibleTickets.length >= requiredPlayers || waitTimeMs >= 3000) {
          this.createMatch(mode, eligibleTickets.slice(0, requiredPlayers));
        }
      }
    }
  }

  private createMatch(mode: GameMode, humanTickets: MatchmakingQueueTicket[]) {
    // Remove tickets from queue
    for (const t of humanTickets) {
      this.queue.delete(t.ticketId);
    }

    this.matchIdCounter++;
    const matchId = `match_vg_${this.matchIdCounter}`;

    // Fill teams to 5v5 (or 8 for DM)
    const alphaPlayers: Array<{ id: string; username: string; rating: number }> = [];
    const omegaPlayers: Array<{ id: string; username: string; rating: number }> = [];

    // Distribute human players
    humanTickets.forEach((ticket, idx) => {
      const p = { id: ticket.playerId, username: ticket.username, rating: ticket.rating };
      if (idx % 2 === 0) {
        alphaPlayers.push(p);
      } else {
        omegaPlayers.push(p);
      }
    });

    // Fill bots if needed for full 5v5 tactical match
    const botNamesAlpha = ['Vanguard-Ghost', 'Vanguard-Viper', 'Vanguard-Titan', 'Vanguard-Echo'];
    const botNamesOmega = ['Apex-Shadow', 'Apex-Raven', 'Apex-Kodiak', 'Apex-Spectre', 'Apex-Frost'];

    while (alphaPlayers.length < 5) {
      const name = botNamesAlpha[alphaPlayers.length - 1] || `Vanguard-Unit-${alphaPlayers.length + 1}`;
      alphaPlayers.push({
        id: `bot_alpha_${alphaPlayers.length + 1}`,
        username: name,
        rating: 1200 + Math.floor(Math.random() * 80 - 40),
      });
    }

    while (omegaPlayers.length < 5) {
      const name = botNamesOmega[omegaPlayers.length] || `Apex-Unit-${omegaPlayers.length + 1}`;
      omegaPlayers.push({
        id: `bot_omega_${omegaPlayers.length + 1}`,
        username: name,
        rating: 1200 + Math.floor(Math.random() * 80 - 40),
      });
    }

    const chosenMapId = humanTickets[0]?.preferredMapId || 'industrial_zone';
    const mapDef = getMapDefinition(chosenMapId);

    const matchSession: MatchSessionInfo = {
      matchId,
      mode,
      mapId: mapDef.id,
      mapName: mapDef.name,
      teams: {
        alpha: { id: 'team_alpha', name: 'Taskforce Alpha (ATK)', players: alphaPlayers },
        omega: { id: 'team_omega', name: 'Apex Security (DEF)', players: omegaPlayers },
      },
      assignedTeam: 'alpha', // The primary client is on Alpha
      serverUrl: 'ws://localhost:3000/ws/game',
      maxRounds: mode === 'COMPETITIVE' ? 24 : 10,
      roundTimeToLiveSec: 105,
    };

    this.activeMatches.set(matchId, matchSession);

    // Notify listeners
    for (const listener of this.onMatchFoundListeners) {
      listener(matchSession);
    }
  }
}
