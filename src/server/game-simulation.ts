/**
 * Vanguard Server-Authoritative Game Simulation
 * Phases 10, 11, 13, 14, 15, 16, 17, 33 & Complete Round Loop
 * Integrated Economy, Grenades, Smoke LoS, Dropped Weapons, and Spectator System
 */

import { RoundStateMachine } from '../shared/state-machine.ts';
import type { DroppedWeaponEntity, GameMode, GrenadeType, RoundPhase } from '../shared/types.ts';
import { VANGUARD_WEAPONS } from '../shared/types.ts';
import { VanguardEconomy } from './economy.ts';
import { GrenadeManager } from './grenades.ts';
import type { HitboxZone } from './lag-compensation.ts';
import { LagCompensationBuffer } from './lag-compensation.ts';
import { RecoilController } from './recoil.ts';

export interface SimPlayer {
  id: string;
  username: string;
  team: 'alpha' | 'omega';
  isBot: boolean;
  position: [number, number, number];
  rotationY: number;
  pitch: number;
  health: number;
  armor: number;
  cash: number;
  isAlive: boolean;
  isDefusing: boolean;
  isPlanting: boolean;
  equippedWeaponId: string;
  ammoInMag: number;
  reserveAmmo: number;
  lastShotTime: number;
  isReloading: boolean;
  reloadEndTime: number;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  score: number;
  ping: number;
  grenades: {
    he: number;
    smoke: number;
    flash: number;
  };
  spectatingTargetId: string | null;
}

export interface BombState {
  isPlanted: boolean;
  plantedAt: number;
  site: 'bombsite_a' | 'bombsite_b' | null;
  position: [number, number, number] | null;
  isDefused: boolean;
  isExploded: boolean;
  plantedBy?: string;
  defusedBy?: string;
}

export class GameSimulation {
  public readonly matchId: string;
  public readonly mode: GameMode;
  public readonly mapId: string;
  public readonly roundSM: RoundStateMachine;
  public readonly economy: VanguardEconomy;
  public readonly grenadeManager: GrenadeManager;
  public readonly lagComp: LagCompensationBuffer;
  public readonly recoilCtrl: RecoilController;
  public droppedWeapons: Map<string, DroppedWeaponEntity> = new Map();
  public players: Map<string, SimPlayer> = new Map();
  public bombState: BombState = {
    isPlanted: false,
    plantedAt: 0,
    site: null,
    position: null,
    isDefused: false,
    isExploded: false,
  };

  public phaseTimeRemainingSec = 15; // Initial buy phase
  private tickInterval: NodeJS.Timeout | null = null;
  private onStateBroadcastListeners: Array<(snapshot: any) => void> = [];
  private onKillListeners: Array<(event: any) => void> = [];
  private onMatchEndListeners: Array<(winner: 'alpha' | 'omega') => void> = [];

  constructor(matchId: string, mode: GameMode, mapId = 'vanguard_parking') {
    this.matchId = matchId;
    this.mode = mode;
    this.mapId = mapId;
    this.roundSM = new RoundStateMachine(mode === 'COMPETITIVE' ? 24 : 10, mode === 'COMPETITIVE' ? 13 : 5);
    this.economy = new VanguardEconomy(800);
    this.grenadeManager = new GrenadeManager();
    this.lagComp = new LagCompensationBuffer();
    this.recoilCtrl = new RecoilController();
  }

