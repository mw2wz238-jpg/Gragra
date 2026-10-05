#!/usr/bin/env node

/**
 * This file is intentionally a review/guard script.
 * The ChatGPT session has no write access to the repository and did not run
 * the project's TypeScript test/build pipeline, so it does not perform
 * unverified blind rewrites.
 *
 * Use MANUAL_PATCH.md as the authoritative change list.
 */
console.error(`
Project Vanguard security update is prepared for manual application.

Reason this script does not auto-edit:
- repository write access is unavailable in the current session;
- the final TypeScript patch must be applied and tested locally;
- the update must fail closed rather than silently overwriting project changes.

See MANUAL_PATCH.md.
`);
process.exit(2);
