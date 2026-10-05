/**
 * Project Vanguard - Core Shared Types & Contracts
 * Commercial Tactical FPS Architecture
 */

export type AppPhase =
  | 'BOOT'
  | 'SESSION'
  | 'CONTENT_CHECK'
  | 'LOBBY'
  | 'MATCHMAKING'
  | 'MATCH_FOUND'
  | 'MAP_DOWNLOAD'
  | 'LOADING_GAME'
  | 'IN_GAME'
  | 'MATCH_END'
  | 'REWARDS';

export type GameMode =
  | 'COMPETITIVE'
  | 'CASUAL'
  | 'TDM'
  | 'DEATHMATCH'
  | 'TRAINING';

export type RoundPhase =
  | 'BUY'
  | 'LIVE'
  | 'ROUND_END'
  | 'REWARDS'
  | 'MATCH_END';

export interface WeaponDef {
  id: string;
  name: string;
  category: 'rifle' | 'smg' | 'shotgun' | 'pistol';
  price: number;
  damage: number;
  headshotMultiplier: number;
  fireRateRps: number; // rounds per second
  magazineSize: number;
  reserveAmmo: number;
  reloadTimeSec: number;
  spread: number;
  recoilVertical: number;
  recoilHorizontal: number;
  rangeMeters: number;
}

export const VANGUARD_WEAPONS: Record<string, WeaponDef> = {
  vanguard_rifle: {
    id: 'vanguard_rifle',
    name: 'Vanguard AR-4 Phantom',
    category: 'rifle',
    price: 2900,
    damage: 34,
    headshotMultiplier: 4.0,
    fireRateRps: 10,
    magazineSize: 30,
    reserveAmmo: 90,
    reloadTimeSec: 2.2,
    spread: 0.015,
    recoilVertical: 0.04,
    recoilHorizontal: 0.015,
    rangeMeters: 65,
  },
  vanguard_smg: {
    id: 'vanguard_smg',
    name: 'Vanguard Vector-9 Spectre',
    category: 'smg',
    price: 1800,
    damage: 26,
    headshotMultiplier: 3.0,
    fireRateRps: 15,
    magazineSize: 35,
    reserveAmmo: 105,
    reloadTimeSec: 1.8,
    spread: 0.028,
    recoilVertical: 0.03,
    recoilHorizontal: 0.025,
    rangeMeters: 35,
  },
  vanguard_shotgun: {
    id: 'vanguard_shotgun',
    name: 'Vanguard Breaker-12 Apex',
    category: 'shotgun',
    price: 2100,
    damage: 18, // per pellet (8 pellets)
    headshotMultiplier: 2.2,
    fireRateRps: 1.6,
    magazineSize: 8,
    reserveAmmo: 32,
    reloadTimeSec: 3.0,
    spread: 0.075,
    recoilVertical: 0.12,
    recoilHorizontal: 0.04,
    rangeMeters: 20,
  },
  vanguard_pistol: {
    id: 'vanguard_pistol',
    name: 'Vanguard Tactical-45 Sentinel',
    category: 'pistol',
    price: 500,
    damage: 35,
    headshotMultiplier: 3.2,
    fireRateRps: 5,
    magazineSize: 12,
    reserveAmmo: 36,
    reloadTimeSec: 1.5,
    spread: 0.012,
    recoilVertical: 0.035,
    recoilHorizontal: 0.01,
    rangeMeters: 40,
  },
};

export type GrenadeType = 'HE' | 'SMOKE' | 'FLASH';

export interface GrenadeDef {
  id: string;
  name: string;
  type: GrenadeType;
  price: number;
  fuseTimeSec: number;
  radiusMeters: number;
  maxDamage: number;
  effectDurationSec: number;
}

export const VANGUARD_GRENADES: Record<GrenadeType, GrenadeDef> = {
  HE: {
    id: 'grenade_he',
    name: 'M67 Tactical Frag Grenade',
    type: 'HE',
    price: 300,
    fuseTimeSec: 1.8,
    radiusMeters: 6.0,
    maxDamage: 85,
    effectDurationSec: 0,
  },
  SMOKE: {
    id: 'grenade_smoke',
    name: 'M18 Dense Smoke Grenade',
    type: 'SMOKE',
    price: 300,
    fuseTimeSec: 1.5,
    radiusMeters: 4.8,
    maxDamage: 0,
    effectDurationSec: 18.0,
  },
  FLASH: {
    id: 'grenade_flash',
    name: 'M84 Tactical Flashbang',
    type: 'FLASH',
    price: 200,
    fuseTimeSec: 1.6,
    radiusMeters: 18.0,
    maxDamage: 0,
    effectDurationSec: 3.2,
  },
};

