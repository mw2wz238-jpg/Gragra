/**
 * Vanguard Server-Authoritative Grenade & Tactical Smoke Engine
 * Section 7 Implementation
 * Trajectory simulation, bounce physics, HE damage falloff, and Smoke Line-of-Sight blocking
 */

import type { ActiveGrenade, ActiveSmokeZone, GrenadeType } from '../shared/types.ts';
import { VANGUARD_GRENADES } from '../shared/types.ts';

export class GrenadeManager {
  public activeGrenades: Map<string, ActiveGrenade> = new Map();
  public activeSmokes: Map<string, ActiveSmokeZone> = new Map();
  private grenadeIdCounter = 100;

  /**
   * Authoritative grenade launch
   */
  public throwGrenade(
    thrownBy: string,
    type: GrenadeType,
    origin: [number, number, number],
    direction: [number, number, number],
    throwForce = 18.0
  ): ActiveGrenade {
    this.grenadeIdCounter++;
    const id = `grenade_${this.grenadeIdCounter}_${Date.now()}`;
    const def = VANGUARD_GRENADES[type];

    // Normalize direction and add slight upward trajectory arc
    const len = Math.hypot(direction[0], direction[1], direction[2]) || 1;
    const nx = direction[0] / len;
    const ny = direction[1] / len + 0.15; // upward arc
    const nz = direction[2] / len;

    const velocity: [number, number, number] = [
      nx * throwForce,
      ny * throwForce,
      nz * throwForce,
    ];

    const grenade: ActiveGrenade = {
      id,
      type,
      position: [origin[0], origin[1], origin[2]],
      velocity,
      thrownBy,
      thrownAt: Date.now(),
      detonateAt: Date.now() + def.fuseTimeSec * 1000,
    };

    this.activeGrenades.set(id, grenade);
    return grenade;
  }

  /**
   * Physics simulation step
   */
  public updatePhysics(
    deltaSec: number,
    onExplosion: (grenade: ActiveGrenade, details: { damageEvents: Array<{ targetId: string; damage: number }>; smokeSpawned?: ActiveSmokeZone }) => void,
    players: Array<{ id: string; position: [number, number, number]; isAlive: boolean }>
  ) {
    const now = Date.now();

    // 1. Step Grenade Trajectories
    for (const [id, g] of this.activeGrenades.entries()) {
      // Apply displacement
      g.position[0] += g.velocity[0] * deltaSec;
      g.position[1] += g.velocity[1] * deltaSec;
      g.position[2] += g.velocity[2] * deltaSec;

      // Apply Gravity
      g.velocity[1] -= 14.0 * deltaSec;

      // Ground bounce collision (y <= 0.2)
      if (g.position[1] <= 0.2) {
        g.position[1] = 0.2;
        g.velocity[1] = -g.velocity[1] * 0.45; // restitution
        g.velocity[0] *= 0.65; // ground friction
        g.velocity[2] *= 0.65;
      }

      // Check detonation fuse
      if (now >= g.detonateAt) {
        this.activeGrenades.delete(id);
        const details = this.detonateGrenade(g, players);
        onExplosion(g, details);
      }
    }

    // 2. Expire old Smoke zones (18 sec duration)
    for (const [id, smoke] of this.activeSmokes.entries()) {
      if (now >= smoke.expiresAt) {
        this.activeSmokes.delete(id);
      }
    }
  }

  private detonateGrenade(
    g: ActiveGrenade,
    players: Array<{ id: string; position: [number, number, number]; isAlive: boolean }>
  ): { damageEvents: Array<{ targetId: string; damage: number }>; smokeSpawned?: ActiveSmokeZone } {
    const def = VANGUARD_GRENADES[g.type];
    const damageEvents: Array<{ targetId: string; damage: number }> = [];

    if (g.type === 'HE') {
      for (const p of players) {
        if (!p.isAlive) continue;
        const dx = p.position[0] - g.position[0];
        const dy = p.position[1] - g.position[1];
        const dz = p.position[2] - g.position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist <= def.radiusMeters) {
          // Distance falloff: 100% damage at epicenter, scaling to 15% at edge
          const falloff = 1.0 - (dist / def.radiusMeters) * 0.85;
          const damage = Math.round(def.maxDamage * falloff);
          damageEvents.push({ targetId: p.id, damage });
        }
      }
      return { damageEvents };
    }

    if (g.type === 'SMOKE') {
      const smokeId = `smoke_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const smoke: ActiveSmokeZone = {
        id: smokeId,
        position: [g.position[0], Math.max(0.3, g.position[1]), g.position[2]],
        radius: def.radiusMeters,
        createdAt: Date.now(),
        expiresAt: Date.now() + def.effectDurationSec * 1000,
      };
      this.activeSmokes.set(smokeId, smoke);
      return { damageEvents: [], smokeSpawned: smoke };
    }

    if (g.type === 'FLASH') {
      // Flashbang affects combatants within flash radius
      return { damageEvents: [] };
    }

    return { damageEvents: [] };
  }

  /**
   * CRITICAL REQUIREMENT: Line-of-Sight blocking by smoke
   * Tests if line segment between p1 and p2 intersects any active smoke cloud sphere
   */
  public isLineOfSightBlockedBySmoke(
    p1: [number, number, number],
    p2: [number, number, number]
  ): boolean {
    if (this.activeSmokes.size === 0) return false;

    for (const smoke of this.activeSmokes.values()) {
      const isBlocked = this.segmentIntersectsSphere(p1, p2, smoke.position, smoke.radius);
      if (isBlocked) {
        return true;
      }
    }
    return false;
  }

  /**
   * 3D Geometry: Segment-to-Sphere intersection test
   */
  private segmentIntersectsSphere(
    p1: [number, number, number],
    p2: [number, number, number],
    center: [number, number, number],
    radius: number
  ): boolean {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dz = p2[2] - p1[2];
    const segLengthSq = dx * dx + dy * dy + dz * dz;

    if (segLengthSq === 0) {
      const distSq = (p1[0] - center[0]) ** 2 + (p1[1] - center[1]) ** 2 + (p1[2] - center[2]) ** 2;
      return distSq <= radius * radius;
    }

    // Projection parameter t of sphere center onto line segment [0, 1]
    const cx = center[0] - p1[0];
    const cy = center[1] - p1[1];
    const cz = center[2] - p1[2];

    const t = Math.max(0, Math.min(1, (cx * dx + cy * dy + cz * dz) / segLengthSq));

    // Closest point on segment
    const closeX = p1[0] + t * dx;
    const closeY = p1[1] + t * dy;
    const closeZ = p1[2] + t * dz;

    // Distance from closest point to sphere center
    const distSq = (closeX - center[0]) ** 2 + (closeY - center[1]) ** 2 + (closeZ - center[2]) ** 2;
    return distSq <= radius * radius;
  }
}
