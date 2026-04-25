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

// CDN 基础 URL 列表（gakiwoo.com 优先）
const CDN_BASES = [
  'https://gakiwoo.com/static/mediapipe/pose/',
  'https://registry.npmmirror.com/@mediapipe/pose/0.5.1675469404/files/',
  'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/',
  'https://unpkg.com/@mediapipe/pose@0.5.1675469404/',
];

// 本地缓存目录
const CACHE_DIR = documentDirectory + 'mediapipe/pose/';

// 缓存版本标记文件
const CACHE_VERSION = '0.5.1675469404';
const VERSION_FILE = CACHE_DIR + '.version';

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

  /**
   * 确保所有 MediaPipe 文件已缓存到本地
   * 返回本地缓存目录的 file:// URL
   */
  async ensureCached(onProgress?: AssetProgressCallback): Promise<string> {
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

    // 逐个尝试 CDN，直到成功
    let successBase: string | null = null;
    for (let i = 0; i < CDN_BASES.length; i++) {
      const cdnBase = CDN_BASES[i];
      const host = cdnBase.split('/')[2];
      onProgress?.(`尝试 CDN ${i + 1}/${CDN_BASES.length}: ${host}`, (i + 1) / (CDN_BASES.length + 1));

      try {
        await this.downloadAllFromCdn(cdnBase, (fileIdx, total) => {
          onProgress?.(
            `从 ${host} 下载中 (${fileIdx + 1}/${total})`,
            (i * total + fileIdx + 1) / (CDN_BASES.length * total)
          );
        });
        successBase = cdnBase;
        break;
      } catch (err) {
        console.warn(`[MediaPipeAsset] CDN ${host} failed:`, err);
        // 清理可能的部分下载
        await this.cleanCacheDir();
      }
    }

    if (!successBase) {
      throw new Error('所有 CDN 均下载失败，请检查网络连接后重试');
    }

    // 写入版本标记
    await writeAsStringAsync(VERSION_FILE, CACHE_VERSION);
    this.cachedBaseUrl = CACHE_DIR;
    onProgress?.('AI 模型就绪', 1);
    return CACHE_DIR;
  }

  /**
   * 读取本地缓存文件内容为 base64
   * 用于注入 WebView 创建 blob: URL
   */
  async getFileBase64(filename: string): Promise<string> {
    const filePath = CACHE_DIR + filename;
    const info = await getInfoAsync(filePath);
    if (!info.exists) {
      throw new Error(`File not cached: ${filename}`);
    }
    return await readAsStringAsync(filePath, {
      encoding: EncodingType.Base64,
    });
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

      for (const file of MEDIAPIPE_FILES) {
        const info = await getInfoAsync(CACHE_DIR + file);
        if (!info.exists) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 从指定 CDN 下载所有文件
   */
  private async downloadAllFromCdn(
    cdnBase: string,
    onFileProgress: (fileIdx: number, total: number) => void
  ): Promise<void> {
    const total = MEDIAPIPE_FILES.length;

    for (let i = 0; i < total; i++) {
      const filename = MEDIAPIPE_FILES[i];
      const url = cdnBase + filename;
      const dest = CACHE_DIR + filename;

      try {
        const result = await downloadAsync(url, dest);
        if (!result) {
          throw new Error(`Download returned null for ${filename}`);
        }
        // 验证文件确实存在且非空
        const info = await getInfoAsync(dest);
        if (!info.exists || (info.size !== undefined && info.size === 0)) {
          throw new Error(`Downloaded file is empty: ${filename}`);
        }
        onFileProgress(i, total);
      } catch (err) {
        throw new Error(`Failed to download ${filename}: ${err}`);
      }
    }
  }

  /**
   * 清理缓存目录（下载失败时使用）
   */
  private async cleanCacheDir(): Promise<void> {
    try {
      for (const file of MEDIAPIPE_FILES) {
        const filePath = CACHE_DIR + file;
        const info = await getInfoAsync(filePath);
        if (info.exists) {
          await deleteAsync(filePath, { idempotent: true });
        }
      }
      const versionInfo = await getInfoAsync(VERSION_FILE);
      if (versionInfo.exists) {
        await deleteAsync(VERSION_FILE, { idempotent: true });
      }
    } catch {
      // 忽略清理错误
    }
  }

  /**
   * 强制清除缓存
   */
  async clearCache(): Promise<void> {
    const dirInfo = await getInfoAsync(CACHE_DIR);
    if (dirInfo.exists) {
      await deleteAsync(CACHE_DIR, { idempotent: true });
    }
    this.cachedBaseUrl = null;
  }

  /**
   * 获取所有文件名列表
   */
  getFiles(): readonly string[] {
    return MEDIAPIPE_FILES;
  }
}

export const mediaPipeAssetService = new MediaPipeAssetService();
