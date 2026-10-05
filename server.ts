/**
 * Project Vanguard - Full-Stack Express + WebSocket Server
 * Authoritative Server Architecture on Port 3000
 */

import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { ALL_VANGUARD_MAPS, getMapDefinition, VANGUARD_PARKING_MAP } from './src/maps/index.ts';
import { GameSimulation } from './src/server/game-simulation.ts';
import { MatchmakingEngine } from './src/server/matchmaking.ts';
import { SettlementService } from './src/server/settlement.ts';
import { AUTHORITATIVE_MANIFEST } from './src/vcds/manifest.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(express.json());

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
});

// REST API Endpoints
app.get('/api/content/manifest', (_req, res) => {
  res.json(AUTHORITATIVE_MANIFEST);
});

app.get('/api/maps', (_req, res) => {
  res.json(Object.values(ALL_VANGUARD_MAPS));
});

app.get('/api/map/:mapId', (req, res) => {
  const mapDef = getMapDefinition(req.params.mapId);
  res.json(mapDef);
});

app.get('/api/map/vanguard_parking', (_req, res) => {
  res.json(VANGUARD_PARKING_MAP);
});

app.get('/api/profile', (req, res) => {
  const playerId = (req.query.playerId as string) || 'player_vanguard_01';
  const profile = settlementService.getOrCreateProfile(playerId);
  res.json(profile);
});

app.post('/api/profile/update', (req, res) => {
  const { playerId, username, equippedWeaponId } = req.body;
  const updated = settlementService.updateProfileSettings(playerId || 'player_vanguard_01', {
    username,
    equippedWeaponId,
  });
  res.json(updated);
});

app.get('/api/match-history', (req, res) => {
  const playerId = (req.query.playerId as string) || 'player_vanguard_01';
  const history = settlementService.getMatchHistory(playerId);
  res.json(history);
});

app.post('/api/matchmaking/queue', (req, res) => {
  const { playerId, username, mode, rating, region, preferredMapId } = req.body;
  const ticket = matchmakingEngine.enqueue(
    playerId || 'player_vanguard_01',
    'party_solo',
    username || 'Vanguard_Operator',
    mode || 'COMPETITIVE',
    rating || 1200,
    region || 'EU',
    preferredMapId || 'industrial_zone'
  );
  res.json({ success: true, ticket });
});

app.get('/api/matchmaking/status', (req, res) => {
  const playerId = (req.query.playerId as string) || 'player_vanguard_01';
  const status = matchmakingEngine.getQueueStatus(playerId);
  res.json(status);
});

app.post('/api/matchmaking/cancel', (req, res) => {
  const { playerId } = req.body;
  const success = matchmakingEngine.dequeue(playerId || 'player_vanguard_01');
  res.json({ success });
});

app.post('/api/match/:matchId/settle', (req, res) => {
  const { matchId } = req.params;
  const { playerId, idempotencyKey, result, kills, deaths, assists, headshots, mvp, score, durationSeconds } = req.body;

  const settlement = settlementService.processMatchSettlement({
    matchId,
    playerId: playerId || 'player_vanguard_01',
    idempotencyKey,
    result: result || 'VICTORY',
    kills: Number(kills) || 0,
    deaths: Number(deaths) || 0,
    assists: Number(assists) || 0,
    headshots: Number(headshots) || 0,
    mvp: !!mvp,
    score: score || '13:9',
    durationSeconds: Number(durationSeconds) || 600,
  });

  res.json(settlement);
});

// WebSocket Server for Authoritative Real-Time Gameplay & Queue
const wss = new WebSocketServer({ server, path: '/ws/game' });

