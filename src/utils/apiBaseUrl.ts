interface ResolveApiBaseUrlOptions {
  isDev: boolean;
  platformOS?: string;
  envUrl?: string;
}

const PROD_BASE_URL = 'https://gakiwoo.com';
const DEV_WEB_BASE_URL = 'http://localhost:5173';
const DEV_ANDROID_EMULATOR_BASE_URL = 'http://10.0.2.2:5173';

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function resolveApiBaseUrl({
  isDev,
  platformOS,
  envUrl,
}: ResolveApiBaseUrlOptions): string {
  const overrideUrl = envUrl ? normalizeBaseUrl(envUrl) : '';
  if (overrideUrl) {
    return overrideUrl;
  }

  if (!isDev) {
    return PROD_BASE_URL;
  }

  if (platformOS === 'android') {
    return DEV_ANDROID_EMULATOR_BASE_URL;
  }

  return DEV_WEB_BASE_URL;
}
