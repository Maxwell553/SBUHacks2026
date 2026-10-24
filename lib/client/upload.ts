"use client";
import { api, ApiError } from "@/lib/client/api";

export const CHUNK_SIZE = 1024 * 1024;

export type UploadMime = "image/gif" | "image/jpeg";

/**
 * Chunked upload matching BACKEND_UPLOAD_CONTRACT.txt:
 * init -> PUT chunks (<= 2 in flight, retried) -> complete.
 */
export async function uploadAsset(
  videoId: string,
  blob: Blob,
  mime: UploadMime,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<{ mediaUrl: string; sha256: string }> {
  const chunkCount = Math.max(1, Math.ceil(blob.size / CHUNK_SIZE));
  const init = await api<{ assetId: string; chunkSize: number }>(`/api/videos/${videoId}/assets/init`, {
    method: "POST",
    json: { mime, totalBytes: blob.size, chunkCount },
    signal,
  });
  const size = init.chunkSize || CHUNK_SIZE;
  if (Math.ceil(blob.size / size) !== chunkCount) throw new ApiError(500, "Upload chunk size mismatch. Please retry.");

  let done = 0;
  let next = 0;
  const putChunk = async (i: number) => {
    const body = blob.slice(i * size, Math.min(blob.size, (i + 1) * size));
    for (let attempt = 0; ; attempt++) {
      try {
        await api(`/api/videos/${videoId}/assets/${init.assetId}/chunks/${i}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body,
          signal,
        });
        return;
      } catch (e) {
        if (
          signal?.aborted ||
          attempt >= 3 ||
          (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 409 && e.status !== 429)
        )
          throw e;
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      }
    }
  };
  const worker = async () => {
    while (next < chunkCount) {
      const i = next++;
      await putChunk(i);
      done++;
      onProgress?.(done / chunkCount);
    }
  };
  await Promise.all([worker(), worker()]);
  return api<{ mediaUrl: string; sha256: string }>(`/api/videos/${videoId}/assets/${init.assetId}/complete`, {
    method: "POST",
    signal,
  });
}
