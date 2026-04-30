export const DEFAULT_BLOB_CHUNK_SIZE = 64 * 1024;

function jsLiteral(value: string): string {
  return JSON.stringify(value);
}

export function splitBase64IntoChunks(
  base64: string,
  chunkSize: number = DEFAULT_BLOB_CHUNK_SIZE,
): string[] {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += size) {
    chunks.push(base64.slice(i, i + size));
  }
  return chunks;
}

export function buildBlobBeginScript(filename: string, mimeType: string): string {
  return `window.__beginBlob(${jsLiteral(filename)},${jsLiteral(mimeType)});true;`;
}

export function buildBlobAppendScript(filename: string, chunk: string): string {
  return `window.__appendBlobChunk(${jsLiteral(filename)},${jsLiteral(chunk)});true;`;
}

export function buildBlobCommitScript(filename: string): string {
  return `window.__commitBlob(${jsLiteral(filename)});true;`;
}
