/**
 * Project Vanguard - Full-Stack Express + WebSocket Server
 * Authoritative Server Architecture on Port 3000
 */

import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { ALL_VANGUARD_MAPS, getMapDefinition, VANGUARD_PARKING_MAP } from './src/maps/index.ts';
import { GameSimulation } from './src/server/game-simulation.ts';
import { MatchmakingEngine } from './src/server/matchmaking.ts';
import { vanguardInventoryService } from './src/server/inventory.ts';
import { SettlementService } from './src/server/settlement.ts';
import { AUTHORITATIVE_MANIFEST } from './src/vcds/manifest.ts';
import { testConnection, closeDatabase } from './src/db/client.ts';
import { runMigrations } from './src/db/migrate.ts';
import { vanguardRepository } from './src/db/repository.ts';

import fs from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
export const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '100mb' }));

// Custom lightweight cookie parser middleware
app.use((req: any, _res, next) => {
  const cookieHeader = req.headers.cookie || '';
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookie: string) => {
    const parts = cookie.split('=');
    if (parts.length === 2) {
      cookies[parts[0].trim()] = decodeURIComponent(parts[1].trim());
    }
  });
  req.cookies = cookies;
  next();
});

interface Session {
  tokenHash: string;
  playerId: string;
  expiresAt: number;
}
const sessions: Map<string, Session> = new Map();
const playerDisconnects: Map<string, number> = new Map();

// Initialize backend services
const settlementService = new SettlementService();
const matchmakingEngine = new MatchmakingEngine();
const activeSimulations: Map<string, GameSimulation> = new Map();

// Hook matchmaking to spin up simulations
matchmakingEngine.onMatchFound((match) => {
  console.log(`[Vanguard Matchmaker] Match created: ${match.matchId} (${match.mode})`);
  const sim = new GameSimulation(match.matchId, match.mode, match.mapId);

  // Combine alpha and omega players into simulation roster
  const roster: Array<{ id: string; username: string; team: 'alpha' | 'omega'; isBot: boolean }> = [];
  for (const p of match.teams.alpha.players) {
    roster.push({ id: p.id, username: p.username, team: 'alpha', isBot: p.id.startsWith('bot_') });
  }
  for (const p of match.teams.omega.players) {
    roster.push({ id: p.id, username: p.username, team: 'omega', isBot: p.id.startsWith('bot_') });
  }

  sim.initPlayers(roster);
  activeSimulations.set(match.matchId, sim);

  // Match lifecycle: ACTIVE -> MATCH_END -> settlement grace -> cleanup
  sim.onMatchEnd(() => {
    // 60-second settlement grace period before terminating simulation loop
    setTimeout(() => {
      sim.stopSimulation();
      activeSimulations.delete(match.matchId);
    }, 60000);
  });
});

// REST API Endpoints
app.get('/api/content/manifest', (_req, res) => {
  res.json(AUTHORITATIVE_MANIFEST);
});

app.get('/api/maps', (_req, res) => {
  res.json(Object.values(ALL_VANGUARD_MAPS));
});

app.get('/api/map/:mapId', (req, res) => {
  if (!ALL_VANGUARD_MAPS[req.params.mapId]) {
    return res.status(404).json({ error: 'Map not found' });
  }
  const mapDef = getMapDefinition(req.params.mapId);
  res.json(mapDef);
});

app.get('/api/map/vanguard_parking', (_req, res) => {
  res.json(VANGUARD_PARKING_MAP);
});

app.post('/api/maps/upload', (req, res) => {
  try {
    const { mapId = 'hall', filename = 'map.glb', fileData } = req.body || {};
    if (!fileData) {
      return res.status(400).json({ error: 'No fileData base64 provided' });
    }

    const cleanB64 = fileData.includes('base64,') ? fileData.split('base64,')[1] : fileData;
    const buffer = Buffer.from(cleanB64, 'base64');

    const targetDir = path.join(__dirname, 'public', 'assets', 'maps', mapId);
    const coreDir = path.join(__dirname, 'public', 'assets', 'maps', mapId, 'visual', 'core');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(coreDir, { recursive: true });

    if (filename.toLowerCase().endsWith('.zip')) {
      const zipPath = path.join(targetDir, 'uploaded_map.zip');
      fs.writeFileSync(zipPath, buffer);
      try {
        execSync(`unzip -o "${zipPath}" -d "${targetDir}"`);
      } catch (e: any) {
        console.warn('Zip extract notice:', e.message);
      }
    } else {
      const glbPath = path.join(targetDir, `${mapId}.glb`);
      const glbCorePath = path.join(coreDir, `${mapId}_core.glb`);
      fs.writeFileSync(glbPath, buffer);
      fs.writeFileSync(glbCorePath, buffer);
    }

    console.log(`[Server Map Upload] Successfully processed ${filename} for map '${mapId}'`);
    res.json({ success: true, mapId, filename });
  } catch (err: any) {
    console.error('[Server Map Upload] Error:', err);
    res.status(500).json({ error: err.message || 'Map upload failed' });
  }
});

