/**
 * Vanguard Server-Authoritative Hitboxes & Lag Compensation Engine
 * Section 6 Implementation
 * Segmented Hitboxes (Head, Chest, Stomach, Legs) & History Rewind Buffer (max 200ms)
 */

export type HitboxZone = 'HEAD' | 'CHEST' | 'STOMACH' | 'LEGS';

export interface PlayerHitboxSnapshot {
  timestamp: number;
  position: [number, number, number];
  rotationY: number;
  pitch: number;
}

export interface HitboxDefinition {
  zone: HitboxZone;
  damageMultiplier: number;
  offsetY: number;
  height: number;
  radius: number; // For cylindrical/capsule or spherical bounds
}

export const VANGUARD_HITBOX_PARTS: HitboxDefinition[] = [
  { zone: 'HEAD', damageMultiplier: 4.0, offsetY: 1.62, height: 0.28, radius: 0.16 },
  { zone: 'CHEST', damageMultiplier: 1.0, offsetY: 1.28, height: 0.38, radius: 0.26 },
  { zone: 'STOMACH', damageMultiplier: 1.25, offsetY: 0.95, height: 0.28, radius: 0.24 },
  { zone: 'LEGS', damageMultiplier: 0.75, offsetY: 0.45, height: 0.85, radius: 0.22 },
];

export interface RaycastHitResult {
  hit: boolean;
  targetId?: string;
  zone?: HitboxZone;
  multiplier?: number;
  distance?: number;
  exactHitPoint?: [number, number, number];
}

export class LagCompensationBuffer {
  // Max rewind limit in milliseconds - CRITICAL RULE: ~200ms
  public static readonly MAX_REWIND_MS = 200;
  private static readonly MAX_BUFFER_DURATION_MS = 300;

  // History buffer per player
  private history: Map<string, PlayerHitboxSnapshot[]> = new Map();

  /**
   * Record player state into history buffer at current server tick
   */
  public recordSnapshot(
    playerId: string,
    position: [number, number, number],
    rotationY: number,
    pitch: number,
    timestamp: number = Date.now()
  ) {
    let list = this.history.get(playerId);
    if (!list) {
      list = [];
      this.history.set(playerId, list);
    }

    list.push({
      timestamp,
      position: [position[0], position[1], position[2]],
      rotationY,
      pitch,
    });

    // Prune entries older than MAX_BUFFER_DURATION_MS
    const minTimestamp = timestamp - LagCompensationBuffer.MAX_BUFFER_DURATION_MS;
    while (list.length > 0 && list[0].timestamp < minTimestamp) {
      list.shift();
    }
  }

  /**
   * Interpolate historical position of a player at a specific timestamp
   * Clamped strictly to MAX_REWIND_MS
   */
  public getRewoundPosition(
    playerId: string,
    requestedTimestamp: number,
    currentServerTime: number = Date.now()
  ): { position: [number, number, number]; rotationY: number; clampedTimestamp: number } | null {
    const list = this.history.get(playerId);
    if (!list || list.length === 0) return null;

    // Strict security clamp: cannot rewind more than MAX_REWIND_MS into the past
    const earliestAllowed = currentServerTime - LagCompensationBuffer.MAX_REWIND_MS;
    const clampedTimestamp = Math.max(requestedTimestamp, earliestAllowed);

    // If requested time is after latest snapshot, return latest
    const latest = list[list.length - 1];
    if (clampedTimestamp >= latest.timestamp) {
      return {
        position: [...latest.position],
        rotationY: latest.rotationY,
        clampedTimestamp,
      };
    }

    // If before earliest stored snapshot, return earliest
    const earliest = list[0];
    if (clampedTimestamp <= earliest.timestamp) {
      return {
        position: [...earliest.position],
        rotationY: earliest.rotationY,
        clampedTimestamp,
      };
    }

    // Find bounding frames for linear interpolation
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];

      if (clampedTimestamp >= a.timestamp && clampedTimestamp <= b.timestamp) {
        const span = b.timestamp - a.timestamp;
        const alpha = span > 0 ? (clampedTimestamp - a.timestamp) / span : 0;

        const posX = a.position[0] + (b.position[0] - a.position[0]) * alpha;
        const posY = a.position[1] + (b.position[1] - a.position[1]) * alpha;
        const posZ = a.position[2] + (b.position[2] - a.position[2]) * alpha;
        const rotY = a.rotationY + (b.rotationY - a.rotationY) * alpha;

        return {
          position: [posX, posY, posZ],
          rotationY: rotY,
          clampedTimestamp,
        };
      }
    }

    return {
      position: [...latest.position],
      rotationY: latest.rotationY,
      clampedTimestamp,
    };
  }

  /**
   * Raycast intersection test against segmented hitboxes
   */
  public static testRayAgainstHitboxes(
    rayOrigin: [number, number, number],
    rayDirection: [number, number, number],
    playerPos: [number, number, number],
    maxRange: number = 70
  ): { hit: boolean; zone?: HitboxZone; multiplier?: number; distance?: number } {
    const dirLen = Math.hypot(rayDirection[0], rayDirection[1], rayDirection[2]) || 1;
    const normDir: [number, number, number] = [
      rayDirection[0] / dirLen,
      rayDirection[1] / dirLen,
      rayDirection[2] / dirLen,
    ];

    let bestHit: { zone: HitboxZone; multiplier: number; distance: number } | null = null;

    for (const part of VANGUARD_HITBOX_PARTS) {
      // Calculate hitbox center in world space
      const partCenter: [number, number, number] = [
        playerPos[0],
        playerPos[1] + part.offsetY,
        playerPos[2],
      ];

      // Ray to sphere/cylinder test
      const dx = partCenter[0] - rayOrigin[0];
      const dy = partCenter[1] - rayOrigin[1];
      const dz = partCenter[2] - rayOrigin[2];

      // Projection of vector from ray origin to part center onto ray direction
      const proj = dx * normDir[0] + dy * normDir[1] + dz * normDir[2];
      if (proj < 0 || proj > maxRange) continue;

      // Closest point on ray to hitbox center
      const closeX = rayOrigin[0] + normDir[0] * proj;
      const closeY = rayOrigin[1] + normDir[1] * proj;
      const closeZ = rayOrigin[2] + normDir[2] * proj;

      const distSq =
        (closeX - partCenter[0]) ** 2 +
        (closeY - partCenter[1]) ** 2 +
        (closeZ - partCenter[2]) ** 2;

      // Check radius tolerance
      if (distSq <= part.radius * part.radius) {
        const hitDistance = Math.hypot(closeX - rayOrigin[0], closeY - rayOrigin[1], closeZ - rayOrigin[2]);

        // Specific priority check (HEAD > CHEST > STOMACH > LEGS)
        if (!bestHit || hitDistance < bestHit.distance || (part.zone === 'HEAD' && bestHit.zone !== 'HEAD')) {
          bestHit = {
            zone: part.zone,
            multiplier: part.damageMultiplier,
            distance: hitDistance,
          };
        }
      }
    }

    if (bestHit) {
      return {
        hit: true,
        zone: bestHit.zone,
        multiplier: bestHit.multiplier,
        distance: bestHit.distance,
      };
    }

    return { hit: false };
  }

  public clear() {
    this.history.clear();
  }
}