export interface ActiveGrenade {
  id: string;
  type: GrenadeType;
  position: [number, number, number];
  velocity: [number, number, number];
  thrownBy: string;
  thrownAt: number;
  detonateAt: number;
}

export interface ActiveSmokeZone {
  id: string;
  position: [number, number, number];
  radius: number;
  createdAt: number;
  expiresAt: number;
}

export interface DroppedWeaponEntity {
  id: string;
  weaponId: string;
  ammoInMag: number;
  reserveAmmo: number;
  position: [number, number, number];
  droppedAt: number;
}

export interface TeamEconomyState {
  lossStreak: number;
  lastRoundWon: boolean;
}


export interface PlayerProfile {
  id: string;
  username: string;
  level: number;
  xp: number;
  rating: number;
  rank: string;
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  mvps: number;
  playTimeMinutes: number;
  equippedWeaponId: string;
  walletCoins: number;
}

export interface MatchHistoryEntry {
  id: string;
  timestamp: number;
  mode: GameMode;
  mapId: string;
  mapName: string;
  result: 'VICTORY' | 'DEFEAT' | 'DRAW';
  score: string;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  ratingChange: number;
  xpEarned: number;
  durationSeconds: number;
}

export interface ContentFileManifest {
  id: string;
  path: string;
  version: number;
  size: number;
  sha256: string;
  category: 'CORE' | 'OPTIONAL' | 'MATCH_REQUIRED';
  contentType: string;
}

export interface ContentManifest {
  contentVersion: string;
  manifestVersion: number;
  timestamp: number;
  files: ContentFileManifest[];
}

export interface MapSpawnPoint {
  id: string;
  team?: 'alpha' | 'omega';
  position: [number, number, number];
  rotation: number;
}

export interface MapObjectiveZone {
  id: string;
  name: string;
  type: 'bombsite' | 'hostage' | 'capture_point';
  position: [number, number, number];
  radius: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

export interface MapDefinition {
  id: string;
  name: string;
  version: number;
  scale: number; // 1 unit = 1 meter
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  supportedModes: GameMode[];
  teamSpawns: {
    alpha: MapSpawnPoint[];
    omega: MapSpawnPoint[];
  };
  dmSpawns: MapSpawnPoint[];
  objectives: MapObjectiveZone[];
  zones: Array<{
    id: string;
    name: string;
    position: [number, number, number];
  }>;
}

export interface PartyMember {
  playerId: string;
  username: string;
  isLeader: boolean;
  isReady: boolean;
  rating: number;
}

export interface MatchmakingQueueTicket {
  ticketId: string;
  playerId: string;
  partyId: string;
  username: string;
  mode: GameMode;
  rating: number;
  queuedAt: number;
  region: string;
}

export interface MatchSessionInfo {
  matchId: string;
  mode: GameMode;
  mapId: string;
  mapName: string;
  teams: {
    alpha: { id: string; name: string; players: Array<{ id: string; username: string; rating: number }> };
    omega: { id: string; name: string; players: Array<{ id: string; username: string; rating: number }> };
  };
  assignedTeam: 'alpha' | 'omega';
  serverUrl: string;
  maxRounds: number;
  roundTimeToLiveSec: number;
}

export interface MatchEndSettlementRequest {
  matchId: string;
  playerId: string;
  idempotencyKey: string;
  result: 'VICTORY' | 'DEFEAT' | 'DRAW';
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  mvp: boolean;
  score: string;
  durationSeconds: number;
}

export interface MatchEndSettlementResponse {
  success: boolean;
  idempotent: boolean;
  ratingBefore: number;
  ratingAfter: number;
  ratingChange: number;
  xpEarned: number;
  newLevel: number;
  newRank: string;
  updatedStats: {
    matches: number;
    wins: number;
    losses: number;
    kills: number;
    deaths: number;
    assists: number;
  };
}
