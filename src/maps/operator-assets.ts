/**
 * Operator asset catalog (Alpha / Omega).
 * GLBs live under public/assets/operators/. Static posed (no skeleton).
 * Safe to load with THREE.GLTFLoader — does not alter simulation authority.
 */

export type OperatorFaction = 'alpha' | 'omega';

export interface OperatorAssetDef {
  id: string;
  faction: OperatorFaction;
  role: string;
  /** URL path served by Vite from /public */
  url: string;
  heightMeters: number;
}

export const VANGUARD_OPERATORS: OperatorAssetDef[] = [
  {
    id: 'alpha_assault',
    faction: 'alpha',
    role: 'Assault Trooper',
    url: '/assets/operators/alpha/assault_trooper.glb',
    heightMeters: 1.787,
  },
  {
    id: 'alpha_recon',
    faction: 'alpha',
    role: 'Recon Operator',
    url: '/assets/operators/alpha/recon_operator.glb',
    heightMeters: 1.722,
  },
  {
    id: 'omega_heavy',
    faction: 'omega',
    role: 'Heavy Gunner',
    url: '/assets/operators/omega/heavy_gunner.glb',
    heightMeters: 1.819,
  },
  {
    id: 'omega_engineer',
    faction: 'omega',
    role: 'Field Engineer',
    url: '/assets/operators/omega/field_engineer.glb',
    heightMeters: 1.737,
  },
];

export function getOperatorsForFaction(faction: OperatorFaction): OperatorAssetDef[] {
  return VANGUARD_OPERATORS.filter((o) => o.faction === faction);
}

export function getDefaultOperator(faction: OperatorFaction): OperatorAssetDef {
  const list = getOperatorsForFaction(faction);
  return list[0] ?? VANGUARD_OPERATORS[0];
}
