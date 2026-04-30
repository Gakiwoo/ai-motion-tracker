const DEFAULT_CN_FRIENDLY_BASES = [
  'https://gakiwoo.com/static/mediapipe/pose/',
  'https://registry.npmmirror.com/@mediapipe/pose/0.5.1675469404/files/',
];

const DEFAULT_GLOBAL_FALLBACK_BASES = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/',
  'https://unpkg.com/@mediapipe/pose@0.5.1675469404/',
];

export interface CdnPriorityOptions {
  lastSuccessfulBase?: string | null;
  failedBases?: readonly string[];
}

export interface PreloadDecisionInput {
  authLoading: boolean;
  alreadyStarted: boolean;
}

function normalizeBase(base: string): string | null {
  const trimmed = base.trim();
  if (!trimmed) return null;
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function uniqueBases(bases: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const base of bases) {
    const normalized = normalizeBase(base);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function buildMediaPipeCdnBases(envValue?: string): string[] {
  const envBases = envValue ? envValue.split(',') : [];
  return uniqueBases([
    ...envBases,
    ...DEFAULT_CN_FRIENDLY_BASES,
    ...DEFAULT_GLOBAL_FALLBACK_BASES,
  ]);
}

export function prioritizeMediaPipeCdnBases(
  bases: readonly string[],
  options: CdnPriorityOptions = {},
): string[] {
  const normalizedBases = uniqueBases(bases);
  const failed = new Set(uniqueBases(options.failedBases ?? []));
  const lastSuccessful = options.lastSuccessfulBase ? normalizeBase(options.lastSuccessfulBase) : null;

  const preferred: string[] = [];
  if (lastSuccessful && normalizedBases.includes(lastSuccessful) && !failed.has(lastSuccessful)) {
    preferred.push(lastSuccessful);
  }

  const healthy = normalizedBases.filter((base) => base !== lastSuccessful && !failed.has(base));
  const failedLast = normalizedBases.filter((base) => failed.has(base));
  return [...preferred, ...healthy, ...failedLast];
}

export function shouldPreloadMediaPipeAssets(input: PreloadDecisionInput): boolean {
  return !input.authLoading && !input.alreadyStarted;
}

