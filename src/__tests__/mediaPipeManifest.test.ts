import { createMediaPipeManifest, isMediaPipeCacheComplete } from '../utils/mediaPipeManifest';

const files = ['pose.js', 'pose.wasm'] as const;

describe('mediaPipeManifest', () => {
  it('creates a manifest with stable file metadata', () => {
    expect(
      createMediaPipeManifest('0.5.0', [
        { name: 'pose.js', size: 12 },
        { name: 'pose.wasm', size: 34 },
      ]),
    ).toEqual({
      version: '0.5.0',
      files: [
        { name: 'pose.js', size: 12 },
        { name: 'pose.wasm', size: 34 },
      ],
    });
  });

  it('accepts a complete cache with matching version and non-empty files', () => {
    expect(
      isMediaPipeCacheComplete({
        expectedFiles: files,
        expectedVersion: '0.5.0',
        version: '0.5.0',
        files: [
          { name: 'pose.js', size: 12 },
          { name: 'pose.wasm', size: 34 },
        ],
      }),
    ).toBe(true);
  });

  it('rejects a cache with a stale version', () => {
    expect(
      isMediaPipeCacheComplete({
        expectedFiles: files,
        expectedVersion: '0.5.0',
        version: '0.4.0',
        files: [
          { name: 'pose.js', size: 12 },
          { name: 'pose.wasm', size: 34 },
        ],
      }),
    ).toBe(false);
  });

  it('rejects missing or empty files', () => {
    expect(
      isMediaPipeCacheComplete({
        expectedFiles: files,
        expectedVersion: '0.5.0',
        version: '0.5.0',
        files: [{ name: 'pose.js', size: 12 }],
      }),
    ).toBe(false);

    expect(
      isMediaPipeCacheComplete({
        expectedFiles: files,
        expectedVersion: '0.5.0',
        version: '0.5.0',
        files: [
          { name: 'pose.js', size: 12 },
          { name: 'pose.wasm', size: 0 },
        ],
      }),
    ).toBe(false);
  });
});
