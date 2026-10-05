/**
 * Vanguard Tactical Recoil & Spray Pattern Controller
 * Section 6 Implementation
 * CS-like authentic recoil spray curves, sequence indexing, and spread recovery
 */

export interface RecoilOffset {
  pitchUp: number;
  yawRight: number;
  spreadAngle: number;
}

export class RecoilController {
  // Recoil sequence table for Vanguard AR-4 (pitchUp, yawRight)
  private static readonly AR4_PATTERN: Array<[number, number]> = [
    [0.0, 0.0],
    [0.035, 0.002],
    [0.055, 0.004],
    [0.075, 0.008],
    [0.090, 0.015],
    [0.100, 0.025], // Pull right
    [0.105, 0.032],
    [0.102, 0.020],
    [0.098, -0.010], // Sweep left
    [0.095, -0.028],
    [0.094, -0.032],
    [0.095, -0.015],
    [0.096, 0.015], // S-curve return
    [0.095, 0.022],
  ];

  private static readonly VECTOR9_PATTERN: Array<[number, number]> = [
    [0.0, 0.0],
    [0.025, 0.005],
    [0.045, 0.010],
    [0.060, 0.018],
    [0.072, 0.024],
    [0.075, -0.012],
    [0.076, -0.025],
    [0.074, 0.015],
  ];

  // Tracking per player: { sequenceIndex, lastShotTimestamp }
  private playerRecoilState: Map<string, { sequenceIndex: number; lastShotTimestamp: number }> = new Map();

  /**
   * Calculate recoil pitch & yaw for next shot in spray sequence
   */
  public getNextShotRecoil(
    playerId: string,
    weaponId: string,
    isMoving: boolean = false,
    isCrouching: boolean = false,
    now: number = Date.now()
  ): RecoilOffset {
    let state = this.playerRecoilState.get(playerId);
    if (!state) {
      state = { sequenceIndex: 0, lastShotTimestamp: 0 };
      this.playerRecoilState.set(playerId, state);
    }

    // Recoil recovery: if paused shooting for > 350ms, reset spray sequence
    if (now - state.lastShotTimestamp > 350) {
      state.sequenceIndex = 0;
    }

    const pattern = weaponId === 'vanguard_smg' ? RecoilController.VECTOR9_PATTERN : RecoilController.AR4_PATTERN;
    const clampedIndex = Math.min(state.sequenceIndex, pattern.length - 1);
    const [pitchUp, yawRight] = pattern[clampedIndex];

    // Base spread
    let spreadAngle = 0.012;
    if (isMoving) spreadAngle *= 2.2;     // Running spread penalty
    if (isCrouching) spreadAngle *= 0.65; // Crouching accuracy bonus

    // Increment spray sequence and update timestamp
    state.sequenceIndex++;
    state.lastShotTimestamp = now;

    return {
      pitchUp,
      yawRight,
      spreadAngle,
    };
  }

  public getSpraySequenceIndex(playerId: string): number {
    return this.playerRecoilState.get(playerId)?.sequenceIndex ?? 0;
  }

  public resetPlayerRecoil(playerId: string) {
    this.playerRecoilState.delete(playerId);
  }
}
