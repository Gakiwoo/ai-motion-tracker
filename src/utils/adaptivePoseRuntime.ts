export interface AdaptivePoseRuntimeConfig {
  baseIntervalMs: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  slowSampleThreshold?: number;
  fastSampleThreshold?: number;
  slowBudgetRatio?: number;
  fastBudgetRatio?: number;
  increaseStepMs?: number;
  decreaseStepMs?: number;
}

export interface PoseRuntimeSample {
  inferenceMs: number;
  isActive: boolean;
}

export interface AdaptivePoseRuntime {
  getInterval(): number;
  reset(config?: Partial<AdaptivePoseRuntimeConfig>): void;
  recordSample(sample: PoseRuntimeSample): number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeConfig(config: AdaptivePoseRuntimeConfig): Required<AdaptivePoseRuntimeConfig> {
  const minIntervalMs = Math.max(16, Math.floor(config.minIntervalMs));
  const maxIntervalMs = Math.max(minIntervalMs, Math.floor(config.maxIntervalMs));
  return {
    baseIntervalMs: clamp(Math.floor(config.baseIntervalMs), minIntervalMs, maxIntervalMs),
    minIntervalMs,
    maxIntervalMs,
    slowSampleThreshold: config.slowSampleThreshold ?? 3,
    fastSampleThreshold: config.fastSampleThreshold ?? 12,
    slowBudgetRatio: config.slowBudgetRatio ?? 0.85,
    fastBudgetRatio: config.fastBudgetRatio ?? 0.45,
    increaseStepMs: config.increaseStepMs ?? 20,
    decreaseStepMs: config.decreaseStepMs ?? 10,
  };
}

export function createAdaptivePoseRuntime(initialConfig: AdaptivePoseRuntimeConfig): AdaptivePoseRuntime {
  let config = normalizeConfig(initialConfig);
  let intervalMs = config.baseIntervalMs;
  let slowSamples = 0;
  let fastSamples = 0;

  function reset(nextConfig?: Partial<AdaptivePoseRuntimeConfig>): void {
    config = normalizeConfig({ ...config, ...nextConfig });
    intervalMs = config.baseIntervalMs;
    slowSamples = 0;
    fastSamples = 0;
  }

  return {
    getInterval: () => intervalMs,
    reset,
    recordSample(sample: PoseRuntimeSample): number {
      if (!sample.isActive) {
        return intervalMs;
      }

      if (sample.inferenceMs >= intervalMs * config.slowBudgetRatio) {
        slowSamples += 1;
        fastSamples = 0;
      } else if (sample.inferenceMs <= intervalMs * config.fastBudgetRatio) {
        fastSamples += 1;
        slowSamples = 0;
      } else {
        slowSamples = 0;
        fastSamples = 0;
      }

      if (slowSamples >= config.slowSampleThreshold) {
        intervalMs = clamp(intervalMs + config.increaseStepMs, config.minIntervalMs, config.maxIntervalMs);
        slowSamples = 0;
        fastSamples = 0;
      } else if (fastSamples >= config.fastSampleThreshold && intervalMs > config.baseIntervalMs) {
        intervalMs = clamp(intervalMs - config.decreaseStepMs, config.baseIntervalMs, config.maxIntervalMs);
        slowSamples = 0;
        fastSamples = 0;
      }

      return intervalMs;
    },
  };
}

