/**
 * Vanguard Server-Authoritative Game Simulation
 * Phases 10, 11, 13, 14, 15, 16, 17, 33 & Complete Round Loop
 * Integrated Economy, Grenades, Smoke LoS, Dropped Weapons, and Spectator System
 */

import { getMapDefinition } from '../maps/index.ts';
import type { MapDefinition } from '../shared/types.ts';
import { RoundStateMachine } from '../shared/state-machine.ts';
import type { AuthoritativeMatchSettlement, DroppedWeaponEntity, GameMode, GrenadeType, RoundPhase } from '../shared/types.ts';
import { VANGUARD_WEAPONS } from '../shared/types.ts';
import { VanguardAntiCheat } from './anti-cheat.ts';
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
  public readonly antiCheat: VanguardAntiCheat;
  public droppedWeapons: Map<string, DroppedWeaponEntity> = new Map();
  public players: Map<string, SimPlayer> = new Map();
  private playerPhysics: Map<string, {
    position: [number, number, number];
    velocity: [number, number, number];
    isGrounded: boolean;
    lastTimestamp: number;
    lastSequence: number;
  }> = new Map();
  public bombState: BombState = {
    isPlanted: false,
    plantedAt: 0,
    site: null,
    position: null,
    isDefused: false,
    isExploded: false,
  };

  public phaseTimeRemainingSec = 15; // Initial buy phase
  private readonly startedAt = Date.now();
  private tickInterval: NodeJS.Timeout | null = null;
  private lastRoundResult: { winner: 'alpha' | 'omega'; reason: string } | null = null;
  private onStateBroadcastListeners: Array<(snapshot: any) => void> = [];
  private onKillListeners: Array<(event: any) => void> = [];
  private onMatchEndListeners: Array<(winner: 'alpha' | 'omega' | 'draw') => void> = [];
  private onPlayerActionListeners: Array<(event: any) => void> = [];

  public getLastRoundResult(): { winner: 'alpha' | 'omega'; reason: string } | null {
    return this.lastRoundResult ? { ...this.lastRoundResult } : null;
  }
  
  public onStateBroadcast(cb: (snapshot: any) => void): () => void {
    this.onStateBroadcastListeners.push(cb);
    return () => {
      this.onStateBroadcastListeners = this.onStateBroadcastListeners.filter(l => l !== cb);
    };
  }

  public onKill(cb: (event: any) => void): () => void {
    this.onKillListeners.push(cb);
    return () => {
      this.onKillListeners = this.onKillListeners.filter(l => l !== cb);
    };
  }

  public onMatchEnd(cb: (winner: 'alpha' | 'omega' | 'draw') => void): () => void {
    this.onMatchEndListeners.push(cb);
    return () => {
      this.onMatchEndListeners = this.onMatchEndListeners.filter(l => l !== cb);
    };
  }

  public onPlayerAction(cb: (event: any) => void): () => void {
    this.onPlayerActionListeners.push(cb);
    return () => {
      this.onPlayerActionListeners = this.onPlayerActionListeners.filter(l => l !== cb);
    };
  }

  public broadcastPlayerAction(event: any) {
    for (const l of this.onPlayerActionListeners) {
      l(event);
    }
  }

  public readonly mapDefinition: MapDefinition;

  constructor(matchId: string, mode: GameMode, mapId = 'vanguard_parking') {
    this.matchId = matchId;
    this.mode = mode;
    this.mapId = mapId;
    this.mapDefinition = getMapDefinition(mapId);
    this.roundSM = new RoundStateMachine(mode === 'COMPETITIVE' ? 24 : 10, mode === 'COMPETITIVE' ? 13 : 5);
    this.economy = new VanguardEconomy(800);
    this.grenadeManager = new GrenadeManager();
    this.lagComp = new LagCompensationBuffer();
    this.recoilCtrl = new RecoilController();
    this.antiCheat = new VanguardAntiCheat();
  }

  public initPlayers(playersList: Array<{ id: string; username: string; team: 'alpha' | 'omega'; isBot: boolean }>) {
    this.players.clear();
    let alphaIdx = 0;
    let omegaIdx = 0;
    for (const p of playersList) {
      this.economy.initPlayer(p.id);
      const defaultWeapon = VANGUARD_WEAPONS.vanguard_rifle;
      const spawns = p.team === 'alpha' ? this.mapDefinition.teamSpawns.alpha : this.mapDefinition.teamSpawns.omega;
      const idx = p.team === 'alpha' ? alphaIdx++ : omegaIdx++;
      const s = spawns[idx % spawns.length];
      const initialPos: [number, number, number] = [
        s.position[0] + (Math.random() - 0.5) * 1.5,
        s.position[1],
        s.position[2] + (Math.random() - 0.5) * 1.5,
      ];

      this.antiCheat.initPlayer(p.id, initialPos);

      this.players.set(p.id, {
        id: p.id,
        username: p.username,
        team: p.team,
        isBot: p.isBot,
        position: initialPos,
        rotationY: s.rotation,
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

  public onBroadcast(cb: (snapshot: any) => void): () => void {
    return this.onStateBroadcast(cb);
  }

  public addPlayer(p: { id: string; username: string; team: 'alpha' | 'omega'; isBot: boolean }) {
    if (this.players.has(p.id)) return;
    
    this.economy.initPlayer(p.id);
    const defaultWeapon = VANGUARD_WEAPONS.vanguard_rifle;
    const spawns = p.team === 'alpha' ? this.mapDefinition.teamSpawns.alpha : this.mapDefinition.teamSpawns.omega;
    const initialPos: [number, number, number] = [
      spawns[0].position[0] + (Math.random() - 0.5) * 1.5,
      spawns[0].position[1],
      spawns[0].position[2] + (Math.random() - 0.5) * 1.5,
    ];

    this.antiCheat.initPlayer(p.id, initialPos);

    this.players.set(p.id, {
      id: p.id,
      username: p.username,
      team: p.team,
      isBot: p.isBot,
      position: initialPos,
      rotationY: spawns[0].rotation,
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
          const matchWinner = this.roundSM.getWinner() || 'draw';
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

    this.lastRoundResult = { winner, reason };
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
    let alphaIdx = 0;
    let omegaIdx = 0;
    for (const p of this.players.values()) {
      const wasAlive = p.isAlive;

      p.isAlive = true;
      p.health = 100;
      p.isDefusing = false;
      p.isPlanting = false;
      p.isReloading = false;
      p.spectatingTargetId = null;
      p.cash = this.economy.getBalance(p.id);

      if (wasAlive) {
        // SURVIVOR: Retains equipped primary/sidearm weapon, current ammo, and remaining armor
        const weapon = VANGUARD_WEAPONS[p.equippedWeaponId] || VANGUARD_WEAPONS.vanguard_pistol;
        p.ammoInMag = Math.min(Math.max(0, p.ammoInMag), weapon.magazineSize);
        p.reserveAmmo = Math.min(Math.max(0, p.reserveAmmo), weapon.reserveAmmo);
        p.armor = Math.max(0, p.armor);
      } else {
        // ELIMINATED: Reset to starter default pistol, full starter ammo, and zero armor
        p.equippedWeaponId = 'vanguard_pistol';
        const defaultWeapon = VANGUARD_WEAPONS.vanguard_pistol;
        p.ammoInMag = defaultWeapon.magazineSize;
        p.reserveAmmo = defaultWeapon.reserveAmmo;
        p.armor = 0;
      }

      if (p.isBot) {
        if (p.cash >= 3100) {
          this.handlePlayerBuy(p.id, 'vanguard_rifle');
          this.handlePlayerBuy(p.id, 'item_kevlar_helmet');
          this.handlePlayerBuy(p.id, 'grenade_he');
          this.handlePlayerBuy(p.id, 'grenade_smoke');
        } else if (p.cash >= 2700) {
          this.handlePlayerBuy(p.id, 'vanguard_rifle');
          this.handlePlayerBuy(p.id, 'item_kevlar');
        } else if (p.cash >= 1500) {
          this.handlePlayerBuy(p.id, 'vanguard_smg');
          this.handlePlayerBuy(p.id, 'item_kevlar');
        } else if (p.cash >= 650) {
          this.handlePlayerBuy(p.id, 'item_kevlar');
        }
      }

      const spawns = p.team === 'alpha' ? this.mapDefinition.teamSpawns.alpha : this.mapDefinition.teamSpawns.omega;
      const idx = p.team === 'alpha' ? alphaIdx++ : omegaIdx++;
      const s = spawns[idx % spawns.length];
      p.position = [
        s.position[0] + (Math.random() - 0.5) * 1.5,
        s.position[1],
        s.position[2] + (Math.random() - 0.5) * 1.5,
      ];
      p.rotationY = s.rotation;

      // Reset anti-cheat and simulated physics on round reset to prevent spawn immobility desync
      this.antiCheat.initPlayer(p.id, p.position);
      this.playerPhysics.delete(p.id);
    }
  }

  /**
   * Authoritative player movement intention with Server-Authoritative Physics & Reconciliation
   */
  public handlePlayerMove(
    playerId: string,
    pos: [number, number, number],
    rotY: number,
    pitch: number,
    inputs?: {
      forward?: boolean;
      backward?: boolean;
      left?: boolean;
      right?: boolean;
      jump?: boolean;
      crouch?: boolean;
      sprint?: boolean;
    },
    sequence?: number,
    timestamp?: number
  ) {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive) return;

    // 1. Finite numeric validation on coordinates and aim angles
    if (
      !pos ||
      !Array.isArray(pos) ||
      pos.length < 3 ||
      !Number.isFinite(pos[0]) ||
      !Number.isFinite(pos[1]) ||
      !Number.isFinite(pos[2]) ||
      !Number.isFinite(rotY) ||
      !Number.isFinite(pitch)
    ) {
      return;
    }

    const serverNow = Date.now();
    let physics = this.playerPhysics.get(playerId);

    if (!physics) {
      physics = {
        position: [...player.position],
        velocity: [0, 0, 0],
        isGrounded: true,
        lastTimestamp: serverNow - 50,
        lastSequence: sequence || 0,
      };
      this.playerPhysics.set(playerId, physics);
    }

    // 2. Sequence monotonicity validation (reject out-of-order/replayed packets)
    if (sequence !== undefined && Number.isFinite(sequence)) {
      if (sequence < physics.lastSequence) {
        return;
      }
      physics.lastSequence = sequence;
    }

    // 3. Server-side timestamp validation: never trust client time, reject future time beyond network jitter
    let effectiveTimestamp = serverNow;
    if (timestamp !== undefined && Number.isFinite(timestamp)) {
      if (timestamp > serverNow + 200) {
        return; // Reject future timestamp
      }
      effectiveTimestamp = Math.min(timestamp, serverNow);
    }

    // Rely on validated client-side position to eliminate desync on walls/crates/collisions
    physics.position = [...pos];
    physics.lastTimestamp = effectiveTimestamp;

    // Map bounds validation (accounting for 2m perimeter wall margin)
    const bMin = this.mapDefinition.bounds.min;
    const bMax = this.mapDefinition.bounds.max;
    const clampedX = Math.max(bMin[0] + 2, Math.min(bMax[0] - 2, physics.position[0]));
    const clampedY = Math.max(0.0, Math.min(bMax[1], physics.position[1])); // Y ground minimum aligned with client ground at 0.0
    const clampedZ = Math.max(bMin[2] + 2, Math.min(bMax[2] - 2, physics.position[2]));

    // Anti-cheat movement validation (speed-hack, fly-hack, teleportation)
    const moveVal = this.antiCheat.validateMovement(playerId, [clampedX, clampedY, clampedZ], effectiveTimestamp);
    this.antiCheat.validateAimRotation(playerId, rotY, pitch);

    player.position = moveVal.correctedPos;
    physics.position = [...moveVal.correctedPos]; // Sync simulated pos with any corrected pos
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

    // 2. Anti-cheat shot origin proximity check
    const originCheck = this.antiCheat.validateShotOrigin(playerId, player.position, origin);
    if (!originCheck.valid) {
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

    // Broadcast the fire action to synchronize other clients and render tracer/audio
    this.broadcastPlayerAction({
      type: 'PLAYER_FIRE',
      playerId,
      origin,
      direction,
    });

    // 3. Raycast hit validation with Lag Compensation Rewind (~200ms limit) & Segmented Hitboxes
    let bestHit: { target: SimPlayer; distance: number; headshot: boolean; zone: HitboxZone; multiplier: number } | null = null;

    for (const target of this.players.values()) {
      if (target.id === playerId || target.team === player.team || !target.isAlive) continue;

      // Rewind target to client snapshot time (clamped to max 200ms, non-future)
      const validClientTimestamp = (clientTimestamp !== undefined && Number.isFinite(clientTimestamp))
        ? Math.min(clientTimestamp, now)
        : undefined;
      const rewound = validClientTimestamp
        ? this.lagComp.getRewoundPosition(target.id, validClientTimestamp, now)
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

    // 1. Grenade type validation
    const validTypes: GrenadeType[] = ['HE', 'SMOKE', 'FLASH'];
    if (!type || !validTypes.includes(type)) return false;

    // 2. Finite numeric validation on origin and direction
    if (
      !origin ||
      !Array.isArray(origin) ||
      origin.length < 3 ||
      !Number.isFinite(origin[0]) ||
      !Number.isFinite(origin[1]) ||
      !Number.isFinite(origin[2]) ||
      !direction ||
      !Array.isArray(direction) ||
      direction.length < 3 ||
      !Number.isFinite(direction[0]) ||
      !Number.isFinite(direction[1]) ||
      !Number.isFinite(direction[2])
    ) {
      return false;
    }

    // 3. Direction normalization and zero vector check
    const dirLen = Math.sqrt(direction[0] * direction[0] + direction[1] * direction[1] + direction[2] * direction[2]);
    if (dirLen < 0.001) return false;
    const normDir: [number, number, number] = [direction[0] / dirLen, direction[1] / dirLen, direction[2] / dirLen];

    // 4. Origin proximity validation (origin must be within 3m of authoritative player position)
    const odx = origin[0] - player.position[0];
    const ody = origin[1] - player.position[1];
    const odz = origin[2] - player.position[2];
    const originDist = Math.sqrt(odx * odx + ody * ody + odz * odz);
    const validOrigin: [number, number, number] = originDist > 3.0
      ? [player.position[0], player.position[1] + 1.5, player.position[2]]
      : origin;

    // 5. Grenade inventory count check
    const gKey = type.toLowerCase() as 'he' | 'smoke' | 'flash';
    if (!player.grenades || player.grenades[gKey] <= 0) return false;

    player.grenades[gKey]--;
    this.grenadeManager.throwGrenade(playerId, type, validOrigin, normDir);
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

    // Broadcast the reload action to synchronize other clients and trigger character reload anim
    this.broadcastPlayerAction({
      type: 'PLAYER_RELOAD',
      playerId,
    });

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

  public handlePlantBomb(playerId: string, site: 'bombsite_a' | 'bombsite_b', pos?: [number, number, number]): boolean {
    const player = this.players.get(playerId);
    // 1. Authoritative player state and team validation (only alive Alpha team attackers can plant)
    if (!player || !player.isAlive || player.team !== 'alpha') return false;

    // 2. Authoritative round phase validation (must be LIVE, bomb must not be already planted)
    if (this.roundSM.getPhase() !== 'LIVE' || this.bombState.isPlanted) return false;

    // 3. Validate objective bombsite definition
    const siteObj = this.mapDefinition.objectives.find((o) => o.id === site);
    if (!siteObj) return false;

    // 4. Proximity validation: player must be within bombsite zone radius (with tolerance)
    if (this.playerPhysics.has(playerId)) {
      const pDist = Math.hypot(player.position[0] - siteObj.position[0], player.position[2] - siteObj.position[2]);
      if (pDist > (siteObj.radius || 6) + 3.5) {
        return false;
      }
    }

    // 5. Server-authoritative bomb position locked to bombsite/player ground
    const bombPos: [number, number, number] =
      pos && Array.isArray(pos) && Number.isFinite(pos[0]) && Number.isFinite(pos[2])
        ? [pos[0], siteObj.position[1], pos[2]]
        : [player.position[0], siteObj.position[1], player.position[2]];

    this.bombState = {
      isPlanted: true,
      plantedAt: Date.now(),
      site,
      position: bombPos,
      isDefused: false,
      isExploded: false,
      plantedBy: player.id,
    };

    return true;
  }

  public handleDefuseBomb(playerId: string): boolean {
    const player = this.players.get(playerId);
    // 1. Only alive Omega team defenders can defuse
    if (!player || !player.isAlive || player.team !== 'omega') return false;

    // 2. Bomb must be active and not defused/exploded
    if (!this.bombState.isPlanted || this.bombState.isDefused || this.bombState.isExploded || !this.bombState.position) {
      return false;
    }

    // 3. Proximity validation: defender must be within defusal distance (6m) of bomb
    if (this.playerPhysics.has(playerId)) {
      const bPos = this.bombState.position;
      const dist = Math.hypot(player.position[0] - bPos[0], player.position[2] - bPos[2]);
      if (dist > 6.0) {
        return false;
      }
    }

    this.bombState.isDefused = true;
    this.bombState.defusedBy = player.id;
    this.endRound('omega', 'Bomb defused');
    return true;
  }

  private stepBots() {
    if (this.roundSM.getPhase() !== 'LIVE') return;

    const siteA = this.mapDefinition.objectives[0]?.position || [16, 0.5, -16];
    const siteB = this.mapDefinition.objectives[1]?.position || [-16, 0.5, 16];

    for (const bot of this.players.values()) {
      if (!bot.isBot || !bot.isAlive) continue;

      let targetPos: [number, number, number];

      if (this.bombState.isPlanted && this.bombState.position) {
        // Bomb is planted:
        if (bot.team === 'omega') {
          // Defenders rush to defuse the bomb
          targetPos = this.bombState.position;
          const bdx = targetPos[0] - bot.position[0];
          const bdz = targetPos[2] - bot.position[2];
          const distToBomb = Math.sqrt(bdx * bdx + bdz * bdz);
          if (distToBomb < 2.5 && !this.bombState.isDefused && !this.bombState.isExploded) {
            this.handleDefuseBomb(bot.id);
          }
        } else {
          // Attackers hold defensive perimeter around the bomb site
          const angle = (parseInt(bot.id.replace(/\D/g, '')) || 1) * 1.25;
          targetPos = [
            this.bombState.position[0] + Math.cos(angle) * 5,
            this.bombState.position[1],
            this.bombState.position[2] + Math.sin(angle) * 5,
          ];
        }
      } else {
        // Bomb not planted yet:
        // Split bot squads between Site A and Site B
        const botNum = parseInt(bot.id.replace(/\D/g, '')) || 1;
        const assignedSite = botNum % 2 === 1 ? siteA : siteB;
        targetPos = assignedSite;

        if (bot.team === 'alpha') {
          const adx = targetPos[0] - bot.position[0];
          const adz = targetPos[2] - bot.position[2];
          const distToSite = Math.sqrt(adx * adx + adz * adz);
          if (distToSite < 3.5 && !this.bombState.isPlanted) {
            const siteType = botNum % 2 === 1 ? 'bombsite_a' : 'bombsite_b';
            this.handlePlantBomb(bot.id, siteType, bot.position);
          }
        }
      }

      // Move toward target position
      const dirX = targetPos[0] - bot.position[0];
      const dirZ = targetPos[2] - bot.position[2];
      const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);

      if (dist > 1.8) {
        bot.position[0] += (dirX / dist) * 0.13;
        bot.position[2] += (dirZ / dist) * 0.13;
        // Interpolate elevation smoothly towards target position Y
        bot.position[1] = bot.position[1] * 0.9 + targetPos[1] * 0.1;
        bot.rotationY = Math.atan2(dirX, dirZ);
      } else {
        // Arrived horizontally: align Y height precisely with target height
        bot.position[1] = targetPos[1];
      }

      // Reload if low/empty magazine and reserve ammo available
      if (bot.ammoInMag <= 0 && bot.reserveAmmo > 0 && !bot.isReloading) {
        this.handlePlayerReload(bot.id);
      }

      // Check nearby enemies to shoot or throw tactical grenades
      for (const enemy of this.players.values()) {
        if (enemy.team === bot.team || !enemy.isAlive) continue;

        // Smoke LoS check: bots CANNOT see or target through smoke clouds!
        if (this.grenadeManager.isLineOfSightBlockedBySmoke(bot.position, enemy.position)) {
          continue;
        }

        const edx = enemy.position[0] - bot.position[0];
        const edz = enemy.position[2] - bot.position[2];
        const edist = Math.sqrt(edx * edx + edz * edz);

        if (edist < 30) {
          // Tactical grenade utility throw
          if (edist > 10 && Math.random() < 0.015) {
            if (bot.grenades.he > 0) {
              this.handleThrowGrenade(bot.id, 'HE', bot.position, [edx / edist, 0.35, edz / edist]);
            } else if (bot.grenades.smoke > 0) {
              this.handleThrowGrenade(bot.id, 'SMOKE', bot.position, [edx / edist, 0.25, edz / edist]);
            }
          }

          // Tactical burst fire
          if (Math.random() < 0.06 && !bot.isReloading && bot.ammoInMag > 0) {
            this.handlePlayerFire(bot.id, bot.position, [edx, 0, edz]);
            break;
          }
        }
      }
    }
  }

  public getAuthoritativeSettlement(playerId: string): AuthoritativeMatchSettlement | null {
    if (this.roundSM.getPhase() !== 'MATCH_END') return null;

    const player = this.players.get(playerId);
    if (!player) return null;

    const scores = this.roundSM.getScores();
    const winner =
      scores.alpha > scores.omega ? 'alpha' :
      scores.omega > scores.alpha ? 'omega' :
      null;

    const result =
      winner === null ? 'DRAW' :
      player.team === winner ? 'VICTORY' : 'DEFEAT';

    const teammates = Array.from(this.players.values())
      .filter(p => p.team === player.team);

    const topScore = Math.max(...teammates.map(p => p.score), 0);

    return {
      matchId: this.matchId,
      playerId,
      result,
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      headshots: player.headshots,
      mvp: player.score === topScore && player.score > 0,
      score: `${scores.alpha}:${scores.omega}`,
      durationSeconds: Math.max(1, Math.round((Date.now() - this.startedAt) / 1000)),
    };
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
      lastRoundResult: this.lastRoundResult || undefined,
    };

    for (const listener of this.onStateBroadcastListeners) {
      listener(snapshot);
    }
  }
}
