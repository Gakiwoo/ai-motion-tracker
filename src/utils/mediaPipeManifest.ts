export interface MediaPipeCachedAsset {
  name: string;
  size: number;
}

export interface MediaPipeManifest {
  version: string;
  files: MediaPipeCachedAsset[];
}

interface MediaPipeCacheCheck {
  expectedFiles: readonly string[];
  expectedVersion: string;
  version: string;
  files: MediaPipeCachedAsset[];
}

export function createMediaPipeManifest(
  version: string,
  files: MediaPipeCachedAsset[],
): MediaPipeManifest {
  return {
    version,
    files: files.map((file) => ({
      name: file.name,
      size: file.size,
    })),
  };
}

export function isMediaPipeCacheComplete({
  expectedFiles,
  expectedVersion,
  version,
  files,
}: MediaPipeCacheCheck): boolean {
  if (version !== expectedVersion) {
    return false;
  }

  const fileSizes = new Map(files.map((file) => [file.name, file.size]));
  return expectedFiles.every((file) => {
    const size = fileSizes.get(file);
    return typeof size === 'number' && size > 0;
  });
}
