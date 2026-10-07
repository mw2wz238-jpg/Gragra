/**
 * Project Vanguard - Strict Authoritative Application State Machine
 * Phase 1 Implementation
 */

import type { AppPhase, RoundPhase } from './types.ts';

export class AppStateMachine {
  private currentPhase: AppPhase = 'BOOT';
  private transitionHistory: Array<{ from: AppPhase; to: AppPhase; timestamp: number }> = [];

  // Legal transitions map
  private static readonly LEGAL_TRANSITIONS: Record<AppPhase, AppPhase[]> = {
    BOOT: ['SESSION'],
    SESSION: ['CONTENT_CHECK'],
    CONTENT_CHECK: ['LOBBY', 'MAP_DOWNLOAD'],
    LOBBY: ['MATCHMAKING', 'CONTENT_CHECK'],
    MATCHMAKING: ['LOBBY', 'MATCH_FOUND'], // LOBBY on cancel
    MATCH_FOUND: ['MAP_DOWNLOAD', 'LOADING_GAME', 'IN_GAME', 'LOBBY'], // LOBBY on connection error
    MAP_DOWNLOAD: ['LOADING_GAME', 'LOBBY', 'CONTENT_CHECK'],
    LOADING_GAME: ['IN_GAME', 'LOBBY'],
    IN_GAME: ['MATCH_END', 'LOBBY'], // Emergency abort allowed to LOBBY
    MATCH_END: ['REWARDS'],
    REWARDS: ['LOBBY'],
  };

  constructor(initialPhase: AppPhase = 'BOOT') {
    this.currentPhase = initialPhase;
  }

  public getPhase(): AppPhase {
    return this.currentPhase;
  }

  public canTransitionTo(nextPhase: AppPhase): boolean {
    const allowed = AppStateMachine.LEGAL_TRANSITIONS[this.currentPhase];
    return allowed ? allowed.includes(nextPhase) : false;
  }

  public transitionTo(nextPhase: AppPhase): boolean {
    if (!this.canTransitionTo(nextPhase)) {
      console.warn(`[Vanguard StateMachine] Illegal transition rejected: ${this.currentPhase} -> ${nextPhase}`);
      return false;
    }

    const previous = this.currentPhase;
    this.currentPhase = nextPhase;
    this.transitionHistory.push({
      from: previous,
      to: nextPhase,
      timestamp: Date.now(),
    });

    return true;
  }

  public getHistory() {
    return [...this.transitionHistory];
  }
}

/**
 * Server-Authoritative Round State Machine
 */
export class RoundStateMachine {
  private currentPhase: RoundPhase = 'BUY';
  private roundNumber: number = 1;
  private maxRounds: number = 24; // Competitive standard
  private targetWins: number = 13;
  private teamAlphaScore: number = 0;
  private teamOmegaScore: number = 0;
  private history: Array<{ round: number; phase: RoundPhase; timestamp: number }> = [];

  constructor(maxRounds = 24, targetWins = 13) {
    this.maxRounds = maxRounds;
    this.targetWins = targetWins;
  }

  public getPhase(): RoundPhase {
    return this.currentPhase;
  }

  public getRoundNumber(): number {
    return this.roundNumber;
  }

  public getScores() {
    return { alpha: this.teamAlphaScore, omega: this.teamOmegaScore };
  }

  public getMaxRounds(): number {
    return this.maxRounds;
  }

  public getTargetWins(): number {
    return this.targetWins;
  }

  public getHalftimeRound(): number {
    return Math.floor(this.maxRounds / 2);
  }

  public isSecondHalf(): boolean {
    return this.roundNumber > Math.floor(this.maxRounds / 2);
  }

  public isHalftimeRound(): boolean {
    return this.roundNumber === Math.floor(this.maxRounds / 2) + 1;
  }

  public isMatchOver(): boolean {
    return (
      this.teamAlphaScore >= this.targetWins ||
      this.teamOmegaScore >= this.targetWins ||
      (this.teamAlphaScore + this.teamOmegaScore) >= this.maxRounds ||
      this.roundNumber > this.maxRounds
    );
  }

  public getWinner(): 'alpha' | 'omega' | 'draw' | null {
    if (!this.isMatchOver()) return null;
    if (this.teamAlphaScore > this.teamOmegaScore) return 'alpha';
    if (this.teamOmegaScore > this.teamAlphaScore) return 'omega';
    return 'draw';
  }

  public canShoot(): boolean {
    return this.currentPhase === 'LIVE';
  }

  public canBuy(): boolean {
    return this.currentPhase === 'BUY';
  }

  public advancePhase(winner?: 'alpha' | 'omega'): { phase: RoundPhase; matchOver: boolean } {
    switch (this.currentPhase) {
      case 'BUY':
        this.currentPhase = 'LIVE';
        break;

      case 'LIVE':
        if (winner === 'alpha') this.teamAlphaScore++;
        if (winner === 'omega') this.teamOmegaScore++;
        this.currentPhase = 'ROUND_END';
        break;

      case 'ROUND_END':
        this.currentPhase = 'REWARDS';
        break;

      case 'REWARDS':
        if (this.isMatchOver()) {
          this.currentPhase = 'MATCH_END';
        } else {
          this.roundNumber++;
          this.currentPhase = 'BUY';
        }
        break;

      case 'MATCH_END':
        // Terminal state
        break;
    }

    this.history.push({
      round: this.roundNumber,
      phase: this.currentPhase,
      timestamp: Date.now(),
    });

    return { phase: this.currentPhase, matchOver: this.isMatchOver() };
  }
}
