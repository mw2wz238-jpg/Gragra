# Project Vanguard — Security Authority Update Pack

Target: `mw2wz238-jpg/Gragra`
Base: `main` / `v0.19.0-alpha.42`

## Cel

Minimalne hardening bez przebudowy projektu:

- WebSocket używa tożsamości przypisanej do socketu, nie `msg.playerId`.
- `JOIN_MATCH` nie może nadpisać uwierzytelnionej tożsamości.
- `JOIN_MATCH` wymaga obecności gracza w server-side rosterze.
- Settlement ma być wyliczany z `GameSimulation`, a nie z danych przesłanych przez klienta.
- Zachowana zostaje idempotencja settlementu.
- Dodane są testy regresyjne bezpieczeństwa.

## Ważne

To nie dodaje prawdziwego systemu logowania/tokenów. Obecny `AUTH` nadal jest tylko deklaracją ID klienta. Jest to hardening obecnej architektury, a nie pełne production authentication.

## Pliki

- `server.ts`
- `src/server/game-simulation.ts`
- `src/server/settlement.ts`
- `src/shared/types.ts`
- `tests/security-authority.test.mjs`

## Sposób wdrożenia

Pakiet zawiera `tools/apply-security-update.mjs`, który wykonuje kontrolowane zamiany i przerywa pracę, jeśli baza plików nie pasuje do oczekiwanej wersji.

Po wdrożeniu uruchom:

```bash
npm run lint
npm test
npm run build
```

Nie oznaczaj testów jako PASS, jeśli faktycznie nie zakończyły się sukcesem.