  public initPlayers(playersList: Array<{ id: string; username: string; team: 'alpha' | 'omega'; isBot: boolean }>) {
    this.players.clear();
    for (const p of playersList) {
      this.economy.initPlayer(p.id);
      const defaultWeapon = VANGUARD_WEAPONS.vanguard_rifle;
      const initialPos: [number, number, number] = p.team === 'alpha'
        ? [-28 + Math.random() * 4, 0.5, -28 + Math.random() * 4]
        : [28 - Math.random() * 4, 0.5, 28 - Math.random() * 4];

      this.players.set(p.id, {
        id: p.id,
        username: p.username,
        team: p.team,
        isBot: p.isBot,
        position: initialPos,
        rotationY: p.team === 'alpha' ? 0.78 : -2.35,
        pitch: 0,
        health: 100,
        armor: 100,
        cash: 800,
        isAlive: true,
        isDefusing: false,
        isPlanting: false,
        equippedWeaponId: 'vanguard_rifle',
        ammoInMag: defaultWeapon.magazineSize,
        reserveAmmo: defaultWeapon.reserveAmmo,
        lastShotTime: 0,
        isReloading: false,
        reloadEndTime: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        headshots: 0,
        score: 0,
        ping: p.isBot ? 0 : 24,
        grenades: { he: 1, smoke: 1, flash: 1 },
        spectatingTargetId: null,
      });
    }

    this.startSimulationTick();
  }

  public onBroadcast(cb: (snapshot: any) => void) {
    this.onStateBroadcastListeners.push(cb);
  }

  public onKill(cb: (event: any) => void) {
    this.onKillListeners.push(cb);
  }

  public onMatchEnd(cb: (winner: 'alpha' | 'omega') => void) {
    this.onMatchEndListeners.push(cb);
  }

  public startSimulationTick() {
    if (this.tickInterval) return;

    let secondCounter = 0;
    this.tickInterval = setInterval(() => {
      secondCounter += 50;

      // Record lag compensation snapshots for all alive players
      const nowTick = Date.now();
      for (const p of this.players.values()) {
        if (p.isAlive) {
          this.lagComp.recordSnapshot(p.id, p.position, p.rotationY, p.pitch, nowTick);
        }
      }

      // Update grenade trajectories and detonation physics
      this.grenadeManager.updatePhysics(
        0.05,
        (grenade, details) => {
          // Process explosion damage on players
          for (const ev of details.damageEvents) {
            const victim = this.players.get(ev.targetId);
            if (victim && victim.isAlive) {
              victim.health = Math.max(0, victim.health - ev.damage);
              if (victim.health <= 0) {
                this.eliminatePlayer(victim, grenade.thrownBy, false);
              }
            }
          }
        },
        Array.from(this.players.values()).map(p => ({
          id: p.id,
          position: p.position,
          isAlive: p.isAlive,
        }))
      );

      if (secondCounter >= 1000) {
        secondCounter = 0;
        this.oneSecondTick();
      }

      this.stepBots();
      this.broadcastState();
    }, 50); // 20Hz network tick
  }

  public stopSimulation() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private oneSecondTick() {
    this.phaseTimeRemainingSec = Math.max(this.phaseTimeRemainingSec - 1, 0);

    const currentPhase = this.roundSM.getPhase();

    // Check bomb explosion if planted
    if (this.bombState.isPlanted && !this.bombState.isDefused && !this.bombState.isExploded) {
      const elapsedBombTime = (Date.now() - this.bombState.plantedAt) / 1000;
      if (elapsedBombTime >= 40) {
        this.bombState.isExploded = true;
        this.endRound('alpha', 'Bomb detonated');
        return;
      }
    }

    // Timeouts per phase
    if (this.phaseTimeRemainingSec <= 0) {
      if (currentPhase === 'BUY') {
        this.roundSM.advancePhase();
        this.phaseTimeRemainingSec = 105; // 1m45s combat live phase
      } else if (currentPhase === 'LIVE') {
        // Defenders win if time expires without bomb detonating
        this.endRound('omega', 'Time expired');
      } else if (currentPhase === 'ROUND_END') {
        this.roundSM.advancePhase();
        this.phaseTimeRemainingSec = 5; // 5s rewards settlement
      } else if (currentPhase === 'REWARDS') {
        const next = this.roundSM.advancePhase();
        if (next.matchOver) {
          const scores = this.roundSM.getScores();
          const matchWinner = scores.alpha > scores.omega ? 'alpha' : 'omega';
          for (const l of this.onMatchEndListeners) {
            l(matchWinner);
          }
          this.stopSimulation();
        } else {
          this.resetRoundState();
          this.phaseTimeRemainingSec = 15; // Next buy phase
        }
      }
    }

    // Check elimination victory condition during LIVE phase
    if (currentPhase === 'LIVE' && !this.bombState.isPlanted) {
      const alphaAlive = Array.from(this.players.values()).filter(p => p.team === 'alpha' && p.isAlive).length;
      const omegaAlive = Array.from(this.players.values()).filter(p => p.team === 'omega' && p.isAlive).length;

      if (alphaAlive === 0 && omegaAlive > 0) {
        this.endRound('omega', 'Attackers eliminated');
      } else if (omegaAlive === 0 && alphaAlive > 0) {
        this.endRound('alpha', 'Defenders eliminated');
      }
    }
  }

