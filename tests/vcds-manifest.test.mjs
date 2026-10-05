import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AUTHORITATIVE_MANIFEST } from '../src/vcds/manifest.ts';

describe('Vanguard Content Delivery System (VCDS) Manifest (Phases 2, 3 & 8)', () => {
  it('should have valid manifest metadata and version', () => {
    assert.ok(AUTHORITATIVE_MANIFEST.contentVersion);
    assert.ok(AUTHORITATIVE_MANIFEST.manifestVersion >= 1);
    assert.ok(AUTHORITATIVE_MANIFEST.files.length > 0);
  });

  it('should include all required CORE assets with sha256 checksums', () => {
    const coreFiles = AUTHORITATIVE_MANIFEST.files.filter(f => f.category === 'CORE');
    assert.ok(coreFiles.length >= 4);

    for (const file of coreFiles) {
      assert.ok(file.id);
      assert.ok(file.path);
      assert.ok(file.size > 0);
      assert.equal(file.sha256.length, 64, `File ${file.id} must have a valid 64-character hex SHA-256`);
    }
  });

  it('should define MATCH_REQUIRED maps with scene and collision files', () => {
    const mapFiles = AUTHORITATIVE_MANIFEST.files.filter(f => f.id.startsWith('map.vanguard_parking'));
    assert.ok(mapFiles.length >= 2);

    const hasScene = mapFiles.some(f => f.id === 'map.vanguard_parking.scene');
    const hasCollision = mapFiles.some(f => f.id === 'map.vanguard_parking.collision');
    assert.ok(hasScene, 'Map must contain scene.glb definition');
    assert.ok(hasCollision, 'Map must contain collision.glb definition');
  });

  it('should enforce unique asset IDs across the entire manifest', () => {
    const ids = new Set();
    for (const f of AUTHORITATIVE_MANIFEST.files) {
      assert.equal(ids.has(f.id), false, `Duplicate asset ID detected in manifest: ${f.id}`);
      ids.add(f.id);
    }
  });
});
