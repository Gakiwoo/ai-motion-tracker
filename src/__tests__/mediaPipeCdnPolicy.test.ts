import {
  buildMediaPipeCdnBases,
  prioritizeMediaPipeCdnBases,
  shouldPreloadMediaPipeAssets,
} from '../utils/mediaPipeCdnPolicy';

describe('mediaPipeCdnPolicy', () => {
  it('normalizes environment CDN overrides and keeps China-friendly defaults ahead of global fallbacks', () => {
    const bases = buildMediaPipeCdnBases(' https://oss.example.com/mp ,https://cdn.example.com/mp/ ');

    expect(bases.slice(0, 4)).toEqual([
      'https://oss.example.com/mp/',
      'https://cdn.example.com/mp/',
      'https://gakiwoo.com/static/mediapipe/pose/',
      'https://registry.npmmirror.com/@mediapipe/pose/0.5.1675469404/files/',
    ]);
    expect(bases).toContain('https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/');
    expect(bases).toContain('https://unpkg.com/@mediapipe/pose@0.5.1675469404/');
  });

  it('tries the last successful CDN first and pushes recently failed sources to the end', () => {
    const bases = [
      'https://a.example.com/',
      'https://b.example.com/',
      'https://c.example.com/',
    ];

    expect(prioritizeMediaPipeCdnBases(bases, {
      lastSuccessfulBase: 'https://b.example.com/',
      failedBases: ['https://a.example.com/'],
    })).toEqual([
      'https://b.example.com/',
      'https://c.example.com/',
      'https://a.example.com/',
    ]);
  });

  it('preloads once the auth gate is no longer blocking UI', () => {
    expect(shouldPreloadMediaPipeAssets({ authLoading: true, alreadyStarted: false })).toBe(false);
    expect(shouldPreloadMediaPipeAssets({ authLoading: false, alreadyStarted: false })).toBe(true);
    expect(shouldPreloadMediaPipeAssets({ authLoading: false, alreadyStarted: true })).toBe(false);
  });
});