wss.on('connection', (ws: WebSocket) => {
  let boundPlayerId: string | null = null;
  let boundMatchId: string | null = null;

  ws.on('message', (messageRaw: string) => {
    try {
      const msg = JSON.parse(messageRaw.toString());

      if (msg.type === 'AUTH') {
        boundPlayerId = msg.playerId;
        ws.send(JSON.stringify({ type: 'AUTH_OK', playerId: boundPlayerId }));
        return;
      }

      if (msg.type === 'JOIN_MATCH') {
        boundMatchId = msg.matchId;
        boundPlayerId = msg.playerId;
        let sim = activeSimulations.get(msg.matchId);

        // Auto-create simulation if not already running for direct debug/join
        if (!sim) {
          sim = new GameSimulation(msg.matchId, 'COMPETITIVE', 'vanguard_parking');
          sim.initPlayers([
            { id: boundPlayerId || 'player_vanguard_01', username: 'Vanguard_Operator', team: 'alpha', isBot: false },
            { id: 'bot_alpha_1', username: 'Vanguard-Ghost', team: 'alpha', isBot: true },
            { id: 'bot_alpha_2', username: 'Vanguard-Viper', team: 'alpha', isBot: true },
            { id: 'bot_alpha_3', username: 'Vanguard-Titan', team: 'alpha', isBot: true },
            { id: 'bot_alpha_4', username: 'Vanguard-Echo', team: 'alpha', isBot: true },
            { id: 'bot_omega_1', username: 'Apex-Shadow', team: 'omega', isBot: true },
            { id: 'bot_omega_2', username: 'Apex-Raven', team: 'omega', isBot: true },
            { id: 'bot_omega_3', username: 'Apex-Kodiak', team: 'omega', isBot: true },
            { id: 'bot_omega_4', username: 'Apex-Spectre', team: 'omega', isBot: true },
            { id: 'bot_omega_5', username: 'Apex-Frost', team: 'omega', isBot: true },
          ]);
          activeSimulations.set(msg.matchId, sim);
        }

        // Attach broadcast listener to send simulation state to this socket
        sim.onBroadcast((snapshot) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'SNAPSHOT', snapshot }));
          }
        });

        sim.onKill((killEvent) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'KILL_EVENT', killEvent }));
          }
        });

        sim.onMatchEnd((winner) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'MATCH_OVER', winner }));
          }
        });

        ws.send(JSON.stringify({ type: 'JOIN_OK', matchId: msg.matchId }));
        return;
      }

      if (!boundMatchId) return;
      const sim = activeSimulations.get(boundMatchId);
      if (!sim) return;

      if (msg.type === 'MOVE') {
        sim.handlePlayerMove(msg.playerId, msg.position, msg.rotationY, msg.pitch);
      } else if (msg.type === 'FIRE') {
        const result = sim.handlePlayerFire(msg.playerId, msg.origin, msg.direction, msg.clientTimestamp);
        ws.send(JSON.stringify({ type: 'FIRE_ACK', result }));
      } else if (msg.type === 'RELOAD') {
        sim.handlePlayerReload(msg.playerId);
      } else if (msg.type === 'PLANT_BOMB') {
        const success = sim.handlePlantBomb(msg.playerId, msg.site, msg.position);
        ws.send(JSON.stringify({ type: 'PLANT_ACK', success }));
      } else if (msg.type === 'DEFUSE_BOMB') {
        const success = sim.handleDefuseBomb(msg.playerId);
        ws.send(JSON.stringify({ type: 'DEFUSE_ACK', success }));
      } else if (msg.type === 'BUY_ITEM') {
        const res = sim.handlePlayerBuy(msg.playerId, msg.itemId);
        ws.send(JSON.stringify({ type: 'BUY_ACK', ...res }));
      } else if (msg.type === 'THROW_GRENADE') {
        const success = sim.handleThrowGrenade(msg.playerId, msg.grenadeType, msg.origin, msg.direction);
        ws.send(JSON.stringify({ type: 'GRENADE_ACK', success }));
      } else if (msg.type === 'DROP_WEAPON') {
        const success = sim.handleDropWeapon(msg.playerId);
        ws.send(JSON.stringify({ type: 'DROP_ACK', success }));
      } else if (msg.type === 'PICKUP_WEAPON') {
        const success = sim.handlePickupWeapon(msg.playerId, msg.droppedId);
        ws.send(JSON.stringify({ type: 'PICKUP_ACK', success }));
      } else if (msg.type === 'CYCLE_SPECTATOR') {
        const targetId = sim.cycleSpectatorTarget(msg.playerId);
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

setupVite().then(() => {
  server.listen(PORT, () => {
    console.log(`[Project Vanguard] Server running authoritative simulation on port ${PORT}`);
  });
});
