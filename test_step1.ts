import { SettlementService } from './src/server/settlement.ts';
import fs from 'fs';

async function testPersistenceStep1() {
  console.log('--- Step 1: Initial Settlement ---');
  const service = new SettlementService();
  const playerId = 'restart_test_user';
  
  const res = await service.processMatchSettlement({
    matchId: 'match_restart_001',
    playerId: playerId,
    result: 'VICTORY',
    kills: 10,
    deaths: 5,
    assists: 3,
    headshots: 4,
    mvp: true,
    score: '13:10',
    durationSeconds: 1200
  });

  const profile = await service.getOrCreateProfile(playerId);
  const state = {
    rating: profile.rating,
    xp: profile.xp,
    matches: profile.matches
  };
  
  fs.writeFileSync('test_state_1.json', JSON.stringify(state));
  console.log('Step 1 Complete. State saved:', state);
}

testPersistenceStep1().catch(console.error);