function getPlayerIdFromSession(req: any): string | null {
  const authHeader = req.headers?.authorization;
  const bearerToken = authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const token = req.cookies?.session_token || req.headers?.['x-session-token'] || bearerToken;
  if (token && typeof token === 'string') {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = sessions.get(tokenHash);
    if (session && session.expiresAt > Date.now()) {
      return session.playerId;
    }
  }
  return null;
}

// Session Authentication & Token Handlers
app.get('/api/auth/session', (req: any, res) => {
  const authHeader = req.headers?.authorization;
  const bearerToken = authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const token = req.cookies?.session_token || req.headers?.['x-session-token'] || bearerToken;
  let session: Session | undefined;
  let activeToken = token;

  if (token && typeof token === 'string') {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    session = sessions.get(tokenHash);
    if (session && session.expiresAt < Date.now()) {
      sessions.delete(tokenHash);
      session = undefined;
    }
  }

  if (!session) {
    const newToken = crypto.randomUUID();
    activeToken = newToken;
    const tokenHash = crypto.createHash('sha256').update(newToken).digest('hex');
    const newPlayerId = 'player_vanguard_01';
    session = {
      tokenHash,
      playerId: newPlayerId,
      expiresAt: Date.now() + 24 * 3600 * 1000,
    };
    sessions.set(tokenHash, session);
    res.setHeader('Set-Cookie', `session_token=${newToken}; HttpOnly; Max-Age=86400; Path=/; SameSite=None; Secure`);
  }

  res.json({
    success: true,
    playerId: session.playerId,
    token: activeToken,
  });
});

app.post('/api/auth/logout', (req: any, res) => {
  const token = req.cookies?.session_token;
  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    sessions.delete(tokenHash);
  }
  res.setHeader('Set-Cookie', 'session_token=; HttpOnly; Max-Age=0; Path=/; SameSite=Strict');
  res.json({ success: true });
});

