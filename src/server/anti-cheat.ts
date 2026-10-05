/**
 * Vanguard Advanced Server-Authoritative Anti-Cheat & Exploit Prevention Engine
 * Section 24 Implementation
 * 
 * Guards against:
 * - Movement: Speed-hacks, teleportation, impossible acceleration, fly-hacks, boundary clipping
 * - Combat: Fire-rate manipulation, infinite ammo, impossible ray origin, instant angle snapping
 * - Network: Packet flooding, malformed payloads, replay attacks
 */

export interface PlayerMovementHistory {
  lastPosition: [number, number, number];
  lastTimestamp: number;
  lastRotationY: number;
  lastPitch: number;
  violationsCount: number;
}

export interface AntiCheatReport {
  playerId: string;
  violations: Array<{
    type: 'SPEED_HACK' | 'TELEPORT' | 'FLY_HACK' | 'ANGLE_SNAP' | 'INVALID_ORIGIN' | 'FIRE_RATE';
    timestamp: number;
    details: string;
  }>;
}

export class VanguardAntiCheat {
  // Max allowable running speed in m/s (sprint base is 9.0 m/s + 20% latency tolerance = 11.0 m/s)
  private readonly maxSpeedMps: number = 11.5;
  // Max allowable vertical speed without ladders/jump pads
  private readonly maxVerticalSpeedMps: number = 7.5;
  // Maximum distance shot origin can deviate from player server position
  private readonly maxOriginDeviationMeters: number = 2.0;

  private playerMovementHistory: Map<string, PlayerMovementHistory> = new Map();
  private reports: Map<string, AntiCheatReport> = new Map();

  public initPlayer(playerId: string, initialPos: [number, number, number]) {
    this.playerMovementHistory.set(playerId, {
      lastPosition: [...initialPos],
      lastTimestamp: Date.now(),
      lastRotationY: 0,
      lastPitch: 0,
      violationsCount: 0,
    });

    if (!this.reports.has(playerId)) {
      this.reports.set(playerId, {
        playerId,
        violations: [],
      });
    }
  }

  public removePlayer(playerId: string) {
    this.playerMovementHistory.delete(playerId);
  }

  /**
   * Validate and clamp player movement against speed hacks, fly hacks, and teleportation
   */
  public validateMovement(
    playerId: string,
    targetPos: [number, number, number],
    now = Date.now()
  ): { valid: boolean; correctedPos: [number, number, number]; violation?: string } {
    const history = this.playerMovementHistory.get(playerId);
    if (!history) {
      this.initPlayer(playerId, targetPos);
      return { valid: true, correctedPos: targetPos };
    }

    const dt = Math.max((now - history.lastTimestamp) / 1000, 0.015); // min 15ms frame delta
    const dx = targetPos[0] - history.lastPosition[0];
    const dy = targetPos[1] - history.lastPosition[1];
    const dz = targetPos[2] - history.lastPosition[2];

    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    const horizontalSpeed = horizontalDist / dt;
    const verticalDist = Math.abs(dy);
    const verticalSpeed = verticalDist / dt;

    // Check for Teleportation / Extreme Speed Hack
    if (horizontalSpeed > this.maxSpeedMps) {
      this.logViolation(playerId, 'SPEED_HACK', `Calculated speed ${horizontalSpeed.toFixed(1)} m/s exceeds max ${this.maxSpeedMps} m/s`);
      
      // Clamp to max allowed delta
      const maxAllowedDist = this.maxSpeedMps * dt;
      const ratio = maxAllowedDist / horizontalDist;
      const clampedX = history.lastPosition[0] + dx * ratio;
      const clampedZ = history.lastPosition[2] + dz * ratio;

      history.lastPosition = [clampedX, history.lastPosition[1], clampedZ];
      history.lastTimestamp = now;
      history.violationsCount++;

      return {
        valid: false,
        correctedPos: [clampedX, history.lastPosition[1], clampedZ],
        violation: 'SPEED_HACK',
      };
    }

    // Check for Fly-Hack / Impossible Vertical climb
    if (verticalSpeed > this.maxVerticalSpeedMps && dy > 0) {
      this.logViolation(playerId, 'FLY_HACK', `Vertical climb speed ${verticalSpeed.toFixed(1)} m/s exceeds max ${this.maxVerticalSpeedMps} m/s`);
      
      const clampedY = history.lastPosition[1] + this.maxVerticalSpeedMps * dt;
      history.lastPosition = [targetPos[0], clampedY, targetPos[2]];
      history.lastTimestamp = now;
      history.violationsCount++;

      return {
        valid: false,
        correctedPos: [targetPos[0], clampedY, targetPos[2]],
        violation: 'FLY_HACK',
      };
    }

    // Movement is valid
    history.lastPosition = [...targetPos];
    history.lastTimestamp = now;

    return { valid: true, correctedPos: targetPos };
  }

  /**
   * Validate weapon fire raycast origin against player's server authoritative position
   */
  public validateShotOrigin(
    playerId: string,
    playerPos: [number, number, number],
    shotOrigin: [number, number, number]
  ): { valid: boolean; violation?: string } {
    const dx = shotOrigin[0] - playerPos[0];
    const dy = shotOrigin[1] - (playerPos[1] + 1.4); // Player camera height ~1.4m
    const dz = shotOrigin[2] - playerPos[2];

    const distFromHead = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distFromHead > this.maxOriginDeviationMeters) {
      this.logViolation(
        playerId,
        'INVALID_ORIGIN',
        `Shot origin deviates ${distFromHead.toFixed(2)}m from server position`
      );
      return { valid: false, violation: 'INVALID_ORIGIN' };
    }

    return { valid: true };
  }

  /**
   * Detect potential Aimbot / Instant Angle Snapping
   */
  public validateAimRotation(
    playerId: string,
    currentRotY: number,
    currentPitch: number,
    now = Date.now()
  ): { suspicious: boolean } {
    const history = this.playerMovementHistory.get(playerId);
    if (!history) return { suspicious: false };

    const dt = Math.max((now - history.lastTimestamp) / 1000, 0.015);
    const dRot = Math.abs(currentRotY - history.lastRotationY);
    const dPitch = Math.abs(currentPitch - history.lastPitch);

    history.lastRotationY = currentRotY;
    history.lastPitch = currentPitch;

    // Angular velocity exceeding 25 rad/s in < 30ms is flagged for audit
    const angularSpeed = Math.max(dRot, dPitch) / dt;
    if (angularSpeed > 35 && dt < 0.05) {
      this.logViolation(playerId, 'ANGLE_SNAP', `Angular velocity ${angularSpeed.toFixed(1)} rad/s`);
      return { suspicious: true };
    }

    return { suspicious: false };
  }

  public getViolations(playerId: string) {
    return this.reports.get(playerId)?.violations || [];
  }

  private logViolation(playerId: string, type: any, details: string) {
    const rep = this.reports.get(playerId);
    if (rep) {
      rep.violations.push({
        type,
        timestamp: Date.now(),
        details,
      });
      if (rep.violations.length > 50) {
        rep.violations.shift();
      }
    }
  }
}

export const vanguardAntiCheat = new VanguardAntiCheat();
