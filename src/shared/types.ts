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

export interface RoundEndResult {
  winner: 'alpha' | 'omega';
  reason: string;
}

export interface GameSnapshot {
  matchId: string;
  round: number;
  phase: RoundPhase;
  phaseTimeRemainingSec: number;
  scores: { alpha: number; omega: number };
  bomb: any;
  players: any[];
  activeGrenades: any[];
  activeSmokes: any[];
  droppedWeapons: any[];
  lossStreaks: { alpha: number; omega: number };
  lastRoundResult?: RoundEndResult;
  attackingTeam?: 'alpha' | 'omega';
}

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

export interface AuthoritativeMatchSettlement {
  matchId: string;
  playerId: string;
  result: 'VICTORY' | 'DEFEAT' | 'DRAW';
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  mvp: boolean;
  score: string;
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
  preferredMapId?: string;
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
  coinsEarned?: number;
  walletBalanceAfter?: number;
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

export type SkinRarity = 'MIL_SPEC' | 'RESTRICTED' | 'CLASSIFIED' | 'COVERT' | 'CONTRABAND';

export interface SkinDef {
  id: string;
  weaponId: string;
  name: string;
  collection: string;
  rarity: SkinRarity;
  color: string;
  accentColor: string;
  glowColor?: string;
  roughness: number;
  metalness: number;
  pattern: 'camo' | 'cyber' | 'stealth' | 'hyper_beast' | 'gold_dragon' | 'matte' | 'fade';
  priceCredits: number;
}

export interface CrateDef {
  id: string;
  name: string;
  priceCredits: number;
  description: string;
  dropTable: Array<{ skinId: string; weight: number }>;
}

export interface InventoryItem {
  instanceId: string;
  itemType: 'SKIN' | 'CRATE';
  skinId?: string;
  crateId?: string;
  weaponId?: string;
  equipped: boolean;
  acquiredAt: number;
  source: 'CRATE_DROP' | 'SHOP_PURCHASE' | 'MATCH_REWARD' | 'DEFAULT';
}

export interface WalletLedgerEntry {
  transactionId: string;
  playerId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  source: 'MATCH_REWARD' | 'SHOP_PURCHASE' | 'CRATE_OPEN' | 'DAILY_BONUS';
  timestamp: number;
  idempotencyKey: string;
  balanceAfter: number;
}

export const VANGUARD_SKINS: Record<string, SkinDef> = {
  skin_ar4_default: {
    id: 'skin_ar4_default',
    weaponId: 'vanguard_rifle',
    name: 'AR-4 Phantom (Standard Issue)',
    collection: 'Standard',
    rarity: 'MIL_SPEC',
    color: '#1e293b',
    accentColor: '#38bdf8',
    roughness: 0.4,
    metalness: 0.6,
    pattern: 'matte',
    priceCredits: 0,
  },
  skin_ar4_stealth: {
    id: 'skin_ar4_stealth',
    weaponId: 'vanguard_rifle',
    name: 'AR-4 | Carbon Ops',
    collection: 'Tactical Vanguard',
    rarity: 'MIL_SPEC',
    color: '#0f172a',
    accentColor: '#64748b',
    roughness: 0.25,
    metalness: 0.85,
    pattern: 'stealth',
    priceCredits: 400,
  },
  skin_ar4_vulcan: {
    id: 'skin_ar4_vulcan',
    weaponId: 'vanguard_rifle',
    name: 'AR-4 | Cyber Vulcan',
    collection: 'Cyber Vanguard',
    rarity: 'COVERT',
    color: '#06b6d4',
    accentColor: '#f97316',
    glowColor: '#22d3ee',
    roughness: 0.15,
    metalness: 0.9,
    pattern: 'cyber',
    priceCredits: 2200,
  },
  skin_ar4_hyperion: {
    id: 'skin_ar4_hyperion',
    weaponId: 'vanguard_rifle',
    name: 'AR-4 | Hyperion Gold Sovereign',
    collection: 'Aegis Gold',
    rarity: 'CONTRABAND',
    color: '#eab308',
    accentColor: '#713f12',
    glowColor: '#fde047',
    roughness: 0.1,
    metalness: 0.98,
    pattern: 'gold_dragon',
    priceCredits: 4500,
  },
  skin_vector_default: {
    id: 'skin_vector_default',
    weaponId: 'vanguard_smg',
    name: 'Vector-9 Spectre (Standard Issue)',
    collection: 'Standard',
    rarity: 'MIL_SPEC',
    color: '#1e293b',
    accentColor: '#a855f7',
    roughness: 0.4,
    metalness: 0.5,
    pattern: 'matte',
    priceCredits: 0,
  },
  skin_vector_hazard: {
    id: 'skin_vector_hazard',
    weaponId: 'vanguard_smg',
    name: 'Vector-9 | Hazard Industrial',
    collection: 'Industrial Warfare',
    rarity: 'RESTRICTED',
    color: '#eab308',
    accentColor: '#18181b',
    roughness: 0.35,
    metalness: 0.7,
    pattern: 'camo',
    priceCredits: 750,
  },
  skin_vector_neon: {
    id: 'skin_vector_neon',
    weaponId: 'vanguard_smg',
    name: 'Vector-9 | Neon Cyberpunk',
    collection: 'Cyber Vanguard',
    rarity: 'CLASSIFIED',
    color: '#ec4899',
    accentColor: '#06b6d4',
    glowColor: '#f43f5e',
    roughness: 0.2,
    metalness: 0.8,
    pattern: 'cyber',
    priceCredits: 1400,
  },
  skin_breaker_default: {
    id: 'skin_breaker_default',
    weaponId: 'vanguard_shotgun',
    name: 'Breaker-12 Apex (Standard Issue)',
    collection: 'Standard',
    rarity: 'MIL_SPEC',
    color: '#334155',
    accentColor: '#ef4444',
    roughness: 0.5,
    metalness: 0.5,
    pattern: 'matte',
    priceCredits: 0,
  },
  skin_breaker_arctic: {
    id: 'skin_breaker_arctic',
    weaponId: 'vanguard_shotgun',
    name: 'Breaker-12 | Arctic Winter Camo',
    collection: 'Tactical Vanguard',
    rarity: 'MIL_SPEC',
    color: '#f8fafc',
    accentColor: '#38bdf8',
    roughness: 0.3,
    metalness: 0.4,
    pattern: 'camo',
    priceCredits: 350,
  },
  skin_breaker_magma: {
    id: 'skin_breaker_magma',
    weaponId: 'vanguard_shotgun',
    name: 'Breaker-12 | Molten Magma',
    collection: 'Inferno Warfare',
    rarity: 'COVERT',
    color: '#ef4444',
    accentColor: '#f97316',
    glowColor: '#ea580c',
    roughness: 0.2,
    metalness: 0.85,
    pattern: 'hyper_beast',
    priceCredits: 2000,
  },
  skin_sentinel_default: {
    id: 'skin_sentinel_default',
    weaponId: 'vanguard_pistol',
    name: 'Sentinel-45 (Standard Issue)',
    collection: 'Standard',
    rarity: 'MIL_SPEC',
    color: '#1e293b',
    accentColor: '#22c55e',
    roughness: 0.4,
    metalness: 0.6,
    pattern: 'matte',
    priceCredits: 0,
  },
  skin_sentinel_fade: {
    id: 'skin_sentinel_fade',
    weaponId: 'vanguard_pistol',
    name: 'Sentinel-45 | Spectrum Fade',
    collection: 'Aegis Prism',
    rarity: 'CLASSIFIED',
    color: '#8b5cf6',
    accentColor: '#ec4899',
    glowColor: '#a855f7',
    roughness: 0.1,
    metalness: 0.95,
    pattern: 'fade',
    priceCredits: 1250,
  },
  skin_sentinel_dragon: {
    id: 'skin_sentinel_dragon',
    weaponId: 'vanguard_pistol',
    name: 'Sentinel-45 | Crimson Dragon Filigree',
    collection: 'Dynasty Warfare',
    rarity: 'COVERT',
    color: '#991b1b',
    accentColor: '#eab308',
    glowColor: '#dc2626',
    roughness: 0.15,
    metalness: 0.9,
    pattern: 'gold_dragon',
    priceCredits: 1800,
  },
};

export const VANGUARD_CRATES: Record<string, CrateDef> = {
  crate_vanguard_ops_01: {
    id: 'crate_vanguard_ops_01',
    name: 'Vanguard Tactical Ops Case #1',
    priceCredits: 500,
    description: 'Official Vanguard tactical weapon skin container containing Mil-Spec to Covert weapon skins.',
    dropTable: [
      { skinId: 'skin_ar4_stealth', weight: 45 },      // 45% Mil-Spec
      { skinId: 'skin_breaker_arctic', weight: 35 },   // 35% Mil-Spec
      { skinId: 'skin_vector_hazard', weight: 12 },    // 12% Restricted
      { skinId: 'skin_sentinel_fade', weight: 5 },     // 5% Classified
      { skinId: 'skin_ar4_vulcan', weight: 2.5 },      // 2.5% Covert
      { skinId: 'skin_ar4_hyperion', weight: 0.5 },    // 0.5% Contraband
    ],
  },
  crate_cyber_covert: {
    id: 'crate_cyber_covert',
    name: 'Cyber Covert Classified Container',
    priceCredits: 1200,
    description: 'Special high-tier container with elevated probability for Classified and Covert cyber weaponry.',
    dropTable: [
      { skinId: 'skin_vector_hazard', weight: 40 },
      { skinId: 'skin_vector_neon', weight: 32 },
      { skinId: 'skin_sentinel_fade', weight: 18 },
      { skinId: 'skin_breaker_magma', weight: 6 },
      { skinId: 'skin_sentinel_dragon', weight: 3 },
      { skinId: 'skin_ar4_hyperion', weight: 1 },
    ],
  },
};