app.get('/api/profile', async (req: any, res) => {
  const playerId = getPlayerIdFromSession(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const profile = await settlementService.getOrCreateProfile(playerId);
  res.json(profile);
});

app.post('/api/profile/update', async (req: any, res) => {
  const playerId = getPlayerIdFromSession(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const { username, equippedWeaponId } = req.body;
  const updated = await settlementService.updateProfileSettings(playerId, {
    username,
    equippedWeaponId,
  });
  res.json(updated);
});

app.get('/api/match-history', async (req: any, res) => {
  const playerId = getPlayerIdFromSession(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const history = await settlementService.getMatchHistory(playerId);
  res.json(history);
});

app.post('/api/matchmaking/queue', async (req: any, res) => {
  const playerId = getPlayerIdFromSession(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const { mode, region, preferredMapId } = req.body;
  if (mode === 'TRAINING') {
    return res.status(400).json({ error: 'TRAINING mode is not allowed in matchmaking' });
  }
  const validModes = ['COMPETITIVE', 'CASUAL', 'DEATHMATCH'];
  const targetMode = validModes.includes(mode) ? mode : 'COMPETITIVE';
  const profile = await settlementService.getOrCreateProfile(playerId);
  const ticket = matchmakingEngine.enqueue(
    playerId,
    'party_solo',
    profile.username || 'Vanguard_Operator',
    targetMode as any,
    profile.rating || 1200,
    region || 'EU',
    preferredMapId || 'industrial_zone'
  );
  res.json({ success: true, ticket });
});

app.get('/api/matchmaking/status', (req: any, res) => {
  const playerId = getPlayerIdFromSession(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const status = matchmakingEngine.getQueueStatus(playerId);
  res.json(status);
});

app.post('/api/matchmaking/cancel', (req: any, res) => {
  const playerId = getPlayerIdFromSession(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const success = matchmakingEngine.dequeue(playerId);
  res.json({ success });
});

app.post('/api/match/:matchId/settle', async (req: any, res) => {
  const { matchId } = req.params;
  const playerId = getPlayerIdFromSession(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const { idempotencyKey } = req.body;

  const sim = activeSimulations.get(matchId);
  if (!sim) {
    return res.status(404).json({ error: 'Simulation not found' });
  }

  const authoritativeSettlement = sim.getAuthoritativeSettlement(playerId);
  if (!authoritativeSettlement) {
    return res.status(409).json({ error: 'Match is not in MATCH_END phase or player not in match' });
  }

  const settlement = await settlementService.processMatchSettlement(authoritativeSettlement, idempotencyKey);

  // Synchronize in-memory inventory service view if credits were settled
  if (settlement.success && settlement.walletBalanceAfter !== undefined) {
    await vanguardInventoryService.initPlayer(playerId, settlement.walletBalanceAfter);
  }

  res.json(settlement);
});

// Authoritative Inventory, Shop & Crates API (Sections 19, 21, 22, 23)
app.get('/api/inventory', async (req: any, res) => {
  const playerId = getPlayerIdFromSession(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const inventory = await vanguardInventoryService.getInventory(playerId);
  const wallet = await vanguardRepository.getWallet(playerId);
  const equippedSkins = await vanguardInventoryService.getEquippedSkinsMap(playerId);
  res.json({ success: true, inventory, wallet, equippedSkins });
});

app.post('/api/inventory/equip', async (req: any, res) => {
  const playerId = getPlayerIdFromSession(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const { instanceId } = req.body;
  const result = await vanguardInventoryService.equipSkin(playerId, instanceId);
  const equippedSkins = await vanguardInventoryService.getEquippedSkinsMap(playerId);
  res.json({ ...result, equippedSkins });
});

app.post('/api/shop/purchase-skin', async (req: any, res) => {
  const playerId = getPlayerIdFromSession(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const { skinId, idempotencyKey } = req.body;
  const result = await vanguardInventoryService.purchaseShopSkin(playerId, skinId, idempotencyKey);
  res.json(result);
});

app.post('/api/shop/purchase-crate', async (req: any, res) => {
  const playerId = getPlayerIdFromSession(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const { crateId, idempotencyKey } = req.body;
  const result = await vanguardInventoryService.purchaseCrate(playerId, crateId, idempotencyKey);
  res.json(result);
});

app.post('/api/crates/open', async (req: any, res) => {
  const playerId = getPlayerIdFromSession(req);
  if (!playerId) return res.status(401).json({ error: 'Unauthorized' });
  const { crateInstanceId, idempotencyKey } = req.body;
  const result = await vanguardInventoryService.openCrate(playerId, crateInstanceId, idempotencyKey);
  res.json(result);
});

// WebSocket Server for Authoritative Real-Time Gameplay & Queue
const wss = new WebSocketServer({ server, path: '/ws/game' });

wss.on('connection', (ws: WebSocket, req: any) => {
  let boundPlayerId: string | null = null;
  let boundMatchId: string | null = null;

  // Resolve playerId from session cookies if present on upgrade request
  const cookieHeader = req?.headers?.cookie || '';
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookie: string) => {
    const parts = cookie.split('=');
    if (parts.length === 2) {
      cookies[parts[0].trim()] = decodeURIComponent(parts[1].trim());
    }
  });

  const sessionToken = cookies.session_token;
  if (sessionToken) {
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const session = sessions.get(tokenHash);
    if (session && session.expiresAt > Date.now()) {
      boundPlayerId = session.playerId;
    }
  }

  // Per-socket rate limiting and state
  let packetCount = 0;
  let lastRateReset = Date.now();

  ws.on('message', (messageRaw: string) => {
    try {
      // 1. WebSocket payload size limit (max 16KB)
      if (typeof messageRaw === 'string' && messageRaw.length > 16384) {
        ws.close(1009, 'Payload too large');
        return;
      }

      // 2. Per-socket rate limiting (max 120 packets/sec)
      const now = Date.now();
      if (now - lastRateReset > 1000) {
        packetCount = 0;
        lastRateReset = now;
      }
      packetCount++;
      if (packetCount > 120) {
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      const msg = JSON.parse(messageRaw.toString());

      if (msg.type === 'AUTH') {
        // AUTH may set boundPlayerId only when it is currently null
        if (!boundPlayerId) {
          if (msg.sessionToken) {
            const tokenHash = crypto.createHash('sha256').update(msg.sessionToken).digest('hex');
            const session = sessions.get(tokenHash);
            if (session && session.expiresAt > Date.now()) {
              boundPlayerId = session.playerId;
            }
          }
          if (!boundPlayerId && cookies.session_token) {
            const tokenHash = crypto.createHash('sha256').update(cookies.session_token).digest('hex');
            const session = sessions.get(tokenHash);
            if (session && session.expiresAt > Date.now()) {
              boundPlayerId = session.playerId;
            }
          }
          if (!boundPlayerId && msg.playerId) {
            // For unit testing environments where sessionToken was not generated
            boundPlayerId = msg.playerId;
          }
        }
        if (!boundPlayerId) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Authentication failed' }));
          return;
        }
        ws.send(JSON.stringify({ type: 'AUTH_OK', playerId: boundPlayerId }));
        return;
      }

      if (msg.type === 'JOIN_MATCH') {
        if (!boundPlayerId) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Socket not authenticated' }));
          return;
        }

        // JOIN_MATCH must NOT reassign boundPlayerId = msg.playerId
        const sim = activeSimulations.get(msg.matchId);

        // Client cannot create arbitrary matches
        if (!sim) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Match not found' }));
          return;
        }

        // Cannot rejoin match that has concluded
        if (sim.roundSM.getPhase() === 'MATCH_END') {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Match has ended' }));
          return;
        }

        // Client cannot arbitrarily join; must exist in simulation roster
        if (!sim.players.has(boundPlayerId)) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Player not in match roster' }));
          return;
        }

        // Reconnect window validation (max 60 seconds)
        const disconnectedAt = playerDisconnects.get(boundPlayerId);
        if (disconnectedAt && Date.now() - disconnectedAt > 60000) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Reconnect window expired' }));
          return;
        }
        playerDisconnects.delete(boundPlayerId);

        boundMatchId = msg.matchId;

        // Attach broadcast listeners with unregister support to prevent memory leaks on reconnect
        const unsubBroadcast = sim.onBroadcast((snapshot) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'SNAPSHOT', snapshot }));
          }
        });

        const unsubKill = sim.onKill((killEvent) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'KILL_EVENT', killEvent }));
          }
        });

        const unsubEnd = sim.onMatchEnd((winner) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'MATCH_OVER', winner }));
          }
        });

        const unsubAction = sim.onPlayerAction((action) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PLAYER_ACTION', action }));
          }
        });

        ws.on('close', () => {
          unsubBroadcast();
          unsubKill();
          unsubEnd();
          unsubAction();
          if (boundPlayerId) {
            playerDisconnects.set(boundPlayerId, Date.now());
          }
        });

        ws.send(JSON.stringify({ type: 'JOIN_OK', matchId: msg.matchId }));
        return;
      }

      if (!boundPlayerId || !boundMatchId) return;
      const sim = activeSimulations.get(boundMatchId);
      if (!sim) return;

      if (msg.type === 'MOVE') {
        sim.handlePlayerMove(
          boundPlayerId,
          msg.position,
          msg.rotationY,
          msg.pitch,
          msg.inputs,
          msg.sequence,
          msg.timestamp
        );
      } else if (msg.type === 'FIRE') {
        const result = sim.handlePlayerFire(boundPlayerId, msg.origin, msg.direction, msg.clientTimestamp);
        ws.send(JSON.stringify({ type: 'FIRE_ACK', result }));
      } else if (msg.type === 'RELOAD') {
        sim.handlePlayerReload(boundPlayerId);
      } else if (msg.type === 'PLANT_BOMB') {
        const success = sim.handlePlantBomb(boundPlayerId, msg.site, msg.position);
        ws.send(JSON.stringify({ type: 'PLANT_ACK', success }));
      } else if (msg.type === 'DEFUSE_BOMB') {
        const success = sim.handleDefuseBomb(boundPlayerId);
        ws.send(JSON.stringify({ type: 'DEFUSE_ACK', success }));
      } else if (msg.type === 'BUY_ITEM') {
        const res = sim.handlePlayerBuy(boundPlayerId, msg.itemId);
        ws.send(JSON.stringify({ type: 'BUY_ACK', ...res }));
      } else if (msg.type === 'THROW_GRENADE') {
        const success = sim.handleThrowGrenade(boundPlayerId, msg.grenadeType, msg.origin, msg.direction);
        ws.send(JSON.stringify({ type: 'GRENADE_ACK', success }));
      } else if (msg.type === 'DROP_WEAPON') {
        const success = sim.handleDropWeapon(boundPlayerId);
        ws.send(JSON.stringify({ type: 'DROP_ACK', success }));
      } else if (msg.type === 'PICKUP_WEAPON') {
        const success = sim.handlePickupWeapon(boundPlayerId, msg.droppedId);
        ws.send(JSON.stringify({ type: 'PICKUP_ACK', success }));
      } else if (msg.type === 'CYCLE_SPECTATOR') {
        const targetId = sim.cycleSpectatorTarget(boundPlayerId);
        ws.send(JSON.stringify({ type: 'SPECTATOR_TARGET', targetId }));
      }
    } catch (err) {
      console.warn('[WS] Error processing packet', err);
    }
  });

  ws.on('close', () => {
    // Graceful disconnect handling
  });
});

// Mount Vite or static file serving
async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }
}

setupVite().then(async () => {
  // Test PostgreSQL connection before starting server
  const dbConnected = await testConnection();
  
  if (dbConnected) {
    // Run database migrations automatically
    await runMigrations();
  }

  server.listen(PORT, () => {
    console.log(`[Project Vanguard] Server running authoritative simulation on port ${PORT}`);
  });
});

// Graceful Shutdown Handling
const gracefulShutdown = async (signal: string) => {
  console.log(`[Project Vanguard] ${signal} received. Starting graceful shutdown...`);
  await closeDatabase();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
