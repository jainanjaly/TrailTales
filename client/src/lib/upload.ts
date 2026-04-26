/**
 * Upload pipeline: generate thumbnail (videos only), ask API for presigned URLs,
 * PUT to S3, confirm.
 */
import { api, apiErrorMessage } from "./api";
import { Media } from "./media";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const THUMB_MAX_DIM = 400;

const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export type UploadErrorKind =
  | "unsupported-format"
  | "too-large"
  | "quota-exceeded"
  | "network"
  | "server"
  | "unknown";

export class UploadError extends Error {
  kind: UploadErrorKind;
  constructor(kind: UploadErrorKind, message: string) {
    super(message);
    this.name = "UploadError";
    this.kind = kind;
  }
}

export type UploadProgress = {
  stage: "thumbnail" | "presign" | "uploading" | "confirming" | "done";
  percent: number;
};

export async function uploadMedia(
  tripId: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<Media> {
  const contentType = file.type;
  validateBeforeUpload(file);

  const isVideo = contentType.startsWith("video/");

  onProgress?.({ stage: "thumbnail", percent: 5 });
  // Only generate a thumbnail for videos. Images are served as-is on the
  // gallery grid (browser-side `object-fit: cover` thumbnails them).
  const thumbBlob = isVideo ? await generateThumbnail(file) : null;

  onProgress?.({ stage: "presign", percent: 15 });
  let presignRes;
  try {
    presignRes = await api.post<{
      mediaId: string;
      uploadUrl: string;
      thumbUploadUrl: string | null;
    }>(`/trips/${tripId}/media/presign`, {
      contentType,
      sizeBytes: file.size,
    });
  } catch (err) {
    throw mapServerError(err);
  }
  const { mediaId, uploadUrl, thumbUploadUrl } = presignRes.data;

  onProgress?.({ stage: "uploading", percent: 25 });
  await putToS3(uploadUrl, file, contentType, (pct) =>
    onProgress?.({ stage: "uploading", percent: 25 + pct * 0.6 }),
  );

  if (thumbBlob && thumbUploadUrl) {
    await putToS3(thumbUploadUrl, thumbBlob, "image/jpeg");
  }

  onProgress?.({ stage: "confirming", percent: 90 });
  let confirmRes;
  try {
    confirmRes = await api.post<{ media: Media }>(
      `/trips/${tripId}/media/confirm`,
      { mediaId },
    );
  } catch (err) {
    throw mapServerError(err);
  }
  onProgress?.({ stage: "done", percent: 100 });
  return confirmRes.data.media;
}

function validateBeforeUpload(file: File) {
  const type = file.type;
  const isPhoto = type.startsWith("image/");
  const isVideo = type.startsWith("video/");

  if (!isPhoto && !isVideo) {
    throw new UploadError(
      "unsupported-format",
      `Unsupported file format${type ? `: ${type}` : ""}. Use JPG, PNG, WEBP, GIF, MP4, MOV, or WEBM.`,
    );
  }
  if (isPhoto && !ALLOWED_PHOTO_TYPES.has(type)) {
    throw new UploadError(
      "unsupported-format",
      `Image format not supported (${type}). Use JPG, PNG, WEBP, or GIF.`,
    );
  }
  if (isVideo && !ALLOWED_VIDEO_TYPES.has(type)) {
    throw new UploadError(
      "unsupported-format",
      `Video format not supported (${type}). Use MP4, MOV, or WEBM.`,
    );
  }

  const cap = isPhoto ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (file.size > cap) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const capMb = cap / (1024 * 1024);
    throw new UploadError(
      "too-large",
      `File is ${sizeMb} MB — exceeds the ${capMb} MB limit for ${isPhoto ? "photos" : "videos"}.`,
    );
  }
}

function mapServerError(err: unknown): UploadError {
  const msg = apiErrorMessage(err, "Upload failed");
  const lower = msg.toLowerCase();
  if (lower.includes("quota")) return new UploadError("quota-exceeded", msg);
  if (lower.includes("exceed") || lower.includes("too large") || lower.includes("cap")) {
    return new UploadError("too-large", msg);
  }
  if (lower.includes("unsupported") || lower.includes("contenttype")) {
    return new UploadError("unsupported-format", msg);
  }
  if (lower.includes("network")) return new UploadError("network", msg);
  return new UploadError("server", msg);
}

function putToS3(
  url: string,
  body: Blob,
  contentType: string,
  onPercent?: (p: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onPercent) {
        onPercent((e.loaded / e.total) * 100);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new UploadError(
            "network",
            `Upload to storage failed (${xhr.status}${xhr.statusText ? ` ${xhr.statusText}` : ""}).`,
          ),
        );
    };
    xhr.onerror = () =>
      reject(new UploadError("network", "Network error while uploading to storage."));
    xhr.ontimeout = () =>
      reject(new UploadError("network", "Upload timed out. Check your connection and try again."));
    xhr.onabort = () =>
      reject(new UploadError("network", "Upload was aborted."));
    xhr.send(body);
  });
}

async function generateThumbnail(file: File): Promise<Blob | null> {
  try {
    if (file.type.startsWith("image/")) {
      return await thumbnailFromImage(file);
    }
    if (file.type.startsWith("video/")) {
      return await thumbnailFromVideo(file);
    }
  } catch (e) {
    console.warn("thumbnail generation failed", e);
  }
  return null;
}

async function thumbnailFromImage(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  const { canvas, ctx } = fit(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvasToJpeg(canvas);
}

async function thumbnailFromVideo(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Video load failed"));
    });
    // Seek to a small offset to avoid black frames
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = Math.min(0.2, (video.duration || 1) / 4);
    });
    const { canvas, ctx } = fit(video.videoWidth, video.videoHeight);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvasToJpeg(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fit(w: number, h: number) {
  const scale = Math.min(1, THUMB_MAX_DIM / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  return { canvas, ctx };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8));
}