  private endRound(winner: 'alpha' | 'omega', reason: string) {
    if (this.roundSM.getPhase() !== 'LIVE') return;

    this.roundSM.advancePhase(winner);
    this.phaseTimeRemainingSec = 6; // 6s celebration

    // Server-Authoritative Economy Settlement
    const playerRoster = Array.from(this.players.values()).map(p => ({ id: p.id, team: p.team }));
    this.economy.settleRound(winner, playerRoster, this.bombState.isPlanted);

    // Sync updated wallet balances to players
    for (const p of this.players.values()) {
      p.cash = this.economy.getBalance(p.id);
    }
  }

  private resetRoundState() {
    this.bombState = {
      isPlanted: false,
      plantedAt: 0,
      site: null,
      position: null,
      isDefused: false,
      isExploded: false,
    };

    // Clean up dropped weapons & grenades from past round
    this.droppedWeapons.clear();
    this.grenadeManager.activeGrenades.clear();

    // Respawn all players at team spawns
    for (const p of this.players.values()) {
      p.isAlive = true;
      p.health = 100;
      p.armor = 100;
      p.isDefusing = false;
      p.isPlanting = false;
      p.isReloading = false;
      p.spectatingTargetId = null;
      p.cash = this.economy.getBalance(p.id);

      const weapon = VANGUARD_WEAPONS[p.equippedWeaponId] || VANGUARD_WEAPONS.vanguard_rifle;
      p.ammoInMag = weapon.magazineSize;
      p.reserveAmmo = weapon.reserveAmmo;

      if (p.team === 'alpha') {
        p.position = [-28 + Math.random() * 4, 0.5, -28 + Math.random() * 4];
        p.rotationY = 0.78;
      } else {
        p.position = [28 - Math.random() * 4, 0.5, 28 - Math.random() * 4];
        p.rotationY = -2.35;
      }
    }
  }

  /**
   * Authoritative player movement intention
   */
  public handlePlayerMove(playerId: string, pos: [number, number, number], rotY: number, pitch: number) {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive) return;

    // Boundary validation (-38 to +38 on x and z)
    const clampedX = Math.max(-38, Math.min(38, pos[0]));
    const clampedY = Math.max(0.5, Math.min(10, pos[1]));
    const clampedZ = Math.max(-38, Math.min(38, pos[2]));

