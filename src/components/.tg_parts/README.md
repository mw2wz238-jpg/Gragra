# TacticalGameView assembly parts

Full source is split into `p00.txt` … `p10.txt` (plain UTF-8, 10 kB each).

Restore:
```
node scripts/assemble-tg.mjs
```

Or automatically via `npm run prebuild` / `npm run build`.

Expected MD5 of restored file: `fb11fb7ec6c52c138ca21ebf405596fb`
Size: 101057 bytes

Contains full shipyard map integration + FP weapon GLB loader (preloadFpWeapons / loadFpWeaponClone).
