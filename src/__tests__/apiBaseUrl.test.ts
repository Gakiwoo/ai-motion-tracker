import { resolveApiBaseUrl } from '../utils/apiBaseUrl';

describe('resolveApiBaseUrl', () => {
  it('uses production origin outside development', () => {
    expect(resolveApiBaseUrl({ isDev: false, platformOS: 'android' })).toBe('https://gakiwoo.com');
  });

  it('uses localhost for web development', () => {
    expect(resolveApiBaseUrl({ isDev: true, platformOS: 'web' })).toBe('http://localhost:5173');
  });

  it('uses the Android emulator host gateway in native Android development', () => {
    expect(resolveApiBaseUrl({ isDev: true, platformOS: 'android' })).toBe('http://10.0.2.2:5173');
  });

  it('allows a LAN or custom API endpoint override', () => {
    expect(
      resolveApiBaseUrl({
        isDev: true,
        platformOS: 'android',
        envUrl: ' http://192.168.1.10:5173/ ',
      }),
    ).toBe('http://192.168.1.10:5173');
  });
});
