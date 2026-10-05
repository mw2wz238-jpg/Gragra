import { SettlementService } from './src/server/settlement.ts';
import fs from 'fs';
import assert from 'assert';

async function testPersistenceStep2() {
  console.log('--- Step 2: Verification After "Restart" ---');
  const service = new SettlementService();
  const playerId = 'restart_test_user';
  
  // 1. Check if profile exists (should exist in DB, won't in Memory)
  const profile = await service.getOrCreateProfile(playerId);
  console.log('Profile after restart:', profile.username, 'Matches:', profile.matches);

  const isDbAvailable = !process.env.DATABASE_URL?.includes('...') && !!process.env.DATABASE_URL;
  
  if (!isDbAvailable) {
     console.warn('PostgreSQL not available. In-Memory fallback will fail this test by design.');
  }

  const prevState = JSON.parse(fs.readFileSync('test_state_1.json', 'utf8'));

  // 2. Try to settle the SAME match again
  console.log('\nProcessing SAME match again (Restarted Idempotency Check)...');
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

  console.log('Settlement result idempotent flag:', res.idempotent);

  const finalProfile = await service.getOrCreateProfile(playerId);
  console.log('Final Matches:', finalProfile.matches);

  if (finalProfile.matches > prevState.matches) {
    console.error('FAIL: Double reward applied after restart! Idempotency failed.');
    process.exit(1);
  } else {
    console.log('PASS: Idempotency survived restart.');
  }
}

testPersistenceStep2().catch(e => {
    console.error(e);
    process.exit(1);
});
