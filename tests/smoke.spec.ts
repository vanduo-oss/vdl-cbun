import { describe, expect, it } from 'vitest';

import componentVersions from '../component-versions.json';
import { VDL_CBUN_VERSIONS } from '../src/index.js';

// Version-consistency check: the hardcoded map in src/index.js must mirror the
// component-versions.json manifest exactly — same keys, same values.
describe('VDL_CBUN_VERSIONS', () => {
  it('matches component-versions.json exactly', () => {
    expect({ ...VDL_CBUN_VERSIONS }).toEqual(componentVersions);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(VDL_CBUN_VERSIONS)).toBe(true);
  });

  it('preserves load-bearing widget versions from the vd3-cbun extract', () => {
    expect(VDL_CBUN_VERSIONS.draw).toBe('1.1.0');
    expect(VDL_CBUN_VERSIONS['hex-grid']).toBe('1.2.0');
    expect(VDL_CBUN_VERSIONS['code-editor']).toBe('1.1.0');
    expect(VDL_CBUN_VERSIONS['music-player']).toBe('1.0.1');
  });
});
