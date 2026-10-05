# Manual patch instructions

Apply these edits against the verified `main` revision.

## 1. server.ts — WebSocket identity

Current vulnerable pattern:

```ts
if (msg.type === 'AUTH') {
  boundPlayerId = msg.playerId;
}

if (msg.type === 'JOIN_MATCH') {
  boundMatchId = msg.matchId;
  boundPlayerId = msg.playerId;
}
```

Change the rule to:

- `AUTH` may set `boundPlayerId` only when it is currently null.
- `JOIN_MATCH` must return an error if `boundPlayerId` is null.
- `JOIN_MATCH` must NOT assign `boundPlayerId = msg.playerId`.
- Verify `activeSimulations.get(msg.matchId)` exists.
- Verify `sim.players.has(boundPlayerId)`.
- Set only `boundMatchId = msg.matchId`.

Then replace every gameplay call:

```ts
sim.handlePlayerMove(msg.playerId, ...)
sim.handlePlayerFire(msg.playerId, ...)
sim.handlePlayerReload(msg.playerId)
sim.handlePlantBomb(msg.playerId, ...)
sim.handleDefuseBomb(msg.playerId)
sim.handlePlayerBuy(msg.playerId, ...)
sim.handleThrowGrenade(msg.playerId, ...)
sim.handleDropWeapon(msg.playerId)
sim.handlePickupWeapon(msg.playerId, ...)
sim.cycleSpectatorTarget(msg.playerId)
```

with the equivalent using `boundPlayerId`.

Do not accept a client-supplied player ID as the authority.

## 2. game-simulation.ts — authoritative settlement

Add:

```ts
public getAuthoritativeSettlement(playerId: string) {
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
```

Also add near the private fields:

```ts
private readonly startedAt = Date.now();
```

## 3. settlement.ts — authority boundary

Introduce an internal type:

```ts
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
```

Change `processMatchSettlement` to accept this server-derived object plus an optional idempotency key, instead of trusting an HTTP request object containing gameplay statistics.

The existing calculations may remain otherwise unchanged for this patch.

## 4. server.ts — settlement endpoint

Replace the current body destructuring:

```ts
const { playerId, idempotencyKey, result, kills, deaths, assists, headshots, mvp, score, durationSeconds } = req.body;
```

with only the request metadata needed to identify the operation, e.g.:

```ts
const { playerId, idempotencyKey } = req.body;
```

Then:

1. Validate `playerId`.
2. Look up `activeSimulations.get(matchId)`.
3. Call `sim.getAuthoritativeSettlement(playerId)`.
4. Return HTTP 409 if the match is not in `MATCH_END`.
5. Pass the server-produced settlement object to `SettlementService`.
6. Never read result/kills/deaths/assists/headshots/mvp/score/duration from the browser.

For the current demo, `playerId` in this REST endpoint is still not authenticated. Treat this as a temporary compatibility boundary; production account/session authentication remains a separate required task.

## 5. Tests

Add tests that prove:

- a gameplay packet containing `playerId: "victim"` cannot make socket A act as victim;
- settlement before `MATCH_END` is rejected;
- changing client `kills`, `result`, `score`, `mvp` does not change the server-derived settlement;
- calling settlement twice with the same idempotency key changes profile only once.