    player.position = [clampedX, clampedY, clampedZ];
    player.rotationY = rotY;
    player.pitch = pitch;
  }

  /**
   * Authoritative player weapon firing with Smoke LoS checking
   */
  public handlePlayerFire(
    playerId: string,
    origin: [number, number, number],
    direction: [number, number, number],
    clientTimestamp?: number
  ): { hit: boolean; targetId?: string; headshot?: boolean; zone?: HitboxZone; damageDealt?: number } {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive) return { hit: false };

    // 1. Can shoot check (only during LIVE phase)
    if (!this.roundSM.canShoot()) {
      return { hit: false };
    }

    const weapon = VANGUARD_WEAPONS[player.equippedWeaponId] || VANGUARD_WEAPONS.vanguard_rifle;
    const now = Date.now();

    // 2. Fire rate & ammo check
    const minFireDelayMs = 1000 / weapon.fireRateRps;
    if (now - player.lastShotTime < minFireDelayMs - 15) {
      return { hit: false }; // Fire rate hack prevention
    }

    if (player.ammoInMag <= 0 || player.isReloading) {
      return { hit: false }; // Out of ammo
    }

    player.ammoInMag--;
    player.lastShotTime = now;

    // 3. Raycast hit validation with Lag Compensation Rewind (~200ms limit) & Segmented Hitboxes
    let bestHit: { target: SimPlayer; distance: number; headshot: boolean; zone: HitboxZone; multiplier: number } | null = null;

    for (const target of this.players.values()) {
      if (target.id === playerId || target.team === player.team || !target.isAlive) continue;

      // Rewind target to client snapshot time (clamped to max 200ms)
      const rewound = clientTimestamp
        ? this.lagComp.getRewoundPosition(target.id, clientTimestamp, now)
        : null;
      const targetPos = rewound ? rewound.position : target.position;

      // CRITICAL CHECK: Line-of-sight through smoke
      const isSmokeBlocked = this.grenadeManager.isLineOfSightBlockedBySmoke(origin, targetPos);
      if (isSmokeBlocked) {
        continue;
      }

      // Test against segmented hitboxes (HEAD, CHEST, STOMACH, LEGS)
      const hitboxHit = LagCompensationBuffer.testRayAgainstHitboxes(
        origin,
        direction,
        targetPos,
        weapon.rangeMeters
      );

      if (hitboxHit.hit) {
        if (!bestHit || (hitboxHit.distance !== undefined && hitboxHit.distance < bestHit.distance)) {
          bestHit = {
            target,
            distance: hitboxHit.distance || 0,
            zone: hitboxHit.zone || 'CHEST',
            multiplier: hitboxHit.multiplier || 1.0,
            headshot: hitboxHit.zone === 'HEAD',
          };
        }
      }
    }

    if (bestHit) {
      const target = bestHit.target;
      let rawDamage = weapon.damage * bestHit.multiplier;

      // Armor absorption
      let damageDealt = rawDamage;
      if (target.armor > 0) {
        const absorbed = Math.min(target.armor, rawDamage * 0.35);
        target.armor = Math.max(0, target.armor - absorbed);
        damageDealt = rawDamage * 0.75;
      }

      target.health = Math.max(0, Math.round(target.health - damageDealt));

      if (target.health <= 0) {
        this.eliminatePlayer(target, player.id, bestHit.headshot);
      }

      return {
        hit: true,
        targetId: target.id,
        headshot: bestHit.headshot,
        zone: bestHit.zone,
        damageDealt: Math.round(damageDealt),
      };
    }

    return { hit: false };
  }

  /**
   * Player elimination, weapon drop, kill reward, and spectator camera routing
   */
  private eliminatePlayer(victim: SimPlayer, killerId: string, headshot: boolean) {
    victim.isAlive = false;
    victim.health = 0;
    victim.deaths++;

    const killer = this.players.get(killerId);
    if (killer) {
      killer.kills++;
      killer.score += headshot ? 300 : 200;
      if (headshot) killer.headshots++;

      // Award kill bounty
      const bounty = this.economy.awardKill(killer.id, killer.equippedWeaponId);
      killer.cash = this.economy.getBalance(killer.id);

      for (const l of this.onKillListeners) {
        l({
          killerId: killer.id,
          killerName: killer.username,
          victimId: victim.id,
          victimName: victim.username,
          weaponId: killer.equippedWeaponId,
          headshot,
          bounty,
        });
      }
    }

    // Drop victim's weapon on the ground
    const dropId = `drop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.droppedWeapons.set(dropId, {
      id: dropId,
      weaponId: victim.equippedWeaponId,
      ammoInMag: victim.ammoInMag,
      reserveAmmo: victim.reserveAmmo,
      position: [victim.position[0], 0.25, victim.position[2]],
      droppedAt: Date.now(),
    });

    // Assign alive teammate as spectator target
    const aliveTeammates = Array.from(this.players.values()).filter(p => p.team === victim.team && p.isAlive && p.id !== victim.id);
    if (aliveTeammates.length > 0) {
      victim.spectatingTargetId = aliveTeammates[0].id;
    }
  }

  /**
   * Cycle spectator target for eliminated players
   */
  public cycleSpectatorTarget(playerId: string): string | null {
    const player = this.players.get(playerId);
    if (!player || player.isAlive) return null;

    const aliveTeammates = Array.from(this.players.values()).filter(p => p.team === player.team && p.isAlive);
    if (aliveTeammates.length === 0) {
      player.spectatingTargetId = null;
      return null;
    }

    const currentIndex = aliveTeammates.findIndex(t => t.id === player.spectatingTargetId);
    const nextIndex = (currentIndex + 1) % aliveTeammates.length;
    player.spectatingTargetId = aliveTeammates[nextIndex].id;
    return player.spectatingTargetId;
  }

  /**
   * Authoritative grenade throw
   */
  public handleThrowGrenade(
    playerId: string,
    type: GrenadeType,
    origin: [number, number, number],
    direction: [number, number, number]
  ): boolean {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive || this.roundSM.getPhase() !== 'LIVE') return false;

    const gKey = type.toLowerCase() as 'he' | 'smoke' | 'flash';
    if (player.grenades[gKey] <= 0) return false;

    player.grenades[gKey]--;
    this.grenadeManager.throwGrenade(playerId, type, origin, direction);
    return true;
  }

  /**
   * Authoritative in-game Buy Menu purchase
   */
  public handlePlayerBuy(playerId: string, itemId: string): { success: boolean; reason?: string } {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive) return { success: false, reason: 'PLAYER_INACTIVE' };

    const result = this.economy.executePurchase(playerId, itemId, this.roundSM.canBuy());
    if (result.success) {
      player.cash = result.balanceAfter;

      if (result.itemCategory === 'WEAPON') {
        player.equippedWeaponId = itemId;
        const w = VANGUARD_WEAPONS[itemId];
        player.ammoInMag = w.magazineSize;
        player.reserveAmmo = w.reserveAmmo;
      } else if (result.itemCategory === 'ARMOR') {
        player.armor = 100;
      } else if (result.itemCategory === 'ARMOR_HELMET') {
        player.armor = 100;
      } else if (result.itemCategory === 'GRENADE') {
        if (itemId === 'grenade_he') player.grenades.he++;
        if (itemId === 'grenade_smoke') player.grenades.smoke++;
        if (itemId === 'grenade_flash') player.grenades.flash++;
      }
    }
    return { success: result.success, reason: result.reason };
  }

  /**
   * Authoritative weapon drop & pickup
   */
  public handleDropWeapon(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive || player.equippedWeaponId === 'vanguard_pistol') return false;

    // Drop current primary, revert to pistol
    const dropId = `drop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.droppedWeapons.set(dropId, {
      id: dropId,
      weaponId: player.equippedWeaponId,
      ammoInMag: player.ammoInMag,
      reserveAmmo: player.reserveAmmo,
      position: [player.position[0], 0.25, player.position[2]],
      droppedAt: Date.now(),
    });

    player.equippedWeaponId = 'vanguard_pistol';
    const pistol = VANGUARD_WEAPONS.vanguard_pistol;
    player.ammoInMag = pistol.magazineSize;
    player.reserveAmmo = pistol.reserveAmmo;
    return true;
  }

  public handlePickupWeapon(playerId: string, droppedId: string): boolean {
    const player = this.players.get(playerId);
    const drop = this.droppedWeapons.get(droppedId);
    if (!player || !player.isAlive || !drop) return false;

    // Check proximity (within 2.5m)
    const dist = Math.hypot(player.position[0] - drop.position[0], player.position[2] - drop.position[2]);
    if (dist > 2.5) return false;

    this.droppedWeapons.delete(droppedId);
    player.equippedWeaponId = drop.weaponId;
    player.ammoInMag = drop.ammoInMag;
    player.reserveAmmo = drop.reserveAmmo;
    return true;
  }

  public handlePlayerReload(playerId: string) {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive || player.isReloading) return;

    const weapon = VANGUARD_WEAPONS[player.equippedWeaponId] || VANGUARD_WEAPONS.vanguard_rifle;
    if (player.ammoInMag >= weapon.magazineSize || player.reserveAmmo <= 0) return;

    player.isReloading = true;
    player.reloadEndTime = Date.now() + weapon.reloadTimeSec * 1000;

    setTimeout(() => {
      if (player.isAlive && player.isReloading) {
        const needed = weapon.magazineSize - player.ammoInMag;
        const available = Math.min(needed, player.reserveAmmo);
        player.ammoInMag += available;
        player.reserveAmmo -= available;
        player.isReloading = false;
      }
    }, weapon.reloadTimeSec * 1000);
  }

  public handlePlantBomb(playerId: string, site: 'bombsite_a' | 'bombsite_b', pos: [number, number, number]): boolean {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive || player.team !== 'alpha') return false;
    if (this.roundSM.getPhase() !== 'LIVE' || this.bombState.isPlanted) return false;

    this.bombState = {
      isPlanted: true,
      plantedAt: Date.now(),
      site,
      position: pos,
      isDefused: false,
      isExploded: false,
      plantedBy: player.id,
    };

    return true;
  }

  public handleDefuseBomb(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive || player.team !== 'omega') return false;
    if (!this.bombState.isPlanted || this.bombState.isDefused || this.bombState.isExploded) return false;

    this.bombState.isDefused = true;
    this.bombState.defusedBy = player.id;
    this.endRound('omega', 'Bomb defused');
    return true;
  }

  private stepBots() {
    if (this.roundSM.getPhase() !== 'LIVE') return;

    for (const bot of this.players.values()) {
      if (!bot.isBot || !bot.isAlive) continue;

      // Tactical patrol movement toward objectives
      const targetObjPos = bot.team === 'alpha' ? [16, 0.5, -16] : [0, 0.5, 0];
      const dirX = targetObjPos[0] - bot.position[0];
      const dirZ = targetObjPos[2] - bot.position[2];
      const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);

      if (dist > 2) {
        bot.position[0] += (dirX / dist) * 0.12;
        bot.position[2] += (dirZ / dist) * 0.12;
        bot.rotationY = Math.atan2(dirX, dirZ);
      }

      // Check nearby enemies to shoot
      for (const enemy of this.players.values()) {
        if (enemy.team === bot.team || !enemy.isAlive) continue;

        // Smoke LoS check: bots CANNOT see or target through smoke clouds!
        if (this.grenadeManager.isLineOfSightBlockedBySmoke(bot.position, enemy.position)) {
          continue;
        }

        const edx = enemy.position[0] - bot.position[0];
        const edz = enemy.position[2] - bot.position[2];
        const edist = Math.sqrt(edx * edx + edz * edz);

        if (edist < 25 && Math.random() < 0.04) {
          this.handlePlayerFire(bot.id, bot.position, [edx, 0, edz]);
          break;
        }
      }
    }
  }

  private broadcastState() {
    const scores = this.roundSM.getScores();
    const snapshot = {
      matchId: this.matchId,
      round: this.roundSM.getRoundNumber(),
      phase: this.roundSM.getPhase(),
      phaseTimeRemainingSec: this.phaseTimeRemainingSec,
      scores,
      bomb: this.bombState,
      players: Array.from(this.players.values()),
      activeGrenades: Array.from(this.grenadeManager.activeGrenades.values()),
      activeSmokes: Array.from(this.grenadeManager.activeSmokes.values()),
      droppedWeapons: Array.from(this.droppedWeapons.values()),
      lossStreaks: this.economy.getLossStreaks(),
    };

    for (const listener of this.onStateBroadcastListeners) {
      listener(snapshot);
    }
  }
}
