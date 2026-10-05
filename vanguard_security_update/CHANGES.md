# Zakres poprawki

## server.ts

1. Settlement endpoint nie przyjmuje już jako źródła prawdy:
   `result`, `kills`, `deaths`, `assists`, `headshots`, `mvp`, `score`, `durationSeconds`.
2. Dane settlementu są pobierane z aktywnej `GameSimulation`.
3. WebSocket:
   - `AUTH` ustawia `boundPlayerId`;
   - `JOIN_MATCH` nie może zmienić `boundPlayerId`;
   - komendy gameplay używają wyłącznie `boundPlayerId`;
   - JOIN wymaga, aby gracz istniał w rosterze symulacji.

## src/server/game-simulation.ts

Dodawany jest read-only accessor `getAuthoritativeSettlement(playerId)`, który zwraca wyłącznie dane wyliczone przez serwer i dopiero po `MATCH_END`.

## src/server/settlement.ts

Settlement przyjmuje dane autorytatywne z symulacji. Idempotency cache pozostaje.

## src/shared/types.ts

Dodawany jest osobny typ `AuthoritativeMatchSettlement`, aby oddzielić dane wewnętrzne od HTTP requestu.

## tests/security-authority.test.mjs

Testy regresyjne obejmują spoofing ID i próbę manipulacji wynikiem settlementu.
