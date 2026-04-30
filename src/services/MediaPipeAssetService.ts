import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
  downloadAsync,
  deleteAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MediaPipeCachedAsset,
  createMediaPipeManifest,
  isMediaPipeCacheComplete,
} from '../utils/mediaPipeManifest';
import { runWithConcurrency } from '../utils/asyncPool';
import {
  buildMediaPipeCdnBases,
  prioritizeMediaPipeCdnBases,
} from '../utils/mediaPipeCdnPolicy';

// MediaPipe 资源文件列表
const MEDIAPIPE_FILES = [
  'pose.js',
  'pose_solution_packed_assets_loader.js',
  'pose_solution_packed_assets.data',
  'pose_solution_simd_wasm_bin.js',
  'pose_solution_simd_wasm_bin.wasm',
  'pose_solution_wasm_bin.js',
  'pose_solution_wasm_bin.wasm',
  'pose_landmark_full.tflite',
  'pose_web.binarypb',
] as const;

// 本地缓存目录
const CACHE_DIR = documentDirectory + 'mediapipe/pose/';

// 缓存版本标记文件
const CACHE_VERSION = '0.5.1675469404';
const VERSION_FILE = CACHE_DIR + '.version';
const MANIFEST_FILE = CACHE_DIR + '.manifest.json';
const DOWNLOAD_CONCURRENCY = 3;
const DOWNLOAD_MAX_ATTEMPTS = 3;
const LAST_SUCCESSFUL_CDN_KEY = '@mediaPipe:lastSuccessfulCdn';
const FAILED_CDN_KEY = '@mediaPipe:failedCdns';

export type AssetProgressCallback = (message: string, progress?: number) => void;

/**
 * MediaPipe 资源管理服务
 *
 * 架构设计：
 * 1. 首次启动：从 gakiwoo.com 下载所有文件 → 缓存到 documentDirectory
 * 2. 后续启动：直接从本地缓存读取 → 注入 WebView 为 blob: URL
 * 3. 零网络依赖（缓存后），完美兼容 https://localhost 安全上下文
 *
 * 为什么不用 WebView 的 HTTP 缓存？
 * - Android WebView 缓存不可靠，随时可能被系统清理
 * - 显式文件缓存保证持久性和离线可用
 *
 * 为什么用 blob: URL 而不是 file:// URL？
 * - WebView 需要 https://localhost 作为 baseUrl（安全上下文，getUserMedia 必须）
 * - 从 https://localhost fetch file:// 会被 CORS 阻止
 * - blob: URL 与创建它的页面同源，无 CORS 问题
 */
class MediaPipeAssetService {
  private cachedBaseUrl: string | null = null;
  /** 内存 base64 缓存：避免每次进入训练页重复读磁盘 + atob 解码 */
  private base64Cache: Map<string, string> = new Map();
  private ensurePromise: Promise<string> | null = null;

  /**
   * 确保所有 MediaPipe 文件已缓存到本地
   * 返回本地缓存目录的 file:// URL
   */
  async ensureCached(onProgress?: AssetProgressCallback): Promise<string> {
    if (this.ensurePromise) {
      onProgress?.('继续使用后台预加载的 AI 模型...', 0);
      return this.ensurePromise;
    }

    this.ensurePromise = this.ensureCachedInternal(onProgress).finally(() => {
      this.ensurePromise = null;
    });
    return this.ensurePromise;
  }

  preload(onProgress?: AssetProgressCallback): Promise<string> {
    return this.ensureCached(onProgress);
  }

  private async ensureCachedInternal(onProgress?: AssetProgressCallback): Promise<string> {
    // 检查是否已缓存（且版本匹配）
    if (await this.isCacheValid()) {
      onProgress?.('加载本地 AI 模型...', 1);
      this.cachedBaseUrl = CACHE_DIR;
      return CACHE_DIR;
    }

    // 需要下载：尝试各个 CDN
    onProgress?.('正在下载 AI 模型...', 0);

    // 确保缓存目录存在
    const dirInfo = await getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
      await makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }

    const cdnBases = await this.getPrioritizedCdnBases();

    // 逐个尝试 CDN，直到成功
    let successBase: string | null = null;
    for (let i = 0; i < cdnBases.length; i++) {
      const cdnBase = cdnBases[i];
      const host = cdnBase.split('/')[2];
      onProgress?.(`尝试 CDN ${i + 1}/${cdnBases.length}: ${host}`, (i + 1) / (cdnBases.length + 1));

      try {
        await this.downloadAllFromCdn(cdnBase, (fileIdx, total) => {
          onProgress?.(
            `从 ${host} 下载中 (${fileIdx + 1}/${total})`,
            (i * total + fileIdx + 1) / (cdnBases.length * total)
          );
        });
        successBase = cdnBase;
        await this.recordSuccessfulCdn(cdnBase);
        break;
      } catch (err) {
        console.warn(`[MediaPipeAsset] CDN ${host} failed:`, err);
        await this.recordFailedCdn(cdnBase);
        await this.cleanIncompleteCacheFiles();
      }
    }

    if (!successBase) {
      throw new Error('所有 CDN 均下载失败，请检查网络连接后重试');
    }

    // 写入版本标记和文件清单，后续启动可发现半下载或 0 字节缓存
    await writeAsStringAsync(VERSION_FILE, CACHE_VERSION);
    const files = await this.getCachedAssetInfo();
    await writeAsStringAsync(
      MANIFEST_FILE,
      JSON.stringify(createMediaPipeManifest(CACHE_VERSION, files), null, 2)
    );
    this.cachedBaseUrl = CACHE_DIR;
    onProgress?.('AI 模型就绪', 1);
    return CACHE_DIR;
  }

  private getEnvCdnBases(): string | undefined {
    return (globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    }).process?.env?.EXPO_PUBLIC_MEDIAPIPE_CDN_BASES;
  }

  private async getPrioritizedCdnBases(): Promise<string[]> {
    const [lastSuccessfulBase, failedBasesJson] = await Promise.all([
      AsyncStorage.getItem(LAST_SUCCESSFUL_CDN_KEY),
      AsyncStorage.getItem(FAILED_CDN_KEY),
    ]);
    const failedBases = this.parseStoredBases(failedBasesJson);
    return prioritizeMediaPipeCdnBases(
      buildMediaPipeCdnBases(this.getEnvCdnBases()),
      { lastSuccessfulBase, failedBases },
    );
  }

  private async recordSuccessfulCdn(cdnBase: string): Promise<void> {
    await Promise.all([
      AsyncStorage.setItem(LAST_SUCCESSFUL_CDN_KEY, cdnBase),
      AsyncStorage.removeItem(FAILED_CDN_KEY),
    ]);
  }

  private async recordFailedCdn(cdnBase: string): Promise<void> {
    const failedBasesJson = await AsyncStorage.getItem(FAILED_CDN_KEY);
    const failedBases = this.parseStoredBases(failedBasesJson);
    const next = Array.from(new Set([cdnBase, ...failedBases])).slice(0, 4);
    await AsyncStorage.setItem(FAILED_CDN_KEY, JSON.stringify(next));
  }

  private parseStoredBases(value: string | null): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  /**
   * 读取本地缓存文件内容为 base64
   * 第一次读磁盘，后续从内存 Map 直接返回（进入训练页 0.2s vs 原来 2s）
   */
  async getFileBase64(filename: string): Promise<string> {
    if (this.base64Cache.has(filename)) {
      return this.base64Cache.get(filename)!;
    }
    const filePath = CACHE_DIR + filename;
    const info = await getInfoAsync(filePath);
    if (!info.exists) {
      throw new Error(`File not cached: ${filename}`);
    }
    const b64 = await readAsStringAsync(filePath, {
      encoding: EncodingType.Base64,
    });
    this.base64Cache.set(filename, b64);
    return b64;
  }

  /**
   * 清除内存 base64 缓存（一般不需要主动调用）
   */
  clearMemoryCache(): void {
    this.base64Cache.clear();
  }

  /**
   * 获取文件的 MIME 类型
   */
  getMimeType(filename: string): string {
    if (filename.endsWith('.js')) return 'application/javascript';
    if (filename.endsWith('.wasm')) return 'application/wasm';
    if (filename.endsWith('.data')) return 'application/octet-stream';
    if (filename.endsWith('.tflite')) return 'application/octet-stream';
    if (filename.endsWith('.binarypb')) return 'application/octet-stream';
    return 'application/octet-stream';
  }

  /**
   * 检查缓存是否有效
   */
  private async isCacheValid(): Promise<boolean> {
    try {
      const versionInfo = await getInfoAsync(VERSION_FILE);
      if (!versionInfo.exists) return false;

      const version = await readAsStringAsync(VERSION_FILE);
      if (version !== CACHE_VERSION) return false;

      return isMediaPipeCacheComplete({
        expectedFiles: MEDIAPIPE_FILES,
        expectedVersion: CACHE_VERSION,
        version,
        files: await this.getCachedAssetInfo(),
      });
    } catch {
      return false;
    }
  }

  private async getCachedAssetInfo(): Promise<MediaPipeCachedAsset[]> {
    const files: MediaPipeCachedAsset[] = [];
    for (const file of MEDIAPIPE_FILES) {
      const info = await getInfoAsync(CACHE_DIR + file);
      files.push({
        name: file,
        size: info.exists && typeof info.size === 'number' ? info.size : 0,
      });
    }
    return files;
  }

  private async downloadAllFromCdn(
    cdnBase: string,
    onFileProgress: (fileIdx: number, total: number) => void
  ): Promise<void> {
    const total = MEDIAPIPE_FILES.length;
    let completed = 0;

    await runWithConcurrency(MEDIAPIPE_FILES, DOWNLOAD_CONCURRENCY, async (filename) => {
      if (await this.isCachedFileUsable(filename)) {
        onFileProgress(completed++, total);
        return;
      }

      await this.downloadFileWithRetry(cdnBase, filename);
      onFileProgress(completed++, total);
    });
  }

  private async isCachedFileUsable(filename: string): Promise<boolean> {
    const info = await getInfoAsync(CACHE_DIR + filename);
    return info.exists && typeof info.size === 'number' && info.size > 0;
  }

  private async downloadFileWithRetry(cdnBase: string, filename: string): Promise<void> {
    const url = cdnBase + filename;
    const dest = CACHE_DIR + filename;
    let lastError: unknown;

    for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt++) {
      try {
        await deleteAsync(dest, { idempotent: true });
        const result = await downloadAsync(url, dest);
        if (!result) {
          throw new Error(`Download returned null for ${filename}`);
        }
        if (!(await this.isCachedFileUsable(filename))) {
          throw new Error(`Downloaded file is empty: ${filename}`);
        }
        return;
      } catch (err) {
        lastError = err;
        await deleteAsync(dest, { idempotent: true });
      }
    }

    throw new Error(`Failed to download ${filename} after ${DOWNLOAD_MAX_ATTEMPTS} attempts: ${lastError}`, {
      cause: lastError,
    });
  }

  private async deleteInvalidFile(filename: string): Promise<void> {
    const filePath = CACHE_DIR + filename;
    const info = await getInfoAsync(filePath);
    if (info.exists && (!('size' in info) || typeof info.size !== 'number' || info.size <= 0)) {
      await deleteAsync(filePath, { idempotent: true });
    }
  }

  private async cleanIncompleteCacheFiles(): Promise<void> {
    try {
      for (const file of MEDIAPIPE_FILES) {
        await this.deleteInvalidFile(file);
      }
      const versionInfo = await getInfoAsync(VERSION_FILE);
      if (versionInfo.exists) {
        await deleteAsync(VERSION_FILE, { idempotent: true });
      }
      const manifestInfo = await getInfoAsync(MANIFEST_FILE);
      if (manifestInfo.exists) {
        await deleteAsync(MANIFEST_FILE, { idempotent: true });
      }
    } catch {
      // 忽略清理错误
    }
  }

  /**
   * 强制清除缓存（包括磁盘和内存）
   */
  async clearCache(): Promise<void> {
    const dirInfo = await getInfoAsync(CACHE_DIR);
    if (dirInfo.exists) {
      await deleteAsync(CACHE_DIR, { idempotent: true });
    }
    this.cachedBaseUrl = null;
    this.base64Cache.clear();
  }

  /**
   * 获取所有文件名列表
   */
  getFiles(): readonly string[] {
    return MEDIAPIPE_FILES;
  }
}

export const mediaPipeAssetService = new MediaPipeAssetService();
